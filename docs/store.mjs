// BuildStudio v1 — persistent editor state, history, migration and project lifecycle.
import {blank,createProject,normalizeProject,validateProject,addNode,duplicateNode,deleteNode,adjustNode,alignNode,reorderNode,reparentNode,templates} from "./model.mjs";
export const STORAGE_KEY="buildstudio.v1.projects"; // Reuse 0.2 storage so users keep their designs.
const clone=x=>structuredClone(x);
const cleanName=x=>String(x??"").trim().slice(0,70)||"Untitled UI";
export class ProjectStore {
  constructor(storage=typeof localStorage!=="undefined"?localStorage:null){
    this.storage=storage;this.projects=[];this.currentId="";this.selected=null;
    this.history=[];this.future=[];this.listeners=new Set();this.timer=null;this.changedAt=0;
    this.restore();
  }
  restore(){
    try {
      const state=JSON.parse(this.storage?.getItem(STORAGE_KEY)||"{}");
      if(Array.isArray(state.projects)){
        const ids=new Set();
        for(const p of state.projects.slice(0,75)){
          if(!p||typeof p.id!=="string"||ids.has(p.id)||!validateProject(p.data))continue;
          ids.add(p.id);this.projects.push({...p,name:cleanName(p.name),data:normalizeProject(p.data),remoteId:typeof p.remoteId==="string"?p.remoteId:null});
        }
      }
      this.currentId=state.currentId;
    } catch {}
    if(!this.projects.length){const starter=createProject("Starter HUD",templates.hud());this.projects=[starter];this.currentId=starter.id;}
    if(!this.active())this.currentId=this.projects[0].id;
  }
  get data(){return this.active()?.data;}
  active(){return this.projects.find(p=>p.id===this.currentId)||null;}
  onChange(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
  notify(reason="change"){for(const listener of this.listeners)listener(reason,this);}
  schedule(){
    this.changedAt=Date.now();this.notify("change");
    if(this.timer)clearTimeout(this.timer);
    this.timer=setTimeout(()=>this.persist(),250);
  }
  persist(){
    if(this.timer){clearTimeout(this.timer);this.timer=null;}
    if(!this.storage)return false;
    try{this.storage.setItem(STORAGE_KEY,JSON.stringify({projects:this.projects,currentId:this.currentId}));this.notify("saved");return true;}
    catch{this.notify("storage-error");return false;}
  }
  snapshot(){
    if(!this.data)return;
    this.history.push(JSON.stringify(this.data));
    if(this.history.length>100)this.history.shift();
    this.future.length=0;
  }
  change(action){
    if(!this.data)return false;
    const before=JSON.stringify(this.data);
    const selection=this.selected;
    try {
      action(this.data);
      if(!validateProject(this.data))throw Error("Invalid project change");
      if(JSON.stringify(this.data)===before)return false;
      this.history.push(before);if(this.history.length>100)this.history.shift();this.future.length=0;
      if(this.selected && !this.data.nodes.some(n=>n.id===this.selected))this.selected=null;
      this.schedule();return true;
    }catch(error){this.active().data=JSON.parse(before);this.selected=selection;throw error;}
  }
  beginGesture(){if(!this.data)return null;return JSON.stringify(this.data);}
  endGesture(before){
    if(!before||!this.data||JSON.stringify(this.data)===before)return false;
    if(!validateProject(this.data)){this.active().data=JSON.parse(before);throw Error("Invalid gesture");}
    this.history.push(before);if(this.history.length>100)this.history.shift();this.future.length=0;this.schedule();return true;
  }
  undo(){
    if(!this.history.length||!this.data)return false;
    this.future.push(JSON.stringify(this.data));this.active().data=JSON.parse(this.history.pop());this.schedule();return true;
  }
  redo(){
    if(!this.future.length||!this.data)return false;
    this.history.push(JSON.stringify(this.data));this.active().data=JSON.parse(this.future.pop());this.schedule();return true;
  }
  select(id){this.selected=id&&this.data?.nodes.some(n=>n.id===id)?id:null;this.notify("selection");}
  choose(id){if(!this.projects.some(p=>p.id===id))return false;this.currentId=id;this.selected=null;this.history=[];this.future=[];this.schedule();return true;}
  create(name="Untitled UI",template="blank"){
    if(this.projects.length>=75)throw Error("Local project limit reached");
    const factory=templates[template]||templates.blank,p=createProject(cleanName(name),factory());
    this.projects.push(p);this.choose(p.id);return p;
  }
  rename(name){const p=this.active();if(!p)return;const val=cleanName(name);p.name=val;p.data.name=val;this.schedule();}
  removeProject(id){if(this.projects.length<2)throw Error("Keep at least one project");this.projects=this.projects.filter(p=>p.id!==id);if(!this.active())this.choose(this.projects[0].id);else this.schedule();}
  importJSON(input){
    const parsed=typeof input==="string"?JSON.parse(input):input;
    const data=parsed?.data||parsed;
    if(!validateProject(data))throw Error("Invalid BuildStudio JSON");
    if(this.projects.length>=75)throw Error("Local project limit reached");
    const p=createProject(cleanName(parsed.name||data.name||"Imported Design"),normalizeProject(data));
    this.projects.push(p);this.choose(p.id);return p;
  }
  exportJSON(){const p=this.active();return JSON.stringify({format:"buildstudio.io",version:1,name:p.name,data:p.data},null,2);}
  createNode(type,parent=this.selected){let item;this.change(data=>{item=addNode(data,type,parent);this.selected=item.id;});return item;}
  duplicate(){let item;this.change(data=>{item=duplicateNode(data,this.selected);if(item)this.selected=item.id;});return item;}
  removeNode(){if(!this.selected)return;this.change(data=>deleteNode(data,this.selected));this.selected=null;this.notify("selection");}
  patch(id,values){return this.change(data=>{const n=data.nodes.find(n=>n.id===id);if(!n)return;for(const [k,v] of Object.entries(values))if(k!=="id"&&k!=="type"&&k!=="parent")n[k]=v;});}
  geometry(id,values,options){return this.change(data=>adjustNode(data,id,values,options));}
  align(action){return this.change(data=>alignNode(data,this.selected,action));}
  reorder(direction){return this.change(data=>reorderNode(data,this.selected,direction));}
  reparent(parent){return this.change(data=>reparentNode(data,this.selected,parent));}
  replaceTemplate(key){if(!templates[key])throw Error("Unknown template");return this.change(data=>{const next=templates[key]();data.nodes=clone(next.nodes);this.selected=null;});}
  connectRemote(remoteId){const p=this.active();p.remoteId=remoteId;this.schedule();}
}
