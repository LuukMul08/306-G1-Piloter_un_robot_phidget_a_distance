export default class RoverView {
  status = document.getElementById("status");
  logs = document.getElementById("logs");

  updateStatus(text) {
    this.status.textContent = text;
  }

  updateUI({ speedMode, factor, speedLock, stopActive, forward, steer, buttons, distance }) {
    document.getElementById("speedMode").textContent =
      `Vitesse: ${speedMode} (${Math.round(factor * 100)}%)${speedLock ? " 🔒" : ""}`;
    document.getElementById("stopState").textContent =
      `STOP: ${stopActive ? "ON" : "OFF"}`;
    document.getElementById("stickValues").textContent =
      `Avance: ${forward.toFixed(2)} | Direction: ${steer.toFixed(2)}`;
    document.getElementById("buttons").textContent = buttons;
    document.getElementById("distance").textContent =
      distance !== null ? `Distance: ${(distance / 10).toFixed(1)} cm` : "Distance: --";
  }

  /**
   * Ajoute un log avec type (INFO, WARN, ERROR)
   */
  addLog(message, type = "INFO") {
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    const color =
      type === "INFO" ? "#0f0" :
      type === "WARN" ? "#ff0" :
      type === "ERROR" ? "#f00" : "#0f0";

    const div = document.createElement("div");
    div.style.color = color;
    div.textContent = `[${timestamp}] [${type}] ${message}`;
    this.logs.appendChild(div);
    this.logs.scrollTop = this.logs.scrollHeight; // autoscroll
  }
}
