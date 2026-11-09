# syntax=docker/dockerfile:1
# One image for mode H's core and the home connector (T027), picked at run time by BRIDGE_MODE.
# Node runs the TypeScript as it is (type stripping), so there is no build step. Nothing in it is
# tied to one CPU, so it builds for linux/amd64 and linux/arm64 alike (the home server may be
# either). Only the bridge's production dependencies are installed, with no install scripts. The
# dev script, the tests and the records stay out (.dockerignore).
#
#   docker build -f bridge/Dockerfile -t ring-mcp-bridge .
FROM node:24.13.0-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY bridge/package.json bridge/package.json
COPY shim/package.json shim/package.json
RUN npm ci --omit=dev --ignore-scripts --workspace bridge --include-workspace-root=false \
    && npm cache clean --force

COPY bridge/src bridge/src

# The connector's data folder (its outbox and Secrets File), owned by the user the bridge runs as.
RUN mkdir /data && chown node:node /data
USER node

# Mode H's core listens here (BRIDGE_PORT); the connector and mode A serve no port.
EXPOSE 8080
# node:sqlite is still marked experimental in Node 24; its warning would only add noise to the log.
ENTRYPOINT ["node", "--disable-warning=ExperimentalWarning", "bridge/src/host/main.ts"]
