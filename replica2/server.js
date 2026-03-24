const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = 5002;
const NODE_ID = "replica2";

const peers = [
"http://replica1:5001",
"http://replica3:5003"
];

let state = "follower";
let term = 0;
let lastHeartbeat = Date.now();
let log = [];

// ✅ Recover log from leader on startup
(async () => {
    try {
        const res = await axios.get("http://replica1:5001/full-log");
        log = res.data;
        console.log("Replica2 recovered log:", log.length);
    } catch {
        console.log("Leader not available for recovery");
    }
})();


// Heartbeat timeout → become leader
setInterval(() => {

    if(Date.now() - lastHeartbeat > 800){

        state = "leader";
        console.log("Replica2 became LEADER");

    }

},500);


// Receive heartbeat
app.post("/heartbeat",(req,res)=>{

    lastHeartbeat = Date.now();
    term = req.body.term;

    res.json({ok:true});

});


// Receive replication
app.post("/replicate",(req,res)=>{

    const entry = req.body;

    log.push(entry);

    console.log("Follower2 replicated:",entry);

    res.json({success:true});

});


// If becomes leader → handle append
app.post("/append", async (req,res)=>{

    if(state !== "leader"){
        return res.status(400).send("not leader");
    }

    const entry = req.body;

    log.push(entry);

    console.log("Replica2 leader appended:",entry);

    for(let peer of peers){

        try{
            await axios.post(`${peer}/replicate`,entry);
        }catch{}

    }

    res.json({success:true});

});


// ✅ Status endpoint
app.get("/status", (req, res) => {
    res.json({
        node: "replica2",
        state: state,
        logLength: log.length
    });
});


// Start server
app.listen(PORT,()=>{
    console.log("replica2 running on 5002");
});