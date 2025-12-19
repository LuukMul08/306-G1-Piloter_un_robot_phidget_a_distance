import RoverController from './RoverController.js';

// =======================
// Elements
// =======================
const logEl = document.getElementById('log');
const connBadge = document.getElementById('connBadge');
const connectBtn = document.getElementById('connectBtn');
const toggleInputBtn = document.getElementById('toggleInputBtn');

const driveVal = document.getElementById('driveVal');
const steerVal = document.getElementById('steerVal');

const joystickPanel = document.querySelector('.joystick-panel');
const dpad = document.querySelector('.dpad');
const stopBtn = document.getElementById('stopBtn');

// =======================
// State
// =======================
let connected = false;
let inputMode = 'keyboard'; // 'keyboard' ou 'phone'

// =======================
// Rover Controller
// =======================
const rover = new RoverController();

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
        rover.ws = new WebSocket("ws://localhost:8080");

        rover.ws.onopen = () => {
            connected = true;
            connBadge.textContent = "🔌 Connecté";
            connBadge.classList.add('connected');
            setControlsEnabled(true);
            connectBtn.textContent = "Déconnecter";
            log("Rover connecté !");
        };

        rover.ws.onclose = () => {
            connected = false;
            connBadge.textContent = "🔌 Déconnecté";
            connBadge.classList.remove('connected');
            setControlsEnabled(false);
            connectBtn.textContent = "Connexion";
            log("Rover déconnecté !");
        };

        rover.ws.onerror = err => {
            log("⚠️ Erreur WebSocket");
            console.warn("WebSocket error:", err);
        };
    } else {
        rover.ws.close();
    }
});

// =======================
// Drive Slider
// =======================
const driveSlider = document.createElement('input');
driveSlider.type = 'range';
driveSlider.id = 'driveSlider';
driveSlider.min = -1;
driveSlider.max = 1;
driveSlider.step = 0.01;
driveSlider.value = 0;
driveSlider.style.width = '280px';

// Remplace le joystick Drive par le slider
const driveWrap = joystickPanel.querySelector('.joystick-wrap');
driveWrap.innerHTML = '<div class="label">Drive</div>';
driveWrap.appendChild(driveSlider);

driveSlider.addEventListener('input', () => {
    const value = parseFloat(driveSlider.value);
    driveVal.textContent = value.toFixed(2);

    if (connected && rover.ws.readyState === WebSocket.OPEN) {
        rover.ws.send(JSON.stringify({
            leftY: value,
            rightY: value,
            speedMode: rover.model.speedMode,
            stop: rover.model.stopActive
        }));
    }
});

// =======================
// Steer Joystick
// =======================
const joySteer = document.getElementById('joySteer');
const stick = joySteer.querySelector('.stick');
const r = joySteer.clientWidth / 2;

joySteer.addEventListener('mousedown', e => {
    if (!connected) return;
    const rect = joySteer.getBoundingClientRect();

    function move(ev) {
        let x = ev.clientX - rect.left - r;
        let y = ev.clientY - rect.top - r;
        const d = Math.hypot(x, y);
        if (d > r) { x *= r / d; y *= r / d }
        stick.style.transform = `translate(${x}px,${y}px)`;
        steerVal.textContent = x.toFixed(2);

        if (connected && rover.ws.readyState === WebSocket.OPEN) {
            const driveValue = parseFloat(driveSlider.value);
            rover.ws.send(JSON.stringify({
                leftY: driveValue + x / 2,
                rightY: driveValue - x / 2,
                speedMode: rover.model.speedMode,
                stop: rover.model.stopActive
            }));
        }
    }

    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', () => {
        stick.style.transform = 'translate(-50%,-50%)';
        steerVal.textContent = '0.00';
        const driveValue = parseFloat(driveSlider.value);
        if (connected && rover.ws.readyState === WebSocket.OPEN) {
            rover.ws.send(JSON.stringify({
                leftY: driveValue,
                rightY: driveValue,
                speedMode: rover.model.speedMode,
                stop: rover.model.stopActive
            }));
        }
        document.removeEventListener('mousemove', move);
    }, { once: true });
});

// =======================
// D-Pad
// =======================
document.querySelectorAll('.dpad button[data-dir]').forEach(b => {
    b.addEventListener('mousedown', () => {
        if (connected && rover.ws.readyState === WebSocket.OPEN) {
            log('D-Pad ' + b.dataset.dir);
            // Exemple: envoyer direction
            rover.ws.send(JSON.stringify({ dpad: b.dataset.dir }));
        }
    });
    b.addEventListener('mouseup', () => {
        if (connected && rover.ws.readyState === WebSocket.OPEN) {
            log('D-Pad stop');
            rover.ws.send(JSON.stringify({ dpad: 'stop' }));
        }
    });
});

// =======================
// Emergency Stop
// =======================
stopBtn.addEventListener('click', () => {
    if (connected && rover.ws.readyState === WebSocket.OPEN) {
        rover.ws.send(JSON.stringify({ stop: true }));
        log("STOP ! 🚨");
    }
});

// =======================
// Input Mode (Clavier / Phone)
// =======================
function updateInputModeUI() {
    if (inputMode === 'keyboard') {
        joystickPanel.classList.add('hidden');
        dpad.classList.remove('hidden');
    } else {
        joystickPanel.classList.remove('hidden');
        dpad.classList.add('hidden');
    }
}

updateInputModeUI();

toggleInputBtn.addEventListener('click', () => {
    if (inputMode === 'keyboard') {
        inputMode = 'phone';
        toggleInputBtn.textContent = 'Phone';
        log("Mode Phone activé");
    } else {
        inputMode = 'keyboard';
        toggleInputBtn.textContent = 'Clavier';
        log("Mode Clavier activé");
    }
    updateInputModeUI();
});

// =======================
// Initial state
// =======================
setControlsEnabled(false);
