/* 知序 V3：保留原十页布局，新增事项与受理、知识治理、发布回归和整改联动。 */
'use strict';
const Core = window.CustomerDemo;
const STORAGE_KEY = 'zhixu-customer-demo-v3';
let storageAvailable = true;
let state;
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  state = saved && saved.schema === 3 && Array.isArray(saved.items) && Array.isArray(saved.releases) && Array.isArray(saved.evaluations) && saved.runtime && Array.isArray(saved.sessions) && Array.isArray(saved.knowledge) && Array.isArray(saved.tickets) && Array.isArray(saved.issues) && saved.robot && saved.draft && saved.published ? saved : Core.newState();
} catch { state = Core.newState(); storageAvailable = false; }
state.workspace ||= { forms: {} };
state.workspace.forms ||= {};
const ui = { page: 'overview', session: state.workspace.session || state.sessions[0]?.id, play: state.workspace.play || state.sessions.find(s => s.name === '林小夏')?.id, node: state.workspace.node || 'router', qualityTab: 'issues', flowTest: null, returnTo: null, modalContext: null, filters: { knowledge: '', knowledgeStatus: '', tickets: '', ticketStatus: '', sessions: '', sessionStatus: '', qualityStatus: '' } };
const navItems = [
  ['工作空间', 'overview', '工作台', 'grid'], ['', 'playground', '体验中心', 'play'],
  ['机器人与知识', 'robot', '机器人配置', 'bot'], ['', 'workflow', '流程编排', 'flow'], ['', 'knowledge', '知识库', 'book'],
  ['服务运营', 'sessions', '会话中心', 'chat'], ['', 'tickets', '工单中心', 'ticket'], ['', 'quality', '质检与日志', 'shield'],
  ['系统管理', 'integrations', '接入与集成', 'plug'], ['', 'architecture', '系统架构', 'layers']
];
const sessionNames = { bot: '机器人接待', waiting: '等待接管', human: '人工服务', offline: '人工离线', ended: '已结束' };
const sessionColors = { bot: 'blue', waiting: 'orange', human: 'green', offline: 'orange', ended: '' };
const knowledgeNames = { draft: '草稿', published: '已发布', disabled: '已停用' };
const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const e = escapeHTML;
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const badge = (text, color = '') => `<span class="badge ${color}">${e(text)}</span>`;
const dateTime = time => new Date(time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const clockTime = time => new Date(time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
const empty = text => `<div class="empty">${e(text)}</div>`;
const button = (text, action, args = '', style = '') => `<button type="button" class="btn ${style}" data-action="${action}" ${args}>${text}</button>`;
const heading = (title, subtitle, actions = '') => `<div class="page-heading"><div><h1>${e(title)}</h1><p>${e(subtitle)}</p></div><div class="row">${actions}</div></div>`;
const selectOptions = (values, selected) => values.map(v => { const [id, text] = Array.isArray(v) ? v : [v, v]; return `<option value="${e(id)}" ${id === selected ? 'selected' : ''}>${e(text)}</option>`; }).join('');
const search = (filter, placeholder) => `<div class="search-field">${icon('search')}<input data-filter="${filter}" aria-label="${e(placeholder)}" placeholder="${e(placeholder)}" value="${e(ui.filters[filter])}"></div>`;
function save() {
  Object.assign(state.workspace, { session: ui.session, play: ui.play, node: ui.node });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageAvailable = true; }
  catch { storageAvailable = false; }
  $('#storage-warning').hidden = storageAvailable;
}
let toastTimer;
function toast(text) { $('#toast').textContent = text + (storageAvailable ? '' : '（仅当前页面有效，未持久保存）'); $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3300); }
function modal(title, body) {
  $('#modal-content').innerHTML = `<div class="modal-head"><h2 id="modal-title">${e(title)}</h2><button class="icon-btn" type="button" data-action="close-modal" aria-label="关闭弹窗">${icon('close')}</button></div><div class="modal-body">${body}</div>`;
  if (!$('#modal').open) $('#modal').showModal();
  restoreForms($('#modal'));
  $('#modal').querySelector('input:not([type="hidden"]),textarea,select')?.focus();
}
function closeModal() { $('#modal').close(); ui.modalContext = null; }
function dismissConfirmation() { $('#confirm-dialog').close(); ui.confirm=null; }
function go(page) {
  dismissConfirmation();
  if (location.hash.slice(1) !== page) history.pushState(null, '', '#' + page);
  render(); $('#page').focus({preventScroll:true}); window.scrollTo(0,0);
}
const formKey = form => `${form.dataset.form}:${form.dataset.id || form.dataset.session || 'new'}${form.dataset.form==='new-ticket'?':'+(form.dataset.visitor==='true'?'visitor':'staff'):''}`;
const formValues = form => Object.fromEntries(new FormData(form));
function showDraftStatus(form) {
  if (['flow-test','knowledge-test'].includes(form.dataset.form)) return;
  const dirty = Boolean(state.workspace.forms[formKey(form)]);
  let notice = form.querySelector('.draft-notice');
  if (!notice) {
    notice = document.createElement('div'); notice.className = 'draft-notice';
    notice.innerHTML = '<span>输入已暂存，尚未提交</span><button type="button" class="text-link" data-action="discard-input">放弃输入</button>';
    form.prepend(notice);
  }
  notice.hidden = !dirty;
  const chat = form.querySelector('[data-chat-input]');
  if (chat) form.querySelector('[type="submit"]').disabled = chat.disabled || !chat.value.trim();
}
function restoreForms(root) {
  root.querySelectorAll('form[data-form]').forEach(form => {
    if (form.dataset.form === 'node') return;
    form.dataset.baseline = JSON.stringify(formValues(form));
    const draft = state.workspace.forms[formKey(form)];
    if (draft) Object.entries(draft).forEach(([name,value]) => { const field = form.elements.namedItem(name); if (field) field.value = value; });
    showDraftStatus(form);
  });
}
function rememberForm(form) {
  if (!form || form.dataset.form === 'node') return;
  const values = formValues(form);
  if (JSON.stringify(values) === form.dataset.baseline) delete state.workspace.forms[formKey(form)];
  else state.workspace.forms[formKey(form)] = values;
  showDraftStatus(form); save();
}
function clearFormDraft(form) { delete state.workspace.forms[formKey(form)]; }
function askConfirm(title, message, label, run) {
  ui.confirm = run;
  $('#confirm-content').innerHTML = `<div class="modal-head"><h2>${e(title)}</h2></div><div class="modal-body"><p>${e(message)}</p><div class="form-footer">${button('取消','cancel-confirm')}${button(e(label),'accept-confirm','','primary')}</div></div>`;
  $('#confirm-dialog').showModal();
}
function invalidateTest() { ui.flowTest = null; }
function saveNodeInput(form) {
  const data = formValues(form);
  if ('intakeEnabled' in data) data.intakeEnabled = data.intakeEnabled === 'true';
  Object.assign(state.draft,data); invalidateTest(); save();
  const status = $('#flow-draft-status');
  if (status) status.textContent = Core.flowChanged(state) ? '草稿已自动保存 · 待发布' : '与发布版本一致';
  const publish = $('[data-action="publish-flow"]');
  if (publish) publish.disabled = !Core.flowChanged(state);
  const result = $('#flow-test-result');
  if (result) result.innerHTML = empty('参数已更新，请重新运行测试。');
  document.querySelectorAll('.evaluation .badge').forEach(el=>{el.textContent='历史结论已失效，请重验';el.className='badge orange';});
}
function renderNav() {
  const m = Core.metrics(state), counts = { sessions: m.waiting, tickets: m.tickets, quality: m.issues };
  $('#navigation').innerHTML = navItems.map(([group, key, title, glyph]) => `${group ? `<div class="nav-group">${group}</div>` : ''}<button type="button" class="nav-link ${ui.page === key ? 'active' : ''}" data-nav="${key}" title="${title}" ${ui.page === key ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${title}</span>${counts[key] ? `<span class="nav-count">${counts[key]}</span>` : ''}</button>`).join('');
  $('#crumb').textContent = navItems.find(x => x[1] === ui.page)?.[2] || '工作台';
}
function render() {
  const requested = location.hash.slice(1);
  ui.page = navItems.some(x => x[1] === requested) ? requested : 'overview';
  renderNav();
  const views = { overview: renderOverview, playground: renderPlayground, robot: renderRobot, workflow: renderWorkflow, knowledge: renderKnowledge, sessions: renderSessions, tickets: renderTickets, quality: renderQuality, integrations: renderIntegrations, architecture: renderArchitecture };
  $('#page').innerHTML = views[ui.page]();
  restoreForms($('#page'));
  document.querySelectorAll('.chat-body').forEach(el => { el.scrollTop = el.scrollHeight; });
  $('#storage-warning').hidden = storageAvailable;
  save();
}

function renderItems(session, staff = false) {
  const items = Core.sessionItems(state, session);
  if (!items.length) return '<p class="tiny muted">提问后按诉求建立服务事项；结束聊天不会自动解决事项。</p>';
  return `<div class="service-items">${items.map(i => {
    const active = !['resolved','cancelled'].includes(i.status);
    const canSubmit = i.type === 'aftersales' && i.objectId && active && !i.tickets.length && (staff || session.flow.intakeEnabled);
    return `<article class="service-item" data-item-id="${i.id}"><div class="row between"><strong>${e(i.title)}</strong>${badge(Core.itemNames[i.status],i.status==='resolved'?'green':i.status==='awaiting_confirmation'?'blue':'orange')}</div><p class="tiny muted">${e(i.id)} · ${e(Core.itemTypes[i.type])}${i.objectId?' · '+e(i.objectId):''}</p><p class="tiny muted">首次受理 ${dateTime(i.created)}${i.resolvedAt?' · 确认 '+dateTime(i.resolvedAt):''}</p><div class="item-actions">${!staff && Core.canConfirmItem(state,i)?button('这项已解决','confirm-item',`data-id="${i.id}"`,'small primary'):''}${canSubmit?button('填写并确认售后申请','item-ticket',`data-id="${i.id}" data-session="${session.id}" data-visitor="${!staff}"`,'small'):''}${active&&session.status==='bot'&&i.status==='clarifying'?button('继续处理','resume-item',`data-id="${i.id}" data-session="${session.id}"`,'small'):''}${!staff&&['resolved','awaiting_confirmation'].includes(i.status)?button('仍需帮助','item-help',`data-id="${i.id}"`,'small'):''}${session.status==='ended'&&active?button('关联原事项再咨询','continue-item',`data-id="${i.id}"`,'small'):''}${i.tickets.map(tid=>{const t=Core.getTicket(state,tid);return `<button class="text-link" data-action="${staff?'ticket-detail':'ticket-read'}" data-id="${tid}">${e(tid)} · ${e(t.status)}${t.disputed?' / 异议待核':''} →</button>`;}).join('')}</div></article>`;
  }).join('')}</div>`;
}
function renderRuntime(compact = false) {
  const r=Core.capacityState(state);
  return `<section class="card runtime-card"><div class="card-head"><div><h2>实时承接状态</h2><p>立即影响所有会话，不随流程版本冻结。仅模拟接待容量。</p></div>${badge(r.humanMode==='offline'?'离线':r.full?'满载':'可接待',r.humanMode==='online'&&!r.full?'green':'orange')}</div><div class="card-body"><form data-form="runtime"><div class="form-grid"><div class="field"><label for="runtime-mode">人工状态</label><select id="runtime-mode" name="humanMode">${selectOptions([['online','在线'],['busy','模拟满载'],['offline','全部离线']],r.humanMode)}</select></div><div class="field"><label for="runtime-tool">订单查询工具</label><select id="runtime-tool" name="toolEnabled">${selectOptions([['true','可用（本地样例）'],['false','紧急停用']],String(r.toolEnabled))}</select></div></div><div class="form-grid"><div class="field"><label for="runtime-capacity">同时接待容量</label><input type="number" id="runtime-capacity" name="capacity" min="1" max="10" value="${r.capacity}" required></div><div class="field"><label for="runtime-operator">当前演示坐席</label><select id="runtime-operator" name="operator">${selectOptions(state.agents,state.operator)}</select></div></div><div class="field"><label for="runtime-reason">变更原因</label><input id="runtime-reason" name="reason" maxlength="300" required value="演示容量与故障承接"></div><div class="form-error" role="alert"></div><div class="row between"><span class="tiny muted">已占用 ${r.occupied}/${r.capacity} · 切换角色不是真实登录</span><button class="btn small" type="submit">应用实时状态</button></div></form></div></section>`;
}
function renderEvaluation(record) {
  if(!record) return empty('尚未运行发布回归。');
  const current=Core.evaluationCurrent(state,record);
  return `<div class="evaluation"><div class="row between">${badge(!current?'历史结论已失效，请重验':record.passed?'本地规则回归通过':'回归未通过',!current?'orange':record.passed?'green':'red')}<span class="tiny muted">${e(record.id)} · ${record.cases.filter(c=>c.pass).length}/${record.cases.length} · ${dateTime(record.time)}</span></div><p class="tiny muted section-space">检验确定性行为与引用，不证明模型语义理解、答案专业性或生产性能。</p><div class="table-wrap"><table><thead><tr><th>用例</th><th>输入 / 期望</th><th>实际结果</th><th>判定</th></tr></thead><tbody>${record.cases.map(c=>`<tr><td>${e(c.id)}</td><td class="wrap-cell"><strong>${e(c.query)}</strong><div class="secondary">${e(c.expected)}</div></td><td class="wrap-cell">${e(c.actual)}</td><td>${badge(c.pass?'通过':'未通过',c.pass?'green':'red')}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function assertIssue(q) { if(q?.status!=='已确认')throw new Error('请先确认问题及整改责任人'); }
function showGuide() {
  modal('面试演示路线 · 先服务闭环，再讲配置', `<div class="guide"><h3>01 客户进来后能做什么</h3><p>体验中心开始咨询，展示规则咨询、订单查询、售后申请三个入口。用“只看客户窗口”隐藏运营页面。</p><h3>02 一个会话，两个服务事项</h3><p>输入“查物流 SO20260926001，再申请退货”。查询有结果，售后仍待受理；不要把物流卡片说成退款成功。</p><h3>03 确认后受理，人工继续办理</h3><p>点击“填写并确认售后申请”，预览后提交。打开对应坐席会话和工单，分配、要求补充，再到客户窗口补充资料。完成工单时填写客户说明和模拟结果证据。</p><h3>04 客户确认与异议</h3><p>分别确认查询、售后事项；结束聊天不改变未完成事项。对已完成工单提出“仍需帮助”，展示异议待核与重开。</p><h3>05 B 端配置确实影响 C 端</h3><p>流程编排将查询模式改为超时，单条测试、发布回归、模拟发布。新旧会话分别验证。再从实时承接状态切换满载、离线或停用工具。</p><h3>06 无答案如何变成可用知识</h3><p>用“礼品卡可以分多次使用吗？”产生线索；质检确认根因与责任人 → 关联新知识 → 保存草稿 → 草稿回归 → 发布 → 原问题回归 → 验收。正确拒答本身不是违规，问题应定位为知识覆盖缺口。</p><p class="note section-space">所有信息、身份和证据都是演示样例。此作品验证产品流程，不宣称接入真实模型、完成真实退款或获得实际降本。</p><div class="form-footer"><a class="btn" href="docs/演示脚本.md" download>下载详细脚本</a>${button('开始客户演示','guide-start','','primary')}</div></div>`);
}
function renderOverview() {
  const m = Core.metrics(state);
  const cards = [['服务事项', m.itemTotal, '按诉求计数，不按聊天轮次', 'chat'], ['客户已确认事项', m.confirmed, '演示计数，不是生产解决率', 'check'], ['未完成事项', m.pendingItems, `其中待结果确认 ${m.awaiting} 项`, 'clock'], ['未完成工单', m.tickets, '包含异议待核', 'ticket']];
  const pending=state.items.filter(i=>!['resolved','cancelled'].includes(i.status)).slice(0,8);
  return heading('服务工作台','先看未完成的事，再看会话与工单。',`${button('主线演示路线','demo-guide')}${badge('本地样例 + 本次操作','blue')}`)+
  `<div class="hero-strip"><div><h2>从咨询到处理结果，不止是回答一句话</h2><p>同一条服务链：客户入口、知识与查询、确认受理、人工办理、进度与结果。</p><div class="hero-steps"><span>客户进入</span>→<span>分项服务</span>→<span>确认受理</span>→<span>人工 / 工单</span>→<span>结果确认</span></div></div><button class="btn primary" data-nav="playground">开始体验 ${icon('arrow')}</button></div>`+
  `<div class="metric-grid">${cards.map(([label,value,foot,glyph])=>`<div class="card metric"><div class="row between"><span class="metric-label">${label}</span><span class="metric-icon">${icon(glyph)}</span></div><div class="metric-value">${value}<span class="tiny muted"> 项</span></div><small>${foot}</small></div>`).join('')}</div>`+
  `<section class="card"><div class="card-head"><div><h2>未完成事项</h2><p>待确认不能算已解决，聊天结束不清除待办。</p></div><span class="tiny muted">快照时间 ${dateTime(Core.now())}</span></div><div class="table-wrap"><table><thead><tr><th>事项</th><th>状态</th><th>业务对象</th><th>关联记录</th><th>操作</th></tr></thead><tbody>${pending.map(i=>`<tr><td><strong>${e(i.title)}</strong><div class="secondary">${e(i.id)} · ${i.sample?'样例':'本次演示'}</div></td><td>${badge(Core.itemNames[i.status],i.status==='awaiting_confirmation'?'blue':'orange')}</td><td>${e(i.objectId||'—')}</td><td>${e(i.tickets.join('、')||'暂无工单')}</td><td>${i.sessionIds.length?button('查看对应会话','open-session',`data-id="${i.sessionIds.at(-1)}"`,'small'):button('查看工单','ticket-detail',`data-id="${i.tickets[0]}"`,'small')}</td></tr>`).join('')}</tbody></table>${!pending.length?empty('没有待处理事项'):''}</div></section>`+
  `<div class="grid-2 section-space"><section class="card"><div class="card-head"><h2>服务与运营待办</h2></div><div class="card-body"><div class="definition-row"><span>等待人工接管</span><button class="text-link" data-nav="sessions">${m.waiting} 个会话 →</button></div><div class="definition-row"><span>待复核线索</span><button class="text-link" data-nav="quality">${m.issues} 项 →</button></div><div class="definition-row"><span>未关闭整改</span><button class="text-link" data-action="open-remediations">${m.corrections} 项 →</button></div><div class="definition-row"><span>当前生效 FAQ</span><button class="text-link" data-nav="knowledge">${m.knowledge} 条 →</button></div></div></section><div class="note"><strong>指标边界</strong><p>这里只显示当前浏览器的本地计数，包含初始样例。未计算成熟观察队列、重访窗口、真实满意度或成本，不把测试通过率换成业务解决率。</p><p>演示动作会保存；V3 使用独立存储，不覆盖旧版浏览器数据。</p></div></div>`;
}
function renderIntakeProgress(session, message) {
  const item=Core.getItem(state,message.itemId),last=item.tickets.length?Core.getTicket(state,item.tickets.at(-1)):null;
  return `<div class="intake-card"><strong>售后受理 · 当前${last?'已登记 '+e(last.id):'尚未提交'}</strong><p>${last?'工单 '+e(last.status)+(last.disputed?' · 异议待核':'')+'；事项 '+e(Core.itemNames[item.status]):'需要你的确认，不执行真实退款。'}</p>${last?button('查看当前进度',ui.page==='playground'?'ticket-read':'ticket-detail',`data-id="${last.id}"`,'small'):button('填写并确认售后申请','item-ticket',`data-id="${item.id}" data-session="${session.id}" data-visitor="${ui.page==='playground'}"`,'small')}</div>`;
}
function renderMessages(s) {
  return s.messages.map((m, index) => {
    if (m.role === 'system') return `<div class="message system"><div class="bubble">${e(m.text)}${m.ticketId ? `<br><button class="text-link" data-action="${ui.page==='playground'?'ticket-read':'ticket-detail'}" data-id="${m.ticketId}">查看工单进度 →</button>` : ''}</div></div>`;
    const isUser = m.role === 'user', name = isUser ? s.name : m.role === 'agent' ? (m.agentName || '客服小林') : s.robot.name;
    return `<div class="message ${isUser ? 'user' : ''}"><span class="avatar ${isUser ? '' : 'blue'}">${isUser ? e(s.name.slice(0,1)) : m.role === 'agent' ? '林' : icon('bot')}</span><div class="message-content"><div class="message-meta">${e(name)} · ${clockTime(m.time)}</div><div class="bubble">${e(m.text)}</div>${m.citation ? `<button class="source-button" data-action="source" data-id="${s.id}" data-index="${index}">${icon('book')}来源：${e(m.citation.title)} · v${m.citation.version}</button>` : ''}${m.order ? renderOrder(m.order) : ''}${m.intake&&m.itemId?renderIntakeProgress(s,m):''}${m.citation?`<p class="citation-state">${e(Core.citationStatus(state,m.citation))}</p>`:''}</div></div>`;
  }).join('');
}
function renderOrder(order) {
  return `<div class="order-card"><div class="row"><div class="product-image">${e(order.icon)}</div><div><h3>${e(order.product)}</h3><p>¥ ${e(order.price)} · 1 件</p></div></div><div class="order-details"><span>订单状态</span><span>${e(order.status)}</span><span>订单编号</span><span>${e(order.id)}</span><span>配送进展</span><span>${e(order.delivery)}</span><span>收件人</span><span>${e(order.receiver)}</span></div><div class="tiny subtle" style="margin-top:8px;font-size:9px">演示订单 · 不对应真实交易${order.queriedAt?' · 查询时间 '+dateTime(order.queriedAt):''}</div></div>`;
}
function renderTrace(trace) {
  if (!trace?.length) return '<div class="trace-empty">发送消息后，在这里查看路由与处理结果。</div>';
  return `<div class="trace">${trace.map((t, i) => `<div class="trace-step ${['error','warning'].includes(t.status) ? 'error' : ''}"><h3>${String(i+1).padStart(2,'0')} · ${e(t.label)}</h3><p>${e(t.detail)}</p>${t.status !== 'success' ? badge(({error:'异常',warning:'兜底',waiting:'等待'})[t.status] || t.status,'orange') : ''}</div>`).join('')}</div>`;
}
const scenarios = [
  ['咨询规则','通用规则不强制索要订单号','不要转人工，我只问退货规则'],
  ['多事项服务','查询和办理分开记录','查物流 SO20260926001，再申请退货'],
  ['信息采集与插问','先查订单，也可中途问商品','帮我查一下订单'],
  ['多个问题','不能只回答第一项','查物流 SO20260926001，再告诉我保温杯怎么清洗'],
  ['知识覆盖缺口','形成线索，再由运营确认','礼品卡可以分多次使用吗？']
];
function renderPlayground() {
  const s = state.sessions.find(item => item.id === ui.play);
  const history = state.sessions.filter(item => item.name === '林小夏' || item.id === ui.play);
  const customerMode = document.body.classList.contains('customer-mode');
  const controls = customerMode ? button('显示运营视角','toggle-customer') : `${button('只看客户窗口','toggle-customer')}<select aria-label="体验会话" data-play-select><option value="">选择已有会话</option>${history.map(item=>`<option value="${item.id}" ${item.id===ui.play?'selected':''}>${e(item.id)} · ${e(item.name)} · ${sessionNames[item.status]}</option>`).join('')}</select>${button('新建会话','new-chat')}`;
  const entries = `<div class="service-entry"><button data-action="entry" data-query="七天无理由退货有什么条件？"><strong>问服务规则</strong><small>查看依据与适用条件</small></button><button data-action="entry" data-query="帮我查订单"><strong>查订单进度</strong><small>补充订单号后查询</small></button><button data-action="entry" data-query="我要申请退货"><strong>申请售后</strong><small>先受理，再由人工核实</small></button></div>`;
  const side = `<aside class="scenario-aside"><h3>演示场景</h3><p class="tiny muted">只填入输入框，不自动发送</p><div class="scenarios section-space">${scenarios.map(([title,sub],i)=>`<button class="scenario-btn" data-action="scenario" data-index="${i}"><strong>${title}</strong><small>${sub}</small></button>`).join('')}</div><div class="note section-space">样例订单<br><button class="text-link" data-action="fill-order" data-id="SO20260926001">SO20260926001</button><br><button class="text-link" data-action="fill-order" data-id="SO20260926002">SO20260926002</button></div>${button('查看完整演示路线','demo-guide','','small section-space')}</aside>`;
  if (!s) return heading(customerMode?'青禾生活 · 在线客服':'客户服务入口','演示服务 · 所有数据均为虚构样例，请勿输入真实隐私。',controls)+`<div class="card start-panel"><div class="bot-avatar">${icon('bot')}</div><h2>有什么需要帮你处理？</h2><p>可以问规则、查订单，或登记售后需求。仅查看此页不会创建会话。</p>${button('开始咨询','new-chat','','primary')}${entries}</div>`;
  const inactive=s.status==='ended', r=Core.capacityState(state);
  const notes={waiting:r.full?'客服当前满载，已排队。可补充信息、取消排队或留单；暂不估计等待分钟数。':'正在等待人工接管，可以补充信息或取消排队。',human:`${s.owner}已接管。机器人暂停客户侧回答。`,offline:'人工当前离线。可以提交问题留单，也可以继续咨询其他问题；进度仅在本站查看。',ended:'本次聊天已结束。事项和工单仍可继续跟进；待补充工单可在下方打开。'};
  return heading(customerMode?'青禾生活 · 在线客服':'体验中心',customerMode?'演示服务 · 查看答复、补充资料和跟进处理结果。':'客户视角 · 沟通状态、事项结果和工单进度分别记录。',controls)+`<div class="playground-grid">${side}<section class="card chat-panel"><div class="chat-title"><div class="bot-avatar">${icon('bot')}</div><div><h3>${e(s.robot.name)}</h3><small>${e(s.robot.description)}</small></div><span class="spacer"></span>${badge(sessionNames[s.status],sessionColors[s.status])}</div>${notes[s.status]?`<div class="chat-status">${e(notes[s.status])}</div>`:''}<div class="chat-body" aria-live="polite">${renderMessages(s)}</div><div class="chat-tools">${s.status==='bot'?button('转人工','visitor-handoff',`data-id="${s.id}"`,'small'):''}${['waiting','offline'].includes(s.status)?button(s.status==='waiting'?'取消排队':'继续机器人咨询','resume-bot',`data-id="${s.id}"`,'small'):''}${!inactive?button('提交问题','new-ticket',`data-session="${s.id}" data-visitor="true"`,'small'):''}${!inactive?button('结束咨询','visitor-finish',`data-id="${s.id}"`,'small'):''}</div>${!inactive?`<form class="chat-input" data-form="visitor-message" data-id="${s.id}"><textarea name="message" data-chat-input maxlength="2000" aria-label="访客消息" placeholder="${s.status==='bot'?'描述你要咨询或办理的事情…':'补充资料将保留给人工，不再由机器人回答…'}"></textarea><div class="send-foot"><small>Enter 发送 · Shift+Enter 换行</small><button class="btn primary small" type="submit" disabled>发送 ${icon('send')}</button></div></form>`:`<div class="card-body">${button('新建会话继续咨询','new-chat','','primary')}</div>`}<div class="items-panel"><h3>我的服务事项</h3><p class="tiny muted">有依据且处理完成后，逐项确认；“受理成功”不等于“退款成功”。</p>${renderItems(s)}</div><div class="demo-switch"><span>演示视角切换</span><button class="text-link" data-action="open-session" data-id="${s.id}">打开对应坐席会话 →</button></div></section><section class="card trace-card"><div class="card-head"><div><h2>后台执行轨迹</h2><p>${e(s.id)} · 已绑定流程 v${s.flow.version}</p></div>${icon('flow')}</div>${s.flow.version!==state.published.version?`<div class="note orange">当前发布为 v${state.published.version}，此会话保留 v${s.flow.version}。</div>`:''}${renderTrace(s.runs.at(-1)?.trace)}<div class="stats-footer">本地规则结果，不是模型推理。<br>知识读取当前生效版本；容量和工具开关使用实时状态。</div></section></div>`;
}
function sessionSummary(s) { return Core.sessionSummary(s, state); }
function renderSessions() {
  const list = state.sessions.filter(s => (!ui.filters.sessionStatus || s.status===ui.filters.sessionStatus) && `${s.id} ${s.name} ${s.messages.map(m=>m.text).join(' ')}`.toLowerCase().includes(ui.filters.sessions.trim().toLowerCase())).sort((a,b)=>(b.messages.at(-1)?.time||b.created).localeCompare(a.messages.at(-1)?.time||a.created));
  let s = list.find(s=>s.id===ui.session) || list[0];
  if (s) ui.session = s.id;
  const right = s ? `<div class="session-detail"><div class="chat-title"><span class="avatar green">${e(s.name.slice(0,1))}</span><div><h3>${e(s.name)}</h3><small>${e(s.id)} · ${e(s.channel)}</small></div><span class="spacer"></span>${['waiting','offline'].includes(s.status)?button(s.status==='offline'?'接管留言':'接管会话','takeover',`data-id="${s.id}"`,'primary small'):badge(sessionNames[s.status],sessionColors[s.status])}</div><div class="chat-body">${renderMessages(s)}</div><div class="chat-tools">${button('创建工单','new-ticket',`data-session="${s.id}"`,'small')}${button('标记问题','mark-issue',`data-id="${s.id}"`,'small')}${button('结束会话','agent-finish',`data-id="${s.id}" ${s.status!=='human'||s.owner!==state.operator?'disabled':''}`,'small')}<button class="text-link" data-action="open-visitor" data-id="${s.id}">切到此会话访客视角 →</button></div><form class="chat-input" data-form="agent-message" data-id="${s.id}"><textarea name="message" data-chat-input aria-label="坐席回复" maxlength="2000" placeholder="${s.status==='human'&&s.owner===state.operator?'输入人工回复…':'取得当前会话接管权后可以回复'}" ${s.status!=='human'||s.owner!==state.operator?'disabled':''}></textarea><div class="send-foot"><small>Enter 发送 · Shift+Enter 换行</small><button type="submit" class="btn primary small" ${s.status!=='human'||s.owner!==state.operator?'disabled':''}>发送回复 ${icon('send')}</button></div></form></div><aside class="context-panel"><h3>访客信息</h3><div class="definition-row"><span>客户</span><strong>${e(s.name)} · 演示</strong></div><div class="definition-row"><span>来源渠道</span><strong>${e(s.channel)}</strong></div><div class="definition-row"><span>开始时间</span><strong>${dateTime(s.created)}</strong></div><div class="definition-row"><span>流程版本</span><strong>v${s.flow.version}</strong></div><div class="divider"></div><h3>服务事项</h3>${renderItems(s,true)}<div class="divider"></div><h3>转接摘要</h3><div class="summary-box">${e(sessionSummary(s))}</div><div class="divider"></div><h3>关联工单</h3>${s.tickets.length?s.tickets.map(id=>`<button class="source-button full-width" data-action="ticket-detail" data-id="${id}">${icon('ticket')}${e(id)}<span class="spacer"></span>查看 →</button>`).join(''):'<p class="tiny muted">暂无关联工单</p>'}<div class="divider"></div><h3>最近执行轨迹</h3>${renderTrace(s.runs.at(-1)?.trace)}</aside>` : empty('没有符合筛选条件的会话');
  return heading('会话中心','把机器人处理过的信息，连续交给人工客服。',`${ui.returnTo?button(ui.returnTo.kind==='issue'?'返回问题复核':'返回工单详情','return-context'):''}<span class="tiny muted">${Core.metrics(state).waiting} 个会话等待接管</span>`) + `<section class="card session-layout"><aside class="session-list"><div class="toolbar">${search('sessions','搜索客户、问题或会话号')}<select data-filter="sessionStatus" aria-label="会话状态">${selectOptions([['','全部状态'],...Object.entries(sessionNames)],ui.filters.sessionStatus)}</select></div>${list.map(s=>`<button class="session-item ${s.id===ui.session?'active':''}" data-action="select-session" data-id="${s.id}"><div class="row between"><strong>${e(s.name)}</strong><span class="when">${clockTime(s.messages.at(-1)?.time||s.created)}</span></div><div class="preview">${e(s.summary||'客户进入会话')}</div><div class="row between" style="margin-top:9px">${badge(sessionNames[s.status],sessionColors[s.status])}<span class="when">${e(s.id)}</span></div></button>`).join('')||empty('无匹配会话')}</aside>${right}</section><div class="section-space">${renderRuntime()}</div>`;
}
function renderRobot() {
  return heading('机器人配置','定义服务身份与欢迎语，新会话使用保存后的配置。',`${badge('本地演示机器人','blue')}${button('新建会话验证已保存配置','verify-live','','primary')}`) + `<div class="grid-2"><section class="card"><div class="card-head"><h2>基础信息</h2><span class="tiny muted">保存后对新会话生效</span></div><div class="card-body"><form data-form="robot"><div class="field"><label for="robot-name">机器人名称<span class="required">*</span></label><input id="robot-name" name="name" required maxlength="30" value="${e(state.robot.name)}"></div><div class="field"><label for="robot-description">服务说明<span class="required">*</span></label><input id="robot-description" name="description" required maxlength="80" value="${e(state.robot.description)}"></div><div class="field"><label for="robot-greeting">欢迎语<span class="required">*</span></label><textarea id="robot-greeting" name="greeting" required maxlength="300">${e(state.robot.greeting)}</textarea><span class="help">首次进入咨询窗口时展示。</span></div><div class="form-error" role="alert"></div><div class="form-footer"><button class="btn primary" type="submit">保存配置</button></div></form></div></section><div class="stack"><section class="card"><div class="card-head"><h2>运行配置</h2></div><div class="card-body"><div class="definition-row"><span>处理方式</span><strong>本地关键词与模板</strong></div><div class="definition-row"><span>知识范围</span><strong>当前已发布知识</strong></div><div class="definition-row"><span>已发布流程</span><strong>通用服务模板 v${state.published.version}</strong></div><div class="divider"></div><button class="text-link" data-nav="workflow">编辑服务流程 →</button></div></section><div class="note">此页面不收集模型密钥。真实模型、知识索引与鉴权在后续服务端接入。</div></div></div>`;
}
const flowNodes = [
  ['start','开始','会话输入','play',12,163], ['router','意图路由','识别与分支','flow',184,163],
  ['knowledge','知识检索','已发布知识','book',356,25], ['order','订单查询','采集订单号 / 查询','plug',356,163],
  ['human','人工兜底','队列 / 离线策略','user',356,305], ['reply','回复输出','文本 / 卡片 / 引用','chat',530,94],
  ['end','本轮结束','等待下一条消息','check',530,305]
];
function nodeForm() {
  const d = state.draft;
  const fields = {
    start: '<div class="note">接收用户消息与会话上下文。会话处于人工服务或等待接管时，停止机器人自动回答。</div>',
    router: `<div class="field"><label for="order-words">附加订单触发词<span class="required">*</span></label><textarea id="order-words" name="orderWords" maxlength="200" required>${e(d.orderWords)}</textarea><span class="help">用逗号分隔。先处理明确否定与售后诉求，订单号不会覆盖退款意图。</span></div><div class="field"><label for="human-words">附加人工触发词<span class="required">*</span></label><textarea id="human-words" name="humanWords" maxlength="200" required>${e(d.humanWords)}</textarea><span class="help">只在客户确有转接意图时触发；支持演示脚本中的否定与多事项表达。</span></div>`,
    knowledge: `<div class="note">检索 ${Core.metrics(state).knowledge} 条已发布知识。当前使用关键词规则，未命中时进入人工兜底。</div><button type="button" class="text-link section-space" data-nav="knowledge">维护知识与关键词 →</button>`,
    order: `<div class="field"><label for="query-mode">查询结果模式</label><select id="query-mode" name="queryMode">${selectOptions([['success','正常返回样例订单'],['timeout','模拟工具超时']],d.queryMode)}</select><span class="help">缺订单号时先追问，未知订单不返回卡片。</span></div><div class="code-block">输入：order_id\n输出：订单状态、物流、商品\n异常：未找到 / 超时</div>`,
    human: `<div class="field"><label for="queue-name">服务组名称<span class="required">*</span></label><input id="queue-name" name="queue" value="${e(d.queue)}" required maxlength="30"></div><div class="field"><label for="intake-enabled">售后自助受理</label><select id="intake-enabled" name="intakeEnabled">${selectOptions([['true','允许填写并确认申请'],['false','仅由人工受理']],String(d.intakeEnabled))}</select></div><div class="note">人工在线、满载和工具停用属于实时状态，在会话中心配置；不会被旧流程快照冻结。</div>`,
    reply: `<div class="field"><label for="reply-prefix">回答引导语</label><textarea id="reply-prefix" name="prefix" maxlength="150">${e(d.prefix)}</textarea><span class="help">在命中的知识答案和订单结果前展示。</span></div><div class="note">保留知识来源，不对原文作模型改写。</div>`,
    end: '<div class="note">结束当前处理轮次，继续等待用户输入。客户或当前接管坐席可以结束沟通；事项按自己的结果继续流转。</div>'
  };
  const editable = ['router','order','human','reply'].includes(ui.node);
  return `<form data-form="node" data-id="${ui.node}">${fields[ui.node]}<div class="form-error" role="alert"></div>${editable?'<p class="help">参数自动保存到草稿，发布后对新会话生效。</p>':''}</form>`;
}
function renderWorkflow() {
  if (ui.flowTest && ui.flowTest.runtimeKey !== JSON.stringify(Core.capacityState(state))) invalidateTest();
  const changed = Core.flowChanged(state);
  const current = flowNodes.find(n=>n[0]===ui.node) || flowNodes[1];
  return heading('流程编排','把接待规则写进流程，用测试验证每一条服务路径。',`<span class="badge ${changed?'orange':'green'}" id="flow-draft-status">${changed?'草稿已自动保存 · 待发布':'与发布版本一致'}</span>${button('运行发布回归','evaluate-flow')}${button('模拟发布流程','publish-flow',changed?'':'disabled','primary')}${button('新建会话验证发布版','verify-live')}`) +
    `<div class="flow-layout"><div class="stack"><section class="card"><div class="canvas-toolbar"><div class="row"><strong>通用客服接待</strong>${badge('已发布 v'+state.published.version,'blue')}</div><span>固定模板 · 点击节点配置</span></div><div class="canvas-scroll"><div class="canvas"><svg class="flow-lines" viewBox="0 0 692 435" aria-label="流程连线"><defs><marker id="flow-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7" style="fill:#bbcce8;stroke:none"/></marker></defs><g marker-end="url(#flow-arrow)"><path d="M154 209H184"/><path d="M326 209H341V71H356"/><path d="M326 209H356"/><path d="M326 209H341V351H356"/><path d="M498 71H514V139H530"/><path d="M498 209H514V139H530"/><path d="M498 351H514V139H530"/><path d="M601 187V305"/><path d="M427 116V145H506V285H427V305" style="stroke-dasharray:4 4"/><path d="M498 225H506V285H427V305" style="stroke-dasharray:4 4"/></g><text x="329" y="61">知识</text><text x="329" y="197">订单</text><text x="329" y="374">人工</text><text x="461" y="277">异常兜底</text></svg>${flowNodes.map(([id,title,desc,glyph,x,y])=>`<button class="flow-node ${ui.node===id?'active':''}" data-action="select-node" data-id="${id}" style="left:${x}px;top:${y}px"><span class="node-icon">${icon(glyph)}</span><strong>${title}</strong><small>${desc}</small></button>`).join('')}</div></div><div class="flow-legend"><span><i class="legend-dot"></i>固定流程节点</span><span>实线：主路径</span><span>虚线：未命中 / 失败转人工</span><span class="spacer"></span><span>画布可横向滚动</span></div></section><section class="card"><div class="card-head"><div><h2>草稿测试</h2><p>使用当前草稿参数；不会创建会话和工单。</p></div>${badge('规则模拟')}</div><form data-form="flow-test" class="toolbar"><input name="question" aria-label="流程测试问题" placeholder="例如：查询订单 SO20260926001" value="${e(ui.flowTest?.query||'查询订单 SO20260926001')}" maxlength="2000" required style="flex:1"><button class="btn primary" type="submit">${icon('play')}运行测试</button></form><div id="flow-test-result">${ui.flowTest?`<div class="test-result"><div><h3 style="margin-bottom:12px">访客看到的结果</h3>${ui.flowTest.result.messages.map(m=>`<div class="bubble">${e(m.text)}</div>${m.order?renderOrder(m.order):''}`).join('')}<div class="note section-space">测试使用草稿。发布后新建会话才能验证访客侧新版本。</div></div>${renderTrace(ui.flowTest.result.trace)}</div>`:'<div class="empty" style="padding:27px">输入问题并运行测试，查看实际分支。</div>'}</div></section></div><aside class="card node-panel"><div class="card-head"><div><h2>${e(current[1])}</h2><p>节点参数 · 草稿</p></div>${icon(current[3])}</div><div class="card-body">${nodeForm()}<div class="divider"></div><p class="tiny muted">节点参数自动保存。测试验证草稿；发布只影响新会话，已有会话保持原版本。</p></div></aside></div><section class="card section-space"><div class="card-head"><div><h2>发布回归与历史</h2><p>单条试问不替代发布回归。输入快照不匹配时必须重验；恢复历史配置先进入草稿。</p></div>${button('运行发布回归','evaluate-flow','','small')}</div><div class="card-body">${state.flowValidation?renderEvaluation(state.flowValidation):empty('尚无当前草稿的发布回归记录。')}<div class="table-wrap section-space"><table><thead><tr><th>版本</th><th>发布说明</th><th>测试依据</th><th>时间 / 操作者</th><th>操作</th></tr></thead><tbody>${[...state.releases].reverse().map(r=>`<tr><td>v${r.version}</td><td>${e(r.reason)}</td><td>${e(r.validationId)}</td><td>${dateTime(r.time)} · ${e(r.operator)}</td><td>${r.version!==state.published.version?button('恢复为草稿','rollback-flow',`data-id="${r.version}"`,'small'):'当前版本'}</td></tr>`).join('')}</tbody></table></div></div></section>`;
}
function renderKnowledge() {
  const items=state.knowledge.filter(k=>(!ui.filters.knowledgeStatus||k.status===ui.filters.knowledgeStatus||ui.filters.knowledgeStatus==='pending'&&k.draft)&&`${k.title} ${k.standardQuestion} ${k.answer} ${k.keywords} ${k.id} ${k.draft?.title||''}`.toLowerCase().includes(ui.filters.knowledge.trim().toLowerCase()));
  return heading('FAQ 与知识库','先保存草稿，再验证引用与分支，最后发布给客户使用。',`${button('检索已发布内容','knowledge-test')}${button('新建 FAQ','edit-knowledge','','primary')}`)+`<section class="card"><div class="toolbar">${search('knowledge','搜索标题、标准问题、内容或编号')}<select data-filter="knowledgeStatus" aria-label="知识状态">${selectOptions([['','全部状态'],...Object.entries(knowledgeNames),['pending','有待发布修改']],ui.filters.knowledgeStatus)}</select><span class="spacer"></span><span class="tiny muted">${state.knowledge.length} 条 · ${Core.metrics(state).knowledge} 条当前生效</span></div><div class="table-wrap"><table><thead><tr><th>标题 / 标准问题</th><th>范围 / 维护人</th><th>状态 / 版本</th><th>生效区间</th><th>操作</th></tr></thead><tbody>${items.map(k=>`<tr data-knowledge-row="${k.id}" class="${ui.focusKnowledge===k.id?'highlight-row':''}"><td class="wrap-cell"><strong>${e(k.title)}</strong><div class="secondary">${e(k.id)} · ${e(k.standardQuestion)}</div></td><td>${e(k.scope)}<div class="secondary">${e(k.owner)}</div></td><td>${badge(knowledgeNames[k.status]+' v'+k.version,Core.isKnowledgeActive(k)?'green':'orange')}${k.draft?`<div class="secondary">待发布草稿 v${k.draft.version}</div>`:''}${k.status==='published'&&!Core.isKnowledgeActive(k)?'<div class="secondary">当前不在生效范围</div>':''}</td><td>${dateTime(k.effectiveAt)}<div class="secondary">至 ${k.expiresAt?dateTime(k.expiresAt):'长期有效'}</div></td><td><div class="row wrap">${button('编辑','edit-knowledge',`data-id="${k.id}"`,'small')}${k.draft||k.status!=='published'?`${button('草稿回归','evaluate-knowledge',`data-id="${k.id}"`,'small')}${button('发布','publish-knowledge',`data-id="${k.id}"`,'small')}`:''}${k.status==='published'?button('停用','disable-knowledge',`data-id="${k.id}"`,'small'):''}</div></td></tr>`).join('')}</tbody></table>${!items.length?empty('没有匹配知识，请调整筛选'):''}</div><div class="stats-footer">目前实现文本 FAQ、来源与生效管理；没有文件解析、向量索引或真实 RAG。未来解析的文档也应归入同一知识治理，而非另建一套孤立问答。</div></section>`;
}
function knowledgeModal(id, issueId = '') {
  const record=state.knowledge.find(k=>k.id===id), k=record?.draft||record;
  const issue=issueId?state.issues.find(q=>q.id===issueId):null;
  const toLocal=t=>t?new Date(new Date(t).getTime()-new Date(t).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
  ui.modalContext=null;
  modal(record?'编辑知识':'新建 FAQ',`<form data-form="knowledge" data-id="${e(id||'')}" data-issue="${e(issueId)}">${record?.status==='published'?`<div class="note blue">当前 v${record.version} 持续参与回答；保存草稿不会撤下原答案。发布必须有匹配的回归记录。</div>`:''}${issue?`<div class="note">关联整改 ${e(issue.id)}，原问题：${e(issue.query||issue.evidence)}。只预填问题，答案和来源需人工维护。</div>`:''}<div class="field"><label for="knowledge-title">知识标题<span class="required">*</span></label><input id="knowledge-title" name="title" value="${e(k?.title||'')}" required maxlength="80"></div><div class="field"><label for="knowledge-question">标准问题<span class="required">*</span></label><input id="knowledge-question" name="standardQuestion" value="${e(k?.standardQuestion||issue?.query||issue?.evidence||'')}" required maxlength="200"></div><div class="form-grid"><div class="field"><label for="knowledge-category">分类</label><select id="knowledge-category" name="category">${selectOptions(['通用服务','产品知识','售后政策','会员权益','活动规则'],k?.category||'通用服务')}</select></div><div class="field"><label for="knowledge-keywords">演示匹配关键词<span class="required">*</span></label><input id="knowledge-keywords" name="keywords" value="${e(k?.keywords||'')}" required maxlength="200" placeholder="礼品卡,分次使用"></div></div><div class="field"><label for="knowledge-answer">标准答案<span class="required">*</span></label><textarea id="knowledge-answer" name="answer" required maxlength="2000" style="min-height:130px">${e(k?.answer||'')}</textarea></div><div class="form-grid"><div class="field"><label for="knowledge-scope">适用范围<span class="required">*</span></label><input id="knowledge-scope" name="scope" required maxlength="80" value="${e(k?.scope||'青禾生活')}"></div><div class="field"><label for="knowledge-owner">维护人<span class="required">*</span></label><input id="knowledge-owner" name="owner" required maxlength="80" value="${e(k?.owner||'客服运营')}"></div></div><div class="field"><label for="knowledge-source">来源说明<span class="required">*</span></label><textarea id="knowledge-source" name="source" required maxlength="1000" placeholder="注明原始出处与审核依据；演示政策请明确标为虚构。">${e(k?.source||'')}</textarea></div><div class="form-grid"><div class="field"><label for="knowledge-effective">生效时间（当前浏览器时区）</label><input id="knowledge-effective" type="datetime-local" name="effectiveAt" required value="${toLocal(k?.effectiveAt||Core.now())}"></div><div class="field"><label for="knowledge-expiry">失效时间（可空）</label><input id="knowledge-expiry" type="datetime-local" name="expiresAt" value="${toLocal(k?.expiresAt)}"></div></div><div class="form-error" role="alert"></div><div class="form-footer">${button('暂存并关闭','close-modal')}<button class="btn primary" type="submit" name="intent" value="draft">保存草稿</button><button class="btn" type="submit" name="intent" value="test">保存并运行草稿回归</button></div></form>`);
}
function renderTickets() {
  const list = state.tickets.filter(t=>(!ui.filters.ticketStatus||t.status===ui.filters.ticketStatus)&&`${t.id} ${t.title} ${t.owner}`.includes(ui.filters.tickets));
  return heading('工单中心','把需要持续跟进的问题留在工单里。',button(`${icon('plus')}新建工单`,'new-ticket','','primary'))+
    `<section class="card"><div class="toolbar">${search('tickets','搜索工单标题、编号或负责人')}<select data-filter="ticketStatus" aria-label="工单状态">${selectOptions([['','全部状态'],...Object.keys(Core.transitions)],ui.filters.ticketStatus)}</select><span class="spacer"></span><span class="tiny muted">共 ${list.length} 个工单</span></div><div class="table-wrap"><table><thead><tr><th>工单编号 / 标题</th><th>类型</th><th>优先级</th><th>状态</th><th>负责人</th><th>关联会话</th><th>操作</th></tr></thead><tbody>${list.map(t=>`<tr><td><strong>${e(t.title)}</strong><div class="secondary">${e(t.id)} · ${dateTime(t.created)}</div></td><td>${e(t.category)}</td><td>${badge(t.priority,t.priority==='紧急'?'red':'')}</td><td>${badge(t.status,t.status==='已完成'?'green':t.status==='待分配'?'orange':'blue')}${t.disputed?'<div class="secondary danger-text">异议待核</div>':''}<div class="secondary">${e(t.itemId)}</div></td><td>${e(t.owner||'待分配')}</td><td>${t.sessionId?`<button class="text-link" data-action="open-session" data-id="${t.sessionId}">${e(t.sessionId)}</button>`:'—'}</td><td><button class="text-link" data-action="ticket-detail" data-id="${t.id}">查看详情</button></td></tr>`).join('')}</tbody></table>${!list.length?empty('没有匹配的工单，可以从会话中创建'):''}</div><div class="stats-footer">本地状态流转 · 未连接真实工单系统、数据库或客户通知。</div></section>`;
}
function ticketModal(sessionId, visitor = false, selectedItemId = '') {
  const s=state.sessions.find(s=>s.id===sessionId), eligible=s?Core.sessionItems(state,s).filter(i=>!['resolved','cancelled'].includes(i.status)):[];
  const i=selectedItemId?Core.getItem(state,selectedItemId):eligible.length===1?eligible[0]:null;
  if(i&&i.tickets.some(id=>!['已完成','已撤销'].includes(Core.getTicket(state,id).status)||Core.getTicket(state,id).disputed)) {
    const tid=i.tickets.find(id=>!['已完成','已撤销'].includes(Core.getTicket(state,id).status)||Core.getTicket(state,id).disputed);ticketDetail(tid,visitor);toast('已有此事项的工单，继续原记录，未重复创建');return;
  }
  if(visitor && i?.type==='aftersales' && !s?.flow.intakeEnabled) { toast('此会话未开放自助售后受理，请由客服协助登记'); return; }
  const title=i?.title||'', description=i?.request||(s?Core.sessionSummary(s,state):'');
  ui.modalContext=null;
  modal(visitor?'提交问题 · 先预览再确认':'创建关联工单',`<form data-form="new-ticket" data-session="${e(sessionId||'')}" data-visitor="${visitor}" data-request-key="${e('submit-'+Core.uid(state,'REQ'))}"><div class="note blue">${s?'关联会话 '+e(s.id):'独立受理将同时建立一个服务事项'}。登记只代表受理，退款等业务结果由人工核实。</div>${s?`<div class="field"><label for="ticket-item">归属事项<span class="required">*</span></label><select id="ticket-item" name="itemId" ${eligible.length?'required':''}>${selectOptions([['',eligible.length?'请选择归属事项':'新建独立服务事项'],...eligible.map(i=>[i.id,i.id+' · '+i.title])],i?.id||'')}</select></div>`:''}<div class="field"><label for="ticket-title">问题标题<span class="required">*</span></label><input id="ticket-title" name="title" maxlength="80" required value="${e(title)}"></div><div class="form-grid"><div class="field"><label for="ticket-category">问题类型</label><select id="ticket-category" name="category">${selectOptions(['售后服务','订单物流','知识咨询','其他问题'],i?.type==='order'?'订单物流':i?.type==='knowledge'?'知识咨询':i?.type==='aftersales'?'售后服务':'其他问题')}</select></div>${visitor?'<input type="hidden" name="priority" value="普通">':`<div class="field"><label for="ticket-priority">优先级</label><select id="ticket-priority" name="priority">${selectOptions(['普通','较高','紧急'],'普通')}</select></div>`}</div><div class="field"><label for="ticket-object">订单线索${i?.type==='aftersales'?'<span class="required">*</span>':''}</label><input id="ticket-object" name="objectId" maxlength="80" value="${e(i?.objectId||'')}" placeholder="例如 SO20260926001；客服会核实，不作为资格证明"></div><div class="field"><label for="ticket-description">问题描述<span class="required">*</span></label><textarea id="ticket-description" name="description" required maxlength="2000" style="min-height:120px">${e(description)}</textarea></div><div class="form-error" role="alert"></div><div class="form-footer">${button('暂存并关闭','close-modal')}<button class="btn primary" type="submit">预览并确认提交</button></div></form>`);
}
function ticketDetail(id, readOnly = false) {
  const t=Core.getTicket(state,id), item=Core.getItem(state,t.itemId);
  ui.modalContext={kind:'ticket',id};
  modal(t.id+' · '+t.title,`<div class="row wrap">${badge(t.status,t.status==='已完成'?'green':'blue')}${t.disputed?badge('异议待核','orange'):''}${badge(Core.itemNames[item.status])}<span class="tiny muted">事项 ${e(item.id)} · ${e(t.category)}</span></div><div class="summary-box section-space">${e(readOnly&&!t.customerSubmitted?'客服已根据本次咨询建立此工单：'+t.title:t.description)}${t.objectId?'\n订单线索：'+e(t.objectId):''}</div>${!readOnly&&t.sessionId?`<button class="text-link section-space" data-action="open-session" data-id="${t.sessionId}">查看关联会话 ${e(t.sessionId)} →</button>`:''}<div class="divider"></div>${!readOnly&&t.disputed?`<form data-form="ticket-dispute-review" data-id="${t.id}"><div class="note orange">客户异议：${e(t.disputeReason)}。工单保留已完成，事项已立即回到待人工。</div><div class="field"><label for="dispute-decision">复核处置</label><select id="dispute-decision" name="decision">${selectOptions([['reopen','异议成立，重开原工单'],['dismiss','经证据核实，维持原结果']],'reopen')}</select></div><div class="field"><label for="dispute-reason">客户可见复核说明</label><textarea id="dispute-reason" name="reason" required maxlength="1000"></textarea></div><div class="field"><label for="dispute-evidence">内部复核证据</label><textarea id="dispute-evidence" name="evidence" required maxlength="1000" placeholder="填写模拟核验依据，不得声称实际到账"></textarea></div><div class="form-error" role="alert"></div><button class="btn primary" type="submit">确认复核处置</button></form>`:!readOnly&&Core.transitions[t.status].length?`<form data-form="ticket-progress" data-id="${t.id}"><div class="form-grid"><div class="field"><label for="ticket-owner">负责人</label><select id="ticket-owner" name="owner">${selectOptions([['','请选择负责人'],...state.agents],t.owner)}</select></div><div class="field"><label for="ticket-next">下一状态<span class="required">*</span></label><select id="ticket-next" name="status" required>${selectOptions([['','请选择下一状态'],...Core.transitions[t.status]],'')}</select></div></div><div class="field"><label for="ticket-note">客户可见处理说明</label><textarea id="ticket-note" name="note" maxlength="1000" placeholder="待补充时说清缺什么；完成时说明实际处理结果。"></textarea></div><div class="field"><label for="ticket-internal">内部备注（不发送给客户）</label><textarea id="ticket-internal" name="internalNote" maxlength="1000"></textarea></div><div class="field"><label for="ticket-evidence">结果证据（完成时必填，仅内部可见）</label><textarea id="ticket-evidence" name="evidence" maxlength="1000" placeholder="例如：DEMO-AFTERSALE-001，模拟业务结果已核验。不要填写真实账户或联系方式。"></textarea></div><div class="form-error" role="alert"></div><div class="form-footer"><button class="btn primary" type="submit">更新工单</button></div></form>`:`<div class="note">${t.disputed?'正在复核你的未解决异议。':t.status==='已完成'?'处理环节已完成。请回到服务事项确认结果；仍有问题可提出异议。':'已保存问题，请在这里查看处理进度。'}</div>`}<h3 class="section-space">流转记录</h3>${[...t.history].reverse().map(h=>`<div class="timeline-item">${e(h.text)}${!readOnly&&h.internalNote?`<div class="internal-note">内部备注：${e(h.internalNote)}</div>`:''}${!readOnly&&h.evidence?`<div class="internal-note">内部证据：${e(h.evidence)}</div>`:''}<small>${dateTime(h.time)}</small></div>`).join('')}${readOnly&&t.status==='待客户补充'?`<form data-form="ticket-reply" data-id="${t.id}" class="section-space"><div class="field"><label for="ticket-reply">补充说明<span class="required">*</span></label><textarea id="ticket-reply" name="reply" required maxlength="1000" placeholder="会话结束后仍可提交，将重新核对负责人可用性。"></textarea></div><div class="form-error" role="alert"></div><button class="btn primary" type="submit">提交补充说明</button></form>`:''}${readOnly&&t.status==='已完成'&&!t.disputed?`<form data-form="ticket-dispute" data-id="${t.id}" class="section-space"><div class="field"><label for="ticket-objection">仍未解决？说明当前问题</label><textarea id="ticket-objection" name="reason" required maxlength="1000"></textarea></div><div class="form-error" role="alert"></div><button class="btn" type="submit">提出未解决异议</button></form>`:''}${readOnly?`<div class="form-footer">${button('返回咨询','close-modal','','primary')}</div>`:''}`);
}
function renderQuality() {
  const issues = state.issues.filter(q=>!ui.filters.qualityStatus||q.status===ui.filters.qualityStatus);
  const runs = state.sessions.flatMap(s=>s.runs.map(r=>({...r,sessionId:s.id,name:s.name}))).sort((a,b)=>b.time.localeCompare(a.time));
  const issueTable = `<div class="toolbar"><span class="tiny muted">异常是待复核线索，不自动判定为服务违规。</span><span class="spacer"></span><select data-filter="qualityStatus" aria-label="复核状态">${selectOptions([['','全部复核状态'],'待复核','已确认','已排除','信息不足'],ui.filters.qualityStatus)}</select></div><div class="table-wrap"><table><thead><tr><th>问题类型</th><th>证据摘要</th><th>关联会话</th><th>复核状态</th><th>操作</th></tr></thead><tbody>${issues.map(q=>`<tr><td><strong>${e(q.type)}</strong><div class="secondary">${e(q.id)}</div></td><td style="white-space:normal;max-width:300px">${e(q.evidence.slice(0,100))}</td><td><button class="text-link" data-action="open-session" data-id="${q.sessionId}">${e(q.sessionId)}</button></td><td>${badge(q.status,q.status==='待复核'?'orange':q.status==='已确认'?'red':'green')}</td><td><button class="text-link" data-action="issue-detail" data-id="${q.id}">查看并复核</button></td></tr>`).join('')}</tbody></table>${!issues.length?empty('当前没有待查看的问题记录'):''}</div>`;
  const runTable = `<div class="table-wrap"><table><thead><tr><th>执行记录</th><th>客户 / 会话</th><th>流程版本</th><th>结果</th><th>时间</th><th>操作</th></tr></thead><tbody>${runs.map(r=>`<tr><td><strong>${e(r.id)}</strong></td><td>${e(r.name)}<div class="secondary">${e(r.sessionId)}</div></td><td>v${r.version}</td><td>${badge(r.trace.some(t=>t.status==='error')?'包含异常':r.trace.some(t=>t.node==='human')?'转人工':'已响应',r.trace.some(t=>t.status==='error')?'orange':'blue')}</td><td>${dateTime(r.time)}</td><td><button class="text-link" data-action="run-detail" data-id="${r.id}" data-session="${r.sessionId}">执行详情</button></td></tr>`).join('')}</tbody></table>${!runs.length?empty('尚无执行记录'):''}</div>`;
  return heading('质检与日志','从问题原文和执行路径出发，确定真正需要改进的地方。',badge('规则线索 + 人工复核','blue')) +
    `<section class="card"><div class="tab-row"><button class="tab ${ui.qualityTab==='issues'?'active':''}" data-action="quality-tab" data-tab="issues">质量问题 ${state.issues.length}</button><button class="tab ${ui.qualityTab==='remediations'?'active':''}" data-action="quality-tab" data-tab="remediations">整改事项 ${state.issues.filter(q=>q.status==='已确认').length}</button><button class="tab ${ui.qualityTab==='runs'?'active':''}" data-action="quality-tab" data-tab="runs">执行日志 ${runs.length}</button></div>${ui.qualityTab==='issues'?issueTable:ui.qualityTab==='remediations'?renderRemediations():runTable}<div class="stats-footer">模拟日志仅保存在当前浏览器。未运行真实模型自动质检或后台定时任务。</div></section>`;
}
function renderRemediations() {
  const records=state.issues.filter(q=>q.status==='已确认');
  return `<div class="table-wrap"><table><thead><tr><th>问题 / 根因</th><th>责任人</th><th>状态</th><th>关联知识</th><th>操作</th></tr></thead><tbody>${records.map(q=>`<tr><td class="wrap-cell"><strong>${e(q.type)}</strong><div class="secondary">${e(q.id)} · ${e(q.remediation?.cause||'待定位')}</div></td><td>${e(q.remediation?.owner||'待分派')}</td><td>${badge(q.remediation?.status||'待分派',q.remediation?.status==='已关闭'?'green':'orange')}</td><td>${e(q.remediation?.knowledgeId||'未关联')}</td><td>${button('整改与验收','issue-detail',`data-id="${q.id}"`,'small')}</td></tr>`).join('')}</tbody></table>${!records.length?empty('先复核知识覆盖缺口，确认后建立整改事项'):''}</div>`;
}
function issueModal(id) {
  const q=state.issues.find(q=>q.id===id);if(!q)throw new Error('问题记录不存在');
  const r=q.remediation;
  ui.modalContext={kind:'issue',id};
  modal(q.type+' · '+q.id,`<div class="note blue">原始问题：${e(q.query||q.evidence)}<br>线索证据：${e(q.evidence)}</div><button class="text-link section-space" data-action="open-session" data-id="${q.sessionId}">查看完整会话与执行轨迹 →</button><div class="divider"></div><form data-form="review-issue" data-id="${q.id}"><div class="field"><label for="issue-status">复核结论</label><select id="issue-status" name="status">${selectOptions(['待复核','已确认','已排除','信息不足'],q.status)}</select></div><div class="field"><label for="issue-review">复核说明<span class="required">*</span></label><textarea id="issue-review" name="review" required maxlength="1000">${e(q.review)}</textarea></div><div class="form-grid"><div class="field"><label for="issue-owner">整改责任人（确认时必填）</label><input id="issue-owner" name="owner" maxlength="80" value="${e(r?.owner||'')}"></div><div class="field"><label for="issue-cause">根因判断（确认时必填）</label><input id="issue-cause" name="cause" maxlength="300" value="${e(r?.cause||'')}" placeholder="例如：缺少礼品卡使用规则，不是合理拒答违规"></div></div><div class="note">线索不等于违规。当前闭环专门演示知识类整改；排班、模型、工具类缺陷仍需对应的专项验证。</div><div class="form-error" role="alert"></div><div class="form-footer"><button type="submit" class="btn primary">保存复核结果</button></div></form>${q.status==='已确认'&&r?`<div class="divider"></div><h3>整改进度 · ${e(r.status)}</h3><p class="tiny muted">范围：本地演示。未验证真实服务效果。</p><div class="row wrap section-space">${r.status!=='已关闭'?button(r.knowledgeId?'编辑关联知识':'转为 FAQ 草稿','issue-knowledge',`data-id="${q.id}"`,'small'):''}${r.knowledgeId?badge(r.knowledgeId,'blue'):''}${r.status!=='已关闭'?button('原问题与边界回归','verify-remediation',`data-id="${q.id}"`,'small'):''}</div>${r.validation?`<details class="section-space"><summary>查看验证 ${e(r.validation.id)}</summary>${renderEvaluation(r.validation)}</details>`:''}${r.status==='待验收'?`<form data-form="close-remediation" data-id="${q.id}" class="section-space"><div class="field"><label for="acceptance-note">验收说明</label><textarea id="acceptance-note" name="acceptance" required maxlength="1000" placeholder="说明原问题、正反例与边界行为的验证结果。只关闭演示范围缺口。"></textarea></div><div class="form-error" role="alert"></div><button class="btn primary" type="submit">验收并关闭演示整改</button></form>`:''}${r.status==='已关闭'?`<div class="note section-space">${e(r.acceptance)}<br>${e(r.acceptedBy)} · ${dateTime(r.closedAt)} · 仅演示范围</div>`:''}`:''}`);
}

const contracts = {
  order: { title: '订单查询工具', status: '本地模拟', input: 'order_id：字符串\ncustomer_id：生产环境由服务端绑定', output: 'order_id / status / product / delivery', errors: 'ORDER_NOT_FOUND / TIMEOUT / FORBIDDEN', note: '当前仅返回两个虚构样例。生产环境必须校验身份与订单归属；字段为建议契约，未对应真实 API。' },
  knowledge: { title: '企业知识服务', status: '规则模拟', input: 'question / conversation_context / tenant_scope', output: 'answer / citations / knowledge_version', errors: 'NO_MATCH / KNOWLEDGE_UNAVAILABLE', note: '当前对已发布问答做关键词匹配。后续解析、索引、检索与重排由独立服务提供。' },
  visual: { title: '模型与文档解析', status: '待接入', input: 'authorized_text / document / approved_tools', output: 'intent / fields / evidence / trace', errors: 'UNSUPPORTED_INPUT / MODEL_TIMEOUT', note: '未接入真实模型、OCR、文档解析或向量检索；不能用本地规则测试声称模型效果。' },
  ticket: { title: '工单与业务系统', status: '前端模拟', input: 'session_id / service_item_id / title / category / description / request_key', output: 'ticket_id / status / owner / history', errors: 'VALIDATION_FAILED / CONFLICT / NOT_AUTHORIZED', note: '当前状态保存在本浏览器。数据库、消息通知、多人协作和写操作鉴权需要后端接入。' }
};
function renderIntegrations() {
  return heading('接入与集成','统一消息入口和业务工具，清晰区分演示能力与待接入能力。') +
    `<section class="card"><div class="card-head"><h2>渠道接入</h2><span class="tiny muted">当前仅 Web 本地入口可体验</span></div><div class="table-wrap"><table><thead><tr><th>渠道</th><th>接待能力</th><th>状态</th><th>下一阶段要求</th></tr></thead><tbody><tr><td><strong>Web 在线咨询</strong></td><td>文字、业务卡片、转人工</td><td>${badge('本地可体验','green')}</td><td><button class="text-link" data-nav="playground">打开访客窗口 →</button></td></tr><tr><td>App / 小程序</td><td>复用会话与流程服务</td><td>${badge('规划')}</td><td>SDK、身份绑定与消息回调</td></tr><tr><td>企业微信 / 公众号</td><td>渠道消息接入与路由</td><td>${badge('规划')}</td><td>平台授权、验签与消息格式转换</td></tr></tbody></table></div></section><h2 class="section-space" style="margin-bottom:15px">能力与工具</h2><div class="integration-grid">${Object.entries(contracts).map(([key,c])=>`<section class="card integration-card">${icon(key==='knowledge'?'book':key==='ticket'?'ticket':key==='visual'?'layers':'plug')}<h3>${c.title}</h3>${badge(c.status,key==='visual'?'purple':'blue')}<p>${e(c.note)}</p><button class="text-link" data-action="contract" data-id="${key}">查看接入契约 →</button></section>`).join('')}</div>`;
}
function renderArchitecture() {
  const layers = [['01 接入与会话',['Web / App / 企业渠道','客户身份与消息归一','会话状态管理']],['02 服务执行',['机器人接待','流程路由与变量采集','异常与人工兜底']],['03 业务能力',['知识检索与引用','业务工具与结果卡片','人工坐席与工单']],['04 配置与运营',['知识与流程发布','日志与问题复核','服务指标与改进']],['05 运行支撑',['租户与权限','服务端存储与审计','模型与业务系统']]];
  return heading('通用客服架构','公共服务能力承载流程，行业知识与业务系统通过配置接入。',`<a class="btn" href="方案文档.md" download>下载完整方案</a>`) +
    `<div class="grid-2"><section class="card"><div class="card-head"><div><h2>从客户问题到服务闭环</h2><p>目标架构 · 生产能力按阶段接入</p></div>${badge('产品架构','blue')}</div><div class="card-body">${layers.map(([title,items],i)=>`${i?'<div class="arch-arrow">↓</div>':''}<div class="arch-layer"><h3>${title}</h3><div class="arch-items">${items.map(x=>`<div class="arch-item">${x}</div>`).join('')}</div></div>`).join('')}</div></section><div class="stack"><section class="card"><div class="card-head"><h2>本阶段可以体验</h2></div><div class="card-body"><div class="summary-box">知识发布 → 访客问答 → 订单查询 → 人工接管 → 工单流转 → 问题复核</div><p class="tiny muted section-space">每个环节都使用本地演示数据。配置与服务结果在同一浏览器连续操作。</p><button class="btn primary section-space" data-nav="playground">开始体验 ${icon('arrow')}</button></div></section><section class="card"><div class="card-head"><h2>实现边界与下一阶段</h2></div><div class="card-body"><h3>已实现：本地状态与联动</h3><p class="tiny muted" style="line-height:2;margin-top:8px">事项、会话、工单、FAQ、发布回归与知识整改由同一数据模型驱动；纯前端模拟，没有后端安全保证。</p><div class="divider"></div><div class="note orange">真实模型/RAG、服务端鉴权、多租户、多人并发、数据库、业务退款、通知与线上收益均未验证。原方案引用的其他本地项目不在此仓库中，不能作为本项目已集成证据。</div></div></section></div></div>`;
}
function action(target) {
  const id = target.dataset.id;
  switch (target.dataset.action) {
    case 'demo-guide': showGuide(); break;
    case 'guide-start': closeModal(); go('playground'); break;
    case 'toggle-customer': document.body.classList.toggle('customer-mode'); render(); break;
    case 'entry': { if(!ui.play||Core.getSession(state,ui.play).status==='ended'){ui.play=Core.newSession(state).id;save();render();} fillVisitorInput(target.dataset.query);break; }
    case 'confirm-item': Core.confirmItem(state,id);save();render();toast('只确认了这一事项，其他事项不变');break;
    case 'item-help': askConfirm('这项仍未解决？','事项将回到待人工；已完成工单将增加异议待核，首次受理时间保留。','仍需帮助',()=>{Core.needHelp(state,id);save();render();toast('已登记未解决反馈');});break;
    case 'resume-item': Core.resumeItem(state,target.dataset.session,id);save();render();break;
    case 'continue-item': ui.play=Core.newSession(state,'林小夏',{itemId:id}).id;save();go('playground');break;
    case 'item-ticket': ticketModal(target.dataset.session,target.dataset.visitor==='true',id);break;
    case 'open-remediations': ui.qualityTab='remediations';go('quality');break;
    case 'evaluate-flow': {const result=Core.evaluateFlow(state);save();render();toast(result.passed?'发布回归已通过；不代表真实模型能力':'发布回归未通过，请查看具体用例');break;}
    case 'rollback-flow': askConfirm('将历史配置恢复为草稿？','不立即修改当前发布版。重新回归并发布后会生成一个新版本，保留全部历史。','恢复为草稿',()=>{Core.prepareRollback(state,Number(id));invalidateTest();save();render();});break;
    case 'evaluate-knowledge': {const r=Core.evaluateKnowledge(state,id);save();modal('FAQ 草稿回归',renderEvaluation(r)+`<div class="form-footer">${button('返回知识库','close-modal')}${r.passed?button('发布此知识','publish-knowledge',`data-id="${id}"`,'primary'):''}</div>`);break;}
    case 'issue-knowledge': {const q=state.issues.find(q=>q.id===id);assertIssue(q);knowledgeModal(q.remediation?.knowledgeId||'',q.id);break;}
    case 'verify-remediation': {const r=Core.verifyRemediation(state,id);save();issueModal(id);toast(r.passed?'原问题与边界回归已通过，请填写验收结论':'回归未通过，整改不能关闭');break;}

    case 'close-modal': closeModal(); break;
    case 'cancel-confirm': $('#confirm-dialog').close(); ui.confirm=null; break;
    case 'accept-confirm': { const run=ui.confirm; ui.confirm=null; $('#confirm-dialog').close(); run?.(); break; }
    case 'discard-input': {
      const form=target.closest('form');
      askConfirm('放弃未提交的输入？','只清除这份表单的暂存输入，已保存的配置和消息不受影响。','放弃输入',()=>{clearFormDraft(form);form.reset();showDraftStatus(form);save();}); break;
    }
    case 'new-chat':
    case 'verify-live': {
      if (target.dataset.action==='verify-live' && state.workspace.forms['robot:new']) { toast('机器人配置还有未提交输入，请先保存配置再验证。'); return; }
      ui.play=Core.newSession(state).id; save(); go('playground'); toast(`已新建会话，使用发布版 v${state.published.version}`); break;
    }
    case 'scenario': {
      const item=scenarios[Number(target.dataset.index)];
      if (!item) return;
      fillVisitorInput(item[2]); break;
    }
    case 'fill-order': fillVisitorInput(id); break;
    case 'open-visitor': ui.play=id; save(); closeModal(); go('playground'); break;
    case 'visitor-handoff': Core.sendVisitor(state,id,'我需要人工客服协助。',{forceHandoff:true}); save(); render(); break;
    case 'resume-bot': Core.resumeBot(state,id); save(); render(); break;
    case 'visitor-finish': askConfirm('结束本次咨询？','聊天与工单记录会保留，待处理工单可以继续跟进。此操作不会记为机器人已解决。','结束咨询',()=>{Core.finish(state,id,'visitor');save();render();}); break;
    case 'visitor-solved': Core.finish(state,id,'customer'); save(); render(); toast('已记录解决反馈'); break;
    case 'open-session': document.body.classList.remove('customer-mode'); ui.returnTo=ui.modalContext?{...ui.modalContext,page:ui.page}:null; ui.session=id; ui.filters.sessionStatus=''; ui.filters.sessions=''; closeModal(); go('sessions'); break;
    case 'return-context': { const source=ui.returnTo; ui.returnTo=null; go(source.page); if(source.kind==='issue')issueModal(source.id);else ticketDetail(source.id); break; }
    case 'select-session': ui.session=id; render(); break;
    case 'takeover': Core.takeover(state,id); ui.session=id; if(ui.filters.sessionStatus)ui.filters.sessionStatus='human'; save(); render(); $('[data-form="agent-message"] textarea')?.focus(); toast(`已接管 ${id}，可以发送人工回复`); break;
    case 'agent-finish': askConfirm('结束当前服务？',`将结束会话 ${id}。请确认已完成本次沟通；关联工单继续保留。`,'结束服务',()=>{Core.finish(state,id,'agent');ui.session=id;if(ui.filters.sessionStatus)ui.filters.sessionStatus='ended';save();render();toast('会话已结束');}); break;
    case 'new-ticket': ticketModal(target.dataset.session,target.dataset.visitor==='true'); break;
    case 'ticket-detail': ticketDetail(id); break;
    case 'ticket-read': ticketDetail(id,true); break;
    case 'source': {
      const source=Core.getSession(state,id).messages[Number(target.dataset.index)]?.citation;
      if (!source) throw new Error('没有可查看的引用');
      modal(source.title,`<div class="row" style="margin-bottom:15px">${badge(source.id,'blue')}${badge('v'+source.version)}</div><div class="summary-box">${e(source.answer)}</div><p class="tiny muted section-space">来源：${e(source.source)}<br>适用范围：${e(source.scope)} · 维护人：${e(source.owner)}<br>${e(Core.citationStatus(state,source))}。历史原文不会被后续编辑改写。</p>`); break;
    }
    case 'select-node': ui.node=id; render(); break;
    case 'publish-flow': {
      Core.validateFlow(state.draft);
      if(!Core.flowChanged(state))return;
      askConfirm(`发布流程 v${state.published.version+1}？`,'将当前已通过发布回归的草稿用于新会话。旧会话保留流程，实时容量与知识另行读取；没有匹配的回归记录将阻止发布。','确认发布',()=>{const version=Core.publishFlow(state);save();invalidateTest();render();toast(`流程 v${version} 已模拟发布；新建会话验证，旧会话保留原版本`);}); break;
    }
    case 'edit-knowledge': knowledgeModal(id); break;
    case 'publish-knowledge': {
      const k=state.knowledge.find(k=>k.id===id); if (!k) throw new Error('知识不存在');
      askConfirm('发布知识？',`“${k.draft?.title||k.title}”将参与后续问答，历史回复保持原引用。`,'确认发布',()=>{Core.publishKnowledge(state,id);invalidateTest();ui.filters.knowledgeStatus='';ui.focusKnowledge=id;save();closeModal();render();toast('知识已模拟发布，可进行检索试验');}); break;
    }
    case 'disable-knowledge': {
      const k=state.knowledge.find(k=>k.id===id); if (!k) throw new Error('知识不存在');
      askConfirm('停用这条知识？',`停用后“${k.title}”不再参与新的回答，历史引用仍保留。`,'确认停用',()=>{Core.disableKnowledge(state,id,'演示人工紧急停用，后续回答排除该知识');invalidateTest();save();render();toast('知识已停用，可从已停用列表重新启用');}); break;
    }
    case 'knowledge-test': modal('知识检索试验',`<form data-form="knowledge-test"><div class="field"><label for="kb-query">输入客户问题</label><input name="question" id="kb-query" required maxlength="2000" placeholder="例如：七天无理由退货有什么条件？"></div><button class="btn primary" type="submit">检索已发布知识</button><div id="kb-result" class="section-space"></div></form>`); break;
    case 'quality-tab': ui.qualityTab=target.dataset.tab; render(); break;
    case 'issue-detail': issueModal(id); break;
    case 'mark-issue': modal('标记服务问题',`<form data-form="mark-issue" data-id="${id}"><div class="field"><label for="issue-evidence">问题说明<span class="required">*</span></label><textarea id="issue-evidence" name="evidence" required maxlength="1000" placeholder="指出哪条回复存在什么问题，便于后续复核。"></textarea></div><div class="form-error" role="alert"></div><div class="form-footer"><button class="btn primary" type="submit">登记问题</button></div></form>`); break;
    case 'run-detail': {
      const s=Core.getSession(state,target.dataset.session), run=s.runs.find(r=>r.id===id);
      if (!run) throw new Error('执行记录不存在');
      modal(id+' · 执行详情',`<div class="row">${badge('v'+run.version,'blue')}<span class="tiny muted">${dateTime(run.time)}</span></div>${renderTrace(run.trace)}<button class="text-link section-space" data-action="open-session" data-id="${s.id}">查看完整会话 →</button>`); break;
    }
    case 'contract': {
      const c=contracts[id]; if (!c) return;
      modal(c.title,`<p>${e(c.note)}</p><h3>建议输入</h3><div class="code-block section-space">${e(c.input)}</div><h3 class="section-space">建议输出</h3><div class="code-block section-space">${e(c.output)}</div><h3 class="section-space">错误类型</h3><div class="code-block section-space">${e(c.errors)}</div>`); break;
    }
    case 'reset': modal('重置本地演示',`<p>将恢复初始样例，清除本应用中新增的会话、知识、流程修改和工单。其他应用的数据不受影响。</p><div class="form-footer">${button('取消','close-modal')}${button('恢复初始样例','confirm-reset','','danger')}</div>`); break;
    case 'confirm-reset': document.body.classList.remove('customer-mode'); state=Core.newState(); state.workspace={forms:{}}; ui.play=null; ui.session=state.sessions[0].id; ui.flowTest=null; ui.returnTo=null; Object.keys(ui.filters).forEach(k=>ui.filters[k]=''); save(); closeModal(); go('overview'); toast('已恢复初始演示数据'); break;
  }
}
function fillVisitorInput(text) {
  const field=$('[data-form="visitor-message"] textarea');
  if(!field){toast('当前咨询已结束，请新建会话后提问。');return;}
  const fill=()=>{field.value=text;rememberForm(field.form);field.focus();};
  if(field.value.trim() && field.value!==text)askConfirm('替换未发送的消息？','当前输入还未发送，替换后可继续编辑。','替换输入',fill);else fill();
}
function submitForm(form, submitter) {
  const data=Object.fromEntries(new FormData(form));
  const kind=form.dataset.form;
  switch (kind) {
    case 'visitor-message': Core.sendVisitor(state,form.dataset.id,data.message); clearFormDraft(form); save(); render(); $('[data-form="visitor-message"] textarea')?.focus(); break;
    case 'agent-message': Core.sendAgent(state,form.dataset.id,data.message); clearFormDraft(form); save(); render(); $('[data-form="agent-message"] textarea')?.focus(); break;
    case 'robot': {
      const name=data.name.trim(), greeting=data.greeting.trim(), description=data.description.trim();
      if (!name || !greeting || !description) throw new Error('名称、欢迎语和服务说明不能为空');
      state.robot={name,greeting,description}; clearFormDraft(form); save(); render(); toast('配置已保存，可点击“新建会话验证已保存配置”体验'); break;
    }
    case 'node': {
      saveNodeInput(form); break;
    }
    case 'flow-test': ui.flowTest={query:data.question,runtimeKey:JSON.stringify(Core.capacityState(state)),result:Core.simulate(data.question,{runtime:Core.capacityState(state),customerId:'DEMO-CUSTOMER'}, {...state.draft,version:state.published.version+' 草稿'},state.knowledge)}; render(); break;
    case 'knowledge': {
      const payload={...data,id:form.dataset.id,issueId:form.dataset.issue,effectiveAt:new Date(data.effectiveAt).toISOString(),expiresAt:data.expiresAt?new Date(data.expiresAt).toISOString():''};
      const k=Core.saveKnowledge(state,payload);clearFormDraft(form);form.dataset.id=k.id;clearFormDraft(form);invalidateTest();ui.focusKnowledge=k.id;ui.filters.knowledge='';ui.filters.knowledgeStatus='';save();
      if(submitter?.value==='test'){
        let r;try {r=Core.evaluateKnowledge(state,k.id);}catch(err){knowledgeModal(k.id,form.dataset.issue);$('#modal .form-error').textContent='草稿已保存，但回归未完成：'+err.message;return;}
        save();closeModal();render();modal('FAQ 草稿回归',renderEvaluation(r)+`<div class="form-footer">${button('返回知识库','close-modal')}${r.passed?button('发布此知识','publish-knowledge',`data-id="${k.id}"`,'primary'):''}</div>`);
      }else {closeModal();render();toast('草稿已保存；现行发布内容保持不变');}break;
    }
    case 'knowledge-test': {
      const hit=Core.findKnowledge(data.question,state.knowledge);
      $('#kb-result').innerHTML=hit?.conflict?'<div class="note orange">多条有效知识同等匹配且答案不同，需要人工核实。</div>':hit?`<div class="note blue">匹配关键词：${e(hit.matches.join('、'))} · ${e(hit.item.id)} v${hit.item.version}</div><div class="summary-box section-space">${e(hit.item.answer)}</div>`:'<div class="note orange">没有匹配到已发布知识。可补充条目或调整关键词。</div>'; break;
    }
    case 'new-ticket': {
      const visitor=form.dataset.visitor==='true',payload={...data,sessionId:form.dataset.session,customerSubmitted:visitor,requestKey:form.dataset.requestKey};
      // 先在隔离副本校验；预览阶段绝不创建工单。
      Core.createTicket(Core.clone(state),payload);
      askConfirm('确认提交这项处理需求？',`事项：${data.itemId||'新事项'}；标题：${data.title}；订单线索：${data.objectId||'无'}；描述：${data.description}\n提交仅表示受理，不保证已通过售后审批或退款到账。`,'确认提交（模拟受理）',()=>{const t=Core.createTicket(state,payload);clearFormDraft(form);save();closeModal();render();ticketDetail(t.id,visitor);toast(`受理成功：${t.id}，仍待人工处理`);});break;
    }
    case 'ticket-progress': {const t=Core.advanceTicket(state,form.dataset.id,data.status,data.owner,data.note,{internalNote:data.internalNote,evidence:data.evidence});clearFormDraft(form);save();render();ticketDetail(t.id);toast('工单已更新，客户只看到公开处理说明');break;}
    case 'ticket-reply': {const t=Core.addTicketReply(state,form.dataset.id,data.reply);clearFormDraft(form);save();render();ticketDetail(t.id,true);toast('补充已提交，当前工单为'+t.status);break;}
    case 'ticket-dispute': Core.disputeTicket(state,form.dataset.id,data.reason);clearFormDraft(form);save();render();ticketDetail(form.dataset.id,true);toast('事项已回到待人工，工单异议待核');break;
    case 'ticket-dispute-review': Core.reviewDispute(state,form.dataset.id,data.decision,data.reason,data.evidence);clearFormDraft(form);save();render();ticketDetail(form.dataset.id);toast('异议复核已记录，原受理时间保留');break;
    case 'runtime': Core.setRuntime(state,{humanMode:data.humanMode,capacity:Number(data.capacity),toolEnabled:data.toolEnabled==='true'},data.reason);state.operator=data.operator;clearFormDraft(form);save();render();toast('实时状态已应用；旧会话下一步也使用新状态');break;
    case 'review-issue': Core.reviewIssue(state,form.dataset.id,data);clearFormDraft(form);save();render();issueModal(form.dataset.id);toast('复核结果已保存');break;
    case 'close-remediation': Core.closeRemediation(state,form.dataset.id,data.acceptance);clearFormDraft(form);save();render();issueModal(form.dataset.id);toast('演示范围整改已关闭，未宣称生产验收');break;
    case 'mark-issue': {
      if (!data.evidence.trim()) throw new Error('请填写问题说明');
      Core.getSession(state,form.dataset.id);
      state.issues.unshift({id:'QA'+String(++state.counter).padStart(5,'0'),sessionId:form.dataset.id,time:Core.now(),status:'待复核',review:'',type:'人工标记',query:[...Core.getSession(state,form.dataset.id).messages].reverse().find(m=>m.role==='user')?.text||data.evidence.trim(),evidence:data.evidence.trim(),suggestion:'根据原始消息复核并登记改进事项'});
      clearFormDraft(form); save(); closeModal(); render(); toast('问题已登记，可前往质检与日志复核'); break;
    }
  }
}
document.addEventListener('click',event=>{
  const target=event.target.closest('[data-nav],[data-action]');
  if (!target || target.disabled) return;
  try { if (target.dataset.nav) { if(target.dataset.nav!=='playground')document.body.classList.remove('customer-mode'); ui.returnTo=null;closeModal();go(target.dataset.nav); } else action(target); }
  catch (err) { toast(err.message || '操作未完成，请重试'); }
});
document.addEventListener('submit',event=>{
  const form=event.target.closest('[data-form]'); if (!form) return;
  event.preventDefault();
  const error=form.querySelector('.form-error'); if (error) error.textContent='';
  try { submitForm(form,event.submitter); }
  catch(err) { if (error) error.textContent=err.message; else toast(err.message || '操作未完成'); }
});
document.addEventListener('keydown',event=>{
  if (event.target.matches('[data-chat-input]') && event.key==='Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); event.target.form.requestSubmit(); }
});
function filterInput(target) {
  const key=target.dataset.filter, start=target.selectionStart;
  ui.filters[key]=target.value; render();
  const next=document.querySelector(`input[data-filter="${key}"]`); next?.focus(); next?.setSelectionRange(start,start);
}
document.addEventListener('input',event=>{
  const target=event.target;
  if(target.matches('input[data-filter]')) { if(!event.isComposing)filterInput(target);return; }
  const form=target.closest('form[data-form]');
  if(form?.dataset.form==='node')saveNodeInput(form);else rememberForm(form);
  if(form?.dataset.form==='flow-test') {invalidateTest();$('#flow-test-result').innerHTML=empty('问题已变更，请重新运行测试。');}
  if(form?.dataset.form==='knowledge-test') $('#kb-result').textContent='';
});
document.addEventListener('compositionend',event=>{if(event.target.matches('input[data-filter]'))filterInput(event.target);});
document.addEventListener('change',event=>{
  const target=event.target;
  if(target.matches('[data-play-select]')) {ui.play=target.value||null;save();render();return;}
  if(target.matches('select[data-filter]')) {ui.filters[target.dataset.filter]=target.value;render();return;}
  const form=target.closest('form[data-form]');
  if(form?.dataset.form==='node')saveNodeInput(form);else rememberForm(form);
  if(target.id==='ticket-next'){form.elements.note.required=['待客户补充','已完成','已撤销','待分配'].includes(target.value);form.elements.evidence.required=target.value==='已完成';form.elements.owner.required=!['待分配','已撤销'].includes(target.value);} if(target.id==='ticket-item'&&target.value){const i=Core.getItem(state,target.value);form.elements.title.value=i.title;form.elements.objectId.value=i.objectId;form.elements.description.value=i.request;form.elements.category.value=i.type==='aftersales'?'售后服务':i.type==='order'?'订单物流':i.type==='knowledge'?'知识咨询':'其他问题';rememberForm(form);}
});
window.addEventListener('hashchange',()=>{dismissConfirmation();closeModal();render();$('#page').focus({preventScroll:true});window.scrollTo(0,0);});
window.addEventListener('popstate',()=>{dismissConfirmation();closeModal();render();});
$('#modal').addEventListener('cancel',()=>{ui.modalContext=null;});
$('#confirm-dialog').addEventListener('cancel',()=>{ui.confirm=null;});
save();
render();
