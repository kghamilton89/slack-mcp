FROM node:22.12-alpine AS builder
WORKDIR /build

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy source code
COPY src ./src

# Install dependencies and build
RUN npm ci && npm run build

# Production stage
FROM node:22-alpine AS release
WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package*.json ./

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

ENTRYPOINT ["node", "dist/index.js"]