const status = document.getElementById("status");
const ws = new WebSocket("ws://localhost:8080");

// --- SPEED MODES -------------------------------------------------
let speedMode = 2;  // 1=30%, 2=60%, 3=100%
const speedFactors = {1: 0.30, 2: 0.60, 3: 1.00};

// --- STOP STATE --------------------------------------------------
let stopActive = false;

// --- CLAMP FUNCTION ---------------------------------------------
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// --- DEADZONE FUNCTION ------------------------------------------
function applyDeadzone(v, dz = 0.12) {
  return (v === undefined || Math.abs(v) < dz) ? 0 : v;
}

// --- WEBSOCKET CONNECTED ----------------------------------------
ws.onopen = () => console.log("✅ WebSocket connected");

// --- GAMEPAD LOOP -----------------------------------------------
function sendControllerData() {
  const gp = navigator.getGamepads()[0];
  if (!gp) {
    status.textContent = "⏳ Waiting for controller...";
    requestAnimationFrame(sendControllerData);
    return;
  }

  status.textContent = `🎮 Controller connected: ${gp.id}`;

  // --- BUTTONS ---------------------------------------------------
  const btnA = gp.buttons[0]?.pressed; // Speed down
  const btnB = gp.buttons[1]?.pressed; // optional
  const btnX = gp.buttons[2]?.pressed; // STOP
  const btnY = gp.buttons[3]?.pressed; // Speed up

  // --- HANDLE STOP ------------------------------------------------
  if (btnX && !stopActive) {
    stopActive = true;
    console.log("🛑 STOP!");
  }

  // Release STOP when sticks neutral
  const stickLeftY  = applyDeadzone(gp.axes[1]); // Gas/Bremse
  const stickRightX = applyDeadzone(gp.axes[2] ?? gp.axes[0] ?? 0); // Lenken
  if (stopActive && stickLeftY === 0 && stickRightX === 0) {
    stopActive = false;
    console.log("▶ STOP RELEASED");
  }

  // --- SPEED CONTROL ---------------------------------------------
  if (btnY) speedMode = Math.min(3, speedMode + 1);
  if (btnA) speedMode = Math.max(1, speedMode - 1);
  const factor = speedFactors[speedMode];

  // --- AUTO-DRIVE MIXING -----------------------------------------
  // Nicht invertiert: left = drive + steer, right = drive - steer
  let drive = stickLeftY;  
  let steer = stickRightX; 

  let leftMotor  = clamp((drive + steer) * factor, -1, 1);
  let rightMotor = clamp((drive - steer) * factor, -1, 1);

  if (stopActive) {
    leftMotor = 0;
    rightMotor = 0;
  }

  const data = {
    leftY: leftMotor,
    rightY: rightMotor,
    speedMode: speedMode,
    stop: stopActive
  };

  // --- SEND TO SERVER --------------------------------------------
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }

  requestAnimationFrame(sendControllerData);
}

// --- START LOOP -------------------------------------------------
window.addEventListener("gamepadconnected", () => {
  console.log("🎮 Controller connected!");
  sendControllerData();
});
