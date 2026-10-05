/* Fictional commerce facts. Pure data validation and query projections; no network or storage. */
(function(root){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const cents=n=>Number.isSafeInteger(n)&&n>=0;
  const positive=n=>Number.isSafeInteger(n)&&n>0;
  const facts=x=>x&&typeof x.source==='string'&&x.source.trim().length>0&&positive(x.version)&&Number.isFinite(x.queriedAt)&&x.simulated===true;
  const table=a=>Array.isArray(a)&&a.every(x=>x&&typeof x.id==='string'&&x.id.length>0)&&new Set(a.map(x=>x.id)).size===a.length;
  const queryStatuses=['ok','failed','unknown'];
  function valid(s){
    if(s?.schema!==5||!s.commerce||!table(s.orders))return false;
    const {items,payments,packages}=s.commerce;
    if(![items,payments,packages].every(table))return false;
    const order=id=>s.orders.find(x=>x.id===id),item=id=>items.find(x=>x.id===id);
    if(!items.every(x=>order(x.orderId)&&typeof x.skuId==='string'&&x.skuId&&typeof x.name==='string'&&x.name&&typeof x.variant==='string'&&positive(x.quantity)&&cents(x.paidCents)&&x.currency==='CNY'&&facts(x)))return false;
    if(!payments.every(x=>order(x.orderId)&&['paid','unpaid','pending','unknown'].includes(x.status)&&queryStatuses.includes(x.queryStatus)&&cents(x.amountCents)&&x.currency==='CNY'&&facts(x)))return false;
    if(!packages.every(x=>order(x.orderId)&&['awaiting_dispatch','in_transit','signed'].includes(x.status)&&queryStatuses.includes(x.queryStatus)&&typeof x.carrier==='string'&&typeof x.trackingNumber==='string'&&Array.isArray(x.track)&&x.track.every(t=>t&&Number.isFinite(t.at)&&typeof t.text==='string')&&facts(x)&&Array.isArray(x.allocations)&&x.allocations.length>0&&new Set(x.allocations.map(a=>a.itemId)).size===x.allocations.length&&x.allocations.every(a=>item(a.itemId)?.orderId===x.orderId&&positive(a.quantity))))return false;
    return s.orders.every(o=>{
      const lines=items.filter(x=>x.orderId===o.id),p=payments.filter(x=>x.orderId===o.id),total=lines.reduce((n,x)=>n+x.paidCents,0);
      return facts(o)&&lines.length>0&&p.length===1&&cents(total)&&o.price===total/100&&
        (p[0].status!=='paid'||p[0].amountCents===total)&&
        lines.every(x=>packages.flatMap(p=>p.allocations).filter(a=>a.itemId===x.id).reduce((n,a)=>n+a.quantity,0)===x.quantity);
    });
  }
  const select=(x,keys)=>Object.fromEntries(keys.map(k=>[k,copy(x[k]??null)]));
  const origin=['source','version','queriedAt','simulated'];
  function snapshot(s,orderId,{scope='all',itemId='',packageId=''}={}){
    assert(s.schema===5&&s.commerce,'当前记录没有商品与包裹明细');
    assert(['all','payment','packages'].includes(scope),'查询范围无效');
    const order=s.orders.find(x=>x.id===orderId);assert(order,'暂时无法核对此订单');
    let items=s.commerce.items.filter(x=>x.orderId===orderId),packages=s.commerce.packages.filter(x=>x.orderId===orderId);
    if(itemId){assert(items.some(x=>x.id===itemId),'请核对本订单商品');items=items.filter(x=>x.id===itemId);packages=packages.filter(x=>x.allocations.some(a=>a.itemId===itemId));}
    if(packageId){assert(packages.some(x=>x.id===packageId),'请核对商品对应的包裹');packages=packages.filter(x=>x.id===packageId);items=items.filter(x=>packages.some(p=>p.allocations.some(a=>a.itemId===x.id)));}
    const raw=s.commerce.payments.find(x=>x.orderId===orderId);
    const payment=scope==='packages'?null:select(raw,['id','orderId','status','queryStatus','amountCents','currency',...origin]);
    if(payment&&payment.queryStatus!=='ok'){payment.status=null;payment.amountCents=null;}
    packages=scope==='payment'?[]:packages.map(x=>{
      const p=select(x,['id','orderId','status','queryStatus','carrier','trackingNumber','allocations','track',...origin]);
      p.allocations=p.allocations.map(a=>select(a,['itemId','quantity']));p.track=p.track.map(t=>select(t,['at','text']));
      if(p.queryStatus!=='ok'){p.status=null;p.track=[];}return p;
    });
    return {orderId,queryStatus:(!payment||(payment.queryStatus==='ok'&&payment.status!=='unknown'))&&packages.every(p=>p.queryStatus==='ok')?'ok':'incomplete',
      currency:'CNY',totalPaidCents:payment?.queryStatus==='ok'&&payment.status==='paid'?payment.amountCents:null,
      items:scope==='payment'?[]:items.map(x=>select(x,['id','orderId','skuId','name','variant','quantity','paidCents','currency',...origin])),payment,packages,
      source:order.source,version:order.version,queriedAt:order.queriedAt,simulated:true};
  }
  const money=value=>'¥'+(value/100).toFixed(2);
  const paymentLabel=p=>p.queryStatus==='failed'?'支付查询失败':p.queryStatus==='unknown'?'支付结果未知':({paid:'已支付',unpaid:'未支付',pending:'支付处理中',unknown:'支付结果未知'}[p.status]);
  const packageLabel=p=>p.queryStatus==='failed'?'物流查询失败':p.queryStatus==='unknown'?'物流结果未知':({awaiting_dispatch:'待发货',in_transit:'运输中',signed:'已签收'}[p.status]);
  function summary(value){
    const lines=[`订单 ${value.orderId}（模拟业务数据）`];
    if(value.payment)lines.push(`${paymentLabel(value.payment)}${value.payment.queryStatus==='ok'&&value.payment.status==='paid'?'，实付 '+money(value.payment.amountCents):''}。`);
    value.packages.forEach((p,i)=>{
      const names=p.allocations.map(a=>value.items.find(x=>x.id===a.itemId)?.name||'商品').join('、');
      lines.push(`包裹 ${i+1} · ${names}：${packageLabel(p)}。${p.queryStatus==='ok'?(p.track.at(-1)?.text||'暂无轨迹'):''}`);
    });
    lines.push('轨迹记录与实际收到、商品是否完好分别核实；如有异常请联系人工。');
    return lines.join('\n');
  }
  const serviceTables=['rules','aftersales','returns','refunds','occupancies','handoffs','notifications','evaluations'];
  const uid=(s,p)=>p+String(++s.sequence).padStart(5,'0');
  const required=(v,label,max=2000)=>{assert(typeof v==='string'&&v.trim()&&v.trim().length<=max,`请填写${label}（1–${max}字）`);return v.trim();};
  function ensure(s){
    assert(s.schema===5&&s.commerce,'当前入口没有电商办理记录');
    const needsRules=s.commerce.rules===undefined;
    serviceTables.forEach(k=>s.commerce[k] ||= []);
    if(needsRules)s.commerce.rules.push({id:'EC-RULE-CUP-DAMAGE',itemId:'EC-ITEM-001',version:1,source:'虚构签收破损退货规则',effectiveAt:'2026-10-01',expiresAt:'',serviceType:'return_refund',quantity:1,amountCents:12900,evidenceRef:'DEMO-DAMAGE-001',reviewer:'manager',requiresReturn:true});
    return s.commerce;
  }
  const list=(s,k)=>s.commerce?.[k]||[];
  const find=(s,k,id)=>{const x=list(s,k).find(x=>x.id===id);assert(x,'办理记录不存在，请核对原申请');return x;};
  const issue=(s,id)=>{const c=s.cases.find(c=>c.id===id);assert(c,'服务事项不存在');return c;};
  function access(s,a,c,{read=false}={}){
    if(a.role==='customer'){assert(c.customerId===a.id,'无权查看其他客户事项');return;}
    if(a.role==='manager'){assert(a.teams.includes(c.teamId),'不在授权管理范围内');return;}
    const pending=list(s,'handoffs').some(h=>h.caseId===c.id&&h.targetId===a.id&&h.status==='pending');
    assert(a.role==='agent'&&a.teams.includes(c.teamId)&&(c.ownerId===a.id||(read&&pending)),'请先接管或领取本人有权处理的事项');
  }
  function notify(s,c,body,now){
    c.serviceHistory ||= [];c.serviceHistory.push({at:now,text:body});c.serviceVersion=(c.serviceVersion||0)+1;
    c.conversationIds.forEach(id=>{const conv=s.conversations.find(x=>x.id===id);if(!conv)return;conv.messages.push({id:uid(s,'MSG'),role:'system',body,at:now,visibility:'public',caseId:c.id});conv.updatedAt=now;});
  }
  function ticket(s,c,now){
    let t=s.tickets.find(t=>t.caseId===c.id);
    if(!t){t={id:uid(s,'TK'),customerId:c.customerId,teamId:c.teamId,caseId:c.id,title:c.title,description:c.serviceReason||c.title,orderId:c.orderId,itemId:c.itemId,status:c.ownerId?'working':'new',priority:'normal',ownerId:c.ownerId||'',createdAt:now,dueAt:c.dueAt,history:[],service:true};s.tickets.unshift(t);}
    return t;
  }
  function serviceCase(s,conv,item,kind,reason,now){
    ensure(s);
    let c=s.cases.find(c=>c.service&&c.customerId===conv.customerId&&c.itemId===item.id&&c.kind===kind&&c.status!=='completed');
    if(c){if(!conv.caseIds.includes(c.id))conv.caseIds.push(c.id);if(!c.conversationIds.includes(conv.id))c.conversationIds.push(conv.id);return c;}
    c={id:uid(s,'CS'),customerId:conv.customerId,teamId:'service',kind,title:(kind==='aftersales'?'退货退款核对：':'物流异常核实：')+item.name,orderId:item.orderId,itemId:item.id,service:true,status:'open',feedback:'pending',result:null,resultHistory:[],conversationIds:[conv.id],createdAt:now,completedAt:null,humanTouched:false,ownerId:conv.ownerId||'',groupOwnerId:'service',dueAt:now+s.settings.ticketHours*3600000,serviceStage:'clarifying',serviceReason:reason,serviceVersion:1,serviceHistory:[{at:now,text:'已记录商品诉求，尚未提交办理申请。'}]};
    s.cases.unshift(c);conv.caseIds.push(c.id);ticket(s,c,now);return c;
  }
  function demands(s,query,customerId){
    if(s.schema!==5||/(规则|政策|条件|怎么退|如何退|了解)/.test(query)&&!/(想|要|帮我|办理|申请).{0,6}(退货|退款|换货)/.test(query))return [];
    const orderIds=[...new Set((query.match(/\b(?:EC-)?SO[A-Z0-9]+\b/gi)||[]).map(id=>id.toUpperCase()))];
    if(orderIds.length>1||orderIds.some(id=>!s.orders.some(o=>o.id===id&&o.customerId===customerId)))return [];
    const rows=[];
    for(const clause of query.split(/[，,。；;\n]/)){
      if(/(不要|不想|不用|无需|先不).{0,6}(退货|退款|换货|申请)/.test(clause))continue;
      if(/(?:不|没有|没|并非)(?:是|有|出现)?(?:破损|损坏|坏|碎|裂|漏水)/.test(clause))continue;
      const mentioned=s.commerce.items.filter(i=>s.orders.some(o=>o.id===i.orderId&&o.customerId===customerId)&&(!orderIds.length||orderIds.includes(i.orderId))&&((i.skuId==='EC-SKU-CUP'&&/杯/.test(clause))||(i.skuId==='EC-SKU-BAG'&&/袋/.test(clause))||clause.includes(i.id)||clause.includes(i.name)));
      if(mentioned.length!==1)continue;
      const kind=/(退|退款|破损|碎|坏|裂|漏水)/.test(clause)?'aftersales':/(没(?:有)?收到|没到|未收到|停滞|催发货|丢)/.test(clause)?'logistics':'';
      if(kind&&!rows.some(r=>r.item.id===mentioned[0].id&&r.kind===kind))rows.push({item:copy(mentioned[0]),kind,reason:clause.trim()});
    }return rows;
  }
  function collect(s,conv,query,now){
    const rows=demands(s,query,conv.customerId);if(!rows.length)return false;
    const m=[...conv.messages].reverse().find(m=>m.role==='customer'),caseIds=[];
    rows.forEach(r=>{const c=serviceCase(s,conv,r.item,r.kind,r.reason,now);caseIds.push(c.id);if(m&&rows.length===1)m.caseId=c.id;notify(s,c,r.kind==='aftersales'?`${r.item.name}：请从商品申请入口核对原因、材料和金额后确认；当前仅记录诉求，未提交退货退款。`:`${r.item.name}：已记录物流异常，查询轨迹不能代替异常核实，人工将继续跟进。`,now);});if(m)m.caseIds=caseIds;
    return true;
  }
  function input(s,a,data,now){
    ensure(s);assert(a.role==='customer','申请须由客户本人核对确认');
    const order=s.orders.find(o=>o.id===data.orderId&&o.customerId===a.id);assert(order,'请核对本人订单归属');
    const item=s.commerce.items.find(i=>i.id===data.itemId&&i.orderId===order.id);assert(item,'商品不属于本订单');
    const quantity=Number(data.quantity);assert(quantity===1&&item.quantity===1,'首版仅提供一件商品的退货退款');
    assert(data.serviceType==='return_refund','请选择明确的退货退款服务类型');
    const reason=required(data.reason,'申请原因'),evidenceRef=required(data.evidenceRef,'演示材料',100);
    const rule=s.commerce.rules.find(r=>r.itemId===item.id&&r.serviceType==='return_refund');
    assert(rule&&Date.parse(rule.effectiveAt)<=now&&(!rule.expiresAt||Date.parse(rule.expiresAt)>now),'该商品暂不在已核实规则范围，请联系人工');
    assert(evidenceRef===rule.evidenceRef,'请补充指定的虚构破损凭证');
    const pay=s.commerce.payments.find(p=>p.orderId===order.id),pkg=s.commerce.packages.find(p=>p.allocations.some(a=>a.itemId===item.id));
    assert(pay?.queryStatus==='ok'&&pay.status==='paid','支付事实尚未核实，不能提交');
    assert(pkg?.queryStatus==='ok'&&pkg.status==='signed','该商品尚未核实签收，请单独查询或联系人工');
    assert(cents(rule.amountCents)&&rule.amountCents>0&&rule.amountCents<=item.paidCents,'退款核定金额超出商品实付');
    if(data.conversationId){const conv=s.conversations.find(c=>c.id===data.conversationId&&c.customerId===a.id);assert(conv,'申请会话归属尚未核对');}
    return {orderId:order.id,itemId:item.id,itemName:item.name,quantity,serviceType:data.serviceType,reason,evidenceRef,amountCents:rule.amountCents,rule:copy(rule),facts:copy({order,item,pay,pkg}),customerId:a.id};
  }
  const requestContent=data=>JSON.stringify({customerId:data.customerId,orderId:data.orderId,itemId:data.itemId,quantity:Number(data.quantity),serviceType:data.serviceType,reason:String(data.reason||'').trim(),evidenceRef:String(data.evidenceRef||'').trim(),conversationId:data.conversationId||''});
  function available(s,p){
    assert(!s.cases.some(c=>c.service&&c.customerId===p.customerId&&c.itemId===p.itemId&&c.feedback==='disputed'&&c.status!=='completed'),'原商品异议尚未复核，请继续原事项，不能另建申请');
    const used=list(s,'occupancies').filter(x=>x.itemId===p.itemId&&x.state!=='released');
    assert(!used.length,'该商品已有申请占用，请继续原办理记录');
    const orderUsed=list(s,'occupancies').filter(x=>x.orderId===p.orderId&&x.state!=='released').reduce((n,x)=>n+x.amountCents,0);
    assert(orderUsed+p.amountCents<=p.facts.pay.amountCents,'可用退款额度不足');
  }
  function preview(s,a,data,now){const p=input(s,a,data,now);available(s,p);return {...p,token:JSON.stringify({content:requestContent({...data,customerId:a.id}),facts:p.facts,rule:p.rule,occupied:list(s,'occupancies').filter(x=>x.orderId===p.orderId)})};}
  function finish(s,c,body,evidence,now){
    if(c.feedback==='disputed')return;
    if(c.result)c.resultHistory.push(copy(c.result));c.result={publicText:body,evidence,by:'simulated-service',at:now};c.status='completed';c.completedAt=now;c.feedback='pending';c.serviceStage='completed';
    s.tickets.filter(t=>t.caseId===c.id).forEach(t=>{t.status='done';t.history.push({at:now,publicText:body,actor:'模拟业务服务'});});
    if(!list(s,'notifications').some(n=>n.caseId===c.id))s.commerce.notifications.push({id:uid(s,'NT'),caseId:c.id,aftersaleId:evidence.aftersaleId||'',status:'pending',createdAt:now,body,receipt:null,ownerId:c.ownerId||'manager',dueAt:c.dueAt,simulated:true});
    notify(s,c,body,now);
  }
  function resultReady(s,c){
    if(!c.service)return true;
    if(c.feedback==='disputed')return false;
    if(c.kind==='logistics')return c.result?.evidence?.kind==='logistics-verification'&&Boolean(c.result.evidence.reference);
    const a=list(s,'aftersales').find(a=>a.caseId===c.id);if(!a)return false;
    return (a.status==='rejected'&&a.reviews.at(-1)?.decision==='rejected')||(a.status==='withdrawn'&&a.withdrawalReceipt)||(list(s,'refunds').some(r=>r.aftersaleId===a.id&&r.status==='succeeded'&&r.receipt?.kind==='refund_succeeded'));
  }
  function stage(s,c){
    if(c.feedback==='disputed')return 'dispute_review';if(c.status==='completed')return 'completed';
    const a=list(s,'aftersales').find(a=>a.caseId===c.id);if(!a)return c.kind==='logistics'?'review_required':'clarifying';
    if(a.status==='waiting_customer')return 'waiting_customer';if(a.status==='awaiting_review')return 'awaiting_review';if(a.status==='withdrawal_requested')return 'review_required';
    const r=list(s,'refunds').find(r=>r.aftersaleId===a.id),ret=list(s,'returns').find(r=>r.aftersaleId===a.id);
    if(r)return ({pending:'refund_pending',unknown:'refund_unknown',failed:'review_required',succeeded:'completed'})[r.status];
    return ret?.status==='passed'?'awaiting_refund':ret?.status||'awaiting_return';
  }
  function project(s,c,{internal=false}={}){
    const a=list(s,'aftersales').find(a=>a.caseId===c.id),ret=a&&list(s,'returns').find(r=>r.aftersaleId===a.id),refund=a&&list(s,'refunds').find(r=>r.aftersaleId===a.id),n=list(s,'notifications').find(n=>n.caseId===c.id),h=list(s,'handoffs').filter(h=>h.caseId===c.id).at(-1);
    const item=s.commerce.items.find(i=>i.id===c.itemId),name=id=>s.staff.find(a=>a.id===id)?.name||'服务组 / 服务经理';
    const out={id:c.id,caseId:c.id,kind:c.kind,title:c.title,orderId:c.orderId,itemId:c.itemId||'',itemName:item?.name||'服务咨询',status:c.status,serviceStage:stage(s,c),feedback:c.feedback,ownerId:c.ownerId||'',ownerName:name(c.ownerId),dueAt:c.dueAt||null,reason:c.serviceReason||c.title,request:a?select(a,['id','status','quantity','approvedCents','ruleSnapshot','createdAt','reason','evidenceRef','version','receiptVersion']):null,return:ret?select(ret,['id','status','trackingNumber','receivedAt','passedAt']):null,refund:refund?select(refund,['id','status','amountCents','requestId','receipt','queriedAt']):null,notification:n?select(n,['id','status','receipt','dueAt']):null,handoff:h?{...select(h,['id','version','targetId','status','dueAt','reason','sourceId']),targetName:name(h.targetId)}:null,history:copy(c.serviceHistory||[])};
    if(internal){out.handoffSummary={identity:'演示客户身份，订单归属已按本地样例核对',customerName:s.customers.find(x=>x.id===c.customerId)?.name,orderId:c.orderId,itemName:out.itemName,intent:c.serviceReason||c.title,facts:c.orderId?snapshot(s,c.orderId,c.itemId?{itemId:c.itemId}:{}):null,attempted:copy(c.serviceHistory||[]),failures:[refund&&['unknown','failed'].includes(refund.status)?'退款结果'+refund.status:'',n?.status==='failed'?'通知失败':''].filter(Boolean),missing:a?.status==='waiting_customer'?a.reviews.at(-1)?.reason:'',next:out.serviceStage};out.reviews=copy(a?.reviews||[]);}
    return out;
  }
  function metrics(s){
    const cases=s.cases,ids={},add=(key,filter)=>{ids[key]=cases.filter(filter).map(c=>c.id);};
    add('total',()=>true);add('queries',c=>c.kind==='order'&&c.result?.evidence?.kind==='simulated-commerce'&&c.result.evidence.snapshot?.queryStatus==='ok');
    add('accepted',c=>list(s,'aftersales').some(a=>a.caseId===c.id));add('completed',c=>c.status==='completed'&&resultReady(s,c));
    add('refundSucceeded',c=>list(s,'refunds').some(r=>r.caseId===c.id&&r.status==='succeeded'&&r.receipt));add('confirmed',c=>c.status==='completed'&&c.feedback==='confirmed'&&resultReady(s,c));
    add('humanInvolved',c=>c.humanTouched===true);add('waiting',c=>c.status!=='completed');add('unknown',c=>list(s,'refunds').some(r=>r.caseId===c.id&&r.status==='unknown'));
    add('aiIndependent',c=>c.status==='completed'&&resultReady(s,c)&&!c.humanTouched);
    return {scope:'演示数据',...Object.fromEntries(Object.entries(ids).map(([k,v])=>[k,v.length])),metricCaseIds:ids,rows:cases.map(c=>{const p=project(s,c);return {caseId:c.id,itemName:p.itemName,title:c.title,status:c.status,serviceStage:p.serviceStage,ownerName:p.ownerName,dueAt:p.dueAt,requestStatus:p.request?.status||'',refundStatus:p.refund?.status||'',notificationStatus:p.notification?.status||'',feedback:c.feedback,humanInvolved:c.humanTouched===true};})};
  }
  function command(s,a,type,data,now){
    ensure(s);let value;
    if(type==='previewAftersale')return preview(s,a,data,now);
    if(type==='confirmAftersale'){
      const key=required(data.requestId,'申请提交标识',200),content=requestContent({...data,customerId:a.id}),old=list(s,'aftersales').find(x=>x.requestId===key);
      if(old){assert(old.customerId===a.id&&old.requestFingerprint===content,'提交标识已用于不同客户或内容');assert(data.confirmed===true,'请明确确认申请');return old.id;}
      const p=preview(s,a,data,now);assert(data.confirmed===true,'请核对预览后明确确认');assert(data.token===p.token,'订单、规则或额度已变化，请重新核对预览');
      const conv=s.conversations.find(c=>c.id===data.conversationId&&c.customerId===a.id)||s.conversations.find(c=>c.customerId===a.id);assert(conv,'请先开始咨询');
      const item=s.commerce.items.find(i=>i.id===p.itemId),c=serviceCase(s,conv,item,'aftersales',p.reason,now);
      const app={id:uid(s,'AS'),caseId:c.id,customerId:a.id,orderId:p.orderId,itemId:p.itemId,quantity:p.quantity,serviceType:p.serviceType,reason:p.reason,evidenceRef:p.evidenceRef,status:'awaiting_review',version:1,receiptVersion:0,approvedCents:p.amountCents,ruleSnapshot:copy(p.rule),factsSnapshot:copy(p.facts),createdAt:now,requestId:key,requestFingerprint:content,reviews:[],supplements:[],receipts:[]};s.commerce.aftersales.push(app);
      s.commerce.occupancies.push({id:uid(s,'OC'),aftersaleId:app.id,orderId:p.orderId,itemId:p.itemId,quantity:1,amountCents:p.amountCents,state:'reserved'});
      c.serviceReason=p.reason;c.serviceStage='awaiting_review';c.workflow ||= {overrides:{}};c.workflow.intentConfirmedAt=now;c.workflow.orderCheckedAt=now;
      ticket(s,c,now);notify(s,c,`${p.itemName}一件申请已受理，待服务经理审核；核定模拟金额 ${money(p.amountCents)}，尚未退款。`,now);
      if(conv.state==='bot'||conv.state==='closed'){conv.state='queued';conv.waitingSince ||= now;conv.ownerId='';conv.messages.push({id:uid(s,'MSG'),role:'system',body:'已交服务组跟进，审核及办理进度会保留在此事项。',at:now,visibility:'public',caseId:c.id});}
      return app.id;
    }
    if(type==='expireHandoffs'){
      for(const h of list(s,'handoffs').filter(h=>h.status==='pending'&&h.dueAt<=now)){const c=issue(s,h.caseId);assert(a.role==='manager'&&a.teams.includes(c.teamId),'无权检查该团队交接');h.status='expired';h.version++;h.escalationOwnerId=a.id;notify(s,c,'交接超时，原负责人继续办理，已升级服务经理。',now);}return null;
    }
    if(['proposeHandoff','acceptHandoff','rejectHandoff'].includes(type)){
      if(type==='proposeHandoff'){
        const c=issue(s,data.caseId);access(s,a,c);assert(c.service&&c.status!=='completed','仅可交接未完服务事项');assert(c.ownerId,'初次接待请先领取服务组任务');
        const next=s.staff.find(x=>x.id===data.targetId&&x.role==='agent'&&x.teams.includes(c.teamId)&&x.available);assert(next&&next.id!==c.ownerId,'请选择其他可接待的服务组客服');
        assert(!list(s,'handoffs').some(h=>h.caseId===c.id&&h.status==='pending'),'已有待接收交接');const dueAt=Number(data.dueAt);assert(Number.isFinite(dueAt)&&dueAt>now,'请设置未来交接反馈时间');
        const h={id:uid(s,'HO'),caseId:c.id,sourceId:c.ownerId,targetId:next.id,reason:required(data.reason,'转派理由',1000),dueAt,status:'pending',version:1,caseVersion:c.serviceVersion||0,ticketIds:s.tickets.filter(t=>t.caseId===c.id&&t.status!=='done').map(t=>t.id),at:now};s.commerce.handoffs.push(h);return h.id;
      }
      const h=find(s,'handoffs',data.handoffId),c=issue(s,h.caseId);assert(a.id===h.targetId&&a.role==='agent'&&a.teams.includes(c.teamId),'仅目标客服可接收或拒绝交接');
      assert(h.status==='pending'&&Number(data.version)===h.version,'交接已处理或版本已变化');assert(h.dueAt>now,'交接已超时，请交经理核实');
      if(type==='rejectHandoff'){h.status='rejected';h.version++;h.rejection=required(data.reason,'拒绝原因',1000);notify(s,c,'目标客服拒绝交接，原负责人继续办理，服务经理可调整安排。',now);return h.id;}
      assert(a.available&&s.settings.accepting,'目标客服当前不可接待');assert(c.ownerId===h.sourceId&&c.status!=='completed'&&(c.serviceVersion||0)===h.caseVersion,'原事项或责任已变化，请重新核对交接');
      assert(s.tickets.filter(t=>t.caseId===c.id&&t.status!=='done').every(t=>h.ticketIds.includes(t.id)&&t.ownerId===h.sourceId),'办理任务已变化，请重新核对');
      c.ownerId=a.id;h.status='accepted';h.version++;h.acceptedAt=now;c.dueAt=h.dueAt;
      s.tickets.filter(t=>h.ticketIds.includes(t.id)).forEach(t=>{t.ownerId=a.id;t.dueAt=h.dueAt;});
      c.conversationIds.forEach(id=>{const conv=s.conversations.find(v=>v.id===id);if(conv?.aiAssist)conv.aiAssist.enabled=false;});
      notify(s,c,`${a.name}已接收该事项，后续反馈时间 ${new Date(h.dueAt).toISOString()}。`,now);return h.id;
    }
    if(['serviceFollowup','resolveLogistics','serviceDispute','resolveServiceDispute','serviceReply'].includes(type)){
      const c=issue(s,data.caseId);access(s,a,c);assert(c.service,'请选择明确的商品事项');
      if(type==='serviceReply'){assert(a.role==='agent','请由事项负责人回复');const body=required(data.body,'事项回复');c.humanTouched=true;c.serviceVersion++;c.serviceHistory.push({at:now,text:a.name+'：'+body});c.conversationIds.forEach(id=>{const conv=s.conversations.find(v=>v.id===id);if(conv){conv.messages.push({id:uid(s,'MSG'),role:'agent',author:a.name,body,at:now,visibility:'public',caseId:c.id});conv.updatedAt=now;conv.firstHumanAt ||= now;}});return c.id;}
      if(type==='serviceFollowup'){assert(a.role==='agent'&&c.status!=='completed','请由办理客服安排未完事项');const at=Number(data.dueAt);assert(Number.isFinite(at)&&at>now,'反馈时间须晚于当前时间');c.dueAt=at;ticket(s,c,now).dueAt=at;notify(s,c,'已安排下一次反馈时间。',now);return c.id;}
      if(type==='resolveLogistics'){assert(a.role==='agent'&&c.kind==='logistics'&&c.status!=='completed','请由负责客服核实物流异常');const body=required(data.body,'核实结论'),ref=required(data.evidenceRef,'核实依据',500);c.humanTouched=true;finish(s,c,body,{kind:'logistics-verification',reference:ref,actorId:a.id},now);return c.id;}
      if(type==='resolveServiceDispute'){
        assert(a.role==='agent'&&c.feedback==='disputed'&&c.result,'请由负责客服核实原结果异议');const body=required(data.body,'异议复核结论'),ref=required(data.evidenceRef,'复核依据',500),previous=copy(c.result);
        c.feedback='pending';assert(resultReady(s,c),'原业务结果尚无有效证据，不能只凭文本复核');finish(s,c,body,{...copy(previous.evidence),reviewReference:ref,reviewActorId:a.id,originalResultAt:previous.at},now);c.humanTouched=true;return c.id;
      }
      assert(a.role==='customer'&&c.result,'尚无结果可提出异议');const reason=required(data.reason,'异议原因');c.resultHistory.push(copy(c.result));c.status='open';c.feedback='disputed';c.completedAt=null;c.dueAt=now+s.settings.ticketHours*3600000;c.serviceStage='dispute_review';
      const t=ticket(s,c,now);t.status=t.ownerId?'working':'new';t.dueAt=c.dueAt;notify(s,c,`客户提出异议：${reason}。原退款流水保留，继续由服务组核实。`,now);return c.id;
    }
    const app=find(s,'aftersales',data.aftersaleId),c=issue(s,app.caseId);
    if(type==='applySimulatedReceipt'){assert(a.role==='admin','仅演示管理员可提供模拟业务回执');}
    else access(s,a,c);
    const ret=()=>list(s,'returns').find(r=>r.aftersaleId===app.id),refund=()=>list(s,'refunds').find(r=>r.aftersaleId===app.id),occupation=()=>list(s,'occupancies').find(o=>o.aftersaleId===app.id);
    switch(type){
      case 'submitReview':{
        assert(a.role==='manager','审核须由服务经理明确决定');assert(app.status==='awaiting_review','申请当前不在待审核状态');assert(['approved','rejected','needs_info'].includes(data.decision),'审核决定无效');
        const reason=required(data.reason,'审核依据',1000);app.reviews.push({decision:data.decision,reason,actorId:a.id,at:now,ruleVersion:app.ruleSnapshot.version});app.version++;c.humanTouched=true;
        if(data.decision==='approved'){
          const current=s.commerce.rules.find(r=>r.id===app.ruleSnapshot.id),pay=s.commerce.payments.find(p=>p.orderId===app.orderId);assert(current?.version===app.ruleSnapshot.version&&pay?.queryStatus==='ok'&&pay.status==='paid','规则或支付事实已变化，请重新核实申请');
          app.status='approved';s.commerce.returns.push({id:uid(s,'RT'),aftersaleId:app.id,status:'awaiting_return',trackingNumber:'',createdAt:now});notify(s,c,'模拟人工审核通过，请按本事项提交寄回运单；退款须等待收货与验收通过。',now);
        }else if(data.decision==='needs_info'){app.status='waiting_customer';c.status='waiting_customer';ticket(s,c,now).status='waiting_customer';notify(s,c,'审核需要补充资料：'+reason,now);}
        else{app.status='rejected';occupation().state='released';finish(s,c,'本次申请已拒绝：'+reason,{kind:'review-decision',aftersaleId:app.id,decision:'rejected',actorId:a.id},now);}break;
      }
      case 'submitSupplement':{
        assert(a.role==='customer'&&c.status!=='completed'&&['waiting_customer','awaiting_review','approved','withdrawal_requested'].includes(app.status),'终结申请如有异议，请使用仍需帮助');const body=required(data.body,'补充说明');app.supplements.push({at:now,body,evidenceRef:String(data.evidenceRef||'').trim()});
        if(['waiting_customer','awaiting_review'].includes(app.status)){app.status='awaiting_review';c.status='open';ticket(s,c,now).status=c.ownerId?'working':'new';}app.version++;notify(s,c,'客户补充：'+body+'。材料保留在原申请，原反馈期限保持。',now);break;
      }
      case 'submitReturn':assert(a.role==='customer'&&app.status==='approved'&&ret()?.status==='awaiting_return','请等待审核通过后寄回');ret().trackingNumber=required(data.trackingNumber,'寄回运单',100);ret().status='in_transit';app.version++;notify(s,c,'已记录模拟寄回运单，等待仓库收货及验收。',now);break;
      case 'requestWithdrawal':assert(a.role==='customer'&&!['withdrawn','rejected','withdrawal_requested'].includes(app.status)&&refund()?.status!=='succeeded','申请已终结或已退款，不能撤回');app.beforeWithdrawal=app.status;app.status='withdrawal_requested';app.withdrawalReason=required(data.reason,'撤回原因',1000);app.version++;notify(s,c,'已记录撤回请求；原执行与额度须待模拟业务确认安全终止后处理。',now);break;
      case 'submitRefund':{
        assert(a.role==='agent','请由负责客服提交已批准退款');const key=required(data.requestId,'退款提交标识',200),old=refund();if(old){assert(old.requestId===key,'已有原退款义务，请查询原流水，禁止另建重复执行');return old.id;}
        assert(app.status==='approved'&&ret()?.status==='passed','申请须审核批准且仓库验收通过');assert(occupation()?.state==='reserved','原申请额度占用无效');
        value={id:uid(s,'RF'),caseId:c.id,aftersaleId:app.id,obligationId:'OB-'+app.id,requestId:key,amountCents:app.approvedCents,status:'pending',createdAt:now,receipt:null,simulated:true};s.commerce.refunds.push(value);c.humanTouched=true;notify(s,c,'模拟退款请求已提交，等待支付渠道回执；当前尚未确认成功。',now);value=value.id;break;
      }
      case 'queryRefund':assert(a.role==='agent'&&refund(),'尚无原退款请求可查询');refund().queriedAt=now;value=copy(refund());break;
      case 'applySimulatedReceipt':{
        const kind=data.kind,version=Number(data.version),channel=String(kind).split('_')[0];assert(['warehouse_received','warehouse_passed','warehouse_failed','refund_succeeded','refund_unknown','refund_failed','notification_sent','notification_failed','withdrawal_confirmed'].includes(kind),'模拟事件无效');assert(positive(version),'业务回执版本须为正整数');
        const content=JSON.stringify({kind,reason:String(data.reason||''),safeStopped:data.safeStopped===true}),prior=app.receipts.filter(r=>r.channel===channel),same=prior.find(r=>r.version===version),latest=prior.filter(r=>!r.ignored).sort((a,b)=>b.version-a.version)[0];
        if(same){assert(same.fingerprint===content,'同版本业务回执内容矛盾，请核实');return same.id;}
        if(latest&&version<latest.version){app.receipts.push({id:uid(s,'RC'),channel,kind,version,fingerprint:content,at:now,ignored:true});return null;}
        const receipt={id:uid(s,'RC'),channel,kind,version,fingerprint:content,at:now,actorId:a.id,simulated:true,source:channel==='refund'?'模拟财务人工办理':'模拟'+channel+'业务服务'};
        if(channel==='warehouse'){
          assert(app.status==='approved'&&ret(),'须有已批准的寄回任务');assert(!['passed','review_required'].includes(ret().status),'验收已有终态，请人工核实矛盾回执');
          if(kind==='warehouse_received'){assert(ret().status==='in_transit','请先提交寄回运单');ret().status='received';ret().receivedAt=now;}
          else{assert(ret().status==='received','收货与验收分开，请先确认收货');ret().status=kind==='warehouse_passed'?'passed':'review_required';ret().passedAt=now;ret().evidence=receipt.id;c.humanTouched=true;}notify(s,c,kind==='warehouse_received'?'模拟仓库已收货，尚未完成验收。':kind==='warehouse_passed'?'模拟人工验收通过，可继续提交已批准退款。':'模拟验收异常，已交服务组核实，暂不退款。',now);
        }else if(channel==='refund'){
          const r=refund();assert(r,'须先提交原退款请求');const safetyUpdate=r.status==='failed'&&kind==='refund_failed'&&!r.safeStopped&&data.safeStopped===true;
          assert(!['succeeded','failed'].includes(r.status)||safetyUpdate,'退款已有终态，矛盾结果须人工核实，不能覆盖');
          r.status=kind.slice(7);r.receipt=receipt;r.safeStopped=data.safeStopped===true;c.humanTouched=true;
          if(r.status==='succeeded'){occupation().state='used';finish(s,c,'模拟退款渠道已返回成功：'+money(r.amountCents)+'。实际到账与客户反馈分别核实。',{kind:'simulated-refund',aftersaleId:app.id,receiptId:receipt.id,requestId:r.requestId,amountCents:r.amountCents},now);}
          else notify(s,c,r.status==='unknown'?'模拟退款结果未知，请查询原流水；未宣称成功，原额度仍占用。':'模拟退款失败，服务组须核实原义务与终止情况。',now);
        }else if(channel==='notification'){
          const n=list(s,'notifications').find(n=>n.caseId===c.id);assert(n,'尚无已形成的结果通知');assert(n.status!=='sent','通知已有成功回执，不能覆盖');n.status=kind==='notification_sent'?'sent':'failed';n.receipt=receipt;
          if(n.status==='sent')notify(s,c,'模拟结果通知已送达；客户是否确认解决仍单独记录。',now);else notify(s,c,'模拟结果通知失败，已安排服务组补救；原业务结果保持。',now);
        }else{
          assert(app.status==='withdrawal_requested','须先提出撤回请求');assert(!refund()||(refund().status==='failed'&&refund().safeStopped===true),'原退款仍须核实安全终止，不能释放额度');assert(occupation()?.state==='reserved','已用金额不能释放');app.status='withdrawn';app.withdrawalReceipt=receipt;occupation().state='released';finish(s,c,'模拟业务已确认申请安全撤回，未用额度已释放。',{kind:'withdrawal-confirmation',aftersaleId:app.id,receiptId:receipt.id},now);
        }
        app.receipts.push(receipt);app.receiptVersion=Math.max(app.receiptVersion,version);app.version++;value=receipt.id;break;
      }
      default:throw Error('未知电商办理命令');
    }
    c.serviceStage=stage(s,c);return value===undefined?app.id:value;
  }
  function validServices(s){
    if(!serviceTables.some(k=>s.commerce[k]!==undefined))return true;
    if(!serviceTables.every(k=>table(s.commerce[k])))return false;
    const c=id=>s.cases.find(c=>c.id===id),item=id=>s.commerce.items.find(i=>i.id===id),app=id=>list(s,'aftersales').find(a=>a.id===id);
    if(!list(s,'rules').every(r=>item(r.itemId)&&positive(r.version)&&cents(r.amountCents)&&r.amountCents<=item(r.itemId).paidCents&&Number.isFinite(Date.parse(r.effectiveAt))))return false;
    if(!list(s,'aftersales').every(a=>c(a.caseId)?.customerId===a.customerId&&c(a.caseId)?.itemId===a.itemId&&item(a.itemId)?.orderId===a.orderId&&['awaiting_review','waiting_customer','approved','rejected','withdrawal_requested','withdrawn'].includes(a.status)&&a.quantity===1&&cents(a.approvedCents)&&a.approvedCents<=item(a.itemId).paidCents&&positive(a.version)&&Array.isArray(a.reviews)&&Array.isArray(a.receipts)&&Array.isArray(a.supplements)&&typeof a.requestFingerprint==='string'))return false;
    if(!list(s,'returns').every(r=>app(r.aftersaleId)&&['awaiting_return','in_transit','received','passed','review_required'].includes(r.status)))return false;
    if(!list(s,'refunds').every(r=>app(r.aftersaleId)?.caseId===r.caseId&&cents(r.amountCents)&&r.amountCents===app(r.aftersaleId).approvedCents&&['pending','unknown','failed','succeeded'].includes(r.status)&&(r.status!=='succeeded'||r.receipt?.kind==='refund_succeeded')))return false;
    if(new Set(list(s,'refunds').map(r=>r.obligationId)).size!==list(s,'refunds').length)return false;
    if(!list(s,'occupancies').every(o=>app(o.aftersaleId)?.itemId===o.itemId&&app(o.aftersaleId)?.orderId===o.orderId&&o.amountCents===app(o.aftersaleId)?.approvedCents&&o.quantity===1&&['reserved','used','released'].includes(o.state)))return false;
    if(!list(s,'aftersales').every(a=>list(s,'occupancies').filter(o=>o.aftersaleId===a.id).length===1))return false;
    if(new Set(list(s,'aftersales').map(a=>a.caseId)).size!==list(s,'aftersales').length)return false;
    if(!s.commerce.items.every(i=>list(s,'occupancies').filter(o=>o.itemId===i.id&&o.state!=='released').reduce((n,o)=>n+o.quantity,0)<=i.quantity))return false;
    return list(s,'handoffs').every(h=>c(h.caseId)&&['pending','accepted','rejected','expired'].includes(h.status)&&positive(h.version)&&Number.isFinite(h.dueAt)&&s.staff.some(a=>a.id===h.targetId&&a.role==='agent'))&&list(s,'notifications').every(n=>c(n.caseId)&&['pending','sent','failed'].includes(n.status))&&s.cases.filter(c=>c.service).every(c=>item(c.itemId)?.orderId===c.orderId&&Number.isFinite(c.dueAt)&&(!c.ownerId||s.staff.some(a=>a.id===c.ownerId&&a.role==='agent'))&&(c.status!=='completed'||resultReady(s,c)));
  }
  const baseValid=valid;
  const api={valid:s=>baseValid(s)&&validServices(s),snapshot,summary,money,paymentLabel,packageLabel,ensure,demands,collect,serviceCase,preview,command,project,metrics,resultReady,access};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SupportCommerce=api;
})(typeof window!=='undefined'?window:globalThis);
