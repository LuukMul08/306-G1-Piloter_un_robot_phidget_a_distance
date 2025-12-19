import { WebSocketServer } from 'ws';
import * as phidget22 from 'phidget22';

import RoverModel from './model/RoverModel.js';
import RoverView from './view/RoverView.js';
import RoverController from './controller/RoverController.js';

/**
 * Point d'entrée du serveur Rover.
 * Initialise le serveur WebSocket, le hub Phidget et les composants MVC.
 */
async function main() {
  // --- Serveur WebSocket ---
  const wss = new WebSocketServer({ port: 8080 });
  console.log('✅ Serveur WebSocket démarré sur ws://localhost:8080');

  // --- Connexion au hub Phidget ---
  const hubIP = '10.18.1.126';
  const conn = new phidget22.NetworkConnection(5661, hubIP);

  try {
    await conn.connect();
    console.log(`✅ Connecté au hub Phidget ${hubIP}`);
  } catch (err) {
    console.error('❌ Erreur lors de la connexion au hub :', err);
    process.exit(1);
  }

  // --- Initialisation du modèle (motors + capteur de distance) ---
  const model = new RoverModel();
  await model.initMotors(667784, 667784, 0, 1);          // Initialise les moteurs gauche et droit
  await model.initDistanceSensor(667784, 0);             // Initialise le capteur de distance

  // --- Initialisation de la vue ---
  const view = new RoverView();

  // --- Gestion du signal SIGINT (CTRL+C) pour arrêt propre ---
  process.on('SIGINT', async () => {
    console.log('🛑 Arrêt des moteurs...');
    await model.shutdown(); // Ferme moteurs et capteurs
    process.exit();
  });

  // --- Gestion des connexions WebSocket ---
  wss.on('connection', ws => {
    console.log('🔗 Client WebSocket connecté');
    new RoverController(model, view, ws); // Crée un contrôleur pour gérer la connexion
  });
}

// --- Démarrage du serveur ---
main();
