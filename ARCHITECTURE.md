# Architecture Document

## Components

- gateway: WebSocket server for frontend clients. Routes strokes to current RAFT leader via `/append` RPC.
- replica1/replica2/replica3: Mini-RAFT nodes implementing follower/candidate/leader logic and log replication.

## RAFT State Machine

- Follower: waits for heartbeats; on timeout (500-800ms) becomes Candidate.
- Candidate: increments term, votes for self, requests votes from peers.
- Leader: once elected, sends heartbeats every 150ms and accepts `/append` commands.

## API Endpoints (replicas)

- POST /request-vote
- POST /append-entries
- POST /heartbeat
- POST /append (leader-only)
- GET /sync-log
- GET /full-log
- GET /status

## Gateway Behavior

- Maintains replica list and tracks current leader.
- Periodic leader discovery (1.5s) by querying `/status` on replicas.
- On Append failure (not leader/unreachable), retries after new leader discovery.

## Hot Reload

- Docker Compose mounts replica/source directories and Gateway directory for live code reload via `nodemon` inside containers.

## Healthchecks

- Per-service Docker healthchecks enforce startup order and detect dead containers.
