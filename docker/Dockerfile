FROM node:26-alpine AS base
RUN npm install -g pnpm@11.8.0 && apk add --no-cache python3 make g++
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:26-alpine
ENV NODE_ENV=production \
    CONFIG_PATH=/config/config.json \
    DB_PATH=/data/crnpay.db
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json config.default.json ./
COPY config.json /config/config.json
COPY .env ./.env
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
CMD ["node", "--env-file=/app/.env", "dist/server/main.js"]
