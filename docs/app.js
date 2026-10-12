// BuildStudio.io v1 — modular app controller, no UI framework or build step.
import {COMPONENTS,DEVICES,FONT_NAMES,templates,makeLuau,auditProject,normalizeProject,validateProject,addNode,adjustNode,normalizeNode} from "./model.mjs";
import {ProjectStore} from "./store.mjs";
import {CanvasView} from "./canvas.mjs";
import {CloudClient} from "./cloud.mjs";
const $=id=>document.getElementById(id);
const escape=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const cleanFile=x=>(String(x||"BuildStudio").replace(/[^a-z0-9_-]+/gi,"-").slice(0,70)||"BuildStudio");
const mobile=()=>window.matchMedia("(max-width:760px)").matches;
const store=new ProjectStore();
const cloud=new CloudClient(window.BUILDSTUDIO_CONFIG?.apiUrl);
let preview=false,snap=false,showGrid=true,device="desktop",zoom=100,layerSearch="",componentSearch="",activeTab="components",copied=null;
let notifyTimer=null;
const canvas=new CanvasView($("board"),store,{getSnap:()=>snap,getPreview:()=>preview,onSelection:(id,isMove=false,message)=>{if(message)toast(message);renderInspector(isMove);if(!isMove)renderLayers();}});
function toast(message){$("status").textContent=String(message);const el=$("toast");el.textContent=String(message);el.classList.add("visible");clearTimeout(notifyTimer);notifyTimer=setTimeout(()=>el.classList.remove("visible"),2600);}
function download(content,name,type="text/plain"){
  const objectURL=URL.createObjectURL(new Blob([content],{type}));const anchor=document.createElement("a");
  anchor.href=objectURL;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(objectURL),1500);
}
function showModal(title,markup){
  $("modal-title").textContent=title;$("modal-body").innerHTML=markup;
  if(!$("modal").open)$("modal").showModal();
}
function closeModal(){if($("modal").open)$("modal").close();}
$("close-modal").onclick=closeModal;
function execute(fn){try{return fn();}catch(error){toast(error.message||"Unexpected editor error");return null;}}
async function executeAsync(fn){try{return await fn();}catch(error){toast(error.message||"Network request failed");return null;}}
function closeMobile(){document.querySelectorAll(".sidebar").forEach(el=>el.classList.remove("mobile-open"));}
function openMobile(which){closeMobile();$(which).classList.add("mobile-open");}
function showTab(which){
  activeTab=which;
  $("components-panel").hidden=which!=="components";
  $("layers-panel").hidden=which!=="layers";
  $("components-tab").classList.toggle("active",which==="components");
  $("layers-tab").classList.toggle("active",which==="layers");
}
function updateToolbar(){
  const project=store.active();
  $("projects").firstChild.textContent=project.name+" ";
  $("board-name").textContent=project.name;
  $("object-count").textContent=store.data.nodes.length+" components";
  $("selection-label").textContent=store.selected?(store.data.nodes.find(n=>n.id===store.selected)?.name||"No selection"):"No selection";
  $("undo").disabled=!store.history.length;$("redo").disabled=!store.future.length;
  $("save").textContent=store.timer?"Saving…":"Saved locally";
}
function renderComponents(){
  const query=componentSearch.trim().toLowerCase();
  const descriptions={Frame:"UI container",CanvasGroup:"Grouped canvas",ScrollingFrame:"Scrollable container",TextLabel:"Read-only text",TextButton:"Interactive button",TextBox:"Text input field",ImageLabel:"Image display",ImageButton:"Image button"};
  const html=Object.entries(COMPONENTS).filter(([name,meta])=>(name+" "+meta.label).toLowerCase().includes(query)).map(([name,meta])=>'<button class="component" data-add="'+escape(name)+'"><span class="symbol">'+escape(meta.icon)+'</span><span><strong>'+escape(meta.label)+'</strong><small>'+escape(descriptions[name])+'</small></span><span class="plus">+</span></button>').join("");
  $("components").innerHTML=html||'<p class="empty">No matching components.</p>';
  $("templates").innerHTML=Object.keys(templates).map(key=>'<button class="template" data-template="'+escape(key)+'"><span class="symbol">✦</span><span><strong>'+escape(({hud:"Starter HUD",shop:"Item Shop",blank:"Blank Canvas",inventory:"Inventory",leaderboard:"Leaderboard",settings:"Settings Menu",loading:"Loading Screen",notification:"Notification",profile:"Player Profile"})[key]||key)+'</strong><small>Load design preset</small></span></button>').join("");
}
function renderLayers(){
  const nodes=store.data.nodes;const query=layerSearch.trim().toLowerCase();
  $("layer-count").textContent=nodes.length+" objects";
  function depth(n){let d=0;const seen=new Set();while(n.parent&&d<32){n=nodes.find(x=>x.id===n.parent);if(!n||seen.has(n.id))break;seen.add(n.id);d++;}return d;}
  $("layers").innerHTML=nodes.filter(n=>!query||(n.name+" "+n.type).toLowerCase().includes(query)).map(n=>{
    const selected=n.id===store.selected,offset=Math.min(depth(n),8)*13;
    return '<button class="layer'+(selected?' active':'')+'" data-layer="'+escape(n.id)+'" title="'+escape(n.name)+'" style="padding-left:'+(8+offset)+'px"><span class="layer-glyph">'+escape(COMPONENTS[n.type]?.icon||"▣")+'</span><span class="layer-name">'+escape(n.name)+'</span><small class="layer-type">'+escape(n.type)+'</small></button>';
  }).join("")||'<p class="empty">No matching objects.</p>';
}
function prop(key,label,value,type="text",options={}){
  let control;
  const val=value===null||value===undefined?"":String(value);
  if(type==="select")control='<select id="prop-'+key+'" data-prop="'+key+'">'+(options.items||[]).map(item=>'<option value="'+escape(item)+'"'+(item===val?' selected':'')+'>'+escape(item)+'</option>').join("")+'</select>';
  else if(type==="checkbox")control='<label class="checkbox-row"><input id="prop-'+key+'" data-prop="'+key+'" type="checkbox"'+(value?' checked':'')+'> '+escape(label)+'</label>';
  else control='<input id="prop-'+key+'" data-prop="'+key+'" type="'+type+'" value="'+escape(val)+'"'+(type==="number"?' step="'+escape(options.step||"any")+'"':'')+'>';
  return '<div class="prop">'+(type==="checkbox"?"":'<label for="prop-'+key+'">'+escape(label)+'</label>')+control+'</div>';
}
const pct=value=>Math.round(value*10000)/100;
const numerical=new Set(["x","y","w","h","anchorX","anchorY","rotation","zIndex","opacity","radius","border","fontSize","stroke","aspect","padding"]);
const colorFields=new Set(["color","textColor","borderColor","strokeColor"]);
function renderInspector(onlyGeometry=false){
  const node=store.data.nodes.find(n=>n.id===store.selected),host=$("inspector");
  $("inspector-title").textContent=node?node.name:"Properties";
  if(!node){host.innerHTML='<p class="aside-tip">Choose a component from the canvas or hierarchy to edit appearance, scale-based position, and behavior.</p><p class="aside-tip">Tip: design at any screen ratio; scale units keep your UI responsive in Roblox.</p>';return;}
  if(onlyGeometry){
    for(const field of ["x","y","w","h"]){const input=$("prop-"+field);if(input&&document.activeElement!==input)input.value=pct(node[field]);}
    return;
  }
  const n=normalizeNode(node),parentChoices=["ScreenGui",...store.data.nodes.filter(x=>x.id!==n.id&&COMPONENTS[x.type]?.container).map(x=>x.id)];
  const parentLabels=Object.fromEntries(store.data.nodes.map(x=>[x.id,x.name]));
  let html='<p class="section-label">OBJECT</p>'+prop("name","Name",n.name);
  html+='<div class="prop"><label for="node-parent">Parent</label><select id="node-parent"><option value="">ScreenGui</option>'+parentChoices.slice(1).map(id=>'<option value="'+escape(id)+'"'+(id===n.parent?' selected':'')+'>'+escape(parentLabels[id])+'</option>').join("")+'</select></div>';
  html+='<p class="inspector-section">POSITION & SIZE · SCALE %</p><div class="prop-grid">'+
    prop("x","X",pct(n.x),"number")+prop("y","Y",pct(n.y),"number")+prop("w","Width",pct(n.w),"number")+prop("h","Height",pct(n.h),"number")+
    prop("anchorX","Anchor X",pct(n.anchorX),"number")+prop("anchorY","Anchor Y",pct(n.anchorY),"number")+
    prop("rotation","Rotation °",n.rotation,"number")+prop("zIndex","ZIndex",n.zIndex,"number")+'</div>';
  html+='<div class="action-grid"><button data-align="center-x">Center X</button><button data-align="center-y">Center Y</button><button data-align="fill-width">Fill width</button><button data-align="fill-height">Fill height</button></div>';
  html+='<p class="inspector-section">APPEARANCE</p><div class="prop-grid">'+prop("color","Background",n.color,"color")+prop("opacity","Transparency %",n.opacity,"number")+
    prop("radius","Corner px",n.radius,"number")+prop("border","Border px",n.border,"number")+
    prop("borderColor","Border color",n.borderColor,"color")+prop("strokeColor","Stroke color",n.strokeColor,"color")+
    prop("stroke","Stroke px",n.stroke,"number")+prop("aspect","Aspect ratio (0 = off)",n.aspect,"number")+'</div>'+prop("visible","Visible",n.visible,"checkbox");
  if(n.type.startsWith("Text")){
    html+='<p class="inspector-section">TEXT</p>'+prop("text","Content",n.text)+
      '<div class="prop-grid">'+prop("textColor","Text color",n.textColor,"color")+prop("fontSize","Text size",n.fontSize,"number")+
      prop("font","Font",n.font,"select",{items:FONT_NAMES})+prop("textAlign","Alignment",n.textAlign,"select",{items:["Left","Center","Right"]})+'</div>'+
      prop("textScaled","Auto-scale text",n.textScaled,"checkbox");
    if(n.type==="TextBox")html+=prop("placeholder","Placeholder",n.placeholder);
  }
  if(n.type.startsWith("Image"))html+='<p class="inspector-section">IMAGE</p>'+prop("image","Roblox image asset ID",n.image);
  if(COMPONENTS[n.type]?.container)html+='<p class="inspector-section">CONTAINER</p>'+prop("layout","Auto layout",n.layout,"select",{items:["none","vertical","horizontal","grid"]})+
    prop("padding","Padding (scale, 0–0.4)",n.padding,"number")+prop("clip","Clip children",n.clip,"checkbox");
  html+='<p class="inspector-section">ACTIONS</p><div class="action-grid"><button id="duplicate">Duplicate</button><button id="remove-node" class="danger">Delete</button><button id="raise">Raise layer</button><button id="lower">Lower layer</button></div>';
  host.innerHTML=html;
  $("node-parent").onchange=event=>{if(!store.reparent(event.target.value||null)){toast("Cannot nest inside itself or a child");renderInspector();}};
  host.querySelectorAll("[data-align]").forEach(button=>button.onclick=()=>execute(()=>store.align(button.dataset.align)));
  host.querySelectorAll("[data-prop]").forEach(input=>input.addEventListener("change",()=>{
    execute(()=>{
      const key=input.dataset.prop;let value=input.type==="checkbox"?input.checked:input.value;
      if(numerical.has(key)){
        value=Number(value);if(!Number.isFinite(value))throw Error("Enter a valid number");
        if(["x","y","w","h","anchorX","anchorY"].includes(key))value/=100;
        if(key==="padding")value=Math.min(.4,Math.max(0,value));
        if(["w","h"].includes(key))value=Math.min(1.5,Math.max(.015,value));
        if(["anchorX","anchorY"].includes(key))value=Math.min(1,Math.max(0,value));
        if(key==="opacity")value=Math.min(100,Math.max(0,value));
        if(key==="zIndex")value=Math.round(Math.min(100,Math.max(1,value)));
        if(key==="radius")value=Math.min(100,Math.max(0,value));
        if(key==="fontSize")value=Math.min(96,Math.max(6,value));
        if(key==="border"||key==="stroke")value=Math.min(24,Math.max(0,value));
        if(key==="aspect")value=Math.min(10,Math.max(0,value));
        if(key==="rotation")value=Math.min(360,Math.max(-360,value));
      }
      if(key==="name")value=String(value).trim().slice(0,120)||n.type;
      if(key==="text")value=String(value).slice(0,5000);
      if(key==="image")value=String(value).slice(0,500);
      if(colorFields.has(key) && !/^#[0-9a-f]{6}$/i.test(value))throw Error("Invalid color");
      if(["x","y","w","h"].includes(key))store.geometry(n.id,{[key]:value});
      else store.patch(n.id,{[key]:value});
    });
  }));
  $("duplicate").onclick=()=>execute(()=>store.duplicate());
  $("remove-node").onclick=()=>execute(()=>store.removeNode());
  $("raise").onclick=()=>execute(()=>store.reorder("up"));
  $("lower").onclick=()=>execute(()=>store.reorder("down"));
}
function render(){
  updateToolbar();renderLayers();renderInspector();
}
store.onChange(reason=>{
  if(reason==="storage-error"){toast("Browser storage full. Export JSON to back up your project.");return;}
  if(reason==="saved"){$("save").textContent="Saved locally";return;}
  render();
});
function setDevice(key){
  device=key;const choice=DEVICES[key];$("board").style.aspectRatio=choice.ratio;
  $("device-label").textContent=choice.label+" · "+choice.ratio.replace("/" , ":");
  document.querySelectorAll("[data-device]").forEach(button=>button.classList.toggle("active",button.dataset.device===key));
}
function setZoom(amount){
  zoom=Math.max(50,Math.min(175,amount));$("zoom-label").textContent=zoom+"%";
  const w=$("board-wrap");w.style.width=(zoom*8.5)+"px";w.style.maxWidth="none";
}
function codeDialog(mode="runtime"){
  const code=makeLuau(store.data,{mode});
  showModal(mode==="studio"?"Studio Command Bar code":"Generated Luau",
    '<p class="hint">'+(mode==="studio"?"Run this in the Roblox Studio Command Bar to create the UI under StarterGui.":"Put this in a LocalScript inside StarterPlayer → StarterPlayerScripts.")+'</p>'+
    '<div class="button-row"><button id="runtime-mode"'+(mode==="runtime"?' class="active"':'')+'>Runtime</button><button id="studio-mode"'+(mode==="studio"?' class="active"':'')+'>Studio</button><button id="download-lua" class="primary">Download .luau</button><button id="copy-lua">Copy code</button></div><pre id="code-view"></pre>');
  $("code-view").textContent=code;
  $("runtime-mode").onclick=()=>codeDialog("runtime");$("studio-mode").onclick=()=>codeDialog("studio");
  $("download-lua").onclick=()=>download(code,cleanFile(store.active().name)+(mode==="studio"?"-studio":"")+".luau");
  $("copy-lua").onclick=async()=>{try{await navigator.clipboard.writeText(code);toast("Luau copied");}catch{toast("Clipboard access denied: use Download");}};
}
function exportDialog(){
  showModal("Export design",'<p class="hint">Choose how to use your Roblox interface.</p><div class="action-grid"><button id="exp-luau" class="primary">↧ LocalScript (.luau)</button><button id="exp-studio">↧ Studio code (.luau)</button><button id="exp-json">↧ Project (.json)</button><button id="exp-copy">Copy Luau</button></div><p class="hint">Runtime code builds the UI in PlayerGui. Studio code builds it in StarterGui for editing. JSON can be imported back into BuildStudio or by the companion Studio plugin.</p>');
  $("exp-luau").onclick=()=>download(makeLuau(store.data),cleanFile(store.active().name)+".luau");
  $("exp-studio").onclick=()=>download(makeLuau(store.data,{mode:"studio"}),cleanFile(store.active().name)+"-studio.luau");
  $("exp-json").onclick=()=>download(store.exportJSON(),cleanFile(store.active().name)+".json","application/json");
  $("exp-copy").onclick=async()=>{try{await navigator.clipboard.writeText(makeLuau(store.data));toast("Luau copied");}catch{toast("Clipboard access unavailable");}};
}
function projectDialog(){
  showModal("Your projects",'<p class="hint">Projects autosave locally on this browser. Export JSON for backups or use GitHub cloud once configured.</p><div id="project-list"></div><div class="button-row"><button id="new-project" class="primary">+ New project</button><button id="rename-project">Rename current</button><button id="export-project">Export JSON</button><button id="import-project">Import JSON</button></div>');
  const draw=()=>{
    $("project-list").innerHTML=store.projects.map(p=>'<div class="modal-row"><button data-open="'+escape(p.id)+'">'+escape(p.name)+(p.id===store.currentId?" ●":"")+'</button><small>'+p.data.nodes.length+' objects</small><button data-remove="'+escape(p.id)+'" class="danger" title="Delete local project">✕</button></div>').join("");
    $("project-list").querySelectorAll("[data-open]").forEach(button=>button.onclick=()=>{store.choose(button.dataset.open);closeModal();});
    $("project-list").querySelectorAll("[data-remove]").forEach(button=>button.onclick=()=>{if(confirm("Delete this project from this browser?"))execute(()=>{store.removeProject(button.dataset.remove);draw();});});
  };draw();
  $("new-project").onclick=()=>{const name=prompt("Project name","Untitled UI");if(name)execute(()=>{store.create(name);closeModal();});};
  $("rename-project").onclick=()=>{const name=prompt("Rename project",store.active().name);if(name)execute(()=>{store.rename(name);closeModal();});};
  $("export-project").onclick=()=>download(store.exportJSON(),cleanFile(store.active().name)+".json","application/json");
  $("import-project").onclick=()=>$("file-import").click();
}
function auditDialog(){
  const issues=auditProject(store.data),warnings=issues.filter(i=>i.level==="warning").length;
  const body=issues.length?issues.map(i=>'<div class="audit-item '+escape(i.level)+'"><strong>'+escape(i.level.toUpperCase())+'</strong> · '+escape(i.message)+'</div>').join(""):'<p>All checks passed. No issues found with the current design.</p>';
  showModal("Design inspector",'<p class="hint">'+store.data.nodes.length+' components · '+warnings+' warnings</p>'+body+'<p class="hint">These are design hints; interactive Roblox behavior still requires Luau scripts.</p>');
}
function shortcutsDialog(){
  showModal("Keyboard shortcuts",'<p class="hint">Select an object before using manipulation shortcuts.</p><p><span class="kbd">Ctrl+Z</span> Undo · <span class="kbd">Ctrl+Y</span> Redo · <span class="kbd">Ctrl+S</span> Save</p><p><span class="kbd">Ctrl+D</span> Duplicate · <span class="kbd">Ctrl+C</span> Copy object · <span class="kbd">Ctrl+V</span> Paste object</p><p><span class="kbd">Delete</span> Remove · <span class="kbd">Arrow keys</span> Move 1% · <span class="kbd">Shift + Arrow</span> Move 5%</p><p><span class="kbd">Esc</span> Deselect · <span class="kbd">Ctrl+E</span> Export</p>');
}
function accountDialog(){
  if(!cloud.configured){showModal("BuildStudio Cloud",'<p>The editor works without signing in. To enable cloud projects, deploy the Cloudflare Worker and set the public Worker URL in <code>docs/config.js</code>.</p><p class="hint">Never place API tokens or GitHub client secrets in your GitHub Pages code.</p>');return;}
  if(!cloud.signedIn){showModal("Sign in with GitHub",'<p>GitHub authentication lets you save designs across devices using your private D1 project area.</p><button id="github-login" class="primary">Continue with GitHub</button>');$("github-login").onclick=()=>execute(()=>cloud.login());return;}
  showModal("BuildStudio Cloud",'<p>Signed in as <strong>'+escape(cloud.user.login)+'</strong>.</p><div class="button-row"><button class="primary" id="cloud-save">Save current design</button><button id="cloud-list">Open cloud project</button><button id="cloud-signout">Sign out</button></div><div id="cloud-results"></div>');
  $("cloud-signout").onclick=()=>executeAsync(async()=>{await cloud.logout();closeModal();toast("Signed out");});
  $("cloud-save").onclick=()=>executeAsync(async()=>{await cloud.save(store.active());store.persist();toast("Saved to cloud");});
  $("cloud-list").onclick=()=>executeAsync(async()=>{
    const panel=$("cloud-results");panel.textContent="Loading…";
    const list=await cloud.list();
    panel.innerHTML=list.map(p=>'<div class="modal-row"><button data-cloud="'+escape(p.id)+'">'+escape(p.name)+'</button><small>'+escape(p.updated_at||"")+'</small></div>').join("")||'<p class="hint">No cloud projects yet.</p>';
    panel.querySelectorAll("[data-cloud]").forEach(button=>button.onclick=()=>executeAsync(async()=>{
      const remote=await cloud.load(button.dataset.cloud);
      if(!validateProject(remote.data))throw Error("Invalid remote design");
      const p=store.importJSON({name:remote.name,data:normalizeProject(remote.data)});
      p.remoteId=remote.id;p.remoteUpdatedAt=remote.updated_at;store.persist();closeModal();toast("Cloud project opened");
    }));
  });
}
function keyboard(event){
  const target=event.target;
  if(target instanceof HTMLElement && (target.matches("input,select,textarea")||target.isContentEditable)||$("modal").open)return;
  const key=event.key.toLowerCase(),mod=event.ctrlKey||event.metaKey;
  if(mod&&key==="z"){event.preventDefault();event.shiftKey?store.redo():store.undo();}
  else if(mod&&key==="y"){event.preventDefault();store.redo();}
  else if(mod&&key==="s"){event.preventDefault();store.persist();toast("Saved locally");}
  else if(mod&&key==="d"&&store.selected){event.preventDefault();execute(()=>store.duplicate());}
  else if(mod&&key==="e"){event.preventDefault();exportDialog();}
  else if(mod&&key==="c"&&store.selected){event.preventDefault();copySelection();}
  else if(mod&&key==="v"&&copied){event.preventDefault();pasteSelection();}
  else if(!mod&&!event.altKey&&store.selected&&["arrowleft","arrowright","arrowup","arrowdown"].includes(key)){
    event.preventDefault();const distance=event.shiftKey?.05:.01;
    const x=key==="arrowleft"?-distance:key==="arrowright"?distance:0;
    const y=key==="arrowup"?-distance:key==="arrowdown"?distance:0;
    execute(()=>store.change(data=>{const n=data.nodes.find(n=>n.id===store.selected);adjustNode(data,n.id,{x:n.x+x,y:n.y+y});}));
  }else if(["delete","backspace"].includes(key)&&store.selected){event.preventDefault();execute(()=>store.removeNode());}
  else if(key==="escape")store.select(null);
}
function copySelection(){
  const nodes=store.data.nodes,root=nodes.find(n=>n.id===store.selected);if(!root)return;
  const selectedIds=new Set([root.id]);let changed=true;
  while(changed){changed=false;for(const n of nodes)if(n.parent&&selectedIds.has(n.parent)&&!selectedIds.has(n.id)){selectedIds.add(n.id);changed=true;}}
  copied={root:root.id,nodes:nodes.filter(n=>selectedIds.has(n.id)).map(n=>structuredClone(n))};toast("Copied "+copied.nodes.length+" component(s)");
}
function pasteSelection(){
  if(!copied)return;
  execute(()=>store.change(data=>{
    const parents=new Map();let first=null;
    for(const source of copied.nodes){
      const next=addNode(data,source.type,source.id===copied.root?null:parents.get(source.parent)||null);
      const id=next.id,parent=next.parent;
      Object.assign(next,structuredClone(source),{id,parent,name:(source.name+"_Copy").slice(0,120)});
      next.x=Math.min(1,Math.max(-1,source.x+.025));next.y=Math.min(1,Math.max(-1,source.y+.025));
      parents.set(source.id,id);if(source.id===copied.root)first=id;
    }
    store.selected=first;
  }));
}
$("projects").onclick=projectDialog;$("undo").onclick=()=>store.undo();$("redo").onclick=()=>store.redo();
$("code").onclick=()=>codeDialog();$("export").onclick=exportDialog;$("account").onclick=accountDialog;
$("audit").onclick=auditDialog;$("help").onclick=shortcutsDialog;
$("preview").onclick=()=>{preview=!preview;$("preview").classList.toggle("active",preview);$("preview").textContent=preview?"◉ Editing off":"◉ Preview";canvas.render();toast(preview?"Preview mode":"Edit mode");};
$("snap").onclick=()=>{snap=!snap;$("snap").setAttribute("aria-pressed",String(snap));$("snap").textContent=snap?"♯ Snap 2.5%":"♯ Snap off";$("canvas-grid").classList.toggle("snap-grid",snap);};
$("grid").onclick=()=>{showGrid=!showGrid;$("grid").setAttribute("aria-pressed",String(showGrid));$("canvas-grid").classList.toggle("hidden",!showGrid);};
$("zoom-in").onclick=()=>setZoom(zoom+25);$("zoom-out").onclick=()=>setZoom(zoom-25);
$("devices").onclick=event=>{const b=event.target.closest("[data-device]");if(b)setDevice(b.dataset.device);};
$("components-tab").onclick=()=>showTab("components");$("layers-tab").onclick=()=>showTab("layers");
$("component-search").oninput=event=>{componentSearch=event.target.value;renderComponents();};
$("layer-search").oninput=event=>{layerSearch=event.target.value;renderLayers();};
$("components").onclick=event=>{const b=event.target.closest("[data-add]");if(b)execute(()=>{store.createNode(b.dataset.add);closeMobile();toast(b.dataset.add+" added");});};
$("templates").onclick=event=>{const b=event.target.closest("[data-template]");if(!b)return;if(store.data.nodes.length&&!confirm("Replace this project's design with "+b.dataset.template+"?"))return;execute(()=>{store.replaceTemplate(b.dataset.template);closeMobile();toast("Template loaded");});};
$("layers").onclick=event=>{const b=event.target.closest("[data-layer]");if(!b)return;store.select(b.dataset.layer);if(mobile())openMobile("right");};
$("file-import").onchange=async event=>{const f=event.target.files?.[0];if(!f)return;try{if(f.size>150000)throw Error("Project file exceeds 150 KB");store.importJSON(await f.text());closeModal();toast("Project imported");}catch(error){toast(error.message);}event.target.value="";};
$("show-components").onclick=()=>{showTab("components");openMobile("left");};
$("show-layers").onclick=()=>{showTab("layers");openMobile("left");};
$("show-properties").onclick=()=>openMobile("right");
$("show-canvas").onclick=closeMobile;
$("mobile-add").onclick=()=>{showTab("components");openMobile("left");};
$("mobile-properties").onclick=closeMobile;
document.addEventListener("keydown",keyboard);
window.addEventListener("pagehide",()=>store.persist());
renderComponents();render();setDevice("desktop");
executeAsync(async()=>{const person=await cloud.initialize();if(person)toast("Signed in as "+person.login);});
