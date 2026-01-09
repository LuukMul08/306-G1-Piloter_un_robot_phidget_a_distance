document.addEventListener("DOMContentLoaded", () => {
    // --- UI Elements ---
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
    let phidgetReady = false; // Track whether the Phidget connection is successful

    // --- Client ID Management ---
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

    // --- UI State Updates ---
    function updateBackendUI(state) {
        // state can be: 'disconnected', 'connecting', 'connected'

        if (state === 'connecting') {
            backendStatusText.textContent = "Connecting...";
            backendDot.className = "h-2 w-2 rounded-full bg-accent-yellow animate-pulse";
            connectBackendBtn.disabled = true;
        }
        else if (state === 'connected') {
            backendReady = true;
            backendStatusText.textContent = "Backend Server Connected";
            backendDot.className = "h-2 w-2 rounded-full bg-primary"; // Switch to Green
            connectBackendBtn.disabled = true;
            connectBackendBtn.classList.add("opacity-50", "cursor-not-allowed");

            // Unlock Phidget Hardware Card
            phidgetCard.classList.remove("opacity-50", "pointer-events-none", "grayscale-[0.5]");
            phidgetLockMsg.classList.add("hidden");
        }
        else {
            backendReady = false;
            backendStatusText.textContent = "Backend Server Disconnected";
            backendDot.className = "h-2 w-2 rounded-full bg-accent-red"; // Switch to Red
            connectBackendBtn.disabled = false;
            connectBackendBtn.classList.remove("opacity-50", "cursor-not-allowed");

            // Lock Phidget Hardware Card
            phidgetCard.classList.add("opacity-50", "pointer-events-none", "grayscale-[0.5]");
            phidgetLockMsg.classList.remove("hidden");
        }
    }

    // --- WebSocket Logic ---
    connectBackendBtn.addEventListener("click", () => {
        const url = wsUrlInput.value.trim() || "ws://localhost:8080";

        updateBackendUI('connecting');

        ws = new WebSocket(url);

        ws.onopen = () => {
            console.log("WS Open: Sending Hello");
            ws.send(JSON.stringify({ type: "hello", clientId }));
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                console.log("Message received:", msg);

                // Logic to confirm the backend is ready
                if (msg.type === "rover_connected") {
                    updateBackendUI('connected');
                }

                if (msg.type === "phidget_status") {
                    if (msg.status === "connected") {
                        phidgetStatusText.textContent = "Phidget Network Server Connected";
                        phidgetDot.className = "h-2 w-2 rounded-full bg-primary";
                        phidgetReady = true;

                        // Auto-redirect to main dashboard once both connections are successful
                        if (backendReady && phidgetReady) {
                            setTimeout(() => {
                                window.location.href = "./html/switchDevice.html";  // Redirect to the main dashboard
                            }, 1); // Delay 1 second before redirect
                        }
                    } else {
                        phidgetStatusText.textContent = "Phidget Network Server Disconnected";
                        phidgetDot.className = "h-2 w-2 rounded-full bg-accent-red";
                    }
                }
            } catch (err) {
                console.error("Error parsing message:", err);
            }
        };

        ws.onclose = () => {
            updateBackendUI('disconnected');
        };

        ws.onerror = (err) => {
            console.error("WS Error:", err);
            updateBackendUI('disconnected');
        };
    });

    // --- Phidget Hardware Connection ---
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
