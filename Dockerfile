# Stage 1: Build frontend and install runtime deps
FROM node:20-slim AS build
WORKDIR /app

COPY package*.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN npm ci

COPY . .
RUN npm run build --prefix frontend
RUN npm prune --omit=dev

# Stage 2: Runtime
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend ./backend
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/package.json ./package.json

EXPOSE 8080
CMD ["node", "backend/server.js"]
