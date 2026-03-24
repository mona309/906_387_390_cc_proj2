# 906_387_390_cc_proj2

Distributed Drawing Board project.

## Prerequisites
- Docker and Docker Compose
- A modern web browser

## Build and Run

### Backend
The backend consists of a gateway and three replicas implementing Mini-RAFT consensus, containerized using Docker.

1. Open a terminal in the project root directory.
2. Run the following command to build and start the services:
   ```bash
   docker-compose up --build
   ```
   This will:
   - Build Docker images for the gateway and replicas (with nodemon for hot-reload).
   - Start the containers with volume mounts for live code reloading.
   - Expose ports: 4000 (gateway WebSocket), 5001-5003 (replicas).
   - Wait for healthchecks before starting the gateway.

3. The backend will be ready when you see logs indicating leader election and heartbeats.

### Frontend
The frontend is served by the gateway service and includes a comprehensive demo interface.

1. After starting the backend, open `http://localhost:4000` in your web browser.
2. The enhanced drawing interface will load with:
   - **Real-time RAFT Status**: Shows current leader, term, and state of all replicas
   - **Connection Status**: Indicates WebSocket connection health
   - **Interactive Canvas**: Draw and see strokes replicated across replicas
   - **Failover Simulation**: Instructions and tools to test leader failure
3. Open multiple browser tabs to test distributed drawing.
4. Use the "Simulate Failover" button to get instructions for testing automatic leader election.

### Hot-Reload
- Edit files in `replica1/`, `replica2/`, `replica3/`, or `gateway/` directories.
- Changes are automatically reloaded via nodemon inside containers.
- No need to restart manually; containers will restart on file changes.

## Testing

### Automated Tests
Run the comprehensive test script:
```bash
./test.sh
```
This script:
- Starts the stack and waits for healthchecks.
- Appends a stroke and verifies replication across all replicas.
- Kills the leader and confirms failover to a new leader.
- Triggers hot-reload and verifies continued consistency.
- Exits with code 0 on success.

### Manual Testing
1. Start the backend with `docker-compose up --build`.
2. Open `http://localhost:4000` in multiple browser tabs.
3. Draw in one tab; strokes should appear in others instantly via RAFT consensus.
4. Monitor the status panel showing leader, term, and replica states.
5. Click "Simulate Failover" for instructions to kill the leader container.
6. Observe automatic failover: new leader elected, status updates, drawing continues.
7. Test hot-reload by editing a replica file (e.g., add a comment in `replica2/server.js`).
8. Container restarts automatically, re-joins cluster without data loss.
## Mini-RAFT Behavior

- replicas expose `/status`, `/request-vote`, `/append-entries`, `/heartbeat`, `/append`, `/sync-log`, `/full-log`.
- gateway periodically resolves leader and routes draw updates.
- stale leader only replies 409 and gateway retries leadership discovery.

## Hot-Reload Setup

1. Code changes in `replica1/`, `replica2/`, `replica3/`, or `gateway/` are automatically picked up with `nodemon`.
2. Running `docker-compose up --build` will mount source directories and restart services on change.

## Test script

- Run `./test.sh` from the project root.
- It verifies leader election, replication, failover, and hot reload.
