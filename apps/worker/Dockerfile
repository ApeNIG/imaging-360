# Build stage
FROM node:20-alpine AS builder

# Install build dependencies for sharp
RUN apk add --no-cache python3 make g++ vips-dev

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/worker/package.json ./apps/worker/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker

# Build shared package first, then worker
RUN pnpm --filter @360-imaging/shared build && \
    pnpm --filter @360-imaging/worker build

# Production stage
FROM node:20-alpine AS runner

# Install runtime dependencies for sharp/vips
RUN apk add --no-cache vips

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy package files for production install
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/worker/package.json ./apps/worker/

# Install production dependencies only
RUN apk add --no-cache python3 make g++ vips-dev && \
    pnpm install --frozen-lockfile --prod && \
    apk del python3 make g++ vips-dev

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist

ENV NODE_ENV=production

WORKDIR /app/apps/worker

CMD ["node", "dist/index.js"]
