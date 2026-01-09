import { WebSocketServer } from "ws";
import * as phidget22 from "phidget22";
import fs from "fs";
import path from "path";
import RoverModel from "./model/RoverModel.js";
import RoverView from "./view/RoverView.js";
import RoverController from "./controller/RoverController.js";

const PORT = 8080;
const clients = new Map();

// --- Globale Phidget-Verbindung und Daten ---
let savedPhidgetConn = null; // die echte NetworkConnection
let savedPhidgetData = null; // { ip, port }
const connectionDataFile = "./phidgetConnection.json"; // Relativer Pfad zur gespeicherten Phidget-Verbindung

async function loadSavedPhidgetData() {
  try {
    if (fs.existsSync(connectionDataFile)) {
      const data = fs.readFileSync(connectionDataFile, "utf8");

      // Überprüfen, ob die Datei leer ist
      if (data.trim() === "") {
        console.log("ℹ️ Die gespeicherte Phidget-Verbindungsdatei ist leer.");
        return;
      }

      // Versuchen, die Daten zu parsen
      savedPhidgetData = JSON.parse(data);
      console.log(`ℹ️ Geladene gespeicherte Phidget-Verbindungsdaten: ${JSON.stringify(savedPhidgetData)}`);
    } else {
      console.log("ℹ️ Keine gespeicherten Verbindungsdaten gefunden.");
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error("❌ Fehler beim Laden der gespeicherten Phidget-Daten: Ungültiges JSON-Format in der Datei.");
    } else {
      console.error("❌ Fehler beim Laden der gespeicherten Phidget-Daten:", err);
    }
  }
}

async function savePhidgetData(ip, port) {
  const data = { ip, port };
  try {
    // Überprüfen, ob das Verzeichnis existiert, bevor die Datei gespeichert wird
    const dir = path.dirname(connectionDataFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true }); // Verzeichnis erstellen, falls nicht vorhanden
    }

    fs.writeFileSync(connectionDataFile, JSON.stringify(data), "utf8");
    console.log(`✅ Gespeicherte Phidget-Verbindungsdaten: ${JSON.stringify(data)}`);
  } catch (err) {
    console.error("❌ Fehler beim Speichern der Phidget-Daten:", err);
  }
}

async function connectPhidget(model, ip, port) {
  try {
    // Wenn schon verbunden, nur wiederverwenden
    if (savedPhidgetConn) {
      console.log("⚠️ Phidget bereits verbunden, wiederverwenden");
      return savedPhidgetConn;
    }

    const conn = new phidget22.NetworkConnection(port, ip);
    console.log(`⏳ Verbindungsaufbau zu Phidget Hub ${ip}:${port}...`);
    await conn.connect(20000); // Timeout auf 20 Sekunden erhöhen
    console.log(`✅ Verbunden mit Phidget Hub ${ip}:${port}`);

    // Motoren & Sensoren nur einmal initialisieren
    await model.initMotors(667784, 667784, 0, 1);
    await model.initDistanceSensor(667784, 0);
    console.log("✅ Motoren und Distance Sensor initialisiert");

    savedPhidgetConn = conn;
    savedPhidgetData = { ip, port };

    // Wenn die Verbindung abbricht, automatisch zurücksetzen
    conn.onDisconnect = () => {
      console.warn("⚠️ Phidget-Verbindung getrennt");
      savedPhidgetConn = null;
      savedPhidgetData = null;
    };

    return conn;
  } catch (err) {
    console.error("❌ Phidget-Verbindung fehlgeschlagen:", err);
    savedPhidgetConn = null;
    return null;
  }
}

async function shutdownPhidget() {
  if (savedPhidgetConn) {
    try {
      await savedPhidgetConn.close();
      console.log("✅ Phidget-Verbindung sauber geschlossen");
    } catch (err) {
      console.error("❌ Fehler beim Schließen der Phidget-Verbindung:", err);
    }
    savedPhidgetConn = null;
    savedPhidgetData = null;
  }
}

async function main() {
  const wss = new WebSocketServer({ port: PORT, host: "0.0.0.0" });
  console.log(`✅ WebSocket Server läuft auf ws://localhost:${PORT}`);

  const model = new RoverModel();
  const view = new RoverView();

  // --- Sauberer Shutdown ---
  async function shutdown() {
    console.log("🛑 Shutdown...");
    await shutdownPhidget();
    await model.shutdown();
    console.log("✅ Shutdown abgeschlossen");
    process.exit();
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("uncaughtException", async (err) => {
    console.error("❌ Uncaught Exception:", err);
    await shutdown();
  });

  // Lade gespeicherte Phidget-Verbindungsdaten beim Start
  await loadSavedPhidgetData();

  wss.on("connection", async (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`🔗 WS connected from ${ip}`);

    ws.on("message", async (msg) => {
      let data;
      try {
        data = JSON.parse(msg);
      } catch (err) {
        console.error("❌ Invalid JSON:", err);
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      const clientId = data.clientId;

      if (data.type === "hello") {
        const existing = clients.get(clientId);
        const isReconnect = !!existing;

        if (isReconnect) {
          console.log(`🔄 Reconnect von ${clientId}`);
          existing.ws.onclose = null;
          existing.ws.close();
          existing.controller?.shutdown?.();
          clients.delete(clientId);
        } else {
          console.log(`🆕 Neuer Client ${clientId}`);
        }

        const controller = new RoverController(model, view, ws);
        clients.set(clientId, { ws, controller, ip, phidgetConn: null });

        ws.send(JSON.stringify({ type: "rover_connected", reconnect: isReconnect }));

        // --- Wenn Phidget schon verbunden, Status zurückgeben ---
        if (savedPhidgetConn) {
          console.log(`ℹ️ Bestehende Phidget-Verbindung erkannt, Status an Client senden`);
          clients.get(clientId).phidgetConn = savedPhidgetConn;
          ws.send(JSON.stringify({ type: "phidget_status", status: "connected" }));
        }

        return;
      }

      if (data.type === "connect_phidget") {
        const ip = data.ip || "10.18.1.126";
        const port = data.port || 5661;

        console.log(`🔌 Client ${clientId} versucht, sich mit Phidget Hub ${ip}:${port} zu verbinden`);
        ws.send(JSON.stringify({ type: "log", message: `Client ${clientId} verbindet sich mit Phidget Hub ${ip}:${port}` }));

        const existing = clients.get(clientId);

        try {
          // Immer neu verbinden, falls keine gültige Verbindung existiert
          const conn = await connectPhidget(model, ip, port);
          if (conn) {
            existing.phidgetConn = conn;
            ws.send(JSON.stringify({ type: "phidget_status", status: "connected" }));
            // Speichere die Verbindung für zukünftige Verbindungen
            await savePhidgetData(ip, port);
          } else {
            ws.send(JSON.stringify({ type: "phidget_status", status: "error", message: "Verbindung fehlgeschlagen" }));
          }
        } catch (err) {
          console.error("❌ Phidget-Verbindung fehlgeschlagen:", err);
          ws.send(JSON.stringify({ type: "phidget_status", status: "error", message: err.message }));
        }
      }
    });

    ws.on("close", () => {
      console.log("⚠️ WS connection closed");
      for (const [id, entry] of clients.entries()) {
        if (entry.ws === ws) {
          console.log(`❌ Client ${id} getrennt`);
          clients.delete(id);
          break;
        }
      }
    });

    ws.on("error", (err) => {
      console.error("❌ WebSocket error:", err);
    });
  });
}

main();
