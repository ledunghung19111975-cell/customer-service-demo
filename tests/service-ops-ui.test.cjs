// 产出 Agent：Codex
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {Element,Seed,D,ROOT}=require('./helpers/app.cjs');
const Commerce=require('../src/commerce.js');

function render(s,name,args=[],{service,current=false}={}){
  const root={SupportCommerce:Commerce,SupportDomain:{...D,metrics:state=>({...D.metrics(state),...(service?{service}: {})}),serviceEvalCurrent:()=>current}};
  const context=vm.createContext({window:root});
  for(const file of ['shared.js','operations.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,'src/views',file),'utf8'),context,{filename:file});
  const doc=new Element('document');doc.innerHTML=root.SupportViews[name](...args);
  return doc;
}
function sample(){
  const s=Seed.createCommerce();
  const rows=[
    {caseId:'QUERY',itemName:'棉麻收纳袋',title:'查询在途包裹',status:'open',serviceStage:'clarifying',ownerName:'客服 01',dueAt:Date.now()+3600000,requestStatus:'',refundStatus:'',notificationStatus:'',feedback:'pending',humanInvolved:false},
    {caseId:'REFUND',itemName:'原木便携保温杯',title:'退款后客户未到账',status:'open',serviceStage:'dispute_review',ownerName:'客服 02',dueAt:Date.now()+3600000,requestStatus:'approved',refundStatus:'succeeded',notificationStatus:'failed',feedback:'disputed',humanInvolved:true}
  ];
  const service={scope:'演示数据',total:2,queries:1,accepted:1,completed:0,refundSucceeded:1,confirmed:0,humanInvolved:1,aiIndependent:0,waiting:2,unknown:0,rows,metricCaseIds:{total:['QUERY','REFUND'],queries:['QUERY'],accepted:['REFUND'],completed:[],refundSucceeded:['REFUND'],confirmed:[],aiIndependent:[],humanInvolved:['REFUND'],waiting:['QUERY','REFUND'],unknown:[]}};
  return {s,service};
}

test('each service metric drills into the exact projected case set and keeps execution separate from resolution',()=>{
  const {s,service}=sample(),ui={serviceMetric:'refundSucceeded'};
  const doc=render(s,'overview',[s,ui,'manager'],{service});
  assert.deepEqual(doc.querySelectorAll('[data-action="service-metric"]').map(x=>x.dataset.id),Object.keys(service.metricCaseIds));
  assert.deepEqual(doc.querySelectorAll('[data-service-case]').map(x=>x.dataset.serviceCase),['REFUND']);
  assert.equal(doc.querySelector('[data-action="service-metric"][data-id="completed"] strong').textContent,'0');
  assert.equal(doc.querySelector('[data-action="service-metric"][data-id="refundSucceeded"] strong').textContent,'1');
  assert.match(doc.textContent,/客户异议复核/);assert.match(doc.textContent,/模拟渠道成功/);
  assert.match(doc.textContent,/分母：2 个有效事项/);assert.match(doc.textContent,/演示数据/);
  const queried=render(s,'overview',[s,{serviceMetric:'queries'},'manager'],{service});
  assert.deepEqual(queried.querySelectorAll('[data-service-case]').map(x=>x.dataset.serviceCase),['QUERY']);
  assert.match(queried.textContent,/查询结果不代表业务已经办理/);
  const noResults=render(s,'overview',[s,{serviceMetric:'confirmed'},'manager'],{service});
  assert.equal(noResults.querySelectorAll('[data-service-case]').length,0);
  assert.match(noResults.textContent,/该指标暂无对应事项/);
});

test('the manager approval queue includes only requests awaiting review and names the next responsibility',()=>{
  const {s,service}=sample();
  s.commerce.aftersales=[{id:'AS-REVIEW',caseId:'REFUND',itemId:'EC-ITEM-001',status:'awaiting_review',version:2},{id:'AS-APPROVED',caseId:'QUERY',itemId:'EC-ITEM-002',status:'approved',version:3}];
  const manager=render(s,'overview',[s,{},'manager'],{service});
  const queue=manager.querySelectorAll('.panel').find(x=>x.textContent.includes('待审核申请'));
  assert.ok(queue);assert.match(queue.textContent,/AS-REVIEW/);assert.doesNotMatch(queue.textContent,/AS-APPROVED/);
  assert.match(queue.textContent,/客服 02/);assert.match(queue.textContent,/下一次反馈/);
  assert.match(queue.textContent,/批准只形成审批决定/);
  assert.equal(queue.querySelector('[data-action="service-detail"]').dataset.id,'REFUND');
  const admin=render(s,'overview',[s,{},'admin'],{service});
  assert.equal(admin.querySelectorAll('.panel').some(x=>x.textContent.includes('待审核申请')),false);
});

test('administrator simulated events target one application and the next receipt version, without approving it',()=>{
  const {s}=sample();s.commerce.aftersales=[{id:'AS-001',caseId:'REFUND',itemId:'EC-ITEM-001',status:'approved',version:18,receiptVersion:4}];
  const doc=render(s,'data',[true,s,{opsRole:'admin'}]);
  const events=doc.querySelectorAll('[data-action="service-receipt"]');
  assert.deepEqual(events.map(x=>x.dataset.kind),['warehouse_received','warehouse_passed','warehouse_failed','refund_succeeded','refund_unknown','refund_failed','notification_sent','notification_failed','withdrawal_confirmed']);
  assert.ok(events.every(x=>x.dataset.id==='AS-001'&&x.dataset.version==='5'&&x.textContent.startsWith('模拟')));
  assert.equal(doc.querySelectorAll('[data-form="service-review"]').length,0);
  assert.match(doc.textContent,/未满足审批、寄回、退款请求或通知条件时会提示失败/);
  assert.equal(render(s,'data',[true,s,{opsRole:'manager'}]).querySelectorAll('[data-action="service-receipt"]').length,0);
  const old=Seed.create();assert.equal(render(old,'data',[false,old,{opsRole:'admin'}]).querySelectorAll('[data-action="service-receipt"]').length,0);
});

test('schema5 knowledge carries item and rule scope, while a stale evaluation cannot unlock publication',()=>{
  const s=Seed.createCommerce(),k=s.knowledge[0];
  k.draft={...k.live,scopeItemIds:['EC-ITEM-001'],effectiveFrom:Date.UTC(2026,9,5),effectiveTo:Date.UTC(2026,9,12),ruleSource:'演示保温杯规则',reviewer:'服务经理'};
  k.validation={passed:true,at:Date.now(),rows:[]};
  s.commerce.evaluations=[{id:'EVAL-1',knowledgeId:k.id,at:Date.now(),fingerprint:'stale-fingerprint',pass:true,rows:[{id:'two-items',title:'两商品隔离',pass:true,reason:'演示样例通过'}],dependencies:{ruleVersions:['v1']}}];
  const ui={knowledgeId:k.id,drafts:{}};
  const stale=render(s,'knowledge',[s,ui]);
  assert.equal(stale.querySelector('[name="scopeItemIds"]').value,'EC-ITEM-001');
  assert.equal(stale.querySelector('[name="effectiveFrom"]').value,'2026-10-05');
  assert.equal(stale.querySelector('[name="effectiveTo"]').value,'2026-10-12');
  assert.equal(stale.querySelector('[name="ruleSource"]').value,'演示保温杯规则');
  assert.equal(stale.querySelector('[name="reviewer"]').value,'服务经理');
  assert.equal(stale.querySelector('[data-action="publish-knowledge"]').disabled,true);
  assert.match(stale.textContent,/需重新评测/);assert.match(stale.textContent,/知识、接待策略、商品规则与业务事实版本/);assert.doesNotMatch(stale.textContent,/stale-fingerprint/);
  const current=render(s,'knowledge',[s,ui],{current:true});
  assert.equal(current.querySelector('[data-action="publish-knowledge"]').disabled,false);
  const edited=render(s,'knowledge',[s,{...ui,drafts:{['knowledge:'+k.id]:{answer:'尚未保存'}}}],{current:true});
  assert.equal(edited.querySelector('[data-action="publish-knowledge"]').disabled,true);
  const old=Seed.create();assert.equal(render(old,'knowledge',[old,{knowledgeId:old.knowledge[0].id,drafts:{}}]).querySelector('[name="scopeItemIds"]'),null);
});

test('flow evaluation renders recorded failures and leaves business and notification remediation outside knowledge publishing',()=>{
  const s=Seed.createCommerce();
  s.commerce.evaluations=[{id:'EVAL-FAIL',at:Date.now(),fingerprint:'current-demo',pass:false,rows:[{id:'query-failure',title:'业务查询故障',pass:false,reason:'尚未形成核实证据'},{id:'notification-failure',title:'通知失败',pass:true,reason:'有继续反馈安排'}]}];
  const flow=render(s,'flow',[s,{drafts:{}}]);
  assert.match(flow.querySelector('.service-eval-panel').textContent,/存在失败/);
  assert.match(flow.querySelector('[data-scenario="query-failure"]').textContent,/尚未形成核实证据/);
  assert.equal(flow.querySelector('[data-action="service-eval"]').dataset.id,'');
  const now=Date.now();s.gaps=[{id:'GAP-BUSINESS',conversationId:s.conversations[0].id,category:'物流查询',status:'confirmed',createdAt:now,query:'包裹在哪里',causeType:'business',cause:'查询故障',review:'核对原失败路径'},{id:'GAP-KNOWLEDGE',conversationId:s.conversations[0].id,category:'规则咨询',status:'confirmed',createdAt:now,query:'退货条件',causeType:'knowledge',cause:'错误商品范围',review:'核对引用规则'}];
  const quality=render(s,'quality',[s,{drafts:{}},'operator']);
  assert.equal(quality.querySelector('[data-action="link-gap-repair"]').dataset.id,'GAP-BUSINESS');
  assert.deepEqual(quality.querySelectorAll('[data-action="new-gap-knowledge"]').map(x=>x.dataset.id),['GAP-KNOWLEDGE']);
  assert.deepEqual(quality.querySelectorAll('[data-action="link-gap"]').map(x=>x.dataset.id),['GAP-KNOWLEDGE']);
  s.gaps[0].status='fixing';s.gaps[0].remediation='保留原查询并交由客服核实';s.gaps[0].scenarioId='query-failure';
  const manager=render(s,'quality',[s,{drafts:{}},'manager']);
  assert.match(manager.querySelector('[data-action="accept-gap"]').textContent,/复验失败路径/);
  assert.match(manager.textContent,/query-failure/);
});
