# Build context: repository root (the app compiles imports from Common).
FROM node:24-alpine AS build
ENV NG_CLI_ANALYTICS=false
WORKDIR /app
COPY Frontend/package.json Frontend/package-lock.json Frontend/
# No dependency install scripts: every package used here ships prebuilt binaries.
RUN npm --prefix Frontend ci --ignore-scripts
COPY Common Common
COPY Frontend Frontend
RUN npm --prefix Frontend run build

# Caddy serves the static app and proxies /api to NestJS.
FROM caddy:2.10-alpine
# Run unprivileged: Caddy only writes its state under /config and /data, and
# Docker lets any user bind port 80 inside the container.
RUN addgroup -S caddy && adduser -S -G caddy caddy && chown -R caddy:caddy /config /data
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/Frontend/dist/plano/browser /srv
USER caddy
