# Stage 1: build frontend
FROM node:20-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install --ignore-scripts

COPY . .
RUN npx vite build

# Stage 2: production image
FROM node:20-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY server/ ./server/
COPY --from=builder /app/dist ./dist/

RUN mkdir -p /app/data/uploads

EXPOSE 3000
CMD ["node", "server/server.js"]