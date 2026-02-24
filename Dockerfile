# Multi-stage Docker build for production-grade Node.js bot
#
# Stage 1: Build - Install dependencies
# Stage 2: Runtime - Lightweight production image
#
# Benefits:
# - Reduces final image size (no dev dependencies)
# - Improves security (only essentials included)
# - Faster deployment cycles
# - Health checks built-in

FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
# Alpine uses apk instead of apt
RUN apk add --no-cache python3 make g++ && \
    npm ci --only=production && \
    npm cache clean --force

# ========== RUNTIME STAGE ==========

FROM node:18-alpine

# Set environment to production
ENV NODE_ENV=production

WORKDIR /app

# Install dumb-init (handles signals properly in Docker)
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create logs directory
RUN mkdir -p logs && \
    chown -R nodejs:nodejs logs

# Copy node_modules from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs . .

# Switch to non-root user
USER nodejs

# Health check - verify bot is responsive
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)}).on('error', (e) => {throw e})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the bot
CMD ["node", "index.js"]

# Metadata
LABEL org.opencontainers.image.title="BeliX Discord Bot"
LABEL org.opencontainers.image.description="Production-grade Discord bot"
LABEL org.opencontainers.image.version="1.0.0"
