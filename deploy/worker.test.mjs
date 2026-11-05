import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.mjs";

const SECRET = "0123456789abcdef0123456789abcdef";
const ENV = { CLOUD_RUN_ORIGIN: "https://run.example", PROXY_SHARED_SECRET: SECRET };
const TEXT_TYPE = "text/plain; charset=utf-8";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Stubs global fetch; records the single Request it receives.
function stub(respond = () => new Response("ok")) {
  const calls = [];
  globalThis.fetch = async (...args) => {
    assert.equal(args.length, 1);
    calls.push(args[0]);
    return respond(args[0]);
  };
  return calls;
}

function call(path, init = {}, env = ENV) {
  return worker.fetch(new Request("https://app.example" + path, init), env);
}

test("forwards path and query unchanged", async () => {
  const calls = stub();
  await call("/api/v1/bookmarks?q=a%20b");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://run.example/api/v1/bookmarks?q=a%20b");
  assert.equal(calls[0].method, "GET");
});

test("forwards POST body, method and Content-Type", async () => {
  const calls = stub();
  const body = JSON.stringify({ url: "https://example.com" });
  await call("/api/v1/bookmarks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  assert.equal(calls[0].method, "POST");
  assert.equal(await calls[0].text(), body);
  assert.equal(calls[0].headers.get("content-type"), "application/json");
});

test("forwards auth and healthz calls", async () => {
  const calls = stub();
  await call("/auth/login?return_to=%2Ftrash");
  await call("/auth/logout", { method: "POST" });
  await call("/healthz");
  await call("/healthz?probe=1");
  assert.deepEqual(
    calls.map((c) => [c.method, c.url]),
    [
      ["GET", "https://run.example/auth/login?return_to=%2Ftrash"],
      ["POST", "https://run.example/auth/logout"],
      ["GET", "https://run.example/healthz"],
      ["GET", "https://run.example/healthz?probe=1"],
    ],
  );
});

test("redirect of the forwarded request is manual", async () => {
  const calls = stub();
  await call("/auth/callback?code=x");
  assert.equal(calls[0].redirect, "manual");
});

test("replaces a client X-Proxy-Secret with the secret", async () => {
  const calls = stub();
  await call("/api/v1/x", { headers: { "X-Proxy-Secret": "evil" } });
  assert.equal(calls[0].headers.get("x-proxy-secret"), SECRET);
});

test("two client X-Proxy-Secret values collapse to the secret", async () => {
  const calls = stub();
  const headers = new Headers();
  headers.append("X-Proxy-Secret", "evil");
  headers.append("X-Proxy-Secret", "worse");
  await call("/api/v1/x", { headers });
  assert.equal(calls[0].headers.get("x-proxy-secret"), SECRET);
});

test("drops a client X-Client-IP when CF-Connecting-IP is absent", async () => {
  const calls = stub();
  await call("/api/v1/x", { headers: { "X-Client-IP": "6.6.6.6" } });
  assert.equal(calls[0].headers.has("x-client-ip"), false);
});

test("empty CF-Connecting-IP sends no X-Client-IP", async () => {
  const calls = stub();
  await call("/api/v1/x", {
    headers: { "CF-Connecting-IP": "", "X-Client-IP": "6.6.6.6" },
  });
  assert.equal(calls[0].headers.has("x-client-ip"), false);
});

test("sets X-Client-IP from CF-Connecting-IP only", async () => {
  const calls = stub();
  await call("/api/v1/x", {
    headers: { "CF-Connecting-IP": "203.0.113.9", "X-Client-IP": "6.6.6.6" },
  });
  assert.equal(calls[0].headers.get("x-client-ip"), "203.0.113.9");
});

test("passes other headers unchanged", async () => {
  const calls = stub();
  const sent = {
    Origin: "https://app.example",
    Cookie: "sid=abc; csrf=def",
    "Content-Type": "application/json",
    "X-CSRF-Token": "tok",
    "User-Agent": "test-agent/1.0",
  };
  await call("/api/v1/x", { method: "POST", headers: sent, body: "{}" });
  for (const [name, value] of Object.entries(sent)) {
    assert.equal(calls[0].headers.get(name), value, name);
  }
});

test("a 302 keeps Location and both Set-Cookie headers", async () => {
  const upstream = new Response(null, { status: 302 });
  upstream.headers.set("Location", "/login?error=login_failed");
  upstream.headers.append("Set-Cookie", "a=1; Path=/; HttpOnly");
  upstream.headers.append("Set-Cookie", "b=2; Path=/; HttpOnly");
  stub(() => upstream);
  const res = await call("/auth/callback?code=x");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/login?error=login_failed");
  assert.deepEqual(res.headers.getSetCookie(), [
    "a=1; Path=/; HttpOnly",
    "b=2; Path=/; HttpOnly",
  ]);
});

test("upstream answers come back unchanged", async () => {
  const cases = [
    new Response('{"a":1}', { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(null, { status: 204 }),
    new Response('{"code":"not_found"}', {
      status: 404,
      headers: { "Content-Type": "application/problem+json" },
    }),
    new Response("slow down", { status: 429, headers: { "Retry-After": "30" } }),
  ];
  for (const upstream of cases) {
    const expectedBody = upstream.body === null ? "" : await upstream.clone().text();
    stub(() => upstream);
    const res = await call("/api/v1/x");
    assert.equal(res.status, upstream.status);
    assert.equal(await res.text(), expectedBody);
    for (const [k, v] of upstream.headers) {
      assert.equal(res.headers.get(k), v);
    }
  }
});

test("returns the very object fetch gave it", async () => {
  const upstream = new Response("x");
  stub(() => upstream);
  assert.equal(await call("/api/v1/x"), upstream);
});

test("answers 502 when fetch rejects", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("connection refused");
  };
  const res = await call("/api/v1/x");
  assert.equal(res.status, 502);
  assert.equal(res.headers.get("content-type"), TEXT_TYPE);
  assert.equal(await res.text(), "Bad gateway");
});

test("paths outside the three are answered 404 and not forwarded", async () => {
  const calls = stub();
  const paths = [
    "/", "/login", "/api", "/apix", "/authx", "/auth", "/healthz/",
    "/healthz/x", "/%61pi/x", "/api/../login", "/api/%2e%2e/login",
    "/api/%2E%2e/x", "//evil.example/api/x",
  ];
  for (const p of paths) {
    const res = await call(p);
    assert.equal(res.status, 404, p);
    assert.equal(res.headers.get("content-type"), TEXT_TYPE, p);
    assert.equal(await res.text(), "Not found", p);
  }
  assert.equal(calls.length, 0);
});

test("a path starting /api// is concatenated, host unchanged", async () => {
  const calls = stub();
  await call("/api//x");
  assert.equal(calls[0].url, "https://run.example/api//x");
});

test("/api/ with nothing after it is forwarded", async () => {
  const calls = stub();
  await call("/api/");
  assert.equal(calls[0].url, "https://run.example/api/");
});

test("HEAD is forwarded as is", async () => {
  const calls = stub();
  await call("/healthz", { method: "HEAD" });
  assert.equal(calls[0].method, "HEAD");
});

test("a misconfigured Worker answers 503 and forwards nothing", async () => {
  const bad = [
    { PROXY_SHARED_SECRET: SECRET },
    { CLOUD_RUN_ORIGIN: "http://run.example", PROXY_SHARED_SECRET: SECRET },
    { CLOUD_RUN_ORIGIN: "https://run.example/path", PROXY_SHARED_SECRET: SECRET },
    { CLOUD_RUN_ORIGIN: "https://run.example?x=1", PROXY_SHARED_SECRET: SECRET },
    { CLOUD_RUN_ORIGIN: "https://run.example#f", PROXY_SHARED_SECRET: SECRET },
    { CLOUD_RUN_ORIGIN: "https://u:p@run.example", PROXY_SHARED_SECRET: SECRET },
    { CLOUD_RUN_ORIGIN: "not a url", PROXY_SHARED_SECRET: SECRET },
    { CLOUD_RUN_ORIGIN: "https://run.example" },
    { CLOUD_RUN_ORIGIN: "https://run.example", PROXY_SHARED_SECRET: "" },
  ];
  const calls = stub();
  for (const env of bad) {
    for (const p of ["/api/v1/x", "/"]) {
      const res = await call(p, {}, env);
      assert.equal(res.status, 503, JSON.stringify(env));
      assert.equal(res.headers.get("content-type"), TEXT_TYPE);
      assert.equal(await res.text(), "Proxy is not configured");
    }
  }
  assert.equal(calls.length, 0);
});

test("origin with a trailing slash or a port works", async () => {
  const calls = stub();
  await call("/api/v1/x", {}, { ...ENV, CLOUD_RUN_ORIGIN: "https://run.example/" });
  await call("/api/v1/x", {}, { ...ENV, CLOUD_RUN_ORIGIN: "https://run.example:8443" });
  assert.equal(calls[0].url, "https://run.example/api/v1/x");
  assert.equal(calls[1].url, "https://run.example:8443/api/v1/x");
});

test("the secret is not in the Worker's own answers", async () => {
  globalThis.fetch = async () => {
    throw new Error("boom " + SECRET);
  };
  const responses = [
    await call("/nope"),
    await call("/api/v1/x"),
    await call("/api/v1/x", {}, { ...ENV, CLOUD_RUN_ORIGIN: "http://run.example" }),
  ];
  for (const res of responses) {
    assert.equal((await res.text()).includes(SECRET), false);
    for (const [k, v] of res.headers) {
      assert.equal((k + v).includes(SECRET), false);
    }
  }
});
