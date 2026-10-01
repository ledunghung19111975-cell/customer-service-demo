const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../engine.js');
const Copy = require('../product-copy.js');

// Minimal DOM adapter for rendered output and form logic; browser checks cover actual interaction.
function app(stored = {}, options = {}) {
  const nodes = new Map();
  const node = () => ({ innerHTML: '', textContent: '', hidden: false, open: false,
    querySelectorAll: () => [], querySelector: () => null, addEventListener() {},
    classList: { add() {}, remove() {}, contains: () => false }, close() {}, showModal() {}, focus() {} });
  const context = vm.createContext({
    window: { CustomerDemo: Core, CustomerFlow: Core.Graph, CustomerPresentation: Copy, addEventListener() {}, scrollTo() {} },
    document: { body: node(), addEventListener() {}, querySelectorAll: () => [],
      querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector,node()); return nodes.get(selector); } },
    localStorage: { getItem: key => key in stored ? stored[key] : null, setItem: (key, value) => { if (options.failWrite) throw new Error('quota'); stored[key] = value; } }, location: { hash: '#workflow', search: options.customer ? '?view=customer' : '' },
    history: { pushState() {} }, Blob,
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

test('客户新开咨询后仍可找回旧工单，历史列表不混入其他客户',()=>{
  const run=app({}, {customer:true});
  run("const old=Core.newSession(state);Core.sendVisitor(state,old.id,'我要申请退货 SO20260926001');const item=Core.sessionItems(state,old)[0];const ticket=Core.createTicket(state,{sessionId:old.id,itemId:item.id,title:'售后申请',description:'测试退货申请',category:'售后服务',priority:'普通',objectId:item.objectId,customerSubmitted:true,requestKey:'history-test'});Core.finish(state,old.id,'visitor');ui.play=Core.newSession(state).id;const other=Core.newSession(state,'林小夏',{customerId:'OTHER'});const otherName=Core.newSession(state,'其他客户');");
  const html=run('renderPlayground()');
  assert.match(html,new RegExp(`data-action="open-visitor" data-id="${run('old.id')}"`));
  assert.match(html,new RegExp(run('ticket.id')));
  assert.doesNotMatch(html,new RegExp(`data-id="${run('other.id')}"|data-id="${run('otherName.id')}"`));
  assert.doesNotMatch(html,/data-play-select|preview-diagnostics|data-action="open-session"/);
  run("action({dataset:{action:'open-visitor',id:old.id}})");
  assert.equal(run('ui.play'),run('old.id'));
  assert.match(run('renderPlayground()'),new RegExp(`data-action="ticket-read" data-id="${run('ticket.id')}"`));
});

test('异常保存值不被覆盖，恢复导出逐字保留原始记录', async()=>{
  const key='zhixu-customer-demo-v3.1';
  for(const raw of ['{invalid-json','{"schema":3,"recovery":"ORIGINAL-NEEDS-RECOVERY"}']) {
    const stored={[key]:raw},run=app(stored);
    assert.equal(stored[key],raw);
    assert.equal(run('persistenceBlocked'),true);
    assert.match(run('persistenceMessage'),/临时工作空间/);
    run("let exported,downloadName;const link={click(){downloadName=this.download;},remove(){}};document.createElement=()=>link;document.body.appendChild=()=>{};const URL={createObjectURL(blob){exported=blob;return 'blob:test';},revokeObjectURL(){}};exportWorkspace();");
    assert.equal(await run('exported.text()'),raw);
    assert.match(run('downloadName'),/^zhixu-original-storage-.*\.txt$/);
  }
});

test('真实旧状态升级先完整备份，备份失败则阻止持久化覆盖',()=>{
  const key='zhixu-customer-demo-v3.1',old=Core.newState();
  old.runtime.reason='初始演示配置';
  const raw=JSON.stringify(old),stored={[key]:raw},run=app(stored);
  assert.equal(stored[key+':before-product-copy-v1'],raw);
  assert.equal(run('state.runtime.reason'),'初始接待配置');
  assert.equal(run('state.presentationCopyVersion'),1);
  const blocked={[key]:raw},failed=app(blocked,{failWrite:true});
  assert.equal(blocked[key],raw);
  assert.equal(failed('persistenceBlocked'),true);
  assert.equal(failed('originalStoredValue'),raw);
});

test('清空保存失败保留当前内存和原始存储',()=>{
  const key='zhixu-customer-demo-v3.1',saved=Core.newState();saved.presentationCopyVersion=1;
  const raw=JSON.stringify(saved),stored={[key]:raw},run=app(stored,{failWrite:true});
  const before=run('JSON.stringify(state)');
  assert.throws(()=>run("action({dataset:{action:'confirm-reset'}})"),/quota/);
  assert.equal(run('JSON.stringify(state)'),before);
  assert.equal(stored[key],raw);
});

test('草稿超时测试使用完整引擎且不改发布或草稿状态',()=>{
  const run=app(),before=run('JSON.stringify({draft:state.draft,published:state.published})');
  run("submitForm({dataset:{form:'flow-test'},values:{question:'查询订单 SO20260926001',orderResponse:'timeout'}})");
  assert.match(run('renderWorkflow()'),/超时/);
  assert.doesNotMatch(run('renderWorkflow()'),/class="order-card"/);
  assert.equal(run('JSON.stringify({draft:state.draft,published:state.published})'),before);
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


test('正常空间导出完整当前 JSON，并释放下载 URL',async()=>{
  const run=app();
  run("let exported,downloadName,clicked=false,removed=false,revoked=false;const link={click(){clicked=true;downloadName=this.download;},remove(){removed=true;}};document.createElement=()=>link;document.body.appendChild=()=>{};const URL={createObjectURL(blob){exported=blob;return 'blob:test';},revokeObjectURL(){revoked=true;}};setTimeout=callback=>callback();exportWorkspace();");
  assert.deepEqual(JSON.parse(await run('exported.text()')),JSON.parse(run('JSON.stringify(state)')));
  assert.match(run('downloadName'),/^zhixu-workspace-.*\.json$/);
  assert.equal(run('clicked && removed && revoked'),true);
});
