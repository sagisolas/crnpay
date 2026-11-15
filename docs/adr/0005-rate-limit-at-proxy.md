# Rate limiting lives in the reverse proxy

Creating Donations is rate limited per client IP by Caddy, not by the app: the app stays free of client-IP handling and in-memory counters, and the proxy is the only component that sees the real client address. Stock Caddy has no rate limiter, so the deployment builds a custom Caddy image with the `caddy-ratelimit` plugin via `xcaddy`. nginx, which has rate limiting built in, was rejected because it would trade Caddy's automatic HTTPS for certbot setup.

## Consequences

- Running the app without the provided Caddy setup means running it without a rate limit.
