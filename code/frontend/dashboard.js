document.addEventListener("DOMContentLoaded", () => {
    // --- Éléments de l'interface utilisateur (UI) ---
    const backendStatusText = document.getElementById("backend-connection-status");
    const backendDot = document.getElementById("backend-dot");
    const connectBackendBtn = document.getElementById("connect-backend-btn");
    const wsUrlInput = document.getElementById("ws-url");

    const phidgetCard = document.getElementById("phidget-card");
    const phidgetLockMsg = document.getElementById("backend-required-msg");
    const phidgetForm = document.getElementById("phidget-form");
    const phidgetStatusText = document.getElementById("phidget-connection-status");
    const phidgetDot = document.getElementById("phidget-dot");

    let ws = null;
    let backendReady = false;
    let phidgetReady = false; // Suivi de l'état de la connexion au Phidget

    // --- Gestion de l'ID client ---
    const CLIENT_ID_KEY = "rover-client-id";
    function getClientId() {
        let id = localStorage.getItem(CLIENT_ID_KEY);
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem(CLIENT_ID_KEY, id);
        }
        return id;
    }
    const clientId = getClientId();

    // --- Mise à jour de l'état de l'UI ---
    function updateBackendUI(state) {
        // state peut être : 'disconnected', 'connecting', 'connected'

        if (state === 'connecting') {
            backendStatusText.textContent = "Connexion en cours...";
            backendDot.className = "h-2 w-2 rounded-full bg-accent-yellow animate-pulse";
            connectBackendBtn.disabled = true;
        }
        else if (state === 'connected') {
            backendReady = true;
            backendStatusText.textContent = "Serveur Backend Connecté";
            backendDot.className = "h-2 w-2 rounded-full bg-primary"; // Passe au vert
            connectBackendBtn.disabled = true;
            connectBackendBtn.classList.add("opacity-50", "cursor-not-allowed");

            // Déverrouille la carte matérielle Phidget
            phidgetCard.classList.remove("opacity-50", "pointer-events-none", "grayscale-[0.5]");
            phidgetLockMsg.classList.add("hidden");
        }
        else {
            backendReady = false;
            backendStatusText.textContent = "Serveur Backend Déconnecté";
            backendDot.className = "h-2 w-2 rounded-full bg-accent-red"; // Passe au rouge
            connectBackendBtn.disabled = false;
            connectBackendBtn.classList.remove("opacity-50", "cursor-not-allowed");

            // Verrouille la carte matérielle Phidget
            phidgetCard.classList.add("opacity-50", "pointer-events-none", "grayscale-[0.5]");
            phidgetLockMsg.classList.remove("hidden");
        }
    }

    // --- Logique WebSocket ---
    connectBackendBtn.addEventListener("click", () => {
        const url = wsUrlInput.value.trim() || "ws://localhost:8080";

        updateBackendUI('connecting');

        ws = new WebSocket(url);

        ws.onopen = () => {
            console.log("WS ouvert : Envoi de Hello");
            ws.send(JSON.stringify({ type: "hello", clientId }));
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                console.log("Message reçu :", msg);

                // Vérifie si le backend est prêt
                if (msg.type === "rover_connected") {
                    updateBackendUI('connected');
                }

                // Vérifie l'état de la connexion au Phidget
                if (msg.type === "phidget_status") {
                    if (msg.status === "connected") {
                        phidgetStatusText.textContent = "Serveur Réseau Phidget Connecté";
                        phidgetDot.className = "h-2 w-2 rounded-full bg-primary";
                        phidgetReady = true;

                        // Redirection automatique vers le tableau de bord principal
                        if (backendReady && phidgetReady) {
                            setTimeout(() => {
                                window.location.href = "./html/switchDevice.html";  // Redirection vers le tableau de bord
                            }, 1); // Délai d'une milliseconde avant redirection
                        }
                    } else {
                        phidgetStatusText.textContent = "Serveur Réseau Phidget Déconnecté";
                        phidgetDot.className = "h-2 w-2 rounded-full bg-accent-red";
                    }
                }
            } catch (err) {
                console.error("Erreur lors du parsing du message :", err);
            }
        };

        ws.onclose = () => {
            updateBackendUI('disconnected');
        };

        ws.onerror = (err) => {
            console.error("Erreur WS :", err);
            updateBackendUI('disconnected');
        };
    });

    // --- Connexion matérielle Phidget ---
    phidgetForm.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!backendReady || !ws) return;

        const ip = document.getElementById("ip-address").value.trim();
        const port = document.getElementById("port").value.trim() || 5661;

        ws.send(JSON.stringify({
            type: "connect_phidget",
            clientId,
            ip,
            port: Number(port)
        }));
    });
});
