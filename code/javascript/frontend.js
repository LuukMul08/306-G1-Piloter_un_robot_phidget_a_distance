const status = document.getElementById("status");
const ws = new WebSocket("ws://localhost:8080");

// --- SPEED MODES ---
let speedMode = 2;  // 1=30%, 2=60%, 3=100%
const speedFactors = {1: 0.30, 2: 0.60, 3: 1.00};
let speedLock = false;
let prevSpeedMode = speedMode;

// --- STOP STATE ---
let stopActive = false;

// --- BUTTON STATE (Debounce) ---
let lastBtnA = false;
let lastBtnY = false;
let lastBtnX = false;

// --- DISTANCE SENSOR ---
let distance = null;
const minDistanceBlock = 300; // mm
const minDistanceSlow = 1000; // mm

// --- CLAMP & DEADZONE ---
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function applyDeadzone(v, dz = 0.12) { return (v === undefined || Math.abs(v) < dz) ? 0 : v; }

// --- WEBSOCKET ---
ws.onopen = () => console.log("✅ WebSocket connected");
ws.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    if (data.distance !== undefined && data.distance !== null) distance = parseFloat(data.distance);
  } catch (err) { console.warn("⚠️ Fehler beim Verarbeiten der Server-Nachricht:", err); }
}

// --- GAMEPAD LOOP ---
function sendControllerData() {
  const gp = navigator.getGamepads()[0];
  if (!gp) { 
    status.textContent = "⏳ Waiting for controller..."; 
    requestAnimationFrame(sendControllerData); 
    return; 
  }
  status.textContent = `🎮 Controller connected: ${gp.id}`;

  const btnA = gp.buttons[0]?.pressed;
  const btnY = gp.buttons[3]?.pressed;
  const btnX = gp.buttons[2]?.pressed;
  const btnLT = gp.buttons[6]?.value || 0;
  const btnRT = gp.buttons[7]?.value || 0;

  // --- STOP TOGGLE ---
  if (btnX && !lastBtnX) stopActive = !stopActive;
  lastBtnX = btnX;

  // --- DISTANZ-LOGIK ---
  if (distance !== null) {
    if (distance < minDistanceSlow && distance >= minDistanceBlock) {
      if (!speedLock) { prevSpeedMode = speedMode; speedLock = true; }
      speedMode = 1;
    } else if (distance >= minDistanceSlow && speedLock) {
      speedMode = prevSpeedMode;
      speedLock = false;
    }
  }

  const factor = speedFactors[speedMode];

  // --- STICKS ---
  let forward = -applyDeadzone(gp.axes[1]);
  const steer = applyDeadzone(gp.axes[2]);

  if (btnRT > 0 && btnLT === 0) forward = btnRT;
  else if (btnLT > 0 && btnRT === 0) forward = -btnLT;
  else if (btnRT > 0 && btnLT > 0) forward = 0;

  // --- Blockierung Vorwärts bei zu geringer Distanz ---
  if (distance !== null && distance < minDistanceBlock && forward > 0) forward = 0;

  // --- BUTTON SPEED CONTROL ---
  if (!speedLock) {
    if (btnY && !lastBtnY) speedMode = Math.min(3, speedMode + 1);
    if (btnA && !lastBtnA) speedMode = Math.max(1, speedMode - 1);
  }
  lastBtnA = btnA;
  lastBtnY = btnY;

  // --- MOTOR OUTPUT (const bleiben!) ---
  const leftMotor = clamp((forward + steer) * factor, -1, 1);
  const rightMotor = clamp((forward - steer) * factor, -1, 1);

  // --- STOP LOGIK: nur beim Senden 0 einsetzen ---
  const sendLeft = stopActive ? 0 : leftMotor;
  const sendRight = stopActive ? 0 : rightMotor;

  // --- SEND TO SERVER ---
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ leftY: sendLeft, rightY: sendRight, speedMode, stop: stopActive }));
  }

  // --- UPDATE FRONTEND ---
  document.getElementById("speedMode").textContent = `Vitesse: ${speedMode} (${Math.round(factor*100)}%)${speedLock ? ' 🔒' : ''}`;
  document.getElementById("stopState").textContent = `STOP: ${stopActive ? "ON" : "OFF"}`;
  document.getElementById("stickValues").textContent = `Drive: ${forward.toFixed(2)} | Steer: ${steer.toFixed(2)}`;
  document.getElementById("buttons").textContent = `Buttons: ${btnA ? "A " : ""}${btnY ? "Y " : ""}${btnX ? "X " : ""}`.trim();
  document.getElementById("battery").textContent = distance !== null ? `Distanz: ${(distance/10).toFixed(1)} cm` : `Distanz: --`;

  requestAnimationFrame(sendControllerData);
}

// --- START LOOP ---
window.addEventListener("gamepadconnected", () => { 
  console.log("🎮 Controller connected!"); 
  sendControllerData(); 
});
