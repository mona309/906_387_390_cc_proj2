const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = 5003;
const NODE_ID = "replica3";
const peers = [
    "http://replica1:5001",
    "http://replica2:5002"
];

let state = "follower";
let currentTerm = 0;
let votedFor = null;
let log = [];
let commitIndex = -1;
let lastApplied = -1;
let leaderId = null;

let electionTimer = null;
let heartbeatTimer = null;

function resetElectionTimer() {
    if (electionTimer) clearTimeout(electionTimer);
    const timeout = 500 + Math.floor(Math.random() * 300);
    electionTimer = setTimeout(startElection, timeout);
}

function stopElectionTimer() {
    if (electionTimer) {
        clearTimeout(electionTimer);
        electionTimer = null;
    }
}

function stopHeartbeatTimer() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}

async function sendHeartbeat() {
    const lastLogIndex = log.length - 1;
    const prevLogIndex = lastLogIndex;
    const prevLogTerm = lastLogIndex >= 0 ? log[lastLogIndex].term : 0;

    for (const peer of peers) {
        try {
            await axios.post(`${peer}/append-entries`, {
                term: currentTerm,
                leaderId: NODE_ID,
                prevLogIndex,
                prevLogTerm,
                entries: [],
                leaderCommit: commitIndex
            }, { timeout: 1000 });
        } catch {}
    }
}

async function startHeartbeat() {
    stopHeartbeatTimer();
    await sendHeartbeat();
    heartbeatTimer = setInterval(sendHeartbeat, 150);
}

function becomeFollower(termFromLeader, newLeaderId) {
    state = "follower";
    currentTerm = termFromLeader;
    votedFor = null;
    leaderId = newLeaderId || null;
    stopHeartbeatTimer();
    resetElectionTimer();
    console.log(`[${NODE_ID}] BECOME FOLLOWER term=${currentTerm} leader=${leaderId}`);
}

async function becomeLeader() {
    state = "leader";
    leaderId = NODE_ID;
    votedFor = NODE_ID;
    stopElectionTimer();
    console.log(`[${NODE_ID}] BECOME LEADER term=${currentTerm}`);
    await startHeartbeat();
}

async function startElection() {
    state = "candidate";
    currentTerm += 1;
    votedFor = NODE_ID;
    leaderId = null;
    let votes = 1;

    console.log(`[${NODE_ID}] starting election term=${currentTerm}`);

    const lastLogIndex = log.length - 1;
    const lastLogTerm = lastLogIndex >= 0 ? log[lastLogIndex].term : 0;

    const votePromises = peers.map(async (peer) => {
        try {
            const res = await axios.post(`${peer}/request-vote`, {
                term: currentTerm,
                candidateId: NODE_ID,
                lastLogIndex,
                lastLogTerm
            }, { timeout: 1000 });

            if (res.data.voteGranted) {
                votes += 1;
            } else if (res.data.term > currentTerm) {
                currentTerm = res.data.term;
                becomeFollower(currentTerm, null);
            }
        } catch {}
    });

    await Promise.all(votePromises);

    if (state === "candidate" && votes > (peers.length + 1) / 2) {
        await becomeLeader();
    } else {
        resetElectionTimer();
    }
}

function appendEntriesToLog(entries, prevLogIndex, prevLogTerm) {
    if (prevLogIndex >= 0) {
        const localPrev = log[prevLogIndex];
        if (!localPrev || localPrev.term !== prevLogTerm) {
            return false;
        }
    }

    let index = prevLogIndex + 1;
    for (const entry of entries) {
        if (log[index] && log[index].term !== entry.term) {
            log = log.slice(0, index);
        }
        if (!log[index]) {
            log.push(entry);
        }
        index += 1;
    }
    return true;
}

app.post("/request-vote", (req, res) => {
    const { term, candidateId, lastLogIndex, lastLogTerm } = req.body;

    if (term > currentTerm) {
        becomeFollower(term, null);
    }

    let voteGranted = false;
    const localLastLogIndex = log.length - 1;
    const localLastLogTerm = localLastLogIndex >= 0 ? log[localLastLogIndex].term : 0;
    const upToDate = lastLogTerm > localLastLogTerm || (lastLogTerm === localLastLogTerm && lastLogIndex >= localLastLogIndex);

    if (term === currentTerm && (votedFor === null || votedFor === candidateId) && upToDate) {
        voteGranted = true;
        votedFor = candidateId;
        resetElectionTimer();
    }

    res.json({ term: currentTerm, voteGranted });
});

app.post("/append-entries", (req, res) => {
    const { term, leaderId: incomingLeaderId, prevLogIndex, prevLogTerm, entries = [], leaderCommit } = req.body;

    if (term < currentTerm) {
        return res.json({ term: currentTerm, success: false });
    }

    if (term > currentTerm || state !== "follower") {
        becomeFollower(term, incomingLeaderId);
    }

    if (!appendEntriesToLog(entries, prevLogIndex, prevLogTerm)) {
        return res.json({ term: currentTerm, success: false });
    }

    if (leaderCommit !== undefined && leaderCommit > commitIndex) {
        commitIndex = Math.min(leaderCommit, log.length - 1);
    }

    resetElectionTimer();

    res.json({ term: currentTerm, success: true });
});

app.post("/heartbeat", (req, res) => {
    const { term, leaderId: incomingLeaderId } = req.body;

    if (term < currentTerm) {
        return res.json({ term: currentTerm, success: false });
    }

    becomeFollower(term, incomingLeaderId);
    res.json({ term: currentTerm, success: true });
});

app.post("/append", async (req, res) => {
    if (state !== "leader") {
        return res.status(409).json({ error: "not leader", leaderId });
    }

    const command = req.body;
    const entry = { term: currentTerm, command };
    log.push(entry);

    const prevLogIndex = log.length - 2;
    const prevLogTerm = prevLogIndex >= 0 ? log[prevLogIndex].term : 0;

    let successCount = 1;

    await Promise.all(peers.map(async (peer) => {
        try {
            const resp = await axios.post(`${peer}/append-entries`, {
                term: currentTerm,
                leaderId: NODE_ID,
                prevLogIndex,
                prevLogTerm,
                entries: [entry],
                leaderCommit: commitIndex
            }, { timeout: 1000 });

            if (resp.data.success) {
                successCount += 1;
            } else if (resp.data.term > currentTerm) {
                becomeFollower(resp.data.term, null);
            }
        } catch {}
    }));

    if (successCount > (peers.length + 1) / 2) {
        commitIndex = log.length - 1;
        console.log(`[${NODE_ID}] entry committed index=${commitIndex}`);
    }

    res.json({ success: true, leaderId: NODE_ID, commitIndex });
});

app.get("/sync-log", (req, res) => {
    const from = Number(req.query.from) || 0;
    res.json(log.slice(from));
});

app.get("/full-log", (req, res) => {
    res.json(log);
});

app.get("/status", (req, res) => {
    res.json({
        node: NODE_ID,
        state,
        term: currentTerm,
        logLength: log.length,
        commitIndex,
        leaderId
    });
});

app.listen(PORT, () => {
    console.log(`${NODE_ID} running on ${PORT} as ${state}`);
    resetElectionTimer();
});