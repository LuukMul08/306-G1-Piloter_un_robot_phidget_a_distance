import RoverModel from "../model/RoverModel.js";
// Removed RoverView import and usage

export default class RoverController {
  model = new RoverModel();
  ws = null;

  // Callbacks set by UI (TestController)
  onConnectChange = null;   // (state: 'connected' | 'disconnected') => void
  onAxesUpdate = null;      // ({forward, steer, left, right, factor, buttons, distance}) => void

  _loopActive = false;
  _rafId = null;

  constructor() {
    // Start loop when a gamepad connects
    window.addEventListener("gamepadconnected", () => this._startLoop());
  }

  connect(url = "ws://localhost:8080") {
    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        if (this.onConnectChange) this.onConnectChange("connected");
        // Ensure loop runs even if gamepad was already connected before
        this._startLoop();
      };
      this.ws.onclose = () => {
        if (this.onConnectChange) this.onConnectChange("disconnected");
      };
      this.ws.onmessage = e => {
        try {
          const data = JSON.parse(e.data);
          if (data.distance != null) {
            this.model.updateDistance(parseFloat(data.distance));
          }
        } catch (err) {
          console.warn("WS parse error:", err);
        }
      };
      this.ws.onerror = () => {
        if (this.onConnectChange) this.onConnectChange("disconnected");
      };
    } catch {
      if (this.onConnectChange) this.onConnectChange("disconnected");
    }
  }

  disconnect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.ws = null;
    if (this.onConnectChange) this.onConnectChange("disconnected");
  }

  _startLoop() {
    if (this._loopActive) return;
    this._loopActive = true;
    this._loop();
  }

  _loop = () => {
    const gp = navigator.getGamepads?.()[0];

    // Default values if no gamepad
    let btnA = false, btnX = false, btnY = false;
    let forward = 0, steer = 0;

    if (gp) {
      // BUTTONS
      btnA = gp.buttons[0]?.pressed;
      btnX = gp.buttons[2]?.pressed;
      btnY = gp.buttons[3]?.pressed;

      // TRIGGERS / AXES
      const rt = gp.buttons[7]?.value || 0;
      const lt = gp.buttons[6]?.value || 0;

      steer = this.model.deadzone(gp.axes[2]);
      forward = -this.model.deadzone(gp.axes[1]); // stick fallback

      if (rt > 0 && lt === 0) forward = rt;
      else if (lt > 0 && rt === 0) forward = -lt;
      else if (rt > 0 && lt > 0) forward = 0;
    }

    // Model updates
    this.model.toggleStop(btnX);
    this.model.updateSpeedLock();
    this.model.handleSpeedButtons(btnA, btnY);

    // Distance safety
    if (
      this.model.distance !== null &&
      this.model.distance < this.model.minDistanceBlock &&
      forward > 0
    ) {
      forward = 0;
    }

    // Motor computation
    const { left, right, factor } = this.model.computeMotors(forward, steer);

    // Send to backend
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          leftY: left,
          rightY: right,
          speedMode: this.model.speedMode,
          stop: this.model.stopActive
        }));
      } catch {}
    }

    // Emit to UI for visuals
    if (this.onAxesUpdate) {
      this.onAxesUpdate({
        forward, steer, left, right, factor,
        buttons: `${btnA ? "A " : ""}${btnY ? "Y " : ""}${btnX ? "X " : ""}`.trim(),
        distance: this.model.distance
      });
    }

    if (this._loopActive) this._rafId = requestAnimationFrame(this._loop);
  };
}
