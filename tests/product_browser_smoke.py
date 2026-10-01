#!/usr/bin/env python3
"""Post-application browser smoke tests against the full, real local project.

Run a local HTTP server first. A new browser context is used; your usual browser
profile is never opened or cleared. Requires Playwright and its Chromium browser.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect


def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='http://127.0.0.1:8768')
    parser.add_argument('--report',type=Path,default=Path('tests/evidence/product-browser-report.json'))
    args=parser.parse_args()
    base=args.url.rstrip('/')+'/'
    completed=[]; errors=[]
    with sync_playwright() as p:
        browser=p.chromium.launch()
        context=browser.new_context(viewport={'width':1440,'height':1000})
        page=context.new_page()
        page.on('pageerror',lambda error:errors.append(str(error)))
        try:
            page.goto(base,wait_until='networkidle')
            expect(page.locator('h1')).to_have_text('服务工作台')
            expect(page.locator('[data-action="demo-guide"]')).to_have_count(0)
            expect(page.locator('.topbar [data-action="reset"]')).to_have_count(0)
            completed.append('后台首页与全局入口')
            page.goto(base+'?view=customer#playground',wait_until='networkidle')
            expect(page.locator('.sidebar')).to_be_hidden()
            expect(page.locator('.topbar')).to_be_hidden()
            expect(page.locator('[data-action="open-session"]')).to_have_count(0)
            expect(page.locator('[data-play-select]')).to_have_count(0)
            completed.append('独立客户页面不渲染运营控件')
            page.locator('[data-action="entry"][data-query="我要申请退货 SO20260926001"]').click()
            expect(page.locator('.chat-body')).to_contain_text('售后')
            page.locator('.intake-card [data-action="item-ticket"]').click()
            expect(page.locator('[data-form="new-ticket"]')).to_be_visible()
            page.locator('[data-form="new-ticket"] [type="submit"]').click()
            expect(page.locator('#confirm-dialog')).to_be_visible()
            page.locator('[data-action="accept-confirm"]').click()
            expect(page.locator('#modal-content')).to_contain_text('待分配')
            assert not any('customerSubmitted is not defined' in e for e in errors)
            completed.append('售后申请打开、预览、确认、受理')
            page.locator('[data-action="close-modal"]').first.click()
            page.reload(wait_until='networkidle')
            expect(page.locator('.service-items')).to_contain_text('待分配')
            completed.append('刷新保留已受理的服务事项及工单')
            page.goto(base+'#workflow',wait_until='networkidle')
            page.locator('[data-form="flow-test"] [name="orderResponse"]').select_option('timeout')
            page.locator('[data-form="flow-test"] [type="submit"]').click()
            expect(page.locator('#flow-test-result')).to_contain_text('超时')
            snapshot=page.evaluate('({draft:state.draft.queryMode,published:state.published.queryMode})')
            assert snapshot=={'draft':'success','published':'success'},snapshot
            completed.append('故障响应仅影响草稿测试副本')
            page.goto(base+'#architecture',wait_until='networkidle')
            with page.expect_download() as info:
                page.locator('[data-action="export-workspace"]').click()
            assert info.value.suggested_filename.endswith('.json')
            completed.append('工作空间数据导出')
            assert not errors,errors
            report={'passed':True,'checks':completed,'page_errors':errors,'url':base}
        except Exception as exc:
            report={'passed':False,'checks_completed':completed,'page_errors':errors,'error':str(exc),'url':base}
            args.report.parent.mkdir(parents=True,exist_ok=True)
            args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
            raise
        finally:
            context.close(); browser.close()
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__': main()
