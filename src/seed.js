/* Fictional store data. No external order or payment system is connected. */
(function (root) {
  'use strict';
  const D = typeof module !== 'undefined' && module.exports ? require('./domain.js') : root.SupportDomain;
  function create(now = Date.now(), populated = true) {
    let s = {
      schema: 4, copyVersion: 1, revision: 0, sequence: 100, createdAt: now,
      customers: [{id:'C001',name:'客户 001',email:'customer001@example.test',level:'会员'}, {id:'C002',name:'客户 002',email:'customer002@example.test',level:'会员'}, {id:'C003',name:'客户 003',email:'customer003@example.test',level:'普通客户'}],
      staff: [
        {id:'lin',name:'客服 01',role:'agent',teams:['service'],available:true},
        {id:'zhou',name:'客服 02',role:'agent',teams:['service'],available:true},
        {id:'manager',name:'服务经理',role:'manager',teams:['service']},
        {id:'operator',name:'知识运营',role:'operator',teams:['service']},
        {id:'admin',name:'系统管理员',role:'admin',teams:[]}
      ],
      orders: [
        {id:'SO20260926001',customerId:'C001',product:'原木便携保温杯 · 雾白',price:129,status:'运输中',delivery:'包裹已到达配送站，配送进度以承运方更新为准。',symbol:'◒'},
        {id:'SO20260926002',customerId:'C001',product:'棉麻收纳袋 · 自然色',price:49,status:'待发货',delivery:'仓库正在备货，发出后更新物流。',symbol:'▧'},
        {id:'SO20260926009',customerId:'C002',product:'桌面收纳盒 · 木色',price:89,status:'已签收',delivery:'订单已签收。',symbol:'▤'}
      ],
      settings:{capacity:3,responseMinutes:5,ticketHours:24,accepting:true},
      flow:{live:{version:1,humanWords:['人工','投诉'],intakeEnabled:true},draft:null,versions:[],validation:null},
      conversations:[],cases:[],tickets:[],gaps:[],events:[],knowledge:[]
    };
    const articles = [
      ['KB001','退货与售后政策','七天无理由退货有什么条件？','退货,规则,条件,无理由,政策,七天','签收后七天内，商品未使用且包装、配件完整，可登记退货申请；定制商品不适用。具体资格由客服结合订单核实，提交申请不代表退款完成。','售后服务政策','退货规则是什么？','我要查订单'],
      ['KB002','保温杯清洁与保养','保温杯怎么清洗？','保温杯,清洗,保养,材质','建议使用软布和中性清洁剂清洗。首次使用前充分清洁，避免使用钢丝球；请勿放入微波炉加热。','商品使用说明','保温杯怎么清洗？','保温杯可以开电子发票吗？'],
      ['KB003','人工服务时间','服务时间是几点？','服务时间,几点,营业时间','人工服务时间为每天 09:00–21:00，实际接待以当前在线状态为准。非服务时段也可以提交问题，之后在咨询窗口查看回复。','客服服务说明','服务时间是几点？','人工智能是什么？']
    ];
    s.knowledge = articles.map(([id,title,question,keywords,answer,source,positive,negative]) => ({id,live:{version:1,title,question,keywords:keywords.split(','),answer,source,positive,negative,effectiveAt:new Date(now-86400000*365).toISOString(),expiresAt:'',publishedAt:now-86400000},draft:null,versions:[],disabled:false,validation:null}));
    if (!populated) return s;
    const doIt = (id,role,type,data,offset) => { const r=D.execute(s,{id,role},type,data,now+offset);s=r.state;return r.value; };
    let c=doIt('C002','customer','newConversation',{},-5400000);
    doIt('C002','customer','say',{id:c,body:'七天无理由退货有什么条件？'},-5390000);
    doIt('C002','customer','feedback',{id:s.conversations[0].caseIds[0],confirmed:true},-5370000);
    doIt('C002','customer','closeConversation',{id:c},-5360000);
    c=doIt('C003','customer','newConversation',{},-1800000);
    doIt('C003','customer','say',{id:c,body:'礼品卡可以分多次使用吗？'},-1790000);
    c=doIt('C001','customer','newConversation',{},-900000);
    doIt('C001','customer','say',{id:c,body:'申请退货 SO20260926001'},-890000);
    const caseId=s.conversations[0].caseIds[0];
    doIt('C001','customer','createTicket',{caseId,title:'保温杯包装破损核实',description:'收到包裹时外盒有挤压，希望客服核实后告知处理方式。',confirmed:true,requestKey:'initial-request'},-880000);
    doIt('lin','agent','claimTicket',{id:s.tickets[0].id},-800000);
    doIt('lin','agent','updateTicket',{id:s.tickets[0].id,status:'waiting_customer',publicText:'请补充商品是否受损、是否影响使用，以便核实后续处理方式。',internalText:'先核对商品本体，暂不承诺退款。'},-790000);
    c=doIt('C001','customer','newConversation',{},-120000);
    // The newest customer conversation intentionally starts with a normal greeting.
    return s;
  }
  function createCommerce(now=Date.now()){
    let s=create(now,false);s.schema=5;
    const origin=source=>({source,version:1,queriedAt:now,simulated:true});
    s.orders=[
      {id:'EC-SO20261005001',customerId:'C001',product:'保温杯与收纳袋',price:178,status:'部分签收',delivery:'本订单分两个包裹配送，商品状态请逐件核对。',symbol:'◒',...origin('模拟订单服务')},
      {id:'EC-SO20261005009',customerId:'C002',product:'桌面收纳盒 · 木色',price:89,status:'已签收',delivery:'包裹已签收。',symbol:'▤',...origin('模拟订单服务')}
    ];
    s.commerce={
      items:[
        {id:'EC-ITEM-001',orderId:'EC-SO20261005001',skuId:'EC-SKU-CUP',name:'原木便携保温杯',variant:'雾白 · 500mL',quantity:1,paidCents:12900,currency:'CNY',...origin('模拟订单明细')},
        {id:'EC-ITEM-002',orderId:'EC-SO20261005001',skuId:'EC-SKU-BAG',name:'棉麻收纳袋',variant:'自然色 · 中号',quantity:1,paidCents:4900,currency:'CNY',...origin('模拟订单明细')},
        {id:'EC-ITEM-009',orderId:'EC-SO20261005009',skuId:'EC-SKU-BOX',name:'桌面收纳盒',variant:'木色',quantity:1,paidCents:8900,currency:'CNY',...origin('模拟订单明细')}
      ],
      payments:[
        {id:'EC-PAY-001',orderId:'EC-SO20261005001',status:'paid',queryStatus:'ok',amountCents:17800,currency:'CNY',...origin('模拟支付服务')},
        {id:'EC-PAY-009',orderId:'EC-SO20261005009',status:'paid',queryStatus:'ok',amountCents:8900,currency:'CNY',...origin('模拟支付服务')}
      ],
      packages:[
        {id:'EC-PKG-001',orderId:'EC-SO20261005001',status:'signed',queryStatus:'ok',carrier:'演示承运方',trackingNumber:'DEMO-CUP-001',allocations:[{itemId:'EC-ITEM-001',quantity:1}],track:[{at:now-86400000,text:'包裹已签收，商品是否完好以客户反馈及后续核实为准。'}],...origin('模拟物流服务')},
        {id:'EC-PKG-002',orderId:'EC-SO20261005001',status:'in_transit',queryStatus:'ok',carrier:'演示承运方',trackingNumber:'DEMO-BAG-002',allocations:[{itemId:'EC-ITEM-002',quantity:1}],track:[{at:now-3600000,text:'包裹运输中，尚未签收；到货时间以承运方更新为准。'}],...origin('模拟物流服务')},
        {id:'EC-PKG-009',orderId:'EC-SO20261005009',status:'signed',queryStatus:'ok',carrier:'演示承运方',trackingNumber:'DEMO-BOX-009',allocations:[{itemId:'EC-ITEM-009',quantity:1}],track:[{at:now-86400000,text:'包裹已签收。'}],...origin('模拟物流服务')}
      ]
    };
    s.knowledge.find(k=>k.id==='KB001').live.answer='当前电商演示样例中，保温杯签收破损可联系人工核实退货退款；收纳袋仍在运输中，需单独查询对应包裹。资格与金额以商品级业务核实为准，咨询不代表已受理或退款。';
    s.knowledge.find(k=>k.id==='KB001').live.source='电商演示样例规则 v1';
    s=D.execute(s,{id:'C001',role:'customer'},'newConversation',{},now).state;
    return s;
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={create,createCommerce};else root.SupportSeed={create,createCommerce};
})(typeof window!=='undefined'?window:globalThis);
