const status = document.getElementById("status");
const ws = new WebSocket("ws://localhost:8080");

// --- SPEED MODES -------------------------------------------------
let speedMode = 2;  // 1=30%, 2=60%, 3=100%
const speedFactors = {1: 0.30, 2: 0.60, 3: 1.00};

// --- STOP STATE --------------------------------------------------
let stopActive = false;

ws.onopen = () => console.log("✅ WebSocket connected");

// --- DEADZONE ----------------------------------------------------
function applyDeadzone(v, dz = 0.12) {
  return Math.abs(v) < dz ? 0 : v;
}

// --- GAMEPAD LOOP ------------------------------------------------
function sendControllerData() {
  const gp = navigator.getGamepads()[0];
  if (!gp) {
    status.textContent = "⏳ Waiting for controller...";
    requestAnimationFrame(sendControllerData);
    return;
  }

  status.textContent = `🎮 Controller connected: ${gp.id}`;

  // --- BUTTONS ---------------------------------------------------
  const btnA = gp.buttons[0].pressed; // Speed down
  const btnY = gp.buttons[3].pressed; // Speed up
  const btnX = gp.buttons[2].pressed; // STOP

  // --- HANDLE STOP ------------------------------------------------
  if (btnX && !stopActive) {
    stopActive = true;
    console.log("🛑 STOP!");
  }

  // --- STICK VALUES ----------------------------------------------
  const stickLeftY  = applyDeadzone(gp.axes[1]); // Gas/Bremse
  const stickRightX = applyDeadzone(gp.axes[2] ?? gp.axes[0]); // Lenken

  if (stopActive && stickLeftY === 0 && stickRightX === 0) {
    stopActive = false;
    console.log("▶ STOP RELEASED");
  }

  // --- SPEED CONTROL ---------------------------------------------
  if (btnY) speedMode = Math.min(3, speedMode + 1);
  if (btnA) speedMode = Math.max(1, speedMode - 1);

  const factor = speedFactors[speedMode];

  // --- AUTO DRIVE MIXING -----------------------------------------
  let drive = stickLeftY;  
  let steer = stickRightX; 

  let leftMotor  = (drive + steer) * factor;
  let rightMotor = (drive - steer) * factor;

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

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }

  requestAnimationFrame(sendControllerData);
}

// --- START LOOP ---------------------------------------------------
window.addEventListener("gamepadconnected", () => {
  console.log("🎮 Controller connected!");
  sendControllerData();
});
