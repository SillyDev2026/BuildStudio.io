import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createBridge} from "../bridge/server.mjs";
import {templates} from "../docs/model.mjs";
const ORIGIN="https://sillydev2026.github.io";
async function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"bs-connect-test-"));
  const file=path.join(directory,"state.json"),code="ABCDEFGHJKLM";
  const bridge=createBridge({dataFile:file,code});
  const address=await bridge.listen(0),url="http://127.0.0.1:"+address.port;
  t.after(async()=>{await bridge.close();fs.rmSync(directory,{recursive:true,force:true});});
  async function send(endpoint,{method="GET",token="",role="",origin="",body}={}){
    const r=await fetch(url+endpoint,{method,headers:{...(origin?{Origin:origin}:{}),...(token?{Authorization:"Bearer "+token}:{}),...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
    return {status:r.status,headers:r.headers,body:await r.json()};
  }
  return {bridge,url,send,code,file};
}
test("local relay advertises health and hides credentials",async t=>{
  const f=await fixture(t);const r=await f.send("/health");
  assert.equal(r.status,200);assert.equal(r.body.service,"BuildStudio Local Bridge");
  assert.equal(JSON.stringify(r.body).includes(f.code),false);
  assert.equal((await f.send("/v1/state")).status,401);
});
test("pair browser and Studio, with origin restrictions",async t=>{
  const f=await fixture(t),body={code:f.code,role:"web"};
  assert.equal((await f.send("/v1/pair",{method:"POST",origin:"https://evil.example",body})).status,403);
  assert.equal((await f.send("/v1/pair",{method:"POST",body:{code:"WRONG",role:"web"}})).status,401);
  const web=await f.send("/v1/pair",{method:"POST",origin:ORIGIN,body});
  assert.equal(web.status,201);assert.match(web.body.token,/^[a-f0-9]{64}$/);
  assert.equal((await f.send("/v1/state",{token:web.body.token,origin:ORIGIN})).status,200);
  assert.equal((await f.send("/v1/state",{token:web.body.token,origin:"https://evil.example"})).status,403);
  assert.equal((await f.send("/v1/pair",{method:"POST",origin:ORIGIN,body:{code:f.code,role:"studio"}})).status,401);
  const studio=await f.send("/v1/pair",{method:"POST",body:{code:f.code,role:"studio"}});
  assert.equal(studio.status,201);
  assert.equal((await f.send("/v1/state",{token:studio.body.token,origin:ORIGIN})).status,403);
});
test("two way editing, revision conflicts, persisted snapshot",async t=>{
  const f=await fixture(t);
  const web=(await f.send("/v1/pair",{method:"POST",origin:ORIGIN,body:{code:f.code,role:"web"}})).body.token;
  const studio=(await f.send("/v1/pair",{method:"POST",body:{code:f.code,role:"studio"}})).body.token;
  const project={id:"project-test-1",name:"Starter HUD",data:templates.hud()};
  const save=await f.send("/v1/state",{method:"PUT",token:web,origin:ORIGIN,body:{revision:0,project}});
  assert.equal(save.status,200);assert.equal(save.body.revision,1);
  const pulled=await f.send("/v1/state",{token:studio});
  assert.equal(pulled.body.revision,1);assert.equal(pulled.body.project.data.nodes.length,project.data.nodes.length);
  const stale=await f.send("/v1/state",{method:"PUT",token:studio,body:{revision:0,project}});
  assert.equal(stale.status,409);
  project.data.nodes[0].name="EditedInStudio";
  const changed=await f.send("/v1/state",{method:"PUT",token:studio,body:{revision:1,project}});
  assert.equal(changed.status,200);assert.equal(changed.body.revision,2);
  const updated=await f.send("/v1/state",{token:web,origin:ORIGIN});
  assert.equal(updated.body.project.data.nodes[0].name,"EditedInStudio");
  assert.equal(updated.body.source,"studio");
  assert.ok(fs.existsSync(f.file));
  const stored=JSON.parse(fs.readFileSync(f.file,"utf8"));
  assert.equal(stored.revision,2);
  assert.equal(stored.project.data.nodes[0].name,"EditedInStudio");
  assert.equal(stored.clients.length,2);
  assert.ok(!JSON.stringify(stored).includes(web));
  assert.ok(!JSON.stringify(stored).includes(studio));
});
test("invalid projects and mismatched revisions are rejected",async t=>{
  const f=await fixture(t);
  const web=(await f.send("/v1/pair",{method:"POST",origin:ORIGIN,body:{code:f.code,role:"web"}})).body.token;
  const bad={id:"test",name:"Bad project",data:{nodes:[{id:"x",type:"Frame",name:"Frame",parent:"x",x:0,y:0,w:1,h:1,text:"",image:""}]}};
  assert.equal((await f.send("/v1/state",{method:"PUT",token:web,origin:ORIGIN,body:{revision:0,project:bad}})).status,422);
  assert.equal((await f.send("/v1/state",{method:"PUT",token:web,origin:ORIGIN,body:{revision:-1,project:bad}})).status,422);
});
