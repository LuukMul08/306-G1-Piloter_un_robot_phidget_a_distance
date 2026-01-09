import RoverModel from "../model/RoverModel.js";
import RoverView from "../view/RoverView.js";

const WS_URL = "ws://localhost:8080"; // ggf. IP anpassen
const CLIENT_ID_KEY = "rover-client-id";

// Client-ID holen oder neu generieren
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
  distanceLogCooldown = 1000; // 1 Sekunde zwischen Warnungen

  status = "NOT CONNECTED"; // NOT CONNECTED | CONNECTING | CONNECTED | DISCONNECTED
  clientId = getClientId();

  constructor() {
    this.connectWebSocket();
    this.loop();

    // Gamepad-Events für Verbinden/Trennen
    window.addEventListener("gamepadconnected", (e) => this.handleGamepadConnect(e));
    window.addEventListener("gamepaddisconnected", (e) => this.handleGamepadDisconnect(e));
  }

  // WebSocket-Verbindung herstellen
  connectWebSocket() {
    this.status = "CONNECTING";
    this.view.updateStatus("CONNECTING…", false);
    this.view.addLog("Trying to connect WebSocket…", "INFO");

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.view.addLog("WebSocket connected", "INFO");
      // HELLO an Server senden
      this.ws.send(JSON.stringify({ type: "hello", clientId: this.clientId }));
    };

    this.ws.onclose = () => {
      if (this.status !== "DISCONNECTED") {
        this.status = "DISCONNECTED";
        this.view.addLog("WebSocket disconnected", "WARN");
        this.view.updateStatus("DISCONNECTED", false);
      }
      this.ws = null;
    };

    this.ws.onerror = (event) => {
      console.error("WebSocket error:", event);
      this.view.addLog("WebSocket error (siehe Konsole)", "ERROR");
      this.ws = null;
      this.status = "DISCONNECTED";
      this.view.updateStatus("DISCONNECTED", false);
    };

    this.ws.onmessage = (e) => this.handleWsMessage(e);
  }

  // WebSocket-Nachrichten verarbeiten
  handleWsMessage(e) {
    try {
      const data = JSON.parse(e.data);

      // --- Handshake / Rover verbunden ---
      if (data.type === "rover_connected") {
        this.status = "CONNECTED";
        this.view.addLog(
          data.reconnect ? "Reconnected to rover" : "Connected to rover",
          "INFO"
        );
        this.view.updateStatus("CONNECTED", true);
      }

      // --- Phidget Status ---
      if (data.type === "phidget_status") {
        if (data.status === "connected") {
          this.status = "CONNECTED";
          this.view.addLog("Phidget ready", "INFO");
          this.view.updateStatus("CONNECTED", true);
        } else if (data.status === "error") {
          this.status = "DISCONNECTED";
          this.view.addLog(`Phidget error: ${data.message}`, "ERROR");
          this.view.updateStatus("DISCONNECTED", false);
        }
      }

      // --- Distance Sensor ---
      if (data.distance != null) {
        const prev = this.model.distance;
        this.model.updateDistance(parseFloat(data.distance));

        const now = Date.now();
        if (
          prev === null ||
          (this.model.distance < 300 && now - this.lastDistanceBlockLog > this.distanceLogCooldown)
        ) {
          this.view.addLog(`Distance critical: ${this.model.distance} mm`, "WARN");
          this.lastDistanceBlockLog = now;
        }
      }

      // --- Server Logs ---
      if (data.type === "log" && data.message) {
        this.view.addLog(`[Server] ${data.message}`, "INFO");
      }

    } catch (err) {
      console.error("WebSocket parse error:", err);
      this.view.addLog(`WebSocket parse error: ${err.message}`, "ERROR");
    }
  }

  // Gamepad verbinden
  handleGamepadConnect(e) {
    if (!this.controllerActive) {
      this.view.addLog("Gamepad connected", "INFO");
      this.controllerActive = true;
      this.loop();
    }
  }

  // Gamepad trennen
  handleGamepadDisconnect(e) {
    if (this.controllerActive) {
      this.view.addLog("Gamepad disconnected", "WARN");
      this.controllerActive = false;
      this.view.updateStatus("⏳ Waiting for controller...");
    }
  }

  // Joystick-Positionen auf der Seite aktualisieren
  updateJoystickPositions = (gp) => {
    if (!gp) return;

    // Axis-Werte auslesen
    const lsX = gp.axes[0] || 0; // Linker Stick X-Achse (Links / Rechts)
    const lsY = gp.axes[1] || 0; // Linker Stick Y-Achse (Vorwärts / Rückwärts)
    const rsX = gp.axes[2] || 0; // Rechter Stick X-Achse (Lenken Links / Rechts)
    const rsY = gp.axes[3] || 0; // Rechter Stick Y-Achse (Lenken Vorwärts / Rückwärts)

    // Update der Position des linken Sticks (Drive)
    const driveKnob = document.getElementById("drive-knob-handle");
    if (driveKnob) {
      const maxMove = 40; // Maximale Bewegung in Pixeln
      driveKnob.style.transform = `translate(${0}px, ${lsY * maxMove}px)`; // Vorwärts / Rückwärts
    }

    // Update der Position des rechten Sticks (Steering)
    const steerKnob = document.getElementById("steer-knob-handle");
    if (steerKnob) {
      const maxMove = 40; // Maximale Bewegung in Pixeln
      steerKnob.style.transform = `translate(${rsX * maxMove}px, ${0}px)`; // Links / Rechts lenken
    }
  };

  // Gamepad Steuerung
  loop = () => {
    const gp = navigator.getGamepads()[0];

    if (!gp) {
      if (this.controllerActive) {
        this.controllerActive = false;
        this.view.updateStatus("⏳ Waiting for controller...");
      }
      requestAnimationFrame(this.loop);
      return;
    }

    if (!this.controllerActive) {
      this.controllerActive = true;
      this.view.updateStatus("🎮 Controller active");
    }

    // --- BUTTONS ---
    const btnA = gp.buttons[0]?.pressed;
    const btnX = gp.buttons[2]?.pressed;
    const btnY = gp.buttons[3]?.pressed;

    // --- TRIGGERS ---
    const rt = gp.buttons[7]?.value || 0;
    const lt = gp.buttons[6]?.value || 0;

    // --- MODEL STATE UPDATES ---
    const prevStop = this.model.stopActive;
    this.model.toggleStop(btnX);
    if (prevStop !== this.model.stopActive) {
      this.view.addLog(
        `Stop toggled: ${this.model.stopActive ? "ON" : "OFF"}`,
        "WARN"
      );
    }

    const prevSpeed = this.model.speedMode;
    this.model.updateSpeedLock();
    this.model.handleSpeedButtons(btnA, btnY);
    if (prevSpeed !== this.model.speedMode) {
      this.view.addLog(
        `Speed mode changed: ${prevSpeed} → ${this.model.speedMode}`,
        "INFO"
      );
    }

    // --- STEERING & FORWARD ---
    const steer = this.model.deadzone(gp.axes[2]);
    let forward = -this.model.deadzone(gp.axes[1]);

    if (rt > 0 && lt === 0) forward = rt;
    else if (lt > 0 && rt === 0) forward = -lt;
    else if (rt > 0 && lt > 0) forward = 0;

    // --- DISTANCE BLOCK ---
    if (
      this.model.distance !== null &&
      this.model.distance < this.model.minDistanceBlock &&
      forward > 0
    ) {
      forward = 0;
      const now = Date.now();
      if (now - this.lastDistanceBlockLog > this.distanceLogCooldown) {
        this.view.addLog("Distance block active, forward stopped", "WARN");
        this.lastDistanceBlockLog = now;
      }
    }

    // --- MOTOR COMPUTATION ---
    const { left, right, factor } = this.model.computeMotors(forward, steer);

    // --- SEND TO SERVER ---
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

    // --- UPDATE VIEW ---
    this.view.updateUI({
      speedMode: this.model.speedMode,
      factor,
      speedLock: this.model.speedLock,
      stop: this.model.stopActive,
      distance: this.model.distance,
      leftY: left,
      rightY: right,
    });

    // --- UPDATE JOYSTICK POSITION ---
    this.updateJoystickPositions(gp);

    requestAnimationFrame(this.loop);
  };
}