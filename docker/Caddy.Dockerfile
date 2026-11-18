FROM caddy:2.8.4-builder-alpine AS build
RUN xcaddy build \
    --with github.com/mholt/caddy-ratelimit

FROM caddy:2.8.4-alpine
COPY --from=build /usr/bin/caddy /usr/bin/caddy
COPY docker/Caddyfile /etc/caddy/Caddyfile
