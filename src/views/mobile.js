(function(root){
  'use strict';
  const V=root.SupportViews,{e,icon,b,pill,date,empty,messages}=V;
  const connection=data=>['interrupted','offline'].includes(data.connection)?data.connection:'online';
  const isOffline=data=>connection(data)!=='online';
  const disabled=data=>isOffline(data)?'disabled':'';
  function current(data,ui){
    return data.conversations.find(c=>c.id===ui.customerConversation)||data.conversations[0];
  }
  function feedback(data,conv,offline){
    return data.cases.filter(c=>conv.caseIds.includes(c.id)&&c.status==='completed').map(c=>
      `<section class="feedback-card phone-feedback"><strong>这个问题解决了吗？</strong><div class="row">${c.feedback==='confirmed'?pill('已确认解决','good'):b('已解决','confirm-case',c.id,'small',offline?'disabled':'')}${b('仍需帮助',data.services?.some(d=>(d.caseId||d.id)===c.id)?'service-dispute':'dispute-case',c.id,'small text',offline?'disabled':'')}</div></section>`
    ).join('');
  }
  function progressCard(ticket){
    return `<button type="button" class="phone-progress-card" data-action="ticket-detail" data-id="${e(ticket.id)}"><div class="row between"><strong>${e(ticket.title)}</strong>${icon('arrow',16)}</div><small>${e(ticket.id)} · ${date(ticket.createdAt,true)}</small>${pill(ticket.status,ticket.status==='waiting_customer'?'warn':ticket.status==='done'?'good':'')}</button>`;
  }
  V.mobileOrders=function(data){
    return `<div class="phone-order-list">${data.orders.map(order=>order.commerce?V.commerceOrderCard(order,true,isOffline(data)):`<article class="phone-order-card"><div class="phone-order-summary"><span class="phone-product-symbol" aria-hidden="true">${e(order.symbol||'▧')}</span><div><h3>${e(order.product)}</h3><small>${e(order.id)}</small><div class="row">${pill(order.status)}<span class="phone-price">¥${e(order.price.toFixed(2))}</span></div></div></div><div class="phone-order-actions">${b('查物流','order-query',order.id,'',disabled(data))}${b('申请退换货','order-return',order.id,'primary',disabled(data))}</div></article>`).join('')||empty('暂无订单','当前账户没有可查看的订单。')}${isOffline(data)?'<p class="phone-local-notice">连接已断开，恢复后可查询或提交申请。</p>':''}</div>`;
  };
  V.mobileProgress=function(data){
    return `<div class="phone-progress-list">${(data.services?data.services.map(d=>V.serviceCard(d,true)):data.tickets.map(progressCard)).join('')||empty('暂无办理记录','申请受理后，可在这里查看处理进度。')}${isOffline(data)?'<p class="phone-local-notice">当前可查看已保存的进度，恢复连接后再提交补充。</p>':''}</div>`;
  };
  V.mobile=function(data,ui){
    const conv=current(data,ui),status=connection(data),offline=isOffline(data);
    const statusText=status==='offline'?'已离线':status==='interrupted'?'连接中断待确认':'在线';
    const conversationStatus=offline?'连接已断开':conv?V.labels[conv.state]:'在线咨询';
    const draft=conv?ui.drafts?.['customer-say:'+conv.id]?.body||'':'';
    const assigned=conv&&['queued','human'].includes(conv.state);
    const related=conv?(data.services||data.tickets).filter(t=>conv.caseIds.includes(t.caseId||t.id)):[];
    return `<section class="mobile-stage" aria-label="手机端演示"><div class="mobile-left"><div class="mobile-demo-controls"><span>演示状态：<strong>${e(statusText)}</strong></span>${b(offline?'恢复在线':'模拟离线','connection-toggle',offline?'online':'offline','small')}</div><div class="phone-frame"><div class="phone-screen"><div class="phone-status-bar" aria-hidden="true"><span>服务中心</span><span class="phone-status-symbols"><span class="phone-signal">▂▄▆</span><span class="phone-battery"></span></span></div><header class="phone-header"><span class="phone-avatar">${icon('chat',20)}</span><div class="phone-heading"><h1>在线客服</h1><p><span class="phone-status-dot ${offline?'offline':''}"></span>${e(conversationStatus)}</p></div><details class="phone-menu"><summary aria-label="更多咨询操作">•••</summary><div class="phone-menu-content">${b('历史咨询','customer-history','','text')}${b('新咨询','new-conversation','','text',offline?'disabled':'')}</div></details></header>${offline?'<div class="phone-connection-notice" role="status">连接已断开，输入内容已保留。</div>':''}<div class="messages customer-messages phone-messages" id="customer-messages" role="log" aria-label="咨询消息" aria-live="polite">${conv?messages(conv,true,{offline})+feedback(data,conv,offline)+(related.length?`<section class="phone-chat-progress"><h2>相关服务进度</h2>${related.map(d=>data.services?V.serviceCard(d,true):progressCard(d)).join('')}</section>`:''):empty('开始在线咨询','可以选择下方服务，或新建一段咨询。')}</div><nav class="phone-services" aria-label="常用服务">${b(`${icon('book',17)}<span>服务规则</span>`,'quick-policy','','text',offline?'disabled':'')}${b(`${icon('inbox',17)}<span>我的订单</span>`,'mobile-orders','','text')}${b(`${icon('ticket',17)}<span>服务进度</span>`,'mobile-progress','','text')}${b(`${icon('users',17)}<span>${conv?.state==='queued'?'人工排队中':conv?.state==='human'?'人工已接待':'联系人工'}</span>`,'request-human',conv?.id||'','text',offline||assigned?'disabled':'')}</nav>${conv?`<form class="composer phone-composer" data-form="customer-say" data-id="${e(conv.id)}" data-offline="${offline}"><label class="sr-only" for="customer-input">请输入问题</label><textarea id="customer-input" data-focus="customer-input" name="body" rows="2" maxlength="2000" required placeholder="请输入问题，或提供订单号…" aria-describedby="phone-send-hint">${e(draft)}</textarea><div class="phone-compose-actions"><span id="phone-send-hint">${offline?'恢复在线后可发送':conv.state==='queued'?'补充信息会一并交给客服':conv.state==='closed'?'继续发送可重新联系':'请勿发送密码或验证码'}</span><button class="btn primary" type="submit" ${offline?'disabled':''}>发送 ${icon('send',15)}</button></div></form>`:`<div class="phone-start">${b('新咨询','new-conversation','','primary',offline?'disabled':'')}</div>`}${conv?.state==='queued'?`<div class="phone-queue-footer">${b('取消排队，继续咨询','cancel-queue',conv.id,'text',offline?'disabled':'')}</div>`:''}<div class="phone-home-indicator" aria-hidden="true"></div><div class="phone-overlay-host"></div></div></div></div><div class="mobile-blank" aria-hidden="true"></div></section>`;
  };
})(window);
