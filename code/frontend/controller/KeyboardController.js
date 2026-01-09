import RoverModel from "../model/RoverModel.js";
import RoverView from "../view/RoverView.js";

export default class RoverController {
  model = new RoverModel();
  view = new RoverView();
  ws = null;
  keysPressed = {};
  lastDistanceBlockLog = 0;
  distanceLogCooldown = 1000;
  reconnectInterval = 1000; // versuchen jede Sekunde
  lastReconnectAttempt = 0;
  triedConnectThisAttempt = false; // verhindert mehrfach-Logs pro Versuch

  constructor() {
    // --- Start Loop ---
    this.loop();

    // --- Keyboard ---
    window.addEventListener("keydown", (e) => this.handleKey(e, true));
    window.addEventListener("keyup", (e) => this.handleKey(e, false));

    // --- HTML Button Events ---
    this.bindButtons();

    // --- Reconnect Timer ---
    setInterval(() => this.reconnectCheck(), 200);
  }

  reconnectCheck() {
    const now = Date.now();
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      if (now - this.lastReconnectAttempt > this.reconnectInterval) {
        this.lastReconnectAttempt = now;
        this.triedConnectThisAttempt = false; // Reset Log-Flag
        this.connectWebSocket();
      }
    }
  }

  connectWebSocket() {
    if (!this.triedConnectThisAttempt) {
      this.view.addLog("Trying to connect WebSocket…", "INFO");
      this.triedConnectThisAttempt = true;
    }

    this.ws = new WebSocket("ws://localhost:8080");

    this.ws.onopen = () => {
      this.view.addLog("WebSocket open", "INFO");
      this.view.updateStatus("CONNECTING…", false);
    };

    this.ws.onclose = () => {
      this.view.addLog("WebSocket disconnected", "WARN");
      this.view.updateStatus("NOT CONNECTED", false);
    };

    this.ws.onerror = (err) => {
      this.view.addLog(`WebSocket error: ${err}`, "ERROR");
      this.view.updateStatus("NOT CONNECTED", false);
    };

    this.ws.onmessage = (e) => this.handleWsMessage(e);
  }

  handleWsMessage(e) {
    try {
      const data = JSON.parse(e.data);

      // --- Rover bestätigt Verbindung ---
      if (data.type === "rover_connected") {
        this.view.updateStatus("CONNECTED", true);
      }

      // --- DISTANCE ---
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

        const distanceEl = document.getElementById("distanceDisplay");
        if (distanceEl)
          distanceEl.textContent =
            (this.model.distance / 1000).toFixed(2) + " m";
      }

      // --- HEADING ---
      if (data.heading != null) {
        const headingEl = document.getElementById("headingDisplay");
        if (headingEl) headingEl.textContent = `R ${data.heading}°`;
      }
    } catch (err) {
      this.view.addLog(`WebSocket parse error: ${err}`, "ERROR");
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

  toggleStop() {
    this.model.stopActive = !this.model.stopActive;
    this.view.addLog(`STOP toggled: ${this.model.stopActive}`, "INFO");

    const el = document.getElementById("keySpace");
    if (el) el.classList.add("pressed");
    setTimeout(() => el?.classList.remove("pressed"), 150);
  }

  handleKey = (e, pressed) => {
    let key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (key === " ") key = "SPACE";

    if (key === "SPACE" && pressed && !this.keysPressed["SPACE"]) {
      this.toggleStop();
    }

    this.keysPressed[key] = pressed;

    // --- Button Animation ---
    const allKeys = [
      "W", "A", "S", "D", "SPACE",
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    ];
    let elId = null;
    if (allKeys.includes(key)) {
      elId = key.startsWith("Arrow")
        ? "keyArrow" + key.replace("Arrow", "")
        : "key" + (key === "SPACE" ? "Space" : key);
    }
    const el = elId ? document.getElementById(elId) : null;
    if (el) el.classList.toggle("pressed", pressed);

    // --- Speed Mode ---
    if (pressed && !this.model.speedLock) {
      let oldMode = this.model.speedMode;
      switch (key) {
        case "R":
          this.model.speedMode =
            this.model.speedMode === 3 ? 1 : this.model.speedMode + 1;
          break;
        case "Q":
          this.model.speedMode = Math.max(1, this.model.speedMode - 1);
          break;
        case "E":
          this.model.speedMode = Math.min(3, this.model.speedMode + 1);
          break;
      }

      if (this.model.speedMode !== oldMode) {
        this.view.addLog(
          `Speed mode changed: ${oldMode} → ${this.model.speedMode}`,
          "INFO"
        );
      }

      const elSpeed = document.getElementById("speedMode");
      if (elSpeed)
        elSpeed.textContent =
          ["Low", "Normal", "High"][this.model.speedMode - 1] || this.model.speedMode;
    }
  };

  loop = () => {
    let forward = 0;
    let steer = 0;
    if (this.keysPressed["W"] || this.keysPressed["ArrowUp"]) forward += 1;
    if (this.keysPressed["S"] || this.keysPressed["ArrowDown"]) forward -= 1;
    if (this.keysPressed["A"] || this.keysPressed["ArrowLeft"]) steer -= 1;
    if (this.keysPressed["D"] || this.keysPressed["ArrowRight"]) steer += 1;

    if (this.model.stopActive) forward = 0;

    // Distance block nur alle x ms loggen
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

    this.model.updateSpeedLock();

    const { left, right, factor } = this.model.computeMotors(forward, steer);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          leftY: left,
          rightY: right,
          speedMode: this.model.speedMode,
          stop: this.model.stopActive,
        })
      );
    } else {
      // Status nur einmal loggen bei Statuswechsel
      this.view.updateStatus("NOT CONNECTED", false);
    }

    if (this.view.updateUI) {
      this.view.updateUI({
        speedMode: this.model.speedMode,
        factor,
        speedLock: this.model.speedLock,
        stopActive: this.model.stopActive,
        forward,
        steer,
        distance: this.model.distance,
      });
    }

    requestAnimationFrame(this.loop);
  };
}
