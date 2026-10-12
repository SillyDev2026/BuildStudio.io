import {test} from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.js";
test("worker health",async()=>{const r=await worker.fetch(new Request("https://api.example.com/health"),{});assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,service:"BuildStudio API"});});
test("worker CORS",async()=>{const env={FRONTEND_ORIGIN:"https://sillydev2026.github.io"};const r=await worker.fetch(new Request("https://api.example.com/api/projects",{headers:{Origin:"https://evil.example"}}),env);assert.equal(r.status,403);const p=await worker.fetch(new Request("https://api.example.com/api/projects",{method:"OPTIONS",headers:{Origin:env.FRONTEND_ORIGIN}}),env);assert.equal(p.status,204);assert.equal(p.headers.get("Access-Control-Allow-Origin"),env.FRONTEND_ORIGIN);});
test("D1 required",async()=>{const env={FRONTEND_ORIGIN:"https://sillydev2026.github.io"};const r=await worker.fetch(new Request("https://api.example.com/api/projects",{headers:{Origin:env.FRONTEND_ORIGIN}}),env);assert.equal(r.status,503);});
