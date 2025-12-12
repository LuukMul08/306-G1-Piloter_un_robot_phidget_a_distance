function sendControllerData() {
  const gp = navigator.getGamepads()[0];
  if (!gp) {
    status.textContent = "⏳ Waiting for controller...";
    requestAnimationFrame(sendControllerData);
    return;
  }

  status.textContent = `🎮 Controller connected: ${gp.id}`;

  // --- BUTTONS ---
  const btnA = gp.buttons[0]?.pressed;
  const btnY = gp.buttons[3]?.pressed;
  const btnX = gp.buttons[2]?.pressed;
  const btnLT = gp.buttons[6]?.value || 0;
  const btnRT = gp.buttons[7]?.value || 0;

  // --- STOP TOGGLE ---
  if (btnX && !lastBtnX) stopActive = !stopActive;
  lastBtnX = btnX;

  // --- DISTANZ-LOGIK (SpeedLock) ---
  if (distance !== null) {
    if (distance < minDistanceSlow && distance >= minDistanceBlock) {
      if (!speedLock) {
        prevSpeedMode = speedMode; // vorherige Geschwindigkeit merken
        speedLock = true;
      }
      speedMode = 1; // fix auf 30%
    } else if (distance >= minDistanceSlow && speedLock) {
      speedMode = prevSpeedMode; // vorherige Geschwindigkeit wiederherstellen
      speedLock = false;
    }
  }

  const factor = speedFactors[speedMode];

  // --- STICKS ---
  let forward = -applyDeadzone(gp.axes[1]);
  const steer = applyDeadzone(gp.axes[2]);

  // RT/LT Steuerung
  if (btnRT > 0 && btnLT === 0) forward = btnRT;
  else if (btnLT > 0 && btnRT === 0) forward = -btnLT;
  else if (btnRT > 0 && btnLT > 0) forward = 0;

  // --- Vorwärts blockieren bei zu geringer Distanz ---
  if (distance !== null && distance < minDistanceBlock && forward > 0) forward = 0;

  // --- BUTTON SPEED CONTROL nur wenn nicht gesperrt ---
  if (!speedLock) {
    if (btnY && !lastBtnY) speedMode = Math.min(3, speedMode + 1);
    if (btnA && !lastBtnA) speedMode = Math.max(1, speedMode - 1);
  }
  lastBtnA = btnA;
  lastBtnY = btnY;

  // --- MOTOR OUTPUT ---
  let leftMotor = clamp((forward + steer) * factor, -1, 1);
  let rightMotor = clamp((forward - steer) * factor, -1, 1);

  // STOP-Knopf überschreibt alles
  if (stopActive) {
    leftMotor = 0;
    rightMotor = 0;
  }

  // --- SEND TO SERVER ---
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      leftY: leftMotor,
      rightY: rightMotor,
      speedMode,
      stop: stopActive
    }));
  }

  // --- UPDATE FRONTEND ---
  document.getElementById("speedMode").textContent = `Vitesse: ${speedMode} (${Math.round(factor*100)}%)${speedLock ? ' 🔒' : ''}`;
  document.getElementById("stopState").textContent = `STOP: ${stopActive ? "ON" : "OFF"}`;
  document.getElementById("stickValues").textContent = `Drive: ${forward.toFixed(2)} | Steer: ${steer.toFixed(2)}`;
  document.getElementById("buttons").textContent = `Buttons: ${btnA ? "A " : ""}${btnY ? "Y " : ""}${btnX ? "X " : ""}`.trim();
  document.getElementById("battery").textContent = distance !== null ? `Distanz: ${(distance/10).toFixed(1)} cm` : `Distanz: --`;

  requestAnimationFrame(sendControllerData);
}
