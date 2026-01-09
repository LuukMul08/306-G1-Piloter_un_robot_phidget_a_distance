document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector("form");
    const ws = new WebSocket("ws://localhost:8080");

    const backendStatusElement = document.getElementById("connection-status");

    ws.onopen = () => {
        backendStatusElement.textContent = "Backend Server Connected";
        backendStatusElement.className = "text-green-500";
    };

    ws.onclose = () => {
        backendStatusElement.textContent = "Backend Server Disconnected";
        backendStatusElement.className = "text-red-500";
    };

    ws.onerror = () => {
        backendStatusElement.textContent = "Backend Server Error";
        backendStatusElement.className = "text-red-500";
        console.error("WebSocket error occurred.");
    };

    ws.onmessage = event => {
        const data = JSON.parse(event.data);
        if (data.status === "success") {
            backendStatusElement.textContent = data.message;
            backendStatusElement.className = "text-green-500";
        } else {
            backendStatusElement.textContent = data.message;
            backendStatusElement.className = "text-red-500";
        }
    };

    form.addEventListener("submit", event => {
        event.preventDefault();

        const ipAddress = document.getElementById("ip-address").value.trim();
        const port = document.getElementById("port").value.trim() || 5661;

        if (!ipAddress || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ipAddress)) {
            alert("Please enter a valid IP address.");
            return;
        }
        if (isNaN(port) || port <= 0 || port > 65535) {
            alert("Please enter a valid port number (1-65535).");
            return;
        }

        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: "connect", ip: ipAddress, port: parseInt(port, 10) }));
        } else {
            alert("WebSocket is not ready. Please try again later.");
        }
    });
});