// BuildStudio.io v1.0 — portable, dependency-free project model and exporters.
export const COMPONENTS = Object.freeze({
  Frame:{label:"Frame",icon:"▣",container:true}, CanvasGroup:{label:"Canvas Group",icon:"▦",container:true},
  ScrollingFrame:{label:"Scrolling Frame",icon:"☷",container:true}, TextLabel:{label:"Text Label",icon:"T",container:false},
  TextButton:{label:"Text Button",icon:"▰",container:false}, TextBox:{label:"Text Box",icon:"⌨",container:false},
  ImageLabel:{label:"Image Label",icon:"▧",container:false}, ImageButton:{label:"Image Button",icon:"◇",container:false}
});
export const TYPES = Object.freeze(Object.keys(COMPONENTS));
export const FONT_NAMES = Object.freeze(["Gotham","GothamBold","Arial","SourceSans","SourceSansBold","Cartoon","Code","Roboto","FredokaOne"]);
export const DEVICES = Object.freeze({desktop:{label:"Desktop",ratio:"16/9"},tablet:{label:"Tablet",ratio:"4/3"},mobile:{label:"Phone",ratio:"9/16"}});
const finite = n => typeof n === "number" && Number.isFinite(n);
const clamp = (n,a,b) => Math.min(b,Math.max(a,n));
const round = n => Math.round(n * 10000) / 10000;
const uuid = () => typeof crypto!=="undefined" && typeof crypto.randomUUID==="function" ? crypto.randomUUID() : "node-"+Math.random().toString(36).slice(2)+Date.now().toString(36);
const colorOK = n => typeof n==="string" && /^#[0-9a-fA-F]{6}$/.test(n);
export const isContainer = type => !!COMPONENTS[type]?.container;
export function blank(name="Untitled UI"){return {version:1,name:String(name).slice(0,70),nodes:[]};}
export function createProject(name="Untitled UI",data=blank(name)){return {id:uuid(),name:String(name).trim().slice(0,70)||"Untitled UI",data:structuredClone(data),remoteId:null};}
export function makeNode(type,index=1,parent=null){
  if(!COMPONENTS[type])throw Error("Unsupported component: "+type);
  const text=type==="TextLabel"?"New label":type==="TextButton"?"Click me":type==="TextBox"?"Type here":"";
  return {id:uuid(),type,name:type+index,parent,x:0.15,y:0.18,w:isContainer(type)?0.44:0.3,h:isContainer(type)?0.38:0.12,
    anchorX:0,anchorY:0,rotation:0,zIndex:1,text,image:"",color:type==="Frame"||type==="CanvasGroup"?"#1c3447":"#20bfa0",
    textColor:"#ffffff",borderColor:"#ffffff",opacity:0,radius:8,border:0,fontSize:18,visible:true,
    textScaled:true,font:"Gotham",textAlign:"Center",placeholder:"Enter text",clip:false,stroke:0,strokeColor:"#ffffff",
    aspect:0,layout:"none",padding:0};
}
export function normalizeNode(source){
  const template=makeNode(source.type,1,source.parent??null);
  const result={...template,...source};
  for(const field of ["x","y","w","h","anchorX","anchorY","rotation","zIndex","opacity","radius","border","fontSize","stroke","aspect","padding"]){
    const defaults=template[field],n=Number(result[field]);result[field]=finite(n)?n:defaults;
  }
  for(const field of ["color","textColor","borderColor","strokeColor"]){if(!colorOK(result[field]))result[field]=template[field];}
  result.text=String(result.text??"").slice(0,5000);
  result.image=String(result.image??"").slice(0,500);
  result.name=String(result.name??result.type).slice(0,120);
  result.font=FONT_NAMES.includes(result.font)?result.font:"Gotham";
  result.textAlign=["Left","Center","Right"].includes(result.textAlign)?result.textAlign:"Center";
  result.layout=["none","horizontal","vertical","grid"].includes(result.layout)?result.layout:"none";
  result.visible=result.visible!==false;result.textScaled=result.textScaled!==false;result.clip=result.clip===true;
  return result;
}
export function normalizeProject(data){
  if(!validateProject(data))throw Error("Invalid project file");
  return {version:1,name:String(data.name||"Untitled UI").slice(0,70),nodes:data.nodes.map(normalizeNode)};
}
export function validateProject(data){
  if(!data || !Array.isArray(data.nodes) || data.nodes.length>500)return false;
  const lookup=new Map();
  for(const n of data.nodes){
    if(!n || typeof n.id!=="string" || !n.id || n.id.length>100 || lookup.has(n.id) || !COMPONENTS[n.type] || typeof n.name!=="string" || n.name.length>120 || typeof n.text!=="string" || typeof n.image!=="string" || n.text.length>5000 || n.image.length>500)return false;
    if(!["x","y","w","h"].every(k=>finite(n[k]) && n[k]>=-1 && n[k]<=4))return false;
    for(const field of ["anchorX","anchorY","rotation","zIndex","opacity","radius","border","fontSize","stroke","aspect","padding"])if(n[field]!==undefined && (!finite(n[field]) || Math.abs(n[field])>10000))return false;
    lookup.set(n.id,n);
  }
  for(const n of data.nodes){
    let parent=n.parent??null;const chain=new Set([n.id]);
    while(parent!==null){
      if(typeof parent!=="string" || chain.has(parent))return false;
      chain.add(parent);const p=lookup.get(parent);if(!p||!isContainer(p.type))return false;
      parent=p.parent??null;
    }
  }
  return true;
}
export function addNode(data,type,parent=null){
  if(!validateProject(data)||data.nodes.length>=500)throw Error("Project is full or invalid");
  const parentNode=data.nodes.find(n=>n.id===parent);
  const node=makeNode(type,data.nodes.length+1,parentNode&&isContainer(parentNode.type)?parent:null);
  data.nodes.push(node);return node;
}
export function deleteNode(data,id){
  const doomed=new Set([id]);let next=true;
  while(next){next=false;for(const n of data.nodes)if(n.parent && doomed.has(n.parent) && !doomed.has(n.id)){doomed.add(n.id);next=true;}}
  data.nodes=data.nodes.filter(n=>!doomed.has(n.id));return doomed.size;
}
export function duplicateNode(data,id){
  const source=data.nodes.find(n=>n.id===id);if(!source)return null;
  const lookup=new Map(data.nodes.map(n=>[n.id,n])),result=[];
  const walk=(node,parent)=>{
    const copy={...node,id:uuid(),name:(node.name+"_Copy").slice(0,120),parent,x:clamp(node.x+.025,-1,1),y:clamp(node.y+.025,-1,1)};
    result.push(copy);for(const original of lookup.values())if(original.parent===node.id)walk(original,copy.id);
    return copy;
  };
  const root=walk(source,source.parent??null);
  if(data.nodes.length+result.length>500)throw Error("Component limit reached");
  data.nodes.push(...result);return root;
}
export function snapScale(value,step=.025){if(!finite(value)||!finite(step)||step<=0)throw Error("Invalid snap value");return round(Math.round(value/step)*step);}
export function adjustNode(data,id,values,options={}){
  const node=data.nodes.find(n=>n.id===id);if(!node)return null;
  for(const k of ["x","y","w","h"]){
    if(!(k in values))continue;
    let value=Number(values[k]);if(!finite(value))throw Error("Invalid geometry");
    if(options.snap)value=snapScale(value,options.step??.025);
    const size=k==="w"||k==="h";node[k]=round(clamp(value,size?.015:-1,size?1.5:1));
  }
  return node;
}
export function alignNode(data,id,action){
  const n=data.nodes.find(n=>n.id===id);if(!n)return null;
  if(action==="center-x")return adjustNode(data,id,{x:(1-n.w)/2+n.anchorX*n.w});
  if(action==="center-y")return adjustNode(data,id,{y:(1-n.h)/2+n.anchorY*n.h});
  if(action==="fill-width")return adjustNode(data,id,{x:.05+n.anchorX*.9,w:.9});
  if(action==="fill-height")return adjustNode(data,id,{y:.05+n.anchorY*.9,h:.9});
  throw Error("Unknown alignment");
}
export function reorderNode(data,id,direction){
  const index=data.nodes.findIndex(n=>n.id===id);if(index<0||!["up","down"].includes(direction))return false;
  const parent=data.nodes[index].parent??null;
  const siblings=data.nodes.map((n,i)=>(n.parent??null)===parent?i:-1).filter(i=>i>=0);
  const idx=siblings.indexOf(index)+(direction==="up"?1:-1),next=siblings[idx];
  if(next===undefined)return false;
  [data.nodes[next],data.nodes[index]]=[data.nodes[index],data.nodes[next]];return true;
}
export function reparentNode(data,id,newParent){
  const node=data.nodes.find(n=>n.id===id);if(!node)return false;
  if(newParent!==null && !data.nodes.some(n=>n.id===newParent && isContainer(n.type)))return false;
  const old=node.parent;node.parent=newParent;
  if(!validateProject(data)){node.parent=old;return false;}
  return true;
}
export function auditProject(data){
  if(!validateProject(data))return [{level:"error",message:"Project structure is invalid"}];
  const issues=[];
  for(const n of data.nodes){
    const p=normalizeNode(n);
    if(p.x-p.anchorX*p.w>1||p.y-p.anchorY*p.h>1||p.x+(1-p.anchorX)*p.w<0||p.y+(1-p.anchorY)*p.h<0||p.x+(1-p.anchorX)*p.w>1||p.y+(1-p.anchorY)*p.h>1)issues.push({level:"warning",id:n.id,message:p.name+" is outside its parent canvas"});
    if(p.w<.045||p.h<.035)issues.push({level:"warning",id:n.id,message:p.name+" may be difficult to tap"});
    if(p.type.startsWith("Image")&&!p.image)issues.push({level:"info",id:n.id,message:p.name+" has no Roblox image asset ID"});
  }
  return issues;
}
const n=(id,name,type,parent,x,y,w,h,text="",color="#263b53")=>({...makeNode(type,1,parent),id,name,x,y,w,h,text,color});
export const templates={
  blank:()=>blank("Blank Canvas"),
  hud:()=>({version:1,name:"Starter HUD",nodes:[
    n("hud-bar","TopBar","Frame",null,.03,.04,.94,.13,"","#172b42"),
    n("hud-title","GameTitle","TextLabel","hud-bar",.04,.15,.38,.7,"MY GAME"),
    n("hud-coins","CoinBalance","TextLabel","hud-bar",.66,.15,.30,.7,"● 1,250"),
    n("hud-menu","MenuPanel","Frame",null,.04,.31,.25,.38,"","#1d3850"),
    n("hud-menu-title","MenuTitle","TextLabel","hud-menu",.1,.1,.8,.2,"MENU"),
    n("hud-shop","ShopButton","TextButton","hud-menu",.1,.45,.8,.3,"SHOP","#198e8f"),
    n("hud-start","ActionButton","TextButton",null,.36,.79,.28,.12,"PLAY","#16b992")]}),
  shop:()=>({version:1,name:"Item Shop",nodes:[
    n("shop-panel","ShopPanel","Frame",null,.12,.1,.76,.79,"","#13293c"),
    n("shop-title","ShopTitle","TextLabel","shop-panel",.08,.05,.84,.13,"ITEM SHOP"),
    n("shop-card1","SwordCard","Frame","shop-panel",.08,.24,.39,.53,"","#25445c"),
    n("shop-card2","ShieldCard","Frame","shop-panel",.53,.24,.39,.53,"","#25445c"),
    n("shop-name1","SwordName","TextLabel","shop-card1",.1,.1,.8,.3,"SWORD"),
    n("shop-name2","ShieldName","TextLabel","shop-card2",.1,.1,.8,.3,"SHIELD"),
    n("shop-buy1","BuySword","TextButton","shop-card1",.1,.62,.8,.24,"BUY 50","#18b98d"),
    n("shop-buy2","BuyShield","TextButton","shop-card2",.1,.62,.8,.24,"BUY 75","#18b98d")]}),
  inventory:()=>({version:1,name:"Inventory",nodes:[
    n("inv-bg","InventoryPanel","Frame",null,.16,.12,.68,.75,"","#172b42"),
    n("inv-title","InventoryTitle","TextLabel","inv-bg",.05,.06,.7,.11,"INVENTORY"),
    n("inv-close","CloseButton","TextButton","inv-bg",.86,.06,.09,.11,"X","#9f4551"),
    n("inv-item1","Slot1","Frame","inv-bg",.07,.25,.25,.32,"","#264760"),
    n("inv-item2","Slot2","Frame","inv-bg",.375,.25,.25,.32,"","#264760"),
    n("inv-item3","Slot3","Frame","inv-bg",.68,.25,.25,.32,"","#264760"),
    n("inv-equip","EquipButton","TextButton","inv-bg",.32,.78,.36,.12,"EQUIP","#13ad8b")]}),
  leaderboard:()=>({version:1,name:"Leaderboard",nodes:[
    n("lb-panel","LeaderboardPanel","Frame",null,.56,.08,.40,.77,"","#182e44"),
    n("lb-title","LeaderboardTitle","TextLabel","lb-panel",.07,.05,.86,.12,"TOP PLAYERS"),
    n("lb-row1","FirstPlace","TextLabel","lb-panel",.08,.25,.84,.13,"1. PlayerOne • 9,500"),
    n("lb-row2","SecondPlace","TextLabel","lb-panel",.08,.43,.84,.13,"2. PlayerTwo • 8,200"),
    n("lb-row3","ThirdPlace","TextLabel","lb-panel",.08,.61,.84,.13,"3. PlayerThree • 7,100")]}),
  settings:()=>({version:1,name:"Settings Menu",nodes:[
    n("settings-bg","SettingsPanel","Frame",null,.22,.13,.56,.74,"","#192d44"),
    n("settings-title","SettingsTitle","TextLabel","settings-bg",.1,.08,.8,.14,"SETTINGS"),
    n("settings-music","MusicToggle","TextButton","settings-bg",.15,.32,.7,.16,"MUSIC: ON","#245e72"),
    n("settings-fx","SfxToggle","TextButton","settings-bg",.15,.53,.7,.16,"SFX: ON","#245e72"),
    n("settings-done","DoneButton","TextButton","settings-bg",.29,.79,.42,.12,"DONE","#16ad92")]}),
  loading:()=>({version:1,name:"Loading Screen",nodes:[
    n("load-bg","Background","Frame",null,0,0,1,1,"","#10283a"),
    n("load-title","Title","TextLabel","load-bg",.2,.28,.6,.18,"LOADING WORLD"),
    n("load-track","ProgressTrack","Frame","load-bg",.25,.55,.5,.06,"","#244b61"),
    n("load-progress","ProgressBar","Frame","load-track",0,0,.56,1,"","#16c99c"),
    n("load-status","ProgressLabel","TextLabel","load-bg",.3,.66,.4,.1,"56%")]}),
  notification:()=>({version:1,name:"Notification",nodes:[
    n("note-back","ToastPanel","Frame",null,.59,.07,.37,.2,"","#22394f"),
    n("note-title","ToastTitle","TextLabel","note-back",.07,.12,.86,.32,"QUEST COMPLETED"),
    n("note-desc","ToastDescription","TextLabel","note-back",.07,.53,.86,.25,"+500 XP")]}),
  profile:()=>({version:1,name:"Player Profile",nodes:[
    n("profile-bg","ProfilePanel","Frame",null,.16,.1,.68,.8,"","#162e43"),
    n("profile-name","DisplayName","TextLabel","profile-bg",.12,.12,.76,.16,"YOUR PROFILE"),
    n("profile-level","LevelLabel","TextLabel","profile-bg",.18,.39,.64,.13,"LEVEL 25"),
    n("profile-xp","XPTrack","Frame","profile-bg",.18,.59,.64,.07,"","#27516b"),
    n("profile-fill","XPFill","Frame","profile-xp",0,0,.7,1,"","#16caa1"),
    n("profile-close","CloseProfile","TextButton","profile-bg",.34,.76,.32,.12,"CLOSE","#198a91")]})
};
const luaStr=x=>'"'+String(x??"").replace(/\\/g,"\\\\").replace(/"/g,'\\"').replace(/\r/g,"\\r").replace(/\n/g,"\\n")+'"';
const num=n=>String(round(Number(n)||0));
const toRgb=val=>{const h=colorOK(val)?val:"#ffffff";return "Color3.fromRGB("+[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(", ")+")";};
const asset=image=>{const str=String(image||"");const match=str.match(/(\d+)/);return match?"rbxassetid://"+match[1]:"";};
export function makeLuau(data,options={}){
  if(!validateProject(data))throw Error("Invalid project");
  const mode=options.mode==="studio"?"studio":"runtime";
  const lines=["-- BuildStudio.io v1 • "+(mode==="studio"?"Studio Command Bar":"LocalScript"),"-- Uses scale-based UDim2 geometry and Roblox-native UI objects.",""];
  if(mode==="runtime")lines.push('local Players = game:GetService("Players")','local player = Players.LocalPlayer','local target = player:WaitForChild("PlayerGui")');
  else lines.push('local target = game:GetService("StarterGui")');
  lines.push('local previous = target:FindFirstChild("BuildStudioGui")','if previous then previous:Destroy() end','local screenGui = Instance.new("ScreenGui")','screenGui.Name = "BuildStudioGui"','screenGui.ResetOnSpawn = false','screenGui.IgnoreGuiInset = true','screenGui.Parent = target','');
  const lookup=new Map(data.nodes.map(node=>[node.id,normalizeNode(node)])),vars=new Map();let counter=0;
  function emit(node){
    if(vars.has(node.id))return;
    if(node.parent)emit(lookup.get(node.parent));
    const id="ui"+(++counter),parent=node.parent?vars.get(node.parent):"screenGui";vars.set(node.id,id);
    lines.push("local "+id+" = Instance.new("+luaStr(node.type)+")");
    lines.push(id+".Name = "+luaStr(node.name));
    lines.push(id+".Position = UDim2.fromScale("+num(node.x)+", "+num(node.y)+")");
    lines.push(id+".Size = UDim2.fromScale("+num(node.w)+", "+num(node.h)+")");
    lines.push(id+".AnchorPoint = Vector2.new("+num(clamp(node.anchorX,0,1))+", "+num(clamp(node.anchorY,0,1))+")");
    lines.push(id+".Rotation = "+num(clamp(node.rotation,-360,360)));
    lines.push(id+".ZIndex = "+Math.round(clamp(node.zIndex,1,100)));
    lines.push(id+".BackgroundColor3 = "+toRgb(node.color));
    lines.push(id+".BackgroundTransparency = "+num(clamp(node.opacity,0,100)/100));
    lines.push(id+".BorderColor3 = "+toRgb(node.borderColor));
    lines.push(id+".BorderSizePixel = "+Math.round(clamp(node.border,0,24)));
    lines.push(id+".Visible = "+(node.visible?"true":"false"));
    if(isContainer(node.type))lines.push(id+".ClipsDescendants = "+(node.clip?"true":"false"));
    if(node.type==="ScrollingFrame"){lines.push(id+".AutomaticCanvasSize = Enum.AutomaticSize.Y");lines.push(id+".ScrollBarThickness = 6");}
    if(node.type.startsWith("Text")){
      lines.push(id+".Text = "+luaStr(node.text));
      lines.push(id+".TextColor3 = "+toRgb(node.textColor));
      lines.push(id+".Font = Enum.Font."+node.font);
      lines.push(id+".TextSize = "+Math.round(clamp(node.fontSize,6,96)));
      lines.push(id+".TextScaled = "+(node.textScaled?"true":"false"));
      lines.push(id+".TextWrapped = true");
      lines.push(id+".TextXAlignment = Enum.TextXAlignment."+node.textAlign);
      if(node.type==="TextBox")lines.push(id+".PlaceholderText = "+luaStr(node.placeholder));
    }
    if(node.type.startsWith("Image"))lines.push(id+".Image = "+luaStr(asset(node.image)));
    if(node.radius>0){const fx="corner"+counter;lines.push("local "+fx+" = Instance.new(\"UICorner\")",fx+".CornerRadius = UDim.new(0, "+Math.round(clamp(node.radius,0,100))+")",fx+".Parent = "+id);}
    if(node.stroke>0){const fx="stroke"+counter;lines.push("local "+fx+" = Instance.new(\"UIStroke\")",fx+".Thickness = "+num(clamp(node.stroke,0,24)),fx+".Color = "+toRgb(node.strokeColor),fx+".Parent = "+id);}
    if(node.aspect>0){const fx="aspect"+counter;lines.push("local "+fx+" = Instance.new(\"UIAspectRatioConstraint\")",fx+".AspectRatio = "+num(clamp(node.aspect,.1,10)),fx+".Parent = "+id);}
    if(isContainer(node.type) && node.padding>0){const fx="padding"+counter;lines.push("local "+fx+" = Instance.new(\"UIPadding\")",fx+".PaddingTop = UDim.new("+num(clamp(node.padding,0,.4))+", 0)",fx+".PaddingBottom = UDim.new("+num(clamp(node.padding,0,.4))+", 0)",fx+".PaddingLeft = UDim.new("+num(clamp(node.padding,0,.4))+", 0)",fx+".PaddingRight = UDim.new("+num(clamp(node.padding,0,.4))+", 0)",fx+".Parent = "+id);}
    if(isContainer(node.type) && node.layout!=="none"){
      const type=node.layout==="grid"?"UIGridLayout":"UIListLayout",fx="layout"+counter;
      lines.push("local "+fx+" = Instance.new("+luaStr(type)+")");
      if(type==="UIListLayout")lines.push(fx+".FillDirection = Enum.FillDirection."+(node.layout==="horizontal"?"Horizontal":"Vertical"));
      else lines.push(fx+".CellSize = UDim2.fromScale(0.3, 0.22)",fx+".CellPadding = UDim2.fromScale(0.025, 0.025)");
      lines.push(fx+".Parent = "+id);
    }
    lines.push(id+".Parent = "+parent,"");
  }
  for(const node of data.nodes)emit(lookup.get(node.id));
  lines.push("-- Connect TextButton.MouseButton1Click and other behavior in your own scripts.");
  return lines.join("\n");
}
