import { createProject, addNode, duplicateNode, deleteNode, validateProject, makeLuau, templates } from "./model.mjs";
const $ = id => document.getElementById(id);
const TYPES = ["Frame","TextLabel","TextButton","TextBox","ImageLabel","ImageButton","ScrollingFrame"];
const KEY = "buildstudio.v1.projects";
const apiBase = String(window.BUILDSTUDIO_CONFIG?.apiUrl || "").replace(/\/$/, "");
let projects = [], currentId = "", selected = null, history = [], future = [], preview = false, ratio = "16/9", token = sessionStorage.getItem("buildstudio.token") || "", user = null;
let drag = null, saveTimer = null;
const escapeText = x => String(x).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const active = () => projects.find(p=>p.id===currentId);
const toast = message => { $("toast").textContent=message; $("toast").classList.add("visible"); clearTimeout(toast.t);toast.t=setTimeout(()=>$("toast").classList.remove("visible"),2600); $("status").textContent=message; };
function persist() { try {localStorage.setItem(KEY,JSON.stringify({projects,currentId})); $("save").textContent="Saved locally";}catch(e){toast("Storage full: export your project as JSON");} }
function schedule(){ $("save").textContent="Saving…"; clearTimeout(saveTimer);saveTimer=setTimeout(persist,220); }
function snapshot(){ const p=active();if(!p)return; history.push(JSON.stringify(p.data));if(history.length>80)history.shift();future=[];}
function mutate(fn){ const p=active();if(!p)return;snapshot();fn(p.data);schedule();render();}
function undo(){const p=active();if(!p||!history.length)return;future.push(JSON.stringify(p.data));p.data=JSON.parse(history.pop());schedule();render();}
function redo(){const p=active();if(!p||!future.length)return;history.push(JSON.stringify(p.data));p.data=JSON.parse(future.pop());schedule();render();}
function setProject(p){currentId=p.id;selected=null;history=[];future=[];schedule();render();}
function init(){try{const saved=JSON.parse(localStorage.getItem(KEY)||"{}");if(Array.isArray(saved.projects))projects=saved.projects.filter(p=>p&&p.id&&validateProject(p.data));currentId=saved.currentId;}catch{}
if(!projects.length){const p=createProject("Starter HUD",templates.hud());projects=[p];currentId=p.id;}
if(!active())currentId=projects[0].id;
$("components").innerHTML=TYPES.map((type,i)=>'<button class="component" data-type="'+type+'"><span class="glyph">'+["▣","T","▰","▤","▧","◈","☷"][i]+'</span><span><strong>'+type+'</strong><small>'+["Container","Text","Clickable label","User input","Image","Clickable image","Scrollable container"][i]+'</small></span><span class="plus">+</span></button>').join("");
$("components").addEventListener("click",e=>{const b=e.target.closest("[data-type]");if(!b)return;mutate(data=>{const node=addNode(data,b.dataset.type,selected);selected=node.id;});});
$("templates").innerHTML=Object.keys(templates).map(k=>'<button class="template" data-template="'+k+'"><span>✦</span><span><strong>'+({"hud":"Starter HUD","shop":"Item Shop","blank":"Blank Canvas"}[k]||k)+'</strong><small>Start a new design</small></span></button>').join("");
$("templates").onclick=e=>{const b=e.target.closest("[data-template]");if(!b)return;if(active().data.nodes.length&&!confirm("Replace current design with this template?"))return;mutate(data=>{data.nodes=templates[b.dataset.template]().nodes;selected=null;});closeMobile();};
$("layers-tab").onclick=()=>showTab("layers");$("components-tab").onclick=()=>showTab("components");
$("undo").onclick=undo;$("redo").onclick=redo;
$("projects").onclick=projectDialog;$("preview").onclick=()=>{preview=!preview;$("preview").classList.toggle("active",preview);render();toast(preview?"Preview enabled":"Editing enabled");};
$("code").onclick=codeDialog;$("export").onclick=()=>download(makeLuau(active().data),active().name.replace(/[^a-z0-9-_]+/gi,"-")+".luau","text/plain");
$("account").onclick=accountDialog;$("close-modal").onclick=()=>$("modal").close();
$("file-import").onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{const json=JSON.parse(await f.text());const data=json.data||json;if(!validateProject(data))throw Error("Invalid project");const p=createProject(String(json.name||data.name||"Imported").slice(0,70),data);projects.push(p);setProject(p);toast("Project imported");}catch(err){toast(err.message)}e.target.value="";};
document.querySelectorAll("[data-device]").forEach(b=>b.onclick=()=>{ratio=b.dataset.device;document.querySelectorAll("[data-device]").forEach(x=>x.classList.toggle("active",x===b));$("board").style.aspectRatio=ratio;render();});
$("show-components").onclick=()=>{showTab("components");openMobile("left");};
$("show-layers").onclick=()=>{showTab("layers");openMobile("left");};
$("show-properties").onclick=()=>openMobile("right");
$("show-canvas").onclick=closeMobile;
$("mobile-add").onclick=()=>{showTab("components");openMobile("left");};
$("mobile-properties").onclick=closeMobile;
$("board").addEventListener("pointerdown",e=>{if(e.target===$("board")||e.target.id==="elements") {selected=null;render();}});
window.addEventListener("keydown",e=>{if(e.target.closest("input,textarea,select")||$("modal").open)return;const mod=e.ctrlKey||e.metaKey;if(mod&&e.key.toLowerCase()==="z"){e.preventDefault();if(e.shiftKey)redo();else undo();}if(mod&&e.key.toLowerCase()==="y"){e.preventDefault();redo();}if(mod&&e.key.toLowerCase()==="s"){e.preventDefault();persist();toast("Saved locally");}if(mod&&e.key.toLowerCase()==="d"&&selected){e.preventDefault();duplicate();}if((e.key==="Delete"||e.key==="Backspace")&&selected){e.preventDefault();remove();}});
render();persist();resumeOAuth();}
function showTab(tab){$("components-panel").hidden=tab!=="components";$("layers-panel").hidden=tab!=="layers";$("components-tab").classList.toggle("active",tab==="components");$("layers-tab").classList.toggle("active",tab==="layers");}
function openMobile(which){closeMobile();$(which).classList.add("mobile-open");}function closeMobile(){document.querySelectorAll(".pane").forEach(e=>e.classList.remove("mobile-open"));}
function render(){const p=active();if(!p)return;$("projects").textContent=p.name+" ▾";$("board-name").textContent=p.name;const nodes=p.data.nodes;$("object-count").textContent=nodes.length+" components";$("selection-label").textContent=selected?(nodes.find(n=>n.id===selected)?.name||"No selection"):"No selection";
const holder=$("elements");holder.replaceChildren();const make=(parent,id)=>{for(const n of nodes.filter(x=>x.parent===id)){const el=document.createElement("div");el.className="element"+(n.id===selected&&!preview?" selected":"");el.dataset.node=n.id;el.style.left=(n.x*100)+"%";el.style.top=(n.y*100)+"%";el.style.width=(n.w*100)+"%";el.style.height=(n.h*100)+"%";el.style.background=n.type==="TextLabel"||n.type==="ImageLabel"?"transparent":n.color;el.style.color=n.textColor;el.style.opacity=String(1-n.opacity/100);el.style.borderRadius=n.radius+"px";el.style.border=n.border+"px solid "+n.borderColor;el.style.fontSize="clamp(8px,"+n.fontSize/16+"vw,24px)";
if(n.type.startsWith("Text")){const span=document.createElement("span");span.className="label";span.textContent=n.text;el.append(span);}
if(n.type.startsWith("Image")){const span=document.createElement("span");span.className="label";span.textContent=n.image?"Image "+n.image:"▧ Image";el.append(span);}
if(n.id===selected&&!preview){const h=document.createElement("span");h.className="resize";h.dataset.resize="1";el.append(h);}el.addEventListener("pointerdown",e=>startDrag(e,n,el));parent.append(el);make(el,n.id);}};
make(holder,null);
$("layers").innerHTML=nodes.map(n=>'<button class="layer'+(n.id===selected?" active":"")+'" data-node="'+escapeText(n.id)+'" style="padding-left:'+(10+depth(n,nodes)*13)+'px">▣ '+escapeText(n.name)+' <small>'+escapeText(n.type)+'</small></button>').join("");
$("layers").querySelectorAll("[data-node]").forEach(b=>b.onclick=()=>{selected=b.dataset.node;render();});
inspector();
}
function depth(n,nodes){let d=0;while(n.parent&&d<15){n=nodes.find(x=>x.id===n.parent);if(!n)break;d++;}return d;}
function startDrag(e,n,el){e.stopPropagation();selected=n.id;if(preview){render();return;}const board=$("board").getBoundingClientRect();drag={id:n.id,x:e.clientX,y:e.clientY,w:board.width,h:board.height,initial:{x:n.x,y:n.y,w:n.w,h:n.h},resize:!!e.target.dataset.resize};snapshot();el.setPointerCapture(e.pointerId);el.onpointermove=move;el.onpointerup=end;el.onpointercancel=end;renderInspectorOnly();}
function move(e){if(!drag)return;const n=active().data.nodes.find(n=>n.id===drag.id);if(!n)return;const dx=(e.clientX-drag.x)/drag.w,dy=(e.clientY-drag.y)/drag.h;const f=v=>Math.round(v*1000)/1000;if(drag.resize){n.w=f(Math.max(.015,Math.min(1.5,drag.initial.w+dx)));n.h=f(Math.max(.015,Math.min(1.5,drag.initial.h+dy)));}else{n.x=f(Math.min(1,Math.max(-1,drag.initial.x+dx)));n.y=f(Math.min(1,Math.max(-1,drag.initial.y+dy)));}const el=document.querySelector('[data-node="'+n.id+'"].element');if(el){el.style.left=(n.x*100)+"%";el.style.top=(n.y*100)+"%";el.style.width=(n.w*100)+"%";el.style.height=(n.h*100)+"%";}renderInspectorOnly();}
function end(){if(!drag)return;drag=null;schedule();render();}
function renderInspectorOnly(){const n=active().data.nodes.find(n=>n.id===selected);if(!n)return;for(const name of ["x","y","w","h"]){const input=$("prop-"+name);if(input&&document.activeElement!==input)input.value=Math.round(n[name]*1000)/10;}}
function duplicate(){if(!selected)return;mutate(data=>{const n=duplicateNode(data,selected);if(n)selected=n.id;});}
function remove(){if(!selected)return;mutate(data=>deleteNode(data,selected));selected=null;render();}
function inspector(){const host=$("inspector");const p=active(),n=p.data.nodes.find(n=>n.id===selected);if(!n){host.innerHTML='<p class="hint">Choose a UI component to edit its position, size, colors and text.</p>';return;}
const prop=(key,label,value,type="text")=>'<div class="prop"><label for="prop-'+key+'">'+label+'</label><input id="prop-'+key+'" data-prop="'+key+'" type="'+type+'" value="'+escapeText(value)+'"></div>';
host.innerHTML='<div class="eyebrow">'+escapeText(n.type)+'</div>'+prop("name","Object name",n.name)+
'<div class="prop-grid">'+["x","y","w","h"].map((k,i)=>prop(k,["X · %","Y · %","Width · %","Height · %"][i],Math.round(n[k]*1000)/10,"number")).join("")+'</div>'+
(n.type.startsWith("Text")?prop("text","Text",n.text):"")+
(n.type.startsWith("Image")?prop("image","Roblox asset ID",n.image):"")+
'<div class="prop-grid">'+prop("color","Background",n.color,"color")+prop("textColor","Text color",n.textColor,"color")+prop("borderColor","Border color",n.borderColor,"color")+prop("opacity","Transparency %",n.opacity,"number")+prop("radius","Corner radius",n.radius,"number")+prop("fontSize","Text size",n.fontSize,"number")+prop("border","Border width",n.border,"number")+'</div>'+
'<div class="small-buttons"><button id="duplicate">Duplicate</button><button id="raise">Raise</button><button id="lower">Lower</button><button id="delete">Delete</button></div>';
host.querySelectorAll("[data-prop]").forEach(i=>i.onchange=()=>{const k=i.dataset.prop;let value=i.value;if(["x","y","w","h"].includes(k))value=Math.round(Math.max(-100,Math.min(150,Number(value)))*10)/1000;else if(["opacity","radius","fontSize","border"].includes(k))value=Number(value);mutate(data=>{const row=data.nodes.find(x=>x.id===selected);if(row)row[k]=value;});});
$("duplicate").onclick=duplicate;$("delete").onclick=remove;
$("raise").onclick=()=>mutate(d=>{const i=d.nodes.findIndex(n=>n.id===selected);if(i>=0&&i<d.nodes.length-1)[d.nodes[i],d.nodes[i+1]]=[d.nodes[i+1],d.nodes[i]];});
$("lower").onclick=()=>mutate(d=>{const i=d.nodes.findIndex(n=>n.id===selected);if(i>0)[d.nodes[i],d.nodes[i-1]]=[d.nodes[i-1],d.nodes[i]];});
}
function modal(title,content){$("modal-title").textContent=title;$("modal-body").innerHTML=content;$("modal").showModal();}
function download(content,name,mime){const blob=new Blob([content],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function projectDialog(){modal("Your projects",'<p class="hint">Projects autosave on this device. Export JSON to back them up.</p><div id="project-list"></div><div class="small-buttons"><button id="new">New project</button><button id="rename">Rename</button><button id="json-export">Export JSON</button><button id="json-import">Import JSON</button></div>');const draw=()=>{$("project-list").innerHTML=projects.map(p=>'<div class="row"><button data-open="'+escapeText(p.id)+'">'+escapeText(p.name)+'</button><button data-delete="'+escapeText(p.id)+'" title="Delete">✕</button></div>').join("");$("project-list").onclick=e=>{const o=e.target.closest("[data-open]"),d=e.target.closest("[data-delete]");if(o){setProject(projects.find(p=>p.id===o.dataset.open));$("modal").close();}if(d&&projects.length>1&&confirm("Delete project permanently from this device?")){projects=projects.filter(p=>p.id!==d.dataset.delete);if(!active())currentId=projects[0].id;persist();draw();render();}};};draw();
$("new").onclick=()=>{const name=prompt("New project name","Untitled UI");if(!name)return;const p=createProject(name,templates.blank());projects.push(p);setProject(p);$("modal").close();};
$("rename").onclick=()=>{const name=prompt("Rename project",active().name);if(name){active().name=name.slice(0,70);schedule();render();$("modal").close();}};
$("json-export").onclick=()=>download(JSON.stringify({name:active().name,data:active().data},null,2),active().name.replace(/[^a-z0-9]+/gi,"-")+".json","application/json");
$("json-import").onclick=()=>$("file-import").click();
}
function codeDialog(){modal("Generated Luau",'<p class="hint">Paste this script into a LocalScript in StarterPlayerScripts.</p><pre id="code-view"></pre><button class="primary" id="dl-luau">Download .luau</button> <button id="copy-luau">Copy code</button>');const code=makeLuau(active().data);$("code-view").textContent=code;$("dl-luau").onclick=()=>$("export").click();$("copy-luau").onclick=()=>navigator.clipboard.writeText(code).then(()=>toast("Luau copied")).catch(()=>toast("Use Download instead"));}
async function callApi(path,options={}){const r=await fetch(apiBase+path,{...options,headers:{"Content-Type":"application/json",...(token?{"Authorization":"Bearer "+token}:{}),...(options.headers||{})}});const body=await r.json();if(!r.ok)throw Error(body.error||"API unavailable");return body;}
async function resumeOAuth(){const ticket=location.hash.match(/^#auth=([0-9a-f]{64})$/)?.[1];if(ticket){history.replaceState(null,"",location.pathname+location.search);if(apiBase){try{const r=await callApi("/api/auth/exchange",{method:"POST",body:JSON.stringify({ticket})});token=r.token;sessionStorage.setItem("buildstudio.token",token);user=r.user;toast("Signed in as "+user.login);}catch(e){toast(e.message);}}}else if(apiBase&&token){try{user=(await callApi("/api/me")).user;}catch{token="";sessionStorage.removeItem("buildstudio.token");}}}
async function accountDialog(){if(!apiBase){modal("Connect BuildStudio Cloud",'<p>The visual editor works offline now. GitHub OAuth and cross-device cloud storage require deployment of the included BuildStudio Cloudflare Worker and configuration of <code>docs/config.js</code>.</p><p>Do not reuse the former Collab.io database or OAuth credentials without a deliberate migration.</p>');return;}
if(!user){modal("GitHub sign-in",'<p>Sign in securely using GitHub. The Worker stores private BuildStudio designs in its own D1 database.</p><button class="primary" id="sign-in">Sign in with GitHub</button>');$("sign-in").onclick=()=>location.assign(apiBase+"/auth/github");return;}
modal("BuildStudio Cloud",'<p>Signed in as <strong>'+escapeText(user.login)+'</strong></p><div class="small-buttons"><button class="primary" id="cloud-save">Save to cloud</button><button id="cloud-browse">Browse cloud</button><button id="logout">Sign out</button></div><div id="cloud-results"></div>');
$("logout").onclick=async()=>{try{await callApi("/api/logout",{method:"POST"});}catch{}token="";user=null;sessionStorage.removeItem("buildstudio.token");$("modal").close();toast("Signed out");};
$("cloud-save").onclick=async()=>{try{const p=active(),body=JSON.stringify({name:p.name,data:p.data});let response;try{response=p.remoteId?await callApi("/api/projects/"+p.remoteId,{method:"PUT",body}):await callApi("/api/projects",{method:"POST",body});}catch(e){if(p.remoteId&&/not found/i.test(e.message))response=await callApi("/api/projects",{method:"POST",body});else throw e;}p.remoteId=response.project.id;persist();toast("Saved to cloud");}catch(e){toast(e.message);}};
$("cloud-browse").onclick=async()=>{const panel=$("cloud-results");panel.textContent="Loading…";try{const r=await callApi("/api/projects");panel.innerHTML=r.projects.map(p=>'<div class="row"><button data-cloud="'+escapeText(p.id)+'">'+escapeText(p.name)+'</button></div>').join("")||"<p>No cloud projects yet.</p>";panel.querySelectorAll("[data-cloud]").forEach(b=>b.onclick=async()=>{try{const r=await callApi("/api/projects/"+b.dataset.cloud);if(!validateProject(r.project.data))throw Error("Invalid remote data");const p=createProject(r.project.name,r.project.data);p.remoteId=r.project.id;projects.push(p);setProject(p);$("modal").close();toast("Cloud design loaded");}catch(e){toast(e.message);}});}catch(e){panel.textContent=e.message;}};
}
init();