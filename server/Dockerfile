FROM node:22-bookworm-slim AS client
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
COPY server/package*.json ./
RUN npm ci
COPY server/src ./src
COPY --from=client /client/dist ./public
CMD ["node", "src/index.js"]
