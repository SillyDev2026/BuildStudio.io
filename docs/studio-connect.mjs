// BuildStudio v1.1 — browser <-> local bridge, no hosted API.
import {store,toast} from "./app.js";
import {validateProject,normalizeProject} from "./model.mjs";
const $=id=>document.getElementById(id);
const URL_KEY="buildstudio.studio-connect.url";
const defaultURL="http://127.0.0.1:38471";
const savedURL=()=>{try{return localStorage.getItem(URL_KEY)||defaultURL;}catch{return defaultURL;}};
let URL_BASE=savedURL();
function setURL(value){
  const u=new URL(String(value).trim());
  const local=u.protocol==="http:"&&["127.0.0.1","localhost"].includes(u.hostname)&&u.port==="38471";
  const tailnet=u.protocol==="https:"&&/^(?:[a-z0-9-]+\.)+ts\.net$/i.test(u.hostname);
  if(!local&&!tailnet)throw Error("Use localhost:38471 or an HTTPS Tailscale .ts.net address");
  if(u.username||u.password||u.search||u.hash||u.pathname!=="/")throw Error("Enter the base bridge URL only");
  URL_BASE=u.origin;
  localStorage.setItem(URL_KEY,URL_BASE);
  token="";setToken("");revision=-1;connected=false;dirty=false;conflict=false;
  setBadge("Connect Studio");
}
const TOKEN_KEY="buildstudio.studio-connect.token";
const getToken=()=>{try{return localStorage.getItem(TOKEN_KEY)||"";}catch{return "";}};
const setToken=v=>{try{v?localStorage.setItem(TOKEN_KEY,v):localStorage.removeItem(TOKEN_KEY);}catch{}};
let token=getToken(),revision=-1,dirty=false,conflict=false,connected=false,busy=false,suppress=false,lastRemote=null,liveTimer=null;
const button=$("studio-connect");
function setBadge(text,active=false){
  button.textContent=text;
  button.classList.toggle("active",active);
  button.title=active?"Studio Connect is paired — click for details":"Connect Roblox Studio without Cloudflare";
}
async function request(path,options={}){
  const res=await fetch(URL_BASE+path,{...options,mode:"cors",...(URL_BASE.startsWith("http://")?{targetAddressSpace:"loopback"}:{}),
    headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{}),...(options.headers||{})}});
  let value;
  try{value=await res.json();}catch{throw Error("Studio bridge returned an invalid response");}
  if(!res.ok){const e=new Error(value.error||"Studio bridge error");e.status=res.status;e.details=value;throw e;}
  return value;
}
const currentProject=()=>({id:store.active().id,name:store.active().name,data:store.active().data});
function applyRemote(remote){
  if(!remote||!validateProject(remote.data))throw Error("Studio sent invalid project");
  const existing=store.projects.find(p=>p.id===remote.id);
  suppress=true;
  try{
    if(existing){
      if(existing.id!==store.currentId)store.choose(existing.id);
      store.change(data=>{data.nodes=structuredClone(remote.data.nodes);data.name=remote.name;});
      store.active().name=remote.name;store.persist();
    }else{
      const imported=store.importJSON({name:remote.name,data:normalizeProject(remote.data)});
      imported.id=remote.id;store.currentId=remote.id;store.persist();store.notify("change");
    }
    dirty=false;conflict=false;
  }finally{suppress=false;}
}
async function publish(force=false){
  if(busy||!token||!connected)return;
  busy=true;
  try{
    if(force){
      const remote=await request("/v1/state");
      revision=remote.revision;
    }
    const submission=JSON.stringify(currentProject());
    const value=await request("/v1/state",{method:"PUT",body:JSON.stringify({revision,project:JSON.parse(submission)})});
    revision=value.revision;dirty=JSON.stringify(currentProject())!==submission;conflict=false;
    setBadge(dirty?"● Sync queued":"● Studio synced",true);
  }catch(e){
    if(e.status===409){conflict=true;lastRemote=e.details;setBadge("⚠ Sync conflict",true);toast("Studio conflict: open Studio Connect to choose a copy");}
    else{connected=false;setBadge("Studio offline");}
  }finally{busy=false;}
}
async function check(){
  if(!token||busy)return;
  try{
    const remote=await request("/v1/state");
    connected=true;lastRemote=remote;
    if(revision===-1){
      revision=remote.revision;
      if(!remote.project){dirty=true;await publish();return;}
      if(remote.project.id===store.active().id){
        const localNodes=JSON.stringify(store.data.nodes),remoteNodes=JSON.stringify(remote.project.data.nodes);
        if(localNodes===remoteNodes && store.active().name===remote.project.name){dirty=false;conflict=false;}
        else{conflict=true;setBadge("⚠ Choose version",true);return;}
      }
      else{conflict=true;setBadge("⚠ Choose project",true);return;}
    }else if(remote.revision!==revision){
      if(dirty){conflict=true;setBadge("⚠ Sync conflict",true);return;}
      revision=remote.revision;
      if(remote.project?.id===store.active().id){applyRemote(remote.project);toast("Updated from Roblox Studio");}
      else{conflict=true;setBadge("⚠ Choose project",true);return;}
    }
    if(!conflict){setBadge("● Studio synced",true);if(dirty)await publish();}
  }catch(e){
    connected=false;setBadge("Studio offline");
    if(e.status===401){token="";setToken("");revision=-1;}
  }
}
async function pair(code){
  const reply=await request("/v1/pair",{method:"POST",body:JSON.stringify({code:code.replace(/[\s-]/g,"").toUpperCase(),role:"web"})});
  token=reply.token;setToken(token);revision=-1;connected=true;dirty=false;conflict=false;await check();
}
function dialog(){
  const box=$("modal"),body=$("modal-body");
  $("modal-title").textContent="Studio Connect · Local";
  const state=token?(connected?"Connected to local bridge":"Bridge is offline"):"Not paired";
  body.innerHTML='<p class="hint">No Cloudflare or hosted database. Run <code>node bridge/server.mjs</code> on the PC with Roblox Studio, then pair both the website and the Studio plugin using the terminal code.</p>'+
  '<p><strong>Status:</strong> '+state+'</p>'+
  (conflict?'<p class="audit-item warning">Both versions differ. Choose which side should win. The losing version can be restored from local project history or JSON backups.</p>':'')+
  '<div class="prop"><label>Bridge address (PC localhost or private HTTPS Tailscale URL)</label><input class="modal-input" id="bridge-url" value="'+URL_BASE+'" placeholder="http://127.0.0.1:38471"></div>'+
  '<div class="button-row"><button id="bridge-url-save">Use this address</button></div>'+
  '<div class="prop"><label>One-time pairing code</label><input class="modal-input" id="pair-input" maxlength="24" placeholder="Enter code from bridge terminal" autocapitalize="characters"></div>'+
  '<div class="button-row"><button class="primary" id="pair-now">Pair browser</button><button id="pull-now">Use Studio version</button><button id="push-now">Use website version</button><button id="retry-now">Reconnect</button><button id="disconnect-now" class="danger">Forget pairing</button></div>'+
  '<p class="hint">Automatic checks happen every 3 seconds while this tab is open. Simultaneous edits pause synchronization until you resolve the conflict. On a phone, use a private HTTPS Tailscale Serve address; localhost refers to the phone itself.</p>';
  if(!box.open)box.showModal();
  $("bridge-url-save").onclick=()=>{try{setURL($("bridge-url").value);toast("Bridge address saved. Enter its pairing code.");}catch(e){toast(e.message);}};
  $("pair-now").onclick=async()=>{try{await pair($("pair-input").value);toast("Browser paired successfully");box.close();}catch(e){toast(e.message);}};
  $("pull-now").onclick=async()=>{try{const r=await request("/v1/state");if(!r.project)throw Error("Studio has not published a design yet");applyRemote(r.project);revision=r.revision;connected=true;setBadge("● Studio synced",true);toast("Studio version applied");box.close();}catch(e){toast(e.message);}};
  $("push-now").onclick=async()=>{if(!confirm("Replace the current Studio version with this website project?"))return;connected=true;await publish(true);if(!conflict)box.close();};
  $("retry-now").onclick=async()=>{revision=-1;await check();toast(connected?"Connected":"Bridge is offline");};
  $("disconnect-now").onclick=()=>{token="";setToken("");connected=false;revision=-1;dirty=false;conflict=false;setBadge("Connect Studio");box.close();toast("Local pairing forgotten");};
}
button.onclick=dialog;
store.onChange(reason=>{
  if(suppress || reason!=="change" || !token)return;
  dirty=true;
  if(connected && !conflict && !busy)publish();
});
setBadge(token?"Studio connecting…":"Connect Studio");
liveTimer=setInterval(()=>{if(token)check();},3000);
if(token)check();
