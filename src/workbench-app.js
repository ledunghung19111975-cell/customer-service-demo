(function(root){
  'use strict';
  root.SupportWorkbench={create(ctx){
    const {D,V,ui,store,identity,apply,modal,closeModal,render,cache,toast,intake:legacyIntake}=ctx;
    const {e,b,field,options,date,empty}=V;
    const $=s=>document.querySelector(s), hour=3600000;
    const bj=ms=>ms?new Date(Number(ms)+8*hour).toISOString().slice(0,16):'';
    const at=value=>value?Date.parse(value+':00+08:00'):NaN;
    const requestKey=()=>crypto.randomUUID?.()||String(Date.now());
    const draft=(key,defaults)=>({...defaults,...ui.drafts[key]});
    const currentCase=id=>D.get(store.state,'cases',id);
    const convFor=(caseId,id)=>id||(identity().role==='customer'?store.state.conversations.find(c=>c.caseIds.includes(caseId)&&c.id===ui.customerConversation)||store.state.conversations.find(c=>c.caseIds.includes(caseId)&&c.customerId===identity().id):store.state.conversations.find(c=>c.caseIds.includes(caseId)&&c.state==='human'&&c.ownerId===identity().id))?.id||'';
    let pendingSuggestion=null,closing=null,pendingOrder=null,needsRender=false;const failedAi=new Set(),suppressedAi=new Set(ui.aiInputSuppressed||[]);
    function owned(id){const c=D.get(store.state,'conversations',id);if(identity().role!=='agent'||c.ownerId!==identity().id||c.state!=='human')throw Error('请先取得本会话接待权');return c;}
    function connected(){if(identity().role==='customer'&&D.customerConnection(store.state,identity().id)!=='online')throw Error('连接已断开，请先恢复在线；输入内容已保留。');}
    function after(success){closeModal();render();if(success)toast(success);cache();}
    function orderFacts(id,customerId){const o=store.state.orders.find(o=>o.id===id&&o.customerId===customerId);return o?`<div class="order-facts"><strong>${e(o.product)}</strong><p>${e(o.id)} · ${e(o.status)} · ¥${Number(o.price).toFixed(2)}</p><p>规格：${e(o.spec||o.variant||'待核对')}　数量：${e(o.quantity??'待核对')}</p><small>订单记录提供以上信息；退换货资格仍需客服核对。</small></div>`:'<p class="muted">请选择客户本人订单。未确认的信息保持为空。</p>';}
    function intake(caseId,conversationId='',reuse=false){
      const c=currentCase(caseId);if(c.kind!=='aftersales')return legacyIntake(caseId,conversationId);
      if(identity().role==='customer'){connected();if(c.customerId!==identity().id)throw Error('无权查看该问题');}
      else owned(convFor(caseId,conversationId));
      const key='ticket-request:'+caseId,previous=reuse?ui.pendingTicket:null;
      const v=draft(key,{title:c.title||'退换货申请',orderId:c.orderId||'',serviceType:'',description:'',exchangeRequest:'',extraNote:''});
      const cv=convFor(caseId,conversationId),sop=cv?D.sopView(store.state,cv,caseId):null;
      if(!ui.drafts[key]&&sop?.prefill)Object.assign(v,sop.prefill);
      ui.pendingTicket={caseId,conversationId:cv,structured:true,requestKey:previous?.requestKey||requestKey(),draftKey:key};
      const orders=store.state.orders.filter(o=>o.customerId===c.customerId),policy=D.retrieve(store.state,'退货规则');
      const policyNote=policy&&!policy.conflict?`<details class="intake-policy"><summary>规则依据 · ${e(policy.title)} v${e(policy.version)}</summary><p>${e(policy.answer)}</p><small>${e(policy.source)}；具体资格待客服核实。</small></details>`:'<p class="muted">当前没有可直接采用的售后规则，请人工核实办理条件。</p>';
      modal('退换货申请',`<form data-form="ticket-request" data-id="${e(caseId)}"><div class="readonly-context">客户：${e(c.customerId)} · 问题：${e(c.id)}<br>${e(c.title)}</div>${field('申请标题','title',v.title,'text','required maxlength="100"')}<label class="field"><span>核对订单</span><select name="orderId" required data-intake-order>${options([['','请选择订单'],...orders.map(o=>[o.id,o.id+' · '+o.product])],v.orderId)}</select></label><div data-order-facts>${orderFacts(v.orderId,c.customerId)}</div><label class="field"><span>申请类型</span><select name="serviceType" required data-intake-type>${options([['','请选择'],['return','退货'],['exchange','换货']],v.serviceType)}</select></label>${policyNote}${field('申请原因','description',v.description,'textarea','required maxlength="2000"')}${field('换货要求（换货时必填）','exchangeRequest',v.exchangeRequest,'textarea',`maxlength="200" ${v.serviceType==='exchange'?'required':''}`)}${field('补充说明','extraNote',v.extraNote,'textarea','maxlength="1000"')}<p class="muted small-text">预填内容来自当前问题与客户消息，请逐项核对。确认前不会创建工单。</p><div class="form-footer">${b('取消','close-modal')}<button type="submit" class="btn primary">核对申请</button></div></form>`);
    }
    function intakePreview(data){
      const r=ui.pendingTicket;if(!r?.structured)throw Error('申请上下文已失效');
      if(!['return','exchange'].includes(data.serviceType))throw Error('请选择申请类型');
      if(!data.description.trim())throw Error('请填写申请原因');
      if(data.serviceType==='exchange'&&!data.exchangeRequest.trim())throw Error('请填写换货要求');
      const c=currentCase(r.caseId);if(!store.state.orders.some(o=>o.customerId===c.customerId&&o.id===data.orderId))throw Error('请选择客户本人订单');
      ui.drafts[r.draftKey]={...data};ui.pendingTicket={...r,...data,previewToken:D.intakeToken(store.state,r.caseId,data.orderId,r.conversationId)};
      modal('核对退换货申请',`<div class="preview-block"><h2>${e(data.title)}</h2><p>客户 ${e(c.customerId)} · 问题 ${e(c.id)}</p>${orderFacts(data.orderId,c.customerId)}<p>类型：${data.serviceType==='exchange'?'换货':'退货'}</p><p>申请原因：${e(data.description)}</p>${data.serviceType==='exchange'?`<p>换货要求：${e(data.exchangeRequest)}</p>`:''}<p>补充说明：${e(data.extraNote||'无')}</p></div><p class="muted">确认后登记或继续原工单，尚不代表退款或换货完成。</p><form data-form="ticket-confirm" data-id="${e(c.id)}"><div class="form-footer">${b('返回修改','intake-back')}${b('取消','close-modal')}<button class="btn primary" type="submit">确认提交申请</button></div></form>`);
    }
    function suggestionFor(el){const id=el.dataset.conversation||ui.visibleConversation,caseId=el.dataset.id||ui.sopCaseByConversation?.[id];owned(id);const suggestion=D.suggestion(store.state,id,caseId);if(suggestion.status!=='ready')throw Error(suggestion.reason||'当前没有可用的答复依据，请先核对问题');return {id,caseId,suggestion};}
    function insertSuggestion(value,mode){
      const fresh=D.suggestion(store.state,value.id,value.caseId);owned(value.id);if(fresh.token!==value.suggestion.token||fresh.status!=='ready')throw Error('答复依据已变化，请重新查看建议');
      pauseWhileTyping(value.id);const key='reply:'+value.id,body=ui.drafts[key]?.body||'';
      ui.composeMode='reply';ui.drafts[key]={body:mode==='append'&&body?body+'\n\n'+fresh.body:fresh.body};
      ui.suggestionRefs||={};ui.suggestionRefs[identity().id+':'+value.id]={token:fresh.token,caseId:value.caseId,body:fresh.body};if(mode==='replace'&&ui.orderReplyRefs)delete ui.orderReplyRefs[identity().id+':'+value.id];
      pendingSuggestion=null;after('已填入草稿，请核对后发送');$('#agent-input')?.focus();
    }
    function showSuggestion(el){const value=suggestionFor(el);if(ui.drafts['reply:'+value.id]?.body?.trim()){
      pendingSuggestion=value;modal('草稿已有内容',`<p>保留并追加，或用以下建议替换草稿。</p><div class="result-note">${e(value.suggestion.body)}</div><div class="form-footer">${b('取消','close-modal')}${b('追加到草稿','suggestion-append')}${b('替换草稿','suggestion-replace','','primary')}</div>`);
    }else insertSuggestion(value,'replace');}
    function insertOrder(value,mode){
      owned(value.id);const c=currentCase(value.caseId),order=store.state.orders.find(o=>o.id===c.orderId&&o.customerId===c.customerId);
      const facts=order&&store.state.schema===5?window.SupportCommerce.snapshot(store.state,order.id):null,snapshot=order&&{...D.copy(order),...(facts?{commerce:facts}:{})};
      if(!order||JSON.stringify(snapshot)!==JSON.stringify(value.order))throw Error('订单信息已变化，请重新查询再采用');
      pauseWhileTyping(value.id);const key='reply:'+value.id,body=ui.drafts[key]?.body||'';
      ui.composeMode='reply';ui.drafts[key]={body:mode==='append'&&body?body+'\n\n'+value.body:value.body};
      ui.orderReplyRefs||={};ui.orderReplyRefs[identity().id+':'+value.id]={caseId:value.caseId,order:D.copy(value.order),body:value.body};
      if(mode==='replace'&&ui.suggestionRefs)delete ui.suggestionRefs[identity().id+':'+value.id];
      pendingOrder=null;after('查询结果已填入草稿，请核对后发送');$('#agent-input')?.focus();
    }
    function orderDraft(el){
      const id=el.dataset.conversation,c=currentCase(el.dataset.id);owned(id);
      const query=c.workflow?.logistics,order=store.state.orders.find(o=>o.id===c.orderId&&o.customerId===c.customerId);
      if(!query||!order||JSON.stringify(query.order)!==JSON.stringify(order))throw Error('请先重新查询当前订单');
      const facts=store.state.schema===5?window.SupportCommerce.snapshot(store.state,order.id):null;
      if(facts&&(facts.queryStatus!=='ok'||JSON.stringify(facts)!==JSON.stringify(query.commerce)))throw Error('查询结果不完整或已经变化，请重新核实后回复');
      const value={id,caseId:c.id,order:{...D.copy(order),...(facts?{commerce:facts}:{})},body:facts?window.SupportCommerce.summary(facts):`${order.product}：${order.status}。${order.delivery||'暂无物流说明'}`};
      if(ui.drafts['reply:'+id]?.body?.trim()){pendingOrder=value;modal('草稿已有内容',`<p>查询结果来自刚才核对的订单。</p><div class="result-note">${e(value.body)}</div><div class="form-footer">${b('取消','close-modal')}${b('追加到草稿','order-draft-append')}${b('替换草稿','order-draft-replace','','primary')}</div>`);}
      else insertOrder(value,'replace');
    }
    function source(el){const id=el.dataset.conversation||ui.visibleConversation;if(!D.deskView(store.state,identity()).conversations.some(c=>c.id===id))throw Error('无权查看依据');const v={suggestion:D.suggestion(store.state,id,el.dataset.id)},k=v.suggestion.knowledge;modal('建议依据',k?`<h2>${e(k.title)}</h2><p>${e(k.source)} · v${e(k.version)}</p><p>${e(k.answer)}</p><p class="muted">发送前会再次核对来源与当前问题；已发送的引用保留当时版本。</p>`:`<p>${e(v.suggestion.body)}</p>`);}
    function closePanel(id){
      const cv=owned(id),p=D.closePreview(store.state,id),key='close-summary:'+id;
      closing={id,token:p.token,items:p.items,requestKey:closing?.id===id?closing.requestKey:requestKey()};
      const v=draft(key,{reason:D.customerConnection(store.state,cv.customerId)==='online'?'本次沟通结束':'客户离线',summary:p.summary||''});
      const cases=[...new Set([...p.items.map(x=>x.caseId),...cv.caseIds])];
      const customer=D.get(store.state,'customers',cv.customerId),receptionist=D.actor(store.state,identity());
      modal('结束沟通与后续安排',`<form data-form="close-summary" data-id="${e(id)}"><div class="readonly-context">客户：${e(customer.name)} · ${e(customer.id)}<br>会话：${e(cv.id)} · 接待人：${e(receptionist.name)}<br>开始时间：${e(bj(cv.createdAt).replace('T',' '))} UTC+08:00</div><p class="muted">结束沟通只关闭当前接待。以下事项仍会保留待处理状态，直至实际办理。同一问题共用跟进工单，各节点目标时间应一致。</p>${field('关闭原因','reason',v.reason,'text','required maxlength="200"')}${field('本次沟通摘要','summary',v.summary,'textarea','required maxlength="1000"')}<h3>尚未完成的 SOP 事项</h3>${p.items.map(item=>{
        const i=item.caseId+'_'+item.nodeKey;
        const tickets=store.state.tickets.filter(t=>t.caseId===item.caseId&&t.status!=='done');
        return `<fieldset class="close-item"><legend>${e(item.caseTitle)} · ${e(item.title)}</legend><p>${e(item.reason||'待完成')}</p><label class="field"><span>后续安排</span><select name="action_${i}">${options([['new','创建跟进工单'],['existing','由已有工单跟进'],['callback','安排回访'],['na','不适用'],['withdrawn','客户撤回']],v['action_'+i]||(item.ticketId?'existing':'new'))}</select></label>${field('未完成原因 / 安排说明','reason_'+i,v['reason_'+i]||'','textarea','required maxlength="500"')}<label class="field"><span>关联工单（选择已有工单时）</span><select name="ticket_${i}">${options([['','请选择'],...tickets.map(t=>[t.id,t.id+' · '+t.title+' · '+(store.state.staff.find(a=>a.id===t.ownerId)?.name||'未分配')])],v['ticket_'+i]||item.ticketId||'')}</select></label>${field('目标时间（北京时间 UTC+08:00）','due_'+i,v['due_'+i]||bj(item.dueAt>Date.now()?item.dueAt:Date.now()+24*hour),'datetime-local')}</fieldset>`;
      }).join('')||'<p class="muted">当前没有必须安排的未完成事项。</p>'}<h3>回访安排</h3><p class="muted small-text">回访记录仅保存在站内，不会自动向客户发送提醒。</p>${cases.map(caseId=>{const c=currentCase(caseId),t=store.state.tickets.find(t=>t.caseId===caseId&&t.status!=='done');return `<fieldset class="close-item"><legend>${e(c.title)}</legend><label class="row"><input type="checkbox" name="callback_${e(caseId)}" value="yes" ${v['callback_'+caseId]?'checked':''}>需要回访</label><p class="muted small-text">负责人：${e(store.state.staff.find(a=>a.id===(t?.ownerId||identity().id))?.name||'待分配')}（随工单负责人流转）</p>${field('回访目的','purpose_'+caseId,v['purpose_'+caseId]||'','textarea','maxlength="1000"')}${field('计划时间（北京时间 UTC+08:00）','at_'+caseId,v['at_'+caseId]||'','datetime-local')}${field('回访备注（内部）','note_'+caseId,v['note_'+caseId]||'','textarea','maxlength="1000"')}</fieldset>`;}).join('')}<div class="form-footer">${b('取消','close-modal')}${b('刷新待办清单','refresh-close',id)}<button type="submit" class="btn primary">保存安排并结束沟通</button></div></form>`);
    }
    function closeSubmit(data){
      if(!closing)throw Error('请重新打开关闭面板');
      const items=closing.items.map(item=>{const i=item.caseId+'_'+item.nodeKey,action=data['action_'+i],ticketId=data['ticket_'+i]||'',due=at(data['due_'+i]),t=store.state.tickets.find(t=>t.id===ticketId);if(['existing','new','callback'].includes(action)&&!Number.isFinite(due))throw Error('请为跟进事项填写有效目标时间');return {caseId:item.caseId,nodeKey:item.nodeKey,action,reason:data['reason_'+i],ticketId,...(action==='existing'&&t&&bj(t.dueAt)===data['due_'+i]?{}:{dueAt:due})};});
      const callbacks=Object.keys(data).filter(k=>k.startsWith('callback_')&&data[k]==='yes').map(k=>{const caseId=k.slice(9);return {caseId,purpose:data['purpose_'+caseId],at:at(data['at_'+caseId]),note:data['note_'+caseId]||''};});
      apply('closeWithSummary',{id:closing.id,token:closing.token,reason:data.reason,summary:data.summary,items,callbacks,requestKey:closing.requestKey});
      delete ui.drafts['close-summary:'+closing.id];closing=null;after('沟通已结束，后续安排已保存');
    }
    function callbackPanel(id,result=false){
      const t=D.get(store.state,'tickets',id);if(identity().role!=='agent'||t.ownerId!==identity().id)throw Error('只有当前工单负责人可以安排或记录回访');
      const key=(result?'callback-result:':'callback-plan:')+id,v=draft(key,result?{result:'contacted',summary:'',nextAt:''}:{purpose:t.callback?.purpose||'',at:bj(t.callback?.at),note:t.callback?.note||''});
      modal(result?'记录回访结果':'安排回访',`<p>${e(t.id)} · ${e(t.title)}</p><p class="muted">负责人：${e(D.actor(store.state,identity()).name)}，随工单负责人流转。仅作站内记录。</p>${t.callback?.history?.length?`<details><summary>回访历史</summary>${t.callback.history.map(h=>`<p>${e(bj(h.at).replace('T',' '))} UTC+08:00 · ${e({contacted:'已联系',unreachable:'未接通',cancelled:'已取消',rescheduled:'调整计划'}[h.result||h.action]||h.result||h.action)} · ${e(h.summary||h.previous?.purpose||'')} ${h.nextAt?'下次：'+e(bj(h.nextAt).replace('T',' ')):''}</p>`).join('')}</details>`:''}<form data-form="${result?'callback-result':'callback-plan'}" data-id="${e(id)}">${result?`<label class="field"><span>回访结果</span><select name="result">${options([['contacted','已联系'],['unreachable','未接通，重新安排'],['cancelled','取消回访']],v.result)}</select></label>${field('结果摘要 / 取消原因','summary',v.summary,'textarea','required maxlength="1000"')}${field('再次回访时间（未接通时必填，北京时间 UTC+08:00）','nextAt',v.nextAt,'datetime-local')}`:`${field('回访目的','purpose',v.purpose,'textarea','required maxlength="1000"')}${field('计划时间（北京时间 UTC+08:00）','at',v.at,'datetime-local','required')}${field('备注（仅内部可见）','note',v.note,'textarea','maxlength="1000"')}`}<div class="form-footer">${b('取消','close-modal')}<button type="submit" class="btn primary">保存回访记录</button></div></form>`);
    }
    const actions={
      intake(el){intake(el.dataset.id);},
      'staff-intake'(el){intake(el.dataset.id,el.dataset.conversation);},
      'sop-intake'(el){intake(el.dataset.id,el.dataset.conversation);},
      'intake-back'(){const r=ui.pendingTicket;if(!r)throw Error('申请草稿不存在');intake(r.caseId,r.conversationId,true);},
      'select-sop-case'(el){ui.sopCaseByConversation||={};ui.sopCaseByConversation[el.dataset.conversation]=el.dataset.id;render();},
      'toggle-sop-node'(el){ui.sopNodeByCase||={};ui.sopNodeByCase[el.dataset.case]=ui.sopNodeByCase[el.dataset.case]===el.dataset.id?'':el.dataset.id;render();},
      'sop-query-order'(el){apply('queryOrder',{conversationId:el.dataset.conversation,caseId:el.dataset.id},'已查询订单，核对记录已保存');render();},
      'sop-insert-order':orderDraft,
      'order-draft-append'(){if(!pendingOrder)throw Error('查询结果已失效');insertOrder(pendingOrder,'append');},
      'order-draft-replace'(){if(!pendingOrder)throw Error('查询结果已失效');insertOrder(pendingOrder,'replace');},
      'sop-na'(el){mark(el,'na');},'sop-wait'(el){mark(el,'waiting');},
      'ai-toggle'(el){const c=owned(el.dataset.id),enabled=!c.aiAssist?.enabled;apply('setAiAssist',{id:c.id,enabled});if(enabled)suppressedAi.delete(c.id);else suppressedAi.add(c.id);ui.aiInputSuppressed=[...suppressedAi];render();},
      'dynamic-suggestion':showSuggestion,
      'insert-suggestion'(el){showSuggestion({dataset:{id:ui.sopCaseByConversation?.[ui.visibleConversation],conversation:ui.visibleConversation}});},
      'suggestion-source':source,
      'suggestion-append'(){if(!pendingSuggestion)throw Error('建议已失效');insertSuggestion(pendingSuggestion,'append');},
      'suggestion-replace'(){if(!pendingSuggestion)throw Error('建议已失效');insertSuggestion(pendingSuggestion,'replace');},
      'recheck-suggestion'(el){const cv=owned(el.dataset.id),ref=ui.suggestionRefs?.[identity().id+':'+cv.id],fresh=ref&&D.suggestion(store.state,cv.id,ref.caseId);if(!fresh||fresh.status!=='ready'||fresh.token!==el.dataset.token)throw Error('依据再次变化，请重新核对');ref.token=fresh.token;after('已核对当前依据，请检查草稿并再次发送');},
      'discard-draft-suggestion'(el){const key=identity().id+':'+el.dataset.id,ref=ui.suggestionRefs?.[key],draft=ui.drafts['reply:'+el.dataset.id];owned(el.dataset.id);if(ref&&draft)draft.body=draft.body.replace(ref.body,'').trim();if(ref)delete ui.suggestionRefs[key];after('已放弃建议，剩余草稿请人工核实');},
      'dismiss-suggestion'(el){const v=suggestionFor(el);ui.dismissedSuggestionTokens||={};ui.dismissedSuggestionTokens[v.id+':'+v.caseId]=v.suggestion.token;render();},
      'close-conversation'(el){closePanel(el.dataset.id);},
      'refresh-close'(el){closePanel(el.dataset.id);},
      'close-history'(el){
        const cv=D.get(store.state,'conversations',el.dataset.id);
        if(!D.deskView(store.state,identity()).conversations.some(c=>c.id===cv.id))throw Error('无权查看记录');
        const h=D.closePreview(store.state,cv.id).history;
        const actionNames={existing:'原工单跟进',new:'创建跟进工单',callback:'安排回访',na:'不适用',withdrawn:'客户撤回'};
        const statusNames={idle:'未触发',todo:'待处理',doing:'处理中',waiting:'待客户补充',done:'已完成',na:'不适用',error:'异常'};
        const time=value=>value?bj(value).replace('T',' ')+' UTC+08:00':'—';
        modal('结束沟通记录',h.map(x=>`<article class="close-item"><h3>${e(time(x.at))}</h3><p>${e(x.reason)}</p><p>${e(x.summary)}</p><h3>当时的节点与后续安排</h3>${(x.items||[]).map(i=>`<div class="order-facts"><strong>${e(i.caseTitle)} · ${e(i.title||i.nodeKey)}</strong><p>${e(statusNames[i.status]||i.status)} · ${e(i.reason)}</p><p>${e(actionNames[i.action]||i.action)} ${e(i.ticketId||'')} · ${e(store.state.staff.find(a=>a.id===i.ownerId)?.name||i.ownerId||'无负责人')}</p>${i.dueAt?`<p>目标：${e(time(i.dueAt))}</p>`:''}</div>`).join('')||'<p>无未完成事项</p>'}<details><summary>全部节点快照</summary>${(x.sop||[]).map((nodes,i)=>`<p>问题 ${i+1}：${nodes.map(n=>e(n.title)+' · '+e(statusNames[n.status]||n.status)).join(' / ')}</p>`).join('')}</details><h3>当时的回访安排</h3>${(x.callbacks||[]).map(c=>`<div class="order-facts"><strong>${e(c.purpose)}</strong><p>${e(c.ticketId)} · ${e(store.state.staff.find(a=>a.id===c.ownerId)?.name||c.ownerId)}</p><p>${e(time(c.at))}</p><p>${e(c.note||'无备注')}</p></div>`).join('')||'<p>无回访安排</p>'}</article>`).join('')||empty('暂无结束沟通记录'));
      },
      'callback-plan'(el){callbackPanel(el.dataset.id);},'callback-result'(el){callbackPanel(el.dataset.id,true);},
      'mobile-orders'(){modal('我的订单',V.mobileOrders(D.customerView(store.state,'C001'),ui));},
      'mobile-progress'(){modal('服务进度',V.mobileProgress(D.customerView(store.state,'C001'),ui));},
      'connection-toggle'(el){apply('customerConnection',{status:el.dataset.id});closeModal();render();toast(el.dataset.id==='online'?'连接已恢复':'已模拟客户离线');}
    };
    function mark(el,status){modal('记录节点状态',`<form data-form="sop-mark" data-id="${e(el.dataset.case+':'+el.dataset.id)}" data-node-key="${e(el.dataset.id)}" data-case="${e(el.dataset.case)}" data-conversation="${e(el.dataset.conversation)}" data-status="${status}">${field('原因说明','reason','','textarea','required maxlength="500"')}<button type="submit" class="btn primary">保存状态</button></form>`);}
    function submit(form,data){
      const f=form.dataset.form,id=form.dataset.id,key=f+':'+(id||'new');
      if(identity().role==='customer'&&['customer-say','ticket-request','ticket-confirm','supplement','dispute'].includes(f))connected();
      if(f==='ticket-request'&&ui.pendingTicket?.structured){intakePreview(data);cache();return true;}
      if(f==='ticket-confirm'&&ui.pendingTicket?.structured){const r=ui.pendingTicket,value=apply('createTicket',{...r,confirmed:true});delete ui.drafts[r.draftKey];ui.pendingTicket=null;after(value.created?'申请已受理':'已继续原工单');return true;}
      if(f==='close-summary'){closeSubmit(data);return true;}
      if(f==='sop-intent')apply('confirmIntent',{conversationId:form.dataset.conversation,caseId:id,...data},'诉求已核对');
      else if(f==='sop-order'){const r=apply('bindOrder',{conversationId:form.dataset.conversation,caseId:id,orderId:data.orderId},'订单已核对');if(r){ui.sopCaseByConversation||={};ui.sopCaseByConversation[form.dataset.conversation]=typeof r==='string'?r:r.caseId;}}
      else if(f==='sop-mark'){apply('markSop',{conversationId:form.dataset.conversation,caseId:form.dataset.case,nodeKey:form.dataset.nodeKey,status:form.dataset.status,reason:data.reason});closeModal();}
      else if(f==='callback-plan'){apply('saveCallback',{ticketId:id,purpose:data.purpose,at:at(data.at),note:data.note},'回访已安排');closeModal();}
      else if(f==='callback-result'){apply('callbackResult',{ticketId:id,result:data.result,summary:data.summary,nextAt:at(data.nextAt)},'回访结果已记录');closeModal();}
      else if(f==='reply'){
        const ref=ui.suggestionRefs?.[identity().id+':'+id],orderRef=ui.orderReplyRefs?.[identity().id+':'+id];
        const selected=$('.sop-case-tab.active'),caseId=ref?.caseId||orderRef?.caseId||(selected?.dataset.conversation===id?selected.dataset.id:undefined);
        if(ref){const fresh=D.suggestion(store.state,id,ref.caseId);if(fresh.token!==ref.token||fresh.status!=='ready'){modal('答复依据已变化',`<p>当前草稿已保留，发送前请重新核对。</p><div class="result-note">${e(fresh.body||fresh.reason)}</div>${fresh.knowledge?`<p>${e(fresh.knowledge.title)} · v${e(fresh.knowledge.version)} · ${e(fresh.knowledge.source)}</p>`:''}<div class="form-footer">${b('返回修改','close-modal')}${b('放弃建议','discard-draft-suggestion',id)}${fresh.status==='ready'?b('已核对，保留草稿','recheck-suggestion',id,'primary',`data-token="${e(fresh.token)}"`):''}</div>`);return true;}}
        apply('reply',{id,body:data.body,caseId,...(orderRef?{orderCaseId:orderRef.caseId,orderSnapshot:orderRef.order}:{}),...(ref?{suggestionToken:ref.token,suggestionCaseId:ref.caseId}:{})},'回复已发送');
        if(ref)delete ui.suggestionRefs[identity().id+':'+id];if(orderRef)delete ui.orderReplyRefs[identity().id+':'+id];
      }else return false;
      delete ui.drafts[key];render();cache();if(f==='reply')ctx.scrollMessages();return true;
    }
    function pauseWhileTyping(id){
      const cv=D.get(store.state,'conversations',id);
      if(cv.state!=='human'||cv.ownerId!==identity().id)return false;
      suppressedAi.add(id);ui.aiInputSuppressed=[...suppressedAi];cache();
      if(cv.aiAssist?.enabled){apply('setAiAssist',{id,enabled:false});toast('人工正在输入，AI 续答已暂停');return true;}
      return false;
    }
    function input(form){
      if(['reply','note'].includes(form.dataset.form)&&identity().role==='agent')return pauseWhileTyping(form.dataset.id);
      return false;
    }
    function change(el){
      if(el.dataset.intakeType!==undefined){const input=el.closest('form').elements.namedItem('exchangeRequest');if(input)input.required=el.value==='exchange';}
      if(el.dataset.intakeOrder!==undefined&&ui.pendingTicket?.structured){const c=currentCase(ui.pendingTicket.caseId),target=$('[data-order-facts]');if(target)target.innerHTML=orderFacts(el.value,c.customerId);}
    }
    function tick(){
      if(store.blocked)return;
      let changed=false;
      for(const c of store.state.conversations){if(suppressedAi.has(c.id))continue;const pending=D.aiPending(store.state,c.id);if(pending&&pending.dueAt<=Date.now()&&!failedAi.has(pending.token)){
        try{store.dispatch({role:'agent',id:pending.ownerId},'aiContinue',{id:c.id,messageId:pending.messageId,token:pending.token});changed=true;}
        catch(err){failedAi.add(pending.token);toast(err.message||'AI 续答已暂停，请检查会话',true);}
      }}
      if(changed){if($('#dialog').open)needsRender=true;else{needsRender=false;render();}}
    }
    return {actions,submit,input,change,tick,afterRender(){if(ui.workspace!=='desk'||ui.deskPage!=='inbox'||!ui.visibleConversation)return;const caseId=$('.sop-case-tab.active')?.dataset.id;if(!caseId)return;const sg=D.suggestion(store.state,ui.visibleConversation,caseId);if(sg.status!=='ready')return;ui.seenSuggestionTokens||={};const key=ui.visibleConversation+':'+caseId;if(ui.seenSuggestionTokens[key]!==sg.token){ui.seenSuggestionTokens[key]=sg.token;toast('有新的答复建议，请核对来源后使用');}},onClose(){const pending=needsRender;needsRender=false;return pending;}};
  }};
})(window);
