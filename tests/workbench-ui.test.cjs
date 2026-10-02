// 产出 Agent：Codex
const test=require('node:test');
const assert=require('node:assert/strict');
const {app,humanState,memory,D,Seed,Store}=require('./helpers/app.cjs');

const customer={id:'C001',role:'customer'};
function conversationState(){
  const result=D.execute(Seed.create(Date.now(),false),customer,'newConversation');
  return {state:result.state,id:result.value};
}
function intakeState(){
  let {state,id}=conversationState();
  state=D.execute(state,customer,'say',{id,body:'申请换货 SO20260926001，杯子漏水'}).state;
  return {state,id,caseId:state.cases.find(c=>c.kind==='aftersales').id};
}
function suggestionState(){
  let {state,id}=humanState();
  state=D.execute(state,customer,'say',{id,body:'保温杯怎么清洗？'}).state;
  return {state,id,caseId:state.conversations.find(c=>c.id===id).caseIds.at(-1)};
}
function openSuggestion(a,caseId){
  a.click('dynamic-suggestion',caseId);
}
const bj=value=>new Date(value+8*3600000).toISOString().slice(0,16);

test('mobile and desktop share the current customer conversation and unsent draft through reload',()=>{
  const {state,id}=conversationState();let a=app({state});
  const before=JSON.stringify(a.state());a.input('customer-say','body','跨视图保留的客户草稿');
  a.click('workspace','mobile');assert.equal(a.one('form[data-form="customer-say"]').dataset.id,id);
  assert.equal(a.value('customer-say','body'),'跨视图保留的客户草稿');
  a.input('customer-say','body','手机上继续编辑');a.click('workspace','desk');a.click('workspace','customer');
  assert.equal(a.value('customer-say','body'),'手机上继续编辑');
  a.click('workspace','mobile');a=a.reload();assert.equal(a.value('customer-say','body'),'手机上继续编辑');
  assert.equal(JSON.stringify(a.state()),before);assert.equal(a.state().conversations.length,1);
  const blank=a.one('.mobile-blank');assert.equal(blank.textContent,'');assert.equal(blank.children.length,0);assert.equal(blank.getAttribute('aria-hidden'),'true');
  assert.equal(a.doc.querySelectorAll('#customer-input').length,1);assert.equal(a.doc.querySelectorAll('#customer-messages').length,1);
});

test('mobile routes an operations-origin session to the real customer identity and public records only',()=>{
  let state=Seed.create();const other={id:'C002',role:'customer'};
  let result=D.execute(state,other,'newConversation');state=result.state;const otherId=result.value;
  state=D.execute(state,other,'say',{id:otherId,body:'申请退货 SO20260926009'}).state;
  const otherCase=state.cases.find(c=>c.customerId==='C002'&&c.kind==='aftersales');
  state=D.execute(state,other,'createTicket',{caseId:otherCase.id,title:'OTHER_CUSTOMER_ONLY',description:'另一个客户的申请',confirmed:true}).state;
  const a=app({state,view:{workspace:'ops',opsRole:'admin',customerConversation:otherId},hash:'#mobile'});
  assert.ok(a.doc.querySelector('.phone-screen'));assert.equal(a.doc.querySelector('[data-action="export-data"]'),null);
  const publicText=a.one('#app').textContent;assert.ok(!publicText.includes('OTHER_CUSTOMER_ONLY'));
  a.click('mobile-orders');assert.ok(!a.one('#dialog-body').textContent.includes('SO20260926009'));a.click('close-modal');
  a.click('mobile-progress');assert.ok(!a.one('#dialog-body').textContent.includes('OTHER_CUSTOMER_ONLY'));a.click('close-modal');
  const ownId=a.one('form[data-form="customer-say"]').dataset.id;assert.equal(D.get(a.state(),'conversations',ownId).customerId,'C001');
  const otherBefore=JSON.stringify(D.get(a.state(),'conversations',otherId));
  a.input('customer-say','body','保温杯怎么清洗？');a.submit('customer-say');
  assert.equal(a.state().events.at(-1).actorId,'C001');
  assert.equal(JSON.stringify(D.get(a.state(),'conversations',otherId)),otherBefore);
});

test('mobile moves the existing dialog inside the phone with show and restores the desktop modal',()=>{
  const a=app({hash:'#mobile'}),dialog=a.one('#dialog');
  a.click('mobile-orders');assert.equal(a.one('#dialog'),dialog);assert.equal(dialog.parentElement,a.one('.phone-overlay-host'));
  assert.equal(dialog.open,true);assert.equal(dialog.showMethod,'show');assert.equal(a.doc.querySelectorAll('#dialog').length,1);
  const peers=a.one('.phone-screen').children.filter(x=>x!==dialog.parentElement);assert.ok(peers.length>0);assert.ok(peers.every(x=>x.inert));
  a.click('close-modal');assert.equal(dialog.open,false);assert.ok(peers.every(x=>!x.inert));
  a.click('workspace','customer');a.click('customer-history');
  assert.equal(dialog.parentElement,a.doc.body);assert.equal(dialog.showMethod,'showModal');assert.equal(a.doc.querySelectorAll('#dialog').length,1);
});

test('offline mobile keeps editable input and rejects forced submit until connection resumes',()=>{
  const {state,id}=conversationState();let a=app({state,hash:'#mobile'});
  a.input('customer-say','body','离线前输入的内容');a.click('connection-toggle','offline');
  assert.equal(D.customerConnection(a.state(),'C001'),'offline');assert.equal(a.value('customer-say','body'),'离线前输入的内容');
  assert.equal(a.one('form[data-form="customer-say"] [type="submit"]').disabled,true);
  assert.equal(a.one('#customer-input').disabled,false);a.input('customer-say','body','离线继续编辑');
  const before=JSON.stringify(a.state());a.submit('customer-say');assert.equal(JSON.stringify(a.state()),before);
  assert.ok(a.one('#toast').textContent.includes('连接已断开'));assert.equal(a.value('customer-say','body'),'离线继续编辑');
  a=a.reload();assert.equal(a.value('customer-say','body'),'离线继续编辑');assert.equal(a.one('form[data-form="customer-say"] [type="submit"]').disabled,true);
  a.click('connection-toggle','online');assert.equal(a.value('customer-say','body'),'离线继续编辑');
  assert.equal(D.get(a.state(),'conversations',id).messages.filter(m=>m.body==='离线继续编辑').length,0);
  a.submit('customer-say');assert.equal(D.get(a.state(),'conversations',id).messages.filter(m=>m.body==='离线继续编辑').length,1);
});

test('structured application preview and cancel make no business write and keep all editable fields',()=>{
  const {state,caseId}=intakeState(),a=app({state,hash:'#mobile'}),before=JSON.stringify(state);
  a.click('intake',caseId);assert.equal(a.value('ticket-request','orderId'),'SO20260926001');
  const fields={title:'更换漏水杯子',serviceType:'exchange',description:'杯口漏水，申请核实',exchangeRequest:'同款更换',extraNote:'先在站内联系'};
  for(const [name,value] of Object.entries(fields))a.input('ticket-request',name,value);
  a.submit('ticket-request');assert.ok(a.one('form[data-form="ticket-confirm"]'));
  assert.ok(a.one('#dialog-body').textContent.includes('同款更换'));assert.equal(JSON.stringify(a.state()),before);
  a.click('intake-back');for(const [name,value] of Object.entries(fields))assert.equal(a.value('ticket-request',name),value);
  a.submit('ticket-request');a.click('close-modal');assert.equal(JSON.stringify(a.state()),before);
  a.click('intake',caseId);for(const [name,value] of Object.entries(fields))assert.equal(a.value('ticket-request',name),value);
  a.submit('ticket-request');a.submit('ticket-confirm');
  const ticket=a.state().tickets.find(t=>t.caseId===caseId);assert.ok(ticket);
  for(const [name,value] of Object.entries(fields))assert.equal(ticket[name],value);
  assert.equal(a.state().tickets.length,1);assert.equal(a.one('#dialog').open,false);
});

test('dynamic suggestion cancel, append and replace preserve the intended public draft without sending',()=>{
  const {state,id,caseId}=suggestionState(),a=app({state,view:{workspace:'desk',deskFilter:'mine'},hash:'#desk/inbox'});
  const body=D.suggestion(state,id,caseId).body,before=JSON.stringify(a.state());assert.ok(body);
  a.input('reply','body','人工已写好的开场');openSuggestion(a,caseId);
  assert.ok(a.one('#dialog').open);a.click('close-modal');assert.equal(a.value('reply','body'),'人工已写好的开场');
  openSuggestion(a,caseId);a.click('suggestion-append');assert.equal(a.value('reply','body'),'人工已写好的开场\n\n'+body);
  openSuggestion(a,caseId);a.click('suggestion-replace');assert.equal(a.value('reply','body'),body);
  assert.equal(JSON.stringify(a.state()),before);
  a.click('compose-mode','note');a.input('note','body','内部备注不能作为公开建议草稿');a.click('compose-mode','reply');
  assert.equal(a.value('reply','body'),body);a.submit('reply');
  const sent=D.get(a.state(),'conversations',id).messages.at(-1);assert.equal(sent.body,body);assert.equal(sent.visibility,'public');
  assert.ok(!D.customerView(a.state(),'C001').conversations.find(c=>c.id===id).messages.some(m=>m.body.includes('内部备注不能')));
});

test('an external order update blocks old confirmation and refresh restores the draft for a fresh preview',()=>{
  const {state,caseId}=intakeState();let a=app({state,hash:'#mobile'});
  a.click('intake',caseId);a.input('ticket-request','description','保持这段未提交申请');a.input('ticket-request','exchangeRequest','更换相同规格');a.submit('ticket-request');
  // A second page changes persisted order facts; this exercises the store conflict path.
  const changed=a.state();D.get(changed,'orders','SO20260926001').price=123.45;a.local.setItem(Store.KEY,JSON.stringify(changed));
  a.submit('ticket-confirm');assert.equal(a.state().tickets.length,0);assert.ok(a.one('#dialog-error').textContent.includes('其他页面更新'));
  a.click('intake-back');assert.equal(a.value('ticket-request','description'),'保持这段未提交申请');
  a=a.reload();a.click('intake',caseId);assert.equal(a.value('ticket-request','description'),'保持这段未提交申请');assert.equal(a.value('ticket-request','exchangeRequest'),'更换相同规格');
  a.submit('ticket-request');assert.ok(a.one('#dialog-body').textContent.includes('123.45'));assert.equal(a.state().tickets.length,0);
  a.submit('ticket-confirm');assert.equal(a.state().tickets.length,1);assert.equal(a.state().tickets[0].description,'保持这段未提交申请');
});

test('close panel submits rendered disposition fields and callbacks atomically after validation',()=>{
  const {state,id}=humanState(),a=app({state,view:{workspace:'desk',deskFilter:'mine'},hash:'#desk/inbox'});
  assert.ok(a.one('.sop-suggestion').textContent.includes('可先追问'));
  a.click('close-conversation',id);const form=a.one('form[data-form="close-summary"]');
  const context=form.querySelector('.readonly-context').textContent;
  for(const value of [id,'C001','客户 001','客服 01','开始时间：','UTC+08:00'])assert.ok(context.includes(value),value);
  const actions=form.querySelectorAll('select').filter(x=>x.name.startsWith('action_'));assert.ok(actions.length>0);
  a.input('close-summary','reason','客户离线');a.input('close-summary','summary','继续核实客户问题，并安排站内回访。');
  const reasons=[];
  for(const action of actions){const suffix=action.name.slice(7),reason='后续核实 '+suffix;reasons.push(reason);a.input('close-summary',action.name,'new');a.input('close-summary','reason_'+suffix,reason);a.input('close-summary','due_'+suffix,bj(Date.now()+4*3600000));}
  const checkbox=form.querySelectorAll('input').find(x=>x.name.startsWith('callback_'));assert.ok(checkbox);const caseId=checkbox.name.slice(9);
  a.input('close-summary',checkbox.name,true);a.input('close-summary','purpose_'+caseId,'确认处理说明是否清楚');a.input('close-summary','note_'+caseId,'内部安排备注');
  a.input('close-summary','at_'+caseId,bj(Date.now()-3600000));
  const before=JSON.stringify(a.state());a.submit('close-summary');assert.equal(JSON.stringify(a.state()),before);
  assert.ok(a.one('#dialog-error').textContent.length>0);assert.equal(a.value('close-summary','summary'),'继续核实客户问题，并安排站内回访。');
  const future=bj(Date.now()+2*3600000);a.input('close-summary','at_'+caseId,future);a.submit('close-summary');
  const saved=a.state(),conv=D.get(saved,'conversations',id);assert.equal(conv.state,'closed');assert.equal(conv.closures.length,1);
  const closure=conv.closures[0];assert.equal(closure.reason,'客户离线');assert.equal(closure.summary,'继续核实客户问题，并安排站内回访。');
  assert.deepEqual(closure.items.map(x=>x.reason).sort(),reasons.sort());assert.ok(closure.items.every(x=>x.nodeKey!=='close'));
  assert.equal(saved.tickets.length,1);const ticket=saved.tickets[0];assert.equal(ticket.ownerId,'lin');assert.equal(ticket.callback.purpose,'确认处理说明是否清楚');
  assert.equal(ticket.callback.note,'内部安排备注');assert.equal(ticket.callback.at,Date.parse(future+':00+08:00'));assert.equal(a.one('#dialog').open,false);
});

test('a concurrent customer message prevents closing an old panel without discarding its draft',()=>{
  const {state,id}=humanState(),local=memory({[Store.KEY]:JSON.stringify(state)});
  const a=app({local,view:{workspace:'desk',deskFilter:'mine'},hash:'#desk/inbox'});
  a.click('close-conversation',id);a.input('close-summary','summary','未提交的结束小结');
  const other=app({local,session:memory(),hash:'#mobile'});other.input('customer-say','body','还有一条新信息需要补充');other.submit('customer-say');
  const latest=JSON.stringify(other.state());a.submit('close-summary');assert.equal(JSON.stringify(a.state()),latest);
  assert.equal(D.get(a.state(),'conversations',id).state,'human');assert.equal(a.value('close-summary','summary'),'未提交的结束小结');
  assert.ok(a.one('#dialog-error').textContent.includes('其他页面更新'));assert.equal(D.get(a.state(),'conversations',id).closures?.length||0,0);
});
