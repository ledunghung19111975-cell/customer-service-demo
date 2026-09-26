const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../engine.js');

// Minimal DOM adapter for rendered output and form logic; browser checks cover actual interaction.
function app() {
  const nodes = new Map();
  const node = () => ({ innerHTML: '', textContent: '', hidden: false, open: false,
    querySelectorAll: () => [], querySelector: () => null, addEventListener() {},
    classList: { add() {}, remove() {}, contains: () => false }, close() {}, showModal() {}, focus() {} });
  const context = vm.createContext({
    window: { CustomerDemo: Core, addEventListener() {} },
    document: { body: node(), addEventListener() {}, querySelectorAll: () => [],
      querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector,node()); return nodes.get(selector); } },
    localStorage: { getItem: () => null, setItem() {} }, location: { hash: '#workflow' },
    setTimeout: () => 0, clearTimeout() {},
    FormData: class { constructor(form) { return Object.entries(form.values); } }
  });
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
