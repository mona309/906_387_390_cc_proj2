const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = 5001;
const NODE_ID = "replica1";

const peers = [
"http://replica2:5002",
"http://replica3:5003"
];

let state = "leader";
let term = 0;
let log = [];

// Heartbeat to followers
setInterval(async () => {

    if(state === "leader"){

        for(let peer of peers){

            try{
                await axios.post(`${peer}/heartbeat`,{term,leader:NODE_ID});
            }catch{}

        }

    }

},150);

// Append from gateway
app.post("/append", async (req,res)=>{

    const entry = req.body;

    log.push(entry);

    console.log("Leader appended:",entry);

    // Replicate to followers
    for(let peer of peers){

        try{
            await axios.post(`${peer}/replicate`,entry);
        }catch{}

    }

    res.json({success:true});

});

// Receive heartbeat
app.post("/heartbeat",(req,res)=>{

    term = req.body.term;

    res.json({ok:true});

});

// ✅ NEW: Send full log (for recovery)
app.get("/full-log", (req, res) => {
    res.json(log);
});

// ✅ Status endpoint
app.get("/status", (req, res) => {
    res.json({
        node: "replica1",
        state: state,
        logLength: log.length
    });
});

// Start server
app.listen(PORT,()=>{
    console.log("replica1 running as leader on 5001");
});