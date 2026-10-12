// BuildStudio Studio Connect v1.1 — local-only synchronization relay (no cloud account).
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {validateProject,normalizeProject} from "../docs/model.mjs";

export const PORT=38471;
const ALLOWED_ORIGINS=new Set(["https://sillydev2026.github.io","http://localhost:8000","http://127.0.0.1:8000"]);
const MAX_BODY=200000;
const cleanToken=value=>typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);
const hash=value=>crypto.createHash("sha256").update(value).digest("hex");
const pairAlphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const pairCode=()=>Array.from(crypto.randomBytes(12),b=>pairAlphabet[b%pairAlphabet.length]).join("");
const now=()=>Date.now();
const emptyState=()=>({revision:0,project:null,updatedAt:0,source:"none",clients:[],presence:{web:0,studio:0}});
const json=(res,code,value,headers={})=>{res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...headers});res.end(JSON.stringify(value));};
function readJSON(req){
  return new Promise((resolve,reject)=>{
    let size=0,chunks=[];
    req.on("data",chunk=>{size+=chunk.length;if(size>MAX_BODY){reject(Object.assign(new Error("Request too large"),{status:413}));req.destroy();return;}chunks.push(chunk);});
    req.on("end",()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch{reject(Object.assign(new Error("Invalid JSON"),{status:400}));}});
    req.on("error",reject);
  });
}
function validDocument(raw){
  if(!raw||typeof raw!=="object"||typeof raw.name!=="string"||raw.name.length<1||raw.name.length>70||typeof raw.id!=="string"||raw.id.length<1||raw.id.length>100||!validateProject(raw.data))return null;
  const data=normalizeProject(raw.data);
  return {id:raw.id,name:raw.name.trim(),data};
}
export function createBridge({dataFile=path.join(os.homedir(),".buildstudio-connect","state.json"),code=pairCode()}={}){
  let state=emptyState(),failedAttempts=0,failedReset=0,dirty=false;
  try{
    const old=JSON.parse(fs.readFileSync(dataFile,"utf8"));
    if(old && typeof old==="object" && Array.isArray(old.clients)){
      state.clients=old.clients.filter(c=>cleanToken(c.hash)&&["web","studio"].includes(c.role)).slice(0,30);
      if(Number.isSafeInteger(old.revision)&&old.revision>=0&&(!old.project||validDocument(old.project))){
        state.revision=old.revision;state.project=old.project||null;state.updatedAt=old.updatedAt||0;state.source=old.source||"none";
      }
    }
  }catch{}
  const save=()=>{
    fs.mkdirSync(path.dirname(dataFile),{recursive:true,mode:0o700});
    const temp=dataFile+".tmp";
    fs.writeFileSync(temp,JSON.stringify({...state,presence:undefined}),{mode:0o600});
    fs.renameSync(temp,dataFile);
    dirty=false;
  };
  const authorize=req=>{
    const matched=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization||"");
    if(!matched)return null;
    const digest=hash(matched[1]);
    return state.clients.find(c=>c.hash===digest)||null;
  };
  const server=http.createServer(async(req,res)=>{
    const origin=req.headers.origin;
    if(origin && !ALLOWED_ORIGINS.has(origin)){json(res,403,{error:"This browser origin is not allowed"});return;}
    const cors=origin?{
      "Access-Control-Allow-Origin":origin,
      "Access-Control-Allow-Headers":"Content-Type,Authorization",
      "Access-Control-Allow-Methods":"GET,POST,PUT,OPTIONS",
      "Access-Control-Allow-Private-Network":"true",
      "Vary":"Origin"
    }:{};
    if(req.method==="OPTIONS"){res.writeHead(204,cors);res.end();return;}
    const url=new URL(req.url||"/","http://127.0.0.1");
    if(url.pathname==="/health"&&req.method==="GET"){json(res,200,{ok:true,service:"BuildStudio Local Bridge",version:"1.1.0",paired:state.clients.length>0},cors);return;}
    if(url.pathname==="/v1/pair"&&req.method==="POST"){
      const stamp=now();
      if(stamp-failedReset>60000){failedAttempts=0;failedReset=stamp;}
      if(failedAttempts>=12){json(res,429,{error:"Too many pairing attempts. Try again in one minute."},cors);return;}
      try{
        const body=await readJSON(req),role=body?.role;
        if(!["web","studio"].includes(role)||body?.code!==code||(role==="studio"&&origin)){
          failedAttempts++;json(res,401,{error:"Invalid pairing code"},cors);return;
        }
        const token=crypto.randomBytes(32).toString("hex");
        state.clients.push({hash:hash(token),role,createdAt:stamp});
        if(state.clients.length>30)state.clients.shift();
        save();json(res,201,{token,role,version:"1.1.0"},cors);return;
      }catch(e){json(res,e.status||400,{error:e.message},cors);return;}
    }
    const client=authorize(req);
    if(!client){json(res,401,{error:"Pair this browser or Studio plugin first"},cors);return;}
    if(origin&&client.role!=="web"){json(res,403,{error:"Studio token cannot be used by browser pages"},cors);return;}
    state.presence[client.role]=now();
    if(url.pathname==="/v1/state"&&req.method==="GET"){
      json(res,200,{revision:state.revision,project:state.project,source:state.source,updatedAt:state.updatedAt,presence:state.presence},cors);return;
    }
    if(url.pathname==="/v1/state"&&req.method==="PUT"){
      try{
        const body=await readJSON(req);
        if(!Number.isSafeInteger(body?.revision)||body.revision<0){json(res,422,{error:"Missing or invalid base revision"},cors);return;}
        const project=validDocument(body.project);
        if(!project){json(res,422,{error:"Invalid project. Maximum 500 components."},cors);return;}
        if(body.revision!==state.revision){
          json(res,409,{error:"Revision conflict. Resolve before saving.",revision:state.revision,project:state.project},cors);return;
        }
        state.revision++;state.project=project;state.updatedAt=now();state.source=client.role;
        save();json(res,200,{ok:true,revision:state.revision,updatedAt:state.updatedAt},cors);return;
      }catch(e){json(res,e.status||400,{error:e.message},cors);return;}
    }
    if(url.pathname==="/v1/disconnect"&&req.method==="POST"){
      state.clients=state.clients.filter(c=>c!==client);save();json(res,200,{ok:true},cors);return;
    }
    json(res,404,{error:"Endpoint not found"},cors);
  });
  return {server,code,getState:()=>structuredClone(state),save,listen(port=PORT){return new Promise((resolve,reject)=>{server.once("error",reject);server.listen(port,"127.0.0.1",()=>{server.off("error",reject);resolve(server.address());});});},close(){if(dirty)save();return new Promise(resolve=>server.close(resolve));}};
}
const main=process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]);
if(main){
  const bridge=createBridge();
  bridge.listen().then(address=>{
    process.stdout.write("\nBuildStudio Studio Connect v1.1 (local only)\n");
    process.stdout.write("Relay: http://127.0.0.1:"+address.port+"\n");
    process.stdout.write("Pairing code: "+bridge.code+"\n");
    process.stdout.write("Enter this code once in BuildStudio.io and once in the Studio plugin.\n");
    process.stdout.write("Leave this window open for automatic synchronization.\n\n");
  }).catch(err=>{console.error("Unable to start local bridge:",err.message);process.exitCode=1;});
}
