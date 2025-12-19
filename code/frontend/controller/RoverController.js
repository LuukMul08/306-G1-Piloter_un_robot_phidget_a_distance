import RoverModel from "../model/RoverModel.js";
import RoverView from "../view/RoverView.js";

export default class RoverController {
  model = new RoverModel();
  view = new RoverView();
  ws = new WebSocket("ws://localhost:8080");

  constructor() {
    this.ws.onmessage = e => {
      try {
        const data = JSON.parse(e.data);
        if (data.distance != null) {
          this.model.updateDistance(parseFloat(data.distance));
        }
      } catch (err) {
        console.warn("⚠️ WebSocket parse error:", err);
      }
    };

    window.addEventListener("gamepadconnected", () => this.loop());
  }

  loop = () => {
    const gp = navigator.getGamepads()[0];

    if (!gp) {
      this.view.updateStatus("⏳ Waiting for controller...");
      requestAnimationFrame(this.loop);
      return;
    }

    this.view.updateStatus(`🎮 Controller connected: ${gp.id}`);

    // --- BUTTONS ---
    const btnA = gp.buttons[0]?.pressed;
    const btnX = gp.buttons[2]?.pressed;
    const btnY = gp.buttons[3]?.pressed;

    // --- TRIGGERS ---
    const rt = gp.buttons[7]?.value || 0; // Right Trigger → forward
    const lt = gp.buttons[6]?.value || 0; // Left Trigger → backward

    // --- MODEL STATE UPDATES ---
    this.model.toggleStop(btnX);
    this.model.updateSpeedLock();
    this.model.handleSpeedButtons(btnA, btnY);

    // --- STEERING ---
    const steer = this.model.deadzone(gp.axes[2]);

    // --- FORWARD / BACKWARD ---
    let forward = -this.model.deadzone(gp.axes[1]); // stick fallback

    if (rt > 0 && lt === 0) {
      forward = rt;
    } else if (lt > 0 && rt === 0) {
      forward = -lt;
    } else if (rt > 0 && lt > 0) {
      forward = 0;
    }

    // --- DISTANCE BLOCK ---
    if (
      this.model.distance !== null &&
      this.model.distance < this.model.minDistanceBlock &&
      forward > 0
    ) {
      forward = 0;
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
          stop: this.model.stopActive
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
      buttons: `${btnA ? "A " : ""}${btnY ? "Y " : ""}${btnX ? "X " : ""}`.trim(),
      distance: this.model.distance
    });

    requestAnimationFrame(this.loop);
  };
}
