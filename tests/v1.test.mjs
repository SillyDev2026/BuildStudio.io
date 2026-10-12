import {test} from "node:test";
import assert from "node:assert/strict";
import {COMPONENTS,templates,createProject,addNode,deleteNode,duplicateNode,normalizeProject,validateProject,makeLuau,adjustNode,alignNode,reorderNode,reparentNode,auditProject} from "../docs/model.mjs";
import {ProjectStore,STORAGE_KEY} from "../docs/store.mjs";
import {CloudClient} from "../docs/cloud.mjs";
class MemoryStorage {
  constructor(){this.items=new Map();}
  getItem(k){return this.items.has(k)?this.items.get(k):null;}
  setItem(k,v){this.items.set(k,String(v));}
}
const memory=()=>new MemoryStorage();
for(const [key,factory] of Object.entries(templates)){
  test("v1 template "+key+" validates and exports in both modes",()=>{
    const data=factory();assert.ok(validateProject(data));assert.ok(makeLuau(data).includes('Players.LocalPlayer'));
    assert.ok(makeLuau(data,{mode:"studio"}).includes('GetService("StarterGui")'));
  });
}
test("v0.2 project migration retains original IDs, hierarchy, data",()=>{
  const storage=memory(),old=templates.hud();
  storage.setItem(STORAGE_KEY,JSON.stringify({projects:[createProject("Original",old)],currentId:"bad"}));
  const state=new ProjectStore(storage);
  assert.equal(state.data.nodes.length,old.nodes.length);
  assert.equal(state.data.nodes[0].id,old.nodes[0].id);
  assert.equal(state.data.nodes[0].anchorX,0);
  assert.equal(state.data.nodes[0].layout,"none");
  assert.ok(validateProject(state.data));
});
test("undo and redo including nested node additions",()=>{
  const s=new ProjectStore(memory()),start=s.data.nodes.length;
  const frame=s.createNode("Frame"),child=s.createNode("TextLabel");
  assert.equal(child.parent,frame.id);
  assert.equal(s.data.nodes.length,start+2);
  assert.equal(s.undo(),true);assert.equal(s.data.nodes.length,start+1);
  assert.equal(s.redo(),true);assert.equal(s.data.nodes.length,start+2);
});
test("rename, JSON export/import and autosave",()=>{
  const storage=memory(),s=new ProjectStore(storage);
  s.rename("My Design");assert.equal(s.active().name,"My Design");
  const json=s.exportJSON();const p=s.importJSON(json);assert.equal(p.name,"My Design");
  assert.notEqual(p.id,s.projects[0].id);
  assert.equal(s.persist(),true);
  const restored=new ProjectStore(storage);assert.equal(restored.projects.length,2);
  assert.equal(restored.active().name,"My Design");
});
test("selection, clipping and geometry are parent-relative",()=>{
  const data=templates.blank(),parent=addNode(data,"CanvasGroup"),child=addNode(data,"TextButton",parent.id);
  adjustNode(data,child.id,{x:.137,y:.313,w:.431},{snap:true});
  assert.equal(child.x,.125);assert.equal(child.y,.325);assert.equal(child.w,.425);
  alignNode(data,child.id,"center-x");assert.equal(child.x,(1-child.w)/2);
  alignNode(data,child.id,"fill-height");assert.equal(child.y,.05);
  assert.equal(child.h,.9);
  assert.ok(validateProject(data));
});
test("reparent prevents cycles, self-parenting and invalid owners",()=>{
  const data=templates.blank(),a=addNode(data,"Frame"),b=addNode(data,"CanvasGroup",a.id),label=addNode(data,"TextLabel");
  assert.equal(reparentNode(data,a.id,b.id),false);
  assert.equal(reparentNode(data,b.id,b.id),false);
  assert.equal(reparentNode(data,label.id,a.id),true);
  assert.ok(validateProject(data));
});
test("duplicate subtree and sibling-only order",()=>{
  const data=templates.blank(),a=addNode(data,"Frame"),b=addNode(data,"Frame"),c=addNode(data,"TextLabel",a.id);
  const copy=duplicateNode(data,a.id);assert.notEqual(copy.id,a.id);
  assert.equal(data.nodes.find(n=>n.parent===copy.id).type,"TextLabel");
  assert.equal(reorderNode(data,a.id,"up"),true);
  assert.ok(validateProject(data));
  deleteNode(data,a.id);assert.ok(!data.nodes.some(n=>n.id===c.id));
});
test("studio output escapes unsafe text and adds native styles",()=>{
  const data=templates.blank(),n=addNode(data,"TextButton");
  n.text='hello "world"\\ and\nnew lines';n.stroke=2;n.aspect=1.7778;n.radius=12;n.anchorX=.5;
  const code=makeLuau(data,{mode:"studio"});
  assert.ok(code.includes('UIAspectRatioConstraint'));
  assert.ok(code.includes('UIStroke'));
  assert.ok(code.includes('UICorner'));
  assert.ok(code.includes('AnchorPoint = Vector2.new(0.5'));
  assert.ok(code.includes('hello \\"world\\"'));
  assert.ok(code.includes('\\\\'));
  assert.ok(code.includes('\\nnew lines'));
  assert.ok(!code.includes("Players.LocalPlayer"));
});
test("image IDs are sanitized to digits and invalid data rejected",()=>{
  const data=templates.blank(),n=addNode(data,"ImageLabel");
  n.image="https://www.roblox.com/asset/?id=123456&bad=true";
  assert.ok(makeLuau(data).includes("rbxassetid://123456"));
  n.parent=n.id;assert.equal(validateProject(data),false);
});
test("template warnings are informative, not validation errors",()=>{
  const data=templates.blank(),n=addNode(data,"ImageLabel");n.x=1;
  const issues=auditProject(data);
  assert.ok(issues.some(i=>i.level==="warning"));
  assert.ok(issues.some(i=>i.level==="info"));
});
test("cloud client rejects unconfigured Worker",async()=>{
  const client=new CloudClient("");
  assert.equal(client.configured,false);
  await assert.rejects(client.request("/api/projects"),/not configured/);
});
test("component registry contains all Roblox element types",()=>{
  for(const type of ["Frame","CanvasGroup","ScrollingFrame","TextButton","TextBox","TextLabel","ImageLabel","ImageButton"])assert.ok(COMPONENTS[type]);
});
