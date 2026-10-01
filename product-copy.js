/* One-time, exact-match upgrade of built-in presentation copy.
 * Never rewrites customer or agent messages, arbitrary custom answers or form drafts.
 * The app backs up the original state before installing a changed result. */
(function (root) {
  'use strict';
  const VERSION = 1;
  const COPY = {
  "演示快递 · 已到达配送站": "包裹已到达配送站",
  "初始演示配置": "初始接待配置",
  "人工当前离线。可点击“提交问题”留单，处理进度在本窗口查看；本演示不会发送短信。": "人工客服当前离线。可点击“提交问题”留言，处理进度在本窗口查看。",
  "为了查询订单，请提供以 SO 开头的演示订单号。可以用 SO20260926001。也可以先咨询其他问题，再点击事项的“继续处理”。": "请提供需要查询的订单号。你也可以在“我的订单”中选择订单。",
  "演示归属校验未通过，不透露订单是否存在": "归属校验未通过，不透露订单是否存在",
  "真实环境由服务端验证身份和订单归属": "核实客户身份与订单归属",
  "演示订单中没有找到这个订单号。请更正订单号后继续，也可以转人工；本次查询尚未完成。": "没有找到这个订单号，请核对后重试，或联系人工客服协助查询。",
  "核对订单标识和样例范围": "核对订单编号与查询范围",
  "本地虚构订单样例": "订单服务",
  "为了登记售后，请提供以 SO 开头的演示订单号。可以用 SO20260926001。": "请提供需要售后的订单号，也可以在“我的订单”中选择订单。",
  "本地单操作者接管": "坐席接管会话",
  "客户明确确认（演示）": "客户明确确认",
  "确认后模拟受理": "确认后受理",
  "演示范围问题": "知识服务问题",
  "仅本地演示，不代表生产缺陷验收": "知识与服务流程回归",
  "正常查询返回样例，或沿配置分支明确转人工承接": "正常查询返回订单，或沿配置分支明确转人工承接",
  "演示归属负例不泄露订单": "归属校验负例不泄露订单",
  "你好，我是青禾小助。你可以咨询商品与服务规则、查询订单，或提交售后问题。需要人工时会带上当前信息转接。这里是演示环境，请勿输入真实隐私信息。": "你好，我是青禾小助。你可以咨询商品与服务规则、查询订单，或提交售后问题。需要人工时会带上当前信息转接。请勿提供密码、验证码或完整银行卡信息。",
  "青禾生活 · 在线服务（演示）": "青禾生活 · 在线服务",
  "初始演示模板": "初始接待流程",
  "青禾生活演示规则：签收后七天内，商品未使用且包装与配件完整，可登记退货申请。定制商品不适用此规则。是否符合条件由人工结合订单核实，当前演示不会实际退款。": "签收后七天内，商品未使用且包装与配件完整，可登记退货申请。定制商品不适用此规则。具体资格与处理结果由客服结合订单核实。",
  "演示商品保温杯采用不锈钢内胆，建议使用软布和中性清洁剂清洗。首次使用前请充分清洁，避免放入微波炉加热。": "保温杯采用不锈钢内胆，建议使用软布和中性清洁剂清洗。首次使用前请充分清洁，避免放入微波炉加热。",
  "本演示的服务时间示例为每天 09:00–21:00。运行状态以页面实时显示为准。你可以随时留言；离线时可登记工单。未接通知服务，仅在本站查看进度。": "人工服务时间为每天 09:00–21:00，是否在线以当前接待状态为准。你可以随时提交问题，并在咨询窗口查看处理进度。",
  "演示积分可在会员中心查看。可抵扣范围以活动规则为准，本演示不执行积分兑换。": "积分抵扣范围以会员活动规则为准，相关问题可联系人工客服核实。",
  "演示客户反馈外盒破损，需客服核对商品情况与后续处理方式。": "客户反馈外盒破损，需客服核对商品情况与后续处理方式。",
  "系统模拟": "系统",
  "演示配置": "系统",
  "青禾生活虚构演示资料 / 通用服务，不对应真实商家政策": "青禾生活客服知识库 / 通用服务",
  "青禾生活虚构演示资料 / 产品知识，不对应真实商家政策": "青禾生活客服知识库 / 产品知识",
  "青禾生活虚构演示资料 / 售后政策，不对应真实商家政策": "青禾生活客服知识库 / 售后政策",
  "青禾生活虚构演示资料 / 会员权益，不对应真实商家政策": "青禾生活客服知识库 / 会员权益",
  "青禾生活虚构演示资料 / 活动规则，不对应真实商家政策": "青禾生活客服知识库 / 活动规则"
};
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  function upgrade(original) {
    if (original.presentationCopyVersion === VERSION) return { state: original, changed: false };
    const state = clone(original);
    let changed = false;
    const set = (obj, key, value) => {
      if (obj && typeof obj[key] === 'string' && obj[key] !== value) { obj[key] = value; changed = true; }
    };
    const exact = (obj, fields) => {
      if (!obj) return;
      fields.forEach(key => { if (typeof obj[key] === 'string' && own(COPY,obj[key])) set(obj,key,COPY[obj[key]]); });
    };
    const generated = text => {
      if (typeof text !== 'string') return text;
      if (own(COPY,text)) return COPY[text];
      // A reply can prepend a configured introduction. Only replace the entire,
      // exact built-in answer after a newline; never replace substrings in prose.
      for (const [old, next] of Object.entries(COPY)) {
        if (old.length > 35 && text.endsWith('\n' + old)) return text.slice(0,-old.length) + next;
      }
      return text
        .replace(/^已登记演示工单 (TK\d+)：([\s\S]*)。这是受理成功，不是退款或问题已解决。$/, '已受理工单 $1：$2。客服将继续核实处理，请在工单中查看进度。')
        .replace(/^返回本地样例 (SO[A-Z0-9]+)$/, '订单查询成功 $1')
        .replace(/^样例数据中没有 (SO[A-Z0-9]+)$/, '未查询到订单 $1');
    };
    const builtIn = obj => /^KB00[1-5]$/.test(obj?.id || '');
    const citation = obj => { if (builtIn(obj)) exact(obj,['answer','source']); };
    exact(state.robot,['greeting','description']);
    exact(state.runtime,['reason']);
    for (const k of state.knowledge || []) {
      // Known built-in records only; user-created FAQ records are not rewritten.
      if (/^KB00[1-5]$/.test(k.id)) {
        exact(k,['answer','source']);
        for (const old of k.history || []) exact(old,['answer','source']);
        // Leave unpublished customer/operator drafts exactly as written.
      }
    }
    for (const s of state.sessions || []) {
      exact(s.robot,['greeting','description']);
      for (const m of s.messages || []) {
        if (!['bot','system'].includes(m.role)) continue;
        if (!m.citation || builtIn(m.citation)) set(m,'text',generated(m.text));
        citation(m.citation); exact(m.order,['delivery']);
      }
      for (const r of s.runs || []) for (const step of r.trace || []) {
        set(step,'detail',generated(step.detail)); set(step,'output',generated(step.output));
      }
    }
    for (const item of state.items || []) {
      exact(item,['confirmation']);
      for (const h of item.history || []) exact(h,['actor']);
      for (const ev of item.evidence || []) { citation(ev); exact(ev.result,['delivery']); }
    }
    for (const t of state.tickets || []) {
      if (!t.customerSubmitted) exact(t,['description']);
    }
    for (const r of state.releases || []) if (r.validationId === 'seed') exact(r,['reason','operator']);
    for (const q of state.issues || []) exact(q.remediation,['scope']);
    for (const record of state.audit || []) {
      // Preserve notes and arbitrary operator-provided evidence.
      if (['takeover','ticket-created','remediation-closed'].includes(record.type)) exact(record,['reason','scope']);
      if (record.type === 'knowledge-publish' && /^模拟发布 v\d+$/.test(record.reason || '')) set(record,'reason',record.reason.replace(/^模拟发布 /,'发布 '));
    }
    state.presentationCopyVersion = VERSION;
    return { state, changed };
  }
  const api = { version: VERSION, upgrade };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CustomerPresentation = api;
})(typeof window !== 'undefined' ? window : this);
