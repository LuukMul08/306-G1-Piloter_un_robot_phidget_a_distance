import { WebSocketServer } from "ws";
import net from "net";
import * as phidget22 from "phidget22";
import fs from "fs";
import path from "path";
import RoverModel from "./model/RoverModel.js";
import RoverView from "./view/RoverView.js";
import RoverController from "./controller/RoverController.js";

const PORT = 8080;
const clients = new Map();

// --- Connexion et données Phidget globales ---
let savedPhidgetConn = null; // la vraie NetworkConnection
let savedPhidgetData = null; // { ip, port }
const connectionDataFile = "./phidgetConnection.json"; // chemin relatif vers la connexion Phidget sauvegardée

async function loadSavedPhidgetData() {
  try {
    if (fs.existsSync(connectionDataFile)) {
      const data = fs.readFileSync(connectionDataFile, "utf8");

      // Vérifier si le fichier est vide
      if (data.trim() === "") {
        console.log("ℹ️ Le fichier de connexion Phidget sauvegardé est vide.");
        return;
      }

      // Essayer de parser les données
      savedPhidgetData = JSON.parse(data);
      console.log(`ℹ️ Données de connexion Phidget sauvegardées chargées : ${JSON.stringify(savedPhidgetData)}`);
    } else {
      console.log("ℹ️ Aucune donnée de connexion sauvegardée trouvée.");
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error("❌ Erreur lors du chargement des données Phidget sauvegardées : format JSON invalide dans le fichier.");
    } else {
      console.error("❌ Erreur lors du chargement des données Phidget sauvegardées :", err);
    }
  }
}

async function savePhidgetData(ip, port) {
  const data = { ip, port };
  try {
    // Vérifier si le répertoire existe avant d'enregistrer le fichier
    const dir = path.dirname(connectionDataFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true }); // créer le répertoire si nécessaire
    }

    fs.writeFileSync(connectionDataFile, JSON.stringify(data), "utf8");
    console.log(`✅ Données de connexion Phidget sauvegardées : ${JSON.stringify(data)}`);
  } catch (err) {
    console.error("❌ Erreur lors de la sauvegarde des données Phidget :", err);
  }
}

async function connectPhidget(model, ip, port) {
  try {
    // Si déjà connecté, réutiliser la connexion existante
    if (savedPhidgetConn) {
      console.log("⚠️ Phidget déjà connecté, réutilisation de la connexion");
      return savedPhidgetConn;
    }

    const conn = new phidget22.NetworkConnection(port, ip);
    console.log(`⏳ Connexion au Phidget Hub ${ip}:${port}...`);
    await conn.connect(20000); // augmenter le timeout à 20 secondes
    console.log(`✅ Connecté au Phidget Hub ${ip}:${port}`);

    // Initialiser moteurs et capteurs une seule fois
    await model.initMotors(667784, 667784, 0, 1);
    await model.initDistanceSensor(667784, 0);
    console.log("✅ Moteurs et capteur de distance initialisés");

    savedPhidgetConn = conn;
    savedPhidgetData = { ip, port };

    // Réinitialiser automatiquement si la connexion est perdue
    conn.onDisconnect = () => {
      console.warn("⚠️ Connexion Phidget déconnectée");
      savedPhidgetConn = null;
      savedPhidgetData = null;
    };

    return conn;
  } catch (err) {
    console.error("❌ Échec de la connexion au Phidget :", err);
    savedPhidgetConn = null;
    return null;
  }
}

async function shutdownPhidget() {
  if (savedPhidgetConn) {
    try {
      await savedPhidgetConn.close();
      console.log("✅ Connexion Phidget fermée proprement");
    } catch (err) {
      console.error("❌ Erreur lors de la fermeture de la connexion Phidget :", err);
    }
    savedPhidgetConn = null;
    savedPhidgetData = null;
  }
}

async function main() {
  // Vérifier si le port est libre pour éviter EADDRINUSE
  async function isPortFree(port, host = "0.0.0.0") {
    return new Promise((resolve) => {
      const tester = net.createServer()
        .once("error", (err) => {
          if (err && err.code === "EADDRINUSE") resolve(false);
          else resolve(false);
        })
        .once("listening", () => {
          tester.close(() => resolve(true));
        })
        .listen(port, host);
    });
  }

  const portFree = await isPortFree(PORT, "0.0.0.0");
  if (!portFree) {
    console.error(`❌ Port ${PORT} déjà utilisé. Veuillez fermer l'autre processus ou choisir un autre port.`);
    process.exit(1);
  }

  const wss = new WebSocketServer({ port: PORT, host: "0.0.0.0" });
  wss.on("error", async (err) => {
    console.error("❌ Erreur du serveur WebSocket :", err);
    if (err && err.code === "EADDRINUSE") {
      console.error(`❌ Port ${PORT} déjà utilisé (EADDRINUSE)`);
      try {
        await shutdownPhidget();
      } catch (e) {}
      process.exit(1);
    }
  });

  console.log(`✅ Serveur WebSocket actif sur ws://localhost:${PORT}`);

  const model = new RoverModel();
  const view = new RoverView();

  // --- Arrêt propre ---
  async function shutdown() {
    console.log("🛑 Arrêt en cours...");
    await shutdownPhidget();
    await model.shutdown();
    console.log("✅ Arrêt terminé");
    process.exit();
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("uncaughtException", async (err) => {
    console.error("❌ Exception non capturée :", err);
    await shutdown();
  });

  // Charger les données de connexion Phidget sauvegardées au démarrage
  await loadSavedPhidgetData();

  wss.on("connection", async (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`🔗 WS connecté depuis ${ip}`);

    ws.on("message", async (msg) => {
      let data;
      try {
        data = JSON.parse(msg);
      } catch (err) {
        console.error("❌ JSON invalide :", err);
        ws.send(JSON.stringify({ type: "error", message: "JSON invalide" }));
        return;
      }

      const clientId = data.clientId;

      if (data.type === "hello") {
        const existing = clients.get(clientId);
        const isReconnect = !!existing;

        if (isReconnect) {
          console.log(`🔄 Reconnexion de ${clientId}`);
          existing.ws.onclose = null;
          existing.ws.close();
          existing.controller?.shutdown?.();
          clients.delete(clientId);
        } else {
          console.log(`🆕 Nouveau client ${clientId}`);
        }

        const controller = new RoverController(model, view, ws);
        clients.set(clientId, { ws, controller, ip, phidgetConn: null });

        ws.send(JSON.stringify({ type: "rover_connected", reconnect: isReconnect }));

        // --- Si Phidget déjà connecté, renvoyer le statut ---
        if (savedPhidgetConn) {
          console.log(`ℹ️ Connexion Phidget existante détectée, envoi du statut au client`);
          clients.get(clientId).phidgetConn = savedPhidgetConn;
          ws.send(JSON.stringify({ type: "phidget_status", status: "connected" }));
        }

        return;
      }

      if (data.type === "connect_phidget") {
        const ip = data.ip || "10.18.1.126";
        const port = data.port || 5661;

        console.log(`🔌 Le client ${clientId} tente de se connecter au Phidget Hub ${ip}:${port}`);
        ws.send(JSON.stringify({ type: "log", message: `Client ${clientId} se connecte au Phidget Hub ${ip}:${port}` }));

        const existing = clients.get(clientId);

        try {
          // Toujours se reconnecter si aucune connexion valide
          const conn = await connectPhidget(model, ip, port);
          if (conn) {
            existing.phidgetConn = conn;
            ws.send(JSON.stringify({ type: "phidget_status", status: "connected" }));
            // Sauvegarder la connexion pour les futures connexions
            await savePhidgetData(ip, port);
          } else {
            ws.send(JSON.stringify({ type: "phidget_status", status: "error", message: "Échec de la connexion" }));
          }
        } catch (err) {
          console.error("❌ Échec de la connexion Phidget :", err);
          ws.send(JSON.stringify({ type: "phidget_status", status: "error", message: err.message }));
        }
      }
    });

    ws.on("close", () => {
      console.log("⚠️ Connexion WS fermée");
      for (const [id, entry] of clients.entries()) {
        if (entry.ws === ws) {
          console.log(`❌ Client ${id} déconnecté`);
          clients.delete(id);
          break;
        }
      }
    });

    ws.on("error", (err) => {
      console.error("❌ Erreur WebSocket :", err);
    });
  });
}

main();
