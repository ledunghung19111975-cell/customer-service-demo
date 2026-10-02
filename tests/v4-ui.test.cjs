const test=require('node:test');
const assert=require('node:assert/strict');
const {app,humanState,D,Seed}=require('./helpers/app.cjs');

test('default entry loads its actual assets and standalone customer routing hides internal navigation',()=>{
  const a=app();assert.ok(a.assets.includes('src/app.js'));assert.equal(a.doc.querySelectorAll('.workspace-tabs button').length,4);
  const b=app({view:{workspace:'ops',opsRole:'admin'},hash:'#ops/data',search:'?view=customer'});
  assert.equal(b.doc.querySelectorAll('.workspace-tabs').length,0);assert.ok(b.doc.querySelector('.customer-main'));assert.equal(b.doc.querySelectorAll('[data-action="export-data"]').length,0);
  const c=app({hash:'#ops/data'});assert.ok(c.one('h1').textContent.includes('服务概览'));assert.equal(c.doc.querySelectorAll('[data-action="export-data"]').length,0);
});

test('confirmed answers and tickets retain a working dispute entry',()=>{
  const a=app();a.click('quick-policy');const caseId=a.state().cases[0].id;a.click('confirm-case',caseId);
  assert.ok(a.doc.querySelector(`[data-action="dispute-case"][data-id="${caseId}"]`));
  a.click('dispute-case',caseId);a.input('dispute','reason','仍需核对适用条件');a.submit('dispute');
  assert.equal(D.get(a.state(),'cases',caseId).feedback,'disputed');
  let state=Seed.create(),ticket=state.tickets[0];
  state=D.execute(state,{id:'lin',role:'agent'},'updateTicket',{id:ticket.id,status:'done',publicText:'核实完成',evidence:'内部核对记录'}).state;
  state=D.execute(state,{id:ticket.customerId,role:'customer'},'feedback',{id:ticket.caseId,confirmed:true}).state;
  const b=app({state});b.click('ticket-detail',ticket.id);
  assert.ok(b.one('#dialog').querySelector(`[data-action="dispute-case"][data-id="${ticket.caseId}"]`));
});

test('unsubmitted reply and note drafts stay with their author across reassignment and reload',()=>{
  const {state,id}=humanState();let a=app({state,view:{workspace:'desk',deskFilter:'mine'},hash:'#desk/inbox'});
  a.input('reply','body','小林尚未发送的回复');a.click('compose-mode','note');a.input('note','body','小林尚未提交的内部备注');
  a.click('workspace','ops');a.click('ops-page','team');a.click('assign-conversation',id);a.input('assign','ownerId','zhou');a.submit('assign');
  a.click('workspace','desk');a.change('agent','zhou');assert.equal(a.value('note','body'),'');a.input('note','body','小周自己的备注');
  a.click('workspace','ops');a.click('assign-conversation',id);a.input('assign','ownerId','lin');a.submit('assign');a.click('workspace','desk');a.change('agent','lin');
  assert.equal(a.value('note','body'),'小林尚未提交的内部备注');a.click('compose-mode','reply');assert.equal(a.value('reply','body'),'小林尚未发送的回复');
  a=a.reload();assert.equal(a.value('reply','body'),'小林尚未发送的回复');assert.equal(a.state().conversations[0].messages.some(x=>x.body.includes('尚未')),false);
});

test('customer and staff service-application drafts do not share a case key',()=>{
  let state=Seed.create(Date.now(),false);const run=(who,type,data)=>{const r=D.execute(state,who,type,data);state=r.state;return r.value;};
  const customer={id:'C001',role:'customer'},id=run(customer,'newConversation',{});run(customer,'say',{id,body:'申请退货 SO20260926001'});const caseId=state.cases[0].id;
  const a=app({state});a.click('intake',caseId);a.input('ticket-request','description','客户未提交原因');a.click('close-modal');a.click('request-human',id);a.click('workspace','desk');a.click('claim-conversation',id);a.click('toggle-sop-node','aftersales');a.click('sop-intake',caseId);
  assert.equal(a.value('ticket-request','description'),D.sopView(a.state(),id,caseId).prefill.description);a.input('ticket-request','description','客服未提交原因');a.click('close-modal');a.click('workspace','customer');a.click('intake',caseId);assert.equal(a.value('ticket-request','description'),'客户未提交原因');
});

test('service settings restore after page changes and refresh without writing business configuration',()=>{
  let a=app({view:{workspace:'ops'},hash:'#ops/service'});a.input('service-settings','capacity','19');a.input('service-settings','accepting','false');a.click('ops-page','overview');a.click('ops-page','service');
  assert.equal(a.value('service-settings','capacity'),'19');assert.equal(a.value('service-settings','accepting'),'false');a=a.reload();assert.equal(a.value('service-settings','capacity'),'19');assert.equal(a.state().settings.capacity,3);
});

test('cancelled disable, assignment, remediation link and acceptance forms restore their fields',()=>{
  const a=app({view:{workspace:'ops',opsRole:'operator'},hash:'#ops/knowledge'});
  a.click('disable-knowledge','KB001');a.input('disable-knowledge','reason','等待审核资料');a.click('close-modal');a.click('disable-knowledge','KB001');assert.equal(a.value('disable-knowledge','reason'),'等待审核资料');a.click('close-modal');
  a.change('ops-role','manager');a.click('ops-page','team');const ticket=a.state().tickets[0].id;a.click('assign-ticket',ticket);a.input('assign','ownerId','zhou');a.click('close-modal');a.click('assign-ticket',ticket);assert.equal(a.value('assign','ownerId'),'zhou');a.click('close-modal');
  a.click('ops-page','quality');const gap=a.state().gaps[0].id;a.click('review-gap',gap);a.input('review-gap','review','核对原始提问');a.input('review-gap','cause','缺少此类规则');a.submit('review-gap');
  a.change('ops-role','operator');a.click('ops-page','quality');a.click('link-gap',gap);a.input('link-gap','knowledgeId','KB002');a.click('close-modal');a.click('link-gap',gap);assert.equal(a.value('link-gap','knowledgeId'),'KB002');a.submit('link-gap');
  a.change('ops-role','manager');a.click('ops-page','quality');a.click('accept-gap',gap);a.input('accept-gap','acceptance','仍需逐项核对原问题');a.click('close-modal');a.click('accept-gap',gap);assert.equal(a.value('accept-gap','acceptance'),'仍需逐项核对原问题');
});

test('unsaved flow blocks single tests at the button and submit handler; edits remove old results',()=>{
  const a=app({view:{workspace:'ops',opsRole:'operator'},hash:'#ops/flow'});a.input('flow-query','query','申请退货 SO20260926001');a.submit('flow-query');assert.ok(a.one('.query-result').textContent.includes('intake'));
  a.input('flow-query','query','查物流 SO20260926001');assert.equal(a.doc.querySelector('.query-result'),null);a.submit('flow-query');assert.ok(a.doc.querySelector('.query-result'));
  a.input('flow','intakeEnabled','false');assert.equal(a.doc.querySelector('.query-result'),null);assert.equal(a.one('[data-form="flow-query"] [type="submit"]').disabled,true);assert.equal(a.one('[data-flow-unsaved]').hidden,false);
  const before=JSON.stringify(a.state());a.submit('flow-query');assert.ok(a.one('#toast').textContent.includes('请先保存策略草稿'));assert.equal(a.doc.querySelector('.query-result'),null);assert.equal(JSON.stringify(a.state()),before);
  a.submit('flow');assert.equal(a.one('[data-form="flow-query"] [type="submit"]').disabled,false);a.input('flow-query','query','申请退货 SO20260926001');a.submit('flow-query');assert.ok(a.one('.query-result').textContent.includes('handoff'));assert.ok(!a.one('.query-result').textContent.includes('intake'));
  a.change('ops-role','manager');a.change('ops-role','operator');a.click('ops-page','flow');assert.equal(a.doc.querySelector('.query-result'),null);
});
