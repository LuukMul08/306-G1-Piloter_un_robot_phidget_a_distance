// --- SPEED MODES ---
let speedMode = 2;  // 1=30%, 2=60%, 3=100%
const speedFactors = {1: 0.30, 2: 0.60, 3: 1.00};
let speedLock = false;           // true wenn wir auf 30% fixieren
let prevSpeedMode = speedMode;   // Merkt SpeedMode vor dem Lock

// --- DISTANCE SENSOR ---
let distance = null;
const minDistanceBlock = 300; // mm, unterhalb dessen Vorwärts blockiert wird
const minDistanceSlow = 1000; // mm, ab hier Geschwindigkeit auf 30% fixiert

// --- GAMEPAD LOOP ---
function sendControllerData() {
  const gp = navigator.getGamepads()[0];
  if (!gp) {
    status.textContent = "⏳ Waiting for controller...";
    requestAnimationFrame(sendControllerData);
    return;
  }

  // --- BUTTONS ---
  const btnA = gp.buttons[0]?.pressed;
  const btnY = gp.buttons[3]?.pressed;
  const btnX = gp.buttons[2]?.pressed;
  const btnLT = gp.buttons[6]?.value || 0;
  const btnRT = gp.buttons[7]?.value || 0;

  // --- HANDLE STOP TOGGLE ---
  if (btnX && !lastBtnX) stopActive = !stopActive;
  lastBtnX = btnX;

  // --- SPEED CONTROL (Debounce) ---
  if (btnY && !lastBtnY && !speedLock) speedMode = Math.min(3, speedMode + 1);
  if (btnA && !lastBtnA && !speedLock) speedMode = Math.max(1, speedMode - 1);
  lastBtnA = btnA;
  lastBtnY = btnY;

  // --- Speed Lock aufgrund Distanz ---
  if (distance !== null) {
    if (distance < minDistanceSlow && distance >= minDistanceBlock) {
      if (!speedLock) {
        // Wir kommen in die 100 cm Zone → vorherigen Speed merken
        prevSpeedMode = speedMode;
        speedLock = true;
        speedMode = 1; // fix auf 30%
      }
    } else if (distance >= minDistanceSlow) {
      // Zone verlassen → vorherige Geschwindigkeit wiederherstellen
      if (speedLock) {
        speedLock = false;
        speedMode = prevSpeedMode;
      }
    }
  }

  const factor = speedFactors[speedMode];

  // --- STICKS ---
  const stickLeftY  = -applyDeadzone(gp.axes[1]);
  const stickRightX = applyDeadzone(gp.axes[2]);

  // --- AUTO-DRIVE MIXING ---
  let forward = stickLeftY;

  // RT/LT Steuerung
  if (btnRT > 0 && btnLT === 0) forward = btnRT;
  else if (btnLT > 0 && btnRT === 0) forward = -btnLT;
  else if (btnRT > 0 && btnLT > 0) forward = 0;

  // --- Vorwärts blockieren unter minDistanceBlock ---
  if (distance !== null && distance < minDistanceBlock && forward > 0) {
    forward = 0;
  }

  let leftMotor  = clamp((forward + stickRightX) * factor, -1, 1);
  let rightMotor = clamp((forward - stickRightX) * factor, -1, 1);

  if (stopActive) {
    leftMotor = 0;
    rightMotor = 0;
  }

  // --- SEND TO SERVER ---
  const data = { leftY: leftMotor, rightY: rightMotor, speedMode, stop: stopActive };
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));

  // --- UPDATE FRONTEND ---
  document.getElementById("speedMode").textContent = `Vitesse: ${speedMode} (${Math.round(factor*100)}%)${speedLock ? ' 🔒' : ''}`;
  document.getElementById("stopState").textContent = `STOP: ${stopActive ? "ON" : "OFF"}`;
  document.getElementById("stickValues").textContent = `Drive: ${forward.toFixed(2)} | Steer: ${stickRightX.toFixed(2)}`;
  document.getElementById("battery").textContent = distance !== null ? `Distanz: ${(distance/10).toFixed(1)} cm` : `Distanz: --`;

  requestAnimationFrame(sendControllerData);
}
