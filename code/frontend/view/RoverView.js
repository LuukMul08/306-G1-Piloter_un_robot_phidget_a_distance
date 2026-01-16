export default class RoverView {
  constructor(maxLogs = 50) {
    this.maxLogs = maxLogs;

    this.status = document.querySelector(
      "section > div:nth-child(1) p.text-2xl"
    );
    this.logs = document.querySelector(
      "div.flex-1.overflow-y-auto.log-scrollbar"
    );
    this.stopButton = document.getElementById("keySpace");

    this.speedModeEl = document.querySelector(
      "section > div:nth-child(2) p.text-2xl"
    );
    this.speedBarEl = document.querySelector(
      "section > div:nth-child(2) div > div.bg-primary"
    );
    this.distanceEl = document.querySelector(
      "section > div:nth-child(3) p.text-2xl"
    );
    this.headingEl = document.querySelector(
      "div.grid.grid-cols-3 button:nth-child(1) span"
    );
    this.logEntries = [];

    // NOUVEAU : stocke le statut actuel pour éviter les doublons dans les logs
    this.currentStatus = null;
  }

  /**
   * Met à jour le statut. connected=false → rouge + log "NOT CONNECTED" une seule fois
   */
  updateStatus(text, connected = true) {
    if (this.status) {
      this.status.textContent = text;
      this.status.style.color = connected ? "#16a34a" : "#ef4444"; // Vert/Rouge
    }

    // NOUVEAU : log uniquement si le statut change
    if (this.currentStatus !== text) {
      if (!connected) {
        this.addLog("Rover NON CONNECTÉ", "ERROR");
      } else {
        this.addLog(text, "INFO");
      }
      this.currentStatus = text;
    }
  }

  /**
   * Met à jour l'affichage de l'UI (mode vitesse, barre, distance, STOP, etc.)
   */
  updateUI({
    speedMode,
    factor,
    speedLock,
    stopActive,
    forward,
    steer,
    distance,
  }) {
    // --- Speed Mode & Bar ---
    if (this.speedModeEl && this.speedBarEl) {
      const modes = ["Low", "Normal", "High"];
      const modeText = modes[speedMode - 1] || "Inconnu";

      let width = 0,
        color = "",
        textColor = "";

      switch (speedMode) {
        case 1:
          width = 33;
          color = "#22c55e";
          textColor = "#16a34a";
          break;
        case 2:
          width = 66;
          color = "#facc15";
          textColor = "#ca8a04";
          break;
        case 3:
          width = 100;
          color = "#ef4444";
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
      this.speedBarEl.style.transition =
        "width 0.3s ease, background-color 0.3s ease";
    }

    // --- Distance ---
    if (this.distanceEl && distance !== undefined) {
      this.distanceEl.innerHTML = `${Number(distance) / 10}<span class="text-sm font-normal ml-1">cm</span>`;
    }

    // --- STOP Button ---
    if (this.stopButton) {
      let textEl = this.stopButton.querySelector(".stop-text");
      if (!textEl) {
        textEl = document.createElement("span");
        textEl.classList.add("stop-text", "ml-2");
        this.stopButton.appendChild(textEl);
      }
      textEl.textContent = stopActive ? "ON" : "OFF";

      this.stopButton.style.backgroundColor = stopActive
        ? "#7f1d1d"
        : "#dc2626";
      if (stopActive) this.stopButton.classList.add("animate-pulse");
      else this.stopButton.classList.remove("animate-pulse");
    }
  }

  /**
   * Ajoute un message au journal d'événements avec un type (INFO, WARN, ERROR)
   */
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

    // Supprime les anciens logs si dépassement de maxLogs
    if (this.logEntries.length > this.maxLogs) {
      this.logEntries.shift();
    }

    // Actualise l'affichage du journal
    this.logs.innerHTML = "";
    this.logEntries.forEach((entry) => this.logs.appendChild(entry));
    this.logs.scrollTop = this.logs.scrollHeight;
  }
}
