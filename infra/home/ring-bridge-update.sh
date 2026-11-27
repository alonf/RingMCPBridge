#!/bin/sh
# Updates the home connector's image and restarts it: ring-bridge-update <tag>
#
# The tag is the commit the core runs (40 hex characters), or any tag the image repository
# publishes. With no tag it only shows the image the connector is set to. The connector is stopped
# gracefully by ring-bridge-start, so a Ring token just rotated is saved before the container goes.
# The image is pulled first: if the pull fails, nothing is changed and the connector keeps running.
set -eu

ENV_FILE=/etc/ring-bridge/bridge.env
. "$ENV_FILE"

if [ "$#" -eq 0 ]; then
  echo "The connector is set to: $IMAGE"
  echo "Usage: ring-bridge-update <tag>"
  exit 0
fi

TAG=$1
case "$TAG" in
  *[!A-Za-z0-9._-]* | "")
    echo "A tag holds only letters, digits, dots, dashes and underscores." >&2
    exit 2
    ;;
esac

REPOSITORY=${IMAGE%:*}
NEW_IMAGE="$REPOSITORY:$TAG"
if [ "$NEW_IMAGE" = "$IMAGE" ]; then
  echo "Already set to $NEW_IMAGE; pulling and restarting anyway."
fi

docker pull "$NEW_IMAGE"
sudo sed -i -E "s|^IMAGE=.*$|IMAGE=$NEW_IMAGE|" "$ENV_FILE"
ring-bridge-start
echo "Updated to $NEW_IMAGE. Recent log:"
sleep 5
docker logs -t ring-bridge-connector 2>&1 | grep -v '^[^ ]* *at ' | tail -12
