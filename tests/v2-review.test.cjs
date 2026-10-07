// 产出 Agent：Codex；针对独立审查发现的业务反证。
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),root=process.env.V2_TEST_ROOT||path.resolve(__dirname,'..');
const M=require(path.join(root,'src/v2/model.js')),S=require(path.join(root,'src/v2/service.js'));
const now=Date.parse('2026-10-06T12:00:00Z'),who={id:'C001',role:'customer'};
const say=body=>S.execute(M.createState(now),who,'say',{conversationId:'CONV001',body},now+1).state;
test('V2 服务时间咨询命中知识；明确人工请求继续转人工',()=>{
  const s=say('人工服务时间');assert.equal(s.conversations[0].mode,'ai');assert.equal(s.cases[0].type,'knowledge');
  assert.equal(s.conversations[0].messages.at(-1).body,S.retrieve(s,'人工服务时间',now).live.answer);
  assert.equal(say('人工服务时间，转人工').conversations[0].mode,'queue');
});
test('V2 收纳盒清洗使用本商品维护说明，杯子仍使用发布知识',()=>{
  const s=say('桌面收纳盒怎么清洗和保养');assert.equal(s.conversations[0].messages.at(-1).body,s.catalog[2].care);
  const cup=say('杯子怎么清洗');assert.equal(cup.conversations[0].messages.at(-1).body,S.retrieve(cup,'杯子怎么清洗',now).live.answer);
});
test('V2 混合句中的他人商品与未知商品不撤销有效知识答复',()=>{
  for(const item of ['EC-ITEM-009','EC-ITEM-999']){
    const s=say(`杯子怎么清洗，${item} 显示签收但没收到`);
    assert.equal(s.cases.filter(c=>c.type==='knowledge').length,1);assert.equal(s.cases.filter(c=>c.type==='clarification').length,1);
    assert(!s.cases.some(c=>c.itemId===item));
  }
});
test('V2 不一致的显式订单与商品先澄清，同订单商品可正常查询',()=>{
  const s=say('EC-SO20261006001 EC-ITEM-001 显示签收但没收到');assert.equal(s.cases[0].type,'clarification');assert.equal(s.cases[0].itemId,'');
  const valid=say('EC-SO20261005001 EC-ITEM-002 还没到');assert.equal(valid.cases[0].type,'query');assert.equal(valid.cases[0].itemId,'EC-ITEM-002');
});
test('V2 数据校验拒绝跨订单事项关系及无效保存版本',()=>{
  const s=say('EC-SO20261005001 EC-ITEM-002 还没到');s.cases[0].orderId='EC-SO20261006001';assert.throws(()=>S.validateState(s),/商品归属/);
  for(const revision of [-1,undefined,NaN]){const broken=M.createState(now);broken.revision=revision;assert.throws(()=>S.validateState(broken),/数据版本/);}
});
