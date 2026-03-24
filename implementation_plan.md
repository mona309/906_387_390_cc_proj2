# Distributed Real‑Time Drawing Board – Mini‑RAFT Implementation Plan

## Goal Description
Add a functional Mini‑RAFT consensus layer to the existing three‑replica backend, improve Docker‑Compose for hot‑reload and health‑checks, and provide documentation, testing, and deliverables so the project meets the full‑marks assignment requirements.

## Proposed Changes

### 1. Backend – Mini‑RAFT RPC Endpoints (gateway & replicas)
- **replica*/server.js** – Add the following HTTP endpoints:
  - `POST /request-vote` – Candidate asks peers for votes.
  - `POST /append-entries` – Leader replicates a stroke entry to followers.
  - `POST /heartbeat` – Leader sends heartbeat to followers.
  - `GET /sync-log` – Followers request missing log entries from the leader.
- Implement term, state (`follower|candidate|leader`), and vote tracking logic.
- Random election timeout (500‑800 ms) for followers; on timeout become candidate, increment term, request votes.
- Leader starts heartbeat interval (150 ms) to all peers.
- Log replication: leader appends entry, forwards via `/append-entries`; on majority ACKs, marks entry committed and notifies gateway.
- Add `/status` (already present) to expose `node`, `state`, `term`, `logLength`.

### 2. Gateway Enhancements
- Update peer list to Docker service names (already done).
- When a client POST `/append` fails with `404` or `not leader`, call [findLeader()](file://wsl.localhost/Ubuntu-22.04/home/mona/906_387_390_cc_proj2/gateway/server.js#25-45) again.
- Cache the current leader URL; on leader loss, re‑run election detection.

### 3. Hot‑Reload / Bind‑Mount Setup
- **Dockerfile (each replica)** – Install `nodemon` (or `air`) and set entrypoint to `nodemon server.js`.
- **docker‑compose.yml** – Mount each replica source directory as a volume:
  ```yaml
  replica1:
    volumes:
      - ./replica1:/app
  ```
- Ensure containers restart automatically on file changes, triggering a fresh election.

### 4. Docker‑Compose Improvements
- Remove obsolete `version` key (optional clean‑up).
- Add healthchecks for gateway and each replica (e.g., `curl http://localhost:5001/status`).
- Define explicit `depends_on` ordering so gateway starts after replicas are healthy.
- Expose ports 4000 (gateway) and 5001‑5003 (replicas).

### 5. Observability & Logging
- Add timestamped console logs for term changes, elections, votes, heartbeats, and commit events.
- Ensure logs are visible via `docker logs`.

### 6. Documentation & Deliverables
- Update **README.md** with full build/run instructions, assignment checklist, and how to trigger hot‑reload.
- Create **Architecture Document** (`ARCHITECTURE.md`) with component diagram, state‑machine diagram, and API specs.
- Record a short demo video (`demo.mp4`) showing:
  - Multiple browser clients drawing.
  - Killing the leader container and observing automatic failover.
  - Editing a replica file to trigger hot‑reload without client disconnects.

### 7. Testing & Validation
- **Automated script** (`test.sh`) that:
  1. Starts the stack (`docker-compose up -d`).
  2. Waits for healthchecks.
  3. Sends a stroke via WebSocket (using `wscat`).
  4. Verifies that all replicas’ `/status` report the same `logLength`.
  5. Stops the leader container, waits, then checks that a new leader is elected and the log continues.
  6. Modifies a replica source file (touch) to trigger hot‑reload, then repeats steps 3‑4.
- **Manual UI test** instructions for the user to open [frontend/index.html](file://wsl.localhost/Ubuntu-22.04/home/mona/906_387_390_cc_proj2/frontend/index.html) in two browsers, draw, kill a replica, and verify drawing continues.

## Verification Plan

### Automated Tests
- Run `./test.sh` – script will exit with code 0 on success.
- Use `curl` to hit each new RPC endpoint and assert correct JSON responses.
- Use `docker logs` to confirm election logs appear.

### Manual Verification
1. Open [frontend/index.html](file://wsl.localhost/Ubuntu-22.04/home/mona/906_387_390_cc_proj2/frontend/index.html) in two separate browser tabs.
2. Draw on one tab – strokes should appear on the other instantly.
3. In a terminal, run `docker stop 906_387_390_cc_proj2-replica1-1` (the current leader).
4. Observe the gateway logs switching to a new leader and continue drawing.
5. Edit [replica2/server.js](file://wsl.localhost/Ubuntu-22.04/home/mona/906_387_390_cc_proj2/replica2/server.js) (e.g., add a comment) – the container should restart automatically and re‑join the cluster without losing strokes.
6. Confirm the UI still works and the log length stays consistent.

---
*All changes will be committed to the repository and the task checklist ([task.md](file:///C:/Users/Monisha/.gemini/antigravity/brain/59b8e374-389a-4831-a602-01f7fd397382/task.md)) will be updated as each item is completed.*
