const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function tokenOf(v) {
  return String(v || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function mergeState(oldS, newS) {
  const out = { ...(oldS || {}) };
  for (const [key, nv] of Object.entries(newS || {})) {
    const ov = out[key];
    if (!nv) continue;
    if (!ov || (nv.done && (!ov.done || String(nv.date || "") >= String(ov.date || "")))) {
      const merged = { ...(ov || {}), ...nv };
      if (!nv.photo && ov && ov.photo) merged.photo = ov.photo;
      out[key] = merged;
    }
  }
  return out;
}

function mergeRoom(prev, incoming) {
  const token = tokenOf(incoming.token || prev.token);
  const books = { ...(prev.books || {}) };
  for (const [name, book] of Object.entries(incoming.books || {})) {
    if (!name || name === "root") continue;
    const old = books[name] || { state: {} };
    books[name] = {
      pin: book.pin || old.pin || "0000",
      state: mergeState(old.state || {}, book.state || {}),
      updated: book.updated || old.updated,
    };
  }
  return { v: 2, token, books };
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response("", { status: 204, headers: CORS });

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (path === "/" || path === "/health") return json({ ok: true, service: "myungsan-stamp" });
    if (path !== "/sync") return json({ ok: false, error: "not_found" }, 404);
    if (!env.STAMP) return json({ ok: false, error: "no_kv" }, 500);

    try {
      if (req.method === "GET") {
        const token = tokenOf(url.searchParams.get("token"));
        if (token.length < 4) return json({ ok: false, error: "token" }, 400);
        const raw = await env.STAMP.get(`stamp:${token}`);
        if (!raw) return json({ v: 2, token, books: {} });
        return json(JSON.parse(raw));
      }

      if (req.method === "POST") {
        const incoming = await req.json().catch(() => ({}));
        const token = tokenOf(incoming.token);
        if (token.length < 4) return json({ ok: false, error: "token" }, 400);
        const raw = await env.STAMP.get(`stamp:${token}`);
        const prev = raw ? JSON.parse(raw) : { v: 2, token, books: {} };
        const room = mergeRoom(prev, incoming);
        await env.STAMP.put(`stamp:${token}`, JSON.stringify(room));
        return json({ ok: true, token: room.token, people: Object.keys(room.books || {}).length });
      }

      return json({ ok: false, error: "method" }, 405);
    } catch (e) {
      return json({ ok: false, error: "server" }, 500);
    }
  },
};