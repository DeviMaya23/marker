// Cloudflare Worker: forwards /api/*, /auth/* and /healthz to the Cloud Run
// address, adding the shared secret and the client address the backend trusts.
// Settings (Worker variable and secret, see deploy/README.md):
//   CLOUD_RUN_ORIGIN    https address of Cloud Run, no path
//   PROXY_SHARED_SECRET same value as the backend setting

const TEXT = { "content-type": "text/plain; charset=utf-8" };

function text(status, body) {
  return new Response(body, { status, headers: TEXT });
}

// Returns the origin string, or null when the setting is missing or invalid.
function parseOrigin(value) {
  if (typeof value !== "string") return null;
  let u;
  try {
    u = new URL(value);
  } catch {
    return null;
  }
  if (
    u.protocol !== "https:" ||
    u.pathname !== "/" ||
    u.search !== "" ||
    u.hash !== "" ||
    u.username !== "" ||
    u.password !== ""
  ) {
    return null;
  }
  return u.origin;
}

function isForwarded(path) {
  return (
    path === "/healthz" || path.startsWith("/api/") || path.startsWith("/auth/")
  );
}

export default {
  async fetch(request, env) {
    const origin = parseOrigin(env?.CLOUD_RUN_ORIGIN);
    const secret = env?.PROXY_SHARED_SECRET;
    if (origin === null || typeof secret !== "string" || secret === "") {
      return text(503, "Proxy is not configured");
    }

    const incoming = new URL(request.url);
    if (!isForwarded(incoming.pathname)) {
      return text(404, "Not found");
    }

    // Plain concatenation: resolving against the origin could change the host.
    const url = origin + incoming.pathname + incoming.search;

    const headers = new Headers(request.headers);
    headers.delete("X-Proxy-Secret");
    headers.delete("X-Client-IP");
    headers.set("X-Proxy-Secret", secret);
    const clientIP = request.headers.get("CF-Connecting-IP");
    if (clientIP) {
      headers.set("X-Client-IP", clientIP);
    }

    const init = { method: request.method, headers, redirect: "manual" };
    if (request.body !== null) {
      init.body = request.body;
      init.duplex = "half";
    }

    try {
      return await fetch(new Request(url, init));
    } catch {
      return text(502, "Bad gateway");
    }
  },
};
