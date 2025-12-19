export default class RoverView {
  status = document.getElementById("status");

  updateStatus(text) {
    this.status.textContent = text;
  }

  updateUI({ speedMode, factor, speedLock, stopActive, forward, steer, buttons, distance }) {
    document.getElementById("speedMode").textContent =
      `Vitesse: ${speedMode} (${Math.round(factor * 100)}%)${speedLock ? " 🔒" : ""}`;

    document.getElementById("stopState").textContent =
      `STOP: ${stopActive ? "ON" : "OFF"}`;

    document.getElementById("stickValues").textContent =
      `Drive: ${forward.toFixed(2)} | Steer: ${steer.toFixed(2)}`;

    document.getElementById("buttons").textContent = buttons;

    document.getElementById("distance").textContent =
      distance !== null ? `Distance: ${(distance / 10).toFixed(1)} cm` : "Distance: --";
  }
}
