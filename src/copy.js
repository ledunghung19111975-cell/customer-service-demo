/* Product copy and a narrowly scoped update for the previous bundled defaults.
 * Legacy text below is migration data, not rendered product copy.
 * Never replace arbitrary customer/staff messages, notes, or form drafts.
 */
(function (root) {
  'use strict';
  const VERSION = 1;
  const greeting = '您好，请描述您遇到的问题。您也可以查询订单或申请售后。';
  const legacyGreeting = '你好，我是青禾小助。订单进度、商品使用或售后问题，都可以在这里告诉我。请勿发送密码、验证码或完整银行卡信息。';
  const customers = {
    C001: ['林小夏', '客户 001', 'xiaoxia@example.test', 'customer001@example.test'],
    C002: ['陈一诺', '客户 002', 'yinuo@example.test', 'customer002@example.test'],
    C003: ['周安', '客户 003', 'zhouan@example.test', 'customer003@example.test']
  };
  const staff = {lin: ['客服小林', '客服 01'], zhou: ['客服小周', '客服 02']};
  const sources = {
    KB001: ['青禾生活 / 售后服务政策', '售后服务政策'],
    KB002: ['青禾生活 / 商品使用说明', '商品使用说明'],
    KB003: ['青禾生活 / 服务说明', '客服服务说明']
  };
  function updateSource(object, id) {
    const rule = sources[id || object?.id];
    if (!object || object.version !== 1 || !rule || object.source !== rule[0]) return false;
    object.source = rule[1];
    return true;
  }
  function upgrade(input) {
    if (!input || input.schema !== 4 || (input.copyVersion || 0) >= VERSION) return {state: input, changed: false};
    const s = JSON.parse(JSON.stringify(input));
    const identities = {...customers, ...staff};
    const people = [...s.customers, ...s.staff];
    // Some historical labels have no identity ID; leave colliding names intact.
    const names = Object.fromEntries(Object.entries(identities)
      .filter(([id, rule]) => !people.some(p => p.id !== id && p.name === rule[0]))
      .map(([, rule]) => [rule[0], rule[1]]));
    const updateName = (object, key, id) => {
      if (!object) return;
      const rule = identities[id];
      if (id) { if (rule && object[key] === rule[0]) object[key] = rule[1]; }
      else if (Object.hasOwn(names, object[key])) object[key] = names[object[key]];
    };
    for (const customer of s.customers) {
      const rule = customers[customer.id];
      if (!rule) continue;
      if (customer.name === rule[0]) customer.name = rule[1];
      if (customer.email === rule[2]) customer.email = rule[3];
      if (customer.level === '青禾会员') customer.level = '会员';
    }
    for (const person of s.staff) {
      const rule = staff[person.id];
      if (rule && person.name === rule[0]) person.name = rule[1];
    }
    for (const conversation of s.conversations) {
      for (const [index, m] of conversation.messages.entries()) {
        // Only the original, generated first-message welcome is replaceable.
        if (index === 0 && m.role === 'bot' && !m.caseId && !m.citation && m.body === legacyGreeting) m.body = greeting;
        if (m.role === 'agent') updateName(m, 'author');
        if (m.role === 'system') {
          for (const [oldName, newName] of Object.values(staff)) {
            if (!names[oldName]) continue;
            if (m.body === `${oldName}已接入，接下来由人工为你服务。`) m.body = `${newName}已接入，接下来由人工为您服务。`;
            if (m.body === `${oldName}将继续为你服务，已有信息会保留。`) m.body = `${newName}将继续为您服务，已有信息会保留。`;
          }
        }
        if (m.role === 'bot') updateSource(m.citation);
      }
    }
    let knowledgeChanged = false;
    for (const k of s.knowledge) {
      if (updateSource(k.live, k.id)) { knowledgeChanged = true; k.validation = null; }
      for (const version of k.versions || []) updateSource(version, k.id);
      // Drafts are deliberately untouched, including user-written source text.
    }
    if (knowledgeChanged) {
      for (const k of s.knowledge) k.validation = null;
      s.flow.validation = null;
    }
    for (const c of s.cases) {
      for (const result of [c.result, ...(c.resultHistory || [])]) {
        if (!result?.evidence) continue;
        updateName(result.evidence, 'actor', result.by);
        if (result.evidence.kind === 'knowledge') updateSource(result.evidence.citation);
      }
    }
    for (const t of s.tickets) for (const h of t.history) updateName(h, 'actor');
    for (const event of s.events) updateName(event, 'actor', event.actorId);
    s.copyVersion = VERSION;
    s.revision += 1;
    return {state: s, changed: true};
  }
  const api = {VERSION, greeting, upgrade};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SupportCopy = api;
})(typeof window !== 'undefined' ? window : globalThis);
