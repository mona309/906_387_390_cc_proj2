const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const axios = require("axios");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = [];

const replicas = [
    "http://replica1:5001",
    "http://replica2:5002",
    "http://replica3:5003"
];

let leader = replicas[0];
let lastLeaderCheck = 0;

async function findLeader() {
    for (const replica of replicas) {
        try {
            const res = await axios.get(`${replica}/status`, { timeout: 1000 });
            if (res.data.state === "leader") {
                leader = replica;
                lastLeaderCheck = Date.now();
                console.log(`[gateway] leader found: ${leader} term=${res.data.term}`);
                return leader;
            }
        } catch (err) {
            // ignore unreachable
        }
    }
    console.log("[gateway] no leader found");
    return null;
}

async function ensureLeader() {
    const now = Date.now();
    if (!leader || now - lastLeaderCheck > 2000) {
        await findLeader();
    }
    return leader;
}

setInterval(findLeader, 1500);

async function sendAppendWithRetry(entry) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const currentLeader = await ensureLeader();
        if (!currentLeader) throw new Error("no leader");

        try {
            const res = await axios.post(`${currentLeader}/append`, entry, { timeout: 3000 });
            if (res.data && res.data.success) {
                return res.data;
            }
            if (res.data && res.data.error) {
                console.log(`[gateway] leader response error: ${res.data.error}`);
            }
        } catch (err) {
            console.log(`[gateway] append attempt ${attempt + 1} failed, refreshing leader`);
            await findLeader();
        }
    }

    throw new Error("failed to append stroke after retries");
}

wss.on("connection", (ws) => {
    console.log("Client connected");
    clients.push(ws);

    ws.on("message", async (message) => {
        const data = JSON.parse(message.toString());
        console.log("Stroke received from client:", data);

        try {
            await sendAppendWithRetry(data);
        } catch (err) {
            console.error("[gateway] append failed:", err.message);
        }

        clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    });

    ws.on("close", () => {
        clients = clients.filter((c) => c !== ws);
    });
});

app.get("/", (req, res) => {
    res.send("Gateway running");
});

app.get("/status", (req, res) => {
    res.json({ service: "gateway", leader, replicas });
});

server.listen(4000, () => {
    console.log("Gateway running on port 4000");
    findLeader();
});