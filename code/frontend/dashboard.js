document.addEventListener("DOMContentLoaded", () => {
    // --- Éléments du DOM ---
    const backendStatusElement = document.getElementById("backend-connection-status");
    const backendDot = backendStatusElement.previousElementSibling;
    const connectBtn = document.getElementById("connect-backend-btn");
    const form = document.querySelector("form");
    const phidgetStatusElement = document.getElementById('phidget-connection-status');
    const phidgetDot = phidgetStatusElement.previousElementSibling;

    let ws = null;
    let phidgetReady = false; // Indique si le Phidget est connecté

    // --- Fonction de mise à jour du footer backend ---
    function setBackendStatus(connected) {
        backendStatusElement.textContent = connected
            ? "Backend Server Connected"
            : "Backend Server Disconnected";

        backendDot.classList.toggle("bg-primary", connected);
        backendDot.classList.toggle("bg-accent-red", !connected);

        connectBtn.disabled = connected;
        connectBtn.textContent = connected ? "Connected" : "Connect backend";
    }

    // --- Fonction de mise à jour du footer Phidget ---
    function setPhidgetStatus(status) {
        phidgetReady = status === 'connected';

        if (phidgetReady) {
            phidgetStatusElement.textContent = 'Phidget Network Server Connected';
            phidgetDot.classList.remove('bg-accent-red');
            phidgetDot.classList.add('bg-primary');
        } else {
            phidgetStatusElement.textContent = 'Phidget Network Server Disconnected';
            phidgetDot.classList.remove('bg-primary');
            phidgetDot.classList.add('bg-accent-red');
        }
    }

    // --- Connexion manuelle au backend ---
    connectBtn.addEventListener("click", () => {
        if (ws && ws.readyState === WebSocket.OPEN) return;

        backendStatusElement.textContent = "Connecting...";
        backendDot.classList.remove("bg-primary", "bg-accent-red");

        ws = new WebSocket("ws://localhost:8080");

        ws.onopen = () => {
            console.log("WebSocket connected");
            setBackendStatus(true);
        };

        ws.onclose = () => {
            console.log("WebSocket disconnected");
            setBackendStatus(false);
            setPhidgetStatus('disconnected'); // Déconnexion Phidget si backend tombe
        };

        ws.onerror = () => {
            console.log("WebSocket error");
            // onclose gère l’état
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);

                if (msg.type === 'phidget_status') {
                    setPhidgetStatus(msg.status);
                }
            } catch (err) {
                console.error('❌ Erreur en traitant le message WS :', err);
            }
        };
    });

    // --- Envoi du formulaire pour connecter le Phidget ---
    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const ipAddress = document.getElementById("ip-address").value.trim();
        const port = document.getElementById("port").value.trim() || 5661;
        const autoConnect = document.getElementById("remember-me").checked;

        if (!ws || ws.readyState !== WebSocket.OPEN) {
            alert("Backend server not connected");
            return;
        }

        const payload = {
            type: "connect_phidget",
            ip: ipAddress,
            port: Number(port),
            autoConnect: autoConnect
        };

        ws.send(JSON.stringify(payload));
        console.log("Sent to backend:", payload);
    });
});
