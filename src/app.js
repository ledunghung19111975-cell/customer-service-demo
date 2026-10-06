(function(){
  'use strict';
  const D=window.SupportDomain,V=window.SupportViews,{e,b,icon,field,options,pill,date,empty}=V;
  let storage;try{storage=localStorage;}catch(err){storage={getItem(){throw err;},setItem(){throw err;}};}
  const commerceMode=new URLSearchParams(location.search).get('data')!=='v4';
  const store=commerceMode?window.SupportStore.openCommerce(storage,()=>window.SupportSeed.createCommerce()):window.SupportStore.open(storage,()=>window.SupportSeed.create());
  const viewKey=commerceMode?'qinghe-support-ecommerce-view-v1':'qinghe-support-view';
  const customerOnly=new URLSearchParams(location.search).get('view')==='customer';
  let cached={};try{cached=JSON.parse(sessionStorage.getItem(viewKey)||'{}');}catch{}
  const ui={workspace:'customer',deskPage:'inbox',opsPage:'overview',opsRole:'manager',agentId:'lin',customerConversation:'',deskConversation:'',deskFilter:'queue',ticketFilter:'all',knowledgeId:'',composeMode:'reply',search:{},drafts:{},...cached,flowTest:null};
  if(!['manager','operator','admin'].includes(ui.opsRole))ui.opsRole='manager';
  if(!store.state?.staff.some(a=>a.role==='agent'&&a.id===ui.agentId))ui.agentId=store.state?.staff.find(a=>a.role==='agent')?.id||'lin';
  ui.search||={};ui.draftScopes||={[draftScope()]:ui.drafts||{}};ui.drafts={};let activeDraftScope='';
  const opsMenus={manager:[['overview','服务概览','chart'],['team','团队协同','users'],['quality','质量复核','shield'],['service','接待规则','settings']],operator:[['knowledge','知识与答复','book'],['flow','接待策略与测试','flow'],['quality','服务改进队列','shield']],admin:[['integrations','接入与运行','plug'],['permissions','角色与职责','users'],['logs','操作审计','shield'],['data','数据维护','settings']]};
  const $=s=>document.querySelector(s);let toastTimer,focusBeforeDialog;
  function toast(message,error=false){const t=$('#toast');t.textContent=message;t.className='toast visible'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.className='toast',5000);}
  function cache(){try{const {flowTest,drafts,pendingTicket,...persist}=ui;sessionStorage.setItem(viewKey,JSON.stringify(persist));}catch{/* Formal writes are handled by the transactional store, not this draft cache. */}}
  function identity(){return ui.workspace==='customer'?{id:'C001',role:'customer'}:ui.workspace==='desk'?{id:ui.agentId,role:'agent'}:{id:ui.opsRole,role:ui.opsRole};}
  function draftScope(){const a=identity();return a.role+':'+a.id;}
  function syncDrafts(){const scope=draftScope();if(scope!==activeDraftScope){ui.drafts=ui.draftScopes[scope]||={};ui.pendingTicket=null;ui.flowTest=null;activeDraftScope=scope;}}
  function clearFlowTest(){ui.flowTest=null;$('.query-result')?.remove();}
  function fail(err){const message=err?.message||'操作没有完成，请重试';if($('#dialog').open){$('#dialog-error').textContent=message;$('#dialog-error').hidden=false;}else toast(message,true);}
  function apply(type,data,success){let value;try{value=store.dispatch(identity(),type,data);}catch(err){if(store.blocked)render();throw err;}if(success)toast(success);return value;}
  function navigate(workspace,page){ui.customerMode=workspace==='mobile'?'mobile':'desktop';ui.workspace=workspace==='mobile'?'customer':workspace;if(workspace==='desk')ui.deskPage=page||ui.deskPage;if(workspace==='ops')ui.opsPage=page||ui.opsPage;history.pushState(null,'','#'+workspace+(workspace==='desk'?'/'+ui.deskPage:workspace==='ops'?'/'+ui.opsPage:''));cache();}
  function route(){
    if(customerOnly){ui.workspace='customer';ui.customerMode='desktop';return;}
    const hash=location.hash.slice(1);if(!hash)return;
    const legacy={playground:'customer',sessions:'desk/inbox',tickets:'desk/tickets',knowledge:'ops/knowledge',workflow:'ops/flow',quality:'ops/quality',architecture:'ops/data',integrations:'ops/integrations',overview:'ops/overview',robot:'ops/flow'};
    const [workspace,page]=(legacy[hash]||hash).split('/');
    if(workspace==='mobile'){ui.workspace='customer';ui.customerMode='mobile';return;}
    if(workspace==='customer')ui.customerMode='desktop';
    if(['customer','desk','ops'].includes(workspace)){ui.workspace=workspace;if(workspace==='desk')ui.deskPage=['inbox','tickets'].includes(page)?page:'inbox';if(workspace==='ops')ui.opsPage=page||'overview';}
    if(ui.workspace==='ops'&&!opsMenus[ui.opsRole].some(x=>x[0]===ui.opsPage)){ui.opsPage=opsMenus[ui.opsRole][0][0];history.replaceState(null,'','#ops/'+ui.opsPage);}
  }
  function top(s){const role=ui.workspace==='desk'?`<label class="role-picker"><span>当前客服</span><select aria-label="当前客服" data-select="agent">${options(s.staff.filter(a=>a.role==='agent').map(a=>[a.id,a.name]),ui.agentId)}</select></label>`:ui.workspace==='ops'?`<label class="role-picker"><span>工作角色</span><select aria-label="工作角色" data-select="ops-role">${options([['manager','服务经理'],['operator','知识运营'],['admin','系统管理员']],ui.opsRole)}</select></label>`:`<span class="customer-identity">${icon('users',16)} 我的账户</span><a class="icon-button" href="?view=customer&data=${commerceMode?'ecommerce':'v4'}#customer" target="_blank" rel="noopener" title="打开独立客户页" aria-label="打开独立客户页">${icon('external',16)}</a>`;
    return `<header class="app-top"><a class="product-brand" href="#customer"><span class="brand-logo">${icon('chat',20)}</span><span>${commerceMode?'电商客服演示':'智能客服'}</span></a>${customerOnly?'<div class="standalone-heading">服务中心</div>':`<nav class="workspace-tabs" aria-label="工作区">${[['customer','客户服务','chat'],['mobile','手机端演示','chat'],['desk','客服工作台','inbox'],['ops','运营后台','chart']].map(([key,label,glyph])=>`<button type="button" data-action="workspace" data-id="${key}" class="${(ui.workspace==='customer'&&ui.customerMode==='mobile'?'mobile':ui.workspace)===key?'active':''}" ${(ui.workspace==='customer'&&ui.customerMode==='mobile'?'mobile':ui.workspace)===key?'aria-current="page"':''}>${icon(glyph)}${label}</button>`).join('')}</nav>`}<div class="top-right">${customerOnly?'<span class="customer-identity">我的账户</span>':role}</div></header>`;
  }
  function side(s){const menu=ui.workspace==='desk'?[['inbox','会话接待','inbox'],['tickets','工单处理','ticket']]:opsMenus[ui.opsRole];const active=ui.workspace==='desk'?ui.deskPage:ui.opsPage;const actor=identity();return `<aside class="workspace-sidebar"><div class="workspace-label">${ui.workspace==='desk'?'客户支持':'运营与管理'}</div>${menu.map(([key,label,glyph])=>`<button class="side-link ${active===key?'active':''}" type="button" data-action="${ui.workspace==='desk'?'desk-page':'ops-page'}" data-id="${key}">${icon(glyph)}<span>${label}</span></button>`).join('')}<div class="sidebar-bottom"><span class="workspace-dot"></span><strong>客户服务团队</strong><small>${ui.workspace==='desk'?'服务组 · 本人任务与公共池':{manager:'团队服务与质量',operator:'知识、策略与改进',admin:'系统接入与维护'}[ui.opsRole]}</small></div></aside>`;}
  function render(){
    if(store.blocked){$('#app').innerHTML=`<main class="fatal"><h1>工作空间暂时无法读取</h1><p>${e(store.blocked)}</p><p>不会用空白数据覆盖原记录。请先导出原始保存值，再排查数据格式。</p>${b('导出原始保存值','export-broken','','primary')}</main>`;return;}
    route();syncDrafts();const s=store.state;let content='';
    const focused=document.activeElement,focusKey=focused?.dataset.focus,selection=focused?.selectionStart;
    if(ui.workspace==='customer')content=(ui.customerMode==='mobile'?V.mobile:V.customer)(D.customerView(s,'C001'),ui);
    else if(ui.workspace==='desk'){const data=D.deskView(s,identity());content=ui.deskPage==='tickets'?V.tickets(s,data.tickets,ui):V.inbox(s,data,ui,D.actor(s,identity()));}
    else {
      switch(ui.opsPage){
        case'overview':content=V.overview(s,ui,ui.opsRole);break;
        case'team':content=V.tickets(s,s.tickets.filter(t=>D.actor(s,identity()).teams.includes(t.teamId)),ui,true)+`<section class="panel"><div class="panel-heading"><h2>当前人工接待</h2></div>${s.conversations.filter(c=>['queued','human'].includes(c.state)&&D.actor(s,identity()).teams.includes(c.teamId)).map(c=>`<div class="attention-row"><div><strong>${e(s.customers.find(x=>x.id===c.customerId)?.name||c.customerId)}</strong><small>${e(c.id)} · ${e(c.handoffReason)}</small></div><div class="row">${pill(c.state)}${s.schema===5&&c.caseIds.some(id=>s.cases.some(x=>x.id===id&&x.service&&x.ownerId))?b('查看服务事项','service-detail',c.caseIds.find(id=>s.cases.some(x=>x.id===id&&x.service)),'small'):b('分配客服','assign-conversation',c.id,'small')}</div></div>`).join('')||empty('暂无待分配会话')}</section>`;break;
        case'knowledge':content=V.knowledge(s,ui);break;
        case'flow':content=V.flow(s,ui);break;
        case'quality':content=V.quality(s,ui,ui.opsRole);break;
        case'service':content=V.serviceSettings(s,ui);break;
        case'integrations':content=V.integrations(s);break;
        case'permissions':content=V.permissions();break;
        case'logs':content=V.logs(s);break;
        case'data':content=V.data(commerceMode,s,ui);break;
      }
    }
    const scrolls=[...document.querySelectorAll('.messages,.sop-workbench-scroll,.conversation-rows')].map(x=>[x.className,x.scrollTop,x.scrollHeight-x.clientHeight-x.scrollTop<40]);
    const dialog=$('#dialog');if(dialog.parentElement!==document.body)document.body.append(dialog);
    $('#app').innerHTML=top(s)+(ui.workspace==='customer'?`<main class="customer-main ${ui.customerMode==='mobile'?'mobile-main':''}">${content}</main>`:`<div class="workspace-body">${side(s)}<main class="workspace-content ${ui.workspace==='desk'&&ui.deskPage==='inbox'?'inbox-page':''}">${content}</main></div>`);
    if(dialog.open&&ui.workspace==='customer'&&ui.customerMode==='mobile')$('.phone-overlay-host')?.append(dialog);
    document.querySelectorAll('.messages,.sop-workbench-scroll,.conversation-rows').forEach(x=>{const old=scrolls.find(y=>y[0]===x.className);if(old)x.scrollTop=old[2]?x.scrollHeight:old[1];});
    if(focusKey&&!$('#dialog').open){const target=document.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`);target?.focus();try{target?.setSelectionRange(selection,selection);}catch{}}
    workbench.afterRender();cache();
  }
  function scrollMessages(){requestAnimationFrame(()=>document.querySelectorAll('.messages').forEach(x=>x.scrollTop=x.scrollHeight));}
  function modal(title,body){focusBeforeDialog=document.activeElement;$('#dialog-title').textContent=title;$('#dialog-body').innerHTML=body;$('#dialog-body').querySelectorAll('form[data-form]').forEach(form=>{const draft=ui.drafts[form.dataset.form+':'+(form.dataset.id||'new')];if(draft)Object.entries(draft).forEach(([name,value])=>{const input=form.elements.namedItem(name);if(input){if(input.type==='checkbox')input.checked=Boolean(value);else input.value=value;}});});$('#dialog-error').hidden=true;$('#dialog-error').textContent='';const dialog=$('#dialog'),host=ui.workspace==='customer'&&ui.customerMode==='mobile'?$('.phone-overlay-host'):null;if(host){host.append(dialog);[...host.parentElement.children].filter(x=>x!==host).forEach(x=>x.inert=true);if(!dialog.open)dialog.show();}else{if(dialog.parentElement!==document.body)document.body.append(dialog);if(!dialog.open)dialog.showModal();}$('#dialog-body').querySelector('input:not([type=hidden]),textarea,select,button')?.focus();}
  function closeModal(){document.querySelectorAll('.phone-screen>[inert]').forEach(x=>x.inert=false);if($('#dialog').open)$('#dialog').close();service.onClose();if(workbench.onClose())render();if(focusBeforeDialog?.isConnected)focusBeforeDialog.focus();}
  function customerConversation(){const list=D.customerView(store.state,'C001').conversations;let c=list.find(c=>c.id===ui.customerConversation)||list[0];if(!c){ui.customerConversation=apply('newConversation',{});c=D.get(store.state,'conversations',ui.customerConversation);}return c;}
  function quick(body){closeModal();const c=customerConversation();apply('say',{id:c.id,body});ui.customerConversation=c.id;render();scrollMessages();}
  function formDraft(key,defaults){return {...defaults,...ui.drafts[key]};}
  function ticketForUI(id){const s=store.state;if(ui.workspace==='customer'){const t=D.customerView(s,'C001').tickets.find(t=>t.id===id);if(!t)throw Error('无权查看此工单');return t;}if(ui.workspace==='desk'){const t=[...D.deskView(s,identity()).tickets,...D.deskView(s,identity()).relatedTickets].find(t=>t.id===id);if(!t)throw Error('此工单不在本人任务或公共池中');return t;}if(ui.opsRole==='manager'){const t=D.get(s,'tickets',id);if(!D.actor(s,identity()).teams.includes(t.teamId))throw Error('无权查看此工单');return t;}throw Error('当前角色无权查看工单详情');}
  function ticketDetail(id){const s=store.state,t=ticketForUI(id);if(s.schema===5&&s.cases.some(c=>c.id===t.caseId&&c.service))return service.actions['service-detail']({dataset:{id:t.caseId}});const customer=ui.workspace==='customer',canEdit=ui.workspace==='desk'&&t.ownerId===ui.agentId&&t.status!=='done';const c=customer?D.customerView(s,'C001').cases.find(c=>c.id===t.caseId):D.get(s,'cases',t.caseId);const draft=formDraft('ticket-update:'+id,{status:t.status,publicText:'',evidence:'',internalText:''});
    modal('工单详情',`<div class="row between"><h2>${e(t.title)}</h2>${pill(t.status)}</div><p class="muted">${e(t.id)} · ${date(t.createdAt,true)} · ${e(t.orderId||'未关联订单')}</p><div class="result-note">${e(t.description)}</div>${t.serviceType?`<dl><dt>申请类型</dt><dd>${t.serviceType==='exchange'?'换货':'退货'}</dd>${t.exchangeRequest?`<dt>换货要求</dt><dd>${e(t.exchangeRequest)}</dd>`:''}${t.extraNote?`<dt>补充说明</dt><dd>${e(t.extraNote)}</dd>`:''}</dl>`:''}<div class="timeline">${t.history.map(h=>`<div class="timeline-entry"><small>${date(h.at,true)} · ${e(h.actor||'客服')}</small><p>${e(h.publicText)}</p>${!customer&&h.internalText?`<div class="internal-evidence">内部备注：${e(h.internalText)}</div>`:''}${!customer&&h.evidence?`<div class="internal-evidence">核对依据：${e(h.evidence)}</div>`:''}</div>`).join('')}</div>${customer?t.status!=='done'?`<form data-form="supplement" data-id="${e(id)}">${field('补充信息','body',ui.drafts['supplement:'+id]?.body||'','textarea','required maxlength="2000"')}<button class="btn primary" type="submit">提交补充</button></form>`:`<div class="row">${c.feedback==='confirmed'?pill('客户已确认','good')+b('仍需帮助','dispute-case',c.id):`${b('确认已解决','confirm-case',c.id,'primary')}${b('仍需帮助','dispute-case',c.id)}`}</div>`:canEdit?`<form data-form="ticket-update" data-id="${e(id)}"><label class="field"><span>处理动作</span><select name="status">${options([['working','继续处理'],['waiting_customer','请客户补充'],['done','记录办理结果']],draft.status)}</select></label>${field('客户可见说明','publicText',draft.publicText,'textarea','required maxlength="2000"')}${field('核对依据（记录结果时必填，仅内部可见）','evidence',draft.evidence,'textarea','maxlength="2000"')}${field('内部协同备注','internalText',draft.internalText,'textarea','maxlength="2000"')}<p class="muted small-text">此操作记录处理结果，不会调用退款、支付或发货接口。</p><button class="btn primary" type="submit">提交处理记录</button></form>`:ui.workspace==='desk'&&!t.ownerId?b('领取工单','claim-ticket',id,'primary'):pill('只读记录')}`);
  }
  function intake(caseId,conversationId='',standalone=false){
    const s=store.state,c=caseId?D.get(s,'cases',caseId):null;
    if(ui.workspace==='customer'&&c.customerId!=='C001')throw Error('无权访问这项服务');
    if(ui.workspace==='desk'&&!standalone&&!D.deskView(s,identity()).conversations.some(v=>v.id===conversationId&&v.ownerId===ui.agentId))throw Error('请先取得接待权');
    const id=caseId||'standalone',defaults={title:c?.kind==='aftersales'?'售后申请':c?.title||'',description:'',customerId:'C001'};const values=formDraft('ticket-request:'+id,defaults);
    ui.pendingTicket={caseId:caseId||'',conversationId,standalone,requestKey:crypto.randomUUID?.()||String(Date.now())};
    modal(standalone?'独立登记工单':'填写服务申请',`<p class="muted">${c?.orderId?`订单：${e(c.orderId)}`:'需要后续办理的问题，明确交给工单跟进。'}</p><form data-form="ticket-request" data-id="${e(id)}">${standalone?`<label class="field"><span>关联客户</span><select name="customerId">${options(s.customers.map(c=>[c.id,c.name]),values.customerId)}</select></label>`:''}${field('标题','title',values.title,'text','required maxlength="100"')}${field('问题描述 / 申请原因','description',values.description,'textarea','required maxlength="2000"')}<p class="muted small-text">下一步先核对信息；确认前不创建工单。</p><div class="form-footer">${b('取消','close-modal')}<button class="btn primary" type="submit">核对申请</button></div></form>`);
  }
  function confirmation(title,body,action,id){modal(title,`<p>${e(body)}</p><div class="form-footer">${b('取消','close-modal')}${b('确认','confirm-action',id,'primary',`data-command="${e(action)}"`)}</div>`);}
  function download(name,value){const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const service=window.SupportServiceUI.create({D,V,ui,store,identity,apply,modal,closeModal,render,cache,toast,customerConversation});
  const workbench=window.SupportWorkbench.create({D,V,ui,store,identity,apply,modal,closeModal,render,cache,toast,intake,scrollMessages,service});
  const actions={
    workspace(el){closeModal();navigate(el.dataset.id);render();scrollMessages();},
    'desk-page'(el){navigate('desk',el.dataset.id);render();},
    'ops-page'(el){if(!opsMenus[ui.opsRole].some(x=>x[0]===el.dataset.id))throw Error('当前角色无权打开这个页面');navigate('ops',el.dataset.id);render();},
    'new-conversation'(){closeModal();ui.customerConversation=apply('newConversation',{},'已开始新咨询，原服务记录仍保留');render();scrollMessages();},
    'quick-policy'(){quick('七天无理由退货有什么条件？');},
    'order-query'(el){quick('查物流 '+el.dataset.id);},
    'commerce-query'(el){const value=apply('queryCommerce',{orderId:el.dataset.id});modal('订单、支付与包裹',V.commerceDetails(value));},
    'order-return'(el){quick('申请退货 '+el.dataset.id);},
    'request-human'(el){closeModal();const c=el.dataset.id||customerConversation().id,record=D.customerView(store.state,'C001').conversations.find(x=>x.id===c);if(!record)throw Error('无权访问此咨询');ui.customerConversation=c;if(['queued','human'].includes(record.state)){render();scrollMessages();toast(record.state==='queued'?'人工请求已在排队，可继续补充消息':'人工客服已接待，可继续补充消息');return;}apply('requestHuman',{id:c},'已提交人工请求');render();scrollMessages();},
    'cancel-queue'(el){apply('cancelQueue',{id:el.dataset.id},'已取消当前排队');render();},
    'customer-history'(){const data=D.customerView(store.state,'C001');modal('历史咨询',data.conversations.map(c=>`<button type="button" class="history-row" data-action="open-history" data-id="${e(c.id)}"><strong>${e(c.messages.find(m=>m.role==='customer')?.body||'新的咨询')}</strong><small>${e(c.id)} · ${date(c.createdAt,true)}</small>${pill(c.state)}</button>`).join('')||empty('暂无历史咨询'));},
    'open-history'(el){ui.customerConversation=el.dataset.id;closeModal();render();scrollMessages();},
    citation(el){const s=store.state,convs=ui.workspace==='customer'?D.customerView(s,'C001').conversations:ui.workspace==='desk'?D.deskView(s,identity()).conversations:[];const m=convs.flatMap(c=>c.messages).find(m=>m.id===el.dataset.id&&m.citation);if(!m)throw Error('引用不存在或无权查看');modal('答复来源',`<h2>${e(m.citation.title)}</h2><p class="muted">${e(m.citation.source)} · 回答时版本 v${m.citation.version}</p><p>${e(m.citation.answer)}</p><p class="muted small-text">这里保留当时使用的原文，不随之后的发布修改。</p>`);},
    intake(el){intake(el.dataset.id);},
    'staff-intake'(el){intake(el.dataset.id,el.dataset.conversation);},
    'standalone-ticket'(){intake('','',true);},
    'ticket-detail'(el){ticketDetail(el.dataset.id);},
    'claim-ticket'(el){apply('claimTicket',{id:el.dataset.id},'工单已领取');closeModal();render();},
    'inbox-filter'(el){ui.deskFilter=el.dataset.id;render();},
    'select-conversation'(el){ui.deskConversation=el.dataset.id;render();scrollMessages();},
    'claim-conversation'(el){apply('claimConversation',{id:el.dataset.id},'已接管，可以开始回复');ui.deskConversation=el.dataset.id;ui.deskFilter='mine';render();scrollMessages();},
    'compose-mode'(el){ui.composeMode=el.dataset.id;render();scrollMessages();},
    presence(){const a=D.actor(store.state,identity());apply('presence',{available:!a.available},a.available?'已设为暂离':'已恢复接待');render();},
    'insert-suggestion'(el){const k=D.get(store.state,'knowledge',el.dataset.id);const c=D.get(store.state,'conversations',ui.visibleConversation);if(c.ownerId!==ui.agentId||c.state!=='human')throw Error('请先接管会话');ui.composeMode='reply';ui.drafts['reply:'+c.id]={body:k.live.answer};render();$('#agent-input')?.focus();toast('已插入草稿，请核对后发送');},
    flag(el){apply('flag',{id:el.dataset.id},'已提交复核，不直接判定为服务错误');render();},
    'complete-case'(el){const c=D.get(store.state,'cases',el.dataset.id);const v=formDraft('complete-case:'+c.id,{conclusion:'',evidence:''});modal('记录当场处理结果',`<p class="muted">${e(c.title)}。无需为了结束一次咨询而创建工单。</p><form data-form="complete-case" data-id="${e(c.id)}" data-conversation="${e(el.dataset.conversation)}">${field('客户可见处理结论','conclusion',v.conclusion,'textarea','required maxlength="2000"')}${field('核对依据（仅内部可见）','evidence',v.evidence,'textarea','required maxlength="2000"')}<p class="muted small-text">记录后计为处理完成；客户是否确认单独统计。</p><button class="btn primary" type="submit">提交处理结果</button></form>`);},
    'close-conversation'(el){confirmation('结束本次沟通','结束沟通不代表所有问题已解决。未完成问题必须已经安排工单跟进。','closeConversation',el.dataset.id);},
    'confirm-case'(el){apply('feedback',{id:el.dataset.id,confirmed:true},'感谢确认');closeModal();render();},
    'dispute-case'(el){const v=formDraft('dispute:'+el.dataset.id,{reason:''});modal('继续处理这个问题',`<form data-form="dispute" data-id="${e(el.dataset.id)}">${field('还有什么没有解决？','reason',v.reason,'textarea','required maxlength="2000"')}<p class="muted small-text">我们会继续原问题和原工单，保留首次受理时间，不重新建一张重复工单。</p><button class="btn primary" type="submit">提交并继续跟进</button></form>`);},
    'assign-ticket'(el){assign('assignTicket',el.dataset.id);},
    'assign-conversation'(el){assign('assignConversation',el.dataset.id);},
    'new-knowledge'(){ui.knowledgeId='new';ui.prefillQuery='';render();},
    'select-knowledge'(el){ui.knowledgeId=el.dataset.id;render();},
    'test-knowledge'(el){apply('testKnowledge',{id:el.dataset.id},'回归已运行，请查看逐项结果');render();},
    'publish-knowledge'(el){confirmation('发布知识','确认发布已通过回归的草稿？新提问将使用新版本，历史答复保留原引用。','publishKnowledge',el.dataset.id);},
    'disable-knowledge'(el){modal('停用知识',`<form data-form="disable-knowledge" data-id="${e(el.dataset.id)}">${field('停用原因','reason','','textarea','required maxlength="300"')}<button class="btn primary" type="submit">确认停用</button></form>`);},
    'test-flow'(){apply('testFlow',{},'回归已运行，请查看逐项结果');render();},
    'publish-flow'(){confirmation('发布接待策略','新咨询将使用新策略；正在进行的咨询继续使用开始时的版本。','publishFlow','');},
    'review-gap'(el){const g=D.get(store.state,'gaps',el.dataset.id);const v=formDraft('review-gap:'+g.id,{status:'confirmed',review:g.review,cause:g.cause});modal('复核服务问题',`<p class="result-note">${e(g.query)}</p><form data-form="review-gap" data-id="${e(g.id)}"><label class="field"><span>复核结论</span><select name="status">${options([['confirmed','确认问题，交给运营整改'],['dismissed','排除线索，不形成整改']],v.status)}</select></label>${store.state.schema===5?`<label class="field"><span>根因分类</span><select name="causeType">${options([['knowledge','知识'],['routing','触发与路由'],['business','业务数据与回执'],['workflow','办理流程'],['collaboration','人工协同'],['notification','通知']],v.causeType||g.causeType||'knowledge')}</select></label>`:''}${field('复核依据','review',v.review,'textarea','required')}${field('根因说明（确认问题时必填）','cause',v.cause,'textarea')}<button class="btn primary" type="submit">保存复核结论</button></form>`);},
    'new-gap-knowledge'(el){const g=D.get(store.state,'gaps',el.dataset.id);if(ui.opsRole!=='operator'||!['confirmed','fixing'].includes(g.status))throw Error('请先完成问题复核');ui.knowledgeId='new';ui.prefillQuery=g.query;navigate('ops','knowledge');render();},
    'link-gap'(el){const g=D.get(store.state,'gaps',el.dataset.id);modal('关联整改知识',`<p>${e(g.query)}</p><form data-form="link-gap" data-id="${e(g.id)}"><label class="field"><span>选择用于修复的知识</span><select name="knowledgeId" required>${options(store.state.knowledge.map(k=>[k.id,(k.draft||k.live).title+' · '+k.id]),g.knowledgeId)}</select></label><p class="muted small-text">关联后仍需发布修订，并由经理用原始问题验收。</p><button class="btn primary" type="submit">保存关联</button></form>`);},
    'accept-gap'(el){const g=D.get(store.state,'gaps',el.dataset.id),path=store.state.schema===5&&(g.causeType||'knowledge')!=='knowledge';modal(path?'复验失败路径并验收':'验证原问题并验收',`<form data-form="accept-gap" data-id="${e(el.dataset.id)}">${field('验收说明','acceptance','','textarea','required')}<p class="muted small-text">${path?'提交时运行已关联的失败路径场景，并保存动作与状态证据。检查通过后方可验收。':'提交时重放原问题并运行全量回归，不能用手动勾选替代验证。'}</p><button class="btn primary" type="submit">执行验证并验收</button></form>`);},
    'confirm-action'(el){apply(el.dataset.command,{id:el.dataset.id},'操作已完成');closeModal();ui.flowTest=null;render();},
    'close-modal'(){closeModal();},
    'export-data'(){const data=apply('export',{});download('客服工作空间.json',data);toast('已生成工作空间导出文件');},
    'export-legacy'(){if(identity().role!=='admin')throw Error('需要系统管理员角色');const raw=localStorage.getItem('zhixu-customer-demo-v3.1');if(raw===null)throw Error('当前浏览器未读取到旧版本保存值');download('客服旧版本原始数据.json',raw);toast('已导出旧版本原始保存值，未做转换');},
    'export-v4'(){if(identity().role!=='admin')throw Error('需要系统管理员角色');const raw=storage.getItem(window.SupportStore.KEY);if(raw===null)throw Error('当前浏览器未读取到 V4 保存值');download('客服V4原始数据.json',raw);toast('已导出 V4 原始保存值，未做转换');},
    'export-broken'(){if(store.original===null)throw Error('无法读取原始保存值，可能是浏览器禁用了存储');download('客服异常原始数据.json',store.original);},
    ...workbench.actions,
    ...service.actions
  };
  function assign(type,id){modal('分配负责人',`<form data-form="assign" data-id="${e(id)}" data-command="${type}"><label class="field"><span>接收客服</span><select name="ownerId">${options(store.state.staff.filter(a=>a.role==='agent').map(a=>[a.id,a.name]),'lin')}</select></label><p class="muted small-text">转派保留原受理时间和处理记录，原负责人不能继续修改任务。</p><button class="btn primary" type="submit">确认分配</button></form>`);}
  document.addEventListener('click',ev=>{const el=ev.target.closest('[data-action]');if(!el||el.disabled)return;try{const handler=actions[el.dataset.action];if(!handler)throw Error('此操作不可用');handler(el);cache();}catch(err){fail(err);}});
  document.addEventListener('input',ev=>{
    const el=ev.target;
    if(el.dataset.search){ui.search[el.dataset.search]=el.value;render();return;}
    const form=el.closest('form[data-form]');if(!form)return;
    ui.drafts[form.dataset.form+':'+(form.dataset.id||'new')]=Object.fromEntries(new FormData(form));cache();
    try{if(workbench.input(form,el))render();}catch(err){fail(err);}
    if(form.dataset.form==='knowledge'){document.querySelectorAll('[data-action="test-knowledge"],[data-action="publish-knowledge"]').forEach(b=>b.disabled=true);clearFlowTest();}
    if(['flow','flow-query'].includes(form.dataset.form))clearFlowTest();
    if(form.dataset.form==='flow'){document.querySelectorAll('[data-action="test-flow"],[data-action="publish-flow"],[data-form="flow-query"] [type="submit"]').forEach(b=>b.disabled=true);$('[data-flow-unsaved]').hidden=false;}
  });
  document.addEventListener('change',ev=>{const el=ev.target;try{
    const form=el.closest('form[data-form]');if(form)ui.drafts[form.dataset.form+':'+(form.dataset.id||'new')]=Object.fromEntries(new FormData(form));workbench.change(el);
    if(el.dataset.select==='agent'){ui.agentId=el.value;closeModal();ui.deskConversation='';render();}
    if(el.dataset.select==='ops-role'){ui.opsRole=el.value;closeModal();navigate('ops',opsMenus[ui.opsRole][0][0]);render();}
    if(el.dataset.select==='ticket-filter'){ui.ticketFilter=el.value;render();}
    cache();
  }catch(err){fail(err);}});
  document.addEventListener('submit',ev=>{
    const form=ev.target.closest('form[data-form]');if(!form)return;ev.preventDefault();
    const f=form.dataset.form,id=form.dataset.id,data=Object.fromEntries(new FormData(form)),key=f+':'+(id||'new');
    try{
      if(service.submit(form,data)||workbench.submit(form,data))return;
      if(f==='ticket-request'){
        ui.pendingTicket={...ui.pendingTicket,...data,draftKey:key};
        modal('核对服务申请',`<div class="preview-block"><h2>${e(data.title)}</h2><p>${e(data.description)}</p>${ui.pendingTicket.caseId?`<small>关联问题：${e(ui.pendingTicket.caseId)}</small>`:`<small>客户：${e(store.state.customers.find(c=>c.id===data.customerId)?.name)}</small>`}</div><p class="muted">确认后创建或继续原工单。取消不会产生受理记录，也不会执行退款。</p><form data-form="ticket-confirm" data-id="new"><div class="form-footer">${b('取消','close-modal')}<button class="btn primary" type="submit">确认提交申请</button></div></form>`);return;
      }
      if(f==='ticket-confirm'){const request=ui.pendingTicket;if(!request)throw Error('申请已失效，请重新核对');const r=apply('createTicket',{...request,confirmed:true});delete ui.drafts[request.draftKey];ui.pendingTicket=null;toast(r.created?`已受理 ${r.id}`:`已有工单 ${r.id}，继续原记录`);closeModal();render();return;}
      if(f==='customer-say'){apply('say',{id,body:data.body});ui.customerConversation=id;}
      else if(f==='reply'||f==='note')apply(f,{id,body:data.body},f==='note'?'内部备注已保存':'回复已发送');
      else if(f==='complete-case'){apply('completeCase',{id,conversationId:form.dataset.conversation,...data},'处理结果已记录，客户确认单独统计');closeModal();}
      else if(f==='ticket-update'){apply('updateTicket',{id,...data},'处理记录已提交');closeModal();}
      else if(f==='supplement'){apply('supplement',{id,body:data.body},'补充信息已提交');closeModal();}
      else if(f==='dispute'){const conv=apply('feedback',{id,confirmed:false,reason:data.reason},'已继续原问题，原受理记录保留');if(conv)ui.customerConversation=conv;closeModal();}
      else if(f==='assign'){apply(form.dataset.command,{id,ownerId:data.ownerId},'负责人已调整');closeModal();}
      else if(f==='knowledge'){ui.knowledgeId=apply('saveKnowledge',{...data,id:id==='new'?'':id,effectiveAt:new Date(data.effectiveAt+'T00:00:00Z').toISOString(),expiresAt:data.expiresAt?new Date(data.expiresAt+'T00:00:00Z').toISOString():''},'草稿已保存，尚未发布');ui.flowTest=null;}
      else if(f==='disable-knowledge'){apply('disableKnowledge',{id,reason:data.reason},'知识已停用，历史引用保留');closeModal();}
      else if(f==='flow'){apply('saveFlow',{...data,intakeEnabled:data.intakeEnabled==='true'},'策略草稿已保存，尚未发布');ui.flowTest=null;}
      else if(f==='flow-query'){clearFlowTest();if(ui.drafts['flow:new'])throw Error('请先保存策略草稿，再运行单条测试');ui.flowTest=D.classify(store.state,data.query,'C001',Date.now(),store.state.flow.draft||store.state.flow.live,{orderFailure:data.orderFailure==='true'});toast('隔离测试完成，没有创建业务记录');}
      else if(f==='service-settings')apply('serviceSettings',{...data,accepting:data.accepting==='true'},'接待规则已更新');
      else if(f==='review-gap'){apply('reviewGap',{id,...data},'复核结论已保存');closeModal();}
      else if(f==='link-gap'){apply('linkGap',{id,knowledgeId:data.knowledgeId},'已关联整改知识');closeModal();}
      else if(f==='accept-gap'){apply('acceptGap',{id,acceptance:data.acceptance},'复验通过，已验收');closeModal();}
      else throw Error('未知表单');
      if(f!=='flow-query')delete ui.drafts[key];cache();render();if(['customer-say','reply','note'].includes(f))scrollMessages();
    }catch(err){fail(err);}
  });
  document.addEventListener('keydown',ev=>{const dialog=$('#dialog');if(dialog.open&&dialog.parentElement?.classList.contains('phone-overlay-host')){if(ev.key==='Escape'){ev.preventDefault();closeModal();return;}if(ev.key==='Tab'){const fields=[...dialog.querySelectorAll('button,input,textarea,select,a[href]')].filter(x=>!x.disabled&&x.getClientRects().length);const first=fields[0],last=fields.at(-1);if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last?.focus();}else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first?.focus();}}}if((ev.ctrlKey||ev.metaKey)&&ev.key==='Enter'&&ev.target.closest('.composer')){ev.preventDefault();ev.target.closest('form').requestSubmit();}});
  window.addEventListener('hashchange',()=>{closeModal();render();scrollMessages();});
  window.addEventListener('popstate',()=>{closeModal();render();});
  window.addEventListener('storage',ev=>{if(ev.key===store.key)toast('其他页面更新了工作空间。请刷新后继续，当前输入保留。',true);});
  window.addEventListener('error',ev=>{console.error(ev.error);toast('页面出现异常；未提交的操作不会被视为成功。',true);});
  render();scrollMessages();
  function tick(){workbench.tick();setTimeout(tick,1000);}setTimeout(tick,1000);
})();
