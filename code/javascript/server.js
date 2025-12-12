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

  // --- Batterie-Sensor konfigurieren ---
  const batterySensor = new phidget22.VoltageInput();
  batterySensor.setIsRemote(true);
  batterySensor.setDeviceSerialNumber(667784);
  batterySensor.setHubPort(1); // Port des Batterie-Sensors
  try {
    await batterySensor.open(10000);
    console.log('✅ Batteriesensor bereit');
  } catch (err) {
    console.error('❌ Fehler beim Öffnen des Batteriesensors:', err);
    process.exit(1);
  }

  // --- CTRL+C ---
  process.on('SIGINT', async () => {
    console.log('🛑 Motoren und Sensoren herunterfahren...');
    await motorLeft.close();
    await motorRight.close();
    await batterySensor.close();
    process.exit();
  });

  // --- Hilfsfunktion zum Clampen ---
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

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

    ws.on('message', async message => {
      const now = Date.now();
      if (now - lastUpdate < updateInterval) return;
      lastUpdate = now;

      try {
        const data = JSON.parse(message.toString());

        // --- Nothalt ---
        if (data.stop === true) {
          motorLeft.setTargetVelocity(0);
          motorRight.setTargetVelocity(0);
          return;
        }

        // --- Motorwerte clampen ---
        const speedLeft = clamp(data.leftY || 0, -1, 1);
        const speedRight = clamp(data.rightY || 0, -1, 1);

        // --- Motoren setzen ---
        motorLeft.setTargetVelocity(speedLeft);
        motorRight.setTargetVelocity(speedRight);

        // --- Batterie auslesen ---
        let batteryVoltage = 0;
        try {
          batteryVoltage = await batterySensor.getVoltage();
        } catch (err) {
          console.warn('⚠️ Fehler beim Auslesen des Batteriestands:', err);
        }

        // --- Daten an Client zurücksenden ---
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ battery: batteryVoltage }));
        }

      } catch (err) {
        console.error('❌ Fehler beim Verarbeiten der WS-Nachricht:', err);
      }
    });
  });
}

// --- Server starten ---
main();
