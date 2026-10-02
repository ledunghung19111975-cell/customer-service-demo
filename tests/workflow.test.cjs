// 产出 Agent：Codex。SOP、AI 续答、关闭记录与回访的业务回归。
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../src/domain.js'),Seed=require('../src/seed.js'),Store=require('../src/store.js');
const NOW=Date.parse('2026-10-02T12:00:00Z');
const people={c:{id:'C001',role:'customer'},c2:{id:'C002',role:'customer'},lin:{id:'lin',role:'agent'},zhou:{id:'zhou',role:'agent'},mgr:{id:'manager',role:'manager'},ops:{id:'operator',role:'operator'}};
function rig(){let state=Seed.create(NOW,false),now=NOW;return {get s(){return state;},set s(v){state=v;},get now(){return now;},tick(n){now+=n;},do(who,type,data={}){const out=D.execute(state,people[who],type,data,++now);state=out.state;assert.ok(Store.valid(state),`invalid after ${type}`);return out.value;},conv(){return this.do('c','newConversation');},case(id){return D.get(state,'cases',D.get(state,'conversations',id).caseIds.at(-1));}};}
function human(r){const id=r.conv();r.do('c','requestHuman',{id});r.do('lin','claimConversation',{id});return id;}
function aftersales(r,id=human(r),order='SO20260926001'){r.do('c','say',{id,body:`我要换货 ${order}`});return {id,caseId:r.case(id).id};}
function accept(r,ctx,patch={}){return r.do('lin','createTicket',{conversationId:ctx.id,caseId:ctx.caseId,title:'换货申请',description:'收到的商品颜色不符',confirmed:true,structured:true,orderId:'SO20260926001',serviceType:'exchange',exchangeRequest:'更换为蓝色',extraNote:'保留包装',requestKey:'accept-1',...patch});}
function closeData(r,id,action='new'){const p=D.closePreview(r.s,id,r.now);return {id,token:p.token,reason:'客户离线',summary:'核对已提供的信息，安排后续处理',requestKey:'close-1',items:p.items.map(i=>({caseId:i.caseId,nodeKey:i.nodeKey,action,reason:'继续核实客户诉求',dueAt:r.now+3600000})),callbacks:[]};}
function readyAi(r,id){r.do('c','say',{id,body:'退货规则'});r.do('lin','setAiAssist',{id,enabled:true});const p=D.aiPending(r.s,id,r.now);assert.ok(p);return p;}

test('A02/A03 full SOP and four aftersales steps stay visible without fabricating irrelevant progress',()=>{
 const r=rig(),id=human(r),view=D.sopView(r.s,id,undefined,r.now);
 assert.deepEqual(view.nodes.map(n=>n.key),['intent','order','logistics','aftersales','information','result','callback','close']);
 assert.equal(view.nodes.find(n=>n.key==='aftersales').steps.length,4);
 assert.equal(view.nodes.find(n=>n.key==='order').status,'idle');
 const ctx=aftersales(r,id),sop=D.sopView(r.s,id,ctx.caseId,r.now);
 assert.equal(sop.nodes.find(n=>n.key==='order').status,'done');assert.equal(sop.nodes.find(n=>n.key==='aftersales').status,'doing');assert.equal(sop.prefill.serviceType,'exchange');
 assert.equal(r.s.tickets.length,0);assert.equal(r.case(id).status,'open');
});
test('A02 an existing human support issue does not swallow a later return request or auto-send a reply',()=>{
 const r=rig(),id=human(r),old=r.case(id).id,count=D.get(r.s,'conversations',id).messages.length;
 const ctx=aftersales(r,id);assert.notEqual(ctx.caseId,old);assert.equal(r.case(id).kind,'aftersales');assert.equal(D.get(r.s,'conversations',id).messages.length,count+1);
});
test('A02 multiple order numbers stay unbound until a human matches each issue',()=>{
 const r=rig(),id=human(r);r.do('c','say',{id,body:'SO20260926001 我要退货，SO20260926002 查物流'});
 assert.equal(r.case(id).orderId,'');assert.equal(r.s.tickets.length,0);
});
test('A04/A05 structured preview is read-only and confirmation validates owner/order/required exchange demand atomically',()=>{
 const r=rig(),ctx=aftersales(r),before=JSON.stringify(r.s);D.sopView(r.s,ctx.id,ctx.caseId,r.now);assert.equal(JSON.stringify(r.s),before);
 for(const patch of [{orderId:'SO20260926009'},{exchangeRequest:''},{serviceType:'refund'}]){assert.throws(()=>accept(r,ctx,patch));assert.equal(JSON.stringify(r.s),before);}
 assert.throws(()=>r.do('zhou','createTicket',{conversationId:ctx.id,caseId:ctx.caseId,title:'换货',description:'颜色不符',confirmed:true,structured:true,orderId:'SO20260926001',serviceType:'exchange',exchangeRequest:'蓝色'}),/领取/);
 const out=accept(r,ctx),t=D.get(r.s,'tickets',out.id);assert.equal(t.exchangeRequest,'更换为蓝色');assert.equal(t.extraNote,'保留包装');assert.equal(t.status,'new');assert.equal(r.case(ctx.id).status,'open');
});
test('A05 repeated structured application reuses receipt and a blank placeholder merges into original issue',()=>{
 const r=rig(),first=aftersales(r),out=accept(r,first),createdAt=r.s.tickets[0].createdAt,id=human(r);
 r.do('c','say',{id,body:'我要退货'});const pending=r.case(id).id;
 const again=accept(r,{id,caseId:pending},{requestKey:'accept-2'});assert.equal(again.id,out.id);assert.equal(again.created,false);assert.equal(r.s.tickets.length,1);assert.equal(r.s.tickets[0].createdAt,createdAt);assert.ok(!r.s.cases.some(c=>c.id===pending));
 assert.ok(D.get(r.s,'conversations',id).caseIds.includes(first.caseId));
});
test('A05 committed aftersales cannot be rebound and unrelated orders create independent issues',()=>{
 const r=rig(),first=aftersales(r);accept(r,first);const before=JSON.stringify(r.s);
 assert.throws(()=>r.do('lin','bindOrder',{conversationId:first.id,caseId:first.caseId,orderId:'SO20260926002'}),/不能更换/);assert.equal(JSON.stringify(r.s),before);
 const second=aftersales(r,first.id,'SO20260926002');assert.notEqual(second.caseId,first.caseId);
});
test('A02 order querying records evidence without sending or completing business',()=>{
 const r=rig(),id=human(r);r.do('c','say',{id,body:'查物流 SO20260926001'});const c=r.case(id),before=D.get(r.s,'conversations',id).messages.length;
 r.do('lin','queryOrder',{conversationId:id,caseId:c.id});assert.equal(D.get(r.s,'conversations',id).messages.length,before);assert.equal(r.case(id).status,'open');assert.equal(D.sopView(r.s,id,c.id,r.now).nodes.find(n=>n.key==='logistics').status,'done');
 assert.throws(()=>r.do('lin','markSop',{conversationId:id,caseId:c.id,nodeKey:'result',status:'done',reason:'手工完成'}),/状态无效/);
});
test('A06/A07 AI is explicit, delayed, limited to two distinct turns and never claims first human response',()=>{
 const r=rig(),id=human(r);assert.equal(D.aiPending(r.s,id,r.now),null);let p=readyAi(r,id);
 assert.throws(()=>r.do('lin','aiContinue',p),/尚未/);r.tick(30000);r.do('lin','aiContinue',p);
 let conv=D.get(r.s,'conversations',id);assert.equal(conv.firstHumanAt,null);assert.equal(conv.aiAssist.remaining,1);assert.equal(conv.messages.at(-1).aiAssist,true);assert.equal(D.aiPending(r.s,id,r.now),null);assert.ok(r.s.cases.every(c=>c.status!=='completed'));
 r.do('c','say',{id,body:'请再说明退货规则'});p=D.aiPending(r.s,id,r.now);assert.ok(p);r.tick(30000);r.do('lin','aiContinue',p);
 conv=D.get(r.s,'conversations',id);assert.equal(conv.aiAssist.remaining,0);assert.equal(conv.aiAssist.enabled,false);assert.equal(r.s.tickets.length,0);
});
for(const change of ['reply','reassign','offline','new-message','knowledge','order'])test(`A07/A08 delayed AI rejects stale authorization after ${change}`,()=>{
 const r=rig(),id=human(r),p=readyAi(r,id);r.tick(30000);
 if(change==='reply')r.do('lin','reply',{id,body:'我来核实'});
 if(change==='reassign')r.do('mgr','assignConversation',{id,ownerId:'zhou'});
 if(change==='offline')r.do('c','customerConnection',{status:'offline'});
 if(change==='new-message')r.do('c','say',{id,body:'另一个问题'});
 if(change==='knowledge'){const k=r.s.knowledge.find(k=>k.id===p.citation.id);k.disabled=true;}
 if(change==='order'){const sg=D.get(r.s,'cases',D.get(r.s,'conversations',id).caseIds.at(-1));sg.orderId='SO20260926001';}
 const before=JSON.stringify(r.s);assert.throws(()=>r.do('lin','aiContinue',p));assert.equal(JSON.stringify(r.s),before);
});
test('A07 opt-out survives attempts to grant again and source-less questions stay with humans',()=>{
 const r=rig(),id=human(r);r.do('c','say',{id,body:'请帮我解决特殊包装故障'});r.do('lin','setAiAssist',{id,enabled:true});assert.equal(D.aiPending(r.s,id,r.now),null);
 r.do('c','say',{id,body:'不要AI自动回复'});assert.equal(D.get(r.s,'conversations',id).aiAssist.enabled,false);assert.throws(()=>r.do('lin','setAiAssist',{id,enabled:true}),/停止/);
});
for(const change of ['message','expired','disabled','version','order','owner'])test(`A08 recommendations must be rechecked after ${change}`,()=>{
 const r=rig(),id=human(r);r.do('c','say',{id,body:'退货规则'});const c=r.case(id),sg=D.suggestion(r.s,id,c.id,r.now);assert.equal(sg.status,'ready');
 if(change==='message')r.do('c','say',{id,body:'换一个问题'});
 if(change==='expired')D.get(r.s,'knowledge',sg.knowledge.id).live.expiresAt=new Date(r.now).toISOString();
 if(change==='disabled')D.get(r.s,'knowledge',sg.knowledge.id).disabled=true;
 if(change==='version')D.get(r.s,'knowledge',sg.knowledge.id).live.version++;
 if(change==='order')c.orderId='SO20260926001';
 if(change==='owner')r.do('mgr','assignConversation',{id,ownerId:'zhou'});
 assert.throws(()=>r.do('lin','reply',{id,body:sg.body,suggestionToken:sg.token,suggestionCaseId:c.id}));
 if(change!=='owner')r.do('lin','reply',{id,body:'已重新核实，正在继续处理'});
});
test('A09 connection is customer scoped, blocks sends and survives roundtrip without implying a closed case',()=>{
 const r=rig(),id=human(r);r.do('c','customerConnection',{status:'offline'});assert.equal(D.customerConnection(r.s,'C002'),'online');assert.equal(D.customerView(r.s,'C001').connection,'offline');
 assert.throws(()=>r.do('c','say',{id,body:'发消息'}),/连接/);assert.equal(D.get(r.s,'conversations',id).state,'human');assert.ok(Store.valid(JSON.parse(JSON.stringify(r.s))));
 r.do('c','customerConnection',{status:'online'});r.do('c','say',{id,body:'已回来'});
});
test('A10/A11 close excludes its own control node, requires every unfinished item and creates one followup per issue atomically',()=>{
 const r=rig(),id=human(r),otherId=r.conv();r.do('c','customerConnection',{status:'offline'});const input=closeData(r,id);assert.ok(input.items.length);assert.ok(input.items.every(i=>i.nodeKey!=='close'));
 const before=JSON.stringify(r.s);assert.throws(()=>r.do('lin','closeWithSummary',{...input,items:input.items.slice(1)}),/逐项/);assert.equal(JSON.stringify(r.s),before);
 const inputBefore=JSON.stringify(input),stateBefore=r.s,otherBefore=JSON.stringify(D.get(r.s,'conversations',otherId));
 const result=r.do('lin','closeWithSummary',input),conv=D.get(r.s,'conversations',id);assert.equal(conv.state,'closed');assert.equal(r.s.tickets.length,1);assert.equal(r.s.tickets[0].ownerId,'lin');assert.equal(r.s.cases[0].status,'open');assert.equal(conv.closures[0].items.length,input.items.length);assert.equal(D.sopView(r.s,id,undefined,r.now).nodes.at(-1).status,'done');
 assert.equal(conv.closures[0].sop[0].find(n=>n.key==='close').status,'done');assert.equal(conv.closures[0].sop[0].find(n=>n.key==='close').reason,'本次沟通已结束');
 assert.deepEqual(conv.closures[0].sop[0].filter(n=>n.key!=='close'),D.sopView(r.s,id,undefined,r.now).nodes.filter(n=>n.key!=='close'));
 assert.equal(JSON.stringify(input),inputBefore);assert.equal(JSON.stringify(stateBefore),before);assert.equal(JSON.stringify(D.get(r.s,'conversations',otherId)),otherBefore);assert.notEqual(D.sopView(r.s,otherId,undefined,r.now).nodes.at(-1).status,'done');
 assert.equal(r.do('lin','closeWithSummary',input),result);assert.equal(D.get(r.s,'conversations',id).closures.length,1);
});
test('A10 stale close previews and unauthorized close reject without any business mutation',()=>{
 const r=rig(),id=human(r),input=closeData(r,id);r.do('c','say',{id,body:'我要退货 SO20260926001'});const before=JSON.stringify(r.s);
 assert.throws(()=>r.do('lin','closeWithSummary',input),/变化/);assert.throws(()=>r.do('zhou','closeWithSummary',closeData(r,id)),/领取/);assert.equal(JSON.stringify(r.s),before);
});
test('A11 submitted aftersales cannot be discarded by NA or withdrawal',()=>{
 const r=rig(),ctx=aftersales(r);accept(r,ctx);
 for(const action of ['na','withdrawn']){const data=closeData(r,ctx.id,action),before=JSON.stringify(r.s);assert.throws(()=>r.do('lin','closeWithSummary',data),/已受理/);assert.equal(JSON.stringify(r.s),before);}
});
test('A12/A13 callback close is atomic, ownership inherited and cannot complete the underlying issue',()=>{
 const r=rig(),id=human(r),caseId=r.case(id).id,data=closeData(r,id,'callback');data.callbacks=[{caseId,purpose:'核实处理结果',at:r.now+7200000,note:'内部回访说明'}];
 const before=JSON.stringify(r.s);assert.throws(()=>r.do('lin','closeWithSummary',{...data,callbacks:[{...data.callbacks[0],at:r.now-1}]}),/回访时间/);assert.equal(JSON.stringify(r.s),before);
 r.do('lin','closeWithSummary',data);const t=r.s.tickets[0];assert.equal(t.callback.status,'pending');assert.equal(r.s.cases[0].status,'open');
 r.do('mgr','assignTicket',{id:t.id,ownerId:'zhou'});assert.throws(()=>r.do('lin','callbackResult',{ticketId:t.id,result:'contacted',summary:'已联系'}),/领取/);
 r.do('zhou','callbackResult',{ticketId:t.id,result:'unreachable',summary:'无人接听',nextAt:r.now+3600000});assert.equal(D.get(r.s,'tickets',t.id).callback.status,'pending');
 r.do('zhou','callbackResult',{ticketId:t.id,result:'contacted',summary:'已说明后续安排'});assert.equal(D.get(r.s,'tickets',t.id).callback.status,'contacted');assert.equal(D.get(r.s,'cases',caseId).status,'open');
});
test('A13 a colleague ticket may be referenced but its callback/due date cannot be changed',()=>{
 const r=rig(),ctx=aftersales(r),out=accept(r,ctx);r.do('zhou','claimTicket',{id:out.id});
 let data=closeData(r,ctx.id,'existing');data.items=data.items.map(i=>({...i,ticketId:out.id,dueAt:D.get(r.s,'tickets',out.id).dueAt}));
 data.items=data.items.map(i=>i.caseId===ctx.caseId?i:{caseId:i.caseId,nodeKey:i.nodeKey,action:'na',reason:'本次仅办理售后'});
 const before=JSON.stringify(r.s);assert.throws(()=>r.do('lin','closeWithSummary',{...data,callbacks:[{caseId:ctx.caseId,purpose:'联系',at:r.now+900000,note:''}]}),/领取/);assert.equal(JSON.stringify(r.s),before);
 // The generic initial support issue has no ticket; explicitly mark its unneeded nodes NA.
 data.items=data.items.map(i=>i.caseId===ctx.caseId?i:{caseId:i.caseId,nodeKey:i.nodeKey,action:'na',reason:'本次仅办理售后'});
 r.do('lin','closeWithSummary',data);assert.equal(D.get(r.s,'tickets',out.id).ownerId,'zhou');
});
test('A14 reopening preserves closure snapshots and close completion is conversation scoped',()=>{
 const r=rig(),id=human(r);r.do('lin','closeWithSummary',closeData(r,id));const history=JSON.stringify(D.get(r.s,'conversations',id).closures),caseId=r.case(id).id;
 const next=r.do('c','newConversation',{caseId});assert.notEqual(D.sopView(r.s,next,caseId,r.now).nodes.at(-1).status,'done');assert.equal(JSON.stringify(D.get(r.s,'conversations',id).closures),history);
 r.do('c','say',{id,body:'继续之前的问题'});assert.equal(JSON.stringify(D.get(r.s,'conversations',id).closures),history);
});
test('A17 customer projection omits internal workflow, closure, callback and AI authorization details',()=>{
 const r=rig(),id=human(r),p=readyAi(r,id);r.tick(30000);r.do('lin','aiContinue',p);const data=closeData(r,id,'callback');data.callbacks=[{caseId:r.case(id).id,purpose:'核对',at:r.now+3600000,note:'PRIVATE-CALLBACK'}];r.do('lin','closeWithSummary',data);
 const conv=D.get(r.s,'conversations',id);conv.messages.at(-2).authorizationToken='PRIVATE-TOKEN';
 const publicData=D.customerView(r.s,'C001'),raw=JSON.stringify(publicData);for(const key of ['PRIVATE-CALLBACK','PRIVATE-TOKEN','authorizedBy','requestFingerprint','closures','workflow'])assert.ok(!raw.includes(key),key);
 assert.equal(publicData.conversations[0].messages.find(m=>m.aiAssist).aiAssist,true);
});
test('A10/A17 storage failure or a stale tab leaves close arrangements and history untouched',()=>{
 const r=rig(),id=human(r),initial=JSON.stringify(r.s),values=new Map([[Store.KEY,initial]]);let fail=true;
 const storage={getItem:k=>values.get(k)??null,setItem(k,v){if(fail)throw Error('quota');values.set(k,v);}},store=Store.open(storage,()=>r.s),data=closeData(r,id);data.items.forEach(i=>i.dueAt=Date.now()+3600000);
 assert.throws(()=>store.dispatch(people.lin,'closeWithSummary',data),/quota/);assert.equal(JSON.stringify(store.state),initial);assert.equal(values.get(Store.KEY),initial);
 fail=false;values.set(Store.KEY,JSON.stringify({...r.s,revision:r.s.revision+1}));assert.throws(()=>store.dispatch(people.lin,'closeWithSummary',data),/其他页面/);assert.equal(JSON.stringify(store.state),initial);
});
test('A17 old optional-field-free records remain valid while malformed new fields are blocked',()=>{
 const r=rig();assert.ok(Store.valid(r.s));
 for(const mutate of [s=>s.customers[0].connection='unknown',s=>s.customers[0].connectionChangedAt='tomorrow']){const s=structuredClone(r.s);mutate(s);assert.equal(Store.valid(s),false);}
 const id=human(r),p=readyAi(r,id);const broken=structuredClone(r.s);D.get(broken,'conversations',id).aiAssist.remaining=9;assert.equal(Store.valid(broken),false);
});

test('A03 bot intake and human intake share only explicit service type and quoted reason prefill',()=>{
 const r=rig(),id=r.conv();r.do('c','say',{id,body:'申请换货 SO20260926002，颜色不符'});const p=D.sopView(r.s,id,undefined,r.now).prefill;
 assert.equal(p.serviceType,'exchange');assert.equal(p.description,'申请换货 SO20260926002，颜色不符');assert.equal(p.exchangeRequest,'');assert.equal(p.extraNote,'');
});
test('exchange prefill quotes explicit replacement requests but leaves unknown or declined demands blank',()=>{
 for(const wording of ['换成','换为','更换为']){
  const r=rig(),id=r.conv();r.do('c','say',{id,body:`申请换货 SO20260926001，${wording}同款蓝色；请先核对`});assert.equal(D.sopView(r.s,id,undefined,r.now).prefill.exchangeRequest,'同款蓝色');
 }
 for(const body of ['申请换货 SO20260926001，颜色不符','申请换货 SO20260926001，但不要换成蓝色','申请退货 SO20260926001，曾换成蓝色']){
  const r=rig(),id=r.conv();r.do('c','say',{id,body});assert.equal(D.sopView(r.s,id,undefined,r.now).prefill.exchangeRequest,'');
 }
 const r=rig(),id=r.conv();r.do('c','say',{id,body:'申请换货 SO20260926001，换成'+'蓝'.repeat(220)});assert.equal(D.sopView(r.s,id,undefined,r.now).prefill.exchangeRequest.length,200);
});
test('A02 a human-stage combined logistics and aftersales request keeps two independently actionable issues',()=>{
 const r=rig(),id=human(r);r.do('c','say',{id,body:'查物流 SO20260926001，再申请退货'});
 const issues=D.get(r.s,'conversations',id).caseIds.map(id=>D.get(r.s,'cases',id));assert.ok(issues.some(c=>c.kind==='order'));assert.ok(issues.some(c=>c.kind==='aftersales'));assert.ok(issues.every(c=>c.status==='open'));assert.equal(r.s.tickets.length,0);
});
test('A09 offline cannot create customer-visible side effects through alternative customer commands',()=>{
 const r=rig(),id=r.conv();r.do('c','say',{id,body:'申请退货 SO20260926001'});const caseId=r.case(id).id;r.do('c','customerConnection',{status:'offline'});
 const before=JSON.stringify(r.s);for(const [type,data] of [['newConversation',{}],['requestHuman',{id}],['createTicket',{caseId,title:'申请',description:'原因',confirmed:true}],['closeConversation',{id}],['feedback',{id:caseId,confirmed:false,reason:'继续'}]])assert.throws(()=>r.do('c',type,data),/连接/);
 assert.equal(JSON.stringify(r.s),before);
});

test('changing an uncommitted order invalidates old logistics evidence and keeps both source orders private',()=>{
 const r=rig(),id=human(r);r.do('c','say',{id,body:'查物流 SO20260926001'});const caseId=r.case(id).id;r.do('lin','queryOrder',{conversationId:id,caseId});
 r.do('lin','bindOrder',{conversationId:id,caseId,orderId:'SO20260926002'});assert.equal(D.get(r.s,'cases',caseId).workflow.logistics,undefined);assert.equal(D.sopView(r.s,id,caseId,r.now).nodes.find(n=>n.key==='logistics').status,'todo');
});
test('withdrawing an unsubmitted issue retains its history without capturing the next request',()=>{
 const r=rig(),ctx=aftersales(r),old=ctx.caseId;r.do('lin','closeWithSummary',closeData(r,ctx.id,'withdrawn'));const history=JSON.stringify(D.get(r.s,'conversations',ctx.id).closures);
 r.do('c','say',{id:ctx.id,body:'我要退货 SO20260926001'});assert.notEqual(r.case(ctx.id).id,old);assert.ok(r.s.cases.some(c=>c.id===old));assert.equal(JSON.stringify(D.get(r.s,'conversations',ctx.id).closures),history);
});
test('pending callback on a completed ticket can transfer without reopening business',()=>{
 const r=rig(),ctx=aftersales(r),out=accept(r,ctx);r.do('lin','claimTicket',{id:out.id});r.do('lin','updateTicket',{id:out.id,status:'done',publicText:'已完成换货核实',evidence:'登记结果'});r.do('lin','saveCallback',{ticketId:out.id,purpose:'确认收货体验',at:r.now+3600000,note:''});
 r.do('mgr','assignTicket',{id:out.id,ownerId:'zhou'});const t=D.get(r.s,'tickets',out.id);assert.equal(t.status,'done');assert.equal(t.ownerId,'zhou');assert.equal(t.callback.status,'pending');assert.equal(D.get(r.s,'cases',ctx.caseId).status,'completed');
});

test('A06 preview facts must still match at confirmation and exact successful retries remain idempotent',()=>{
 const r=rig(),ctx=aftersales(r),previewToken=D.intakeToken(r.s,ctx.caseId,'SO20260926001',ctx.id);
 const out=accept(r,ctx,{previewToken});assert.equal(accept(r,ctx,{previewToken}).id,out.id);assert.equal(r.s.tickets.length,1);
 const other=aftersales(r,ctx.id,'SO20260926002'),token=D.intakeToken(r.s,other.caseId,'SO20260926002',other.id);D.get(r.s,'orders','SO20260926002').status='已发货';
 const before=JSON.stringify(r.s);assert.throws(()=>accept(r,other,{orderId:'SO20260926002',previewToken:token,requestKey:'accept-other'}),/重新核对/);assert.equal(JSON.stringify(r.s),before);
 const policyToken=D.intakeToken(r.s,other.caseId,'SO20260926002',other.id),policy=D.retrieve(r.s,'退货规则');D.get(r.s,'knowledge',policy.id).live.version++;
 const afterPolicyChange=JSON.stringify(r.s);assert.throws(()=>accept(r,other,{orderId:'SO20260926002',previewToken:policyToken,requestKey:'accept-other'}),/重新核对/);assert.equal(JSON.stringify(r.s),afterPolicyChange);
});
test('a repeated merged-placeholder confirmation returns the original receipt even after placeholder removal',()=>{
 const r=rig(),ctx=aftersales(r),first=accept(r,ctx),id=human(r);r.do('c','say',{id,body:'我要退货'});const next={id,caseId:r.case(id).id},previewToken=D.intakeToken(r.s,next.caseId,'SO20260926001',id);
 const a=accept(r,next,{previewToken,requestKey:'reuse-confirm'}),b=accept(r,next,{previewToken,requestKey:'reuse-confirm'});assert.equal(a.id,first.id);assert.equal(b.id,first.id);assert.equal(r.s.tickets.length,1);
});

function pendingFollowup(r,order=''){
 const id=r.conv();r.do('c','say',{id,body:`申请换货 ${order}`});const caseId=r.case(id).id;
 r.do('c','requestHuman',{id});r.do('lin','claimConversation',{id});
 const close=closeData(r,id);close.callbacks=[{caseId,purpose:'补齐订单并核对申请',at:r.now+7200000,note:'保留回访安排'}];
 r.do('lin','closeWithSummary',close);return {id,caseId,ticketId:r.s.tickets.find(t=>t.caseId===caseId).id};
}
test('an unaccepted aftersales followup stays unfinished and upgrades the original ticket after reopening and order confirmation',()=>{
 const r=rig(),ctx=pendingFollowup(r),initial=structuredClone(D.get(r.s,'tickets',ctx.ticketId));
 let sop=D.sopView(r.s,ctx.id,ctx.caseId,r.now),sale=sop.nodes.find(n=>n.key==='aftersales');
 assert.equal(sale.status,'todo');assert.ok(sale.steps.every(step=>step.status!=='done'));assert.equal(initial.followupOnly,true);
 assert.equal(sop.prefill.description,'申请换货');assert.ok(D.get(r.s,'conversations',ctx.id).closures[0].sop[0].find(n=>n.key==='aftersales').steps.every(step=>step.status!=='done'));
 r.do('c','say',{id:ctx.id,body:'SO20260926001'});assert.equal(r.case(ctx.id).id,ctx.caseId);r.do('lin','claimConversation',{id:ctx.id});
 r.do('lin','bindOrder',{conversationId:ctx.id,caseId:ctx.caseId,orderId:'SO20260926001'});
 sop=D.sopView(r.s,ctx.id,ctx.caseId,r.now);assert.equal(sop.nodes.find(n=>n.key==='aftersales').status,'doing');assert.equal(sop.nodes.find(n=>n.key==='aftersales').steps.at(-1).status,'todo');
 const previewToken=D.intakeToken(r.s,ctx.caseId,'SO20260926001',ctx.id),before=JSON.stringify(r.s);
 assert.throws(()=>accept(r,ctx,{previewToken,exchangeRequest:''}),/换货要求/);assert.equal(JSON.stringify(r.s),before);
 const out=accept(r,ctx,{previewToken}),t=D.get(r.s,'tickets',ctx.ticketId);assert.equal(out.id,ctx.ticketId);assert.equal(out.upgraded,true);assert.equal(r.s.tickets.length,1);
 assert.equal(t.followupOnly,false);assert.equal(t.title,'换货申请');assert.equal(t.description,'收到的商品颜色不符');assert.equal(t.orderId,'SO20260926001');assert.equal(t.serviceType,'exchange');assert.equal(t.exchangeRequest,'更换为蓝色');assert.equal(t.extraNote,'保留包装');
 assert.equal(t.createdAt,initial.createdAt);assert.equal(t.ownerId,initial.ownerId);assert.deepEqual(t.callback,initial.callback);assert.deepEqual(t.history.slice(0,initial.history.length),initial.history);assert.equal(t.history.length,initial.history.length+1);
 sale=D.sopView(r.s,ctx.id,ctx.caseId,r.now).nodes.find(n=>n.key==='aftersales');assert.equal(sale.status,'done');assert.ok(sale.steps.every(step=>step.status==='done'));
 assert.equal(accept(r,ctx,{previewToken}).id,ctx.ticketId);assert.equal(D.get(r.s,'tickets',ctx.ticketId).history.length,t.history.length);
});
test('bot resumption collects a missing followup order and still offers application intake',()=>{
 const r=rig(),ctx=pendingFollowup(r);r.do('c','say',{id:ctx.id,body:'继续申请换货'});r.do('c','cancelQueue',{id:ctx.id});r.do('c','say',{id:ctx.id,body:'SO20260926001'});
 const c=D.get(r.s,'cases',ctx.caseId),t=D.get(r.s,'tickets',ctx.ticketId),m=D.get(r.s,'conversations',ctx.id).messages.at(-1);
 assert.equal(c.orderId,'SO20260926001');assert.equal(t.orderId,c.orderId);assert.equal(m.intake,true);assert.ok(!m.body.includes('已受理'));assert.equal(t.followupOnly,true);
 r.do('c','say',{id:ctx.id,body:'申请换货 SO20260926001'});assert.equal(D.get(r.s,'conversations',ctx.id).messages.at(-1).intake,true);assert.equal(r.s.tickets.length,1);
});
test('a case with followup history cannot be silently merged into another accepted order',()=>{
 const r=rig(),original=aftersales(r),accepted=accept(r,original),ctx=pendingFollowup(r);
 r.do('c','say',{id:ctx.id,body:'继续处理'});r.do('lin','claimConversation',{id:ctx.id});const before=JSON.stringify(r.s);
 for(const command of [()=>r.do('lin','bindOrder',{conversationId:ctx.id,caseId:ctx.caseId,orderId:'SO20260926001'}),()=>accept(r,ctx,{requestKey:'another-accept'}),()=>r.do('c','say',{id:ctx.id,body:'SO20260926001'})]){assert.throws(command,err=>err.message.includes(accepted.id));assert.equal(JSON.stringify(r.s),before);}
 assert.ok(D.get(r.s,'conversations',ctx.id).caseIds.includes(ctx.caseId));assert.equal(D.get(r.s,'tickets',ctx.ticketId).caseId,ctx.caseId);
});
test('followup acceptance requires complete structured fields and validates marker shape without changing legacy acceptance',()=>{
 const r=rig(),ctx=pendingFollowup(r,'SO20260926001'),before=JSON.stringify(r.s);
 assert.throws(()=>r.do('c','createTicket',{caseId:ctx.caseId,title:'申请换货',description:'颜色不符',confirmed:true}),/完整|核对/);assert.equal(JSON.stringify(r.s),before);
 const bad=structuredClone(r.s);D.get(bad,'tickets',ctx.ticketId).followupOnly='yes';assert.equal(Store.valid(bad),false);
 const legacy=structuredClone(r.s);delete D.get(legacy,'tickets',ctx.ticketId).followupOnly;assert.ok(Store.valid(legacy));assert.equal(D.sopView(legacy,ctx.id,ctx.caseId,r.now).nodes.find(n=>n.key==='aftersales').status,'done');
});
test('followup upgrades respect staff ownership while a customer confirmation preserves the assigned owner and callback',()=>{
 const r=rig(),ctx=pendingFollowup(r);r.do('mgr','assignTicket',{id:ctx.ticketId,ownerId:'zhou'});
 r.do('c','say',{id:ctx.id,body:'继续核对申请'});r.do('lin','claimConversation',{id:ctx.id});const before=JSON.stringify(r.s);
 assert.throws(()=>accept(r,ctx),/领取/);assert.equal(JSON.stringify(r.s),before);
 const callback=structuredClone(D.get(r.s,'tickets',ctx.ticketId).callback),previewToken=D.intakeToken(r.s,ctx.caseId,'SO20260926001',ctx.id);
 const result=r.do('c','createTicket',{conversationId:ctx.id,caseId:ctx.caseId,title:'客户核对换货',description:'颜色不符',confirmed:true,structured:true,orderId:'SO20260926001',serviceType:'exchange',exchangeRequest:'同款蓝色',extraNote:'',requestKey:'customer-upgrade',previewToken});
 const t=D.get(r.s,'tickets',ctx.ticketId);assert.equal(result.id,ctx.ticketId);assert.equal(t.ownerId,'zhou');assert.deepEqual(t.callback,callback);assert.equal(t.followupOnly,false);
});
test('a verified suggestion reply keeps the exact citation after knowledge changes',()=>{
 const r=rig(),id=human(r);r.do('c','say',{id,body:'退货规则'});const caseId=r.case(id).id,sg=D.suggestion(r.s,id,caseId,r.now);
 r.do('lin','reply',{id,body:sg.body,suggestionToken:sg.token,suggestionCaseId:caseId});const sent=D.get(r.s,'conversations',id).messages.at(-1);
 assert.deepEqual(sent.citation,sg.knowledge);D.get(r.s,'knowledge',sg.knowledge.id).live.version++;D.get(r.s,'knowledge',sg.knowledge.id).disabled=true;
 assert.deepEqual(D.customerView(r.s,'C001').conversations.find(c=>c.id===id).messages.at(-1).citation,sg.knowledge);
 r.do('lin','reply',{id,body:'人工补充说明'});assert.equal(D.get(r.s,'conversations',id).messages.at(-1).citation,undefined);
});
test('closing one issue rejects contradictory target times for its shared followup ticket atomically',()=>{
 for(const action of ['new','existing']){
  const r=rig(),id=human(r);
  if(action==='existing'){r.do('lin','closeWithSummary',closeData(r,id));r.do('c','say',{id,body:'继续核对'});r.do('lin','claimConversation',{id});}
  const data=closeData(r,id,action);data.requestKey='check-times';assert.ok(data.items.length>1);if(action==='existing')data.items.forEach(i=>i.ticketId=r.s.tickets[0].id);data.items[1].dueAt+=3600000;
  const before=JSON.stringify(r.s);assert.throws(()=>r.do('lin','closeWithSummary',data),/目标时间.*一致/);assert.equal(JSON.stringify(r.s),before);
  data.items[1].dueAt=data.items[0].dueAt;r.do('lin','closeWithSummary',data);
  assert.ok(D.get(r.s,'conversations',id).closures.at(-1).items.every(i=>i.dueAt===D.get(r.s,'tickets',i.ticketId).dueAt));
 }
});
test('an order reply rejects changed or unrelated facts while ordinary manual replies remain available',()=>{
 const r=rig(),id=human(r);r.do('c','say',{id,body:'查物流 SO20260926001'});const caseId=r.case(id).id;
 const result=r.do('lin','queryOrder',{conversationId:id,caseId}),input={id,body:result.body,orderCaseId:caseId,orderSnapshot:result.order};
 D.get(r.s,'orders',result.order.id).status='订单状态已更新';const before=JSON.stringify(r.s);
 assert.throws(()=>r.do('lin','reply',input),/订单事实已变化/);assert.equal(JSON.stringify(r.s),before);
 r.do('lin','reply',{id,body:'正在人工核实物流情况'});const refreshed=r.do('lin','queryOrder',{conversationId:id,caseId});
 r.do('lin','reply',{...input,body:refreshed.body,orderSnapshot:refreshed.order});assert.equal(D.get(r.s,'conversations',id).messages.at(-1).orderId,result.order.id);
 const otherId=human(r);r.do('c','say',{id:otherId,body:'查物流 SO20260926002'});const otherCaseId=r.case(otherId).id,other=r.do('lin','queryOrder',{conversationId:otherId,caseId:otherCaseId});
 const latest=JSON.stringify(r.s);assert.throws(()=>r.do('lin','reply',{id,body:other.body,orderCaseId:otherCaseId,orderSnapshot:other.order}),/不属于当前/);assert.equal(JSON.stringify(r.s),latest);
});
