const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = [];

// All replicas
let replicas = [
"http://replica1:5001",
"http://replica2:5002",
"http://replica3:5003"
];

// Current leader (start with replica1)
let leader = replicas[0];

// 🔁 Function to find active leader
async function findLeader() {

    for (let replica of replicas) {

        try {
            const res = await axios.get(`${replica}/status`);

            if (res.data.state === "leader") {
                leader = replica;
                console.log("Leader switched to:", leader);
                return;
            }

        } catch {}

    }

    console.log("No leader found");
}

// Check leader every 2 seconds
setInterval(findLeader, 2000);


// WebSocket connection
wss.on("connection", (ws) => {

    console.log("Client connected");

    clients.push(ws);

    ws.on("message", async (message) => {

        const data = JSON.parse(message.toString());

        console.log("Stroke received:", data);

        try {

            // Send to current leader
            await axios.post(`${leader}/append`, data);

        } catch (err) {

            console.log("Leader failed, finding new leader...");
            await findLeader();

        }

        // Broadcast to all clients
        clients.forEach(client => {

            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }

        });

    });

    ws.on("close", () => {
        clients = clients.filter(c => c !== ws);
    });

});

app.get("/", (req, res) => {
    res.send("Gateway running");
});

server.listen(4000, () => {
    console.log("Gateway running on port 4000");
});