// 产出 Agent：Codex
(function(root){
  'use strict';
  const V=root.SupportViews,{e,b,pill,date,field,options,empty,icon}=V;
  const statusNames={open:'待跟进',waiting_customer:'待客户补充',completed:'处理结果已记录',awaiting_review:'待经理审批',approved:'申请已批准',rejected:'申请未通过',withdrawal_requested:'撤回待确认',withdrawn:'已撤回',awaiting_return:'待寄回',in_transit:'寄回在途',received:'仓库已收件',passed:'验收通过',review_required:'验收待复核',not_submitted:'尚未提交退款',pending:'处理中',succeeded:'模拟退款成功',failed:'失败',unknown:'结果未知',sent:'已发送',proposed:'待接收',accepted:'已接收',rejected_handoff:'已拒接',expired:'接收已超时'};
  const feedbackNames={pending:'待客户确认',confirmed:'客户已确认解决',disputed:'客户仍需帮助'};
  const money=n=>Number.isSafeInteger(n)?root.SupportCommerce.money(n):'待核实';
  const ruleText=rule=>typeof rule==='string'?rule:rule?[rule.title||'商品售后规则',rule.version?'v'+rule.version:'',rule.source||rule.ruleSource||'',rule.answer||rule.body||''].filter(Boolean).join(' · '):'请人工核实规则依据';
  const name=value=>statusNames[value]||value||'尚未建立';
  const line=(label,value,tone='')=>`<div class="service-axis"><span>${e(label)}</span>${pill(value,tone)}</div>`;
  function nextStep(d){
    if(d.request?.status==='withdrawal_requested')return '确认撤回条件及原执行状态，等待处理反馈。';
    if(d.request?.status==='withdrawn')return '申请已撤回；其他服务事项继续单独跟进。';
    if(d.request?.status==='rejected')return '查看未通过原因；如仍需帮助，可补充情况请客服继续核实。';
    if(d.request?.status==='waiting_customer')return '请补充审批要求的资料，客服继续原申请核对。';
    if(d.request?.status==='awaiting_review')return '等待服务经理核对申请与材料。';
    if(d.return?.status==='awaiting_return')return '按客服说明寄回本申请商品，填写寄回运单号。';
    if(d.return?.status==='in_transit')return '等待仓库收件与验收，寄回轨迹持续保留。';
    if(d.return?.status==='received')return '仓库已收件，等待商品验收。';
    if(d.return?.status==='review_required')return '验收存在待核实问题，客服继续人工复核。';
    if(d.refund?.status==='unknown')return '核实原退款请求的结果，等待明确回执。';
    if(d.refund?.status==='pending')return '退款请求已提交，等待原请求回执。';
    if(d.refund?.status==='failed')return '原退款请求失败，客服核实失败原因和下一步。';
    if(d.refund?.status==='succeeded')return '本地模拟退款已有成功回执，请单独确认实际到账与问题是否解决。';
    if(d.return?.status==='passed')return '商品验收通过，客服按审批金额提交模拟退款。';
    return d.status==='completed'?'处理结果已记录，请确认是否解决。':'客服继续核实该事项，并在约定时间反馈。';
  }
  V.serviceCard=function(d,mobile=false){
    const stage=d.request?name(d.request.status)+(d.return?' · '+name(d.return.status):'')+(d.refund&&d.refund.status!=='not_submitted'?' · '+name(d.refund.status):''):name(d.status);
    return `<button type="button" class="${mobile?'phone-progress-card':'progress-card'} service-progress-card" data-action="service-detail" data-id="${e(d.caseId||d.id)}"><div class="row between"><strong>${e(d.title)}</strong>${icon('arrow',15)}</div>${d.itemName?`<small>${e(d.itemName)} · ${e(d.orderId)}</small>`:`<small>${e(d.orderId||d.caseId||d.id)}</small>`}<span>${e(stage)}</span><small>负责人：${e(d.ownerName||'服务组待分配')} · 下次反馈：${d.dueAt?date(d.dueAt,true):'待安排'}</small>${pill(d.status==='completed'||d.feedback==='disputed'?feedbackNames[d.feedback]||'待客户确认':'尚未形成可确认结果',d.feedback==='confirmed'?'good':'')}</button>`;
  };
  function summary(d){
    return `<div class="row between"><h3>${e(d.title)}</h3>${pill(name(d.status))}</div><p class="muted">${e(d.caseId||d.id)}${d.orderId?' · '+e(d.orderId):''}${d.itemName?' · '+e(d.itemName):''}</p><div class="service-axes">${line('服务事项',name(d.status))}${d.request?line('申请审批',name(d.request.status))+line('寄回验收',name(d.return?.status))+line('退款执行',name(d.refund?.status||'not_submitted'),['failed','unknown'].includes(d.refund?.status)?'warn':'')+line('通知',d.notification?.status==='pending'?'待发送':name(d.notification?.status||'pending')):''}${d.handoff?line('交接',d.handoff.status==='pending'?'待接收':d.handoff.status==='rejected'?'已拒接':name(d.handoff.status)):''}${line('客户反馈',d.status==='completed'||d.feedback==='disputed'?feedbackNames[d.feedback]||'待客户确认':'尚未形成可确认结果',d.feedback==='confirmed'?'good':'')}</div><dl class="sop-facts"><dt>下一步</dt><dd>${e(nextStep(d))}</dd><dt>负责人</dt><dd>${e(d.ownerName||'服务组待分配')}</dd><dt>下次反馈时间</dt><dd>${d.dueAt?date(d.dueAt,true):'待安排'}</dd>${d.reason?`<dt>当前说明</dt><dd>${e(d.reason)}</dd>`:''}</dl>${d.request?`<div class="result-note"><strong>商品级退货退款</strong><p>${e(d.itemName||d.request.itemName||'关联商品')} · ${e(d.request.quantity)} 件 · 审批金额 ${money(d.request.approvedCents)}</p><p>申请原因：${e(d.request.reason||d.reason||'见申请记录')}</p>${d.request.review?.reason||d.request.reviewReason?`<p>审批反馈：${e(d.request.review?.reason||d.request.reviewReason)}</p>`:''}${d.return?.trackingNumber?`<p>寄回运单：${e(d.return.trackingNumber)}</p>`:''}${d.refund?.requestId?`<p>原退款请求：${e(d.refund.requestId)}${Number.isSafeInteger(d.refund.amountCents)?' · '+money(d.refund.amountCents):''}</p>`:''}<small>业务结果来自本地模拟；退款回执与实际到账、客户满意分别确认。</small></div>`:''}`;
  }
  function summaryValues(value){
    if(Array.isArray(value))return value.map(summaryValues).filter(Boolean).join('；');
    if(value&&typeof value==='object')return Object.entries(value).map(([k,v])=>k+'：'+summaryValues(v)).join('；');
    return value===null||value===undefined?'':String(value);
  }
  function handoffSummary(d){
    const h=d.handoffSummary;if(!h)return '<p class="sop-hint">尚无交接摘要。</p>';
    const titles={identity:'客户身份',customerName:'客户',orderId:'订单',itemName:'商品',intent:'客户诉求',facts:'已查询事实',attempted:'已尝试动作',failures:'失败与异常',missing:'待补资料',next:'下一步'};
    return `<details class="service-handoff-summary"><summary>人工交接摘要</summary><dl class="sop-facts">${Object.entries(titles).map(([key,title])=>`<dt>${e(title)}</dt><dd>${e(summaryValues(h[key])||'暂无记录')}</dd>`).join('')}</dl><small>依据客户原话、查询与办理记录整理。</small></details>`;
  }
  V.servicePanel=function(s,d,ui,actor={role:'customer',id:'C001'}){
    const customer=actor.role==='customer',owned=actor.role==='agent'&&d.ownerId===actor.id,request=d.request,attrs=`data-case="${e(d.caseId||d.id)}"`;
    const offline=customer&&root.SupportDomain.customerConnection(s,actor.id)!=='online',disabled=offline?'disabled':'';
    if(d.service===false)return `<section class="service-panel">${summary(d)}<div class="result-note"><strong>事项结果与依据</strong><p>${e(d.result?.publicText||'尚无有效结果，继续人工核对。')}</p>${d.result?.evidence?.citation?`<small>知识 ${e(d.result.evidence.citation.id)} v${e(d.result.evidence.citation.version)} · ${e(d.result.evidence.citation.source)}</small>`:d.result?.evidence?.snapshot?`<small>${e(d.result.evidence.snapshot.source||'本地模拟业务查询')} · 事实状态 ${e(d.result.evidence.snapshot.queryStatus||'已核对')}</small>`:''}</div></section>`;
    let actions='';
    if(customer){
      if(request&&d.status!=='completed'&&['waiting_customer','awaiting_review','approved','withdrawal_requested'].includes(request.status)){
        actions+=b('补充资料 / 消息','service-supplement',request.id,'small',attrs+' '+disabled);
        if(d.return?.status==='awaiting_return'&&request.status==='approved')actions+=b('填写寄回运单','service-return',request.id,'small primary',attrs+' '+disabled);
        if(['awaiting_review','waiting_customer','approved'].includes(request.status)&&d.refund?.status!=='succeeded')actions+=b('申请撤回','service-withdrawal',request.id,'small text',attrs+' '+disabled);
      }else if(d.status!=='completed')actions+=b('继续补充消息','service-chat',d.caseId||d.id,'small',disabled);
      if(d.status==='completed'&&d.feedback!=='confirmed')actions+=b('确认问题已解决','confirm-case',d.caseId||d.id,'small',disabled);
      if(d.status==='completed')actions+=b('仍需帮助','service-dispute',d.caseId||d.id,'small text',disabled);
    }else{
      if(actor.role==='manager'&&request&&request.status==='awaiting_review'){
        const v=ui.drafts?.['service-review:'+request.id]||{};
        actions+=`<form class="sop-form service-review-form" data-form="service-review" data-id="${e(request.id)}" ${attrs}><label>审批结论<select name="decision">${options([['approved','批准'],['needs_info','请客户补充材料'],['rejected','拒绝申请']],v.decision||'approved')}</select></label><label>审批依据 / 补件要求<textarea name="reason" rows="3" required maxlength="1000">${e(v.reason||'')}</textarea></label><button type="submit" class="btn small primary">提交审批</button></form>`;
      }else if(request&&['awaiting_review','waiting_customer'].includes(request.status))actions+='<p class="sop-hint">经理审批与客户补件持续跟进；审批决定由服务经理提交。</p>';
      if(owned){
          if(d.service!==false){const v=ui.drafts?.['service-reply:'+d.caseId]||{};actions+=`<form class="sop-form" data-form="service-reply" data-id="${e(d.caseId)}" data-case="${e(d.caseId)}"><label>本事项公开回复<textarea name="body" rows="3" required maxlength="2000">${e(v.body||'')}</textarea></label><button type="submit" class="btn small">发送事项回复</button></form>`;}
        if(d.feedback==='disputed')actions+=b('记录异议复核结果','service-resolve-dispute',d.caseId||d.id,'small primary');
        if(!request&&['order','logistics'].includes(d.kind)&&d.status!=='completed')actions+=b('记录物流核实结果','service-logistics',d.caseId||d.id,'small primary');
        if(request?.status==='approved'&&d.return?.status==='passed'&&(!d.refund||d.refund.status==='not_submitted'))actions+=b('核对并提交模拟退款','service-refund',request.id,'small primary',attrs);
        if(d.refund?.requestId&&['pending','unknown','failed'].includes(d.refund.status))actions+=b('核实原退款请求','service-query-refund',request.id,'small',attrs);
        if(d.status!=='completed')actions+=b('安排反馈时间','service-followup',d.caseId||d.id,'small');
        if(!d.handoff||d.handoff.status!=='pending')actions+=b('发起交接','service-handoff',d.caseId||d.id,'small');
      }
      if(d.handoff?.status==='pending'){
        actions+=`<p class="sop-hint">待 ${e(d.handoff.targetName)} 接收 · 截止 ${date(d.handoff.dueAt,true)}；接收前由 ${e(d.ownerName||'原负责人')} 继续负责。</p>`;
        if(actor.role==='agent'&&d.handoff.targetId===actor.id)actions+=b('接收交接','service-accept',d.handoff.id,'small primary',`data-version="${e(d.handoff.version)}"`)+b('拒接并说明原因','service-reject',d.handoff.id,'small',`data-version="${e(d.handoff.version)}"`);
      }
      actions+=handoffSummary(d);
    }
    return `<section class="service-panel" data-service-case="${e(d.caseId||d.id)}">${summary(d)}<div class="service-actions">${actions}</div>${(d.history||[]).length?`<details class="service-history"><summary>查看办理记录（${d.history.length} 条）</summary><div class="timeline">${d.history.map(h=>`<p><small>${date(h.at,true)}</small><br>${e(h.text||h.publicText||'')}</p>`).join('')}</div></details>`:''}</section>`;
  };
  root.SupportServiceUI={create(ctx){
    const {D,ui,store,identity,apply,modal,closeModal,render,cache,toast,customerConversation}=ctx;
    const $=selector=>document.querySelector(selector),hour=3600000;
    const key=()=>crypto.randomUUID?.()||String(Date.now());
    const bj=t=>new Date(Number(t)+8*hour).toISOString().slice(0,16);
    const at=value=>Date.parse(value+':00+08:00');
    const draft=(k,defaults)=>({...defaults,...ui.drafts[k]});
    let pending=null;
    function customerData(){return D.customerView(store.state,identity().id);}
    function connected(){if(D.customerConnection(store.state,identity().id)!=='online')throw Error('连接已断开，请先恢复在线；输入内容已保留。');}
    function detail(caseId){
      if(identity().role==='customer'){
        const d=customerData().services?.find(x=>(x.caseId||x.id)===caseId);if(!d)throw Error('无权查看这项服务');return d;
      }
      return D.serviceView(store.state,identity(),{caseId});
    }
    function openDetail(caseId){const d=detail(caseId);modal('服务事项详情',V.servicePanel(store.state,d,ui,identity()));}
    function complete(form,caseId,message){delete ui.drafts[form.dataset.form+':'+(form.dataset.id||'new')];closeModal();render();if(caseId)openDetail(caseId);toast(message);cache();}
    function application(orderId,itemId='',reuse=false){
      if(identity().role!=='customer')throw Error('请引导客户选择商品并主动核对申请，客服不能代客户确认。');connected();
      const data=customerData(),order=data.orders.find(o=>o.id===orderId&&o.commerce);if(!order)throw Error('请核对客户本人订单');
      const previous=reuse?pending:null,draftKey='aftersale-request:'+orderId;
      const defaults={orderId,itemId,quantity:1,serviceType:'return_refund',reason:'',evidenceRef:'DEMO-DAMAGE-001'};
      const v=draft(draftKey,defaults);if(!reuse&&itemId)v.itemId=itemId;
      pending={orderId,conversationId:previous?.conversationId||customerConversation().id,requestId:previous?.requestId||key(),draftKey};
      modal('商品级退货退款申请',`<form data-form="aftersale-request" data-id="${e(orderId)}"><div class="readonly-context">订单 ${e(orderId)} · 客户主动申请</div><input type="hidden" name="orderId" value="${e(orderId)}"><input type="hidden" name="serviceType" value="return_refund"><label class="field"><span>选择本次申请商品</span><select name="itemId" required>${options([['','请选择商品'],...order.commerce.items.map(i=>[i.id,i.name+' · '+money(i.paidCents)])],v.itemId)}</select></label>${field('数量','quantity',1,'number','readonly min="1" max="1"')}${field('申请原因','reason',v.reason,'textarea','required maxlength="1000"')}${field('材料引用（演示）','evidenceRef',v.evidenceRef,'text','required maxlength="200"')}<p class="muted small-text">演示材料 DEMO-DAMAGE-001 代表保温杯受损照片。商品与办理条件将在预览时核对；其他诉求请联系人工。</p><div class="form-footer">${b('取消','close-modal')}<button type="submit" class="btn primary">预览并核对申请</button></div></form>`);
    }
    function forCase(caseId){
      if(store.state.schema!==5)return false;
      if(identity().role!=='customer'){modal('引导客户核对申请','<p>请先核对客户的具体商品、退货退款诉求与材料，并请客户在订单商品下主动提交申请。</p><p class="muted">审批与退款在已登记的商品级事项中办理。</p>');return true;}
      const data=customerData(),c=data.cases.find(c=>c.id===caseId);if(!c)throw Error('无权查看此问题');
      const service=data.services?.find(d=>(d.caseId||d.id)===caseId);if(service?.request){openDetail(caseId);return true;}
      if(c.itemId&&c.orderId)application(c.orderId,c.itemId);else modal('核对具体诉求',`<p>请明确需要申请的商品、退货退款原因和材料。</p><p class="muted">可在“我的订单”选择具体商品；需要协助时，人工客服会继续本次咨询。</p>${b('联系人工核实','request-human',ui.customerConversation||'','primary')}`);
      return true;
    }
    function smallForm(title,f,id,fields,caseId='',extra=''){
      modal(title,`<form data-form="${f}" data-id="${e(id)}" data-case="${e(caseId)}" ${extra}>${fields}<div class="form-footer">${b('取消','close-modal')}<button type="submit" class="btn primary">确认提交</button></div></form>`);
    }
    const actions={
      'commerce-aftersale'(el){application(el.dataset.id,el.dataset.item);},
      'aftersale-back'(){if(!pending)throw Error('预览已失效，请重新核对申请');application(pending.orderId,'',true);},
      'service-detail'(el){openDetail(el.dataset.id);},
      'service-chat'(el){const c=customerData().conversations.find(c=>c.caseIds.includes(el.dataset.id));if(!c)throw Error('没有关联咨询，请联系人工');ui.customerConversation=c.id;closeModal();render();$('#customer-input')?.focus();},
      'service-supplement'(el){const v=draft('service-supplement:'+el.dataset.id,{body:'',evidenceRef:''});smallForm('补充资料与消息','service-supplement',el.dataset.id,field('补充情况','body',v.body,'textarea','required maxlength="2000"')+field('补充材料引用（可选）','evidenceRef',v.evidenceRef,'text','maxlength="200"'),el.dataset.case);},
      'service-return'(el){const v=draft('service-return:'+el.dataset.id,{trackingNumber:''});smallForm('填写寄回运单','service-return',el.dataset.id,field('寄回运单号','trackingNumber',v.trackingNumber,'text','required maxlength="100"')+'<p class="muted">只记录寄回信息；仓库收件与验收分别更新。</p>',el.dataset.case);},
      'service-withdrawal'(el){const v=draft('service-withdrawal:'+el.dataset.id,{reason:''});smallForm('申请撤回','service-withdrawal',el.dataset.id,field('撤回原因','reason',v.reason,'textarea','required maxlength="1000"')+'<p class="muted">提交后等待撤回确认；已在执行的退款须核实原执行状态。</p>',el.dataset.case);},
      'service-dispute'(el){const v=draft('service-dispute:'+el.dataset.id,{reason:''});smallForm('继续处理这个事项','service-dispute',el.dataset.id,field('还有什么没有解决？','reason',v.reason,'textarea','required maxlength="2000"')+'<p class="muted">继续原事项与原申请，保留首次受理记录。</p>',el.dataset.id);},
      'service-logistics'(el){const v=draft('service-logistics:'+el.dataset.id,{body:'',evidenceRef:''});smallForm('记录物流核实结果','service-logistics',el.dataset.id,field('客户可见核实结论','body',v.body,'textarea','required maxlength="2000"')+field('核对依据引用','evidenceRef',v.evidenceRef,'text','required maxlength="200"'),el.dataset.id);},
      'service-resolve-dispute'(el){const v=draft('service-resolve-dispute:'+el.dataset.id,{body:'',evidenceRef:''});smallForm('记录异议复核结果','service-resolve-dispute',el.dataset.id,field('客户可见复核结论','body',v.body,'textarea','required maxlength="2000"')+field('原结果核实依据','evidenceRef',v.evidenceRef,'text','required maxlength="200"')+'<p class="muted">复核关联原结果，保留原退款流水与客户反馈历史。</p>',el.dataset.id);},
      'service-followup'(el){const d=detail(el.dataset.id),v=draft('service-followup:'+el.dataset.id,{dueAt:bj(d.dueAt>Date.now()?d.dueAt:Date.now()+24*hour)});smallForm('安排下一次反馈','service-followup',el.dataset.id,field('反馈时间（北京时间 UTC+08:00）','dueAt',v.dueAt,'datetime-local','required')+'<p class="muted">负责人继续跟进事项，安排时间不自动完成业务。</p>',el.dataset.id);},
      'service-refund'(el){const v=draft('service-refund:'+el.dataset.id,{requestId:key()});ui.drafts['service-refund:'+el.dataset.id]=v;smallForm('核对并提交模拟退款','service-refund',el.dataset.id,`<input type="hidden" name="requestId" value="${e(v.requestId)}"><p>按已批准的商品金额发起一次本地模拟退款请求。</p><p class="muted">提交后进入处理中；结果未知时核实原请求。</p>`,el.dataset.case);},
      'service-query-refund'(el){apply('queryRefund',{aftersaleId:el.dataset.id},'已核实原退款请求');closeModal();render();openDetail(el.dataset.case);},
      'service-handoff'(el){const d=detail(el.dataset.id),staff=store.state.staff.filter(a=>a.role==='agent'&&a.id!==d.ownerId),v=draft('service-handoff:'+el.dataset.id,{targetId:staff[0]?.id||'',reason:'',dueAt:bj(Date.now()+hour)});smallForm('发起人工交接','service-handoff',el.dataset.id,`<label class="field"><span>接收客服</span><select name="targetId" required>${options(staff.map(a=>[a.id,a.name]),v.targetId)}</select></label>`+field('交接原因与要求','reason',v.reason,'textarea','required maxlength="1000"')+field('接收截止时间（北京时间 UTC+08:00）','dueAt',v.dueAt,'datetime-local','required')+'<p class="muted">接收前保留原负责人；摘要随原事项一并传递。</p>',el.dataset.id);},
      'service-accept'(el){const h=store.state.commerce.handoffs.find(h=>h.id===el.dataset.id);apply('acceptHandoff',{handoffId:el.dataset.id,version:Number(el.dataset.version)},'已接收交接');closeModal();render();if(h)openDetail(h.caseId);},
      'service-reject'(el){const v=draft('service-reject:'+el.dataset.id,{reason:''});smallForm('拒接并说明原因','service-reject',el.dataset.id,`<input type="hidden" name="version" value="${e(el.dataset.version)}">`+field('拒接原因','reason',v.reason,'textarea','required maxlength="1000"'));},
      'service-metric'(el){ui.serviceMetric=el.dataset.id;render();},
      'service-eval'(el){apply('runServiceEval',el.dataset.id?{knowledgeId:el.dataset.id}:{},'流程评测已运行，请查看逐项证据');render();},
      'service-expire-handoffs'(){apply('expireHandoffs',{},'已核对超时交接；原负责人继续负责');render();},
      'link-gap-repair'(el){const g=D.get(store.state,'gaps',el.dataset.id),scenarios={routing:['trigger-policy','trigger-request','two-items','changed-intent'],business:['query-failure','refund-unknown','refund-idempotent'],workflow:['happy-path','review-reject','supplement'],collaboration:['handoff-timeout'],notification:['notification-failure']},items=scenarios[g.causeType]||[],v=draft('link-gap-repair:'+g.id,{remediation:'',scenarioId:items[0]||''});smallForm('登记失败路径整改','link-gap-repair',g.id,field('整改说明','remediation',v.remediation,'textarea','required maxlength="2000"')+`<label class="field"><span>复验场景</span><select name="scenarioId" required>${options(items.map(id=>[id,id]),v.scenarioId)}</select></label><p class="muted">整改后由服务经理运行关联失败路径并验收。</p>`);},
      'service-receipt'(el){const v=draft('service-receipt:'+el.dataset.id,{reason:''});smallForm('提交本地模拟回执','service-receipt',el.dataset.id,`<input type="hidden" name="kind" value="${e(el.dataset.kind)}"><input type="hidden" name="version" value="${e(el.dataset.version)}"><p>事件：${e(el.textContent)}</p>${field('回执说明 / 失败原因','reason',v.reason,'textarea','maxlength="1000"')}${el.dataset.kind==='refund_failed'?'<label class="row"><input type="checkbox" name="safeStopped" value="true">模拟确认原执行已终止（撤回时必需）</label>':''}<p class="muted">回执仅更新对应业务阶段，不替代实际到账与客户确认。</p>`);}
    };
    function submit(form,data){
      const f=form.dataset.form,id=form.dataset.id,caseId=form.dataset.case;
      if(f==='aftersale-request'){
        if(!pending||pending.orderId!==id)throw Error('申请上下文已失效，请重新打开商品申请');connected();
        const input={orderId:data.orderId,itemId:data.itemId,quantity:Number(data.quantity),serviceType:data.serviceType,reason:data.reason,evidenceRef:data.evidenceRef,conversationId:pending.conversationId};
        const value=apply('previewAftersale',input);ui.drafts[pending.draftKey]={...data};pending={...pending,input,preview:value};
        modal('核对商品级申请',`<div class="preview-block"><h3>${e(value.itemName)}</h3><p>订单 ${e(value.orderId)} · 数量 ${e(value.quantity)} 件</p><p>服务：退货退款 · 本次核对金额 ${money(value.amountCents)}</p><p>原因：${e(value.reason)}</p><p>材料：${e(value.evidenceRef)}</p><p>规则依据：${e(ruleText(value.rule))}</p></div><p class="muted">提交申请后等待经理审批、寄回和验收；退款执行另有回执。</p><form data-form="aftersale-confirm" data-id="${e(id)}"><div class="form-footer">${b('返回修改','aftersale-back')}${b('取消','close-modal')}<button type="submit" class="btn primary">确认提交本次申请</button></div></form>`);cache();return true;
      }
      if(f==='aftersale-confirm'){
        if(!pending?.preview||pending.orderId!==id)throw Error('预览已失效，请重新核对申请');connected();
        const request=pending,value=apply('confirmAftersale',{...request.input,token:request.preview.token,requestId:request.requestId,confirmed:true});
        delete ui.drafts[request.draftKey];pending=null;closeModal();render();const d=customerData().services?.find(d=>d.request?.id===(typeof value==='string'?value:value.id));if(d)openDetail(d.caseId||d.id);toast('商品级申请已提交，等待审批');cache();return true;
      }
      const handlers={
        'service-review':()=>apply('submitReview',{aftersaleId:id,decision:data.decision,reason:data.reason}),
        'service-reply':()=>apply('serviceReply',{caseId:id,body:data.body}),
        'service-supplement':()=>apply('submitSupplement',{aftersaleId:id,body:data.body,evidenceRef:data.evidenceRef||''}),
        'service-return':()=>apply('submitReturn',{aftersaleId:id,trackingNumber:data.trackingNumber}),
        'service-withdrawal':()=>apply('requestWithdrawal',{aftersaleId:id,reason:data.reason}),
        'service-dispute':()=>apply('serviceDispute',{caseId:id,reason:data.reason}),
        'service-logistics':()=>apply('resolveLogistics',{caseId:id,body:data.body,evidenceRef:data.evidenceRef}),
        'service-resolve-dispute':()=>apply('resolveServiceDispute',{caseId:id,body:data.body,evidenceRef:data.evidenceRef}),
        'service-followup':()=>apply('serviceFollowup',{caseId:id,dueAt:at(data.dueAt)}),
        'service-refund':()=>apply('submitRefund',{aftersaleId:id,requestId:data.requestId}),
        'service-handoff':()=>apply('proposeHandoff',{caseId:id,targetId:data.targetId,reason:data.reason,dueAt:at(data.dueAt)}),
        'service-reject':()=>apply('rejectHandoff',{handoffId:id,version:Number(data.version),reason:data.reason}),
        'service-receipt':()=>apply('applySimulatedReceipt',{aftersaleId:id,kind:data.kind,version:Number(data.version),reason:data.reason,safeStopped:data.safeStopped==='true'}),
        'link-gap-repair':()=>apply('linkGap',{id,remediation:data.remediation,scenarioId:data.scenarioId})
      };
      if(!handlers[f])return false;
      if(identity().role==='customer')connected();handlers[f]();
      complete(form,caseId,{'service-refund':'模拟退款请求已提交，等待原请求回执','service-withdrawal':'撤回请求已提交，等待确认','service-receipt':'本地模拟回执已记录'}[f]||'处理记录已保存');return true;
    }
    return {actions,submit,openForCase:forCase,onClose(){pending=null;}};
  }};
})(window);
