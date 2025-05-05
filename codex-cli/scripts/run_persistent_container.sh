
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"

WORKDIR="$(pwd)"

CONTAINER_NAME="codex-persistent-$(echo "$WORKDIR" | md5sum | cut -c1-8)"

docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

docker run \
  --name "$CONTAINER_NAME" \
  --detach \
  --restart unless-stopped \
  --user $(id -u):$(id -g) \
  --cap-add NET_ADMIN \
  --volume "$WORKDIR":/workdir \
  --workdir /workdir \
  --env OPENAI_API_KEY \
  --env PORT=3000 \
  --publish 3000:3000 \
  codex:latest \
  bash -c "$SCRIPT_DIR/init_firewall.sh && node /usr/local/share/.config/yarn/global/node_modules/codex-cli/src/server.js"

sleep 2

echo "Persistent Codex container started:"
echo "  Container: $CONTAINER_NAME"
echo "  API URL: http://localhost:3000"
echo "  API Documentation:"
echo "    - POST /api/jobs             - Start a new job"
echo "    - GET /api/jobs/:jobId       - Get job status and logs"
echo "    - GET /api/jobs              - List all jobs"
echo "    - POST /api/jobs/:jobId/cancel - Cancel a running job"
echo "    - GET /health                - Health check endpoint"
echo
echo "To view logs: docker logs -f $CONTAINER_NAME"
echo "To stop container: docker stop $CONTAINER_NAME"
