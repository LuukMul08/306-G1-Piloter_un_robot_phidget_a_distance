import RoverModel from "../model/RoverModel.js";
import RoverView from "../view/RoverView.js";

export default class RoverController {
  model = new RoverModel();
  view = new RoverView();
  ws = new WebSocket("ws://localhost:8080");
  controllerActive = false;

  lastDistanceBlockLog = 0;
  distanceLogCooldown = 1000; // 1 Sekunde zwischen Warns

  constructor() {
    this.ws.onopen = () => this.view.addLog("WebSocket connected", "INFO");
    this.ws.onclose = () => this.view.addLog("WebSocket disconnected", "WARN");
    this.ws.onerror = (err) =>
      this.view.addLog(`WebSocket error: ${err}`, "ERROR");

    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
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
        }
      } catch (err) {
        this.view.addLog(`WebSocket parse error: ${err}`, "ERROR");
      }
    };

    window.addEventListener("gamepadconnected", (e) => {
      if (!this.controllerActive) {
        this.view.addLog(`Gamepad connected`, "INFO");
        this.controllerActive = true;
        this.loop();
      }
    });

    window.addEventListener("gamepaddisconnected", (e) => {
      if (this.controllerActive) {
        this.view.addLog("Gamepad disconnected", "WARN");
        this.controllerActive = false;
        this.view.updateStatus("⏳ Waiting for controller...");
      }
    });
  }

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
      stopActive: this.model.stopActive,
      forward,
      steer,
      buttons: `${btnA ? "A " : ""}${btnY ? "Y " : ""}${
        btnX ? "X " : ""
      }`.trim(),
      distance: this.model.distance,
    });

    // --- UPDATE JOYSTICKS ---
    this.updateSticks(gp);

    requestAnimationFrame(this.loop);
  };

  updateSticks = (gp) => {
    if (!gp) return;

    // --- AXES ---
    const lsX = gp.axes[0] || 0;
    const lsY = gp.axes[1] || 0;
    const rsX = gp.axes[2] || 0;
    const rsY = gp.axes[3] || 0;

    document.getElementById("lsX").textContent = lsX.toFixed(2);
    document.getElementById("lsY").textContent = lsY.toFixed(2);
    document.getElementById("rsX").textContent = rsX.toFixed(2);
    document.getElementById("rsY").textContent = rsY.toFixed(2);

    // --- TRIGGERS ---
    const ltVal = gp.buttons[6]?.value || 0;
    const rtVal = gp.buttons[7]?.value || 0;
    document.getElementById("ltVal").textContent = ltVal.toFixed(2);
    document.getElementById("rtVal").textContent = rtVal.toFixed(2);

    // --- BUTTONS (grafisch) ---
    const buttonMapping = ["A", "B", "X", "Y", "LB", "RB", "Back", "Start"];
    buttonMapping.forEach((btnName, i) => {
      const pressed = gp.buttons[i]?.pressed || false;
      const el = document.getElementById(`btn${btnName}`);
      if (el) {
        el.classList.toggle("pressed", pressed); // Farbwechsel bei gedrückt
      }
    });

    // --- GRAPHICAL JOYSTICKS ---
    const moveStick = (innerId, xVal, yVal) => {
      const inner = document.getElementById(innerId);
      if (!inner) return;

      const radius = 40; // maximale Verschiebung innerhalb des Kreises
      // invertiere Y, damit -1 oben und 1 unten korrekt angezeigt wird
      inner.style.transform = `translate(${xVal * radius}px, ${
        yVal * -radius
      }px)`;
    };

    moveStick("lsInner", lsX, lsY); // linker Stick
    moveStick("rsInner", rsX, rsY); // rechter Stick
  };
}
