/* Scenario-first, deterministic local service. Production authorization and atomic ledgers belong on a server. */
(function (root) {
  'use strict';
  const M=typeof module!=='undefined'&&module.exports?require('./model.js'):root.SupportV2Model;
  const {TYPES,STAGES,clone,amount}=M;
  const fail=(condition,message)=>{if(!condition)throw new Error(message);};
  const required=(value,label,max=2000)=>{fail(typeof value==='string'&&value.trim().length>0&&value.trim().length<=max,`请填写${label}（1–${max}字）`);return value.trim();};
  const clean=value=>String(value||'').trim();
  const id=(s,prefix)=>prefix+String(++s.sequence).padStart(6,'0');
  const get=(s,table,key)=>{const r=s[table].find(x=>x.id===key);fail(r,'记录不存在，请刷新后重试');return r;};
  const normalize=x=>clean(x).toLowerCase().replace(/[\s，,。.!！?？]/g,'');
  const active=(r,now)=>r&&Date.parse(r.effectiveAt)<=now&&(!r.expiresAt||now<Date.parse(r.expiresAt));
  const staffRoles=['agent','manager','warehouse','finance','operator'];
  const afterTypes=['return_refund','refund_only','exchange','reship'];
  const intakeTypes=['invoice','price_protection','repair'];
  const businessTypes=[...afterTypes,...intakeTypes,'cancel_order','change_address'];
  const terminalStages=['completed','queried','withdrawn','rejected'];
  function person(s,who) {
    fail(who&&typeof who.id==='string','缺少操作者');
    const a=who.role==='customer'?get(s,'customers',who.id):get(s,'staff',who.id);
    fail(who.role==='customer'||a.role===who.role,'操作者角色不匹配');
    return {...a,role:who.role};
  }
  const permit=(a,roles)=>fail(roles.includes(a.role),'当前角色没有此项操作权限');
  function orderFor(s,a,orderId) {
    const o=get(s,'orders',orderId);
    if(a.role==='customer')fail(a.verified&&o.customerId===a.id,'请先核验本人订单归属');
    else permit(a,staffRoles.filter(r=>r!=='operator'));
    return o;
  }
  function caseFor(s,a,caseId) {
    const c=get(s,'cases',caseId);
    if(a.role==='customer')fail(c.customerId===a.id,'不能访问其他客户的事项');
    else permit(a,staffRoles);
    return c;
  }
  function working(a,c) {
    permit(a,['agent','manager','warehouse','finance']);
    if(a.role==='agent')fail(c.ownerId===a.id,'请先接管或领取此事项');
    if(['warehouse','finance'].includes(a.role))fail(c.groupOwnerId===a.team,'此事项不在当前业务责任组');
  }
  function event(s,a,action,objectId,detail,now) {
    s.events.push({id:id(s,'EV'),actorId:a?.id||'system',role:a?.role||'system',action,objectId,detail:clone(detail||{}),at:now});
  }
  function message(s,conv,role,body,now,caseIds=[],extras={}) {
    const m={id:id(s,'MSG'),role,body,at:now,caseIds:[...new Set(caseIds)],...extras};
    conv.messages.push(m);conv.updatedAt=now;return m;
  }
  function customerMessage(s,c,body,now) {
    c.history.push({at:now,text:body});
    for(const convId of c.conversationIds){const cv=s.conversations.find(x=>x.id===convId);if(cv)message(s,cv,'system',body,now,[c.id]);}
    const n={id:id(s,'NT'),caseId:c.id,customerId:c.customerId,body,status:'available_in_portal',at:now};s.notifications.push(n);
  }
  function connect(c,conv) {
    if(!c.conversationIds.includes(conv.id))c.conversationIds.push(conv.id);
    if(!conv.caseIds.includes(c.id))conv.caseIds.push(c.id);
  }
  function makeCase(s,conv,type,title,fields,now,key='') {
    let c=key?s.cases.find(x=>x.customerId===conv.customerId&&x.key===key&&!['withdrawn','rejected'].includes(x.stage)):null;
    if(c){connect(c,conv);return c;}
    c={id:id(s,'CS'),customerId:conv.customerId,type,title,key,stage:'clarifying',status:'open',orderId:'',itemId:'',
      ownerId:conv.ownerId||'',groupOwnerId:'service',nextAt:now+s.settings.ticketHours*3600000,createdAt:now,completedAt:null,
      feedback:'pending',satisfaction:null,humanTouched:false,conversationIds:[conv.id],result:null,history:[],notes:[],...fields};
    s.cases.unshift(c);conv.caseIds.push(c.id);return c;
  }
  function setStage(s,c,stage,now,text) {
    c.stage=stage;c.status=stage==='completed'||stage==='queried'?'completed':stage==='disputed'?'disputed':stage==='waiting_customer'?'waiting_customer':'open';
    if(c.status==='completed')c.completedAt=now;
    if(text)customerMessage(s,c,text,now);
  }
  function policyFor(s,type,now) {
    const p=s.policies.find(x=>x.id===type)?.live;
    fail(p&&active(p,now),'该服务规则暂待核实，请联系人工');fail(p.enabled,'该服务暂不接受新申请，请联系人工核实');return p;
  }
  const packagesFor=(s,item)=>s.packages.filter(p=>p.itemIds.includes(item.id));
  const paymentFor=(s,order)=>s.payments.find(p=>p.orderId===order.id);
  const packLabel=p=>p.queryStatus==='failed'?'物流查询失败':p.queryStatus!=='ok'?'物流结果待核实':({in_transit:'运输中',signed:'已签收',awaiting_dispatch:'待发货',cancelled:'已取消'}[p.status]||'状态待核实');
  const payLabel=p=>!p?'未查到支付记录':p.queryStatus==='failed'?'支付查询失败':p.queryStatus!=='ok'?'支付结果待核实':({paid:'已支付',unpaid:'未支付',pending:'支付处理中',unknown:'支付结果未知'}[p.status]||'支付结果待核实');
  function orderSnapshot(s,a,orderId) {
    const o=orderFor(s,a,orderId),p=paymentFor(s,o);
    return {orderId:o.id,status:o.status,version:o.version,items:clone(s.items.filter(i=>i.orderId===o.id)),
      payment:!p?null:p.queryStatus==='ok'?clone(p):{id:p.id,orderId:p.orderId,status:null,queryStatus:p.queryStatus,amountCents:null,source:p.source,queriedAt:p.queriedAt},
      packages:s.packages.filter(p=>p.orderId===o.id).map(p=>p.queryStatus==='ok'?clone(p):{id:p.id,itemIds:p.itemIds,status:null,queryStatus:p.queryStatus,source:p.source,queriedAt:p.queriedAt}),source:o.source};
  }
  function couponResult(s,a,orderId,couponId,now) {
    const o=orderFor(s,a,orderId),cp=get(s,'coupons',couponId),items=s.items.filter(i=>i.orderId===o.id);
    let reason='',code='eligible';
    if(now<cp.effectiveAt){reason='活动尚未开始';code='not_started';}
    else if(now>=cp.expiresAt){reason='优惠券已过期';code='expired';}
    else if(items.some(i=>!cp.skuIds.includes(i.skuId))){reason='本订单包含不适用该券的商品';code='scope';}
    else if(items.reduce((n,i)=>n+i.paidCents,0)<cp.minCents){reason=`未达到 ${amount(cp.minCents)} 的使用门槛`;code='threshold';}
    else if(o.promotion&&!cp.stackable){reason='不可与本订单已用优惠叠加';code='stacking';}
    else if(o.status==='cancelled'){reason='订单已取消';code='cancelled';}
    return {eligible:!reason,reason:reason||'符合当前配置的资格条件；不代表已使用，也不会自动修改已支付订单',code,orderId,couponId,source:cp.source,version:cp.version,queriedAt:now,simulated:true};
  }
  const occupied=(s,itemId)=>s.applications.some(r=>r.itemId===itemId&&(!['rejected','withdrawn'].includes(r.stage)||s.returns.some(t=>t.applicationId===r.id&&['returning','received','passed','exception'].includes(t.status))||s.refunds.some(f=>f.applicationId===r.id&&['processing','unknown','success'].includes(f.status))));
  function signature(s,o,item,p) {
    return JSON.stringify([o.id,o.version,o.status,o.locked,item?.id||'',p.type,p.version,
      paymentFor(s,o),s.packages.filter(x=>x.orderId===o.id).map(x=>[x.id,x.status,x.queryStatus,x.version])]);
  }
  function validateMaterial(s,a,data,p) {
    const refs=[...new Set(data.attachmentIds||[])];fail(refs.length<=3,'每次最多提供3份材料');
    refs.forEach(r=>fail(get(s,'attachments',r).customerId===a.id,'材料不属于当前客户'));
    // Non-quality returns still require an explicit description; evidence is driven by the published rule.
    fail(!p.materialRequired||refs.length>0,'请添加本次申请需要的材料');return refs;
  }
  function validateInput(s,a,data,now) {
    permit(a,['customer']);const type=clean(data.type);fail(businessTypes.includes(type),'请选择明确的服务类型');
    const o=orderFor(s,a,data.orderId),p=policyFor(s,type,now),payment=paymentFor(s,o);
    fail(o.status!=='cancelled','订单已取消，请查看原取消或退款记录');
    const cleanData={type,orderId:o.id,reason:required(data.reason,'申请原因'),attachmentIds:[]};
    let item=null;
    if(afterTypes.includes(type)||type==='repair') {
      item=get(s,'items',data.itemId);fail(item.orderId===o.id,'商品不属于该订单');
      fail(Number(data.quantity||1)===1&&item.quantity===1,'本版按一件商品受理，请核对数量');
      fail(!occupied(s,item.id),'此商品已有办理记录，请继续原申请，避免重复受理');
      fail(payment?.queryStatus==='ok'&&payment.status==='paid','支付事实尚未核实，不能提交本次申请');
      const pk=packagesFor(s,item);fail(pk.length>0&&pk.every(x=>x.queryStatus==='ok'),'包裹状态尚未核实，请先查询');
      if(type==='return_refund'||type==='exchange')fail(pk.every(x=>x.status==='signed'),'商品尚未核实签收；未发货请使用订单取消，在途异常先核实');
      if(type==='refund_only')fail(pk.some(x=>x.status!=='awaiting_dispatch'),'未发货订单请使用取消订单入口');
      cleanData.itemId=item.id;cleanData.quantity=1;
      if(type==='exchange') {
        cleanData.targetVariant=required(data.targetVariant,'希望更换的规格',100);
        const product=get(s,'catalog',item.skuId),variant=product.variants.find(v=>v.label===cleanData.targetVariant);
        fail(variant,'请选择商品资料中存在的目标规格');fail(variant.stock>0,'目标规格当前无货，请联系人工确认替代方案');
      }
      if(type==='reship') {
        fail(['part','whole'].includes(data.missingScope),'请选择缺失的是配件还是整件商品');
        fail(pk.every(x=>x.status==='signed'),'该商品另有包裹未签收，需先核实，不直接按漏发补寄');
        cleanData.missingScope=data.missingScope;cleanData.missingName=required(data.missingName,'缺失内容',100);
        cleanData.missingQuantity=Number(data.missingQuantity);fail(Number.isInteger(cleanData.missingQuantity)&&cleanData.missingQuantity>=1&&cleanData.missingQuantity<=10,'缺失数量应为1–10');
      }
    }
    if(['cancel_order','change_address'].includes(type)) {
      fail(['awaiting_dispatch','awaiting_payment'].includes(o.status)&&!o.locked,'订单已出库或锁定，需人工核实能否拦截');
      fail(s.packages.filter(x=>x.orderId===o.id).every(x=>x.queryStatus==='ok'&&x.status==='awaiting_dispatch'),'最新仓储状态不满足自助变更条件');
      fail(payment&&payment.queryStatus==='ok'&&['paid','unpaid'].includes(payment.status),'支付状态尚未明确，请先核实，勿重复支付');
      fail(!s.applications.some(r=>r.orderId===o.id&&!['rejected','withdrawn'].includes(r.stage)),'此订单已有售后办理，请核对原事项');
      if(type==='change_address') {
        const ad=data.address||{};cleanData.address={name:required(ad.name,'收件人',40),phone:required(ad.phone,'联系电话',30),text:required(ad.text,'完整收货地址',300)};
        fail(/^[+\d][\d\s()-]{5,29}$/.test(cleanData.address.phone),'请核对联系电话');
        fail(cleanData.address.text.length>=6,'请填写包含省市区及街道的完整地址');
      }
    }
    if(type==='invoice') {
      fail(['individual','company'].includes(data.invoiceType),'请选择抬头类型');
      cleanData.invoiceType=data.invoiceType;cleanData.invoiceTitle=required(data.invoiceTitle,'发票抬头',100);
      cleanData.email=required(data.email,'接收邮箱',120);fail(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanData.email),'请核对接收邮箱');
      if(data.invoiceType==='company'){cleanData.taxId=required(data.taxId,'纳税人识别号',20).toUpperCase();fail(/^[A-Z0-9]{15,20}$/.test(cleanData.taxId),'请核对纳税人识别号');}
    }
    if(type==='price_protection')cleanData.comparison=required(data.comparison,'对比活动或价格依据',500);
    if(intakeTypes.includes(type))fail(payment?.queryStatus==='ok'&&payment.status==='paid','请先核实本人订单支付事实');
    cleanData.attachmentIds=validateMaterial(s,a,data,p);
    return {data:cleanData,order:o,item,policy:p,signature:signature(s,o,item,p)};
  }
  function findConversation(s,a,convId) {
    const conv=convId?get(s,'conversations',convId):s.conversations.find(x=>x.customerId===a.id&&x.status==='open');
    fail(conv&&conv.customerId===a.id,'请回到本人的咨询窗口');return conv;
  }
  function preview(s,a,data,now) {
    const checked=validateInput(s,a,data,now),conv=findConversation(s,a,data.conversationId);
    const prior=data.draftId?s.drafts.find(d=>d.id===data.draftId&&d.customerId===a.id&&!d.confirmedId):null;
    if(data.sourceCaseId)caseFor(s,a,data.sourceCaseId);
    const d={id:prior?.id||id(s,'DR'),sourceCaseId:data.sourceCaseId||'',customerId:a.id,conversationId:conv.id,data:checked.data,signature:checked.signature,policy:clone(checked.policy),createdAt:now,confirmedId:''};
    if(prior)s.drafts[s.drafts.indexOf(prior)]=d;else s.drafts.unshift(d);
    return clone(d);
  }
  function caseDetails(data){return [TYPES[data.type],data.itemId||data.orderId,data.targetVariant||data.missingName||''].filter(Boolean).join(' · ');}
  function refundRecord(s,c,applicationId,amountCents,now) {
    fail(Number.isSafeInteger(amountCents)&&amountCents>0,'退款金额须来自核定业务记录');
    const original=s.refunds.find(f=>f.caseId===c.id);if(original)return original;
    const f={id:id(s,'RF'),caseId:c.id,orderId:c.orderId,applicationId:applicationId||'',amountCents,status:'not_submitted',requestId:'',receiptVersion:0,queries:0,createdAt:now,source:'退款执行服务',simulated:true};s.refunds.push(f);return f;
  }
  function confirm(s,a,draftId,now) {
    permit(a,['customer']);const d=get(s,'drafts',draftId);fail(d.customerId===a.id,'申请草稿不属于当前客户');
    if(d.confirmedId)return {id:d.confirmedId,duplicate:true};
    const check=validateInput(s,a,d.data,now);fail(check.signature===d.signature,'订单或规则已变化，请重新预览确认');
    const conv=findConversation(s,a,d.conversationId),{type}=d.data;
    let c=makeCase(s,conv,type,caseDetails(d.data),{orderId:d.data.orderId,itemId:d.data.itemId||'',groupOwnerId:d.policy.team,nextAt:now+d.policy.feedbackHours*3600000},now,type+':'+(d.data.itemId||d.data.orderId)+(['cancel_order','change_address'].includes(type)?':'+d.id:''));
    fail(!c.applicationId&&!c.changeId,'此事项已有申请，请查看原记录');
    c.description=d.data.reason;c.type=type;c.title=caseDetails(d.data);c.policy=clone(d.policy);
    if(d.sourceCaseId&&d.sourceCaseId!==c.id){const source=caseFor(s,a,d.sourceCaseId);fail(!source.applicationId&&!source.changeId,'原事项已有业务申请');source.mergedInto=c.id;source.status='completed';source.stage='queried';c.history.push(...source.history);c.humanTouched ||= source.humanTouched;}
    if(type==='cancel_order'||type==='change_address') {
      const change={id:id(s,'CH'),type,caseId:c.id,orderId:check.order.id,customerId:a.id,data:clone(d.data),status:'success',requestId:id(s,'CHANGE'),receiptId:id(s,'CR'),source:'订单变更服务',simulated:true,createdAt:now};
      s.changes.push(change);c.changeId=change.id;d.confirmedId=change.id;
      check.order.version++;
      if(type==='change_address') {check.order.address=clone(d.data.address);c.result={kind:'order_change',valid:true,receiptId:change.receiptId};setStage(s,c,'completed',now,'收货地址已按本次确认内容更新。');}
      else {
        check.order.status='cancelled';s.packages.filter(x=>x.orderId===check.order.id).forEach(p=>{p.status='cancelled';p.version++;});
        const pay=paymentFor(s,check.order);
        if(pay.status==='paid'){refundRecord(s,c,'',pay.amountCents,now);c.groupOwnerId='finance';setStage(s,c,'awaiting_refund',now,'订单已取消，退款独立跟进；无需寄回商品。');}
        else {c.result={kind:'order_cancel',valid:true,receiptId:change.receiptId};setStage(s,c,'completed',now,'未支付订单已取消，不产生退款。');}
      }
    } else {
      const r={id:id(s,'AS'),caseId:c.id,customerId:a.id,...clone(d.data),stage:'pending_review',policy:clone(d.policy),amountCents:check.item&&['return_refund','refund_only'].includes(type)?check.item.paidCents:0,
        confirmedAt:now,history:[],review:null,simulated:true};
      s.applications.push(r);c.applicationId=r.id;d.confirmedId=r.id;
      setStage(s,c,'pending_review',now,`${TYPES[type]}申请已受理。${type==='exchange'?'目标规格：'+r.targetVariant+'。':type==='reship'?'缺失内容：'+r.missingName+'。':''}受理不代表审核通过或业务已执行。`);
    }
    event(s,a,'confirm',c.id,{draftId:d.id,type},now);return {id:d.confirmedId,caseId:c.id,duplicate:false};
  }
  function retrieve(s,query,now) {
    const q=normalize(query);
    const rows=s.knowledge.filter(k=>!k.disabled&&active(k.live,now)).map(k=>({k,score:(q.includes(normalize(k.live.question))?10:0)+k.live.keywords.filter(w=>q.includes(normalize(w))).length})).filter(r=>r.score>=2).sort((a,b)=>b.score-a.score);
    if(!rows.length||rows[1]&&rows[0].score===rows[1].score&&rows[0].k.live.answer!==rows[1].k.live.answer)return null;
    return rows[0].k;
  }
  function productMention(s,q) {return s.catalog.filter(p=>p.aliases.some(a=>q.includes(a)));}
  function orderMention(s,a,conv,q) {
    const ids=[...new Set((q.match(/\b(?:EC-)?SO[A-Z0-9]+\b/gi)||[]).map(x=>x.toUpperCase()))];
    if(ids.length>1)return null;
    if(ids.length===1){return orderFor(s,a,ids[0]);}
    return conv.context.orderId?s.orders.find(o=>o.id===conv.context.orderId&&o.customerId===a.id):null;
  }
  function itemMention(s,a,conv,q,order) {
    const ids=[...new Set((q.match(/\bEC-ITEM-[A-Z0-9]+\b/gi)||[]).map(x=>x.toUpperCase()))];
    const direct=s.items.filter(i=>ids.includes(i.id));
    if(ids.length){fail(ids.length===1&&direct.length===1,'请先核验本人商品归属');orderFor(s,a,direct[0].orderId);fail(!order||direct[0].orderId===order.id,'订单与商品不一致，请重新选择');return direct[0];}
    const products=productMention(s,q);
    let rows=s.items.filter(i=>s.orders.some(o=>o.id===i.orderId&&o.customerId===a.id));
    if(order)rows=rows.filter(i=>i.orderId===order.id);
    if(products.length)rows=rows.filter(i=>products.some(p=>p.id===i.skuId));
    else if(conv.context.itemId)rows=rows.filter(i=>i.id===conv.context.itemId);
    else return null;
    return rows.length===1?rows[0]:null;
  }
  function ask(s,conv,title,body,now,action='orders',fields={}) {
    const c=makeCase(s,conv,'clarification',title,{...fields,action},now,'clarify:'+title);
    message(s,conv,'assistant',body,now,[c.id],{action});return c;
  }
  function answer(s,conv,title,body,source,now,fields={}) {
    const c=makeCase(s,conv,'knowledge',title,fields,now,'knowledge:'+normalize(title));
    c.stage='answered';c.status='waiting_feedback';c.result={kind:'answer',valid:true,source,body,answeredAt:now};
    message(s,conv,'assistant',body,now,[c.id],{source});return c;
  }
  function queryCase(s,conv,title,body,result,now,fields={}) {
    const c=makeCase(s,conv,'query',title,fields,now,'query:'+title+':'+(fields.orderId||'')+':'+(fields.itemId||''));
    c.stage='queried';c.status='completed';c.completedAt=now;c.result={kind:'query',valid:true,...result};
    message(s,conv,'assistant',body,now,[c.id],{source:result.source});return c;
  }
  function queue(s,conv,c,now) {
    conv.mode='queue';conv.requestedAt ||= now;
    c.groupOwnerId ||= 'service';c.nextAt ||= now+s.settings.ticketHours*3600000;
    const online=s.settings.accepting&&s.staff.some(a=>a.role==='agent'&&a.available);
    return online?'已进入人工待接队列，接手后继续处理。':'当前没有在线客服，问题已保留在待办中，可从服务进度继续查看。';
  }
  function manual(s,conv,type,title,reason,now,fields={}) {
    const policy=s.policies.find(p=>p.id===type)?.live;
    if(policy&&active(policy,now))fields={...fields,groupOwnerId:policy.team,nextAt:now+policy.feedbackHours*3600000,policy:clone(policy)};
    const c=makeCase(s,conv,type,title,fields,now,type+':'+(fields.itemId||fields.orderId||title));
    c.description=reason;c.stage='investigating';c.status='open';c.humanRequired=true;
    message(s,conv,'assistant',reason+'\n'+queue(s,conv,c,now),now,[c.id]);return c;
  }
  function logistics(s,a,conv,q,now) {
    const order=orderMention(s,a,conv,q),item=itemMention(s,a,conv,q,order);
    if(!order&&!item)return ask(s,conv,'选择查询订单','请先选择订单或具体商品，再核对对应包裹。',now);
    const o=order||orderFor(s,a,item.orderId),pk=item?packagesFor(s,item):s.packages.filter(p=>p.orderId===o.id);
    const parts=pk.map(p=>`${p.itemIds.map(id=>get(s,'items',id).name).join('、')}：${packLabel(p)}。${p.queryStatus==='ok'?p.lastEvent:''}`);
    const deniesReceipt=/(没(?:有)?收到|没到|未收到|不是我签收|签收未收)/.test(q);
    const abnormal=pk.some(p=>p.queryStatus!=='ok')||/(停滞|不动|超期|丢失|丢了|催发货|一直没发)/.test(q)||deniesReceipt&&pk.some(p=>p.status==='signed')&&!!item;
    const fields={orderId:o.id,itemId:item?.id||'',groupOwnerId:'warehouse'};
    if(abnormal)return manual(s,conv,'logistics','物流核实',parts.join('\n')+'\n该诉求需要核实承运或仓储记录，签收记录不能代替本人收货确认。',now,fields);
    if(deniesReceipt&&!item&&pk.length>1&&pk.some(p=>p.status==='signed'))return ask(s,conv,'确认未收到的商品',parts.join('\n')+'\n本订单分包配送。请指出未收到的是哪件商品，避免把在途包裹当作漏发。',now,'orders',fields);
    return queryCase(s,conv,'物流进度',parts.join('\n')+'\n以上为本次查询结果；正常在途不代表漏发，也不承诺尚未核实的到货时间。',{source:'物流服务',queriedAt:now},now,fields);
  }
  function detectType(q) {
    if(/(仅退款|只退款|不退货.{0,5}退款)/.test(q))return 'refund_only';
    if(/换货|换一个|换一件|更换/.test(q))return 'exchange';
    if(/补发|补寄|缺配件|少配件|缺件|少件|漏发/.test(q))return 'reship';
    if(/退货|退款|想退|要退|申请退/.test(q))return 'return_refund';return '';
  }
  function routeMessage(s,a,conv,body,now) {
    const customer=message(s,conv,'customer',body,now);
    if(conv.mode==='human')return customer;
    const noHuman=body.replace(/人工智能/g,'').replace(/人工(?:客服)?(?:的)?(?:服务时间|工作时间|营业时间|上班时间|几点上班|几点下班)/g,'').replace(/(?:不用|不需要|不要|不想|无需)(?:转|找|联系)?人工(?:客服)?/g,'');
    if(/(?:转|找|联系)?人工(?:客服)?|真人客服|投诉/.test(noHuman)) {
      const c=manual(s,conv,/投诉/.test(noHuman)?'complaint':'human','人工服务',/投诉/.test(noHuman)?'已记录投诉诉求，将结合相关事项和处理依据复核。':'您可以直接转人工，无需先完成机器人表单。',now);
      customer.caseIds=[c.id];return customer;
    }
    if(/^(你好|您好|嗨|hi|hello|在吗|谢谢|感谢|好的|好|嗯|不用了|再见)[呀啊哦呢啦！!。 .?？]*$/i.test(body.trim())) {
      message(s,conv,'assistant',/(谢谢|感谢|再见)/.test(body)?'已保留当前服务进度。还有其他问题可以继续说明。':'请说明需要咨询或办理的问题。',now);return customer;
    }
    const clauses=body.split(/[，,。；;\n]+/).map(x=>x.trim()).filter(Boolean);const ids=[];
    for(let q of clauses) {
      if(/^(好的|好|谢谢|感谢|嗯)$/.test(q))continue;
      const products=productMention(s,q),product=products.length===1?products[0]:null;
      let order;try{order=orderMention(s,a,conv,q);itemMention(s,a,conv,q,order);}catch(error){const c=ask(s,conv,'核对订单归属','暂无法核对该订单与商品，请从本人订单中重新选择；未展示其他订单的个人信息。',now,'orders');ids.push(c.id);continue;}
      let c;
      if(/(清洗|清洁|保养|怎么洗)/.test(q)) {
        const k=retrieve(s,q,now);
        if(k&&(!product||!productMention(s,k.live.title+' '+k.live.question).some(p=>p.id!==product.id)))c=answer(s,conv,k.live.title,k.live.answer,`${k.live.source} · v${k.live.version}`,now);
        else if(product)c=answer(s,conv,product.name+'使用方法',product.care,product.source,now);
        else c=ask(s,conv,'确认咨询商品','请说明需要了解哪种商品的使用或清洗方法。',now,'products');
      } else if(/(怎么选|选哪|适合|推荐|通勤|容量|材质|规格区别|防水)/.test(q)&&!detectType(q)) {
        const match=product||s.catalog.find(p=>p.uses.some(w=>q.includes(w)));
        c=match?answer(s,conv,'商品选购建议',`${match.name}：${match.description}\n${match.attributes.join('；')}。\n可选规格：${match.variants.map(v=>v.label).join('、')}。未维护的性能暂不能确认。`,match.source,now):ask(s,conv,'确认选购用途','主要用于通勤喝水、分类收纳还是桌面整理？请说明用途，或选择具体商品再比较规格。',now,'products');
      } else if(/(多少钱|当前价格|库存|有货|还有货)/.test(q)) {
        c=product?queryCase(s,conv,product.name+'价格库存',`${product.name} 当前标价 ${amount(product.priceCents)}。\n${product.variants.map(v=>v.label+'：'+(v.stock>0?'有货':'暂时无货')).join('\n')}\n以实际下单时的价格和库存为准。`,{source:product.source,queriedAt:now},now):ask(s,conv,'选择查询商品','请选择需要查询价格或库存的商品。',now,'products');
      } else if(/(优惠|券|活动)/.test(q)) {
        const cp=s.coupons.find(cp=>q.toUpperCase().includes(cp.id)||q.includes(cp.name));
        if(/(用不了|不能用|我的|这单|这笔|资格|能用)/.test(q)||cp) {
          if(order&&cp){const r=couponResult(s,a,order.id,cp.id,now);c=queryCase(s,conv,'优惠资格查询',`${cp.name}：${r.eligible?'当前资格可用':'当前不适用'}。${r.reason}。`,r,now,{orderId:order.id});}
          else c=ask(s,conv,'核对优惠资格','请从优惠查询选择本人订单和优惠券。需要核对商品范围、门槛、有效期及能否叠加，不能只凭通用规则判断本次资格。',now,'coupon');
        } else {const k=retrieve(s,'优惠券使用规则',now);c=k?answer(s,conv,k.live.title,k.live.answer,k.live.source,now):manual(s,conv,'consultation','活动规则核实','当前活动规则缺少有效依据，需要人工核实。',now);}
      } else if(/(退货|退款|换货|售后).*(规则|政策|条件|怎么退|如何退)|怎么退|无理由|售后政策/.test(q)&&!/(想|要|帮我|申请).{0,4}(退货|退款|换货)/.test(q)) {
        const p=s.policies.find(p=>p.id==='return_refund')?.live;
        c=p&&p.enabled&&active(p,now)?answer(s,conv,'售后办理说明',`请先区分退货退款、仅退款、换货或缺件补发。是否适用由订单状态与商家审核确定，不能将“商品损坏”直接判作退款。\n退货${p.requiresReturn?'需按批准方案寄回并验收':'是否寄回按本次批准方案处理'}。运费：${p.feeBearer}。\n咨询不代表已提交申请。`,`${p.source} · v${p.version}`,now):manual(s,conv,'consultation','售后规则待核实','暂时没有有效的售后规则，需人工核实适用范围。',now);
      } else if(/(改地址|修改地址|改址|收货地址|取消订单|不想要这单|取消这单)/.test(q)) {
        const type=/(地址|改址)/.test(q)?'change_address':'cancel_order';
        if(!order)c=ask(s,conv,'选择需要变更的订单','请先选择需要取消或改址的订单。',now,'orders');
        else if(!['awaiting_dispatch','awaiting_payment'].includes(order.status)||order.locked)c=manual(s,conv,type,TYPES[type]+'核实','当前订单状态不满足自助变更条件，需要核实是否可以拦截；尚未修改订单。',now,{orderId:order.id,groupOwnerId:'warehouse'});
        else {c=makeCase(s,conv,type,TYPES[type],{orderId:order.id,description:q},now,type+':'+order.id);message(s,conv,'assistant','请在订单服务入口核对变更内容并预览确认。当前尚未提交，确认时会再次核对出库状态。',now,[c.id],{action:type,orderId:order.id});}
      } else if(/(发票|开票|价保|保价|降价|补差|维修|保修)/.test(q)) {
        const type=/(发票|开票)/.test(q)?'invoice':/(价保|保价|降价|补差)/.test(q)?'price_protection':'repair';
        c=makeCase(s,conv,type,TYPES[type],{orderId:order?.id||'',description:q},now,type+':'+(order?.id||'clarify'));
        message(s,conv,'assistant',`${TYPES[type]}需要核对本人订单及相应信息，请从服务入口预览确认。受理后由${type==='repair'?'售后':'财务'}责任组核实；当前不代表已开票、补差或完成维修。`,now,[c.id],{action:type,orderId:order?.id||''});
      } else if(/(售后|退款|换货|补发|退货).*(进度|到哪|多久|情况)/.test(q)) {
        const list=s.applications.filter(r=>r.customerId===a.id&&(!order||r.orderId===order.id));
        const body=list.length?list.map(r=>`${r.id} · ${TYPES[r.type]}：${STAGES[r.stage]||r.stage}。`).join('\n'):'暂未查到匹配的申请，请从服务进度选择原记录，或补充申请信息。';
        c=list.length?queryCase(s,conv,'售后进度',body,{source:'售后服务记录',queriedAt:now},now):ask(s,conv,'定位售后申请',body,now,'progress');
      } else if((detectType(q)||/(破损|裂了|坏了|漏水|少了一|缺了)/.test(q))&&!/(不要|不想|不需要|不用).{0,4}(退货|退款|换货|补发)/.test(q)&&!/(没|不)(有|是)?(破损|坏|漏水)/.test(q)) {
        const item=itemMention(s,a,conv,q,order),type=detectType(q);
        if(!item)c=ask(s,conv,'确认售后商品','请从订单中选择具体商品，并说明希望退货、换货还是补发；同名商品不能直接当作同一笔订单。',now,'orders');
        else {
          const existing=s.applications.find(r=>r.itemId===item.id&&!['withdrawn','rejected'].includes(r.stage));
          if(existing)c=queryCase(s,conv,'原售后记录',`该商品已有 ${existing.id} ${TYPES[existing.type]}申请，当前为${STAGES[existing.stage]}。请继续原申请或申请复核，避免重复受理。`,{source:'售后服务记录',queriedAt:now},now,{orderId:item.orderId,itemId:item.id});
          else {
            c=makeCase(s,conv,type||'aftersales',type?TYPES[type]:'确认处理方式',{orderId:item.orderId,itemId:item.id,description:q},now,(type||'aftersales')+':'+item.id);
            c.description=q;message(s,conv,'assistant',type?`已记录${item.name}的${TYPES[type]}诉求，请核对预填内容并确认申请。${type==='exchange'?'换货需要选择目标规格。':type==='reship'?'补发需要说明缺失内容，另包在途须先排除。':''}当前尚未正式提交。`:'已记录商品问题。您希望退货退款、换货，还是补发缺失配件？请先选择处理方式。',now,[c.id],{action:'aftersales',itemId:item.id,orderId:item.orderId});
          }
        }
      } else if(/(物流|快递|包裹|没(?:有)?收到|没到|未收到|停滞|催发货|发货|配送|派送|到哪)/.test(q)) c=logistics(s,a,conv,q,now);
      else if(/(订单|付款|支付|扣款|到账)/.test(q)) {
        if(!order)c=ask(s,conv,'选择查询订单','请选择本人订单，再核对支付或订单状态。',now,'orders');
        else {
          const snap=orderSnapshot(s,a,order.id),p=snap.payment;const text=`订单 ${order.id}：${payLabel(p)}。${p?.status==='paid'?'实付 '+amount(p.amountCents)+'。':''}`;
          if(!p||p.queryStatus!=='ok'||['unknown','pending'].includes(p.status)||/(扣了|付了|付款成功|重复扣款)/.test(q)&&p.status!=='paid')c=manual(s,conv,'payment','支付状态核实',text+'\n需要查询原支付记录，请勿重复付款；截图仅作为核实线索。',now,{orderId:order.id,groupOwnerId:'finance'});
          else c=queryCase(s,conv,'订单支付查询',text,{source:p.source,queriedAt:now},now,{orderId:order.id});
        }
      } else {
        const k=retrieve(s,q,now);
        if(k)c=answer(s,conv,k.live.title,k.live.answer,`${k.live.source} · v${k.live.version}`,now);
        else if(/^(不要|不用|不需要|不想)/.test(q)) {message(s,conv,'assistant','不会提交您未确认的业务操作。已有申请需要撤回时，请进入原申请办理。',now);continue;}
        else c=ask(s,conv,'澄清服务诉求','请补充需要了解的商品、订单或希望办理的事情；也可以直接请求人工。',now,'orders');
      }
      if(c)ids.push(c.id);
    }
    customer.caseIds=[...new Set(ids)];return customer;
  }
  function applicationFor(s,a,applicationId) {
    const r=get(s,'applications',applicationId);const c=caseFor(s,a,r.caseId);return {r,c};
  }
  function applicationStage(s,r,c,stage,now,body) {r.stage=stage;r.history.push({stage,at:now});setStage(s,c,stage,now,body);}
  function approve(s,a,applicationId,data,now) {
    permit(a,['manager']);const {r,c}=applicationFor(s,a,applicationId);
    fail(r.stage==='pending_review','当前申请不在待审核阶段');const reason=required(data.reason,'审核依据');
    if(c.dispute?.scope==='decision')c.dispute={...c.dispute,open:false,resolvedBy:a.id,resolvedAt:now};
    c.humanTouched=true;r.review={decision:'approved',actorId:a.id,reason,at:now,policyVersion:r.policy.version};
    if(intakeTypes.includes(r.type)) {applicationStage(s,r,c,'awaiting_fulfillment',now,'申请信息已核实，进入办理协调。尚未取得实际开票、补差或维修回执。');return r.id;}
    if(r.policy.requiresReturn) {
      fail(r.policy.returnAddress&&r.policy.returnContact&&r.policy.returnPhone&&r.policy.returnInstructions,'寄回指引不完整，不能要求客户寄回');
      if(!s.returns.some(x=>x.applicationId===r.id))s.returns.push({id:id(s,'RT'),applicationId:r.id,status:'awaiting_return',carrier:'',tracking:'',inspection:null,instructions:{address:r.policy.returnAddress,contact:r.policy.returnContact,phone:r.policy.returnPhone,fee:r.policy.feeBearer,notes:r.policy.returnInstructions}});
      c.groupOwnerId='warehouse';applicationStage(s,r,c,'awaiting_return',now,'审核通过。请查看本申请的寄回地址、收件信息和运费方案后寄回，不使用其他订单的地址。');
    } else if(['exchange','reship'].includes(r.type)) applicationStage(s,r,c,'awaiting_fulfillment',now,'审核通过，等待履约协调。尚未创建新包裹，也未提交退款。');
    else {refundRecord(s,c,r.id,r.amountCents,now);c.groupOwnerId='finance';applicationStage(s,r,c,'awaiting_refund',now,'审核通过，本申请无需寄回，等待财务提交退款。');}
    event(s,a,'approve',r.id,{reason},now);return r.id;
  }
  function reject(s,a,applicationId,data,now) {
    permit(a,['manager']);const {r,c}=applicationFor(s,a,applicationId);fail(r.stage==='pending_review','当前申请不可执行审核拒绝');
    const reason=required(data.reason,'拒绝依据');c.humanTouched=true;r.review={decision:'rejected',reason,actorId:a.id,at:now};
    applicationStage(s,r,c,'rejected',now,'申请暂未通过：'+reason+'。可在原申请补充说明并申请复核。');return r.id;
  }
  function inspection(s,a,applicationId,data,now,review=false) {
    permit(a,['warehouse','manager']);const {r,c}=applicationFor(s,a,applicationId);const t=s.returns.find(t=>t.applicationId===r.id);fail(t,'本申请不需要退回验收');
    fail(review?r.stage==='inspection_review':r.stage==='received',review?'当前没有待复核的验收':'请先核对仓库收货结果');
    fail(['pass','exception','reject'].includes(data.outcome),'请选择验收结论');if(!review)fail(data.outcome!=='reject','首次验收异常应先进入复核');
    const note=required(data.reason,'验收或复核依据');t.inspection={outcome:data.outcome,reason:note,actorId:a.id,at:now,review};c.humanTouched=true;
    if(data.outcome==='pass') {
      if(c.dispute?.scope==='decision')c.dispute={...c.dispute,open:false,resolvedBy:a.id,resolvedAt:now};
      t.status='passed';
      if(['exchange','reship'].includes(r.type))applicationStage(s,r,c,'awaiting_fulfillment',now,'验收'+(review?'复核':'')+'通过，进入履约协调；尚未寄出新商品。');
      else {refundRecord(s,c,r.id,r.amountCents,now);c.groupOwnerId='finance';applicationStage(s,r,c,'awaiting_refund',now,'验收'+(review?'复核':'')+'通过，已恢复至退款办理节点。');}
    } else if(data.outcome==='exception'){t.status='exception';applicationStage(s,r,c,'inspection_review',now,'验收存在差异：'+note+'。请补充材料，仓库将在原申请复核。');}
    else {t.status='exception';applicationStage(s,r,c,'rejected',now,'验收复核未通过：'+note+'。退回商品仍有后续处理责任，原记录继续保留。');}
    event(s,a,review?'resolveInspection':'inspection',r.id,{outcome:data.outcome,reason:note},now);return r.id;
  }
  function refundFor(s,a,refundId) {const f=get(s,'refunds',refundId),c=caseFor(s,a,f.caseId);return {f,c};}
  function refundStage(s,f,c,stage,now,body) {
    if(f.applicationId){const r=get(s,'applications',f.applicationId);r.stage=stage;r.history.push({at:now,stage});}
    setStage(s,c,stage,now,body);
  }
  function refundReceipt(s,a,data,now) {
    permit(a,['finance']);const {f,c}=refundFor(s,a,data.refundId);fail(f.requestId,'尚未向渠道提交退款');
    fail(data.requestId===f.requestId,'回执不属于原退款请求');fail(Number(data.amountCents)===f.amountCents,'回执金额与核定金额不一致');
    fail(['success','failed','unknown','processing'].includes(data.outcome),'退款回执状态无效');
    const receiptId=required(data.receiptId,'回执编号',100),reason=required(data.reason,'渠道核实依据');
    const version=Number(data.version);fail(Number.isInteger(version)&&version>=1,'回执版本无效');
    const payload={refundId:f.id,requestId:f.requestId,amountCents:f.amountCents,outcome:data.outcome,version};
    const previous=s.receipts.find(r=>r.id===receiptId);
    if(previous){fail(JSON.stringify(previous.payload)===JSON.stringify(payload),'同一回执编号内容冲突，需核实');return {duplicate:true};}
    s.receipts.push({id:receiptId,payload,reason,actorId:a.id,at:now,source:'退款渠道回执',simulated:true});c.humanTouched=true;
    if(version<=f.receiptVersion||f.status==='success') {event(s,a,'ignoredReceipt',f.id,{receiptId,reason:'过期回执或已成功，不倒退'},now);return {ignored:true};}
    f.receiptVersion=version;f.status=data.outcome;f.receiptId=receiptId;f.updatedAt=now;
    if(f.status==='success') {
      c.result={kind:'refund',valid:true,receiptId,requestId:f.requestId,amountCents:f.amountCents,source:'退款渠道回执'};
      refundStage(s,f,c,c.dispute?.open?'disputed':'completed',now,'退款渠道返回成功。渠道结果与用户是否确认到账分别记录；如有异议请继续原事项复核。');
    } else refundStage(s,f,c,{failed:'refund_failed',unknown:'refund_unknown',processing:'refund_processing'}[f.status],now,f.status==='unknown'?'退款结果尚未查明，继续查询原请求，不重复创建退款。':f.status==='failed'?'退款执行失败，原申请仍保留，需核实后使用原请求继续处理。':'退款仍在处理中，请以原请求的后续结果为准。');
    event(s,a,'refundReceipt',f.id,{receiptId,...payload},now);return {id:f.id};
  }
  const fingerprint=o=>JSON.stringify(o);
  function policyChecks(p) {
    return [
      ['服务类型',!!TYPES[p.type]],['处理责任组',['service','aftersales','warehouse','finance'].includes(p.team)],
      ['反馈时限',Number.isFinite(Number(p.feedbackHours))&&Number(p.feedbackHours)>0&&Number(p.feedbackHours)<=168],
      ['规则来源',!!clean(p.source)],['生效时间',Number.isFinite(Date.parse(p.effectiveAt))],
      ['有效期',!p.expiresAt||Date.parse(p.expiresAt)>Date.parse(p.effectiveAt)],
      ['寄回信息',!p.requiresReturn||!!(p.returnAddress&&p.returnContact&&p.returnPhone&&p.returnInstructions&&p.feeBearer)],
      ['服务路径限制',!p.requiresReturn||['return_refund','exchange','repair'].includes(p.type)],
      ['材料设置',typeof p.materialRequired==='boolean'],['服务启停',typeof p.enabled==='boolean']
    ].map(([name,passed])=>({name,passed}));
  }
  function knowledgeChecks(s,k,now) {
    const d=k.draft;if(!d)return [{name:'存在草稿',passed:false}];
    const sample=clone(s);const entry=sample.knowledge.find(x=>x.id===k.id);entry.live=clone(d);entry.disabled=false;
    return [
      {name:'标题、问题、答复与来源完整',passed:!!(clean(d.title)&&clean(d.question)&&clean(d.answer)&&clean(d.source))},
      {name:'当前规则有效',passed:active(d,now)},
      {name:'正例命中本条知识',passed:retrieve(sample,d.positive,now)?.id===k.id},
      {name:'反例不误命中',passed:retrieve(sample,d.negative,now)?.id!==k.id}
    ];
  }
  const HANDLERS={
    newConversation(s,a,d,now) {permit(a,['customer']);const conv={id:id(s,'CONV'),customerId:a.id,mode:'ai',ownerId:'',status:'open',createdAt:now,updatedAt:now,caseIds:[],messages:[],context:{orderId:'',itemId:''}};s.conversations.unshift(conv);return conv.id;},
    setContext(s,a,d) {permit(a,['customer']);const cv=findConversation(s,a,d.conversationId);const o=orderFor(s,a,d.orderId);if(d.itemId)fail(get(s,'items',d.itemId).orderId===o.id,'商品不属于本订单');cv.context={orderId:o.id,itemId:d.itemId||''};return clone(cv.context);},
    say(s,a,d,now) {permit(a,['customer']);const conv=findConversation(s,a,d.conversationId);fail(conv.status==='open','本次会话已结束，请新建咨询');return routeMessage(s,a,conv,required(d.body,'消息内容',4000),now).id;},
    requestHuman(s,a,d,now) {permit(a,['customer']);const cv=findConversation(s,a,d.conversationId);fail(cv.status==='open','请先进入未结束的咨询');if(cv.mode==='human')return cv.id;const c=manual(s,cv,'human','人工服务','您已请求人工接续，已有信息会一起交给客服。',now);return c.id;},
    queryOrder(s,a,d,now) {const snap=orderSnapshot(s,a,d.orderId);if(a.role==='customer'&&d.conversationId){const cv=findConversation(s,a,d.conversationId);const body=`订单 ${snap.orderId}：${payLabel(snap.payment)}。`;if(!snap.payment||snap.payment.queryStatus!=='ok'||['pending','unknown'].includes(snap.payment.status))manual(s,cv,'payment','支付记录核实',body+'请勿重复付款，将继续核实原支付记录。',now,{orderId:d.orderId,groupOwnerId:'finance'});else queryCase(s,cv,'订单支付查询',body,{source:snap.payment.source,queriedAt:now},now,{orderId:d.orderId});}return snap;},
    queryLogistics(s,a,d,now) {permit(a,['customer']);const cv=findConversation(s,a,d.conversationId);orderFor(s,a,d.orderId);const prior=clone(cv.context);cv.context={orderId:d.orderId,itemId:d.itemId||''};const c=logistics(s,a,cv,d.question||'查询物流',now);cv.context=prior;return c.id;},
    queryCoupon(s,a,d,now) {const r=couponResult(s,a,d.orderId,d.couponId,now);if(d.conversationId&&a.role==='customer'){const cv=findConversation(s,a,d.conversationId);queryCase(s,cv,'优惠资格查询',`${get(s,'coupons',d.couponId).name}：${r.eligible?'当前资格可用':'当前不适用'}。${r.reason}。`,r,now,{orderId:d.orderId});}return r;},
    addAttachment(s,a,d,now) {permit(a,['customer']);const name=required(d.name,'材料名称',100);fail(['image/png','image/jpeg','image/webp'].includes(d.mime),'仅支持PNG、JPEG和WebP图片');fail(Number.isInteger(d.size)&&d.size>0&&d.size<=512000,'单张图片不能超过500KB');fail(typeof d.dataUrl==='string'&&d.dataUrl.startsWith(`data:${d.mime};base64,`)&&d.dataUrl.length<=700000,'材料内容或大小无效');const asset={id:id(s,'FILE'),customerId:a.id,name,mime:d.mime,size:d.size,dataUrl:d.dataUrl,at:now};s.attachments.push(asset);return asset.id;},
    preview(s,a,d,now){return preview(s,a,d,now);},
    discardDraft(s,a,d) {permit(a,['customer']);const draft=get(s,'drafts',d.draftId);fail(draft.customerId===a.id&&!draft.confirmedId,'当前草稿不能取消');s.drafts=s.drafts.filter(x=>x.id!==draft.id);return draft.id;},
    confirm(s,a,d,now){return confirm(s,a,d.draftId,now);},
    prepareDraft(s,a,d,now) {
      const c=caseFor(s,a,d.caseId);working(a,c);fail(!c.applicationId&&!c.changeId,'已有申请请继续原记录');
      fail(businessTypes.includes(d.type),'请选择服务类型');
      c.prefill={type:d.type,orderId:c.orderId,itemId:c.itemId,reason:required(d.reason,'整理后的申请原因'),targetVariant:clean(d.targetVariant),missingName:clean(d.missingName),preparedBy:a.id,preparedAt:now};
      c.humanTouched=true;customerMessage(s,c,'客服已整理申请草稿，请从服务进度打开，核对商品、原因和材料后由您确认。',now);return clone(c.prefill);
    },
    approve(s,a,d,now){return approve(s,a,d.applicationId,d,now);},
    reject(s,a,d,now){return reject(s,a,d.applicationId,d,now);},
    requestSupplement(s,a,d,now) {
      permit(a,['manager','warehouse','finance','agent']);const {r,c}=applicationFor(s,a,d.applicationId);working(a,c);fail(['pending_review','inspection_review','awaiting_fulfillment'].includes(r.stage),'当前阶段不能补件');
      r.resumeStage=r.stage;r.supplementReason=required(d.reason,'补充资料说明');c.humanTouched=true;applicationStage(s,r,c,'waiting_customer',now,'需要补充：'+r.supplementReason+'。请在原申请提交，无需重新申请。');return r.id;
    },
    supplement(s,a,d,now) {
      permit(a,['customer']);const {r,c}=applicationFor(s,a,d.applicationId);fail(['waiting_customer','inspection_review'].includes(r.stage),'当前申请没有待补充材料');
      const refs=validateMaterial(s,a,{attachmentIds:d.attachmentIds||[]},{materialRequired:false});const note=required(d.reason,'补充说明');
      r.attachmentIds=[...new Set([...r.attachmentIds,...refs])];r.supplements ||= [];r.supplements.push({note,attachmentIds:refs,at:now});
      const stage=r.resumeStage||'inspection_review';delete r.resumeStage;applicationStage(s,r,c,stage,now,'补充材料已关联原申请，等待责任组继续核实。');return r.id;
    },
    requestReview(s,a,d,now) {
      permit(a,['customer']);const {r,c}=applicationFor(s,a,d.applicationId);fail(r.stage==='rejected','请在未通过的原申请中申请复核');
      fail(!s.applications.some(x=>x.id!==r.id&&(r.itemId?x.itemId===r.itemId:x.orderId===r.orderId&&x.type===r.type)&&!['rejected','withdrawn'].includes(x.stage)),'该商品已有其他进行中申请，请人工协调后再复核');
      const reason=required(d.reason,'复核理由');r.reviewRequest={reason,at:now};c.dispute={open:true,reason,at:now,scope:'decision'};
      const t=s.returns.find(x=>x.applicationId===r.id&&x.status==='exception');applicationStage(s,r,c,t?'inspection_review':'pending_review',now,'已进入原申请复核，不重新生成售后或退款。');return r.id;
    },
    submitReturn(s,a,d,now) {
      permit(a,['customer']);const {r,c}=applicationFor(s,a,d.applicationId);fail(r.stage==='awaiting_return','请先等待退货审核通过并查看寄回要求');
      const t=s.returns.find(x=>x.applicationId===r.id);fail(t,'没有寄回任务');t.carrier=required(d.carrier,'承运商',50);t.tracking=required(d.tracking,'寄回运单号',100);t.status='returning';t.submittedAt=now;
      applicationStage(s,r,c,'returning',now,'寄回运单已登记。承运方送达、仓库收货与验收通过分别跟进。');return t.id;
    },
    receiveReturn(s,a,d,now) {
      permit(a,['warehouse','manager']);const {r,c}=applicationFor(s,a,d.applicationId);fail(r.stage==='returning','当前没有在途退回包裹');const t=s.returns.find(x=>x.applicationId===r.id);t.status='received';t.receipt={id:id(s,'WH'),reason:required(d.reason,'仓库收货依据'),at:now,simulated:true};c.humanTouched=true;
      applicationStage(s,r,c,'received',now,'仓库已核对收货，仍需验收后才能按批准方案继续处理。');return t.id;
    },
    inspect(s,a,d,now){return inspection(s,a,d.applicationId,d,now,false);},
    resolveInspection(s,a,d,now){return inspection(s,a,d.applicationId,d,now,true);},
    submitRefund(s,a,d,now) {
      permit(a,['finance']);const {f,c}=refundFor(s,a,d.refundId);working(a,c);c.humanTouched=true;
      if(['processing','unknown','success'].includes(f.status))return {id:f.id,requestId:f.requestId,duplicate:true};
      fail(['not_submitted','failed'].includes(f.status),'当前退款不可提交');fail(['awaiting_refund','refund_failed'].includes(c.stage),'当前业务尚不具备退款条件');
      f.requestId ||= id(s,'PAYREQ');f.status='processing';f.submittedAt=now;refundStage(s,f,c,'refund_processing',now,'已按原业务记录提交退款，等待渠道回执；未确认成功前不重复创建请求。');return {id:f.id,requestId:f.requestId};
    },
    queryRefund(s,a,d,now) {
      permit(a,['customer','finance','agent','manager']);const {f,c}=refundFor(s,a,d.refundId);if(a.role!=='customer'){working(a,c);c.humanTouched=true;}fail(f.requestId,'退款尚未提交，请先查看待办理事项');
      f.queries++;f.lastQueriedAt=now;event(s,a,'queryRefund',f.id,{requestId:f.requestId,status:f.status},now);
      return {id:f.id,requestId:f.requestId,status:f.status,amountCents:f.amountCents,source:f.source,queriedAt:now};
    },
    recordRefundReceipt(s,a,d,now){return refundReceipt(s,a,d,now);},
    requestWithdrawal(s,a,d,now) {
      permit(a,['customer']);const {r,c}=applicationFor(s,a,d.applicationId);fail(!['completed','withdrawn','withdrawal_pending'].includes(r.stage),'当前不能重复申请撤回');
      required(d.reason,'撤回原因');const t=s.returns.find(x=>x.applicationId===r.id),f=s.refunds.find(x=>x.applicationId===r.id);
      const safe=!t||t.status==='awaiting_return';
      if(safe&&(!f||f.status==='not_submitted')) {r.withdrawal={status:'accepted',receiptId:id(s,'WD'),at:now,simulated:true};applicationStage(s,r,c,'withdrawn',now,'业务服务已确认撤回，未执行的申请占用已释放。');}
      else {r.resumeStage=r.stage;r.withdrawal={status:'pending',at:now};applicationStage(s,r,c,'withdrawal_pending',now,'申请存在寄回或退款执行记录，撤回需核实原任务；当前不释放占用，也不撤销已执行动作。');}
      return r.id;
    },
    denyWithdrawal(s,a,d,now) {
      permit(a,['manager']);const {r,c}=applicationFor(s,a,d.applicationId);fail(r.withdrawal?.status==='pending','没有待核实的撤回');const reason=required(d.reason,'撤回核实结论');r.withdrawal={...r.withdrawal,status:'denied',reason,actorId:a.id,at:now};const stage=r.stage==='withdrawal_pending'?r.resumeStage:r.stage;fail(stage,'缺少原办理阶段');delete r.resumeStage;c.humanTouched=true;applicationStage(s,r,c,stage,now,'撤回核实结果：'+reason+'。保留原办理结果，不重复创建申请。');return r.id;
    },
    feedback(s,a,d,now) {
      permit(a,['customer']);const c=caseFor(s,a,d.caseId);fail(typeof d.resolved==='boolean','请选择明确的解决反馈');c.feedback=d.resolved?'resolved':'unresolved';c.feedbackAt=now;
      if(d.satisfaction!==undefined){fail([1,2,3,4,5].includes(Number(d.satisfaction)),'满意度应为1–5');c.satisfaction=Number(d.satisfaction);}
      if(!d.resolved){c.dispute={open:true,at:now,reason:clean(d.reason)||'用户表示尚未解决'};c.stage='disputed';c.status='disputed';c.nextAt=now+s.settings.ticketHours*3600000;}
      else if(c.type==='knowledge'&&c.result?.valid){c.stage='completed';c.status='completed';c.completedAt=now;if(c.dispute)c.dispute.open=false;}
      else if(c.result?.valid&&['completed','queried'].includes(c.stage)&&c.dispute)c.dispute.open=false;
      event(s,a,'feedback',c.id,{resolved:d.resolved},now);return c.id;
    },
    resolveDispute(s,a,d,now) {
      permit(a,['agent','manager','finance','warehouse']);const c=caseFor(s,a,d.caseId);working(a,c);fail(c.dispute?.open,'当前没有未结异议');const reason=required(d.reason,'复核依据');fail(c.result?.valid,'业务尚无有效完成结果，不能关闭异议');
      c.humanTouched=true;c.dispute={...c.dispute,open:false,resolvedAt:now,resolvedBy:a.id,reason};setStage(s,c,'completed',now,'原事项复核已给出结论：'+reason+'。用户反馈与业务结论分别保留。');return c.id;
    },
    claim(s,a,d,now) {
      permit(a,['agent']);fail(a.available,'当前坐席不在线');const c=caseFor(s,a,d.caseId);fail(!c.ownerId||c.ownerId===a.id,'此事项已由其他客服负责');c.ownerId=a.id;c.humanTouched=true;
      for(const cid of c.conversationIds){const cv=get(s,'conversations',cid);fail(!cv.ownerId||cv.ownerId===a.id,'会话已有其他接待客服，请先转派');cv.ownerId=a.id;cv.mode='human';cv.claimedAt ||= now;for(const otherId of cv.caseIds){const other=get(s,'cases',otherId);if(other.status!=='completed'&&!other.ownerId){other.ownerId=a.id;other.humanTouched=true;}}}
      event(s,a,'claim',c.id,{},now);return c.id;
    },
    reply(s,a,d,now) {
      permit(a,['agent']);const c=caseFor(s,a,d.caseId);working(a,c);const body=required(d.body,'回复内容',4000);c.humanTouched=true;customerMessage(s,c,body,now);c.firstHumanReplyAt ||= now;return c.id;
    },
    note(s,a,d,now) {const c=caseFor(s,a,d.caseId);working(a,c);c.notes.push({body:required(d.body,'内部备注'),actorId:a.id,at:now});c.humanTouched=true;return c.id;},
    handoff(s,a,d,now) {
      const c=caseFor(s,a,d.caseId);working(a,c);const target=get(s,'staff',d.targetId);fail(target.role==='agent'&&target.id!==c.ownerId,'请选择其他接待客服');fail(!s.handoffs.some(h=>h.caseId===c.id&&h.status==='pending'),'已有待接收转派');
      const h={id:id(s,'HO'),caseId:c.id,fromId:c.ownerId,targetId:target.id,reason:required(d.reason,'转派说明'),status:'pending',createdAt:now,dueAt:now+s.settings.handoffMinutes*60000};s.handoffs.push(h);c.humanTouched=true;customerMessage(s,c,'正在协调接续人员；对方确认前，原客服继续负责跟进。',now);return h.id;
    },
    acceptHandoff(s,a,d,now) {
      permit(a,['agent']);const h=get(s,'handoffs',d.handoffId);fail(h.targetId===a.id&&h.status==='pending','当前没有可接收的转派');fail(now<=h.dueAt,'转派已超时，请原客服重新确认');const c=caseFor(s,a,h.caseId);h.status='accepted';h.acceptedAt=now;c.ownerId=a.id;h.relatedCaseIds=[c.id];
      for(const cid of c.conversationIds){const cv=get(s,'conversations',cid);cv.ownerId=a.id;cv.mode='human';for(const id0 of cv.caseIds){const other=get(s,'cases',id0);if(other.ownerId===h.fromId&&other.status!=='completed'){other.ownerId=a.id;other.humanTouched=true;if(!h.relatedCaseIds.includes(id0))h.relatedCaseIds.push(id0);}}}
      customerMessage(s,c,'接续客服已确认接收，已有资料与处理进度继续保留。',now);return h.id;
    },
    rejectHandoff(s,a,d,now) {permit(a,['agent']);const h=get(s,'handoffs',d.handoffId);fail(h.targetId===a.id&&h.status==='pending','没有可拒收的转派');h.status='rejected';h.reason=required(d.reason,'拒收原因');h.updatedAt=now;return h.id;},
    expireHandoffs(s,a,d,now) {permit(a,['manager']);let count=0;for(const h of s.handoffs)if(h.status==='pending'&&h.dueAt<now){h.status='expired';count++;event(s,a,'handoffExpired',h.caseId,{handoffId:h.id},now);}return count;},
    resolveLogistics(s,a,d,now) {
      permit(a,['warehouse','agent','manager']);const c=caseFor(s,a,d.caseId);working(a,c);fail(c.type==='logistics','此事项不是物流核实');const reason=required(d.reason,'物流核实依据');fail(['delivered','in_transit_explained','needs_action'].includes(d.outcome),'请选择核实结论');c.humanTouched=true;
      if(d.outcome==='needs_action'){c.groupOwnerId='aftersales';setStage(s,c,'investigating',now,'物流核实需要后续处理：'+reason+'。将继续确认补发或售后方案，尚未办结。');}
      else {c.result={kind:'logistics',valid:true,source:'人工核实记录',reason,at:now};setStage(s,c,'completed',now,'物流核实结论：'+reason);}
      return c.id;
    },
    followup(s,a,d,now) {const c=caseFor(s,a,d.caseId);working(a,c);const nextAt=Number(d.nextAt);fail(Number.isFinite(nextAt)&&nextAt>now,'下一次反馈时间须晚于当前时间');c.nextAt=nextAt;c.humanTouched=true;customerMessage(s,c,'后续安排：'+required(d.reason,'后续处理安排'),now);return c.id;},
    scheduleCallback(s,a,d,now) {const c=caseFor(s,a,d.caseId);working(a,c);fail(Number(d.nextAt)>now,'请选择未来的回访时间');const cb={id:id(s,'CB'),caseId:c.id,ownerId:a.id,nextAt:Number(d.nextAt),reason:required(d.reason,'回访目的'),status:'scheduled',at:now};s.callbacks.push(cb);c.nextAt=cb.nextAt;return cb.id;},
    callbackResult(s,a,d,now) {const cb=get(s,'callbacks',d.callbackId),c=caseFor(s,a,cb.caseId);working(a,c);fail(cb.status==='scheduled','此回访已有结果');fail(['reached','not_reached'].includes(d.outcome),'请选择回访结果');cb.status=d.outcome;cb.result=required(d.reason,'回访记录');cb.finishedAt=now;c.humanTouched=true;if(d.outcome==='not_reached'){fail(Number(d.nextAt)>now,'未联系上需安排下次反馈');c.nextAt=Number(d.nextAt);}return cb.id;},
    closeConversation(s,a,d,now) {
      const cv=get(s,'conversations',d.conversationId);if(a.role==='customer')fail(cv.customerId===a.id,'不是本人会话');else{permit(a,['agent','manager']);fail(a.role==='manager'||cv.ownerId===a.id,'请先接管会话');}
      fail(cv.caseIds.map(cid=>get(s,'cases',cid)).every(c=>c.status==='completed'||(c.groupOwnerId&&Number.isFinite(c.nextAt))),'未完事项必须保留责任和反馈安排');cv.status='closed';cv.closedAt=now;return cv.id;
    },
    resolvePayment(s,a,d,now) {
      permit(a,['finance']);const c=caseFor(s,a,d.caseId);fail(c.type==='payment','当前事项不是支付核实');const o=orderFor(s,a,c.orderId);
      fail(['paid','unpaid','pending','unknown','not_found','failed'].includes(d.outcome),'请选择核实结果');const reason=required(d.reason,'支付系统核实依据');let p=paymentFor(s,o);
      if(!p){p={id:id(s,'PAY'),orderId:o.id,amountCents:0,source:'支付服务',simulated:true,version:0};s.payments.push(p);}
      c.humanTouched=true;p.version++;p.queriedAt=now;
      if(d.outcome==='paid'){fail(o.status!=='cancelled'||p.status==='paid','已取消订单出现新的付款事实冲突，需专项核实');const total=s.items.filter(i=>i.orderId===o.id).reduce((n,i)=>n+i.paidCents,0);fail(Number(d.amountCents)===total,'支付金额与订单金额不一致');p.amountCents=total;if(o.status==='awaiting_payment'){o.status='awaiting_dispatch';o.version++;}}
      p.status=['paid','unpaid','pending','unknown'].includes(d.outcome)?d.outcome:'unknown';p.queryStatus=d.outcome==='failed'?'failed':d.outcome==='not_found'?'not_found':'ok';
      if(['paid','unpaid'].includes(d.outcome)){c.result={kind:'payment',valid:true,reason,source:'支付系统核实回执',at:now};setStage(s,c,'completed',now,'原支付记录核实结果：'+payLabel(p)+'。'+reason);}
      else setStage(s,c,'investigating',now,'支付记录仍需核实：'+payLabel(p)+'。请勿重复支付。');return c.id;
    },
    completeInquiry(s,a,d,now) {
      const c=caseFor(s,a,d.caseId);working(a,c);fail(['human','knowledge','clarification','consultation','complaint'].includes(c.type),'业务办理不能通过通用结案替代执行回执');const reason=required(d.reason,'处理依据与结论');
      c.humanTouched=true;c.result={kind:'manual',valid:true,reason,source:'人工处理记录',at:now};if(c.dispute)c.dispute={...c.dispute,open:false,resolvedAt:now};setStage(s,c,'completed',now,'处理结论：'+reason);return c.id;
    },
    savePolicy(s,a,d,now) {permit(a,['operator','manager']);const p=get(s,'policies',d.type);const allowed=['enabled','materialRequired','requiresReturn','feeBearer','team','feedbackHours','effectiveAt','expiresAt','source','returnAddress','returnContact','returnPhone','returnInstructions'];const draft=clone(p.live);for(const k of allowed)if(d[k]!==undefined)draft[k]=d[k];draft.feedbackHours=Number(draft.feedbackHours);draft.version=p.live.version+1;p.draft=draft;p.validation=null;event(s,a,'savePolicy',p.id,{},now);return p.id;},
    testPolicy(s,a,d,now) {permit(a,['operator','manager']);const p=get(s,'policies',d.type);fail(p.draft,'请先保存草稿');const checks=policyChecks(p.draft);p.validation={fingerprint:fingerprint(p.draft),checks,passed:checks.every(c=>c.passed),at:now};return clone(p.validation);},
    publishPolicy(s,a,d,now) {permit(a,['operator','manager']);const p=get(s,'policies',d.type);fail(p.draft&&p.validation?.passed&&p.validation.fingerprint===fingerprint(p.draft),'当前草稿尚未通过有效校验');p.history.push(clone(p.live));p.live=clone(p.draft);p.draft=null;p.validation=null;s.policyVersion++;event(s,a,'publishPolicy',p.id,{version:p.live.version},now);return p.id;},
    saveKnowledge(s,a,d,now) {
      permit(a,['operator']);let k=d.id?s.knowledge.find(k=>k.id===d.id):null;
      if(!k){k={id:id(s,'KB'),live:null,draft:null,validation:null,history:[],disabled:false};s.knowledge.push(k);}
      k.draft={version:(k.live?.version||0)+1,title:required(d.title,'知识标题',100),question:required(d.question,'标准问题',200),keywords:(Array.isArray(d.keywords)?d.keywords:clean(d.keywords).split(/[,，\n]/)).map(clean).filter(Boolean),answer:required(d.answer,'知识答复',4000),source:required(d.source,'依据来源',200),effectiveAt:required(d.effectiveAt,'生效时间',50),expiresAt:clean(d.expiresAt),positive:required(d.positive,'正例问法'),negative:required(d.negative,'反例问法')};
      fail(k.draft.keywords.length>0,'请填写匹配关键词');k.validation=null;event(s,a,'saveKnowledge',k.id,{},now);return k.id;
    },
    testKnowledge(s,a,d,now) {permit(a,['operator']);const k=get(s,'knowledge',d.id);const checks=knowledgeChecks(s,k,now);k.validation={fingerprint:fingerprint(k.draft),checks,passed:checks.every(c=>c.passed),at:now};return clone(k.validation);},
    publishKnowledge(s,a,d,now) {permit(a,['operator']);const k=get(s,'knowledge',d.id);fail(k.draft&&k.validation?.passed&&k.validation.fingerprint===fingerprint(k.draft),'当前知识草稿尚未通过正反例校验');if(k.live)k.history.push(clone(k.live));k.live=clone(k.draft);k.draft=null;k.validation=null;k.disabled=false;event(s,a,'publishKnowledge',k.id,{version:k.live.version},now);return k.id;},
    disableKnowledge(s,a,d,now) {permit(a,['operator']);const k=get(s,'knowledge',d.id);k.disabled=true;event(s,a,'disableKnowledge',k.id,{reason:required(d.reason,'停用原因')},now);return k.id;},
    flagCase(s,a,d,now) {const c=caseFor(s,a,d.caseId);permit(a,['agent','manager','operator']);if(a.role==='agent')working(a,c);fail(['knowledge','routing','query','workflow','handoff','notification'].includes(d.cause),'请选择实际问题根因');const gap={id:id(s,'GAP'),caseId:c.id,cause:d.cause,originalQuery:required(d.originalQuery,'原问题'),reason:required(d.reason,'问题说明'),status:'open',createdAt:now,ownerId:'operator',evidence:[]};s.gaps.push(gap);return gap.id;},
    planGap(s,a,d,now) {permit(a,['operator','manager']);const gap=get(s,'gaps',d.id);gap.plan=required(d.plan,'整改方案');gap.status='fixing';if(gap.cause==='knowledge'){const k=get(s,'knowledge',d.knowledgeId);gap.knowledgeId=k.id;gap.beforeVersion=k.live?.version||0;}else gap.ownerId=required(d.ownerId,'整改责任人',50);event(s,a,'planGap',gap.id,{},now);return gap.id;},
    verifyGap(s,a,d,now) {permit(a,['operator','manager']);const g=get(s,'gaps',d.id);fail(g.status==='fixing','请先登记整改方案');const evidence=required(d.evidence,'原问题复验依据');if(g.cause==='knowledge'){const k=get(s,'knowledge',g.knowledgeId);fail(k.live?.version>g.beforeVersion&&!k.disabled,'修订知识尚未发布');fail(retrieve(s,g.originalQuery,now)?.id===k.id,'原问题未命中新版知识');}else{fail(a.role==='manager','非知识问题由服务经理核对实际修复证据');fail(clean(d.recordId),'请填写修复验证记录号');}g.evidence.push({evidence,recordId:d.recordId||'',at:now,actorId:a.id});g.status='verified';return g.id;},
    notificationResult(s,a,d,now) {permit(a,['agent','manager']);const n=get(s,'notifications',d.id),c=caseFor(s,a,n.caseId);working(a,c);fail(['delivered','failed','unknown'].includes(d.status),'通知状态无效');n.status=d.status;n.checkedAt=now;n.reason=required(d.reason,'通知核实依据');if(d.status!=='delivered'){c.nextAt=now+s.settings.ticketHours*3600000;c.notificationFollowup=true;}return n.id;},
    presence(s,a,d) {permit(a,['agent']);get(s,'staff',a.id).available=!!d.available;return a.id;},
    serviceSettings(s,a,d,now) {permit(a,['manager']);fail(Number(d.ticketHours)>0&&Number(d.ticketHours)<=168,'跟进时间范围为1–168小时');fail(Number(d.handoffMinutes)>0&&Number(d.handoffMinutes)<=240,'转派接收时限范围为1–240分钟');s.settings={...s.settings,accepting:!!d.accepting,ticketHours:Number(d.ticketHours),handoffMinutes:Number(d.handoffMinutes)};event(s,a,'serviceSettings','settings',{},now);return clone(s.settings);}
  };
  function validateState(s) {
    fail(s&&s.schema===6&&Number.isSafeInteger(s.sequence)&&Number.isSafeInteger(s.revision)&&s.revision>=0,'数据版本不兼容');
    const tables=['customers','staff','catalog','orders','items','payments','packages','policies','knowledge','conversations','cases','drafts','applications','changes','returns','refunds','attachments','handoffs','notifications','gaps','events','receipts','callbacks'];
    for(const t of tables)fail(Array.isArray(s[t])&&s[t].every(x=>x&&typeof x.id==='string')&&new Set(s[t].map(x=>x.id)).size===s[t].length,'数据集合无效：'+t);
    for(const o of s.orders)fail(s.customers.some(c=>c.id===o.customerId),'订单客户关系无效');
    for(const i of s.items)fail(s.orders.some(o=>o.id===i.orderId)&&Number.isSafeInteger(i.paidCents)&&i.paidCents>=0&&i.quantity===1,'商品金额或归属无效');
    for(const p of s.packages)fail(s.orders.some(o=>o.id===p.orderId)&&p.itemIds.every(i=>s.items.some(x=>x.id===i&&x.orderId===p.orderId)),'包裹归属无效');
    for(const c of s.cases)fail(s.customers.some(x=>x.id===c.customerId)&&c.conversationIds.every(i=>s.conversations.some(cv=>cv.id===i&&cv.customerId===c.customerId)),'事项归属无效');
    for(const c of s.cases){if(c.orderId)fail(s.orders.some(o=>o.id===c.orderId&&o.customerId===c.customerId),'事项订单归属无效');if(c.itemId)fail(s.items.some(i=>i.id===c.itemId&&(!c.orderId||i.orderId===c.orderId)&&s.orders.some(o=>o.id===i.orderId&&o.customerId===c.customerId)),'事项商品归属无效');}
    for(const r of s.applications)fail(s.cases.some(c=>c.id===r.caseId&&c.customerId===r.customerId)&&s.orders.some(o=>o.id===r.orderId&&o.customerId===r.customerId),'申请归属无效');
    for(const f of s.refunds)fail(Number.isSafeInteger(f.amountCents)&&f.amountCents>0&&s.cases.some(c=>c.id===f.caseId),'退款金额或归属无效');
    return true;
  }
  function execute(state,who,command,data={},now=Date.now()) {
    fail(Number.isFinite(now),'操作时间无效');const s=clone(state);validateState(s);const a=person(s,who);const handle=Object.hasOwn(HANDLERS,command)?HANDLERS[command]:null;fail(typeof handle==='function','不支持的操作');
    const value=handle(s,a,clone(data),now);s.revision++;s.updatedAt=now;validateState(s);return {state:s,value};
  }
  function metrics(s,who,now=Date.now()) {
    const a=person(s,who);permit(a,['manager','operator','agent']);
    const rows=s.cases.filter(c=>!c.mergedInto);
    const resolved=rows.filter(c=>c.status==='completed'&&c.result?.valid&&!c.dispute?.open&&(!businessTypes.includes(c.type)||c.stage==='completed'));
    const independent=resolved.filter(c=>!c.humanTouched&&(c.type!=='knowledge'||c.feedback==='resolved'));
    return {total:rows.length,resolved:resolved.length,independent:independent.length,waitingFeedback:rows.filter(c=>c.stage==='answered'&&c.feedback==='pending').length,
      pending:rows.filter(c=>c.status!=='completed'&&!['withdrawn','rejected'].includes(c.stage)).length,overdue:rows.filter(c=>c.status!=='completed'&&c.nextAt<now&&!['withdrawn','rejected'].includes(c.stage)).length,
      disputes:rows.filter(c=>c.dispute?.open).length,human:rows.filter(c=>c.humanTouched).length,feedback:rows.filter(c=>c.feedback!=='pending').length,
      unknownRefunds:s.refunds.filter(f=>f.status==='unknown').length,caseIds:resolved.map(c=>c.id),independentIds:independent.map(c=>c.id),observedAt:now,from:s.createdAt};
  }
  function visible(s,who) {
    const a=person(s,who);if(a.role!=='customer')return clone(s);
    const state=clone(s),orders=new Set(s.orders.filter(o=>o.customerId===a.id&&a.verified).map(o=>o.id));
    state.customers=state.customers.filter(c=>c.id===a.id);state.orders=state.orders.filter(o=>orders.has(o.id));state.items=state.items.filter(i=>orders.has(i.orderId));state.payments=state.payments.filter(p=>orders.has(p.orderId));state.packages=state.packages.filter(p=>orders.has(p.orderId));
    state.cases=state.cases.filter(c=>c.customerId===a.id).map(c=>({...c,notes:[]}));const cases=new Set(state.cases.map(c=>c.id));
    state.conversations=state.conversations.filter(c=>c.customerId===a.id);state.applications=state.applications.filter(r=>r.customerId===a.id);state.drafts=state.drafts.filter(d=>d.customerId===a.id);state.attachments=state.attachments.filter(a0=>a0.customerId===a.id);
    state.changes=state.changes.filter(c=>c.customerId===a.id);state.refunds=state.refunds.filter(r=>cases.has(r.caseId));state.returns=state.returns.filter(r=>state.applications.some(a0=>a0.id===r.applicationId));state.handoffs=state.handoffs.filter(h=>cases.has(h.caseId));state.notifications=state.notifications.filter(n=>cases.has(n.caseId));state.callbacks=state.callbacks.filter(cb=>cases.has(cb.caseId));state.events=[];state.gaps=[];state.receipts=[];
    state.policies=state.policies.map(p=>({id:p.id,live:p.live}));state.knowledge=state.knowledge.filter(k=>!k.disabled&&k.live).map(k=>({id:k.id,live:k.live}));return state;
  }
  const api={execute,validateState,metrics,visible,orderSnapshot,couponResult,retrieve,policyChecks,occupied,packLabel,payLabel,TYPES,STAGES};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SupportV2Service=api;
})(typeof window!=='undefined'?window:globalThis);
