import RoverModel from "../model/RoverModel.js";
import RoverView from "../view/RoverView.js";

export default class RoverController {
  model = new RoverModel();
  view = new RoverView();
  ws = new WebSocket("ws://localhost:8080");
  keysPressed = {};
  lastDistanceBlockLog = 0;
  distanceLogCooldown = 1000; // 1 Sekunde zwischen Warns

  constructor() {
    // --- WebSocket Events ---
    this.ws.onopen = () => this.view.addLog("WebSocket connected", "INFO");
    this.ws.onclose = () => this.view.addLog("WebSocket disconnected", "WARN");
    this.ws.onerror = (err) => this.view.addLog(`WebSocket error: ${err}`, "ERROR");

    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
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
      } catch (err) {
        this.view.addLog(`WebSocket parse error: ${err}`, "ERROR");
      }
    };

    // --- Keyboard Events ---
    window.addEventListener("keydown", (e) => this.handleKey(e, true));
    window.addEventListener("keyup", (e) => this.handleKey(e, false));

    // --- Mouse Events für sichtbare Tasten ---
    const visibleKeys = ["W", "A", "S", "D", "SPACE", "SHIFT", "Q", "E"]; // hinzugefügt Q und E
    visibleKeys.forEach(key => {
      const elId = key === "SPACE" ? "keySpace" : key === "SHIFT" ? "keyShift" : "key" + key;
      const el = document.getElementById(elId);
      if (el) {
        el.addEventListener("mousedown", () => this.handleKey({ key }, true));
        el.addEventListener("mouseup", () => this.handleKey({ key }, false));
        el.addEventListener("mouseleave", () => this.handleKey({ key }, false));
      }
    });

    // --- Start Loop ---
    this.loop();
  }

  handleKey = (e, pressed) => {
    let key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (key === " ") key = "SPACE";

    // --- Stop-Toggle bei SPACE nur auf Keydown ---
    if (key === "SPACE" && pressed && !this.keysPressed["SPACE"]) {
      this.model.stopActive = !this.model.stopActive;
      this.view.addLog(`STOP toggled: ${this.model.stopActive}`, "INFO");
    }

    this.keysPressed[key] = pressed;

    // --- Animation der Tasten ---
    let elId = null;
    if (["W", "A", "S", "D", "SPACE", "SHIFT", "Q", "E"].includes(key)) {
      elId = "key" + (key === "SPACE" ? "Space" : key === "SHIFT" ? "Shift" : key);
    } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) {
      elId = "arrow" + key.replace("Arrow", "");
    }
    const el = elId ? document.getElementById(elId) : null;
    if (el) el.classList.toggle("pressed", pressed);

    // --- Speed Mode anpassen ---
    if (pressed && !this.model.speedLock) {
      switch(key) {
        case "R":
          // Zyklus: 1 → 2 → 3 → 1
          this.model.speedMode = this.model.speedMode === 3 ? 1 : this.model.speedMode + 1;
          this.view.addLog(`Speed Mode set to ${this.model.speedMode}`, "INFO");
          break;
        case "Q":
          // Geschwindigkeit runter (min 1)
          this.model.speedMode = Math.max(1, this.model.speedMode - 1);
          this.view.addLog(`Speed Mode decreased to ${this.model.speedMode}`, "INFO");
          break;
        case "E":
          // Geschwindigkeit hoch (max 3)
          this.model.speedMode = Math.min(3, this.model.speedMode + 1);
          this.view.addLog(`Speed Mode increased to ${this.model.speedMode}`, "INFO");
          break;
      }
    }
  }

  loop = () => {
    // --- STEERING & FORWARD ---
    let forward = 0;
    let steer = 0;
    if (this.keysPressed["W"] || this.keysPressed["ArrowUp"]) forward += 1;
    if (this.keysPressed["S"] || this.keysPressed["ArrowDown"]) forward -= 1;
    if (this.keysPressed["A"] || this.keysPressed["ArrowLeft"]) steer -= 1;
    if (this.keysPressed["D"] || this.keysPressed["ArrowRight"]) steer += 1;

    // STOP wird jetzt nur noch durch toggle bestimmt, nicht mehr durch Leertaste gedrückt halten
    if (this.model.stopActive) forward = 0;

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

    // --- Speed Lock je nach Entfernung ---
    this.model.updateSpeedLock();

    // --- MOTOR COMPUTATION ---
    const { left, right, factor } = this.model.computeMotors(forward, steer);

    // --- SEND TO SERVER ---
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        leftY: left,
        rightY: right,
        speedMode: this.model.speedMode,
        stop: this.model.stopActive
      }));
    }

    // --- UPDATE VIEW ---
    if (this.view.updateUI) {
      this.view.updateUI({
        speedMode: this.model.speedMode,
        factor,
        speedLock: this.model.speedLock,
        stopActive: this.model.stopActive,
        forward,
        steer,
        distance: this.model.distance
      });
    }

    requestAnimationFrame(this.loop);
  }
}
