# Build context: repository root (the app compiles imports from Common).
# Node 20 is the newest release supported by Angular 17.
FROM node:22-alpine AS build
ENV NG_CLI_ANALYTICS=false
WORKDIR /app
COPY Frontend/package.json Frontend/package-lock.json Frontend/
RUN npm --prefix Frontend ci
COPY Common Common
COPY Frontend Frontend
RUN npm --prefix Frontend run build

# Caddy serves the static app and proxies /api to NestJS.
FROM caddy:2.10-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/Frontend/dist/plano/browser /srv
