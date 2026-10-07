/* Local, fictional business records. No live identity, payment, warehouse or LLM connection. */
(function (root) {
  'use strict';
  const TYPES = {
    return_refund:'退货退款', refund_only:'仅退款', exchange:'换货', reship:'缺件补发',
    cancel_order:'取消订单', change_address:'修改地址', invoice:'发票服务',
    price_protection:'价格保护', repair:'维修服务', logistics:'物流核实'
  };
  const STAGES = {
    clarifying:'待确认诉求', answered:'已答复，待确认', queried:'查询完成',
    pending_review:'待审核', waiting_customer:'待补充资料', approved:'审核通过',
    awaiting_return:'待寄回商品', returning:'退回运输中', received:'仓库已收货',
    inspection_review:'验收待复核', awaiting_refund:'待提交退款',
    refund_processing:'退款处理中', refund_unknown:'退款结果待核实', refund_failed:'退款失败，待处理',
    awaiting_fulfillment:'待履约协调', investigating:'核实中', completed:'已办结',
    rejected:'未通过审核', withdrawn:'已撤回', withdrawal_pending:'撤回待核实', disputed:'异议复核中'
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  const amount = cents => '¥'+(cents/100).toFixed(2);
  const fact = (source, now, fields={}) => ({source, queriedAt:now, version:1, simulated:true, ...fields});
  function createState(now=Date.now()) {
    const source = name => fact(name,now);
    const date = new Date(now-86400000*30).toISOString().slice(0,10);
    const old = now-86400000;
    const state = {
      schema:6, revision:0, sequence:1000, createdAt:now, updatedAt:now,
      customers:[{id:'C001',name:'客户 001',verified:true},{id:'C002',name:'客户 002',verified:true},{id:'C003',name:'访客',verified:false}],
      staff:[
        {id:'lin',name:'客服 01',role:'agent',team:'service',available:true},
        {id:'zhou',name:'客服 02',role:'agent',team:'service',available:true},
        {id:'manager',name:'售后主管',role:'manager',team:'aftersales',available:true},
        {id:'warehouse',name:'仓库专员',role:'warehouse',team:'warehouse',available:true},
        {id:'finance',name:'财务专员',role:'finance',team:'finance',available:true},
        {id:'operator',name:'知识运营',role:'operator',team:'operations',available:true}
      ],
      settings:{accepting:true,queueMinutes:10,handoffMinutes:15,ticketHours:24},
      catalog:[
        {id:'EC-SKU-CUP',name:'便携保温杯',aliases:['保温杯','杯子','杯'],description:'适合通勤携带。按容量与使用方式选择，不将容量大小等同于保温性能。',
          attributes:['500mL 容量','杯身不锈钢，杯盖含密封圈','请勿微波加热'],
          variants:[{id:'CUP-WHITE-500',label:'雾白 · 500mL',stock:12},{id:'CUP-GREY-500',label:'岩灰 · 500mL',stock:8}],
          priceCents:12900,uses:['通勤','办公室','喝水'],care:'使用软布和中性清洁剂清洗，避免钢丝球；清洗后晾干。请勿放入微波炉。',...source('商品资料与库存服务')},
        {id:'EC-SKU-BAG',name:'棉麻收纳袋',aliases:['收纳袋','袋子','袋'],description:'适合分类收纳日常小物，不用于液体或尖锐物品。',
          attributes:['中号','棉麻面料','非防水容器'],variants:[{id:'BAG-NATURAL-M',label:'自然色 · 中号',stock:30}],
          priceCents:4900,uses:['收纳','整理','小物'],care:'建议轻柔手洗并自然晾干，避免高温烘干。',...source('商品资料与库存服务')},
        {id:'EC-SKU-BOX',name:'桌面收纳盒',aliases:['收纳盒','盒子'],description:'适合固定放置于桌面，整理文具和小物。',
          attributes:['木色','桌面使用'],variants:[{id:'BOX-WOOD',label:'木色',stock:5}],priceCents:8900,uses:['桌面','文具'],care:'用微湿软布擦拭后晾干，避免长时间浸水。',...source('商品资料与库存服务')}
      ],
      orders:[
        {id:'EC-SO20261005001',customerId:'C001',status:'partially_delivered',locked:false,createdAt:old,version:1,source:'订单服务',simulated:true,address:{name:'客户 001',phone:'13800000001',text:'浙江省杭州市余杭区服务园区1号'},promotion:''},
        {id:'EC-SO20261006001',customerId:'C001',status:'awaiting_dispatch',locked:false,createdAt:now-3600000,version:1,source:'订单服务',simulated:true,address:{name:'客户 001',phone:'13800000001',text:'浙江省杭州市余杭区服务园区1号'},promotion:''},
        {id:'EC-SO20261006002',customerId:'C001',status:'awaiting_payment',locked:false,createdAt:now-1800000,version:1,source:'订单服务',simulated:true,address:{name:'客户 001',phone:'13800000001',text:'浙江省杭州市余杭区服务园区1号'},promotion:''},
        {id:'EC-SO20261005009',customerId:'C002',status:'delivered',locked:false,createdAt:old,version:1,source:'订单服务',simulated:true,address:{name:'客户 002',phone:'13800000002',text:'浙江省杭州市服务园区2号'},promotion:''}
      ],
      items:[
        {id:'EC-ITEM-001',orderId:'EC-SO20261005001',skuId:'EC-SKU-CUP',name:'便携保温杯',variant:'雾白 · 500mL',quantity:1,paidCents:12900,...source('订单明细服务')},
        {id:'EC-ITEM-002',orderId:'EC-SO20261005001',skuId:'EC-SKU-BAG',name:'棉麻收纳袋',variant:'自然色 · 中号',quantity:1,paidCents:4900,...source('订单明细服务')},
        {id:'EC-ITEM-003',orderId:'EC-SO20261006001',skuId:'EC-SKU-CUP',name:'便携保温杯',variant:'雾白 · 500mL',quantity:1,paidCents:12900,...source('订单明细服务')},
        {id:'EC-ITEM-004',orderId:'EC-SO20261006002',skuId:'EC-SKU-BAG',name:'棉麻收纳袋',variant:'自然色 · 中号',quantity:1,paidCents:4900,...source('订单明细服务')},
        {id:'EC-ITEM-009',orderId:'EC-SO20261005009',skuId:'EC-SKU-BOX',name:'桌面收纳盒',variant:'木色',quantity:1,paidCents:8900,...source('订单明细服务')}
      ],
      payments:[
        {id:'PAY001',orderId:'EC-SO20261005001',status:'paid',queryStatus:'ok',amountCents:17800,...source('支付服务')},
        {id:'PAY003',orderId:'EC-SO20261006001',status:'paid',queryStatus:'ok',amountCents:12900,...source('支付服务')},
        {id:'PAY004',orderId:'EC-SO20261006002',status:'unpaid',queryStatus:'ok',amountCents:0,...source('支付服务')},
        {id:'PAY009',orderId:'EC-SO20261005009',status:'paid',queryStatus:'ok',amountCents:8900,...source('支付服务')}
      ],
      packages:[
        {id:'PKG001',orderId:'EC-SO20261005001',itemIds:['EC-ITEM-001'],status:'signed',queryStatus:'ok',tracking:'SF00001001',carrier:'顺丰速运',lastEvent:'包裹已签收；是否本人收到、商品是否完好需分别核实。',...source('物流服务')},
        {id:'PKG002',orderId:'EC-SO20261005001',itemIds:['EC-ITEM-002'],status:'in_transit',queryStatus:'ok',tracking:'SF00001002',carrier:'顺丰速运',lastEvent:'包裹已离开转运中心，正在运输。',...source('物流服务')},
        {id:'PKG003',orderId:'EC-SO20261006001',itemIds:['EC-ITEM-003'],status:'awaiting_dispatch',queryStatus:'ok',tracking:'',carrier:'',lastEvent:'仓库备货中，尚未出库。',...source('仓储服务')},
        {id:'PKG004',orderId:'EC-SO20261006002',itemIds:['EC-ITEM-004'],status:'awaiting_dispatch',queryStatus:'ok',tracking:'',carrier:'',lastEvent:'订单尚未支付。',...source('仓储服务')},
        {id:'PKG009',orderId:'EC-SO20261005009',itemIds:['EC-ITEM-009'],status:'signed',queryStatus:'ok',tracking:'SF00001009',carrier:'顺丰速运',lastEvent:'包裹已签收。',...source('物流服务')}
      ],
      coupons:[
        {id:'AUTUMN20',name:'满200减20',minCents:20000,discountCents:2000,skuIds:['EC-SKU-CUP','EC-SKU-BAG'],effectiveAt:now-86400000,expiresAt:now+86400000*7,stackable:false,...source('活动资格服务')},
        {id:'CUP10',name:'保温杯立减10元',minCents:10000,discountCents:1000,skuIds:['EC-SKU-CUP'],effectiveAt:now-86400000,expiresAt:now+86400000*7,stackable:false,...source('活动资格服务')},
        {id:'EXPIRED10',name:'上期活动优惠券',minCents:0,discountCents:1000,skuIds:['EC-SKU-CUP','EC-SKU-BAG'],effectiveAt:now-86400000*9,expiresAt:now-86400000,stackable:false,...source('活动资格服务')}
      ],
      policyVersion:1,policies:[],knowledge:[],conversations:[],cases:[],drafts:[],applications:[],changes:[],returns:[],refunds:[],attachments:[],handoffs:[],notifications:[],gaps:[],events:[],receipts:[],callbacks:[]
    };
    for(const [type,title] of Object.entries(TYPES)) {
      const team = ['invoice','price_protection'].includes(type)?'finance': ['cancel_order','change_address','reship','logistics'].includes(type)?'warehouse':'aftersales';
      state.policies.push({id:type, live:{version:1,type,title,enabled:true,materialRequired:['return_refund','exchange','reship','refund_only','repair'].includes(type),
        requiresReturn:['return_refund','exchange'].includes(type),feeBearer:'商家承担本申请的退回运费；请按客服确认的寄回方式办理，并保留运费凭证',team,feedbackHours:24,effectiveAt:date,expiresAt:'',source:'商家服务规则',
        returnAddress:'浙江省杭州市余杭区服务园区1号A仓',returnContact:'售后收货中心',returnPhone:'0571-00000000',returnInstructions:'请保留商品、配件并妥善包装，按批准的运费方案寄回，寄出后填写承运商与运单号。'},draft:null,validation:null,history:[]});
    }
    state.knowledge=[
      {id:'KB002',live:{version:1,title:'保温杯清洁与保养',question:'保温杯怎么清洗',keywords:['保温杯','杯子','清洗','清洁','怎么洗','保养'],answer:state.catalog[0].care,source:'商品使用说明',effectiveAt:date,expiresAt:'',positive:'杯子怎么清洗',negative:'申请退货'},draft:null,validation:null,history:[],disabled:false},
      {id:'KB003',live:{version:1,title:'人工服务说明',question:'人工服务时间',keywords:['服务时间','营业时间','几点','人工服务'],answer:'在线接待以当前客服状态为准。没有在线客服时可留下问题，未完成事项保留责任组和下次反馈安排。',source:'客户服务说明',effectiveAt:date,expiresAt:'',positive:'服务时间是几点',negative:'我的物流没到'},draft:null,validation:null,history:[],disabled:false},
      {id:'KB004',live:{version:1,title:'活动与优惠使用',question:'优惠券使用规则',keywords:['优惠券','活动规则','优惠规则','怎么用券'],answer:'每张优惠券有商品范围、使用门槛和有效期。请从优惠查询选择本人订单和优惠券，核对具体不适用原因；资格查询不会自动修改订单或退差价。',source:'活动服务说明',effectiveAt:date,expiresAt:'',positive:'优惠券使用规则',negative:'杯子漏水想退'},draft:null,validation:null,history:[],disabled:false}
    ];
    state.conversations.push({id:'CONV001',customerId:'C001',mode:'ai',ownerId:'',status:'open',createdAt:now,updatedAt:now,caseIds:[],messages:[{id:'MSG000',role:'assistant',body:'请描述您需要咨询或办理的问题，也可以从订单选择具体商品。',at:now,caseIds:[]}],context:{orderId:'',itemId:''}});
    return state;
  }
  const api={TYPES,STAGES,clone,amount,createState};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SupportV2Model=api;
})(typeof window!=='undefined'?window:globalThis);
