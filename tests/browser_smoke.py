"""Chromium interaction checks for the actual UI.

Run with an already-started local server:
  python tests/browser_smoke.py --url http://127.0.0.1:8768
Restricted render environments can instead mount local assets without navigation:
  python tests/browser_smoke.py --offline
Offline mode uses an explicitly simulated localStorage adapter. It does not
verify HTTP hosting, browser-origin persistence, or server-side permissions.
Requires Python playwright plus Chromium; no dependency is needed to use the Demo.
"""
import argparse
import json
import re
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:8768')
parser.add_argument('--offline', action='store_true')
parser.add_argument('--screenshots', action='store_true', help='Capture successful-page evidence as well as failures')
parser.add_argument('--output', default=str(ROOT / 'tests' / 'evidence'))
args = parser.parse_args()
OUT = Path(args.output)
OUT.mkdir(parents=True, exist_ok=True)
results = []
errors = []


def nav(page, name):
    page.locator(f'button.nav-link[data-nav="{name}"]').click()


def shot(page, filename):
    if not args.screenshots:
        return
    # Let transient feedback finish and return to the top before capturing sticky UI.
    page.wait_for_function("!document.querySelector('#toast').classList.contains('visible')")
    page.wait_for_timeout(250)
    page.evaluate('window.scrollTo(0, 0)')
    page.screenshot(path=str(OUT / filename), full_page=True)


def snapshot(page):
    return page.evaluate('JSON.parse(JSON.stringify(state))')


def send(page, message):
    page.get_by_label('访客消息', exact=True).fill(message)
    page.locator('[data-form="visitor-message"] button[type="submit"]').click()


def start(page):
    nav(page, 'playground')
    page.get_by_role('button', name='开始咨询', exact=True).click()
    return page.evaluate('ui.play')


def close(page):
    page.locator('#modal button[data-action="close-modal"]').first.click()


def accept(page):
    page.locator('#confirm-dialog [data-action="accept-confirm"]').click()


def knowledge_fields(page):
    page.get_by_label('知识标题', exact=False).fill('礼品卡分次使用规则')
    page.locator('#knowledge-question').fill('礼品卡可以分多次使用吗？')
    page.get_by_label('演示匹配关键词', exact=False).fill('礼品卡,分次使用')
    page.get_by_label('标准答案', exact=False).fill('虚构演示：礼品卡支持按余额分次使用，不支持提现，最终资格由人工核实。')
    page.get_by_label('来源说明', exact=False).fill('青禾生活虚构演示规则；仅用于产品流程验证。')


def progress(page, ticket, status, note='', evidence='', internal=''):
    nav(page, 'tickets')
    page.locator(f'[data-action="ticket-detail"][data-id="{ticket}"]').click()
    page.get_by_label('负责人', exact=True).select_option('客服小林')
    page.get_by_label('下一状态', exact=False).select_option(status)
    page.get_by_label('客户可见处理说明', exact=True).fill(note)
    page.get_by_label('内部备注（不发送给客户）', exact=True).fill(internal)
    page.get_by_label('结果证据（完成时必填，仅内部可见）', exact=True).fill(evidence)
    page.get_by_role('button', name='更新工单', exact=True).click()


with sync_playwright() as p:
    executable = shutil.which('chromium') or shutil.which('chromium-browser')
    launch = {'headless': True}
    if executable:
        launch['executable_path'] = executable
    browser = p.chromium.launch(**launch)

    def new_page(width=1440, height=1100, stored=None, fail_storage=False):
        context = browser.new_context(viewport={'width': width, 'height': height}, locale='zh-CN')
        page = context.new_page()
        page.set_default_timeout(5000)
        page.on('pageerror', lambda error: errors.append(str(error)))
        if args.offline:
            html = ROOT.joinpath('index.html').read_text()
            html = re.sub(r'<script[^>]+src=[^>]+></script>', '', html)
            html = re.sub(r'<link[^>]+rel="stylesheet"[^>]*>', '', html)
            page.set_content(html)
            page.add_style_tag(content=ROOT.joinpath('styles.css').read_text())
            page.evaluate("""({stored, fail}) => Object.defineProperty(window, 'localStorage', {
                value: { _data: stored || {}, getItem(k) { return this._data[k] || null; },
                setItem(k,v) { if (fail) throw new Error('simulated quota'); this._data[k]=String(v); },
                removeItem(k) { delete this._data[k]; } }
            })""", {'stored': stored, 'fail': fail_storage})
            page.add_script_tag(content=ROOT.joinpath('engine.js').read_text())
            page.add_script_tag(content=ROOT.joinpath('app.js').read_text())
        else:
            page.goto(args.url)
        return page

    def run(name, task):
        page = new_page()
        try:
            task(page)
            results.append({'scenario': name, 'pass': True})
        except Exception as error:
            page.screenshot(path=str(OUT / f'failure-{len(results)+1}.png'), full_page=True)
            results.append({'scenario': name, 'pass': False, 'error': str(error)})
        finally:
            page.context.close()

    def pages(page):
        for key in ['overview', 'playground', 'robot', 'workflow', 'knowledge', 'sessions', 'tickets', 'quality', 'integrations', 'architecture']:
            nav(page, key)
            assert page.locator('h1').inner_text()
            assert page.evaluate('document.documentElement.scrollWidth') == 1440
        nav(page, 'overview')
        shot(page, '01-overview.png')
        assert snapshot(page)['sessions'].__len__() == 5
    run('B01 十页导航与桌面布局；浏览不自动新增会话', pages)

    def entrance(page):
        nav(page, 'playground')
        page.get_by_role('button', name='问服务规则', exact=False).click()
        assert snapshot(page)['sessions'].__len__() == 6
        assert page.get_by_label('访客消息', exact=True).input_value() == '七天无理由退货有什么条件？'
        assert snapshot(page)['sessions'][0]['runs'] == []
        page.get_by_role('button', name='只看客户窗口', exact=True).click()
        assert not page.locator('.sidebar').is_visible()
        assert page.locator('[data-play-select]').count() == 0
        assert page.locator('h1').inner_text() == '青禾生活 · 在线客服'
        shot(page, '02-customer-entry.png')
    run('B02 客户入口、先填后发、隐藏后台演示视角', entrance)

    def full_service(page):
        sid = start(page)
        send(page, '查物流 SO20260926001，再申请退货')
        assert page.locator('.service-item').count() == 2
        st = snapshot(page)
        item = next(i for i in st['items'] if i['sessionIds'] == [sid] and i['type'] == 'aftersales')
        order = next(i for i in st['items'] if i['sessionIds'] == [sid] and i['type'] == 'order')
        old_count = len(st['tickets'])
        page.locator(f'[data-item-id="{item["id"]}"] [data-action="item-ticket"]').click()
        page.get_by_label('问题描述', exact=False).fill('外盒破损，商品未使用，请核实退货。')
        page.get_by_role('button', name='预览并确认提交', exact=True).click()
        assert len(snapshot(page)['tickets']) == old_count
        assert page.locator('#confirm-dialog').is_visible()
        accept(page)
        ticket = snapshot(page)['tickets'][0]['id']
        assert len(snapshot(page)['tickets']) == old_count + 1
        close(page)
        assert page.locator('.intake-card').inner_text().find('已登记') >= 0
        page.locator(f'[data-item-id="{order["id"]}"] [data-action="confirm-item"]').click()
        shot(page, '03-service-items.png')
        page.get_by_role('button', name='结束咨询', exact=True).click()
        accept(page)
        progress(page, ticket, '处理中', '已由专员核对订单。')
        assert page.get_by_label('下一状态', exact=False).input_value() == ''
        close(page)
        progress(page, ticket, '待客户补充', '请补充外盒是否破损、商品是否使用。', internal='INTERNAL-ONLY-NOTE')
        close(page)
        nav(page, 'playground')
        page.locator(f'[data-action="ticket-read"][data-id="{ticket}"]').first.click()
        assert 'INTERNAL-ONLY-NOTE' not in page.locator('#modal-content').inner_text()
        page.get_by_label('补充说明', exact=False).fill('外盒破损，商品未使用，配件齐全。')
        page.get_by_role('button', name='提交补充说明', exact=True).click()
        assert next(s for s in snapshot(page)['sessions'] if s['id'] == sid)['status'] == 'ended'
        assert next(t for t in snapshot(page)['tickets'] if t['id'] == ticket)['status'] == '处理中'
        close(page)
        progress(page, ticket, '已完成', '已核实演示售后处理方案，请确认结果。')
        assert next(t for t in snapshot(page)['tickets'] if t['id'] == ticket)['status'] == '处理中'
        page.get_by_label('结果证据（完成时必填，仅内部可见）', exact=True).fill('DEMO-RESULT-001：模拟业务结果，非真实退款。')
        page.get_by_role('button', name='更新工单', exact=True).click()
        shot(page, '04-ticket-evidence.png')
        close(page)
        nav(page, 'playground')
        page.locator(f'[data-item-id="{item["id"]}"] [data-action="confirm-item"]').click()
        assert next(i for i in snapshot(page)['items'] if i['id'] == item['id'])['status'] == 'resolved'
        page.locator(f'[data-action="ticket-read"][data-id="{ticket}"]').first.click()
        assert 'DEMO-RESULT-001' not in page.locator('#modal-content').inner_text()
        page.get_by_label('仍未解决？说明当前问题', exact=True).fill('问题仍未解决，请继续核实。')
        page.get_by_role('button', name='提出未解决异议', exact=True).click()
        assert next(i for i in snapshot(page)['items'] if i['id'] == item['id'])['status'] == 'needs_human'
        close(page)
        nav(page, 'tickets')
        page.locator(f'[data-action="ticket-detail"][data-id="{ticket}"]').click()
        page.get_by_label('客户可见复核说明', exact=True).fill('复核发现仍需继续处理。')
        page.get_by_label('内部复核证据', exact=True).fill('DEMO-REVIEW-002：虚构复核证据。')
        page.get_by_role('button', name='确认复核处置', exact=True).click()
        assert next(t for t in snapshot(page)['tickets'] if t['id'] == ticket)['status'] == '处理中'
        assert len(snapshot(page)['tickets']) == old_count + 1
    run('B03 端到端：多事项→预览确认→结束聊天→工单补充→证据完成→客户确认→异议重开', full_service)

    def human(page):
        sid=start(page)
        send(page, '不要机器人，请转人工')
        send(page, '这是补充信息，不要丢失。')
        before=next(s for s in snapshot(page)['sessions'] if s['id']==sid)
        bots=sum(1 for m in before['messages'] if m['role']=='bot')
        page.locator(f'[data-action="open-session"][data-id="{sid}"]').click()
        page.get_by_role('button', name='接管会话', exact=True).click()
        page.get_by_label('坐席回复', exact=True).fill('已看到你的补充信息，我来继续核实。')
        page.get_by_role('button', name=re.compile('发送回复')).click()
        page.get_by_label('当前演示坐席', exact=True).select_option('客服小周')
        page.get_by_role('button', name='应用实时状态', exact=True).click()
        assert page.get_by_label('坐席回复', exact=True).is_disabled()
        page.get_by_label('人工状态', exact=True).select_option('offline')
        page.get_by_role('button', name='应用实时状态', exact=True).click()
        row=next(s for s in snapshot(page)['sessions'] if s['id']==sid)
        assert row['status']=='offline' and row['owner']==''
        assert sum(1 for m in row['messages'] if m['role']=='bot')==bots
        shot(page, '05-agent-workspace.png')
    run('B04 人工接续、单处理权与中途离线', human)

    def flow(page):
        old_sid=start(page)
        nav(page,'workflow')
        page.locator('[data-action="select-node"][data-id="order"]').click()
        page.get_by_label('查询结果模式',exact=True).select_option('timeout')
        page.get_by_role('button',name=re.compile('^运行测试')).click()
        assert '暂未完成' in page.locator('#flow-test-result').inner_text()
        assert snapshot(page)['published']['version']==1
        page.get_by_role('button',name='模拟发布流程',exact=True).click()
        accept(page)
        assert snapshot(page)['published']['version']==1
        assert '完整回归' in page.locator('#toast').inner_text()
        page.get_by_role('button',name='运行发布回归',exact=True).first.click()
        assert snapshot(page)['flowValidation']['passed']
        shot(page, '06-workflow-release.png')
        page.get_by_role('button',name='模拟发布流程',exact=True).click()
        accept(page)
        assert snapshot(page)['published']['version']==2
        page.get_by_role('button',name='新建会话验证发布版',exact=True).click()
        send(page,'查订单 SO20260926001')
        assert snapshot(page)['sessions'][0]['status']=='waiting'
        page.get_by_label('体验会话',exact=True).select_option(old_sid)
        send(page,'查订单 SO20260926001')
        old=next(s for s in snapshot(page)['sessions'] if s['id']==old_sid)
        assert old['flow']['version']==1 and old['messages'][-1].get('order')
        nav(page,'workflow')
        page.locator('[data-action="rollback-flow"][data-id="1"]').click()
        accept(page)
        page.get_by_role('button',name='运行发布回归',exact=True).first.click()
        page.locator('[data-action="select-node"][data-id="reply"]').click()
        page.get_by_label('回答引导语',exact=True).fill('新的演示引导语')
        assert '已失效' in page.locator('.evaluation .badge').first.inner_text()
    run('B05 流程：单条测试不替代发布回归，新旧版本与失效提示',flow)

    def quality(page):
        start(page)
        send(page,'礼品卡可以分多次使用吗？')
        q=snapshot(page)['issues'][0]
        nav(page,'quality')
        page.locator(f'[data-action="issue-detail"][data-id="{q["id"]}"]').click()
        page.get_by_label('复核结论',exact=True).select_option('已确认')
        page.get_by_label('复核说明',exact=False).fill('业务确认该规则需要覆盖；正确拒答不是违规。')
        page.get_by_label('整改责任人（确认时必填）',exact=True).fill('知识运营')
        page.get_by_label('根因判断（确认时必填）',exact=True).fill('知识覆盖缺口')
        page.get_by_role('button',name='保存复核结果',exact=True).click()
        page.get_by_role('button',name='转为 FAQ 草稿',exact=True).click()
        knowledge_fields(page)
        page.get_by_role('button',name='保存草稿',exact=True).click()
        k=snapshot(page)['knowledge'][0]
        assert k['status']=='draft'
        assert 'knowledge:new' not in snapshot(page)['workspace']['forms']
        nav(page,'knowledge')
        page.locator(f'[data-action="evaluate-knowledge"][data-id="{k["id"]}"]').click()
        assert '通过' in page.locator('#modal-content').inner_text()
        page.get_by_role('button',name='发布此知识',exact=True).click()
        accept(page)
        assert next(x for x in snapshot(page)['knowledge'] if x['id']==k['id'])['status']=='published'
        shot(page, '07-knowledge-lifecycle.png')
        nav(page,'quality')
        page.locator(f'[data-action="issue-detail"][data-id="{q["id"]}"]').click()
        page.get_by_role('button',name='原问题与边界回归',exact=True).click()
        page.get_by_label('验收说明',exact=True).fill('原问题已引用修订知识；正常和异常分支回归通过，仅验收演示范围。')
        page.get_by_role('button',name='验收并关闭演示整改',exact=True).click()
        current=next(x for x in snapshot(page)['issues'] if x['id']==q['id'])
        assert current['remediation']['status']=='已关闭'
        shot(page, '08-remediation-accepted.png')
    run('B06 知识整改：人工复核→FAQ草稿→测试发布→原问题回归→验收',quality)

    def invalid_knowledge(page):
        nav(page,'knowledge')
        page.get_by_role('button',name='新建 FAQ',exact=True).click()
        knowledge_fields(page)
        page.get_by_label('生效时间（当前浏览器时区）',exact=True).fill('2099-01-01T00:00')
        page.get_by_role('button',name='保存并运行草稿回归',exact=True).click()
        assert page.locator('#modal').is_visible()
        assert '草稿已保存' in page.locator('#modal .form-error').inner_text()
        assert page.get_by_label('标准答案',exact=False).input_value()
    run('B07 知识测试失败不关闭表单或丢失已保存草稿',invalid_knowledge)

    def text_safety(page):
        start(page)
        send(page,'<img src=x onerror="window.pwned=1">')
        assert not page.evaluate('Boolean(window.pwned)')
        assert page.locator('.message .bubble img').count()==0
        assert '<img' in page.locator('.message.user').inner_text()
    run('B08 文本按文本渲染，不执行用户HTML',text_safety)

    def drafts(page):
        start(page)
        page.get_by_label('访客消息',exact=True).fill('尚未发送的内容')
        nav(page,'robot')
        nav(page,'playground')
        assert page.get_by_label('访客消息',exact=True).input_value()=='尚未发送的内容'
        page.locator('[data-action="scenario"][data-index="0"]').click()
        assert page.locator('#confirm-dialog').is_visible()
        page.locator('#confirm-dialog [data-action="cancel-confirm"]').click()
        assert page.get_by_label('访客消息',exact=True).input_value()=='尚未发送的内容'
    run('B09 跨页草稿保留，推荐问题替换前确认',drafts)

    page=new_page(width=390,height=844)
    try:
        start(page)
        page.get_by_role('button',name='只看客户窗口',exact=True).click()
        send(page,'查物流 SO20260926001，再申请退货')
        assert page.evaluate('document.documentElement.scrollWidth')==390
        expect(page.locator('.service-item').last).to_be_visible()
        shot(page, '09-mobile-customer.png')
        results.append({'scenario':'B10 390px客户窗口与事项入口无横向溢出','pass':True})
    except Exception as error:
        results.append({'scenario':'B10 390px客户窗口','pass':False,'error':str(error)})
        shot(page, 'failure-mobile.png')
    finally:
        page.context.close()

    if args.offline:
        page=new_page(fail_storage=True)
        try:
            expect(page.locator('#storage-warning')).to_be_visible()
            start(page)
            send(page,'退货规则')
            assert snapshot(page)['sessions'][0]['messages'][-1]['citation']['id']=='KB001'
            results.append({'scenario':'B11 模拟存储失败时提示仅本页有效，主服务仍可操作','pass':True})
        except Exception as error:
            results.append({'scenario':'B11 模拟存储失败','pass':False,'error':str(error)})
        finally:
            page.context.close()
        page=new_page(stored={'zhixu-customer-demo-v1':'ORIGINAL-UNCHANGED'})
        try:
            start(page)
            send(page,'帮我查订单')
            saved=page.evaluate('localStorage._data')
            restored=new_page(stored=saved)
            nav(restored,'playground')
            send(restored,'SO20260926001')
            assert snapshot(restored)['sessions'][0]['messages'][-1]['order']['id']=='SO20260926001'
            assert restored.evaluate('localStorage._data["zhixu-customer-demo-v1"]')=='ORIGINAL-UNCHANGED'
            restored.context.close()
            results.append({'scenario':'B12 模拟存储恢复采集；V3不覆盖V1数据','pass':True})
        except Exception as error:
            results.append({'scenario':'B12 模拟存储恢复','pass':False,'error':str(error)})
        finally:
            page.context.close()
    browser.close()

report={'mode':'offline assets + simulated localStorage' if args.offline else 'HTTP browser', 'results':results,'pageErrors':errors,'passed':all(r['pass'] for r in results) and not errors}
OUT.joinpath('browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if report['passed'] else 1)
