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

  // --- Modèle / Vue ---
  const model = new RoverModel();
  const view = new RoverView();

  // --- Arrêt propre ---
  process.on('SIGINT', async () => {
    console.log('🛑 Arrêt des moteurs...');
    await model.shutdown();
    process.exit();
  });

  // --- Connexions WebSocket ---
  wss.on('connection', ws => {
    console.log('🔗 Client WebSocket connecté');

    // --- Gestion des messages du client ---
    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        // 🔌 Connexion au hub Phidget à la demande
        if (msg.type === 'connect_phidget') {
          const { ip, port } = msg;

          console.log(`🔌 Connexion au hub Phidget ${ip}:${port}`);

          try {
            const conn = new phidget22.NetworkConnection(port, ip);

            // --- Détecte les erreurs globales de connexion ---
            conn.onError = (err) => {
              console.warn('⚠️ Phidget error:', err.message);
              ws.send(JSON.stringify({
                type: 'phidget_status',
                status: 'disconnected',
                message: err.message
              }));
            };

            // --- Détecte la perte de connexion avec le hub ---
            conn.onDisconnect = () => {
              console.warn('⚠️ Phidget disconnected');
              ws.send(JSON.stringify({
                type: 'phidget_status',
                status: 'disconnected'
              }));
            };

            // --- Connexion initiale ---
            await conn.connect();
            console.log('✅ Hub Phidget connecté');

            // --- Initialisation des moteurs et capteurs ---
            await model.initMotors(667784, 667784, 0, 1);
            await model.initDistanceSensor(667784, 0);

            // --- Surveille la déconnexion ou erreur des moteurs ---
            [model.motorLeft, model.motorRight].forEach(motor => {
              if (motor) {
                motor.onDetach = () => {
                  console.warn(`⚠️ Motor ${motor.getChannel()} detached`);
                  ws.send(JSON.stringify({ type: 'phidget_status', status: 'disconnected' }));
                };
                motor.onError = (err) => {
                  console.warn(`⚠️ Motor ${motor.getChannel()} error:`, err.message);
                  ws.send(JSON.stringify({ type: 'phidget_status', status: 'disconnected' }));
                };
              }
            });

            // --- Envoi au frontend que tout est connecté ---
            ws.send(JSON.stringify({
              type: 'phidget_status',
              status: 'connected'
            }));

          } catch (err) {
            console.error('❌ Erreur Phidget lors de la connexion :', err.message);
            ws.send(JSON.stringify({
              type: 'phidget_status',
              status: 'disconnected',
              message: err.message
            }));
          }
        }

      } catch (err) {
        console.error('❌ Message WebSocket invalide :', err);
      }
    });

    // --- Crée le contrôleur Rover pour gérer les commandes moteur ---
    new RoverController(model, view, ws);
  });
}

main();
