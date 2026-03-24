const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = 5003;

let log = [];

// ✅ Recover log from leader on startup
(async () => {
    try {
        const res = await axios.get("http://replica1:5001/full-log");
        log = res.data;
        console.log("Replica3 recovered log:", log.length);
    } catch {
        console.log("Leader not available for recovery");
    }
})();

// Receive replication
app.post("/replicate",(req,res)=>{

    const entry = req.body;

    log.push(entry);

    console.log("Follower3 replicated:",entry);

    res.json({success:true});

});

// Receive heartbeat
app.post("/heartbeat",(req,res)=>{

    res.json({ok:true});

});

// ✅ Status endpoint
app.get("/status", (req, res) => {
    res.json({
        node: "replica3",
        state: "follower",
        logLength: log.length
    });
});

// Start server
app.listen(PORT,()=>{
    console.log("replica3 running on 5003");
});