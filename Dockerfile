# Multi-stage production Dockerfile for MessPulse
# Builds packages/shared, apps/web (SPA static bundle), and apps/api.
# DOC2 §2.2 Decision 8, DOC4 Step 15.

# ─── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install all dependencies for build
RUN npm ci

# Copy source trees
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/
COPY apps/web/ ./apps/web/

# Build shared contracts, client bundle, and backend server
RUN npm run build:shared
RUN npm run build -w apps/web
RUN npm run build -w apps/api

# ─── Stage 2: Runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package manifests and install production-only dependencies
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN npm ci --omit=dev

# Copy compiled artifacts from builder
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

CMD ["npm", "run", "start", "-w", "apps/api"]
