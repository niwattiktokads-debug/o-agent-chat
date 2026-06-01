FROM node:22-alpine

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# ---- Build client ----
COPY client/package*.json ./client/
RUN cd client && npm install --legacy-peer-deps

COPY client/ ./client/
RUN cd client && npm run build

# ---- Install server deps ----
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# ---- Copy remaining source ----
COPY server/ ./server/
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Start server
CMD ["node", "server/src/index.js"]
