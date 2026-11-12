# CampusSarthi — Single-Container Production Dockerfile (Node + Playwright Chromium)
FROM node:22-bookworm-slim

WORKDIR /app

# Install backend dependencies & Playwright Chromium system deps
COPY backend/package*.json ./backend/
RUN cd backend && npm ci
RUN cd backend && npx playwright install --with-deps chromium

# Install frontend dependencies & build Vite bundle
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Build backend TypeScript
COPY backend/ ./backend/
RUN cd backend && npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3001
ENV SERVE_FRONTEND=true

EXPOSE 3001

WORKDIR /app/backend
CMD ["node", "dist/server.js"]

