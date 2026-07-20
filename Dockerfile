# syntax=docker/dockerfile:1

# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

# Run the build (Vite + esbuild for the server)
RUN npm run build

# Stage 2: Runtime
FROM node:20-slim

WORKDIR /app

# INSTALAÇÃO CRÍTICA: poppler-utils fornece o binário 'pdftotext'
# necessário para extração de tabelas PDF com preservação de layout.
RUN apt-get update && apt-get install -y \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy only the necessary files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

ENV NODE_ENV=production

# Start the bundled server
CMD ["node", "dist/server.cjs"]
