# Deploying the proxy and the site

`worker.mjs` is copied by hand to Cloudflare; nothing here is run by the app or by `make check`. Do these in order.

1. **Cloudflare Worker with static assets.** Connect the repository with root directory `frontend/`, build command `npm run build`, deploy command `npx wrangler deploy`, on the app's domain. `frontend/wrangler.jsonc` serves `dist/` and makes every unknown path answer `index.html` (`not_found_handling: "single-page-application"`).
2. **Worker.** Create a Worker and paste `deploy/worker.mjs` into the dashboard editor. The repository copy is the source; the dashboard does not update itself, so paste again after every change.
3. **Worker settings.** Add the variable `CLOUD_RUN_ORIGIN` (the Cloud Run address, `https://…`, no path) and the secret `PROXY_SHARED_SECRET`. Generate the secret with `openssl rand -hex 32`; never commit it or paste it anywhere else.
4. **Worker routes** on the same domain, exactly these three: `<domain>/api/*`, `<domain>/auth/*`, `<domain>/health`. Not `/*`.
5. **Cloud Run.** Set the same value as `PROXY_SHARED_SECRET`, plus `CLIENT_IP_HEADER=X-Client-IP`, `APP_ENV=production` and `APP_BASE_URL` (the public https origin: no path, no trailing slash, because the CSRF check compares it with the browser's `Origin`). See `STACK.md`, Deployment.
6. **Check, in order:**
   - `https://<domain>/health` answers `200` through the Worker.
   - The Cloud Run address called directly (not the domain) answers `404` to everything except `/health`.
   - A full login from the domain returns to the app and keeps its session.
   - Reloading `/trash` and `/login` shows the app.
   - Last, wait a minute (login and callback share one allowance of 10 a minute per address, and a full login spent some), then send 12 quick `GET https://<domain>/auth/login` requests: at least one answers `429`. This also confirms the client address reaches the backend; if the limit seems shared by every user, `CLIENT_IP_HEADER` is wrong.
7. **Rotating the secret.** Change it in both places; requests answer `404` between the two changes.
8. **Still unconfirmed** (from `STACK.md`): that `CF-Connecting-IP` is present on the request the Worker receives (the Worker copies it into `X-Client-IP`, so it does not depend on Cloudflare forwarding it to Cloud Run), and that the Worker's `single-page-application` fallback answers `index.html` for unknown paths as described.

## Tests

From the repository root: `node --test "deploy/*.test.mjs"` (Node 22, no dependencies). They run against a stubbed `fetch`, not Cloudflare.
