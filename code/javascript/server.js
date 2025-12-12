// server.mjs
import * as phidget22 from 'phidget22';
import { WebSocketServer } from 'ws';

async function main() {
  // --- WebSocket ---
  const wss = new WebSocketServer({ port: 8080 });
  console.log('✅ WebSocket Server démarré sur ws://localhost:8080');

  // --- Connexion au Hub ---
  const hubIP = '10.18.1.126'; // IP de ton Hub
  const conn = new phidget22.NetworkConnection(5661, hubIP);

  try {
    await conn.connect();
    console.log(`✅ Connecté au Hub ${hubIP}`);
  } catch (err) {
    console.error('❌ Erreur connexion Hub:', err);
    process.exit(1);
  }

  // --- Configuration moteurs ---
  const motorLeft = new phidget22.DCMotor();
  motorLeft.setIsRemote(true);
  motorLeft.setDeviceSerialNumber(667784);
  motorLeft.setHubPort(0); // HubPort exact du moteur gauche
  motorLeft.setChannel(0); // Channel exact du moteur gauche

  const motorRight = new phidget22.DCMotor();
  motorRight.setIsRemote(true);
  motorRight.setDeviceSerialNumber(667784);
  motorRight.setHubPort(0); // HubPort exact du moteur droit
  motorRight.setChannel(1); // Channel exact du moteur droit

  try {
    await motorLeft.open(10000);
    await motorRight.open(10000);
    console.log('✅ Moteurs prêts');
  } catch (err) {
    console.error('❌ Erreur ouverture moteurs:', err);
    process.exit(1);
  }

  // --- Fermeture propre au CTRL+C ---
  process.on('SIGINT', async () => {
    console.log('🛑 Fermeture moteurs...');
    await motorLeft.close();
    await motorRight.close();
    process.exit();
  });

  // --- Variables pour limiter la fréquence d'envoi ---
  let lastUpdate = 0;
  const updateInterval = 50; // en ms, 20Hz max

  // --- WebSocket Events ---
  wss.on('connection', ws => {
    console.log('🔗 Client WebSocket connecté');

    ws.on('message', message => {
      const now = Date.now();
      if (now - lastUpdate < updateInterval) return; // throttle
      lastUpdate = now;

      try {
        const data = JSON.parse(message.toString());

        const deadzone = 0.15;
        const maxSpeed = 1;

        // Contrôle moteurs uniquement
        const speedLeft = Math.abs(data.leftY) > deadzone ? data.leftY * maxSpeed : 0;
        const speedRight = Math.abs(data.rightY) > deadzone ? data.rightY * maxSpeed : 0;

        motorLeft.setTargetVelocity(speedLeft);
        motorRight.setTargetVelocity(speedRight);

      } catch (err) {
        console.error('❌ Erreur traitement message WS:', err);
      }
    });

    ws.on('close', () => console.log('❌ Client WebSocket déconnecté'));
  });
}

// --- Lancer le serveur ---
main();
