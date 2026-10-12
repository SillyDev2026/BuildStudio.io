import {test} from "node:test";
import assert from "node:assert/strict";
import {templates,validateProject,makeLuau,createProject,addNode,duplicateNode,deleteNode,adjustNode,alignNode,reorderNode,snapScale} from "../docs/model.mjs";
for(const k of Object.keys(templates))test(k+" template exports",()=>{const data=templates[k]();assert.ok(validateProject(data));assert.match(makeLuau(data),/ScreenGui/);});
test("nested add, duplicate, delete",()=>{const data=templates.blank();const frame=addNode(data,"Frame");const child=addNode(data,"TextLabel",frame.id);assert.equal(child.parent,frame.id);const copy=duplicateNode(data,frame.id);assert.ok(copy);deleteNode(data,frame.id);assert.equal(data.nodes.filter(n=>n.id===frame.id).length,0);});
test("escape unsafe text",()=>{const data=templates.hud();data.nodes.find(n=>n.type==="TextLabel").text='say "x"\\n\nhi';assert.match(makeLuau(data),/\\\"/);});
test("reject invalid ancestry",()=>{const data=templates.hud();data.nodes[0].parent=data.nodes[0].id;assert.equal(validateProject(data),false);});

test("grid snapping is deterministic, even with negative values",()=>{assert.equal(snapScale(0.137,0.025),0.125);assert.equal(snapScale(-0.026,0.025),-0.025);});
test("geometry clamps dimensions but allows parent-relative offsets",()=>{const data=templates.blank();const n=addNode(data,"Frame");adjustNode(data,n.id,{x:-3,w:-0.3,h:2},{snap:false});assert.equal(n.x,-1);assert.equal(n.w,.015);assert.equal(n.h,1.5);assert.ok(validateProject(data));});
test("geometry snaps to parent-relative increments",()=>{const data=templates.blank();const n=addNode(data,"Frame");adjustNode(data,n.id,{x:.137,y:.313,w:.431},{snap:true});assert.equal(n.x,.125);assert.equal(n.y,.325);assert.equal(n.w,.425);});
test("alignment operates within parent scale",()=>{const data=templates.blank();const parent=addNode(data,"Frame");const child=addNode(data,"TextButton",parent.id);alignNode(data,child.id,"center-x");alignNode(data,child.id,"center-y");assert.equal(child.x,(1-child.w)/2);assert.equal(child.y,(1-child.h)/2);alignNode(data,child.id,"fill-width");assert.equal(child.x,.05);assert.equal(child.w,.9);});
test("reordering affects siblings only",()=>{const data=templates.blank();const a=addNode(data,"Frame"),b=addNode(data,"Frame"),c=addNode(data,"TextLabel",a.id);assert.equal(reorderNode(data,a.id,"up"),true);assert.deepEqual(data.nodes.map(n=>n.id),[b.id,a.id,c.id]);assert.equal(reorderNode(data,c.id,"up"),false);assert.ok(validateProject(data));});
test("invalid dimensions cannot be applied",()=>{const data=templates.blank();const n=addNode(data,"Frame");assert.throws(()=>adjustNode(data,n.id,{x:NaN}),/Invalid geometry/);});
