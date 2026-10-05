/* Fictional commerce facts. Pure data validation and query projections; no network or storage. */
(function(root){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const cents=n=>Number.isSafeInteger(n)&&n>=0;
  const positive=n=>Number.isSafeInteger(n)&&n>0;
  const facts=x=>x&&typeof x.source==='string'&&x.source.trim().length>0&&positive(x.version)&&Number.isFinite(x.queriedAt)&&x.simulated===true;
  const table=a=>Array.isArray(a)&&a.every(x=>x&&typeof x.id==='string'&&x.id.length>0)&&new Set(a.map(x=>x.id)).size===a.length;
  const queryStatuses=['ok','failed','unknown'];
  function valid(s){
    if(s?.schema!==5||!s.commerce||!table(s.orders))return false;
    const {items,payments,packages}=s.commerce;
    if(![items,payments,packages].every(table))return false;
    const order=id=>s.orders.find(x=>x.id===id),item=id=>items.find(x=>x.id===id);
    if(!items.every(x=>order(x.orderId)&&typeof x.skuId==='string'&&x.skuId&&typeof x.name==='string'&&x.name&&typeof x.variant==='string'&&positive(x.quantity)&&cents(x.paidCents)&&x.currency==='CNY'&&facts(x)))return false;
    if(!payments.every(x=>order(x.orderId)&&['paid','unpaid','pending','unknown'].includes(x.status)&&queryStatuses.includes(x.queryStatus)&&cents(x.amountCents)&&x.currency==='CNY'&&facts(x)))return false;
    if(!packages.every(x=>order(x.orderId)&&['awaiting_dispatch','in_transit','signed'].includes(x.status)&&queryStatuses.includes(x.queryStatus)&&typeof x.carrier==='string'&&typeof x.trackingNumber==='string'&&Array.isArray(x.track)&&x.track.every(t=>t&&Number.isFinite(t.at)&&typeof t.text==='string')&&facts(x)&&Array.isArray(x.allocations)&&x.allocations.length>0&&new Set(x.allocations.map(a=>a.itemId)).size===x.allocations.length&&x.allocations.every(a=>item(a.itemId)?.orderId===x.orderId&&positive(a.quantity))))return false;
    return s.orders.every(o=>{
      const lines=items.filter(x=>x.orderId===o.id),p=payments.filter(x=>x.orderId===o.id),total=lines.reduce((n,x)=>n+x.paidCents,0);
      return facts(o)&&lines.length>0&&p.length===1&&cents(total)&&o.price===total/100&&
        (p[0].status!=='paid'||p[0].amountCents===total)&&
        lines.every(x=>packages.flatMap(p=>p.allocations).filter(a=>a.itemId===x.id).reduce((n,a)=>n+a.quantity,0)===x.quantity);
    });
  }
  const select=(x,keys)=>Object.fromEntries(keys.map(k=>[k,copy(x[k]??null)]));
  const origin=['source','version','queriedAt','simulated'];
  function snapshot(s,orderId,{scope='all',itemId='',packageId=''}={}){
    assert(s.schema===5&&s.commerce,'当前记录没有商品与包裹明细');
    assert(['all','payment','packages'].includes(scope),'查询范围无效');
    const order=s.orders.find(x=>x.id===orderId);assert(order,'暂时无法核对此订单');
    let items=s.commerce.items.filter(x=>x.orderId===orderId),packages=s.commerce.packages.filter(x=>x.orderId===orderId);
    if(itemId){assert(items.some(x=>x.id===itemId),'请核对本订单商品');items=items.filter(x=>x.id===itemId);packages=packages.filter(x=>x.allocations.some(a=>a.itemId===itemId));}
    if(packageId){assert(packages.some(x=>x.id===packageId),'请核对商品对应的包裹');packages=packages.filter(x=>x.id===packageId);items=items.filter(x=>packages.some(p=>p.allocations.some(a=>a.itemId===x.id)));}
    const raw=s.commerce.payments.find(x=>x.orderId===orderId);
    const payment=scope==='packages'?null:select(raw,['id','orderId','status','queryStatus','amountCents','currency',...origin]);
    if(payment&&payment.queryStatus!=='ok'){payment.status=null;payment.amountCents=null;}
    packages=scope==='payment'?[]:packages.map(x=>{
      const p=select(x,['id','orderId','status','queryStatus','carrier','trackingNumber','allocations','track',...origin]);
      p.allocations=p.allocations.map(a=>select(a,['itemId','quantity']));p.track=p.track.map(t=>select(t,['at','text']));
      if(p.queryStatus!=='ok'){p.status=null;p.track=[];}return p;
    });
    return {orderId,queryStatus:(!payment||(payment.queryStatus==='ok'&&payment.status!=='unknown'))&&packages.every(p=>p.queryStatus==='ok')?'ok':'incomplete',
      currency:'CNY',totalPaidCents:payment?.queryStatus==='ok'&&payment.status==='paid'?payment.amountCents:null,
      items:scope==='payment'?[]:items.map(x=>select(x,['id','orderId','skuId','name','variant','quantity','paidCents','currency',...origin])),payment,packages,
      source:order.source,version:order.version,queriedAt:order.queriedAt,simulated:true};
  }
  const money=value=>'¥'+(value/100).toFixed(2);
  const paymentLabel=p=>p.queryStatus==='failed'?'支付查询失败':p.queryStatus==='unknown'?'支付结果未知':({paid:'已支付',unpaid:'未支付',pending:'支付处理中',unknown:'支付结果未知'}[p.status]);
  const packageLabel=p=>p.queryStatus==='failed'?'物流查询失败':p.queryStatus==='unknown'?'物流结果未知':({awaiting_dispatch:'待发货',in_transit:'运输中',signed:'已签收'}[p.status]);
  function summary(value){
    const lines=[`订单 ${value.orderId}（模拟业务数据）`];
    if(value.payment)lines.push(`${paymentLabel(value.payment)}${value.payment.queryStatus==='ok'&&value.payment.status==='paid'?'，实付 '+money(value.payment.amountCents):''}。`);
    value.packages.forEach((p,i)=>{
      const names=p.allocations.map(a=>value.items.find(x=>x.id===a.itemId)?.name||'商品').join('、');
      lines.push(`包裹 ${i+1} · ${names}：${packageLabel(p)}。${p.queryStatus==='ok'?(p.track.at(-1)?.text||'暂无轨迹'):''}`);
    });
    lines.push('轨迹记录与实际收到、商品是否完好分别核实；如有异常请联系人工。');
    return lines.join('\n');
  }
  const api={valid,snapshot,summary,money,paymentLabel,packageLabel};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SupportCommerce=api;
})(typeof window!=='undefined'?window:globalThis);
