// server.mjs
import * as phidget22 from 'phidget22';
import { WebSocketServer } from 'ws';

async function main() {
  const wss = new WebSocketServer({ port: 8080 });
  console.log('✅ WebSocket Server gestartet auf ws://localhost:8080');

  // Phidget‑Hub Verbindung
  const hubIP = '10.18.1.126';
  const conn = new phidget22.NetworkConnection(5661, hubIP);
  try {
    await conn.connect();
    console.log(`✅ Verbunden mit dem Hub ${hubIP}`);
  } catch (err) {
    console.error('❌ Fehler bei der Hub‑Verbindung:', err);
    process.exit(1);
  }

  // Motoren konfigurieren
  const motorLeft = new phidget22.DCMotor();
  motorLeft.setIsRemote(true);
  motorLeft.setDeviceSerialNumber(667784);
  motorLeft.setChannel(0);

  const motorRight = new phidget22.DCMotor();
  motorRight.setIsRemote(true);
  motorRight.setDeviceSerialNumber(667784);
  motorRight.setChannel(1);

  try {
    await motorLeft.open(10000);
    await motorRight.open(10000);
    console.log('✅ Motoren bereit');
  } catch (err) {
    console.error('❌ Fehler beim Öffnen der Motoren:', err);
    process.exit(1);
  }

  // Batt sensor (VoltageInput)
  const batterySensor = new phidget22.VoltageInput();
  batterySensor.setIsRemote(true);
  batterySensor.setDeviceSerialNumber(667784);

  // ⚠️ Hier nur Channel statt HubPort
  batterySensor.setChannel(2); // Beispiel: Anschluss an Kanal 2

  try {
    await batterySensor.open(10000);
    console.log('✅ Batteriesensor bereit (VoltageInput)');
  } catch (err) {
    console.error('⚠️ Keine Batterie‑Messung: VoltInput nicht gefunden oder Kanal falsch', err);
  }

  // CTRL+C Cleanup
  process.on('SIGINT', async () => {
    console.log('🛑 Motoren und Sensoren herunterfahren...');
    await motorLeft.close();
    await motorRight.close();
    try { await batterySensor.close(); } catch {}
    process.exit();
  });

  // clamp‑Helper
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  let lastUpdate = 0;
  const updateInterval = 50;

  wss.on('connection', ws => {
    console.log('🔗 WebSocket Client verbunden');

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

        // Stop
        if (data.stop) {
          motorLeft.setTargetVelocity(0);
          motorRight.setTargetVelocity(0);
        } else {
          const speedLeft  = clamp(data.leftY  || 0, -1, 1);
          const speedRight = clamp(data.rightY || 0, -1, 1);

          motorLeft.setTargetVelocity(speedLeft);
          motorRight.setTargetVelocity(speedRight);
        }

        // Battery reading
        let batteryVoltage = null;
        try {
          batteryVoltage = batterySensor.getVoltage();
        } catch (err) {
          // Sensor vielleicht nicht vorhanden
        }

        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ battery: batteryVoltage }));
        }

      } catch (err) {
        console.error('❌ Fehler beim Verarbeiten der WS‑Nachricht:', err);
      }
    });
  });
}

main();
