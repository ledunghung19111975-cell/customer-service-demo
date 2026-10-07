#!/usr/bin/env python3
"""DOM scenario tests. Uses inline built HTML and explicit Storage and edit-lock test doubles.
This avoids network/navigation dependencies; it does not certify actual browser persistence.
Requires: pip install playwright; a Chromium executable (default /usr/bin/chromium).
"""
from pathlib import Path
import json, os, sys, tempfile
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('V2_TEST_OUTPUT', tempfile.gettempdir()+'/support-v2-browser'))
OUT.mkdir(parents=True,exist_ok=True)
HTML=(ROOT/'dist'/'智能客服_V2.html').read_text(encoding='utf-8')
KEY='support-ecommerce-v2'
passed=[];errors=[]

def ok(name):
    passed.append(name);print('PASS',name,flush=True)

def state(page):
    return page.evaluate("JSON.parse(localStorage.getItem('support-ecommerce-v2'))")

def close(page):
    if page.locator('#dialog').evaluate('(d)=>d.open'):
        page.locator('#dialog-close').click()

def button(page,name):
    return page.get_by_role('button',name=name,exact=True)

def desk(page,role):
    close(page);button(page,'客服工作台').click();page.locator('[name=deskActor]').select_option(role)

def command(page,cmd,values=None):
    page.locator(f'[data-command="{cmd}"]').first.click()
    for key,value in (values or {}).items():
        el=page.locator(f'#command-form [name="{key}"]')
        if el.evaluate('(e)=>e.tagName')=='SELECT':el.select_option(str(value))
        else:el.fill(str(value))
    button(page,'确认提交').click()
    if page.locator('#dialog-error').is_visible():
        raise AssertionError(page.locator('#dialog-error').inner_text())

def customer_progress(page):
    close(page);button(page,'消费者服务').click();button(page,'服务进度').first.click();button(page,'查看进度与操作').first.click()

def apply(page,kind='return_refund',item='EC-ITEM-001',order='EC-SO20261005001',extra=None,image=True):
    close(page);button(page,'消费者服务').click();button(page,'我的订单').click()
    page.locator(f'[data-action=application][data-item="{item}"]').click()
    page.locator('#application-form [name=type]').select_option(kind)
    page.locator('#application-form [name=reason]').fill('商品有问题，请按本次选择的服务处理')
    for key,value in (extra or {}).items():
        el=page.locator(f'#application-form [name="{key}"]')
        if el.evaluate('(e)=>e.tagName')=='SELECT':el.select_option(str(value))
        else:el.fill(str(value))
    if image:
        page.locator('#material-file').set_input_files({'name':'商品凭证.png','mimeType':'image/png','buffer':(OUT/'fixture.png').read_bytes()})
        expect(page.locator('input[name=attachmentIds]:checked')).to_have_count(1)
    button(page,'核对申请预览').click()
    expect(page.locator('#dialog-title')).to_have_text('确认申请内容')
    button(page,'确认提交').click()
    if page.locator('#dialog-error').is_visible():raise AssertionError(page.locator('#dialog-error').inner_text())

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    def fresh(width=1440,height=1000,initial=None):
        context=browser.new_context(viewport={'width':width,'height':height})
        page=context.new_page();page.set_default_timeout(5000)
        page.on('pageerror',lambda err:errors.append(str(err)))
        page.evaluate("""initial=>{const values=initial?{'support-ecommerce-v2':JSON.stringify(initial)}:{};
          Object.defineProperty(navigator,'locks',{configurable:true,value:{request:(name,options,callback)=>Promise.resolve(callback({name,mode:options.mode}))}});
          Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>values[k]??null,setItem:(k,v)=>{values[k]=String(v)},removeItem:k=>{delete values[k]}}});} """,initial)
        page.set_content(HTML)
        return page
    from PIL import Image,ImageDraw
    image=Image.new('RGB',(140,100),'#e9ede9');draw=ImageDraw.Draw(image);draw.rectangle((45,18,95,83),outline='#567266',width=3);draw.line((73,30,62,55,74,71),fill='#a95353',width=2);image.save(OUT/'fixture.png')

    page=fresh()
    expect(page.locator('h1')).to_have_text('咨询与办理')
    page.locator('#chat-input').fill('杯子怎么清洗，EC-ITEM-002 还没到');button(page,'发送').click()
    data=state(page);assert len(data['cases'])==2
    assert data['conversations'][0]['mode']=='ai'
    assert sum(c['status']=='completed' for c in data['cases'])==1
    page.screenshot(path=str(OUT/'01-consumer-mixed.png'),full_page=True)
    ok('混合问句：知识答复待确认，正常包裹查询独立完成')
    button(page,'我的订单').click();button(page,'支付核实').first.click()
    assert '已支付' in page.locator('.messages').inner_text()
    ok('订单页面能真实触发支付记录查询')
    button(page,'优惠查询').click();page.locator('#coupon-form [name=orderId]').select_option('EC-SO20261005001');page.locator('#coupon-form [name=couponId]').select_option('AUTUMN20');button(page,'查询资格').click()
    expect(page.locator('#dialog-body')).to_contain_text('未达到')
    ok('优惠查询显示本订单不满足使用门槛，而不是泛规则答复')

    page=fresh()
    apply(page)
    data=state(page);assert len(data['applications'])==1;assert data['applications'][0]['stage']=='pending_review';assert len(data['attachments'])==1
    ok('消费者真实选择材料、预览并确认商品级退货申请')
    desk(page,'manager');command(page,'approve',{'reason':'核对商品破损凭证，批准本件退货退款'})
    assert state(page)['applications'][0]['stage']=='awaiting_return'
    customer_progress(page);expect(page.locator('#dialog-body')).to_contain_text('寄回地址');expect(page.locator('#dialog-body')).to_contain_text('运费方案')
    page.screenshot(path=str(OUT/'02-return-instructions.png'),full_page=True)
    command(page,'submitReturn',{'carrier':'顺丰速运','tracking':'RET-UI-001'})
    assert state(page)['applications'][0]['stage']=='returning'
    ok('审核后的寄回地址、收件信息、运费及运单填写均可操作')
    desk(page,'warehouse');command(page,'receiveReturn',{'reason':'已核对仓库收货记录WH-UI-001'});command(page,'inspect',{'outcome':'exception','reason':'退回配件记录需要补充说明'})
    assert state(page)['applications'][0]['stage']=='inspection_review'
    command(page,'requestSupplement',{'reason':'请补充退回包装与配件说明'})
    customer_progress(page);button(page,'补充材料').click();page.locator('#supplement-form [name=reason]').fill('配件与杯子已装入同一退回包裹，请核对原收货照片');button(page,'提交至原申请').click()
    assert state(page)['applications'][0]['stage']=='inspection_review'
    desk(page,'warehouse');command(page,'resolveInspection',{'outcome':'pass','reason':'核对原收货照片及补充说明，确认验收一致'})
    assert state(page)['applications'][0]['stage']=='awaiting_refund';assert len(state(page)['applications'])==1
    page.screenshot(path=str(OUT/'03-workbench-inspection.png'),full_page=True)
    ok('仓库异常—补件—原申请复核通过—恢复退款的完整页面链路')
    desk(page,'finance');command(page,'submitRefund');command(page,'recordRefundReceipt',{'outcome':'unknown','receiptId':'UI-UNKNOWN-001','version':'1','reason':'原支付渠道暂未给出最终结果'})
    assert state(page)['refunds'][0]['status']=='unknown';request=state(page)['refunds'][0]['requestId']
    command(page,'queryRefund');expect(page.locator('#dialog-body')).to_contain_text(request);close(page)
    command(page,'recordRefundReceipt',{'outcome':'success','receiptId':'UI-SUCCESS-002','version':'2','reason':'已核对原退款请求渠道成功回执'})
    data=state(page);assert len(data['refunds'])==1;assert data['refunds'][0]['requestId']==request;assert data['applications'][0]['stage']=='completed'
    ok('财务原请求提交—未知—查询—成功回执，没有第二笔退款')
    customer_progress(page);button(page,'反馈是否解决').click();page.locator('#command-form [name=resolved]').select_option('false');page.locator('#command-form [name=reason]').fill('账户暂未看到入账');button(page,'确认提交').click()
    assert state(page)['cases'][0]['dispute']['open'];assert len(state(page)['refunds'])==1
    desk(page,'finance');command(page,'resolveDispute',{'reason':'核对原渠道流水及到账说明，已给出可核查的入账路径'})
    close(page);button(page,'运营管理').click();assert 'AI独立解决' in page.locator('body').inner_text()
    metrics=page.evaluate("SupportV2Service.metrics(JSON.parse(localStorage.getItem('support-ecommerce-v2')),{id:'operator',role:'operator'})")
    assert metrics['independent']==0;assert metrics['resolved']==1
    page.screenshot(path=str(OUT/'04-operations-results.png'),full_page=True)
    ok('用户未到账异议保留原事项，人工办理不计AI独立解决')

    page=fresh();apply(page,'exchange',extra={'targetVariant':'岩灰 · 500mL'})
    assert state(page)['applications'][0]['targetVariant']=='岩灰 · 500mL';desk(page,'manager');command(page,'approve',{'reason':'审核换货材料与目标规格，按规则寄回'})
    assert not state(page)['refunds'];assert state(page)['applications'][0]['type']=='exchange'
    ok('换货选择目标规格、独立受理和审核，不误建退款')
    page=fresh();apply(page,'reship',extra={'missingScope':'part','missingName':'密封圈','missingQuantity':'1'})
    desk(page,'manager');command(page,'approve',{'reason':'核对缺配件事实，批准补发协调'})
    assert state(page)['applications'][0]['stage']=='awaiting_fulfillment';assert not state(page)['refunds'];assert not state(page)['returns']
    ok('补发保存缺失范围与数量，待履约而非已寄出')

    page=fresh();button(page,'我的订单').click();page.locator('[data-action=application][data-kind=change_address][data-order="EC-SO20261006001"]').click()
    page.locator('#application-form [name=addressText]').fill('浙江省杭州市余杭区服务园区9号');page.locator('#application-form [name=reason]').fill('收货地址填写有误，需要更正');button(page,'核对申请预览').click();button(page,'确认提交').click()
    assert next(o for o in state(page)['orders'] if o['id']=='EC-SO20261006001')['address']['text'].endswith('9号')
    close(page);button(page,'我的订单').click();page.locator('[data-action=application][data-kind=cancel_order][data-order="EC-SO20261006001"]').click();page.locator('#application-form [name=reason]').fill('订单暂不需要，请取消');button(page,'核对申请预览').click();button(page,'确认提交').click()
    assert state(page)['refunds'][0]['amountCents']==12900;assert not state(page)['returns']
    ok('未发货订单改址与已支付取消均需确认，取消后退款不经过寄回')

    page=fresh();button(page,'运营管理').click();button(page,'场景配置').click();page.locator('[data-action=policy][data-type=reship]').click()
    page.locator('#policy-form [name=materialRequired]').uncheck();page.locator('#policy-form [name=feedbackHours]').fill('12');button(page,'保存草稿').click();assert next(p for p in state(page)['policies'] if p['id']=='reship')['live']['feedbackHours']==24
    button(page,'校验草稿').click();button(page,'发布当前草稿').click();assert next(p for p in state(page)['policies'] if p['id']=='reship')['live']['feedbackHours']==12
    close(page);page.screenshot(path=str(OUT/'05-scenario-configuration.png'),full_page=True)
    apply(page,'reship',extra={'missingScope':'part','missingName':'密封圈','missingQuantity':'1'},image=False)
    assert state(page)['applications'][0]['policy']['version']==2;assert state(page)['applications'][0]['attachmentIds']==[]
    ok('运营场景配置发布后真实影响新申请材料与反馈时限')

    page=fresh();button(page,'运营管理').click();button(page,'知识库').click();page.locator('[data-action=knowledge][data-id=KB002]').click();page.locator('#knowledge-form [name=answer]').fill('用软布和中性清洁剂轻洗，晾干后收纳。');button(page,'保存草稿').click();button(page,'运行正反例').click();button(page,'发布知识').click();close(page);button(page,'消费者服务').click();page.locator('#chat-input').fill('杯子怎么清洗');button(page,'发送').click();expect(page.locator('.messages')).to_contain_text('晾干后收纳')
    ok('知识编辑、正反例验证、发布和正式入口命中新版')

    page=fresh();button(page,'联系人工').click();desk(page,'lin');command(page,'claim');page.locator('#reply-form [name=body]').fill('已接续您的问题，请补充需要办理的订单。');button(page,'确认发送').click();command(page,'handoff',{'targetId':'zhou','reason':'交接未完事项及已提供信息'});assert state(page)['cases'][0]['ownerId']=='lin';page.locator('[name=deskActor]').select_option('zhou');command(page,'acceptHandoff');assert state(page)['cases'][0]['ownerId']=='zhou'
    close(page);button(page,'消费者服务').click();page.locator('#chat-input').fill('请继续');button(page,'发送').click();assert state(page)['conversations'][0]['messages'][-1]['role']=='customer'
    ok('人工接管、公开回复、转派接收与人工优先的实际页面操作')
    retained=state(page);page=fresh(initial=retained);assert '已接续您的问题' in page.locator('body').inner_text();ok('从既有V2记录重新加载后保留会话与处理状态（Storage测试替身）')

    page=fresh(390,844);page.screenshot(path=str(OUT/'06-mobile-customer.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
    button(page,'我的订单').click();assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
    page.locator('[data-action=application][data-item="EC-ITEM-001"]').click();assert page.locator('#dialog').evaluate('(d)=>d.getBoundingClientRect().width<=window.innerWidth')
    page.screenshot(path=str(OUT/'07-mobile-application.png'),full_page=True)
    close(page);desk(page,'manager');assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
    ok('390px移动布局：消费者、订单、申请弹窗与工作台无页面级横向溢出')
    assert not errors,errors
    ok('上述交互未出现浏览器脚本异常')
    result={'passed':len(passed),'failed':0,'cases':passed,'console_errors':errors,'execution':'Chromium inline HTML DOM execution; in-memory Storage test double; no network navigation or real persistence certification'}
    (OUT/'browser-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    browser.close()
    print(json.dumps({'passed':len(passed),'failed':0,'output':str(OUT)},ensure_ascii=False))
