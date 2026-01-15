import RoverModel from "../model/RoverModel.js";
import RoverView from "../view/RoverView.js";

const WS_URL = "ws://localhost:8080"; // Modifier si nécessaire l'adresse IP
const CLIENT_ID_KEY = "rover-client-id";

// Récupère ou génère une ID unique pour le client
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
  controllerActive = false;

  lastDistanceBlockLog = 0;
  distanceLogCooldown = 1000; // 1 seconde entre les alertes

  status = "NOT CONNECTED"; // NOT CONNECTED | CONNECTING | CONNECTED | DISCONNECTED
  clientId = getClientId();

  constructor() {
    this.connectWebSocket();
    this.loop();

    // Événements Gamepad pour connexion/déconnexion
    window.addEventListener("gamepadconnected", (e) => this.handleGamepadConnect(e));
    window.addEventListener("gamepaddisconnected", (e) => this.handleGamepadDisconnect(e));
  }

  // Établir la connexion WebSocket
  connectWebSocket() {
    this.status = "CONNECTING";
    this.view.updateStatus("CONNECTING…", false);
    this.view.addLog("Tentative de connexion WebSocket…", "INFO");

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.view.addLog("WebSocket connecté", "INFO");
      // Envoyer le message HELLO au serveur
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
          (this.model.distance < 300 && now - this.lastDistanceBlockLog > this.distanceLogCooldown)
        ) {
          this.view.addLog(`Distance critique : ${this.model.distance} mm`, "WARN");
          this.lastDistanceBlockLog = now;
        }
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

  // Connexion Gamepad
  handleGamepadConnect(e) {
    if (!this.controllerActive) {
      this.view.addLog("Gamepad connecté", "INFO");
      this.controllerActive = true;
      this.loop();
    }
  }

  // Déconnexion Gamepad
  handleGamepadDisconnect(e) {
    if (this.controllerActive) {
      this.view.addLog("Gamepad déconnecté", "WARN");
      this.controllerActive = false;
      this.view.updateStatus("⏳ En attente du contrôleur...");
    }
  }

  // Met à jour les positions des joysticks dans l'UI
  updateJoystickPositions = (gp) => {
    if (!gp) return;

    // Récupérer les axes
    const lsX = gp.axes[0] || 0; // Stick gauche X (gauche/droite)
    const lsY = gp.axes[1] || 0; // Stick gauche Y (avant/arrière)
    const rsX = gp.axes[2] || 0; // Stick droit X (direction gauche/droite)
    const rsY = gp.axes[3] || 0; // Stick droit Y (direction avant/arrière)

    // Mettre à jour la position du stick gauche (Drive)
    const driveKnob = document.getElementById("drive-knob-handle");
    if (driveKnob) {
      const maxMove = 40; // Déplacement maximal en pixels
      driveKnob.style.transform = `translate(${0}px, ${lsY * maxMove}px)`; // Avant/arrière
    }

    // Mettre à jour la position du stick droit (Steering)
    const steerKnob = document.getElementById("steer-knob-handle");
    if (steerKnob) {
      const maxMove = 40; // Déplacement maximal en pixels
      steerKnob.style.transform = `translate(${rsX * maxMove}px, ${0}px)`; // Direction gauche/droite
    }
  };

  // Boucle principale du Gamepad
  loop = () => {
    const gp = navigator.getGamepads()[0];

    if (!gp) {
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

    // --- BOUTONS ---
    const btnA = gp.buttons[0]?.pressed;
    const btnX = gp.buttons[2]?.pressed;
    const btnY = gp.buttons[3]?.pressed;

    // --- TRIGGERS ---
    const rt = gp.buttons[7]?.value || 0;
    const lt = gp.buttons[6]?.value || 0;

    // --- MISE À JOUR DU MODÈLE ---
    const prevStop = this.model.stopActive;
    this.model.toggleStop(btnX);
    if (prevStop !== this.model.stopActive) {
      this.view.addLog(
        `Stop basculé : ${this.model.stopActive ? "ON" : "OFF"}`,
        "WARN"
      );
    }

    const prevSpeed = this.model.speedMode;
    this.model.updateSpeedLock();
    this.model.handleSpeedButtons(btnA, btnY);
    if (prevSpeed !== this.model.speedMode) {
      this.view.addLog(
        `Mode vitesse changé : ${prevSpeed} → ${this.model.speedMode}`,
        "INFO"
      );
    }

    // --- DIRECTION & AVANCE ---
    const steer = this.model.deadzone(gp.axes[2]);
    let forward = -this.model.deadzone(gp.axes[1]);

    if (rt > 0 && lt === 0) forward = rt;
    else if (lt > 0 && rt === 0) forward = -lt;
    else if (rt > 0 && lt > 0) forward = 0;

    // --- BLOCAGE DISTANCE ---
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

    // --- CALCUL DES MOTEURS ---
    const { left, right, factor } = this.model.computeMotors(forward, steer);

    // --- ENVOI AU SERVEUR ---
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          leftY: left,
          rightY: right,
          speedMode: this.model.speedMode,
          stop: this.model.stopActive,
        })
      );
    }

    // --- MISE À JOUR DE L'UI ---
    this.view.updateUI({
      speedMode: this.model.speedMode,
      factor,
      speedLock: this.model.speedLock,
      stop: this.model.stopActive,
      distance: this.model.distance,
      leftY: left,
      rightY: right,
    });

    // --- MISE À JOUR DES POSITIONS DES JOYSTICKS ---
    this.updateJoystickPositions(gp);

    requestAnimationFrame(this.loop);
  };
}
