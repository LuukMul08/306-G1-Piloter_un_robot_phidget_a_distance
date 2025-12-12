// server.mjs
import * as phidget22 from 'phidget22';
import { WebSocketServer } from 'ws';

async function main() {
  // --- WebSocket ---
  const wss = new WebSocketServer({ port: 8080 });
  console.log('✅ WebSocket Server gestartet auf ws://localhost:8080');

  // --- Hub Verbindung ---
  const hubIP = '10.18.1.126';
  const conn = new phidget22.NetworkConnection(5661, hubIP);

  try {
    await conn.connect();
    console.log(`✅ Verbunden mit dem Hub ${hubIP}`);
  } catch (err) {
    console.error('❌ Fehler bei der Hub-Verbindung:', err);
    process.exit(1);
  }

  // --- Motoren konfigurieren ---
  const motorLeft = new phidget22.DCMotor();
  motorLeft.setIsRemote(true);
  motorLeft.setDeviceSerialNumber(667784);
  motorLeft.setHubPort(0);
  motorLeft.setChannel(0);

  const motorRight = new phidget22.DCMotor();
  motorRight.setIsRemote(true);
  motorRight.setDeviceSerialNumber(667784);
  motorRight.setHubPort(0);
  motorRight.setChannel(1);

  try {
    await motorLeft.open(10000);
    await motorRight.open(10000);
    console.log('✅ Motoren bereit');
  } catch (err) {
    console.error('❌ Fehler beim Öffnen der Motoren:', err);
    process.exit(1);
  }

  // --- CTRL+C ---
  process.on('SIGINT', async () => {
    console.log('🛑 Motoren herunterfahren...');
    await motorLeft.close();
    await motorRight.close();
    process.exit();
  });

  // --- Update-Limit ---
  let lastUpdate = 0;
  const updateInterval = 50; // 20 Hz

  // --- WebSocket Events ---
  wss.on('connection', ws => {
    console.log('🔗 WebSocket Client verbunden');

    // Bei Verbindungsverlust → Motoren stoppen
    ws.on('close', () => {
      console.log('❌ Client getrennt → Motoren stoppen');
      motorLeft.setTargetVelocity(0);
      motorRight.setTargetVelocity(0);
    });

    ws.on('message', message => {
      const now = Date.now();
      if (now - lastUpdate < updateInterval) return;
      lastUpdate = now;

      try {
        const data = JSON.parse(message.toString());

        // Erwartete Werte vom Client:
        // leftY, rightY = Mischwerte (Auto-Drive)
        // stop = true/false
        // speedMode = 1/2/3 (nur Info)

        if (data.stop === true) {
          // Sofortiger Nothalt
          motorLeft.setTargetVelocity(0);
          motorRight.setTargetVelocity(0);
          return;
        }

        // Werte direkt übernehmen (Client macht das Mixing)
        let speedLeft = data.leftY || 0;
        let speedRight = data.rightY || 0;

        // Phidgets-Motoren laufen invertiert, daher:
        motorLeft.setTargetVelocity(-speedLeft);
        motorRight.setTargetVelocity(-speedRight);

      } catch (err) {
        console.error('❌ Fehler beim Verarbeiten der WS-Nachricht:', err);
      }
    });
  });
}

// --- Server starten ---
main();
