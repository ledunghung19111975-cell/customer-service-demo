/* Runs against the actual patched repository, not a replacement for its existing tests. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../engine.js');
const Copy = require('../product-copy.js');
const root = path.join(__dirname,'..');

test('默认客户问答、订单与来源不带展示环境文案',()=>{
  const state=Core.newState({seed:false});
  assert.doesNotMatch(JSON.stringify(state.robot)+JSON.stringify(state.knowledge)+Core.orders.map(o=>o.delivery).join(''),/演示|虚构|模拟/);
  const s=Core.newSession(state);
  Core.sendVisitor(state,s.id,'帮我查订单');
  assert.doesNotMatch(s.messages.at(-1).text,/演示|可以用 SO/);
});
test('客户查询与售后仍是两个事项，登记工单不等于完成售后',()=>{
  const state=Core.newState({seed:false}),s=Core.newSession(state);
  Core.sendVisitor(state,s.id,'查物流 SO20260926001，再申请退货');
  const items=Core.sessionItems(state,s);
  const order=items.find(i=>i.type==='order'),after=items.find(i=>i.type==='aftersales');
  assert.ok(order && after);
  assert.equal(state.tickets.length,0);
  assert.equal(Core.canConfirmItem(state,after),false);
  const t=Core.createTicket(state,{sessionId:s.id,itemId:after.id,title:'申请退货',description:'包装破损，请协助处理',category:'售后服务',priority:'普通',objectId:after.objectId,customerSubmitted:true,requestKey:'product-test-1'});
  assert.equal(t.status,'待分配');
  assert.equal(Core.canConfirmItem(state,after),false);
  assert.doesNotMatch(s.messages.at(-1).text,/演示|模拟|退款已到账/);
});
test('数据兼容不改写人工消息或自定义知识',()=>{
  const state=Core.newState({seed:false});
  state.presentationCopyVersion=0;
  const s=Core.newSession(state);
  s.messages.push({role:'user',text:'演示工单的问题'},{role:'agent',text:'这是我输入的模拟说明'});
  state.knowledge.push({id:'KB999',answer:'演示积分可在会员中心查看。可抵扣范围以活动规则为准，本演示不执行积分兑换。'});
  const upgraded=Copy.upgrade(state).state;
  assert.deepEqual(upgraded.sessions[0].messages.slice(-2),s.messages.slice(-2));
  assert.equal(upgraded.knowledge.at(-1).answer,state.knowledge.at(-1).answer);
});
test('产品页面移除演讲入口，售后表单使用已定义的访客变量',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  assert.doesNotMatch(html,/演示|模拟|data-action="reset"|data-action="demo-guide"/);
  assert.doesNotMatch(app,/\$\{customerSubmitted\?/);
  assert.doesNotMatch(app,/function showGuide|const scenarios =|case 'demo-guide'/);
  assert.match(app,/CUSTOMER_VIEW \? 'playground'/);
  assert.match(app,/testDraftQuestion\(data.question,data.orderResponse/);
});
test('恢复初始配置不会重新填充历史业务记录',()=>{
  const state=Core.newState({seed:false});
  assert.equal(state.sessions.length,0); assert.equal(state.items.length,0); assert.equal(state.tickets.length,0);
  assert.ok(state.knowledge.length>0);
});

test('内置旧引用升级，自定义 FAQ 的历史回复和证据逐字保留',()=>{
  const oldAnswer='演示商品保温杯采用不锈钢内胆，建议使用软布和中性清洁剂清洗。首次使用前请充分清洁，避免放入微波炉加热。';
  const state=Core.newState({seed:false}),s=Core.newSession(state);
  state.knowledge.find(k=>k.id==='KB002').answer=oldAnswer;
  Core.sendVisitor(state,s.id,'保温杯怎么清洗？');
  const builtIn=s.messages.find(m=>m.citation?.id==='KB002');
  assert.ok(builtIn);
  const custom=Core.clone(builtIn);custom.citation.id='KB999';custom.text='自定义说明\n'+oldAnswer;
  s.messages.push(custom);
  state.knowledge.push({id:'KB999',answer:oldAnswer,source:custom.citation.source});
  const item=Core.sessionItems(state,s)[0];
  const customEvidence={kind:'knowledge',...Core.clone(custom.citation)};
  item.evidence.push(customEvidence);
  const original=JSON.stringify(state),result=Copy.upgrade(state);
  assert.equal(result.changed,true);
  assert.equal(JSON.stringify(state),original);
  assert.doesNotMatch(result.state.sessions[0].messages.find(m=>m.citation?.id==='KB002').text,/演示商品/);
  assert.deepEqual(result.state.sessions[0].messages.at(-1),custom);
  assert.deepEqual(result.state.items[0].evidence.at(-1),customEvidence);
  assert.equal(result.state.knowledge.at(-1).answer,oldAnswer);
  assert.equal(Copy.upgrade(result.state).changed,false);
});
