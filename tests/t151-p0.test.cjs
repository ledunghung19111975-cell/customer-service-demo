// 产出 Agent：Codex。T-151 第 1 棒：F1 路由边界与 F8 关闭完整性。
const test=require('node:test'),assert=require('node:assert/strict');
const {D,Seed,Store,app}=require('./helpers/app.cjs');
const NOW=Date.parse('2026-10-05T12:00:00Z');
const customer={id:'C001',role:'customer'},agent={id:'lin',role:'agent'};
function rig(){let state=Seed.create(NOW,false),now=NOW;return {
 get s(){return state;},get now(){return now;},
 do(who,type,data={}){const out=D.execute(state,who,type,data,++now);assert.ok(Store.valid(out.state),`invalid after ${type}`);state=out.state;return out.value;},
 conv(id){return D.get(state,'conversations',id);},issue(id){return D.get(state,'cases',this.conv(id).caseIds.at(-1));}
};}
function human(r){const id=r.do(customer,'newConversation');r.do(customer,'requestHuman',{id});r.do(agent,'claimConversation',{id});return id;}
function complete(r,id){const issue=r.issue(id);r.do(agent,'completeCase',{id:issue.id,conversationId:id,conclusion:'已核实并答复客户',evidence:'人工核对记录'});return issue.id;}
function closing(r,id,items=[]){return {id,token:D.closePreview(r.s,id,r.now).token,reason:'本次沟通结束',summary:'已核实处理结果',requestKey:'t151-close',items,callbacks:[]};}

for(const body of ['你好','在吗','谢谢','好的','您好！','谢谢你，辛苦了。','嗯嗯，收到','明白了','OK','hello','您好呀','好的，谢谢您'])test(`F1 pure social: ${body}`,()=>{
 const r=rig(),id=r.do(customer,'newConversation'),before=D.copy(r.s);
 r.do(customer,'say',{id,body});const cv=r.conv(id);
 assert.equal(cv.state,'bot');assert.equal(cv.messages.at(-1).role,'bot');assert.ok(cv.messages.at(-1).body);
 assert.deepEqual(r.s.cases,before.cases);assert.deepEqual(r.s.gaps,before.gaps);assert.deepEqual(r.s.tickets,before.tickets);
 assert.equal(cv.messages.at(-1).caseId,undefined);assert.equal(cv.messages.at(-1).citation,undefined);
});
for(const [body,kind] of [
 ['你好，七天无理由退货有什么条件？','knowledge'],['谢谢，查物流 SO20260926001','order'],
 ['好的，我要换货 SO20260926001','aftersales'],['你好，我要人工','support'],
 ['谢谢，礼品卡可以分多次使用吗？','support'],['好的，不要转人工，我只问退货规则','knowledge'],
 ['谢谢不用退货了，查物流 SO20260926001','order']
])test(`F1 mixed business preserves routing: ${body}`,()=>{
 const r=rig(),id=r.do(customer,'newConversation');r.do(customer,'say',{id,body});
 assert.equal(r.issue(id).kind,kind);assert.equal(r.conv(id).state,kind==='support'?'queued':'bot');
 assert.equal(r.s.gaps.length,body.includes('礼品卡')?1:0);
});
test('F1 thanks after an answer leaves the result, feedback and issue counts intact',()=>{
 const r=rig(),id=r.do(customer,'newConversation');r.do(customer,'say',{id,body:'退货规则是什么？'});
 const before=D.copy(r.s.cases);r.do(customer,'say',{id,body:'多谢！'});
 assert.equal(r.conv(id).state,'bot');assert.deepEqual(r.s.cases,before);assert.equal(r.s.gaps.length,0);
});
for(const state of ['queued','human','closed'])test(`F1 social preserves ${state} state and existing issues`,()=>{
 const r=rig(),id=r.do(customer,'newConversation');r.do(customer,'requestHuman',{id});
 if(state!=='queued')r.do(agent,'claimConversation',{id});
 if(state==='closed'){complete(r,id);r.do(agent,'closeWithSummary',closing(r,id,D.closePreview(r.s,id).items.map(i=>({...i,action:'new',reason:'基线兼容关闭',dueAt:r.now+3600000}))));}
 const before=D.copy(r.s),cv=D.copy(r.conv(id));r.do(customer,'say',{id,body:'谢谢'});
 assert.equal(r.conv(id).state,state);assert.equal(r.conv(id).ownerId,cv.ownerId);assert.equal(r.conv(id).waitingSince,cv.waitingSince);
 assert.equal(r.conv(id).messages.at(-1).role,'bot');assert.deepEqual(r.s.cases,before.cases);assert.deepEqual(r.s.gaps,before.gaps);assert.deepEqual(r.s.tickets,before.tickets);
 assert.deepEqual(r.conv(id).closures,cv.closures);
});
test('F1 social keeps pending order collection and does not schedule another AI reply',()=>{
 const r=rig(),id=r.do(customer,'newConversation');r.do(customer,'say',{id,body:'我要换货'});const pending=r.conv(id).pendingCaseId;
 r.do(customer,'say',{id,body:'好的'});assert.equal(r.conv(id).pendingCaseId,pending);
 r.do(customer,'say',{id,body:'SO20260926001'});assert.equal(r.issue(id).orderId,'SO20260926001');
 r.do(customer,'requestHuman',{id});r.do(agent,'claimConversation',{id});r.do(agent,'setAiAssist',{id,enabled:true});
 r.do(customer,'say',{id,body:'谢谢'});assert.equal(D.aiPending(r.s,id,r.now+31000),null);
});
test('F1 greetings from multiple customers create no knowledge gaps',()=>{
 const r=rig();for(const id of ['C001','C002','C003']){const who={id,role:'customer'},cv=r.do(who,'newConversation');r.do(who,'say',{id:cv,body:'您好，谢谢'});}
 assert.equal(r.s.cases.length,0);assert.equal(r.s.gaps.length,0);assert.ok(r.s.conversations.every(c=>c.state==='bot'));
});
test('F1 configured handoff still takes precedence over a social phrase',()=>{
 const r=rig();r.s.flow.live.humanWords.push('您好');const id=r.do(customer,'newConversation');r.do(customer,'say',{id,body:'您好'});
 assert.equal(r.conv(id).state,'queued');assert.equal(r.issue(id).kind,'support');
});
test('F1 explicit AI refusal survives polite messages across conversation states',()=>{
 const r=rig(),id=human(r);r.do(agent,'setAiAssist',{id,enabled:true});r.do(customer,'say',{id,body:'不要AI自动回复'});
 for(const state of ['human','closed','queued','bot']){
   if(state==='closed'){complete(r,id);r.do(agent,'closeWithSummary',closing(r,id));}
   if(state==='queued')r.do(customer,'requestHuman',{id});
   if(state==='bot')r.do(customer,'cancelQueue',{id});
   const before=D.copy(r.s),cv=D.copy(r.conv(id));r.do(customer,'say',{id,body:'谢谢'});
   assert.equal(r.conv(id).messages.length,cv.messages.length+1);assert.equal(r.conv(id).messages.at(-1).role,'customer');
   assert.equal(r.conv(id).state,state);assert.equal(r.conv(id).aiOptOut,true);assert.equal(D.aiPending(r.s,id,r.now+31000),null);
   assert.deepEqual(r.s.cases,before.cases);assert.deepEqual(r.s.gaps,before.gaps);
 }
});

test('F8 completed support has no leftover; closing preserves result and done snapshot without tickets',()=>{
 const r=rig(),id=human(r),caseId=complete(r,id),before=D.copy(r.issue(id));
 assert.equal(D.sopView(r.s,id,caseId,r.now).nodes.find(n=>n.key==='intent').status,'done');
 assert.deepEqual(D.closePreview(r.s,id,r.now).items,[]);const payload=closing(r,id),out=r.do(agent,'closeWithSummary',payload);
 assert.equal(r.conv(id).state,'closed');assert.equal(r.s.tickets.length,0);assert.deepEqual(r.issue(id),before);
 const snapshot=r.conv(id).closures.at(-1);assert.equal(snapshot.sop[0].find(n=>n.key==='result').status,'done');assert.equal(snapshot.items.length,0);
 assert.equal(r.do(agent,'closeWithSummary',payload),out);assert.equal(r.conv(id).closures.length,1);
});
test('F8 public reply confirms the sole issue but an internal note does not',()=>{
 const r=rig(),id=human(r),caseId=r.issue(id).id;
 r.do(agent,'note',{id,body:'内部核对中'});assert.equal(D.sopView(r.s,id,caseId).nodes.find(n=>n.key==='intent').status,'todo');
 r.do(agent,'reply',{id,body:'已核对您的诉求，正在处理'});
 assert.equal(D.sopView(r.s,id,caseId).nodes.find(n=>n.key==='intent').status,'done');
 assert.equal(r.issue(id).status,'open');assert.ok(D.closePreview(r.s,id).items.some(i=>i.nodeKey==='result'));
});
test('F8 public answer confirmation survives a later issue in the same conversation',()=>{
 const r=rig(),id=human(r),caseId=r.issue(id).id;r.do(agent,'reply',{id,body:'已核对诉求，正在处理'});
 r.do(customer,'say',{id,body:'查物流 SO20260926001'});
 assert.equal(D.sopView(r.s,id,caseId).nodes.find(n=>n.key==='intent').status,'done');
 assert.ok(!D.closePreview(r.s,id).items.some(i=>i.caseId===caseId && i.nodeKey==='intent'));
});
test('F8 reply is attributed to the selected issue and rejects unrelated issue ids',()=>{
 const r=rig(),id=human(r),caseId=r.issue(id).id;r.do(customer,'say',{id,body:'查物流 SO20260926001'});
 const a=app({state:r.s,view:{workspace:'desk',agentId:'lin',deskConversation:id,deskFilter:'mine',sopCaseByConversation:{[id]:caseId}},hash:'#desk/inbox'});
 a.input('reply','body','已确认您的服务诉求');a.submit('reply');
 const cv=a.state().conversations.find(c=>c.id===id);assert.equal(cv.messages.at(-1).caseId,caseId);
 assert.equal(D.sopView(a.state(),id,caseId).nodes.find(n=>n.key==='intent').status,'done');
 const other=human(r),before=JSON.stringify(r.s);
 assert.throws(()=>r.do(agent,'reply',{id,caseId:r.issue(other).id,body:'不可串问题'}));assert.equal(JSON.stringify(r.s),before);
});
test('F8 reply uses the displayed default issue when no problem tab was clicked',()=>{
 const r=rig(),id=r.do(customer,'newConversation');r.do(customer,'say',{id,body:'保温杯怎么清洗？'});
 r.do(customer,'requestHuman',{id});r.do(agent,'claimConversation',{id});const caseId=r.issue(id).id;
 const a=app({state:r.s,view:{workspace:'desk',agentId:'lin',deskConversation:id,deskFilter:'mine'},hash:'#desk/inbox'});
 a.input('reply','body','已经核对您的服务诉求');a.submit('reply');
 assert.equal(a.state().conversations.find(c=>c.id===id).messages.at(-1).caseId,caseId);
 assert.equal(D.sopView(a.state(),id,caseId).nodes.find(n=>n.key==='intent').status,'done');
});
test('F1 long mixed acknowledgement does not block classification',()=>{
 const {spawnSync}=require('node:child_process');
 const script="const D=require('./src/domain.js'),S=require('./src/seed.js');process.stdout.write(JSON.stringify(['哦'.repeat(100)+'x','哦'.repeat(100)+'，查物流 SO20260926001'].map(q=>D.classify(S.create(),q,'C001').map(r=>r.kind))))";
 const run=spawnSync(process.execPath,['-e',script],{cwd:require('node:path').resolve(__dirname,'..'),encoding:'utf8',timeout:2000});
 assert.equal(run.error,undefined);assert.equal(run.status,0);assert.deepEqual(JSON.parse(run.stdout),[['gap'],['order']]);
});
for(const action of ['na','withdrawn'])test(`F8 refuses forged ${action} for a completed issue atomically`,()=>{
 const r=rig(),id=human(r),caseId=complete(r,id),before=JSON.stringify(r.s);
 assert.throws(()=>r.do(agent,'closeWithSummary',closing(r,id,[{caseId,nodeKey:'intent',action,reason:'不可覆盖已完成结果'}])));
 assert.equal(JSON.stringify(r.s),before);assert.equal(r.issue(id).workflow?.withdrawn,undefined);
});
test('F8 completed order is excluded while unfinished issues still require tracked dispositions',()=>{
 const r=rig(),id=human(r),openId=r.issue(id).id;r.do(customer,'say',{id,body:'查物流'});const doneId=complete(r,id);
 const p=D.closePreview(r.s,id);assert.ok(p.items.length);assert.ok(p.items.every(i=>i.caseId===openId));
 r.do(agent,'closeWithSummary',closing(r,id,p.items.map(i=>({...i,action:'new',reason:'继续核对未完问题',dueAt:r.now+3600000}))));
 assert.equal(r.s.tickets.length,1);assert.equal(r.s.tickets[0].caseId,openId);assert.equal(D.get(r.s,'cases',doneId).workflow?.withdrawn,undefined);
});
test('F8 closing UI shows no disposition for completed issues and preserves defaults for open ones',()=>{
 const r=rig(),id=human(r);complete(r,id);
 const a=app({state:r.s,view:{workspace:'desk',agentId:'lin',deskConversation:id,deskFilter:'mine'},hash:'#desk/inbox'});a.click('close-conversation',id);
 assert.equal(a.doc.querySelectorAll('select').filter(el=>el.name.startsWith('action_')).length,0);
 assert.match(a.one('form[data-form="close-summary"]').textContent,/当前没有必须安排的未完成事项/);
 a.submit('close-summary');assert.equal(a.state().conversations.find(c=>c.id===id).state,'closed');assert.equal(a.state().tickets.length,0);
 const u=rig(),uid=human(u),b=app({state:u.s,view:{workspace:'desk',agentId:'lin',deskConversation:uid,deskFilter:'mine'},hash:'#desk/inbox'});b.click('close-conversation',uid);
 const select=b.one(`select[name="action_${u.issue(uid).id}_result"]`);assert.equal(select.value,'new');
 assert.ok(select.querySelector('option[value="na"]'));assert.ok(select.querySelector('option[value="withdrawn"]'));
});
