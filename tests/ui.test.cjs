const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../engine.js');

// Minimal DOM adapter for rendered output and form logic; browser checks cover actual interaction.
function app(stored = {}) {
  const nodes = new Map();
  const node = () => ({ innerHTML: '', textContent: '', hidden: false, open: false,
    querySelectorAll: () => [], querySelector: () => null, addEventListener() {},
    classList: { add() {}, remove() {}, contains: () => false }, close() {}, showModal() {}, focus() {} });
  const context = vm.createContext({
    window: { CustomerDemo: Core, CustomerFlow: Core.Graph, addEventListener() {} },
    document: { body: node(), addEventListener() {}, querySelectorAll: () => [],
      querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector,node()); return nodes.get(selector); } },
    localStorage: { getItem: key => key in stored ? stored[key] : null, setItem: (key, value) => { stored[key] = value; } }, location: { hash: '#workflow' },
    setTimeout: () => 0, clearTimeout() {},
    FormData: class { constructor(form) { return Object.entries(form.values); } }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../flow-editor.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),context);
  return code => vm.runInContext(code,context);
}

test('关闭自助售后后客户事项无申请入口，坐席仍可受理',()=>{
  const run=app();
  run("state.draft.intakeEnabled=false;Core.evaluateFlow(state);Core.publishFlow(state);const s=Core.newSession(state);Core.sendVisitor(state,s.id,'我要申请退货 SO20260926001');");
  assert.doesNotMatch(run('renderItems(s)'),/data-action="item-ticket"/);
  assert.match(run('renderItems(s,true)'),/data-action="item-ticket"/);
});

test('实时工具停用后旧草稿试问失效，重新试问使用当前状态',()=>{
  const run=app();
  run("submitForm({dataset:{form:'flow-test'},values:{question:'查询订单 SO20260926001'}});");
  assert.match(run('renderWorkflow()'),/class="order-card"/);
  run("Core.setRuntime(state,{toolEnabled:false},'演示故障');");
  assert.doesNotMatch(run('renderWorkflow()'),/class="order-card"/);
  run("submitForm({dataset:{form:'flow-test'},values:{question:'查询订单 SO20260926001'}});");
  assert.doesNotMatch(run('renderWorkflow()'),/class="order-card"/);
  assert.match(run('renderWorkflow()'),/工具已停用|紧急停用/);
});

test('接管占用改变后草稿试问不能保留旧容量结论',()=>{
  const run=app();
  run("submitForm({dataset:{form:'flow-test'},values:{question:'请转人工'}});");
  assert.match(run('renderWorkflow()'),/访客看到的结果/);
  run("const s=Core.newSession(state);Core.sendVisitor(state,s.id,'请转人工');Core.takeover(state,s.id);");
  assert.doesNotMatch(run('renderWorkflow()'),/访客看到的结果/);
});

test('作答门槛在检索试验、FAQ 表单和流程节点中可见',()=>{
  const run=app();
  run("submitForm({dataset:{form:'knowledge-test'},values:{question:'七天无理由退货有什么条件？'}});");
  assert.match(run("$('#kb-result').innerHTML"),/命中依据：标准问题/);
  run("submitForm({dataset:{form:'knowledge-test'},values:{question:'退款多久到账'}});");
  assert.match(run("$('#kb-result').innerHTML"),/至少命中 2 个关键词/);
  run("knowledgeModal();");
  assert.match(run("$('#modal-content').innerHTML"),/至少命中 2 个关键词/);
  run("ui.node='knowledge';");
  assert.match(run('nodeForm()'),/至少命中 2 个关键词/);
});

test('旧 V3 本地数据不被沿用，也不被覆盖',()=>{
  const old=Core.newState();old.knowledge[0].keywords='退货,无理由,七天,退款';
  const stored={'zhixu-customer-demo-v3':JSON.stringify(old)},run=app(stored);
  assert.equal(run("state.knowledge.find(k=>k.id==='KB001').keywords"),Core.newState().knowledge[0].keywords);
  assert.equal(stored['zhixu-customer-demo-v3'],JSON.stringify(old));
  assert.ok(JSON.parse(stored['zhixu-customer-demo-v3.1']).knowledge.length);
});

test('已选知识停用后仍显示原范围，仅修改名称不会扩大检索范围',()=>{
  const run=app();
  run("ui.node='knowledge';state.draft.graph.nodes.find(n=>n.id==='knowledge').config.knowledgeId='KB001';Core.disableKnowledge(state,'KB001','核实条目内容');");
  assert.match(run('nodeForm()'), /value="KB001" selected>KB001 · 当前不可用（保留范围）/);
  run("saveNodeInput({dataset:{nodeId:'knowledge'},values:{label:'指定退货规则',knowledgeId:'KB001'}});");
  assert.equal(run("state.draft.graph.nodes.find(n=>n.id==='knowledge').config.knowledgeId"),'KB001');
  assert.equal(run("Core.simulate('七天无理由退货有什么条件？',{},state.draft,state.knowledge).messages.some(m=>m.citation)"),false);
});
