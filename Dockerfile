# Bonificacion: imagen multi-etapa que corre con usuario NO root
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY client/package*.json client/
RUN npm ci --omit=dev && npm ci --prefix client --include=dev
COPY . .
RUN npm run build --prefix client

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --from=build --chown=node:node /app/client/dist ./client/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "src/server.js"]
