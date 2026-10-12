import {test} from "node:test";
import assert from "node:assert/strict";
import {templates,validateProject,makeLuau,createProject,addNode,duplicateNode,deleteNode} from "../docs/model.mjs";
for(const k of Object.keys(templates))test(k+" template exports",()=>{const data=templates[k]();assert.ok(validateProject(data));assert.match(makeLuau(data),/ScreenGui/);});
test("nested add, duplicate, delete",()=>{const data=templates.blank();const frame=addNode(data,"Frame");const child=addNode(data,"TextLabel",frame.id);assert.equal(child.parent,frame.id);const copy=duplicateNode(data,frame.id);assert.ok(copy);deleteNode(data,frame.id);assert.equal(data.nodes.filter(n=>n.id===frame.id).length,0);});
test("escape unsafe text",()=>{const data=templates.hud();data.nodes.find(n=>n.type==="TextLabel").text='say "x"\\n\nhi';assert.match(makeLuau(data),/\\\"/);});
test("reject invalid ancestry",()=>{const data=templates.hud();data.nodes[0].parent=data.nodes[0].id;assert.equal(validateProject(data),false);});
