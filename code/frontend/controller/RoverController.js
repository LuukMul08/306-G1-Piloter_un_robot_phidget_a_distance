import RoverModel from "../model/RoverModel.js";
import RoverView from "../view/RoverView.js";

const WS_URL = "ws://localhost:8080"; // URL du WebSocket
const CLIENT_ID_KEY = "rover-client-id"; // Clé pour stocker l'ID unique du client

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
  distanceLogCooldown = 1000;

  status = "NOT CONNECTED";
  clientId = getClientId();

  prevBtnX = false;
  prevBtnA = false;
  prevBtnY = false;

  previousSpeedMode = null; // mémorisation du mode avant LOW

  constructor() {
    this.connectWebSocket();
    this.loop();

    window.addEventListener("gamepadconnected", (e) =>
      this.handleGamepadConnect(e)
    );
    window.addEventListener("gamepaddisconnected", (e) =>
      this.handleGamepadDisconnect(e)
    );
  }

  connectWebSocket() {
    this.status = "CONNECTING";
    this.view.updateStatus("CONNECTING…", false);
    this.view.addLog("Tentative de connexion WebSocket…", "INFO");

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.view.addLog("WebSocket connecté", "INFO");
      this.ws.send(JSON.stringify({ type: "hello", clientId: this.clientId }));
    };

    this.ws.onclose = () => {
      this.status = "DISCONNECTED";
      this.view.updateStatus("DISCONNECTED", false);
      this.view.addLog("WebSocket déconnecté", "WARN");
      this.ws = null;
    };

    this.ws.onerror = (event) => {
      console.error("Erreur WebSocket :", event);
      this.view.addLog("Erreur WebSocket (voir console)", "ERROR");
      this.status = "DISCONNECTED";
      this.view.updateStatus("DISCONNECTED", false);
      this.ws = null;
    };

    this.ws.onmessage = (e) => this.handleWsMessage(e);
  }

  handleWsMessage(e) {
    try {
      const data = JSON.parse(e.data);

      if (data.type === "rover_connected") {
        this.status = "CONNECTED";
        this.view.addLog(
          data.reconnect ? "Reconnecté au rover" : "Connecté au rover",
          "INFO"
        );
        this.view.updateStatus("CONNECTED", true);
      }

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

      if (data.distance != null) {
        const prev = this.model.distance;
        this.model.updateDistance(parseFloat(data.distance));

        const now = Date.now();
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

      if (data.type === "log" && data.message) {
        this.view.addLog(`[Serveur] ${data.message}`, "INFO");
      }
    } catch (err) {
      console.error("Erreur parsing WebSocket :", err);
      this.view.addLog(`Erreur parsing WebSocket : ${err.message}`, "ERROR");
    }
  }

  handleGamepadConnect(e) {
    if (!this.controllerActive) {
      this.controllerActive = true;
      this.view.addLog("Gamepad connecté", "INFO");
      this.view.updateStatus("🎮 Contrôleur actif");
    }
  }

  handleGamepadDisconnect(e) {
    if (this.controllerActive) {
      this.controllerActive = false;
      this.view.addLog("Gamepad déconnecté", "WARN");
      this.view.updateStatus("⏳ En attente du contrôleur...");
    }
  }

  updateJoystickPositions = (gp) => {
    if (!gp) return;

    const lsY = gp.axes[1] || 0;
    const rsX = gp.axes[2] || 0;

    const driveKnob = document.getElementById("drive-knob-handle");
    if (driveKnob) {
      const maxMove = 40;
      driveKnob.style.transform = `translate(${0}px, ${lsY * maxMove}px)`;
    }

    const steerKnob = document.getElementById("steer-knob-handle");
    if (steerKnob) {
      const maxMove = 40;
      steerKnob.style.transform = `translate(${rsX * maxMove}px, ${0}px)`;
    }
  };

  loop = () => {
    const gp = navigator.getGamepads()[0];

    if (!gp) {
      if (this.controllerActive) {
        this.controllerActive = false;
        this.view.updateStatus("⏳ En attente du contrôleur...");
        this.view.addLog("Gamepad déconnecté", "WARN");
      }
      requestAnimationFrame(this.loop);
      return;
    }

    if (!this.controllerActive) {
      this.controllerActive = true;
      this.view.updateStatus("🎮 Contrôleur actif");
      this.view.addLog("Gamepad connecté", "INFO");
    }

    const btnA = gp.buttons[0]?.pressed;
    const btnX = gp.buttons[2]?.pressed;
    const btnY = gp.buttons[3]?.pressed;

    // Toggle STOP
    if (btnX && !this.prevBtnX) {
      this.model.stopActive = !this.model.stopActive;
      this.view.addLog(
        `STOP basculé : ${this.model.stopActive ? "ON" : "OFF"}`,
        "WARN"
      );
    }
    this.prevBtnX = btnX;

    // Vitesse
    if (btnA && !this.prevBtnA) {
      this.model.speedMode = Math.max(1, this.model.speedMode - 1);
      this.view.addLog(`Mode vitesse réduit → ${this.model.speedMode}`, "INFO");
    }
    if (btnY && !this.prevBtnY) {
      this.model.speedMode = Math.min(3, this.model.speedMode + 1);
      this.view.addLog(
        `Mode vitesse augmenté → ${this.model.speedMode}`,
        "INFO"
      );
    }
    this.prevBtnA = btnA;
    this.prevBtnY = btnY;

    // Axes joysticks
    let forward = -this.model.deadzone(gp.axes[1]);
    const steer = this.model.deadzone(gp.axes[2]);

    const rt = gp.buttons[7]?.value || 0;
    const lt = gp.buttons[6]?.value || 0;
    if (rt > 0 && lt === 0) forward = rt;
    else if (lt > 0 && rt === 0) forward = -lt;
    else if (rt > 0 && lt > 0) forward = 0;

    // Gestion distance
    if (this.model.distance !== null) {
      // Auto Speed Mode LOW ≤ 100 cm
      if (this.model.distance <= 1000 && this.model.speedMode !== 1) {
        if (this.previousSpeedMode === null)
          this.previousSpeedMode = this.model.speedMode;
        this.model.speedMode = 1;
        this.view.addLog(
          `Distance critique (${this.model.distance} mm) → Mode vitesse LOW`,
          "WARN"
        );
      } else if (
        this.previousSpeedMode !== null &&
        this.model.distance > 1000
      ) {
        this.model.speedMode = this.previousSpeedMode;
        this.previousSpeedMode = null;
        this.view.addLog(
          `Distance sécurisée (${this.model.distance} mm) → Mode vitesse restauré à ${this.model.speedMode}`,
          "INFO"
        );
      }

      // Blocage avance si trop proche
      if (this.model.distance < this.model.minDistanceBlock && forward > 0) {
        forward = 0;
        const now = Date.now();
        if (now - this.lastDistanceBlockLog > this.distanceLogCooldown) {
          this.view.addLog("Blocage distance actif, avance stoppée", "WARN");
          this.lastDistanceBlockLog = now;
        }
      }
    }

    const { left, right } = this.model.computeMotors(forward, steer);

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

    this.view.updateUI({
      speedMode: this.model.speedMode,
      speedLock: this.model.speedMode === 1 && this.model.distance <= 1000,
      stopActive: this.model.stopActive,
      distance: this.model.distance,
      forward,
      steer,
    });

    this.updateJoystickPositions(gp);

    requestAnimationFrame(this.loop);
  };
}
