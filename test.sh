#!/usr/bin/env bash
set -euo pipefail

echo "Starting mini-RAFT stack..."
docker-compose up -d --build

function wait_for_status() {
  local url=$1
  local retries=30
  local count=0
  while true; do
    if curl --silent --fail "$url" >/dev/null 2>&1; then
      echo "$url is up"
      return
    fi
    count=$((count + 1))
    if [ $count -ge $retries ]; then
      echo "Timed out waiting for $url" >&2
      docker-compose down
      exit 1
    fi
    sleep 1
  done
}

function find_leader() {
  for port in 5001 5002 5003; do
    local status
    status=$(curl --silent --fail "http://localhost:${port}/status" 2>/dev/null || true)
    if echo "$status" | grep -q '"state":"leader"'; then
      echo "http://localhost:${port}"
      return
    fi
  done
  echo ""
}

wait_for_status http://localhost:5001/status
wait_for_status http://localhost:5002/status
wait_for_status http://localhost:5003/status
wait_for_status http://localhost:4000/status

leader=$(find_leader)
if [ -z "$leader" ]; then
  echo "No leader found" >&2
  docker-compose down
  exit 1
fi

function append_stroke() {
  local stroke=$1
  local response
  response=$(curl --silent --show-error -X POST "$leader/append" -H 'Content-Type: application/json' -d "$stroke" 2>/dev/null || true)
  echo "append response: $response"
}

function log_length() {
  local node=$1
  local status
  status=$(curl --silent --fail "$node/status" 2>/dev/null || true)
  local value
  value=$(echo "$status" | grep -oE '"logLength":[0-9]+' | head -1 | cut -d ':' -f2 || true)
  echo "$value"
}

append_stroke '{"x":10,"y":20}'

sleep 2

log1=$(log_length http://localhost:5001)
log2=$(log_length http://localhost:5002)
log3=$(log_length http://localhost:5003)

if [ -z "$log1" ] || [ -z "$log2" ] || [ -z "$log3" ]; then
  echo "Could not read log lengths" >&2
  docker-compose down
  exit 1
fi

if [ "$log1" != "$log2" ] || [ "$log2" != "$log3" ]; then
  echo "Log lengths diverged after initial append: $log1 $log2 $log3" >&2
  docker-compose down
  exit 1
fi

echo "Action 1: log lengths consistent: $log1"

leaderPort=$(echo "$leader" | awk -F: '{print $3}')
container=$(docker ps --filter "publish=$leaderPort" --format '{{.ID}}' || true)
if [ -n "$container" ]; then
  echo "Stopping leader container $container (port $leaderPort)"
  docker stop "$container"
else
  echo "Could not resolve leader container from port $leaderPort, stopping first replica" >&2
  docker stop "$(docker ps --format '{{.Names}}' | grep replica1 || true)" || true
fi

sleep 10

leader=""
for i in {1..20}; do
  leader=$(find_leader)
  if [ -n "$leader" ]; then
    break
  fi
  echo "Waiting for new leader (attempt $i)..."
  sleep 1
done

if [ -z "$leader" ]; then
  echo "No new leader after failover" >&2
  docker-compose down
  exit 1
fi

echo "New leader is $leader"

append_stroke '{"x":30,"y":40}'

sleep 2

log1=$(log_length http://localhost:5001)
log2=$(log_length http://localhost:5002)
log3=$(log_length http://localhost:5003)

vals=()
[ -n "$log1" ] && vals+=("$log1")
[ -n "$log2" ] && vals+=("$log2")
[ -n "$log3" ] && vals+=("$log3")

if [ ${#vals[@]} -lt 2 ]; then
  echo "Not enough reachable replicas to verify consistency" >&2
  docker-compose down
  exit 1
fi

for v in "${vals[@]}"; do
  if [ "$v" != "${vals[0]}" ]; then
    echo "Log lengths diverged after failover append: $log1 $log2 $log3" >&2
    docker-compose down
    exit 1
  fi
done

echo "Failover append log lengths consistent: ${vals[0]}"

# Trigger hot reload

touch replica2/server.js
sleep 8

append_stroke '{"x":50,"y":60}'

sleep 2

log1=$(log_length http://localhost:5001)
log2=$(log_length http://localhost:5002)
log3=$(log_length http://localhost:5003)

vals=()
[ -n "$log1" ] && vals+=("$log1")
[ -n "$log2" ] && vals+=("$log2")
[ -n "$log3" ] && vals+=("$log3")

if [ ${#vals[@]} -lt 2 ]; then
  echo "Not enough reachable replicas to verify consistency after hot reload" >&2
  docker-compose down
  exit 1
fi

for v in "${vals[@]}"; do
  if [ "$v" != "${vals[0]}" ]; then
    echo "Log lengths diverged after hot reload append: $log1 $log2 $log3" >&2
    docker-compose down
    exit 1
  fi
done

echo "Hot reload append log lengths consistent: ${vals[0]}"

echo "Tests passed"

docker-compose down
