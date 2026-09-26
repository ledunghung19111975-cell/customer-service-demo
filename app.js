/* 产出 Agent：Codex。T-138 前端主稿。 */
'use strict';
const Core = window.CustomerDemo;
const STORAGE_KEY = 'zhixu-customer-demo-v1';
let storageAvailable = true;
let state;
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  state = saved && saved.schema === 1 && Array.isArray(saved.sessions) && Array.isArray(saved.knowledge) && Array.isArray(saved.tickets) && Array.isArray(saved.issues) && saved.robot && saved.draft && saved.published ? saved : Core.newState();
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
function toast(text) { $('#toast').textContent = text; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3300); }
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
  if ('humanOnline' in data) data.humanOnline = data.humanOnline === 'true';
  Object.assign(state.draft,data); invalidateTest(); save();
  const status = $('#flow-draft-status');
  if (status) status.textContent = Core.flowChanged(state) ? '草稿已自动保存 · 待发布' : '与发布版本一致';
  const publish = $('[data-action="publish-flow"]');
  if (publish) publish.disabled = !Core.flowChanged(state);
  const result = $('#flow-test-result');
  if (result) result.innerHTML = empty('参数已更新，请重新运行测试。');
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
function renderOverview() {
  const m = Core.metrics(state);
  const cards = [['会话总数', m.total, '样例会话与本次体验', 'chat'], ['AI 独立解决', m.aiResolved, '客户确认解决，且未转人工', 'check'], ['等待人工接管', m.waiting, '进入会话中心继续服务', 'user'], ['未完成工单', m.tickets, '待分配、处理中及待补充', 'ticket']];
  const distribution = ['bot', 'waiting', 'human', 'offline', 'ended'].map(key => ({ name: sessionNames[key], count: state.sessions.filter(s => s.status === key).length }));
  const max = Math.max(1, ...distribution.map(x => x.count));
  return heading('服务工作台', '连接每一次咨询，让问题有回应、服务可追溯。', `<span class="tiny muted">本地演示空间 · 全部记录</span>`) +
    `<div class="hero-strip"><div><h2>从一个问题，体验完整服务流程</h2><p>试试查订单、询问退货规则，再把复杂问题交给人工处理。</p><div class="hero-steps"><span>客户提问</span>→<span>流程路由</span>→<span>知识 / 业务查询</span>→<span>人工与工单</span></div></div><button class="btn primary" data-nav="playground">开始体验 ${icon('arrow')}</button></div>` +
    `<div class="metric-grid">${cards.map(([label, value, foot, glyph]) => `<div class="card metric"><div class="row between"><span class="metric-label">${label}</span><span class="metric-icon">${icon(glyph)}</span></div><div class="metric-value">${value}<span class="tiny muted" style="margin-left:7px;font-weight:400">${glyph === 'ticket' ? '单' : '个'}</span></div><small>${foot}</small></div>`).join('')}</div>` +
    `<div class="grid-2"><section class="card"><div class="card-head"><div><h2>最近会话</h2><p>完整聊天与执行路径，随时可查</p></div><button class="text-link" data-nav="sessions">全部会话 →</button></div><div class="table-wrap"><table><thead><tr><th>客户与问题</th><th>服务状态</th><th>流程</th><th>操作</th></tr></thead><tbody>${state.sessions.slice(0, 5).map(s => `<tr><td><strong>${e(s.name)}</strong><div class="secondary">${e((s.summary || '客户刚刚进入会话').slice(0, 22))}</div></td><td>${badge(sessionNames[s.status], sessionColors[s.status])}</td><td><span class="tiny muted">v${s.flow.version}</span></td><td><button class="text-link" data-action="open-session" data-id="${s.id}">查看</button></td></tr>`).join('')}</tbody></table></div><div class="stats-footer">数字由当前演示记录计算，不代表真实业务表现。</div></section><section class="card"><div class="card-head"><h2>服务处理分布</h2>${badge('当前快照')}</div><div class="card-body"><div class="bar-chart">${distribution.map(x => `<div class="bar-col"><span>${x.count}</span><div class="bar" style="height:${Math.max(3, x.count / max * 104)}px"></div><span class="bar-label">${x.name.replace('机器人接待','机器人').replace('等待接管','待接管').replace('人工服务','人工')}</span></div>`).join('')}</div><div class="row between tiny muted"><span>已发布知识</span><strong class="blue-text">${m.knowledge} 条</strong></div><div class="progress-row"><span>当前流程</span><div class="progress-track"><span style="width:100%"></span></div><span>v${state.published.version}</span></div></div></section></div>` +
    `<div class="grid-2 section-space"><section class="card"><div class="card-head"><h2>常用操作</h2><span class="tiny muted">配置 → 验证 → 服务</span></div><div class="card-body">${[['book','维护知识库', `${m.knowledge} 条知识已发布，草稿不参与回答`,'knowledge'],['flow','调整服务流程','编辑路由与异常策略，先测试再发布','workflow'],['shield','复核服务问题',`${m.issues} 条问题等待复核`,'quality']].map(([glyph,title,desc,page])=>`<div class="todo-row"><span class="todo-icon">${icon(glyph)}</span><div><h3>${title}</h3><small>${desc}</small></div><span class="spacer"></span><button class="icon-btn" data-nav="${page}" aria-label="${title}">${icon('arrow')}</button></div>`).join('')}</div></section><section class="card"><div class="card-head"><h2>演示范围</h2>${badge('前端原型','blue')}</div><div class="card-body"><p class="tiny muted" style="line-height:2">知识、编排、会话与工单可连续操作。问答采用本地规则，业务查询使用样例数据；真实模型和业务系统尚未接入。</p><div class="divider"></div><div class="row between"><span class="tiny muted">了解模块与源码的关系</span><button class="text-link" data-nav="architecture">查看架构 →</button></div></div></section></div>`;
}
function renderMessages(s) {
  return s.messages.map((m, index) => {
    if (m.role === 'system') return `<div class="message system"><div class="bubble">${e(m.text)}${m.ticketId ? `<br><button class="text-link" data-action="${ui.page==='playground'?'ticket-read':'ticket-detail'}" data-id="${m.ticketId}">查看工单进度 →</button>` : ''}</div></div>`;
    const isUser = m.role === 'user', name = isUser ? s.name : m.role === 'agent' ? '客服小林' : s.robot.name;
    return `<div class="message ${isUser ? 'user' : ''}"><span class="avatar ${isUser ? '' : 'blue'}">${isUser ? e(s.name.slice(0,1)) : m.role === 'agent' ? '林' : icon('bot')}</span><div class="message-content"><div class="message-meta">${e(name)} · ${clockTime(m.time)}</div><div class="bubble">${e(m.text)}</div>${m.citation ? `<button class="source-button" data-action="source" data-id="${s.id}" data-index="${index}">${icon('book')}来源：${e(m.citation.title)} · v${m.citation.version}</button>` : ''}${m.order ? renderOrder(m.order) : ''}</div></div>`;
  }).join('');
}
function renderOrder(order) {
  return `<div class="order-card"><div class="row"><div class="product-image">${e(order.icon)}</div><div><h3>${e(order.product)}</h3><p>¥ ${e(order.price)} · 1 件</p></div></div><div class="order-details"><span>订单状态</span><span>${e(order.status)}</span><span>订单编号</span><span>${e(order.id)}</span><span>配送进展</span><span>${e(order.delivery)}</span><span>收件人</span><span>${e(order.receiver)}</span></div><div class="tiny subtle" style="margin-top:8px;font-size:9px">演示订单 · 不对应真实交易</div></div>`;
}
function renderTrace(trace) {
  if (!trace?.length) return '<div class="trace-empty">发送消息后，在这里查看路由与处理结果。</div>';
  return `<div class="trace">${trace.map((t, i) => `<div class="trace-step ${['error','warning'].includes(t.status) ? 'error' : ''}"><h3>${String(i+1).padStart(2,'0')} · ${e(t.label)}</h3><p>${e(t.detail)}</p>${t.status !== 'success' ? badge(({error:'异常',warning:'兜底',waiting:'等待'})[t.status] || t.status,'orange') : ''}</div>`).join('')}</div>`;
}
const scenarios = [
  ['知识问答','带来源的服务规则','七天无理由退货有什么条件？'],
  ['订单查询','先补充信息，再查看订单','帮我查一下订单'],
  ['查询完整订单','直接展示业务卡片','查询订单 SO20260926001'],
  ['复杂问题转人工','带上历史消息和问题摘要','请帮我转人工，包裹外盒有破损'],
  ['知识未命中','查看异常与人工兜底','礼品卡可以分多次使用吗？']
];
function renderPlayground() {
  const s = state.sessions.find(item => item.id === ui.play);
  const history = state.sessions.filter(item => item.name === '林小夏' || item.id === ui.play);
  const controls = `<select aria-label="体验会话" data-play-select><option value="">选择已有会话</option>${history.map(item=>`<option value="${item.id}" ${item.id===ui.play?'selected':''}>${e(item.id)} · ${e(item.name)} · ${sessionNames[item.status]}</option>`).join('')}</select>${button(`${icon('plus')}新建会话`, 'new-chat')}`;
  const scenariosView = `<aside><h3>试问当前会话</h3><p class="tiny muted" style="margin:5px 0 16px">点击问题填入输入框，再发送</p><div class="scenarios">${scenarios.map(([title,sub],i)=>`<button class="scenario-btn" data-action="scenario" data-index="${i}"><strong>${title}</strong><small>${sub}</small></button>`).join('')}</div><div class="note section-space">演示订单<br><button class="text-link" data-action="fill-order" data-id="SO20260926001">SO20260926001</button><br><button class="text-link" data-action="fill-order" data-id="SO20260926002">SO20260926002</button></div></aside>`;
  if (!s) return heading('体验中心','访客视角 · 在这里验证已发布配置。',controls)+`<div class="card start-panel"><h2>开始一段咨询</h2><p>仅查看本页不会创建会话。新会话将使用当前机器人和流程 v${state.published.version}。</p>${button('开始咨询','new-chat','','primary')}</div>`;
  const inactive = s.status === 'ended';
  const statusNotes = {waiting:'正在等待人工接管。可以补充问题，也可以取消排队。',human:'人工已接入。机器人暂停回答，你可以继续补充信息。',offline:'人工当前离线。可以提交问题留单、继续机器人咨询，或结束本次咨询。',ended:'本次咨询已结束。记录和工单仍可查看；新问题请新建会话。'};
  const serviceTools = s.status==='bot' ? `${button('转人工','visitor-handoff',`data-id="${s.id}"`,'small')}${Core.canResolve(s)?button('已解决，结束咨询','visitor-solved',`data-id="${s.id}"`,'small'):''}` : ['waiting','offline'].includes(s.status) ? button(s.status==='waiting'?'取消排队':'继续机器人咨询','resume-bot',`data-id="${s.id}"`,'small') : '';
  return heading('体验中心','访客视角 · 右侧展示后台执行轨迹。',controls)+
    `<div class="playground-grid">${scenariosView}<section class="card chat-panel"><div class="chat-title"><div class="bot-avatar">${icon('bot')}</div><div><h3>${e(s.robot.name)}</h3><small>${e(s.robot.description)}</small></div><span class="spacer"></span>${badge(sessionNames[s.status],sessionColors[s.status])}</div>${statusNotes[s.status]?`<div class="chat-status">${statusNotes[s.status]}</div>`:''}<div class="chat-body" aria-live="polite">${renderMessages(s)}</div><div class="chat-tools">${serviceTools}${!inactive?button('提交问题','new-ticket',`data-session="${s.id}" data-visitor="true"`,'small'):''}${!inactive?button('结束咨询','visitor-finish',`data-id="${s.id}"`,'small'):''}</div>${!inactive?`<form class="chat-input" data-form="visitor-message" data-id="${s.id}"><textarea name="message" data-chat-input maxlength="2000" aria-label="访客消息" placeholder="${s.status==='bot'?'输入你的问题…':'补充问题将保留在本会话中…'}"></textarea><div class="send-foot"><small>Enter 发送 · Shift+Enter 换行</small><button class="btn primary small" type="submit" disabled>发送 ${icon('send')}</button></div></form>`:`<div class="card-body">${button('新建会话继续咨询','new-chat','','primary')}</div>`}<div class="demo-switch"><span>演示视角切换</span><button class="text-link" data-action="open-session" data-id="${s.id}">打开对应坐席会话 →</button></div></section><section class="card trace-card"><div class="card-head"><div><h2>执行轨迹</h2><p>${e(s.id)} · 已绑定 v${s.flow.version}</p></div>${icon('flow')}</div>${s.flow.version!==state.published.version?`<div class="note orange">当前已发布 v${state.published.version}，此会话保留 v${s.flow.version}。${button('用最新配置新建会话','new-chat','','small')}</div>`:''}${renderTrace(s.runs.at(-1)?.trace)}<div class="stats-footer">仅展示本地规则执行结果。<br>当前知识会按最新发布内容检索。</div></section></div>`;
}

function sessionSummary(s) { return Core.sessionSummary(s); }
function renderSessions() {
  const list = state.sessions.filter(s => (!ui.filters.sessionStatus || s.status===ui.filters.sessionStatus) && `${s.id} ${s.name} ${s.messages.map(m=>m.text).join(' ')}`.toLowerCase().includes(ui.filters.sessions.trim().toLowerCase())).sort((a,b)=>(b.messages.at(-1)?.time||b.created).localeCompare(a.messages.at(-1)?.time||a.created));
  let s = list.find(s=>s.id===ui.session) || list[0];
  if (s) ui.session = s.id;
  const right = s ? `<div class="session-detail"><div class="chat-title"><span class="avatar green">${e(s.name.slice(0,1))}</span><div><h3>${e(s.name)}</h3><small>${e(s.id)} · ${e(s.channel)}</small></div><span class="spacer"></span>${['waiting','offline'].includes(s.status)?button(s.status==='offline'?'接管留言':'接管会话','takeover',`data-id="${s.id}"`,'primary small'):badge(sessionNames[s.status],sessionColors[s.status])}</div><div class="chat-body">${renderMessages(s)}</div><div class="chat-tools">${button('创建工单','new-ticket',`data-session="${s.id}"`,'small')}${button('标记问题','mark-issue',`data-id="${s.id}"`,'small')}${button('结束会话','agent-finish',`data-id="${s.id}" ${s.status!=='human'?'disabled':''}`,'small')}<button class="text-link" data-action="open-visitor" data-id="${s.id}">切到此会话访客视角 →</button></div><form class="chat-input" data-form="agent-message" data-id="${s.id}"><textarea name="message" data-chat-input aria-label="坐席回复" maxlength="2000" placeholder="${s.status==='human'?'输入人工回复…':'接管会话后可以回复'}" ${s.status!=='human'?'disabled':''}></textarea><div class="send-foot"><small>Enter 发送 · Shift+Enter 换行</small><button type="submit" class="btn primary small" ${s.status!=='human'?'disabled':''}>发送回复 ${icon('send')}</button></div></form></div><aside class="context-panel"><h3>访客信息</h3><div class="definition-row"><span>客户</span><strong>${e(s.name)} · 演示</strong></div><div class="definition-row"><span>来源渠道</span><strong>${e(s.channel)}</strong></div><div class="definition-row"><span>开始时间</span><strong>${dateTime(s.created)}</strong></div><div class="definition-row"><span>流程版本</span><strong>v${s.flow.version}</strong></div><div class="divider"></div><h3>转接摘要</h3><div class="summary-box">${e(sessionSummary(s))}</div><div class="divider"></div><h3>关联工单</h3>${s.tickets.length?s.tickets.map(id=>`<button class="source-button full-width" data-action="ticket-detail" data-id="${id}">${icon('ticket')}${e(id)}<span class="spacer"></span>查看 →</button>`).join(''):'<p class="tiny muted">暂无关联工单</p>'}<div class="divider"></div><h3>最近执行轨迹</h3>${renderTrace(s.runs.at(-1)?.trace)}</aside>` : empty('没有符合筛选条件的会话');
  return heading('会话中心','把机器人处理过的信息，连续交给人工客服。',`${ui.returnTo?button(ui.returnTo.kind==='issue'?'返回问题复核':'返回工单详情','return-context'):''}<span class="tiny muted">${Core.metrics(state).waiting} 个会话等待接管</span>`) + `<section class="card session-layout"><aside class="session-list"><div class="toolbar">${search('sessions','搜索客户、问题或会话号')}<select data-filter="sessionStatus" aria-label="会话状态">${selectOptions([['','全部状态'],...Object.entries(sessionNames)],ui.filters.sessionStatus)}</select></div>${list.map(s=>`<button class="session-item ${s.id===ui.session?'active':''}" data-action="select-session" data-id="${s.id}"><div class="row between"><strong>${e(s.name)}</strong><span class="when">${clockTime(s.messages.at(-1)?.time||s.created)}</span></div><div class="preview">${e(s.summary||'客户进入会话')}</div><div class="row between" style="margin-top:9px">${badge(sessionNames[s.status],sessionColors[s.status])}<span class="when">${e(s.id)}</span></div></button>`).join('')||empty('无匹配会话')}</aside>${right}</section>`;
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
    router: `<div class="field"><label for="order-words">订单关键词<span class="required">*</span></label><textarea id="order-words" name="orderWords" maxlength="200" required>${e(d.orderWords)}</textarea><span class="help">用逗号分隔。订单号也会直接进入查询。</span></div><div class="field"><label for="human-words">人工关键词<span class="required">*</span></label><textarea id="human-words" name="humanWords" maxlength="200" required>${e(d.humanWords)}</textarea><span class="help">人工优先，其他问题进入知识分支。</span></div>`,
    knowledge: `<div class="note">检索 ${Core.metrics(state).knowledge} 条已发布知识。当前使用关键词规则，未命中时进入人工兜底。</div><button type="button" class="text-link section-space" data-nav="knowledge">维护知识与关键词 →</button>`,
    order: `<div class="field"><label for="query-mode">查询结果模式</label><select id="query-mode" name="queryMode">${selectOptions([['success','正常返回样例订单'],['timeout','模拟工具超时']],d.queryMode)}</select><span class="help">缺订单号时先追问，未知订单不返回卡片。</span></div><div class="code-block">输入：order_id\n输出：订单状态、物流、商品\n异常：未找到 / 超时</div>`,
    human: `<div class="field"><label for="human-online">人工服务状态</label><select id="human-online" name="humanOnline">${selectOptions([['true','在线，可进入等待队列'],['false','离线，提示创建工单']],String(d.humanOnline))}</select></div><div class="field"><label for="queue-name">服务组名称<span class="required">*</span></label><input id="queue-name" name="queue" value="${e(d.queue)}" required maxlength="30"></div><div class="note">转接时保留完整聊天与问题摘要。</div>`,
    reply: `<div class="field"><label for="reply-prefix">回答引导语</label><textarea id="reply-prefix" name="prefix" maxlength="150">${e(d.prefix)}</textarea><span class="help">在命中的知识答案和订单结果前展示。</span></div><div class="note">保留知识来源，不对原文作模型改写。</div>`,
    end: '<div class="note">结束当前处理轮次，继续等待用户输入。会话只有在客户确认解决或人工结束时才关闭。</div>'
  };
  const editable = ['router','order','human','reply'].includes(ui.node);
  return `<form data-form="node" data-id="${ui.node}">${fields[ui.node]}<div class="form-error" role="alert"></div>${editable?'<p class="help">参数自动保存到草稿，发布后对新会话生效。</p>':''}</form>`;
}
function renderWorkflow() {
  const changed = Core.flowChanged(state);
  const current = flowNodes.find(n=>n[0]===ui.node);
  return heading('流程编排','把接待规则写进流程，用测试验证每一条服务路径。',`<span class="badge ${changed?'orange':'green'}" id="flow-draft-status">${changed?'草稿已自动保存 · 待发布':'与发布版本一致'}</span>${button('发布流程','publish-flow',changed?'':'disabled','primary')}${button('新建会话验证发布版','verify-live')}`) +
    `<div class="flow-layout"><div class="stack"><section class="card"><div class="canvas-toolbar"><div class="row"><strong>通用客服接待</strong>${badge('已发布 v'+state.published.version,'blue')}</div><span>固定模板 · 点击节点配置</span></div><div class="canvas-scroll"><div class="canvas"><svg class="flow-lines" viewBox="0 0 692 435" aria-label="流程连线"><defs><marker id="flow-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7" style="fill:#bbcce8;stroke:none"/></marker></defs><g marker-end="url(#flow-arrow)"><path d="M154 209H184"/><path d="M326 209H341V71H356"/><path d="M326 209H356"/><path d="M326 209H341V351H356"/><path d="M498 71H514V139H530"/><path d="M498 209H514V139H530"/><path d="M498 351H514V139H530"/><path d="M601 187V305"/><path d="M427 116V145H506V285H427V305" style="stroke-dasharray:4 4"/><path d="M498 225H506V285H427V305" style="stroke-dasharray:4 4"/></g><text x="329" y="61">知识</text><text x="329" y="197">订单</text><text x="329" y="374">人工</text><text x="461" y="277">异常兜底</text></svg>${flowNodes.map(([id,title,desc,glyph,x,y])=>`<button class="flow-node ${ui.node===id?'active':''}" data-action="select-node" data-id="${id}" style="left:${x}px;top:${y}px"><span class="node-icon">${icon(glyph)}</span><strong>${title}</strong><small>${desc}</small></button>`).join('')}</div></div><div class="flow-legend"><span><i class="legend-dot"></i>固定流程节点</span><span>实线：主路径</span><span>虚线：未命中 / 失败转人工</span><span class="spacer"></span><span>画布可横向滚动</span></div></section><section class="card"><div class="card-head"><div><h2>草稿测试</h2><p>使用当前草稿参数；不会创建会话和工单。</p></div>${badge('规则模拟')}</div><form data-form="flow-test" class="toolbar"><input name="question" aria-label="流程测试问题" placeholder="例如：查询订单 SO20260926001" value="${e(ui.flowTest?.query||'查询订单 SO20260926001')}" maxlength="2000" required style="flex:1"><button class="btn primary" type="submit">${icon('play')}运行测试</button></form><div id="flow-test-result">${ui.flowTest?`<div class="test-result"><div><h3 style="margin-bottom:12px">访客看到的结果</h3>${ui.flowTest.result.messages.map(m=>`<div class="bubble">${e(m.text)}</div>${m.order?renderOrder(m.order):''}`).join('')}<div class="note section-space">测试使用草稿。发布后新建会话才能验证访客侧新版本。</div></div>${renderTrace(ui.flowTest.result.trace)}</div>`:'<div class="empty" style="padding:27px">输入问题并运行测试，查看实际分支。</div>'}</div></section></div><aside class="card node-panel"><div class="card-head"><div><h2>${e(current[1])}</h2><p>节点参数 · 草稿</p></div>${icon(current[3])}</div><div class="card-body">${nodeForm()}<div class="divider"></div><p class="tiny muted">节点参数自动保存。测试验证草稿；发布只影响新会话，已有会话保持原版本。</p></div></aside></div>`;
}
function renderKnowledge() {
  const items = state.knowledge.filter(k=>(!ui.filters.knowledgeStatus||k.status===ui.filters.knowledgeStatus||ui.filters.knowledgeStatus==='pending'&&k.draft)&&`${k.title} ${k.keywords} ${k.id} ${k.draft?.title||''} ${k.draft?.keywords||''}`.toLowerCase().includes(ui.filters.knowledge.trim().toLowerCase()));
  return heading('知识库','编辑草稿，验证答案，再发布给访客使用。',`${button('检索试验','knowledge-test')}${button(`${icon('plus')}新建知识`,'edit-knowledge','','primary')}`)+
    `<section class="card"><div class="toolbar">${search('knowledge','搜索知识标题、关键词或编号')}<select data-filter="knowledgeStatus" aria-label="知识状态">${selectOptions([['','全部状态'],...Object.entries(knowledgeNames),['pending','有待发布修改']],ui.filters.knowledgeStatus)}</select><span class="spacer"></span><span class="tiny muted">${state.knowledge.length} 条知识 · ${Core.metrics(state).knowledge} 条已发布</span></div><div class="table-wrap"><table><thead><tr><th>知识名称</th><th>分类</th><th>关键词</th><th>版本 / 状态</th><th>操作</th></tr></thead><tbody>${items.map(k=>`<tr data-knowledge-row="${k.id}" class="${ui.focusKnowledge===k.id?'highlight-row':''}"><td><strong>${e(k.title)}</strong><div class="secondary">${e(k.id)}</div>${k.draft&&k.draft.title!==k.title?`<div class="secondary">待发布标题：${e(k.draft.title)}</div>`:''}</td><td>${e(k.category)}</td><td style="max-width:210px;white-space:normal">${e(k.keywords)}</td><td>${badge(knowledgeNames[k.status]+' v'+k.version,k.status==='published'?'green':k.status==='draft'?'orange':'')}${k.draft?`<div class="secondary">待发布草稿 v${k.draft.version}</div>`:''}</td><td><div class="row wrap"><button class="text-link" data-action="edit-knowledge" data-id="${k.id}">编辑</button>${k.draft||k.status!=='published'?`<button class="text-link" data-action="publish-knowledge" data-id="${k.id}">${k.draft?'发布草稿':k.status==='disabled'?'启用':'发布'}</button>`:''}${k.status==='published'?`<button class="text-link danger-text" data-action="disable-knowledge" data-id="${k.id}">停用</button>`:''}</div></td></tr>`).join('')}</tbody></table>${!items.length?empty('没有符合条件的知识，请调整搜索或状态筛选。'):''}</div><div class="stats-footer">已发布版本持续参与回答；保存编辑草稿不会撤下原答案，发布后才替换。</div></section><div class="note section-space">当前使用文本问答和关键词匹配。检索试验仅使用已发布内容。</div>`;
}

function knowledgeModal(id) {
  const record = state.knowledge.find(k=>k.id===id), k = record?.draft || record;
  ui.modalContext = null;
  modal(record?'编辑知识':'新建知识', `<form data-form="knowledge" data-id="${e(id||'')}">${record?.status==='published'?`<div class="note blue">当前 v${record.version} 正在使用。保存草稿后仍继续回答，发布才会替换。</div>`:''}<div class="field"><label for="knowledge-title">知识标题<span class="required">*</span></label><input id="knowledge-title" name="title" value="${e(k?.title||'')}" required maxlength="80" placeholder="例如：电子发票开具指引"></div><div class="form-grid"><div class="field"><label for="knowledge-category">分类</label><select id="knowledge-category" name="category">${selectOptions(['通用服务','产品知识','售后政策','会员权益','活动规则'],k?.category||'通用服务')}</select></div><div class="field"><label for="knowledge-keywords">匹配关键词<span class="required">*</span></label><input id="knowledge-keywords" name="keywords" value="${e(k?.keywords||'')}" required maxlength="200" placeholder="发票,开票,抬头"></div></div><div class="field"><label for="knowledge-answer">标准答案<span class="required">*</span></label><textarea id="knowledge-answer" name="answer" required maxlength="2000" style="min-height:170px" placeholder="填写客户应看到的服务说明。">${e(k?.answer||'')}</textarea></div><div class="form-error" role="alert"></div><div class="form-footer">${button('暂存并关闭','close-modal')}<button class="btn" type="submit" name="intent" value="draft">保存草稿</button><button class="btn primary" type="submit" name="intent" value="publish">保存并发布</button></div></form>`);
}

function renderTickets() {
  const list = state.tickets.filter(t=>(!ui.filters.ticketStatus||t.status===ui.filters.ticketStatus)&&`${t.id} ${t.title} ${t.owner}`.includes(ui.filters.tickets));
  return heading('工单中心','把需要持续跟进的问题留在工单里。',button(`${icon('plus')}新建工单`,'new-ticket','','primary'))+
    `<section class="card"><div class="toolbar">${search('tickets','搜索工单标题、编号或负责人')}<select data-filter="ticketStatus" aria-label="工单状态">${selectOptions([['','全部状态'],...Object.keys(Core.transitions)],ui.filters.ticketStatus)}</select><span class="spacer"></span><span class="tiny muted">共 ${list.length} 个工单</span></div><div class="table-wrap"><table><thead><tr><th>工单编号 / 标题</th><th>类型</th><th>优先级</th><th>状态</th><th>负责人</th><th>关联会话</th><th>操作</th></tr></thead><tbody>${list.map(t=>`<tr><td><strong>${e(t.title)}</strong><div class="secondary">${e(t.id)} · ${dateTime(t.created)}</div></td><td>${e(t.category)}</td><td>${badge(t.priority,t.priority==='紧急'?'red':'')}</td><td>${badge(t.status,t.status==='已完成'?'green':t.status==='待分配'?'orange':'blue')}</td><td>${e(t.owner||'待分配')}</td><td>${t.sessionId?`<button class="text-link" data-action="open-session" data-id="${t.sessionId}">${e(t.sessionId)}</button>`:'—'}</td><td><button class="text-link" data-action="ticket-detail" data-id="${t.id}">查看详情</button></td></tr>`).join('')}</tbody></table>${!list.length?empty('没有匹配的工单，可以从会话中创建'):''}</div><div class="stats-footer">本地状态流转 · 未连接真实工单系统、数据库或客户通知。</div></section>`;
}
function ticketModal(sessionId, visitor = false) {
  const s = state.sessions.find(s=>s.id===sessionId);
  const question = s?.messages.find(m=>m.role==='user')?.text || '';
  const description = visitor ? s.messages.filter(m=>m.role==='user').slice(-3).map(m=>m.text).join('\n').slice(0,2000) : s?sessionSummary(s):'';
  const category = /订单|物流|SO\d/i.test(question)?'订单物流':'售后服务';
  ui.modalContext = null;
  modal(visitor?'提交问题':'创建工单',`<form data-form="new-ticket" data-session="${e(sessionId||'')}" data-visitor="${visitor}">${s?`<div class="note blue" style="margin-bottom:18px">${visitor?'问题将保留在当前咨询中，可随时查看处理进度。':`关联会话 ${e(s.id)} · ${e(s.name)}`}</div>`:''}<div class="field"><label for="ticket-title">问题标题<span class="required">*</span></label><input id="ticket-title" name="title" maxlength="80" required value="${e(question.slice(0,80))}" placeholder="概括需要处理的问题"></div><div class="form-grid"><div class="field"><label for="ticket-category">问题类型</label><select id="ticket-category" name="category">${selectOptions(['售后服务','订单物流','知识咨询','其他问题'],category)}</select></div>${visitor?'<input type="hidden" name="priority" value="普通">':`<div class="field"><label for="ticket-priority">优先级</label><select id="ticket-priority" name="priority">${selectOptions(['普通','紧急'],'普通')}</select></div>`}</div><div class="field"><label for="ticket-description">问题描述<span class="required">*</span></label><textarea id="ticket-description" name="description" required maxlength="2000" style="min-height:150px">${e(description)}</textarea></div><div class="form-error" role="alert"></div><div class="form-footer">${button('暂存并关闭','close-modal')}<button class="btn primary" type="submit">${visitor?'提交问题':'创建工单'}</button></div></form>`);
}

function ticketDetail(id, readOnly = false) {
  const t = state.tickets.find(t=>t.id===id);
  if (!t) throw new Error('工单不存在');
  ui.modalContext = {kind:'ticket',id};
  modal(t.id+' · '+t.title,`<div class="row" style="margin-bottom:18px">${badge(t.status,t.status==='已完成'?'green':'blue')}${!readOnly?badge(t.priority,t.priority==='紧急'?'red':''):''}<span class="tiny muted">${e(t.category)}</span></div><div class="summary-box">${e(readOnly&&!t.customerSubmitted?'客服已根据本次咨询建立此工单：'+t.title:t.description)}</div>${t.sessionId&&!readOnly?`<button class="text-link section-space" data-action="open-session" data-id="${t.sessionId}">查看关联会话 ${e(t.sessionId)} →</button>`:''}<div class="divider"></div>${!readOnly&&Core.transitions[t.status].length?`<form data-form="ticket-progress" data-id="${t.id}"><div class="form-grid"><div class="field"><label for="ticket-owner">负责人<span class="required">*</span></label><select id="ticket-owner" name="owner" required>${selectOptions([['','请选择负责人'],'客服小林','客服小周'],t.owner)}</select></div><div class="field"><label for="ticket-next">下一状态<span class="required">*</span></label><select id="ticket-next" name="status" required>${selectOptions([['','请选择下一状态'],...Core.transitions[t.status]],'')}</select></div></div><div class="field"><label for="ticket-note">处理说明</label><textarea id="ticket-note" name="note" maxlength="1000" placeholder="待客户补充或完成时必填：说明需要补充的材料，或记录处理结果。"></textarea></div><div class="form-error" role="alert"></div><div class="form-footer"><button type="submit" class="btn primary">更新工单</button></div></form>`:`<div class="note">${t.status==='已完成'?'问题已处理完成，记录保留在本次咨询中。':'问题已提交，请在这里查看后续处理进度。'}</div>`}<h3 class="section-space" style="margin-bottom:15px">流转记录</h3>${[...t.history].reverse().map(h=>`<div class="timeline-item">${e(h.text)}<small>${dateTime(h.time)}</small></div>`).join('')}${readOnly&&t.status==='待客户补充'?`<form data-form="ticket-reply" data-id="${t.id}" class="section-space"><div class="field"><label for="ticket-reply">补充说明<span class="required">*</span></label><textarea id="ticket-reply" name="reply" required maxlength="1000" placeholder="按上方处理说明补充信息。咨询结束后仍可提交。"></textarea></div><div class="form-error" role="alert"></div><button class="btn primary" type="submit">提交补充说明</button></form>`:''}${readOnly?`<div class="form-footer">${button('返回咨询','close-modal','','primary')}</div>`:''}`);
}

function renderQuality() {
  const issues = state.issues.filter(q=>!ui.filters.qualityStatus||q.status===ui.filters.qualityStatus);
  const runs = state.sessions.flatMap(s=>s.runs.map(r=>({...r,sessionId:s.id,name:s.name}))).sort((a,b)=>b.time.localeCompare(a.time));
  const issueTable = `<div class="toolbar"><span class="tiny muted">异常是待复核线索，不自动判定为服务违规。</span><span class="spacer"></span><select data-filter="qualityStatus" aria-label="复核状态">${selectOptions([['','全部复核状态'],'待复核','已确认','已排除'],ui.filters.qualityStatus)}</select></div><div class="table-wrap"><table><thead><tr><th>问题类型</th><th>证据摘要</th><th>关联会话</th><th>复核状态</th><th>操作</th></tr></thead><tbody>${issues.map(q=>`<tr><td><strong>${e(q.type)}</strong><div class="secondary">${e(q.id)}</div></td><td style="white-space:normal;max-width:300px">${e(q.evidence.slice(0,100))}</td><td><button class="text-link" data-action="open-session" data-id="${q.sessionId}">${e(q.sessionId)}</button></td><td>${badge(q.status,q.status==='待复核'?'orange':q.status==='已确认'?'red':'green')}</td><td><button class="text-link" data-action="issue-detail" data-id="${q.id}">查看并复核</button></td></tr>`).join('')}</tbody></table>${!issues.length?empty('当前没有待查看的问题记录'):''}</div>`;
  const runTable = `<div class="table-wrap"><table><thead><tr><th>执行记录</th><th>客户 / 会话</th><th>流程版本</th><th>结果</th><th>时间</th><th>操作</th></tr></thead><tbody>${runs.map(r=>`<tr><td><strong>${e(r.id)}</strong></td><td>${e(r.name)}<div class="secondary">${e(r.sessionId)}</div></td><td>v${r.version}</td><td>${badge(r.trace.some(t=>t.status==='error')?'包含异常':r.trace.some(t=>t.node==='human')?'转人工':'已响应',r.trace.some(t=>t.status==='error')?'orange':'blue')}</td><td>${dateTime(r.time)}</td><td><button class="text-link" data-action="run-detail" data-id="${r.id}" data-session="${r.sessionId}">执行详情</button></td></tr>`).join('')}</tbody></table>${!runs.length?empty('尚无执行记录'):''}</div>`;
  return heading('质检与日志','从问题原文和执行路径出发，确定真正需要改进的地方。',badge('规则线索 + 人工复核','blue')) +
    `<section class="card"><div class="tab-row"><button class="tab ${ui.qualityTab==='issues'?'active':''}" data-action="quality-tab" data-tab="issues">质量问题 ${state.issues.length}</button><button class="tab ${ui.qualityTab==='runs'?'active':''}" data-action="quality-tab" data-tab="runs">执行日志 ${runs.length}</button></div>${ui.qualityTab==='issues'?issueTable:runTable}<div class="stats-footer">模拟日志仅保存在当前浏览器。未运行真实模型自动质检或后台定时任务。</div></section>`;
}
function issueModal(id) {
  const q = state.issues.find(q=>q.id===id);
  if (!q) throw new Error('问题记录不存在');
  ui.modalContext = {kind:'issue',id};
  modal(q.type+' · '+q.id,`<div class="note blue">原始消息：${e(q.evidence)}</div><button class="text-link section-space" data-action="open-session" data-id="${q.sessionId}">查看完整会话与执行轨迹 →</button><div class="divider"></div><form data-form="review-issue" data-id="${q.id}"><div class="field"><label for="issue-status">复核结论</label><select id="issue-status" name="status">${selectOptions(['待复核','已确认','已排除'],q.status)}</select></div><div class="field"><label for="issue-review">复核说明<span class="required">*</span></label><textarea id="issue-review" name="review" required maxlength="1000" placeholder="写明判断依据，以及需要补充的知识或调整的流程。">${e(q.review)}</textarea></div><div class="note">改进方向：${e(q.suggestion)}。确认问题后保留此记录作为改进事项，知识与流程仍需单独修改并验证。</div><div class="form-error" role="alert"></div><div class="form-footer"><button type="submit" class="btn primary">保存复核结果</button></div></form>`);
}
const contracts = {
  order: { title: '订单查询工具', status: '本地模拟', input: 'order_id：字符串\ncustomer_id：生产环境由服务端绑定', output: 'order_id / status / product / delivery', errors: 'ORDER_NOT_FOUND / TIMEOUT / FORBIDDEN', note: '当前仅返回两个虚构样例。生产环境必须校验身份与订单归属；字段为建议契约，未对应真实 API。' },
  knowledge: { title: '企业知识服务', status: '规则模拟', input: 'question / conversation_context / tenant_scope', output: 'answer / citations / knowledge_version', errors: 'NO_MATCH / KNOWLEDGE_UNAVAILABLE', note: '当前对已发布问答做关键词匹配。后续解析、索引、检索与重排由独立服务提供。' },
  visual: { title: '图文理解与搜索', status: '源码参考', input: 'image / question / permitted_tools', output: 'summary / sources / tool_trace', errors: 'UNSUPPORTED_IMAGE / TOOL_TIMEOUT', note: '既有 OpenSearch-VL 提供图文工具循环。本演示未运行视觉模型或搜索接口。' },
  ticket: { title: '工单与业务系统', status: '前端模拟', input: 'session_id / title / category / priority / description', output: 'ticket_id / status / owner / history', errors: 'VALIDATION_FAILED / CONFLICT / NOT_AUTHORIZED', note: '当前状态保存在本浏览器。数据库、消息通知、多人协作和写操作鉴权需要后端接入。' }
};
function renderIntegrations() {
  return heading('接入与集成','统一消息入口和业务工具，清晰区分演示能力与待接入能力。') +
    `<section class="card"><div class="card-head"><h2>渠道接入</h2><span class="tiny muted">当前仅 Web 本地入口可体验</span></div><div class="table-wrap"><table><thead><tr><th>渠道</th><th>接待能力</th><th>状态</th><th>下一阶段要求</th></tr></thead><tbody><tr><td><strong>Web 在线咨询</strong></td><td>文字、业务卡片、转人工</td><td>${badge('本地可体验','green')}</td><td><button class="text-link" data-nav="playground">打开访客窗口 →</button></td></tr><tr><td>App / 小程序</td><td>复用会话与流程服务</td><td>${badge('规划')}</td><td>SDK、身份绑定与消息回调</td></tr><tr><td>企业微信 / 公众号</td><td>渠道消息接入与路由</td><td>${badge('规划')}</td><td>平台授权、验签与消息格式转换</td></tr></tbody></table></div></section><h2 class="section-space" style="margin-bottom:15px">能力与工具</h2><div class="integration-grid">${Object.entries(contracts).map(([key,c])=>`<section class="card integration-card">${icon(key==='knowledge'?'book':key==='ticket'?'ticket':key==='visual'?'layers':'plug')}<h3>${c.title}</h3>${badge(c.status,key==='visual'?'purple':'blue')}<p>${e(c.note)}</p><button class="text-link" data-action="contract" data-id="${key}">查看接入契约 →</button></section>`).join('')}</div>`;
}
function renderArchitecture() {
  const layers = [['01 接入与会话',['Web / App / 企业渠道','客户身份与消息归一','会话状态管理']],['02 服务执行',['机器人接待','流程路由与变量采集','异常与人工兜底']],['03 业务能力',['知识检索与引用','业务工具与结果卡片','人工坐席与工单']],['04 配置与运营',['知识与流程发布','日志与问题复核','服务指标与改进']],['05 运行支撑',['租户与权限','服务端存储与审计','模型与业务系统']]];
  return heading('通用客服架构','公共服务能力承载流程，行业知识与业务系统通过配置接入。',`<a class="btn" href="方案文档.md" download>下载完整方案</a>`) +
    `<div class="grid-2"><section class="card"><div class="card-head"><div><h2>从客户问题到服务闭环</h2><p>目标架构 · 生产能力按阶段接入</p></div>${badge('产品架构','blue')}</div><div class="card-body">${layers.map(([title,items],i)=>`${i?'<div class="arch-arrow">↓</div>':''}<div class="arch-layer"><h3>${title}</h3><div class="arch-items">${items.map(x=>`<div class="arch-item">${x}</div>`).join('')}</div></div>`).join('')}</div></section><div class="stack"><section class="card"><div class="card-head"><h2>本阶段可以体验</h2></div><div class="card-body"><div class="summary-box">知识发布 → 访客问答 → 订单查询 → 人工接管 → 工单流转 → 问题复核</div><p class="tiny muted section-space">每个环节都使用本地演示数据。配置与服务结果在同一浏览器连续操作。</p><button class="btn primary section-space" data-nav="playground">开始体验 ${icon('arrow')}</button></div></section><section class="card"><div class="card-head"><h2>既有源码如何使用</h2></div><div class="card-body"><h3>OpenSearch-VL</h3><p class="tiny muted" style="line-height:2;margin-top:8px">可参考模型适配、工具定义、分发、观察回灌和执行轨迹。其图文调查循环需要进一步封装成在线服务，才能接入客服场景。</p><div class="divider"></div><div class="note orange">本 Demo 没有调用该源码。企业知识库、编排后台、工单和坐席为新增产品设计。</div></div></section></div></div>`;
}
function action(target) {
  const id = target.dataset.id;
  switch (target.dataset.action) {
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
    case 'open-session': ui.returnTo=ui.modalContext?{...ui.modalContext,page:ui.page}:null; ui.session=id; ui.filters.sessionStatus=''; ui.filters.sessions=''; closeModal(); go('sessions'); break;
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
      modal(source.title,`<div class="row" style="margin-bottom:15px">${badge(source.id,'blue')}${badge('v'+source.version)}</div><div class="summary-box">${e(source.answer)}</div><p class="tiny muted section-space">这是生成该条回复时保存的知识快照，后续编辑不会改写此内容。</p>`); break;
    }
    case 'select-node': ui.node=id; render(); break;
    case 'publish-flow': {
      Core.validateFlow(state.draft);
      if(!Core.flowChanged(state))return;
      askConfirm(`发布流程 v${state.published.version+1}？`,'将当前草稿用于新建会话，已有会话保持原版本。可先取消并运行草稿测试。','确认发布',()=>{const version=Core.publishFlow(state);save();invalidateTest();render();toast(`流程 v${version} 已发布，可点击“新建会话验证发布版”体验`);}); break;
    }
    case 'edit-knowledge': knowledgeModal(id); break;
    case 'publish-knowledge': {
      const k=state.knowledge.find(k=>k.id===id); if (!k) throw new Error('知识不存在');
      askConfirm('发布知识？',`“${k.draft?.title||k.title}”将参与后续问答，历史回复保持原引用。`,'确认发布',()=>{Core.publishKnowledge(state,id);invalidateTest();ui.filters.knowledgeStatus='';ui.focusKnowledge=id;save();render();toast('知识已发布，可进行检索试验');}); break;
    }
    case 'disable-knowledge': {
      const k=state.knowledge.find(k=>k.id===id); if (!k) throw new Error('知识不存在');
      askConfirm('停用这条知识？',`停用后“${k.title}”不再参与新的回答，历史引用仍保留。`,'确认停用',()=>{k.status='disabled';k.updated=Core.now();invalidateTest();save();render();toast('知识已停用，可从已停用列表重新启用');}); break;
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
    case 'confirm-reset': state=Core.newState(); state.workspace={forms:{}}; ui.play=null; ui.session=state.sessions[0].id; ui.flowTest=null; ui.returnTo=null; Object.keys(ui.filters).forEach(k=>ui.filters[k]=''); save(); closeModal(); go('overview'); toast('已恢复初始演示数据'); break;
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
    case 'flow-test': ui.flowTest={query:data.question,result:Core.simulate(data.question,{}, {...state.draft,version:state.published.version+' 草稿'},state.knowledge)}; render(); break;
    case 'knowledge': {
      const k=Core.saveKnowledge(state,{...data,id:form.dataset.id});
      if(submitter?.value==='publish' && (k.status!=='published'||k.draft))Core.publishKnowledge(state,k.id);
      clearFormDraft(form); invalidateTest(); ui.filters.knowledge='';ui.filters.knowledgeStatus='';ui.focusKnowledge=k.id;save();closeModal();render();
      $(`[data-knowledge-row="${k.id}"]`)?.scrollIntoView({block:'nearest'});
      toast(submitter?.value==='publish'?'知识已发布':k.status==='published'&&!k.draft?'内容未变化，继续使用当前发布版':'草稿已保存，原发布内容不变');break;
    }
    case 'knowledge-test': {
      const hit=Core.findKnowledge(data.question,state.knowledge);
      $('#kb-result').innerHTML=hit?`<div class="note blue">匹配关键词：${e(hit.matches.join('、'))} · ${e(hit.item.id)} v${hit.item.version}</div><div class="summary-box section-space">${e(hit.item.answer)}</div>`:'<div class="note orange">没有匹配到已发布知识。可补充条目或调整关键词。</div>'; break;
    }
    case 'new-ticket': {
      const visitor=form.dataset.visitor==='true'; const t=Core.createTicket(state,{...data,sessionId:form.dataset.session,customerSubmitted:visitor}); clearFormDraft(form);save();closeModal();render();ticketDetail(t.id,visitor);toast(`问题已登记：${t.id}`);break;
    }
    case 'ticket-progress': { const t=Core.advanceTicket(state,form.dataset.id,data.status,data.owner,data.note);clearFormDraft(form);save();render();ticketDetail(form.dataset.id);toast(t.sessionId?'工单已更新，处理进度已写入关联会话':'工单状态已更新');break; }
    case 'ticket-reply': {
      Core.addTicketReply(state,form.dataset.id,data.reply);clearFormDraft(form);save();render();ticketDetail(form.dataset.id,true);toast('补充说明已提交，工单恢复处理中');break;
    }
    case 'review-issue': {
      const q=state.issues.find(q=>q.id===form.dataset.id); if (!q) throw new Error('问题不存在');
      if (!data.review.trim()) throw new Error('请填写复核依据');
      q.status=data.status; q.review=data.review.trim(); clearFormDraft(form); save(); closeModal(); render(); toast('复核结果已保存'); break;
    }
    case 'mark-issue': {
      if (!data.evidence.trim()) throw new Error('请填写问题说明');
      Core.getSession(state,form.dataset.id);
      state.issues.unshift({id:'QA'+String(++state.counter).padStart(5,'0'),sessionId:form.dataset.id,time:Core.now(),status:'待复核',review:'',type:'人工标记',evidence:data.evidence.trim(),suggestion:'根据原始消息复核并登记改进事项'});
      clearFormDraft(form); save(); closeModal(); render(); toast('问题已登记，可前往质检与日志复核'); break;
    }
  }
}
document.addEventListener('click',event=>{
  const target=event.target.closest('[data-nav],[data-action]');
  if (!target || target.disabled) return;
  try { if (target.dataset.nav) { ui.returnTo=null;closeModal();go(target.dataset.nav); } else action(target); }
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
  if(target.id==='ticket-next')form.elements.note.required=['待客户补充','已完成'].includes(target.value);
});
window.addEventListener('hashchange',()=>{dismissConfirmation();closeModal();render();$('#page').focus({preventScroll:true});window.scrollTo(0,0);});
window.addEventListener('popstate',()=>{dismissConfirmation();closeModal();render();});
$('#modal').addEventListener('cancel',()=>{ui.modalContext=null;});
$('#confirm-dialog').addEventListener('cancel',()=>{ui.confirm=null;});
save();
render();
