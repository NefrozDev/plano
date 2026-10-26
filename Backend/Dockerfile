# Build context: repository root (the API compiles type imports from Common).
FROM node:24-alpine AS build
WORKDIR /app
COPY Backend/package.json Backend/package-lock.json Backend/
# No dependency install scripts: every package used here ships prebuilt binaries.
RUN npm --prefix Backend ci --ignore-scripts
COPY Common Common
COPY Backend Backend
RUN npm --prefix Backend run build && npm --prefix Backend prune --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app/Backend
COPY --from=build /app/Backend/package.json ./
COPY --from=build /app/Backend/node_modules node_modules
COPY --from=build /app/Backend/dist dist
USER node
EXPOSE 3000
CMD ["node", "dist/Backend/src/main.js"]
