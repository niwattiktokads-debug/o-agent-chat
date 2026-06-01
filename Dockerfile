FROM node:22-alpine

WORKDIR /app

# Copy server package files
COPY server/package*.json ./server/

# Install production dependencies
RUN npm --prefix server install --omit=dev

# Install client dependencies and build
COPY client/package*.json ./client/
RUN npm --prefix client install --legacy-peer-deps
COPY client/ ./client/
RUN npm --prefix client run build

# Copy all source files
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Start server
CMD ["node", "server/src/index.js"]
