// Collab.io API v0.2 — Cloudflare Worker. All security decisions occur server side.
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const MAX_PROJECT_BYTES = 240000;
function stamp() { return Math.floor(Date.now() / 1000); }
function randomText() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
async function hash(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });
}
function fail(code, status = 400) { return json({ error: code }, status); }
function allowOrigin(env) {
  try { return new URL(env.PUBLIC_ORIGIN).origin; } catch (_) { return ""; }
}
function cors(request, response, env) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("Origin");
  if (origin && origin === allowOrigin(env)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    headers.set("Vary", "Origin");
  }
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(response.body, { status: response.status, headers });
}
async function parseJson(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().includes("application/json")) throw Error("invalid_content_type");
  const limit = Number(request.headers.get("content-length") || 0);
  if (limit > MAX_PROJECT_BYTES) throw Error("payload_too_large");
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_PROJECT_BYTES) throw Error("payload_too_large");
  try { return JSON.parse(body); } catch (_) { throw Error("invalid_json"); }
}
async function getUser(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);
  if (!match) return null;
  return env.DB.prepare(
    "SELECT u.id, u.login, u.avatar_url, u.display_name, s.expires_at FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?"
  ).bind(await hash(match[1]), stamp()).first();
}
async function membership(env, projectId, userId) {
  return env.DB.prepare("SELECT m.role,p.id,p.owner_id,p.name,p.description,p.revision,p.scripts_json,p.updated_at FROM project_members m JOIN projects p ON p.id=m.project_id WHERE m.project_id=? AND m.user_id=?")
    .bind(projectId, userId).first();
}
function presentProject(p, includeScripts = false) {
  const item = { id: p.id, name: p.name, description: p.description, revision: p.revision, updated_at: p.updated_at, role: p.role };
  if (includeScripts) item.scripts = JSON.parse(p.scripts_json || "[]");
  return item;
}
function validScripts(value) {
  return Array.isArray(value) && value.length <= 100 && value.every(item =>
    item && typeof item === "object" && typeof item.name === "string" && item.name.length <= 160 &&
    /^[\w .-]+\.luau$/.test(item.name) && typeof item.source === "string" && item.source.length <= 120000
  ) && new TextEncoder().encode(JSON.stringify(value)).byteLength <= 210000;
}
async function githubStart(request, env) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.DB || !allowOrigin(env)) return fail("oauth_not_configured", 503);
  const state = randomText();
  const verifier = randomText();
  const challenge = await hash(verifier);
  await env.DB.prepare("INSERT INTO oauth_states(state_hash,verifier,expires_at) VALUES (?,?,?)")
    .bind(await hash(state), verifier, stamp() + 600).run();
  const redirect = new URL("/auth/github/callback", request.url).href;
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // No repository or organization access scopes are requested for authentication.
  return new Response(null, {
    status: 302,
    headers: { Location: url.href, "Set-Cookie": "collab_oauth=" + state + "; Path=/auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }
  });
}
async function githubCallback(request, env) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const cookie = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)collab_oauth=([^;]+)/)?.[1] || "";
  if (!state || !code || !cookie || cookie !== state || !/^[A-Za-z0-9_-]{43}$/.test(state)) return fail("invalid_oauth_state", 400);
  const consumed = await env.DB.prepare("DELETE FROM oauth_states WHERE state_hash=? AND expires_at>? RETURNING verifier")
    .bind(await hash(state), stamp()).first();
  if (!consumed) return fail("expired_oauth_state", 400);
  const redirect = new URL("/auth/github/callback", request.url).href;
  const body = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    code: code,
    redirect_uri: redirect,
    code_verifier: consumed.verifier
  });
  const authResp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString()
  });
  if (!authResp.ok) return fail("github_token_exchange_failed", 502);
  const auth = await authResp.json();
  if (!auth.access_token) return fail("github_oauth_rejected", 401);
  const githubResp = await fetch("https://api.github.com/user", {
    headers: { "Authorization": "Bearer " + auth.access_token, "Accept": "application/vnd.github+json", "User-Agent": "Collab-io" }
  });
  if (!githubResp.ok) return fail("github_profile_failed", 502);
  const gh = await githubResp.json();
  if (!Number.isSafeInteger(gh.id) || !gh.login) return fail("invalid_github_profile", 502);
  const now = stamp();
  await env.DB.prepare(
    "INSERT INTO users(id,login,avatar_url,display_name,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET login=excluded.login, avatar_url=excluded.avatar_url, display_name=excluded.display_name, updated_at=excluded.updated_at"
  ).bind(gh.id, String(gh.login).slice(0, 100), String(gh.avatar_url || "").slice(0, 500), String(gh.name || gh.login).slice(0, 160), now, now).run();
  const ticket = randomText();
  await env.DB.prepare("INSERT INTO auth_tickets(ticket_hash,user_id,expires_at) VALUES(?,?,?)")
    .bind(await hash(ticket), gh.id, now + 90).run();
  const destination = env.PUBLIC_ORIGIN.replace(/#.*$/, "").replace(/\/?$/, "/") + "#/overview?auth_ticket=" + ticket;
  return new Response(null, {
    status: 302,
    headers: { Location: destination, "Set-Cookie": "collab_oauth=; Path=/auth; Max-Age=0; HttpOnly; Secure; SameSite=Lax", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }
  });
}
async function exchangeTicket(request, env) {
  const body = await parseJson(request);
  const ticket = typeof body.ticket === "string" ? body.ticket : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) return fail("invalid_ticket", 401);
  const record = await env.DB.prepare("DELETE FROM auth_tickets WHERE ticket_hash=? AND expires_at>? RETURNING user_id")
    .bind(await hash(ticket), stamp()).first();
  if (!record) return fail("ticket_expired_or_used", 401);
  const token = randomText();
  const expiresAt = stamp() + 7 * 86400;
  await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)")
    .bind(await hash(token), record.user_id, expiresAt).run();
  const user = await env.DB.prepare("SELECT id,login,avatar_url,display_name FROM users WHERE id=?").bind(record.user_id).first();
  return json({ token, user, expires_at: expiresAt });
}
async function routes(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "GET" && path === "/health") return json({ ok: true, version: "0.2.0", configured: !!(env.DB && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) });
  if (path === "/auth/github/start" && request.method === "GET") return githubStart(request, env);
  if (path === "/auth/github/callback" && request.method === "GET") return githubCallback(request, env);
  if (!env.DB) return fail("database_not_configured", 503);
  if (path === "/auth/exchange" && request.method === "POST") return exchangeTicket(request, env);
  const user = await getUser(request, env);
  if (!user) return fail("unauthorized", 401);
  if (path === "/auth/me" && request.method === "GET") return json({ user: { id: user.id, login: user.login, avatar_url: user.avatar_url, display_name: user.display_name }, expires_at: user.expires_at });
  if (path === "/auth/logout" && request.method === "POST") {
    const token = /^Bearer (.+)$/.exec(request.headers.get("Authorization") || "")?.[1] || "";
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await hash(token)).run();
    return json({ ok: true });
  }
  if (path === "/api/projects" && request.method === "GET") {
    const query = await env.DB.prepare("SELECT p.id,p.name,p.description,p.revision,p.updated_at,m.role FROM project_members m JOIN projects p ON p.id=m.project_id WHERE m.user_id=? ORDER BY p.updated_at DESC LIMIT 100")
      .bind(user.id).all();
    return json({ projects: query.results || [] });
  }
  if (path === "/api/projects" && request.method === "POST") {
    const body = await parseJson(request);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const scripts = body.scripts === undefined ? [] : body.scripts;
    if (!name || name.length > 100 || description.length > 500 || !validScripts(scripts)) return fail("invalid_project_data");
    const id = crypto.randomUUID();
    const now = stamp();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO projects(id,owner_id,name,description,scripts_json,revision,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)")
        .bind(id, user.id, name, description, JSON.stringify(scripts), now, now),
      env.DB.prepare("INSERT INTO project_members(project_id,user_id,role) VALUES (?,?,?)")
        .bind(id, user.id, "owner")
    ]);
    return json({ project: { id, name, description, revision: 1, updated_at: now, role: "owner" } }, 201);
  }
  const match = /^\/api\/projects\/([0-9a-f-]{36})$/.exec(path);
  if (match) {
    const record = await membership(env, match[1], user.id);
    if (!record) return fail("project_not_found", 404);
    if (request.method === "GET") return json({ project: presentProject(record, true) });
    if (request.method === "PUT") {
      if (record.role !== "owner" && record.role !== "editor") return fail("forbidden", 403);
      const body = await parseJson(request);
      const revision = Number(body.expected_revision);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      if (!Number.isSafeInteger(revision) || revision < 1 || !name || name.length > 100 || description.length > 500 || !validScripts(body.scripts)) return fail("invalid_project_data");
      const result = await env.DB.prepare("UPDATE projects SET name=?,description=?,scripts_json=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?")
        .bind(name, description, JSON.stringify(body.scripts), stamp(), record.id, revision).run();
      if (!result.meta.changes) return json({ error: "revision_conflict", current_revision: record.revision }, 409);
      return json({ ok: true, revision: revision + 1 });
    }
  }
  const memberMatch = /^\/api\/projects\/([0-9a-f-]{36})\/members$/.exec(path);
  if (memberMatch) {
    const record = await membership(env, memberMatch[1], user.id);
    if (!record) return fail("project_not_found", 404);
    if (request.method === "GET") {
      const rows = await env.DB.prepare("SELECT u.id,u.login,u.avatar_url,m.role FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,u.login")
        .bind(record.id).all();
      return json({ members: rows.results || [] });
    }
    if (request.method === "POST") {
      if (record.role !== "owner") return fail("forbidden", 403);
      const body = await parseJson(request);
      const login = typeof body.login === "string" ? body.login.trim() : "";
      const role = body.role;
      if (!/^[A-Za-z0-9-]{1,39}$/.test(login) || !["editor", "viewer"].includes(role)) return fail("invalid_member");
      const member = await env.DB.prepare("SELECT id FROM users WHERE login=? COLLATE NOCASE").bind(login).first();
      if (!member) return fail("user_must_sign_in_first", 404);
      if (member.id === record.owner_id) return fail("owner_role_cannot_change", 409);
      await env.DB.prepare("INSERT INTO project_members(project_id,user_id,role) VALUES (?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET role=excluded.role")
        .bind(record.id, member.id, role).run();
      return json({ ok: true });
    }
  }
  return fail("not_found", 404);
}
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      if (request.headers.get("Origin") !== allowOrigin(env)) return fail("origin_not_allowed", 403);
      return cors(request, new Response(null, { status: 204 }), env);
    }
    // Only the configured website may call the browser API from cross-origin JS.
    if (request.headers.get("Origin") && request.headers.get("Origin") !== allowOrigin(env)) return fail("origin_not_allowed", 403);
    try { return cors(request, await routes(request, env), env); }
    catch (error) {
      if (["invalid_content_type", "payload_too_large", "invalid_json"].includes(error.message)) return cors(request, fail(error.message, error.message === "payload_too_large" ? 413 : 400), env);
      console.error("Collab.io server failure", String(error));
      return cors(request, fail("internal_error", 500), env);
    }
  }
};
