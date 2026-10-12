
const encoder = new TextEncoder();
const now = () => Date.now();
const send = (value, status=200) => Response.json(value, {status, headers: {"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const fail = (message,status=400) => send({error:message},status);
const hex = bytes => Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const digest = async text => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text))));
const TYPES = new Set(["Frame","CanvasGroup","TextLabel","TextButton","TextBox","ImageLabel","ImageButton","ScrollingFrame"]);
const CONTAINERS = new Set(["Frame","CanvasGroup","ScrollingFrame"]);
function validate(payload) {
  if (!payload || typeof payload.name !== "string" || !payload.name.trim() || payload.name.length > 100 || !payload.data || !Array.isArray(payload.data.nodes) || payload.data.nodes.length > 500) return null;
  const map = new Map();
  for (const n of payload.data.nodes) {
    if (!n || !n.id || typeof n.id !== "string" || n.id.length > 100 || map.has(n.id) || !TYPES.has(n.type) || typeof n.name !== "string" || typeof n.text !== "string" || typeof n.image !== "string") return null;
    if (!["x","y","w","h"].every(k=>Number.isFinite(n[k]) && n[k]>=-1 && n[k]<=4)) return null;
    if (n.text.length > 5000 || n.image.length > 500 || n.name.length > 120) return null;
    for (const key of ["anchorX","anchorY","rotation","zIndex","opacity","radius","border","fontSize","stroke","aspect","padding"]) if (n[key] !== undefined && (!Number.isFinite(n[key]) || Math.abs(n[key]) > 10000)) return null;
    for (const key of ["color","textColor","borderColor","strokeColor"]) if (n[key] !== undefined && (typeof n[key] !== "string" || !/^#[0-9a-fA-F]{6}$/.test(n[key]))) return null;
    if (n.layout !== undefined && !["none","vertical","horizontal","grid"].includes(n.layout)) return null;
    map.set(n.id,n);
  }
  for (const n of map.values()) {
    let p = n.parent == null ? null : n.parent;
    const seen = new Set([n.id]);
    while (p !== null) {
      if (seen.has(p)) return null;
      seen.add(p);
      const parent = map.get(p);
      if (!parent || !CONTAINERS.has(parent.type)) return null;
      p = parent.parent == null ? null : parent.parent;
    }
  }
  return {name:payload.name.trim(), data:{version:1,name:payload.name.trim(),nodes:payload.data.nodes}};
}
async function readBody(request) {
  if (Number(request.headers.get("Content-Length")||0)>150000) throw new RangeError("Payload too large");
  const text = await request.text();
  if (encoder.encode(text).length>150000) throw new RangeError("Payload too large");
  return JSON.parse(text);
}
function headersFor(request,env) {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  if (origin!==env.FRONTEND_ORIGIN) return null;
  return {"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET,POST,PUT,DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type,Authorization","Vary":"Origin"};
}
function decorate(response,headers) {
  const copy = new Response(response.body,response);
  for (const [key,value] of Object.entries(headers)) copy.headers.set(key,value);
  copy.headers.set("Cache-Control","no-store");
  return copy;
}
async function userFor(request,env) {
  const authorization = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get("Authorization")||"");
  if (!authorization) return null;
  return env.DB.prepare("SELECT u.github_id,u.login FROM sessions s JOIN users u ON u.github_id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(await digest(authorization[1]),now()).first();
}
function rowUser(u) { return {id:u.github_id,login:u.login}; }
function rowProject(p,full=false) {return {id:p.id,name:p.name,created_at:new Date(p.created_at).toISOString(),updated_at:new Date(p.updated_at).toISOString(),...(full?{data:JSON.parse(p.doc_json)}:{})};}
async function login(request,env) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.FRONTEND_URL) return fail("GitHub OAuth is not configured",503);
  const state = random();
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id",env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri",new URL("/auth/github/callback",request.url).href);
  url.searchParams.set("state",state);
  url.searchParams.set("scope","read:user");
  return new Response(null,{status:302,headers:{Location:url.href,"Cache-Control":"no-store","Set-Cookie":"bs_state="+state+"; Path=/auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax"}});
}
async function callback(request,env) {
  const url = new URL(request.url);
  const cookie = /(?:^|;\s*)bs_state=([0-9a-f]{64})(?:;|$)/.exec(request.headers.get("Cookie")||"")?.[1];
  if (!cookie || cookie!==url.searchParams.get("state") || url.searchParams.has("error")) return fail("Invalid OAuth state",400);
  const code = url.searchParams.get("code");
  if (!code) return fail("Missing OAuth code",400);
  const exchange = await fetch("https://github.com/login/oauth/access_token",{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json","User-Agent":"BuildStudio-io"},body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code,redirect_uri:new URL("/auth/github/callback",request.url).href})});
  const token = await exchange.json();
  if (!exchange.ok || !token.access_token) return fail("GitHub login failed",401);
  const profileResponse = await fetch("https://api.github.com/user",{headers:{"Authorization":"Bearer "+token.access_token,"Accept":"application/vnd.github+json","User-Agent":"BuildStudio-io","X-GitHub-Api-Version":"2022-11-28"}});
  const profile = await profileResponse.json();
  if (!profileResponse.ok || !profile.id || !profile.login) return fail("Unable to get GitHub user",401);
  const id = String(profile.id), time = now();
  await env.DB.prepare("INSERT INTO users (github_id,login,created_at) VALUES (?,?,?) ON CONFLICT(github_id) DO UPDATE SET login=excluded.login").bind(id,String(profile.login).slice(0,100),time).run();
  const ticket = random();
  await env.DB.prepare("INSERT INTO oauth_tickets (ticket_hash,user_id,expires_at) VALUES (?,?,?)").bind(await digest(ticket),id,time+90000).run();
  return new Response(null,{status:302,headers:{Location:String(env.FRONTEND_URL).split("#")[0]+"#auth="+ticket,"Cache-Control":"no-store","Referrer-Policy":"no-referrer","Set-Cookie":"bs_state=; Path=/auth; Max-Age=0; HttpOnly; Secure; SameSite=Lax"}});
}
async function api(request,env,path) {
  if (path==="/api/auth/exchange" && request.method==="POST") {
    const body = await readBody(request);
    if (!/^[0-9a-f]{64}$/.test(body?.ticket||"")) return fail("Invalid sign-in ticket",401);
    const ticket = await env.DB.prepare("UPDATE oauth_tickets SET used_at=? WHERE ticket_hash=? AND used_at IS NULL AND expires_at>? RETURNING user_id").bind(now(),await digest(body.ticket),now()).first();
    if (!ticket) return fail("Expired or used ticket",401);
    const secret = random(), expires = now()+14*86400000;
    await env.DB.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").bind(await digest(secret),ticket.user_id,expires).run();
    const u = await env.DB.prepare("SELECT github_id,login FROM users WHERE github_id=?").bind(ticket.user_id).first();
    return send({token:secret,user:rowUser(u),expires_in:1209600});
  }
  const user = await userFor(request,env);
  if (!user) return fail("Sign in with GitHub first",401);
  if (path==="/api/me" && request.method==="GET") return send({user:rowUser(user)});
  if (path==="/api/logout" && request.method==="POST") {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await digest((request.headers.get("Authorization")||"").slice(7))).run();
    return send({ok:true});
  }
  if (path==="/api/projects" && request.method==="GET") {
    const rows = await env.DB.prepare("SELECT id,name,created_at,updated_at FROM projects WHERE user_id=? ORDER BY updated_at DESC LIMIT 50").bind(user.github_id).all();
    return send({projects:rows.results.map(p=>rowProject(p))});
  }
  if (path==="/api/projects" && request.method==="POST") {
    const cleaned = validate(await readBody(request));
    if (!cleaned) return fail("Invalid project format",422);
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM projects WHERE user_id=?").bind(user.github_id).first();
    if (count.total>=50) return fail("Limit of 50 projects reached",409);
    const id = crypto.randomUUID(),time=now();
    await env.DB.prepare("INSERT INTO projects (id,user_id,name,doc_json,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(id,user.github_id,cleaned.name,JSON.stringify(cleaned.data),time,time).run();
    return send({project:{id,name:cleaned.name,created_at:new Date(time).toISOString(),updated_at:new Date(time).toISOString()}},201);
  }
  const match = /^\/api\/projects\/([a-f0-9-]{36})$/.exec(path);
  if (match) {
    const row = await env.DB.prepare("SELECT * FROM projects WHERE id=? AND user_id=?").bind(match[1],user.github_id).first();
    if (!row) return fail("Cloud project not found",404);
    if (request.method==="GET") return send({project:rowProject(row,true)});
    if (request.method==="DELETE") {await env.DB.prepare("DELETE FROM projects WHERE id=? AND user_id=?").bind(row.id,user.github_id).run();return send({ok:true});}
    if (request.method==="PUT") {
      const payload = await readBody(request);
      const cleaned = validate(payload);
      if (!cleaned) return fail("Invalid project format",422);
      if (payload.expected_updated_at && payload.expected_updated_at !== new Date(row.updated_at).toISOString()) return fail("Cloud project changed since you last opened it. Reload before saving.",409);
      const time = Math.max(now(),row.updated_at+1);
      await env.DB.prepare("UPDATE projects SET name=?,doc_json=?,updated_at=? WHERE id=? AND user_id=?").bind(cleaned.name,JSON.stringify(cleaned.data),time,row.id,user.github_id).run();
      return send({project:{id:row.id,name:cleaned.name,created_at:new Date(row.created_at).toISOString(),updated_at:new Date(time).toISOString()}});
    }
  }
  return fail("Endpoint not found",404);
}
export default {
  async fetch(request,env) {
    const path = new URL(request.url).pathname;
    try {
      if (path==="/health" && request.method==="GET") return send({ok:true,service:"BuildStudio API"});
      if (path.startsWith("/api/")) {
        const cors = headersFor(request,env);
        if (cors===null) return fail("Origin not allowed",403);
        if (request.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
        if (!env.DB) return decorate(fail("D1 database is not configured",503),cors);
        return decorate(await api(request,env,path),cors);
      }
      if (path==="/auth/github" && request.method==="GET") return env.DB?login(request,env):fail("D1 is not configured",503);
      if (path==="/auth/github/callback" && request.method==="GET") return env.DB?callback(request,env):fail("D1 is not configured",503);
      return fail("Endpoint not found",404);
    } catch(e) {
      console.error("BuildStudio Worker error",e?.message||"unknown");
      const status = e instanceof SyntaxError?400:e instanceof RangeError?413:500;
      return decorate(fail(status===400?"Invalid JSON":status===413?"Payload too large":"Internal server error",status),headersFor(request,env)||{});
    }
  }
};
