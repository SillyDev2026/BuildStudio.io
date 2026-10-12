// BuildStudio canvas engine — nested scale geometry, mouse/touch gestures and drawing.
import {adjustNode,normalizeNode,isContainer} from "./model.mjs";
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const rgba=(hex,alpha)=>{if(!/^#[0-9a-f]{6}$/i.test(hex))return "transparent";return "rgba("+[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(",") + ","+clamp(alpha,0,1)+")";};
export class CanvasView {
  constructor(board,store,{getSnap=()=>false,getPreview=()=>false,onSelection=()=>{}}={}){
    this.board=board;this.store=store;this.getSnap=getSnap;this.getPreview=getPreview;this.onSelection=onSelection;this.drag=null;
    this.host=board.querySelector("#elements");
    board.addEventListener("pointerdown",event=>{
      if(event.target===board || event.target===this.host || event.target.classList.contains("grid")){
        if(!this.getPreview())store.select(null);
      }
    });
    this.unsubscribe=store.onChange(reason=>{
      if(this.drag)return;
      if(reason==="change"||reason==="selection")this.render();
    });
    this.render();
  }
  applyGeometry(el,n){
    el.style.left=(n.x*100)+"%";el.style.top=(n.y*100)+"%";
    el.style.width=(n.w*100)+"%";el.style.height=(n.h*100)+"%";
    el.style.transform="translate("+(-clamp(n.anchorX,0,1)*100)+"%, "+(-clamp(n.anchorY,0,1)*100)+"%) rotate("+clamp(n.rotation,-360,360)+"deg)";
    el.style.zIndex=String(Math.round(clamp(n.zIndex,1,100)));
  }
  render(){
    if(!this.host || this.drag || !this.store.data)return;
    const nodes=this.store.data.nodes,byParent=new Map(),preview=this.getPreview();
    for(const n of nodes){const parent=n.parent??null;if(!byParent.has(parent))byParent.set(parent,[]);byParent.get(parent).push(n);}
    const draw=(container,parent)=>{
      for(const source of byParent.get(parent)||[]){
        const n=normalizeNode(source),el=document.createElement("div");el.className="ui-node"+(source.id===this.store.selected&&!preview?" selected":"");
        el.dataset.id=source.id;el.dataset.type=n.type;el.setAttribute("aria-label",n.name+" ("+n.type+")");
        this.applyGeometry(el,n);
        el.style.backgroundColor=rgba(n.color,1-clamp(n.opacity,0,100)/100);
        el.style.color=n.textColor;el.style.border=n.border+"px solid "+n.borderColor;el.style.borderRadius=n.radius+"px";
        el.style.outlineOffset="2px";el.style.visibility=n.visible?"visible":"hidden";
        el.style.overflow=n.clip?"hidden":"visible";el.style.boxShadow=n.stroke>0?"inset 0 0 0 "+n.stroke+"px "+n.strokeColor:"none";
        if(n.type.startsWith("Text")){const label=document.createElement("div");label.className="node-text";
          label.textContent=n.text;label.style.justifyContent=n.textAlign==="Left"?"flex-start":n.textAlign==="Right"?"flex-end":"center";
          label.style.fontFamily=n.font==="Code"?"monospace":"inherit";label.style.fontWeight=/Bold/.test(n.font)?"800":"500";
          label.style.fontSize=n.textScaled?"clamp(9px,1.35vw,22px)":n.fontSize+"px";el.append(label);
        }else if(n.type.startsWith("Image")){const image=document.createElement("div");image.className="node-image";
          image.textContent=n.image?"IMAGE #"+(String(n.image).match(/\d+/)?.[0]||""):"▧ Add image asset";el.append(image);
        }else if(n.type==="ScrollingFrame"){const glyph=document.createElement("span");glyph.className="node-badge";glyph.textContent="↕";el.append(glyph);}
        if(isContainer(n.type) && n.layout!=="none"){const marker=document.createElement("span");marker.className="node-badge";marker.textContent=n.layout.toUpperCase();el.append(marker);}
        if(source.id===this.store.selected&&!preview){const handle=document.createElement("span");handle.className="resize-handle";handle.dataset.handle="resize";el.append(handle);}
        el.addEventListener("pointerdown",event=>this.start(event,source,el));
        container.append(el);draw(el,source.id);
      }
    };
    this.host.replaceChildren();draw(this.host,null);
  }
  start(e,n,el){
    e.stopPropagation();if(this.getPreview())return;
    if(e.button!==0 && e.pointerType!=="touch")return;
    this.store.selected=n.id;
    this.host.querySelectorAll(".ui-node.selected").forEach(node=>node.classList.remove("selected"));
    el.classList.add("selected");
    this.onSelection(n.id);
    const parent=el.parentElement.getBoundingClientRect();
    const width=Math.max(1,parent.width),height=Math.max(1,parent.height);
    const drag={id:n.id,startX:e.clientX,startY:e.clientY,width,height,
      before:this.store.beginGesture(),resize:e.target.dataset.handle==="resize",initial:{x:n.x,y:n.y,w:n.w,h:n.h}};
    this.drag=drag;el.setPointerCapture(e.pointerId);
    const move=event=>{
      if(this.drag!==drag)return;
      const dx=(event.clientX-drag.startX)/drag.width,dy=(event.clientY-drag.startY)/drag.height;
      if(drag.resize)adjustNode(this.store.data,drag.id,{w:drag.initial.w+dx,h:drag.initial.h+dy},{snap:this.getSnap()});
      else adjustNode(this.store.data,drag.id,{x:drag.initial.x+dx,y:drag.initial.y+dy},{snap:this.getSnap()});
      const current=this.store.data.nodes.find(x=>x.id===drag.id);
      if(current)this.applyGeometry(el,current);
      this.onSelection(n.id,true);
    };
    const finish=()=>{
      el.removeEventListener("pointermove",move);el.removeEventListener("pointerup",finish);el.removeEventListener("pointercancel",finish);
      if(this.drag!==drag)return;
      this.drag=null;
      try{this.store.endGesture(drag.before);}catch(error){this.onSelection(null,false,error.message);}
      this.store.notify("selection");this.render();
    };
    el.addEventListener("pointermove",move);el.addEventListener("pointerup",finish);el.addEventListener("pointercancel",finish);
  }
}
