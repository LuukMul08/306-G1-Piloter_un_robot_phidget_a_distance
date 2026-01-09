import RoverModel from "../model/RoverModel.js";
import RoverView from "../view/RoverView.js";

const WS_URL = "ws://localhost:8080"; // ggf. IP anpassen, wenn remote
const CLIENT_ID_KEY = "rover-client-id";

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

  keysPressed = {};
  lastDistanceBlockLog = 0;
  distanceLogCooldown = 1000;

  reconnectInterval = 2000;
  lastReconnectAttempt = 0;
  triedConnectThisAttempt = false;

  constructor() {
    this.clientId = getClientId();

    this.connectWebSocket();
    this.loop();

    window.addEventListener("keydown", (e) => this.handleKey(e, true));
    window.addEventListener("keyup", (e) => this.handleKey(e, false));
    this.bindButtons();

    setInterval(() => this.reconnectCheck(), 500);
  }

  reconnectCheck() {
    const now = Date.now();
    if (
      !this.ws ||
      this.ws.readyState === WebSocket.CLOSED ||
      this.ws.readyState === WebSocket.CLOSING
    ) {
      if (now - this.lastReconnectAttempt >= this.reconnectInterval) {
        this.lastReconnectAttempt = now;
        this.triedConnectThisAttempt = false;
        this.connectWebSocket();
      }
    }
  }

  connectWebSocket() {
    if (this.triedConnectThisAttempt) return;
    this.triedConnectThisAttempt = true;

    this.view.addLog("Trying to connect WebSocket…", "INFO");
    this.view.updateStatus("CONNECTING…", false);

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.view.addLog("WebSocket connected", "INFO");
      // HELLO an Server senden
      this.ws.send(JSON.stringify({ type: "hello", clientId: this.clientId }));
    };

    this.ws.onclose = () => {
      this.view.addLog("WebSocket disconnected", "WARN");
      this.view.updateStatus("NOT CONNECTED", false);
      this.ws = null;
      this.triedConnectThisAttempt = false;
    };

    this.ws.onerror = (event) => {
      console.error("WebSocket error:", event);
      this.view.addLog("WebSocket error (siehe Konsole)", "ERROR");
      this.ws = null;
      this.triedConnectThisAttempt = false;
    };

    this.ws.onmessage = (e) => this.handleWsMessage(e);
  }

  handleWsMessage(e) {
    try {
      const data = JSON.parse(e.data);

      if (data.type === "rover_connected") {
        this.view.addLog(
          data.reconnect ? "Reconnected to rover" : "Connected to rover",
          "INFO"
        );
        this.view.updateStatus("CONNECTED", true); // Erst hier auf CONNECTED setzen
      }

      // Distance-Update
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
            `Distance critical: ${this.model.distance} mm`,
            "WARN"
          );
          this.lastDistanceBlockLog = now;
        }

        const el = document.getElementById("distanceDisplay");
        if (el) el.textContent = (this.model.distance / 1000).toFixed(2) + " m";
      }
    } catch (err) {
      console.error("WebSocket parse error:", err);
      this.view.addLog(`WebSocket parse error: ${err.message}`, "ERROR");
    }
  }

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

  handleKey = (e, pressed) => {
    let key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (key === " ") key = "SPACE";

    if (key === "SPACE" && pressed && !this.keysPressed.SPACE) {
      this.model.stopActive = !this.model.stopActive;
      this.view.addLog(`STOP: ${this.model.stopActive}`, "INFO");
    }

    // Speed-Modus erhöhen/vermindern
    if (pressed) {
      if (key === "Q") {
        this.model.speedMode = Math.max(1, this.model.speedMode - 1);
        this.view.addLog(
          `Speed mode lowered to ${this.model.speedMode}`,
          "INFO"
        );
        this.view.updateUI({
          speedMode: this.model.speedMode,
          speedLock: this.model.speedLock,
          stopActive: this.model.stopActive,
          distance: this.model.distance,
        });
      } else if (key === "E") {
        this.model.speedMode = Math.min(3, this.model.speedMode + 1);
        this.view.addLog(
          `Speed mode increased to ${this.model.speedMode}`,
          "INFO"
        );
        this.view.updateUI({
          speedMode: this.model.speedMode,
          speedLock: this.model.speedLock,
          stopActive: this.model.stopActive,
          distance: this.model.distance,
        });
      }
    }

    this.keysPressed[key] = pressed;
  };

  loop = () => {
    let forward =
      (this.keysPressed.W || this.keysPressed.ArrowUp ? 1 : 0) -
      (this.keysPressed.S || this.keysPressed.ArrowDown ? 1 : 0);
    let steer =
      (this.keysPressed.D || this.keysPressed.ArrowRight ? 1 : 0) -
      (this.keysPressed.A || this.keysPressed.ArrowLeft ? 1 : 0);

    if (this.model.stopActive) forward = 0;
    if (
      this.model.distance !== null &&
      this.model.distance < this.model.minDistanceBlock &&
      forward > 0
    )
      forward = 0;

    this.model.updateSpeedLock();
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
      speedLock: this.model.speedLock,
      stopActive: this.model.stopActive,
      distance: this.model.distance,
      forward,
      steer,
    });

    requestAnimationFrame(this.loop);
  };
}
