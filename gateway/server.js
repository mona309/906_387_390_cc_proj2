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
app.use(express.static(path.join(__dirname, 'frontend')));

// Serve index.html for root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

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

        // Broadcast clear to all clients without going through RAFT
        if (data.type === "clear") {
            clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: "clear" }));
                }
            });
            return;
        }

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

app.get("/cluster-status", async (req, res) => {
    const replicaEndpoints = [
        { url: "http://replica1:5001", name: "Replica1" },
        { url: "http://replica2:5002", name: "Replica2" },
        { url: "http://replica3:5003", name: "Replica3" }
    ];

    const statuses = await Promise.all(replicaEndpoints.map(async ({ url, name }) => {
        try {
            const r = await axios.get(`${url}/status`, { timeout: 1000 });
            return { ...r.data, name, available: true };
        } catch {
            return { name, available: false };
        }
    }));

    res.json(statuses);
});

// Map node ID to docker container name
const containerNames = {
    replica1: "906_387_390_cc_proj2-replica1-1",
    replica2: "906_387_390_cc_proj2-replica2-1",
    replica3: "906_387_390_cc_proj2-replica3-1"
};

function dockerRequest(method, path, callback) {
    const options = {
        socketPath: "/var/run/docker.sock",
        path,
        method
    };
    const req = http.request(options, (res) => {
        let body = "";
        res.on("data", d => body += d);
        res.on("end", () => callback(null, res.statusCode, body));
    });
    req.on("error", (err) => callback(err));
    req.end();
}

app.post("/failover", async (req, res) => {
    let currentLeader = null;
    for (const replica of replicas) {
        try {
            const r = await axios.get(`${replica}/status`, { timeout: 1000 });
            if (r.data.state === "leader") {
                currentLeader = r.data.node;
                break;
            }
        } catch {}
    }

    if (!currentLeader) {
        return res.status(404).json({ error: "No leader found" });
    }

    const container = containerNames[currentLeader];
    if (!container) {
        return res.status(400).json({ error: "Unknown container for leader: " + currentLeader });
    }

    dockerRequest("POST", `/containers/${container}/stop`, (err, statusCode, body) => {
        if (err) {
            console.error("[gateway] failover error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        if (statusCode !== 204 && statusCode !== 304) {
            return res.status(500).json({ error: `Docker returned ${statusCode}: ${body}` });
        }
        console.log(`[gateway] failover: stopped ${container}`);
        leader = null;
        lastLeaderCheck = 0;
        res.json({ stopped: currentLeader, container });
    });
});

app.post("/restore/:nodeId", (req, res) => {
    const { nodeId } = req.params;
    const container = containerNames[nodeId];
    if (!container) {
        return res.status(400).json({ error: "Unknown node: " + nodeId });
    }

    dockerRequest("POST", `/containers/${container}/start`, (err, statusCode, body) => {
        if (err) {
            console.error("[gateway] restore error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        if (statusCode !== 204 && statusCode !== 304) {
            return res.status(500).json({ error: `Docker returned ${statusCode}: ${body}` });
        }
        console.log(`[gateway] restored ${container}`);
        res.json({ started: nodeId, container });
    });
});
server.listen(4000, () => {
    console.log("Gateway running on port 4000");
    findLeader();
});