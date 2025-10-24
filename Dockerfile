# Multi-stage Dockerfile for Favicon API
# Uses Bun runtime for fast TypeScript execution

# Build stage
FROM oven/bun:1.2-slim AS builder
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Production stage
FROM oven/bun:1.2-slim AS production
WORKDIR /app

# Install only runtime dependencies for Sharp (not dev packages)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips42 \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY . .

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 bunuser && \
    chown -R bunuser:nodejs /app

USER bunuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

ENV NODE_ENV production

EXPOSE 3000

CMD ["bun", "run", "start"]
