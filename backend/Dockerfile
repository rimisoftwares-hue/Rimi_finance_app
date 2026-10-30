# FROM node:18-alpine

# WORKDIR /app

# # Copy package files first (better layer caching)
# COPY package*.json ./

# RUN npm install

# # Copy rest of backend
# COPY . .

# EXPOSE 5000

# CMD ["node", "index.js"]

# ──────────────────────────────────────────────
# Stage 1: Install dependencies
# ──────────────────────────────────────────────
FROM node:20.17.0-alpine AS deps

WORKDIR /app

# Install native build tools needed by some npm packages (e.g., bcrypt, jimp)
RUN apk add --no-cache python3 make g++ libc6-compat

COPY package*.json ./
RUN npm ci --omit=dev

# ──────────────────────────────────────────────
# Stage 2: Production runtime
# ──────────────────────────────────────────────
FROM node:18-alpine AS runner

WORKDIR /app

# Create a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy installed modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Create the uploads directory (mirrors os.homedir() usage in index.js)
RUN mkdir -p /home/appuser/senthur_groups_uploads && \
    chown -R appuser:appgroup /home/appuser/senthur_groups_uploads && \
    chown -R appuser:appgroup /app

USER appuser

EXPOSE 5000

# Health-check so docker-compose knows when the backend is ready
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "index.js"]