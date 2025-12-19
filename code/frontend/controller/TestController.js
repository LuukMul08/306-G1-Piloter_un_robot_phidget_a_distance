import RoverController from './RoverController.js';

// =======================
// Elements
// =======================
const logEl = document.getElementById('log');
const connBadge = document.getElementById('connBadge');
const connectBtn = document.getElementById('connectBtn');

const driveVal = document.getElementById('driveVal');
const steerVal = document.getElementById('steerVal');

const joystickPanel = document.querySelector('.joystick-panel');
const dpad = document.querySelector('.dpad');
const stopBtn = document.getElementById('stopBtn');

// =======================
// State
// =======================
let connected = false;

// =======================
// Rover Controller
// =======================
const rover = new RoverController();

// Reflect connection changes in UI
rover.onConnectChange = (state) => {
  connected = state === 'connected';
  if (connected) {
    connBadge.textContent = "Connecté";
    connBadge.classList.add('connected');
    connBadge.classList.remove('disconnected');
    setControlsEnabled(true);
    connectBtn.textContent = "Déconnecter";
    log("Connecté au serveur WebSocket");
  } else {
    connBadge.textContent = "Déconnecté";
    connBadge.classList.remove('connected');
    connBadge.classList.add('disconnected');
    setControlsEnabled(false);
    connectBtn.textContent = "Connexion";
    log("Déconnecté du serveur WebSocket");
  }
};

// Mirror gamepad axes on the UI joysticks
const joyDrive = document.getElementById('joyDrive');
const joySteer = document.getElementById('joySteer');
const stickDrive = joyDrive.querySelector('.stick');
const stickSteer = joySteer.querySelector('.stick');

// Metrics for visual range
let metrics = {
  drive: { radius: 0, knobR: 0, maxR: 0, rect: null },
  steer: { radius: 0, knobR: 0, maxR: 0, rect: null },
};

function recalcMetrics() {
  // Drive
  metrics.drive.rect = joyDrive.getBoundingClientRect();
  metrics.drive.radius = metrics.drive.rect.width / 2;
  metrics.drive.knobR = stickDrive.getBoundingClientRect().width / 2;
  metrics.drive.maxR = Math.max(1, metrics.drive.radius - metrics.drive.knobR);

  // Steer
  metrics.steer.rect = joySteer.getBoundingClientRect();
  metrics.steer.radius = metrics.steer.rect.width / 2;
  metrics.steer.knobR = stickSteer.getBoundingClientRect().width / 2;
  metrics.steer.maxR = Math.max(1, metrics.steer.radius - metrics.steer.knobR);
}
recalcMetrics();
window.addEventListener('resize', recalcMetrics);

// Update visuals from gamepad values
rover.onAxesUpdate = ({ forward, steer }) => {
  // numbers -1..1
  driveVal.textContent = forward.toFixed(2);
  steerVal.textContent = steer.toFixed(2);

  const dy = -forward * metrics.drive.maxR;
  const dx = steer * metrics.steer.maxR;

  // keep -50% centering and add offsets
  stickDrive.style.transform = `translate(calc(-50% + 0px), calc(-50% + ${dy}px))`;
  stickSteer.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + 0px))`;
};

// =======================
// Logging
// =======================
function log(msg) {
  logEl.textContent = `${new Date().toLocaleTimeString()} ${msg}\n` + logEl.textContent;
  logEl.scrollTop = 0;
}

// =======================
// Activer / désactiver les contrôles
// =======================
function setControlsEnabled(enabled) {
  document.querySelectorAll('.dpad button').forEach(btn => {
    btn.disabled = !enabled || btn.classList.contains('center');
    btn.style.opacity = (!enabled || btn.classList.contains('center')) ? '0.5' : '1';
    btn.style.cursor = btn.disabled ? 'not-allowed' : 'pointer';
  });

  document.querySelectorAll('.joystick-wrap').forEach(wrap => {
    wrap.style.pointerEvents = enabled ? 'auto' : 'none';
    wrap.style.opacity = enabled ? '1' : '0.5';
    wrap.style.cursor = enabled ? 'grab' : 'not-allowed';
  });

  stopBtn.disabled = !enabled;
  stopBtn.style.opacity = enabled ? '1' : '0.5';
  stopBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
}

// =======================
// Connexion / Déconnexion
// =======================
connectBtn.addEventListener('click', () => {
  if (!connected) {
    rover.connect("ws://localhost:8080");
  } else {
    rover.disconnect();
  }
});

// =======================
// Touch Joysticks (manual drag)
// =======================
let curDrive = 0; // -1..1
let curSteer = 0; // -1..1
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function sendAxes() {
  if (connected && rover.ws && rover.ws.readyState === WebSocket.OPEN) {
    const left = clamp(curDrive + curSteer / 2, -1, 1);
    const right = clamp(curDrive - curSteer / 2, -1, 1);
    rover.ws.send(JSON.stringify({
      leftY: left,
      rightY: right,
      speedMode: rover.model.speedMode,
      stop: rover.model.stopActive
    }));
  }
}

function attachJoystick(joyEl, stickEl, axis) {
  let rect, radius, knobR, maxR;

  function recalc() {
    rect = joyEl.getBoundingClientRect();
    radius = rect.width / 2;
    knobR = stickEl.getBoundingClientRect().width / 2;
    maxR = Math.max(1, radius - knobR);
  }

  function onPointerMove(ev) {
    const x = ev.clientX - rect.left - radius;
    const y = ev.clientY - rect.top - radius;
    const d = Math.hypot(x, y);
    let dx = x, dy = y;
    if (d > maxR) { dx *= maxR / d; dy *= maxR / d; }

    stickEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    if (axis === 'drive') {
      curDrive = clamp(-dy / maxR, -1, 1);
      driveVal.textContent = curDrive.toFixed(2);
    } else {
      curSteer = clamp(dx / maxR, -1, 1);
      steerVal.textContent = curSteer.toFixed(2);
    }
    sendAxes();
  }

  function onPointerUp() {
    stickEl.style.transform = 'translate(-50%,-50%)';
    if (axis === 'drive') { curDrive = 0; driveVal.textContent = '0.00'; }
    else { curSteer = 0; steerVal.textContent = '0.00'; }
    sendAxes();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  }

  joyEl.addEventListener('pointerdown', ev => {
    if (!connected) return;
    recalc();
    joyEl.setPointerCapture(ev.pointerId);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    onPointerMove(ev);
  });

  window.addEventListener('resize', recalc);
}

attachJoystick(joyDrive, stickDrive, 'drive');
attachJoystick(joySteer, stickSteer, 'steer');

// =======================
// D-Pad
// =======================
document.querySelectorAll('.dpad button[data-dir]').forEach(b => {
  b.addEventListener('mousedown', () => {
    if (connected && rover.ws?.readyState === WebSocket.OPEN) {
      log('D-Pad ' + b.dataset.dir);
      rover.ws.send(JSON.stringify({ dpad: b.dataset.dir }));
    }
  });
  b.addEventListener('mouseup', () => {
    if (connected && rover.ws?.readyState === WebSocket.OPEN) {
      log('D-Pad stop');
      rover.ws.send(JSON.stringify({ dpad: 'stop' }));
    }
  });
});

// =======================
// Emergency Stop
// =======================
stopBtn.addEventListener('click', () => {
  if (connected && rover.ws?.readyState === WebSocket.OPEN) {
    rover.ws.send(JSON.stringify({ stop: true }));
    log("STOP ! 🚨");
  }
});

// =======================
// Initial state
// =======================
setControlsEnabled(false);
