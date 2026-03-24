# 906_387_390_cc_proj2

Distributed Drawing Board project.

## Prerequisites
- Docker and Docker Compose
- A modern web browser

## Build and Run

### Backend
The backend consists of a gateway and three replicas, and it is containerized using Docker.
To build and start the backend services:

1. Open a terminal in the project root directory.
2. Run the following command:
   ```bash
   docker-compose up --build
   ```
   This will build the Docker images for the gateway and replicas and start the containers. The gateway will be available on `ws://localhost:4000`.

### Frontend
The frontend is a simple HTML file with embedded JavaScript. It does not require a build step or a web server.

1. Open the `frontend` directory.
2. Double-click the `index.html` file to open it in your web browser. Alternatively, you can serve it with a simple HTTP server if preferred, but it works directly from the file system.
3. Once open, you can start drawing on the board, and the drawn coordinates will be communicated to the backend via WebSocket.