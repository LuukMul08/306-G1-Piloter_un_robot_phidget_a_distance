import { WebSocketServer } from "ws";
import * as phidget22 from "phidget22";

import RoverModel from "./model/RoverModel.js";
import RoverView from "./view/RoverView.js";
import RoverController from "./controller/RoverController.js";

const PORT = 8080;
const HUB_IP = "10.18.1.126";
const clients = new Map(); // clientId -> { ws, controller }

async function main() {
  const wss = new WebSocketServer({ port: PORT, host: "0.0.0.0" });
  console.log(`✅ WebSocket Server läuft auf ws://localhost:${PORT}`);

  const conn = new phidget22.NetworkConnection(5661, HUB_IP);
  await conn.connect();
  console.log(`✅ Verbunden mit Phidget Hub ${HUB_IP}`);

  const model = new RoverModel();
  await model.initMotors(667784, 667784, 0, 1);
  await model.initDistanceSensor(667784, 0);

  const view = new RoverView();

  process.on("SIGINT", async () => {
    console.log("🛑 Shutdown...");
    await model.shutdown();
    process.exit();
  });

  wss.on("connection", ws => {
    console.log("🔗 WS connected");

    ws.on("message", msg => {
      let data;
      try {
        data = JSON.parse(msg);
      } catch {
        return;
      }

      if (data.type === "hello") {
        const { clientId } = data;
        const existing = clients.get(clientId);
        const isReconnect = !!existing;

        if (isReconnect) {
          console.log(`🔄 Reconnect von ${clientId}`);
          // Alte Verbindung sauber schließen
          existing.ws.close();
          // Alten Controller ggf. stoppen
          existing.controller?.shutdown?.();
        } else {
          console.log(`🆕 Neuer Client ${clientId}`);
        }

        // Neues WS & Controller speichern
        const controller = new RoverController(model, view, ws);
        clients.set(clientId, { ws, controller });

        ws.send(JSON.stringify({
          type: "rover_connected",
          reconnect: isReconnect,
        }));
      }
    });

    ws.on("close", () => {
      for (const [id, entry] of clients.entries()) {
        if (entry.ws === ws) {
          clients.delete(id);
          console.log(`❌ Client ${id} getrennt`);
          model.stopAll?.();
          break;
        }
      }
    });
  });
}

main();
