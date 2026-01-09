export default class RoverView {
  constructor(maxLogs = 50) {
    this.maxLogs = maxLogs;

    this.status = document.querySelector("section > div:nth-child(1) p.text-2xl");
    this.logs = document.querySelector("div.flex-1.overflow-y-auto.log-scrollbar");
    this.stopButton = document.querySelector("button:has(span.animate-pulse)");
    this.speedModeEl = document.querySelector("section > div:nth-child(2) p.text-2xl");
    this.speedBarEl = document.querySelector("section > div:nth-child(2) div > div.bg-primary");
    this.distanceEl = document.querySelector("section > div:nth-child(3) p.text-2xl");
    this.headingEl = document.querySelector("div.grid.grid-cols-3 button:nth-child(1) span");
    this.logEntries = [];

    // NEU: speichert aktuellen Status, um Doppel-Logs zu vermeiden
    this.currentStatus = null;
  }

  /**
   * Status aktualisieren. connected=false → rot + Log "NOT CONNECTED" nur einmal
   */
  updateStatus(text, connected = true) {
    if (this.status) {
      this.status.textContent = text;
      this.status.style.color = connected ? "#16a34a" : "#ef4444"; // Grün/Rot
    }

    // NEU: Log nur, wenn sich Status ändert
    if (this.currentStatus !== text) {
      if (!connected) {
        this.addLog("Rover NOT CONNECTED", "ERROR");
      } else {
        this.addLog(text, "INFO");
      }
      this.currentStatus = text;
    }
  }


  updateUI({ speedMode, factor, speedLock, stopActive, forward, steer, distance }) {
    // Speed Mode Text & Bar
    if (this.speedModeEl && this.speedBarEl) {
      const modes = ["Low", "Normal", "High"];
      const modeText = modes[speedMode - 1] || "Unknown";

      let width = 0;
      let color = "";
      let textColor = "";

      switch (speedMode) {
        case 1:
          width = 33;
          color = "#22c55e"; // grün
          textColor = "#16a34a";
          break;
        case 2:
          width = 66;
          color = "#facc15"; // gelb
          textColor = "#ca8a04";
          break;
        case 3:
          width = 100;
          color = "#ef4444"; // rot
          textColor = "#b91c1c";
          break;
        default:
          width = 0;
          color = "#9ca3af";
          textColor = "#6b7280";
      }

      this.speedModeEl.textContent = modeText + (speedLock ? " 🔒" : "");
      this.speedModeEl.style.color = textColor;

      this.speedBarEl.style.width = width + "%";
      this.speedBarEl.style.backgroundColor = color;
      this.speedBarEl.style.transition = "width 0.3s ease, background-color 0.3s ease";
    }

    // STOP Button
    if (this.stopButton) {
      this.stopButton.textContent = "STOP " + (stopActive ? "ON" : "OFF");
    }

    // Distance Anzeige
    if (this.distanceEl) {
      this.distanceEl.innerHTML =
        distance !== null && distance !== undefined
          ? `${(distance / 10).toFixed(1)} cm`
          : "--";
    }
  }

  addLog(message, type = "INFO") {
    if (!this.logs) return;

    const now = new Date();
    const timestamp = now.toLocaleTimeString([], { hour12: false });

    let colorClass = "";
    switch (type) {
      case "INFO":
        colorClass = "text-green-400";
        break;
      case "WARN":
        colorClass = "text-yellow-400";
        break;
      case "ERROR":
        colorClass = "text-red-400";
        break;
      default:
        colorClass = "text-slate-400";
    }

    const p = document.createElement("p");
    p.className = `opacity-60 hover:opacity-100 transition-opacity ${colorClass}`;
    p.innerHTML = `<span class="mr-2">[${timestamp}]</span>${message}`;

    this.logEntries.push(p);

    if (this.logEntries.length > this.maxLogs) {
      this.logEntries.shift();
    }

    this.logs.innerHTML = "";
    this.logEntries.forEach((entry) => this.logs.appendChild(entry));
    this.logs.scrollTop = this.logs.scrollHeight;
  }
}

