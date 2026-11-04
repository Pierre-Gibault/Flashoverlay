FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.electron.json ./
COPY src ./src
RUN npm run build:main

FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=7331

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build --chown=node:node /app/dist-electron/server ./dist-electron/server
COPY --from=build --chown=node:node /app/dist-electron/shared ./dist-electron/shared
COPY --chown=node:node scripts/server-healthcheck.mjs ./scripts/server-healthcheck.mjs

EXPOSE 7331

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD ["node", "scripts/server-healthcheck.mjs"]

USER node

CMD ["node", "dist-electron/server/main.js"]
