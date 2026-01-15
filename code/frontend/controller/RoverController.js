import RoverModel from "../model/RoverModel.js";
import RoverView from "../view/RoverView.js";

const WS_URL = "ws://localhost:8080"; // URL du WebSocket
const CLIENT_ID_KEY = "rover-client-id"; // Clé pour stocker l'ID unique du client

// Récupère ou génère un ID unique pour le client
function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export default class RoverController {
  model = new RoverModel(); // Modèle du Rover
  view = new RoverView();   // Vue pour l'interface
  ws = null;                // WebSocket
  controllerActive = false; // État du gamepad

  lastDistanceBlockLog = 0;        // Temps dernier log de blocage distance
  distanceLogCooldown = 1000;      // Délai entre deux alertes distance critique (ms)

  status = "NOT CONNECTED";        // État du rover
  clientId = getClientId();        // ID unique client

  // Suivi de l'état précédent des boutons pour détecter les changements
  prevBtnX = false; // Toggle STOP
  prevBtnA = false; // Bouton vitesse -
  prevBtnY = false; // Bouton vitesse +

  constructor() {
    // Connexion WebSocket et lancement de la boucle principale
    this.connectWebSocket();
    this.loop();

    // Gestion des événements de connexion/déconnexion du gamepad
    window.addEventListener("gamepadconnected", (e) =>
      this.handleGamepadConnect(e)
    );
    window.addEventListener("gamepaddisconnected", (e) =>
      this.handleGamepadDisconnect(e)
    );
  }

  // Connexion WebSocket
  connectWebSocket() {
    this.status = "CONNECTING";
    this.view.updateStatus("CONNECTING…", false); 
    this.view.addLog("Tentative de connexion WebSocket…", "INFO");

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.view.addLog("WebSocket connecté", "INFO");
      // Envoi d'un message "hello" au serveur
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

  // Gestion des messages WebSocket
  handleWsMessage(e) {
    try {
      const data = JSON.parse(e.data);

      // Rover connecté
      if (data.type === "rover_connected") {
        this.status = "CONNECTED";
        this.view.addLog(
          data.reconnect ? "Reconnecté au rover" : "Connecté au rover",
          "INFO"
        );
        this.view.updateStatus("CONNECTED", true);
      }

      // Statut Phidget
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

      // Distance
      if (data.distance != null) {
        const prev = this.model.distance;
        this.model.updateDistance(parseFloat(data.distance));

        const now = Date.now();
        // Log distance critique si < 300mm
        if (
          prev === null ||
          (this.model.distance < 300 &&
            now - this.lastDistanceBlockLog > this.distanceLogCooldown)
        ) {
          this.view.addLog(
            `Distance critique : ${this.model.distance} mm`,
            "WARN"
          );
          this.lastDistanceBlockLog = now;
        }
      }

      // Logs serveur
      if (data.type === "log" && data.message) {
        this.view.addLog(`[Serveur] ${data.message}`, "INFO");
      }
    } catch (err) {
      console.error("Erreur parsing WebSocket :", err);
      this.view.addLog(`Erreur parsing WebSocket : ${err.message}`, "ERROR");
    }
  }

  // Gamepad connecté
  handleGamepadConnect(e) {
    if (!this.controllerActive) {
      this.view.addLog("Gamepad connecté", "INFO");
      this.controllerActive = true;
      this.loop();
    }
  }

  // Gamepad déconnecté
  handleGamepadDisconnect(e) {
    if (this.controllerActive) {
      this.view.addLog("Gamepad déconnecté", "WARN");
      this.controllerActive = false;
      this.view.updateStatus("⏳ En attente du contrôleur...");
    }
  }

  // Mise à jour des positions des joysticks
  updateJoystickPositions = (gp) => {
    if (!gp) return;

    const lsY = gp.axes[1] || 0; // Stick gauche vertical
    const rsX = gp.axes[2] || 0; // Stick droit horizontal

    // Stick gauche (Drive)
    const driveKnob = document.getElementById("drive-knob-handle");
    if (driveKnob) {
      const maxMove = 40;
      driveKnob.style.transform = `translate(${0}px, ${lsY * maxMove}px)`;
    }

    // Stick droit (Steering)
    const steerKnob = document.getElementById("steer-knob-handle");
    if (steerKnob) {
      const maxMove = 40;
      steerKnob.style.transform = `translate(${rsX * maxMove}px, ${0}px)`;
    }
  };

  // Boucle principale
  loop = () => {
    const gp = navigator.getGamepads()[0];

    if (!gp) {
      // Pas de gamepad détecté
      if (this.controllerActive) {
        this.controllerActive = false;
        this.view.updateStatus("⏳ En attente du contrôleur...");
      }
      requestAnimationFrame(this.loop);
      return;
    }

    if (!this.controllerActive) {
      this.controllerActive = true;
      this.view.updateStatus("🎮 Contrôleur actif");
    }

    // --- Boutons ---
    const btnA = gp.buttons[0]?.pressed;
    const btnX = gp.buttons[2]?.pressed;
    const btnY = gp.buttons[3]?.pressed;

    // Toggle STOP uniquement si changement d'état
    if (btnX && !this.prevBtnX) {
      this.model.stopActive = !this.model.stopActive;
      this.view.addLog(
        `Stop basculé : ${this.model.stopActive ? "ON" : "OFF"}`,
        "WARN"
      );
    }
    this.prevBtnX = btnX;

    // Boutons vitesse
    if (btnA && !this.prevBtnA)
      this.model.speedMode = Math.max(1, this.model.speedMode - 1);
    if (btnY && !this.prevBtnY)
      this.model.speedMode = Math.min(3, this.model.speedMode + 1);
    this.prevBtnA = btnA;
    this.prevBtnY = btnY;

    // --- Direction & avance ---
    const steer = this.model.deadzone(gp.axes[2]);
    let forward = -this.model.deadzone(gp.axes[1]);

    const rt = gp.buttons[7]?.value || 0;
    const lt = gp.buttons[6]?.value || 0;
    if (rt > 0 && lt === 0) forward = rt;
    else if (lt > 0 && rt === 0) forward = -lt;
    else if (rt > 0 && lt > 0) forward = 0;

    // Blocage distance
    if (
      this.model.distance !== null &&
      this.model.distance < this.model.minDistanceBlock &&
      forward > 0
    ) {
      forward = 0;
      const now = Date.now();
      if (now - this.lastDistanceBlockLog > this.distanceLogCooldown) {
        this.view.addLog("Blocage distance actif, avance stoppé", "WARN");
        this.lastDistanceBlockLog = now;
      }
    }

    // Calcul des moteurs
    const { left, right, factor } = this.model.computeMotors(forward, steer);

    // Envoi au serveur
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

    // Mise à jour de l'UI
    this.view.updateUI({
      speedMode: this.model.speedMode,
      speedLock: this.model.speedLock,
      stopActive: this.model.stopActive,
      distance: this.model.distance,
      forward,
      steer,
    });

    this.updateJoystickPositions(gp);

    requestAnimationFrame(this.loop);
  };
}
