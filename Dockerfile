# ==========================================
# STAGE 1: Build Frontend & Application
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies with lockfile support
COPY package.json ./
RUN npm install

# Copy source code
COPY . .

# Build Vite React production bundle into /app/dist
RUN npm run build

# ==========================================
# STAGE 2: Production Runner
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package definition and install production dependencies
COPY package.json ./
RUN npm install --omit=dev && npm install tsx

# Copy built frontend assets and server file
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Expose web server port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start the full-stack server (Serves UI + Handles /api/vault/* CORS proxy)
CMD ["npx", "tsx", "server.ts"]
