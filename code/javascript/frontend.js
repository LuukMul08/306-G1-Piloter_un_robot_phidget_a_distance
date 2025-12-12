const status = document.getElementById("status");
const ws = new WebSocket("ws://localhost:8080");

// --- SPEED MODES ---
let speedMode = 2;  // 1=30%, 2=60%, 3=100%
const speedFactors = {1: 0.30, 2: 0.60, 3: 1.00};

// --- STOP STATE ---
let stopActive = false;

// --- BUTTON STATE (Debounce) ---
let lastBtnA = false;
let lastBtnY = false;
let lastBtnX = false;

// --- DISTANCE SENSOR ---
let distance = null;
const minDistance = 200; // mm, unterhalb dessen Vorwärts konsequent blockiert wird

// --- CLAMP FUNCTION ---
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// --- DEADZONE FUNCTION ---
function applyDeadzone(v, dz = 0.12) {
  return (v === undefined || Math.abs(v) < dz) ? 0 : v;
}

// --- WEBSOCKET EVENTS ---
ws.onopen = () => console.log("✅ WebSocket connected");

ws.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    if (data.distance !== undefined && data.distance !== null) {
      distance = parseFloat(data.distance); // jetzt in mm
    }
  } catch (err) {
    console.warn("⚠️ Fehler beim Verarbeiten der Server-Nachricht:", err);
  }
};

// --- GAMEPAD LOOP ---
function sendControllerData() {
  const gp = navigator.getGamepads()[0];
  if (!gp) {
    status.textContent = "⏳ Waiting for controller...";
    requestAnimationFrame(sendControllerData);
    return;
  }

  status.textContent = `🎮 Controller connected: ${gp.id}`;

  // --- BUTTONS ---
  const btnA = gp.buttons[0]?.pressed; // Speed down
  const btnB = gp.buttons[1]?.pressed; // optional
  const btnX = gp.buttons[2]?.pressed; // STOP toggle
  const btnY = gp.buttons[3]?.pressed; // Speed up
  const btnLT = gp.buttons[6]?.value || 0; // analog 0-1
  const btnRT = gp.buttons[7]?.value || 0; // analog 0-1

  // --- HANDLE STOP TOGGLE ---
  if (btnX && !lastBtnX) stopActive = !stopActive;
  lastBtnX = btnX;

  // --- SPEED CONTROL (Debounce) ---
  if (btnY && !lastBtnY) speedMode = Math.min(3, speedMode + 1);
  if (btnA && !lastBtnA) speedMode = Math.max(1, speedMode - 1);
  lastBtnA = btnA;
  lastBtnY = btnY;

  const factor = speedFactors[speedMode];

  // --- STICKS ---
  const stickLeftY  = -applyDeadzone(gp.axes[1]); // Drive invertiert
  const stickRightX = applyDeadzone(gp.axes[2]);  // Steer

  // --- AUTO-DRIVE MIXING ---
  let forward = stickLeftY;

  // RT/LT Steuerung
  if (btnRT > 0 && btnLT === 0) forward = btnRT;       // nur RT → vorwärts
  else if (btnLT > 0 && btnRT === 0) forward = -btnLT; // nur LT → rückwärts
  else if (btnRT > 0 && btnLT > 0) forward = 0;        // beide → stehen bleiben

  // --- Sonar: blockiere konsequent Vorwärts ---
  if (distance !== null && distance < minDistance && forward > 0) {
    forward = 0; // alles nach vorne blockieren
  }

  let leftMotor  = clamp((forward + stickRightX) * factor, -1, 1);
  let rightMotor = clamp((forward - stickRightX) * factor, -1, 1);

  // --- STOP ---
  if (stopActive) {
    leftMotor = 0;
    rightMotor = 0;
  }

  // --- SEND TO SERVER ---
  const data = {
    leftY: leftMotor,
    rightY: rightMotor,
    speedMode: speedMode,
    stop: stopActive
  };
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));

  // --- UPDATE FRONTEND ---
  document.getElementById("speedMode").textContent = `Vitesse: ${speedMode} (${Math.round(factor*100)}%)`;
  document.getElementById("stopState").textContent = `STOP: ${stopActive ? "ON" : "OFF"}`;
  document.getElementById("stickValues").textContent = `Drive: ${forward.toFixed(2)} | Steer: ${stickRightX.toFixed(2)}`;
  document.getElementById("buttons").textContent = `Buttons: ${btnA ? "A " : ""}${btnB ? "B " : ""}${btnX ? "X " : ""}${btnY ? "Y " : ""}`.trim();
  document.getElementById("battery").textContent = distance !== null ? `Distanz: ${(distance/10).toFixed(1)} cm` : `Distanz: --`;

  requestAnimationFrame(sendControllerData);
}

// --- START LOOP ---
window.addEventListener("gamepadconnected", () => {
  console.log("🎮 Controller connected!");
  sendControllerData();
});
