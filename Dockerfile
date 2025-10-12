# Multi-stage Dockerfile for Favicon API
# Uses Bun runtime for fast TypeScript execution

FROM oven/bun:1 AS base
WORKDIR /app

# Install Sharp dependencies (libvips)
RUN apt-get update && apt-get install -y \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json bun.lockb ./

# Install dependencies
FROM base AS install
RUN bun install --frozen-lockfile --production

# Development dependencies
FROM base AS dev-install
RUN bun install --frozen-lockfile

# Development stage
FROM base AS development
COPY --from=dev-install /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["bun", "run", "dev"]

# Production build
FROM base AS production
COPY --from=install /app/node_modules ./node_modules
COPY . .

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 bunuser && \
    chown -R bunuser:nodejs /app

USER bunuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["bun", "run", "start"]
