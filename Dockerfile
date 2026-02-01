# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
COPY packages/frontend ./packages/frontend

# Build shared package
RUN pnpm --filter @garcon/shared build

# Build backend
RUN pnpm --filter @garcon/backend build

# Build frontend
RUN pnpm --filter @garcon/frontend build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Install docker CLI for container management
RUN apk add --no-cache docker-cli

# Copy package files
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

# Copy built files
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/frontend/dist ./packages/frontend/dist

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Create non-root user
RUN addgroup -g 1001 -S garcon && \
    adduser -S garcon -u 1001

# Create data directory
RUN mkdir -p /garcon-data && chown garcon:garcon /garcon-data

ENV NODE_ENV=production
ENV GARCON_DATA_DIR=/garcon-data

EXPOSE 3001

# Note: Running as root to access Docker socket
# In production, consider using Docker socket proxy
CMD ["node", "packages/backend/dist/index.js"]
