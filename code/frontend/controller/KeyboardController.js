import RoverModel from "../model/RoverModel.js";
import RoverView from "../view/RoverView.js";

const WS_URL = "ws://localhost:8080"; // Adapter l'adresse IP si nécessaire
const CLIENT_ID_KEY = "rover-client-id";

// Récupère l'ID client depuis le stockage local ou en génère une nouvelle
function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export default class RoverController {
  model = new RoverModel();
  view = new RoverView();
  ws = null;

  keysPressed = {}; // État des touches pressées
  lastDistanceBlockLog = 0;
  distanceLogCooldown = 1000; // Délai entre alertes de distance critique

  status = "NOT CONNECTED"; // NOT CONNECTED | CONNECTING | CONNECTED | DISCONNECTED

  constructor() {
    this.clientId = getClientId();

    this.connectWebSocket();
    this.loop();

    // Gestion des événements clavier
    window.addEventListener("keydown", (e) => this.handleKey(e, true));
    window.addEventListener("keyup", (e) => this.handleKey(e, false));
    this.bindButtons(); // Lier les boutons UI
  }

  // Établir la connexion WebSocket
  connectWebSocket() {
    this.status = "CONNECTING";
    this.view.updateStatus("CONNECTING…", false);
    this.view.addLog("Tentative de connexion WebSocket…", "INFO");

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.view.addLog("WebSocket connecté", "INFO");
      // Envoyer un message HELLO au serveur
      this.ws.send(JSON.stringify({ type: "hello", clientId: this.clientId }));
    };

    this.ws.onclose = () => {
      if (this.status !== "DISCONNECTED") {
        this.status = "DISCONNECTED";
        this.view.addLog("WebSocket déconnecté", "WARN");
        this.view.updateStatus("DISCONNECTED", false);
      }
      this.ws = null;
    };

    this.ws.onerror = (event) => {
      console.error("Erreur WebSocket :", event);
      this.view.addLog("Erreur WebSocket (voir console)", "ERROR");
      this.ws = null;
      this.status = "DISCONNECTED";
      this.view.updateStatus("DISCONNECTED", false);
    };

    this.ws.onmessage = (e) => this.handleWsMessage(e);
  }

  // Traiter les messages reçus via WebSocket
  handleWsMessage(e) {
    try {
      const data = JSON.parse(e.data);

      // --- Handshake / Rover connecté ---
      if (data.type === "rover_connected") {
        this.status = "CONNECTED";
        this.view.addLog(
          data.reconnect ? "Reconnecté au rover" : "Connecté au rover",
          "INFO"
        );
        this.view.updateStatus("CONNECTED", true);
      }

      // --- Statut Phidget ---
      if (data.type === "phidget_status") {
        if (data.status === "connected") {
          this.status = "CONNECTED";
          this.view.addLog("Phidget prêt", "INFO");
          this.view.updateStatus("CONNECTED", true);
        } else if (data.status === "error") {
          this.status = "DISCONNECTED";
          this.view.addLog(`Erreur Phidget : ${data.message}`, "ERROR");
          this.view.updateStatus("DISCONNECTED", false);
        }
      }

      // --- Capteur de distance ---
      if (data.distance != null) {
        const prev = this.model.distance;
        this.model.updateDistance(parseFloat(data.distance));

        const now = Date.now();
        if (
          prev === null ||
          (this.model.distance < 300 &&
            now - this.lastDistanceBlockLog > this.distanceLogCooldown)
        ) {
          this.view.addLog(`Distance critique : ${this.model.distance} mm`, "WARN");
          this.lastDistanceBlockLog = now;
        }

        // Mise à jour de l'affichage de la distance
        const el = document.getElementById("distanceDisplay");
        if (el) el.textContent = (this.model.distance / 1000).toFixed(2) + " m";
      }

      // --- Logs serveur ---
      if (data.type === "log" && data.message) {
        this.view.addLog(`[Serveur] ${data.message}`, "INFO");
      }

    } catch (err) {
      console.error("Erreur parsing WebSocket :", err);
      this.view.addLog(`Erreur parsing WebSocket : ${err.message}`, "ERROR");
    }
  }

  // Lier les boutons UI aux touches clavier
  bindButtons() {
    const mapping = {
      keyArrowUp: "ArrowUp",
      keyArrowDown: "ArrowDown",
      keyArrowLeft: "ArrowLeft",
      keyArrowRight: "ArrowRight",
      keyW: "W",
      keyA: "A",
      keyS: "S",
      keyD: "D",
      keySpace: "SPACE",
    };

    for (const [id, key] of Object.entries(mapping)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener("mousedown", () => this.handleKey({ key }, true));
      el.addEventListener("mouseup", () => this.handleKey({ key }, false));
      el.addEventListener("mouseleave", () => this.handleKey({ key }, false));
    }
  }

  // Met à jour l'affichage visuel d'une touche
  setKeyVisual(key, active) {
    const keyMap = {
      W: { id: "keyArrowUp", dir: "up" },
      ArrowUp: { id: "keyArrowUp", dir: "up" },

      S: { id: "keyArrowDown", dir: "down" },
      ArrowDown: { id: "keyArrowDown", dir: "down" },

      A: { id: "keyArrowLeft", dir: "left" },
      ArrowLeft: { id: "keyArrowLeft", dir: "left" },

      D: { id: "keyArrowRight", dir: "right" },
      ArrowRight: { id: "keyArrowRight", dir: "right" },

      SPACE: { id: "keySpace", dir: "stop" },
    };

    const cfg = keyMap[key];
    if (!cfg) return;

    const el = document.getElementById(cfg.id);
    if (!el) return;

    el.classList.toggle("key-active", active);

    el.classList.remove(
      "key-up",
      "key-down",
      "key-left",
      "key-right",
      "key-stop"
    );

    if (active) {
      el.classList.add(`key-${cfg.dir}`);
    }
  }

  // Gestion d'une touche pressée ou relâchée
  handleKey = (e, pressed) => {
    let key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (key === " ") key = "SPACE";

    // Activation/désactivation du mode STOP avec SPACE
    if (key === "SPACE" && pressed && !this.keysPressed.SPACE) {
      this.model.stopActive = !this.model.stopActive;
      this.view.addLog(`STOP : ${this.model.stopActive}`, "INFO");
    }

    // Changement du mode vitesse avec Q/E
    if (pressed) {
      if (key === "Q") {
        this.model.speedMode = Math.max(1, this.model.speedMode - 1);
        this.view.addLog(`Mode vitesse réduit à ${this.model.speedMode}`, "INFO");
      } else if (key === "E") {
        this.model.speedMode = Math.min(3, this.model.speedMode + 1);
        this.view.addLog(`Mode vitesse augmenté à ${this.model.speedMode}`, "INFO");
      }
      this.view.updateUI({
        speedMode: this.model.speedMode,
        speedLock: this.model.speedLock,
        stopActive: this.model.stopActive,
        distance: this.model.distance,
      });
    }
    this.setKeyVisual(key, pressed);
    this.keysPressed[key] = pressed;
  };

  // Boucle principale de contrôle
  loop = () => {
    if (this.status !== "CONNECTED") {
      requestAnimationFrame(this.loop);
      return; // Ne pas envoyer de commandes tant que Phidget n'est pas prêt
    }

    // Calcul de l'avance et de la direction selon les touches pressées
    let forward =
      (this.keysPressed.W || this.keysPressed.ArrowUp ? 1 : 0) -
      (this.keysPressed.S || this.keysPressed.ArrowDown ? 1 : 0);
    let steer =
      (this.keysPressed.D || this.keysPressed.ArrowRight ? 1 : 0) -
      (this.keysPressed.A || this.keysPressed.ArrowLeft ? 1 : 0);

    if (this.model.stopActive) forward = 0;

    // Blocage de l'avance si la distance est trop courte
    if (
      this.model.distance !== null &&
      this.model.distance < this.model.minDistanceBlock &&
      forward > 0
    )
      forward = 0;

    this.model.updateSpeedLock();
    const { left, right } = this.model.computeMotors(forward, steer);

    // Envoi des commandes au serveur si WebSocket ouvert
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          leftY: left,
          rightY: right,
          speedMode: this.model.speedMode,
          stop: this.model.stopActive,
        })
      );
    }

    // Mise à jour de l'interface utilisateur
    this.view.updateUI({
      speedMode: this.model.speedMode,
      speedLock: this.model.speedLock,
      stopActive: this.model.stopActive,
      distance: this.model.distance,
      forward,
      steer,
    });

    requestAnimationFrame(this.loop);
  };
}
