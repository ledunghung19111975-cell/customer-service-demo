/* Service SOP for the desk: node catalog, case-to-intent mapping, node progress and reply prefill.
   Read-only over recorded cases, conversations and applications; nothing here changes state. */
(function (root) {
  'use strict';
  const M=typeof module!=='undefined'&&module.exports?require('./model.js'):root.SupportV2Model;
  const SAY='say',ASK='ask',ACT='act';
  const SYSTEM='由系统查询，结果写入会话';
  const REVIEW='由售后主管审核，仓库与财务按回执推进';
  const TEAM_INTAKE='客户确认申请后转责任组办理';
  const GROUPS=[
    {name:'商品与咨询',intents:[
      {id:'general',name:'通用咨询',phrase:'的咨询',steps:[[ACT,'检索知识库',SYSTEM],[SAY,'答复并注明来源']]},
      {id:'product',name:'商品咨询',phrase:'想了解商品选购',steps:[[ASK,'确认咨询商品'],[ACT,'检索商品资料',SYSTEM],[SAY,'给出选购建议']]},
      {id:'usage',name:'使用说明',phrase:'想了解商品使用方法',steps:[[ASK,'识别商品'],[ACT,'检索知识库',SYSTEM],[SAY,'答复使用方法']]},
      {id:'stock',name:'价格库存',phrase:'想了解价格和库存',steps:[[ASK,'确认商品规格'],[ACT,'查询价格库存',SYSTEM],[SAY,'说明以下单为准']]},
      {id:'benefit',name:'权益介绍',phrase:'想了解优惠权益',steps:[[ASK,'识别权益类型'],[ASK,'核对本人资格','客户在「优惠查询」选择订单与优惠券后生成核对结果'],[SAY,'说明门槛与有效期']]}]},
    {name:'订单物流',intents:[
      {id:'order',name:'订单查询',phrase:'想查询订单',steps:[[ASK,'核对本人订单'],[ACT,'查询订单状态',SYSTEM],[SAY,'告知查询结果']]},
      {id:'logistics',name:'物流查询',phrase:'想查询物流进度',steps:[[ASK,'核对订单与包裹'],[ACT,'查询物流轨迹',SYSTEM],[SAY,'告知物流结果']]},
      {id:'address',name:'修改地址',phrase:'想修改收货地址',steps:[[ACT,'核对未出库',SYSTEM],[ASK,'客户预览确认','由客户在订单服务中预览并确认'],[ACT,'提交前复查','客户确认时系统再次核对出库状态']]},
      {id:'cancel',name:'取消订单',phrase:'想取消订单',steps:[[ACT,'核对订单状态',SYSTEM],[ASK,'客户确认取消','由客户在订单服务中预览并确认'],[ACT,'退款独立跟踪','由财务组跟进退款回执',true]]}]},
    {name:'售后服务',intents:[
      {id:'policy',name:'售后政策',phrase:'想了解售后规则',steps:[[ACT,'区分售后类型',SYSTEM],[ACT,'引用当前规则','规则待核实时，在「登记处理结论」中记录核实结果'],[SAY,'说明不代表已申请']]},
      {id:'refund',name:'退货退款',phrase:'想办理退货退款',steps:[[ASK,'核对订单商品'],[ASK,'收集原因与凭证','客户补充后，用「协助整理申请」整理资料'],[ASK,'客户确认申请','由客户在「服务进度」核对确认，客服不能代为提交'],[ACT,'审核与寄回',REVIEW,true],[ACT,'验收后退款',REVIEW,true]]},
      {id:'refundOnly',name:'仅退款',phrase:'想办理仅退款',steps:[[ASK,'核对订单商品'],[ASK,'收集原因与凭证','客户补充后，用「协助整理申请」整理资料'],[ASK,'客户确认申请','由客户在「服务进度」核对确认，客服不能代为提交'],[ACT,'审核退款',REVIEW,true]]},
      {id:'exchange',name:'换货',phrase:'想办理换货',steps:[[ASK,'核对订单商品'],[ASK,'选择目标规格','客户选定后，用「协助整理申请」填写目标规格'],[ASK,'客户确认申请','由客户在「服务进度」核对确认，客服不能代为提交'],[ACT,'审核与履约',REVIEW,true]]},
      {id:'reship',name:'缺件补发',phrase:'反馈商品缺件',steps:[[ASK,'确认缺失内容','客户说明后，用「协助整理申请」填写缺失内容'],[SAY,'排除另包在途'],[ACT,'审核补发','客户在「服务进度」确认补发申请后，由售后主管审核',true]]},
      {id:'repair',name:'维修服务',phrase:'想申请维修',steps:[[ASK,'核对商品'],[ASK,'记录故障描述','由客户在「服务进度」核对确认维修申请'],[ACT,'转售后组受理',TEAM_INTAKE,true]]},
      {id:'progress',name:'售后进度',phrase:'想查询售后进度',steps:[[ASK,'定位原申请'],[ACT,'查询办理阶段',SYSTEM],[SAY,'告知下次反馈']]}]},
    {name:'财务服务',intents:[
      {id:'invoice',name:'发票服务',phrase:'需要开具发票',steps:[[ASK,'核对订单'],[ASK,'收集抬头与邮箱','由客户在「服务进度」核对确认开票申请'],[ACT,'转财务组开具',TEAM_INTAKE,true]]},
      {id:'price',name:'价格保护',phrase:'想申请价格保护',steps:[[ASK,'核对订单'],[ASK,'收集比价依据','由客户在「服务进度」核对确认价保申请'],[ACT,'转财务组核实',TEAM_INTAKE,true]]}]},
    {name:'投诉升级',intents:[
      {id:'complaint',name:'投诉建议',phrase:'对这次服务不满意',steps:[[SAY,'安抚并致歉'],[ACT,'记录投诉诉求','在「内部备注」记录投诉要点'],[ACT,'升级主管复核','通过「转派接续客服」或主管复核跟进',true]]}]}
  ];
  const INTENTS={};
  GROUPS.forEach((g,gi)=>g.intents.forEach(it=>{INTENTS[it.id]={...it,group:gi};}));
  const COMMON={
    enter:{name:'用户进线',kind:ACT},greet:{name:'欢迎语',kind:SAY},intent:{name:'意图识别',kind:ACT},
    clarify:{name:'澄清追问',kind:ASK,how:'客户说明后，按诉求引导其在「我的订单」或「服务进度」办理；本事项用「登记处理结论」收口'},
    followup:{name:'告知后续安排',kind:SAY},confirm:{name:'确认是否解决',kind:SAY},rate:{name:'满意度邀评',kind:SAY},
    end:{name:'结束 · 小结归档',kind:ACT,how:'确认无其他问题后，点击「结束本次接待」'}
  };
  const NODE_KEY=/^(greet|clarify|followup|confirm|rate|[a-zA-Z]{2,20}\.[0-9])$/;
  const BY_TYPE={return_refund:'refund',refund_only:'refundOnly',exchange:'exchange',reship:'reship',repair:'repair',invoice:'invoice',price_protection:'price',cancel_order:'cancel',change_address:'address',logistics:'logistics',payment:'order',complaint:'complaint'};
  // Titles written by the router; clarification titles stay unmapped when they do not name a single intent.
  const BY_TITLE={'核对订单归属':'order','订单支付查询':'order','支付记录核实':'order','支付状态核实':'order','物流进度':'logistics','确认未收到的商品':'logistics',
    '确认咨询商品':'usage','保温杯清洁与保养':'usage','商品选购建议':'product','确认选购用途':'product','选择查询商品':'stock',
    '核对优惠资格':'benefit','优惠资格查询':'benefit','活动规则核实':'benefit','活动与优惠使用':'benefit',
    '售后办理说明':'policy','售后规则待核实':'policy','定位售后申请':'progress','售后进度':'progress','原售后记录':'progress'};
  const LATE_RETURN=['received','inspection_review','awaiting_refund','refund_processing','refund_unknown','refund_failed'];
  const ENDED=['rejected','withdrawn','withdrawal_pending'];
  const TEAMS={service:'一线客服',aftersales:'售后组',warehouse:'仓库组',finance:'财务组'};
  const ORDER_STATUS={partially_delivered:'部分签收',awaiting_dispatch:'待发货',awaiting_payment:'待支付',delivered:'已签收',cancelled:'已取消'};
  const PACKAGE_STATUS={signed:'已签收',in_transit:'运输中',awaiting_dispatch:'待出库',cancelled:'已取消'};
  const short=(text,n=28)=>{const v=String(text||'').replace(/\s+/g,' ').trim();return v.length>n?v.slice(0,n)+'…':v;};

  // Same wording rules the router uses to tell after-sales requests apart.
  function afterSalesOf(text) {
    if(/(仅退款|只退款|不退货.{0,5}退款)/.test(text))return 'refundOnly';
    if(/换货|换一个|换一件|更换/.test(text))return 'exchange';
    if(/补发|补寄|缺配件|少配件|缺件|少件|漏发/.test(text))return 'reship';
    if(/退货|退款|想退|要退|申请退/.test(text))return 'refund';
    return null;
  }
  function intentOf(c,question='',said='') {
    if(BY_TYPE[c.type])return BY_TYPE[c.type];
    if(c.title==='选择查询订单')return /包裹/.test(question)?'logistics':'order';
    if(c.title==='确认售后商品')return afterSalesOf(said);
    if(BY_TITLE[c.title])return BY_TITLE[c.title];
    if(/使用方法$|清洁|清洗|保养/.test(c.title))return 'usage';
    if(/价格库存$/.test(c.title))return 'stock';
    if(['knowledge','query','consultation'].includes(c.type))return 'general';
    return null;
  }
  function stepStates(id,c,app) {
    const n=INTENTS[id].steps.length,st=Array(n).fill('todo'),finished=c.status==='completed';
    const doneTo=k=>{for(let i=0;i<Math.min(k,n);i++)st[i]='done';};
    const later=(k,state)=>{for(let i=k;i<n;i++)if(st[i]!=='done')st[i]=state;};
    if(c.type==='clarification'){doneTo(finished?n:id==='benefit'?1:0);return st;}
    if(['knowledge','query'].includes(c.type)){doneTo(n);return st;}
    switch(id){
      case 'refund':case 'refundOnly':case 'exchange':
        if(!app){doneTo(c.prefill?2:c.itemId?1:0);return st;}
        doneTo(3);
        if(ENDED.includes(c.stage)){later(3,'skip');return st;}
        if(c.stage==='completed'){doneTo(n);return st;}
        if(id==='refund'&&LATE_RETURN.includes(c.stage))doneTo(4);
        later(3,'async');return st;
      case 'reship':case 'repair':case 'invoice':case 'price':
        if(!app){doneTo(id==='reship'?(c.prefill?.missingName?1:0):(c.itemId||c.orderId?1:0));return st;}
        doneTo(2);
        if(ENDED.includes(c.stage))later(2,'skip');else if(finished)doneTo(n);else later(2,'async');
        return st;
      case 'cancel':case 'address':
        if(c.changeId){doneTo(2);if(finished)doneTo(n);else later(2,'async');return st;}
        if(c.stage==='investigating'){doneTo(1);later(1,'async');return st;}
        doneTo(c.orderId?1:0);return st;
      case 'logistics':doneTo(finished?n:2);if(!finished)later(2,'async');return st; // abnormal parcels wait for the warehouse
      case 'order':doneTo(finished?n:1);if(!finished)later(1,'async');return st;
      case 'complaint':
        if(c.notes.length)st[1]='done';
        if(finished)doneTo(n);else st[2]='async';
        return st;
      default:doneTo(finished?n:1);return st;
    }
  }

  function build(s,caseId,opt={}) {
    const c=s.cases.find(x=>x.id===caseId);if(!c)return null;
    const fmt=opt.fmt||(ms=>new Date(ms).toISOString().slice(5,16).replace('T',' '));
    const convs=s.conversations.filter(v=>c.conversationIds.includes(v.id));
    const msgs=convs.flatMap(v=>v.messages).slice().sort((a,b)=>a.at-b.at);
    const mine=msgs.filter(m=>m.caseIds?.includes(c.id));
    const quote=mine.find(m=>m.role==='customer');
    const question=mine.filter(m=>m.role==='assistant').at(-1);
    const sent={};for(const m of mine)if(m.role==='agent'&&m.sopNode)sent[m.sopNode]=m;
    // After takeover the router no longer reads customer messages, so a reply after a question counts as the answer.
    const answered=key=>!!sent[key]&&msgs.some(m=>m.role==='customer'&&m.at>sent[key].at);
    const app=c.applicationId?s.applications.find(r=>r.id===c.applicationId):null;
    const order=s.orders.find(o=>o.id===c.orderId),item=s.items.find(i=>i.id===c.itemId);
    const product=item?s.catalog.find(p=>p.id===item.skuId):null;
    const iid=intentOf(c,question?.body||'',quote?.body||''),hit=iid?INTENTS[iid]:null;
    const nodes={},set=(key,status,note='',time='')=>{nodes[key]={status,note,time};};
    const customer=s.customers.find(x=>x.id===c.customerId);
    set('enter','done',`${customer?.name||'客户'} · 近期订单 ${s.orders.filter(o=>o.customerId===c.customerId).length} 笔`,convs[0]?fmt(convs[0].createdAt):'');
    const firstAgent=msgs.find(m=>m.role==='agent');
    if(firstAgent)set('greet','done',`${firstAgent.senderName||'人工客服'} 已接待`,fmt(firstAgent.at));
    else if(convs.length&&convs.every(v=>v.mode==='ai'))set('greet','done','AI 已接待');
    else set('greet','todo');
    const said=quote?`客户：“${short(quote.body)}”`:'';
    set('intent','done',hit?`命中「${hit.name}」${said?' · '+said:''}`:`未能识别具体诉求${said?' · '+said:''}`,quote?fmt(quote.at):'');
    if(hit)set('clarify','skip');
    else if(c.status==='completed')set('clarify','done','处理结论：'+short(c.result?.reason||'已登记处理结果',40));
    else if(answered('clarify'))set('clarify','done','客户已补充说明',fmt(sent.clarify.at));
    else set('clarify','todo',question?'待确认内容：'+question.body:c.type==='aftersales'?'已定位商品，待客户选择退货、换货或补发':c.type==='human'?'客户要求人工，诉求待确认':'');
    let steps=[],asking=c.type==='clarification'&&c.status!=='completed'&&question&&!Object.keys(sent).some(k=>k.startsWith(iid+'.'));
    if(hit){
      steps=stepStates(iid,c,app).map((status,i,all)=>{
        const key=iid+'.'+i,[kind,,how]=hit.steps[i];
        if(status==='todo'&&(kind===SAY&&sent[key]||kind===ASK&&answered(key)||kind===ACT&&how===SYSTEM&&all.slice(0,i).every(x=>x==='done')))status='done';
        all[i]=status;
        let note='';
        if(status==='done'&&sent[key])note=`${sent[key].senderName||'人工客服'} 已发送`;
        else if(status==='done'&&i===0&&item)note=`${item.name} · ${item.variant}`;
        else if(status==='done'&&i===0&&order)note=order.id;
        else if(status==='async')note=`${M.STAGES[c.stage]||c.stage} · ${TEAMS[c.groupOwnerId]||'责任组'}`;
        else if(status==='skip')note=M.STAGES[c.stage]||'已终止';
        if(app&&status==='done'&&hit.steps[i][1]==='客户确认申请')note='申请 '+app.id;
        if(asking&&status==='todo'){note='待确认内容：'+question.body;asking=false;}
        set(key,status,note,status==='done'&&sent[key]?fmt(sent[key].at):'');
        return {key,status};
      });
    }
    const hasAsync=steps.some(x=>x.status==='async');
    // Steps another team must finish always end with telling the customer what happens next.
    const needsFollowup=hasAsync||steps.some((x,i)=>x.status==='todo'&&hit.steps[i][3]);
    const callback=s.callbacks.find(cb=>cb.caseId===c.id&&cb.status==='scheduled');
    if(!needsFollowup)set('followup','skip');
    else if(sent.followup||callback)set('followup','done',callback?`已安排 ${fmt(callback.nextAt)} 回访`:'已告知后续安排',sent.followup?fmt(sent.followup.at):'');
    else set('followup','todo',Number.isFinite(c.nextAt)?`约定 ${fmt(c.nextAt)} 前反馈`:'');
    if(c.feedback!=='pending')set('confirm','done',c.feedback==='resolved'?'客户反馈：已解决':'客户反馈：未解决',c.feedbackAt?fmt(c.feedbackAt):'');
    else set('confirm',sent.confirm?'done':'todo','',sent.confirm?fmt(sent.confirm.at):'');
    if(c.satisfaction)set('rate','done',`客户评分 ${c.satisfaction} / 5`);
    else set('rate',sent.rate?'done':'todo',sent.rate?'已邀请评价':'',sent.rate?fmt(sent.rate.at):'');
    const closed=convs.length>0&&convs.every(v=>v.status==='closed');
    set('end',closed?'done':'todo',closed?'会话已结束':'',closed&&convs[0].closedAt?fmt(convs[0].closedAt):'');
    const path=['enter','greet','intent',...(hit?steps.map(x=>x.key):['clarify']),...(needsFollowup?['followup']:[]),'confirm','rate','end'];
    const current=path.find(k=>nodes[k].status==='todo')||'';
    const done=path.filter(k=>nodes[k].status==='done').length;

    const agent=s.staff.find(a=>a.id===(opt.agentId||c.ownerId));
    const prefill=current?prefillFor(current):null;
    function nameOf(key){if(COMMON[key])return COMMON[key].name;const [id,i]=key.split('.');return INTENTS[id].name+' · '+INTENTS[id].steps[Number(i)][1];}
    function kindOf(key){if(COMMON[key])return COMMON[key].kind;const [id,i]=key.split('.');return INTENTS[id].steps[Number(i)][0];}
    function howOf(key){if(COMMON[key])return COMMON[key].how||'';const [id,i]=key.split('.');return INTENTS[id].steps[Number(i)][2]||'';}
    function prefillFor(key) {
      const kind=kindOf(key),options=kind===ACT?[]:scripts(key),asked=kind===ASK&&!!sent[key];
      return {node:key,label:nameOf(key),kind,options,asked,guidance:howOf(key)||(options.length?'':kind===ACT?'该节点由系统查询或办理操作完成':'暂无可用模板，请按核实结果直接回复')};
    }
    function scripts(key) {
      const me=agent?.name||'客服',type=M.TYPES[c.type]||hit?.name||'',subject=M.TYPES[c.type]?M.TYPES[c.type]+'申请':'您反馈的问题';
      const variants=product?product.variants.map(v=>`${v.label}（${v.stock>0?'有货':'暂无货'}）`).join('、'):'';
      const due=Number.isFinite(c.nextAt)?fmt(c.nextAt):'';
      const what=item?item.name:'这件商品';
      switch(key){
        case 'greet':return hit?[`您好，我是${me}，已经看到您${hit.phrase}，接下来由我为您处理。`,`您好，我是${me}，关于${hit.name}的问题我来继续跟进，请稍等我核实一下。`]:[`您好，我是${me}，很高兴为您服务，请问有什么可以帮您？`,`您好～我是${me}，请问今天有什么可以帮您？`];
        case 'clarify':return c.type==='aftersales'?[`请问${what}您希望退货退款、换货，还是补发缺失配件呢？选好后我帮您整理申请。`,`为了准确处理，请问${what}您想怎么处理：退货退款、换货还是补发？`]:['为了更快帮您处理，请问是哪件商品、遇到了什么问题呢？您也可以在订单里直接选择具体商品。','不好意思，想跟您确认一下：您是想咨询商品、查询订单物流，还是办理售后呢？'];
        case 'followup':return [`${subject}已在办理中，当前状态：${M.STAGES[c.stage]||'处理中'}。${TEAMS[c.groupOwnerId]||'责任组'}${due?'会在 '+due+' 前':'会尽快'}给您反馈，进度也可以在「服务进度」查看。`,`${subject}已经交给${TEAMS[c.groupOwnerId]||'责任组'}跟进，有结果会第一时间通知您，也可以随时在「服务进度」查看。`];
        case 'confirm':return ['请问还有其他可以帮您的吗？','这个问题先帮您处理到这里，请问还有其他需要帮忙的吗？'];
        case 'rate':return ['不客气，感谢您的耐心！方便的话请在「服务进度」里为本次服务评价，祝您生活愉快～','感谢您的理解与配合！欢迎对本次服务做个评价，祝您生活愉快～'];
      }
      const [id,i]=key.split('.');const step=INTENTS[id].steps[Number(i)][1];
      switch(id+'.'+step){
        case 'product.确认咨询商品':case 'usage.识别商品':case 'stock.确认商品规格':return ['请问您想了解的是哪件商品呢？可以直接告诉我商品名称，或在订单里选择。'];
        case 'product.给出选购建议':return product?[`${product.name}：${product.description} 可选规格：${variants}。`]:[];
        case 'usage.答复使用方法':return product?[`${product.name}的使用与清洁：${product.care}`]:[];
        case 'stock.说明以下单为准':return product?[`${product.name}当前标价 ${M.amount(product.priceCents)}，${variants}。以实际下单时的价格和库存为准。`]:[];
        case 'benefit.识别权益类型':return ['请问您想了解的是哪一类优惠呢？优惠券、活动还是会员权益？'];
        case 'benefit.核对本人资格':return ['请在「优惠查询」中选择这笔订单和想用的优惠券，我帮您核对商品范围、使用门槛和有效期。'];
        case 'benefit.说明门槛与有效期':return ['优惠是否可用以订单页实际显示为准，下单时记得勾选对应优惠券；资格查询不会自动改价或补差。'];
        case 'order.核对本人订单':case 'logistics.核对订单与包裹':return order?[`帮您找到订单 ${order.id}（${s.items.filter(x=>x.orderId===order.id).map(x=>x.name).join('、')}），是这一笔吗？`]:[`请问是哪一笔订单呢？您可以在「我的订单」里直接选择，我帮您${id==='logistics'?'查对应包裹':'核对订单状态'}。`];
        case 'order.告知查询结果':return order?[`帮您查到了：订单 ${order.id} 当前状态为${ORDER_STATUS[order.status]||order.status}。`]:[];
        case 'logistics.告知物流结果':{const packs=order?s.packages.filter(p=>p.orderId===order.id&&(!item||p.itemIds.includes(item.id))):[];return packs.length?[`帮您查到了：${packs.map(p=>`${p.itemIds.map(x=>s.items.find(i=>i.id===x)?.name).join('、')}${PACKAGE_STATUS[p.status]||p.status}，${p.lastEvent}`).join('；')}`]:[];}
        case 'address.客户预览确认':case 'cancel.客户确认取消':return ['请在订单服务中核对变更内容并确认，提交时会再次核对订单是否已出库。'];
        case 'policy.说明不代表已申请':return ['退货、仅退款、换货和补发的条件不同，以订单状态和审核结果为准；咨询不代表已提交申请，需要办理时我可以帮您整理。'];
        case 'refund.核对订单商品':case 'refundOnly.核对订单商品':case 'exchange.核对订单商品':case 'repair.核对商品':return ['请问是哪一件商品需要办理呢？可以在订单里直接选择具体商品。'];
        case 'refund.收集原因与凭证':case 'refundOnly.收集原因与凭证':return [`非常抱歉给您带来不便！麻烦说明一下${what}的具体问题，方便的话拍张照片，我帮您整理${type}申请，提交前会请您核对确认。`,`抱歉让您遇到这个问题。方便发一张${what}问题位置的照片吗？我来帮您整理申请。`];
        case 'exchange.选择目标规格':return [variants?`可以为您办理换货。请问想换成哪个规格呢？目前可选：${variants}。`:'可以为您办理换货，请问想换成哪个规格呢？'];
        case 'refund.客户确认申请':case 'refundOnly.客户确认申请':case 'exchange.客户确认申请':return c.prefill?[`已为您整理好${type}申请：${what}，原因「${c.prefill.reason}」。请在「服务进度」中打开申请，核对商品、原因和材料后由您确认提交。`]:c.itemId?[`请在「服务进度」中打开${type}申请，核对商品、原因和材料后由您确认提交。`]:[`请在「我的订单」中选择这件商品发起${hit.name}申请，核对商品、原因和材料后由您确认提交。`];
        case 'reship.确认缺失内容':return ['抱歉给您添麻烦了！请问缺少的是哪个配件、数量多少呢？'];
        case 'reship.排除另包在途':{
          const packs=order?s.packages.filter(p=>p.orderId===order.id):[];
          if(!packs.length)return [];
          const moving=packs.some(p=>!['signed','cancelled'].includes(p.status));
          return [`帮您核对了这笔订单的包裹：${packs.map(p=>`${p.itemIds.map(x=>s.items.find(i=>i.id===x)?.name).join('、')}${PACKAGE_STATUS[p.status]||p.status}`).join('；')}。${moving?'还有包裹在途，建议送达后再确认是否缺件。':'没有另包在途，可以为您登记补发。'}`];
        }
        case 'repair.记录故障描述':return ['请描述一下故障情况，方便的话附一张照片，我帮您登记并转售后组核实；受理不代表已完成维修。'];
        case 'progress.定位原申请':return ['请问是哪一笔售后申请呢？您可以在「服务进度」里选择原申请。'];
        case 'progress.告知下次反馈':return app?[`您的${M.TYPES[app.type]||''}申请 ${app.id} 目前：${M.STAGES[app.stage]||app.stage}${due?'，我们会在 '+due+' 前给您反馈':''}。`]:[];
        case 'invoice.核对订单':case 'price.核对订单':return ['请问是哪一笔订单呢？可以在「我的订单」里直接选择。'];
        case 'invoice.收集抬头与邮箱':return ['请提供发票抬头、税号（企业必填）和接收邮箱，我帮您提交开票申请。'];
        case 'price.收集比价依据':return ['请提供降价活动页面或截图作为比价依据，我帮您提交价保申请。'];
        case 'complaint.安抚并致歉':return ['非常抱歉给您带来不好的体验！我会完整记录您的问题，请您具体说说发生了什么。','很抱歉让您失望了，您的意见我们非常重视，麻烦说一下具体情况，我来跟进。'];
        default:return [];
      }
    }

    // Rows in display order; everything before the current node sits on the lit part of the axis.
    const label=key=>COMMON[key]?COMMON[key].name:INTENTS[key.split('.')[0]].steps[Number(key.split('.')[1])][1];
    const shown=key=>({...nodes[key],key,name:label(key),status:key===current?'current':nodes[key].status==='todo'?'next':nodes[key].status});
    const groups=GROUPS.map((g,gi)=>({name:g.name,hit:!!hit&&hit.group===gi,count:g.intents.length,
      intents:g.intents.map(it=>({id:it.id,name:it.name,hit:it.id===iid,status:!hit?'pending':it.id===iid?'done':'dim',
        stepsText:it.steps.map(x=>x[1]).join(' → '),steps:it.id===iid?steps.map(x=>shown(x.key)):[]}))}));
    const stages=[
      {num:'01',title:'接入',nodes:[shown('enter'),shown('greet')]},
      {num:'02',title:'识别',nodes:[shown('intent'),shown('clarify')]},
      {num:'03',title:'分流办理',meta:`${GROUPS.length} 类 · ${Object.keys(INTENTS).length} 个意图`,groups},
      {num:'04',title:'收尾',nodes:['followup','confirm','rate','end'].map(shown)}
    ];
    // The rail is solid up to the furthest node reached: the current node, a finished node or the matched intent.
    const flow=[...stages[0].nodes,...stages[1].nodes,...groups.flatMap(g=>[g,...g.intents.flatMap(it=>[it,...it.steps])]),...stages[3].nodes];
    const reached=flow.reduce((n,r,i)=>r.status==='current'||r.status==='done'&&r.key||r.hit?i:n,-1);
    flow.forEach((r,i)=>{r.lit=!current||i<=reached;});
    stages[0].lit=false;stages[1].lit=stages[1].nodes[0].lit;stages[2].lit=groups[0].lit;stages[3].lit=stages[3].nodes[0].lit;
    const last=msgs.at(-1);
    return {caseId:c.id,intent:hit?{id:hit.id,name:hit.name,group:GROUPS[hit.group].name}:null,path,nodes,current,currentLabel:current?nameOf(current):'',
      done,total:path.length,stages,prefill,awaitingCustomer:last?.role==='agent'};
  }
  const api={GROUPS,INTENTS,NODE_KEY,intentOf,build};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SupportV2Sop=api;
})(typeof window!=='undefined'?window:globalThis);
