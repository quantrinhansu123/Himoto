"""Legacy ownership corrections. All business APIs intercepted, including Telegram GETs."""
import argparse
import copy
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3052')
parser.add_argument('--sessions', required=True)
parser.add_argument('--output', default='.backups/ownership-terms-20261029/ui')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
checks, errors, writes = [], [], []
expect.set_options(timeout=25000)

with sync_playwright() as pw:
    for engine, width in [('chromium', 1440), ('webkit', 390)]:
        browser = getattr(pw, engine).launch()
        for role in ['ownership_manager', 'admin', 'ownership_staff', 'accounting']:
            allowed = role in ['ownership_manager', 'admin', 'ownership_staff']
            state = dict(id=901, code='VPS-QA-901', revision='7', status='renting', term_months='custom',
                         daily_amount=None, can_edit=allowed, history=[])
            requests, flags = {}, {}

            def record():
                return dict(id=901, contract_number='VPS-QA-901', order_status='renting', order_type='ownership',
                            rental_type='ownership', legacy_source_store_id=29, ownership_term_months=state['term_months'],
                            store_id=35, store_kind='lease_to_own', store_name='CS Thuê sở hữu', customer_id=7,
                            customer_name='Khách QA', total_amount=3000000, paid_amount=2200000, deposit_amount=2000000,
                            draft_revision=state['revision'], vehicles=[dict(id=101, name='Xe QA', license='QA-901')],
                            rent_at='2026-10-01T04:15:00Z', return_at='2026-11-01T04:15:00Z')

            def mock(route):
                if mock_contract_type_read(route):
                    return
                req = route.request
                path = urlparse(req.url).path
                if req.method not in ['GET', 'HEAD']:
                    assert req.method == 'PATCH' and path == '/api/auth/order/car-rental/901/ownership-terms', f'Unexpected write {req.method} {path}'
                    assert allowed
                    body = req.post_data_json
                    writes.append(copy.deepcopy(body))
                    assert set(body) == {'revision', 'request_id', 'term_months', 'daily_amount'}
                    if flags.pop('conflict', False):
                        state['revision'] = str(int(state['revision']) + 1)
                    if body['request_id'] not in requests:
                        if body['revision'] != state['revision']:
                            route.fulfill(status=409, json=dict(status='error', message='Hợp đồng đã thay đổi. Tải lại thời hạn và mức đóng trước khi lưu.'))
                            return
                        before = dict(term_months=state['term_months'], daily_amount=state['daily_amount'])
                        state.update(term_months=body['term_months'], daily_amount=int(body['daily_amount']) if body['daily_amount'] is not None else None,
                                     revision=str(int(state['revision']) + 1))
                        state['history'].insert(0, dict(at='2026-10-29T01:00:00Z', actor='Quản lý QA', before=before,
                                                       after=dict(term_months=state['term_months'], daily_amount=state['daily_amount'])))
                        requests[body['request_id']] = copy.deepcopy(body)
                    else:
                        assert requests[body['request_id']] == body
                    if flags.pop('lost_response', False):
                        route.abort()
                        return
                    data = copy.deepcopy(state)
                elif path == '/api/auth/order/car-rental/901/ownership-terms':
                    data = copy.deepcopy(state)
                elif path == '/api/auth/order/car-rental':
                    data = [record()]
                elif path in ['/api/auth/stores', '/api/auth/store-directory']:
                    data = [dict(id=35, store_name='CS Thuê sở hữu', name='CS Thuê sở hữu', kind='lease_to_own', status='opening')]
                elif path == '/api/auth/order/car-rental/901/history':
                    data = dict(changes=[], cashflow=[])
                elif path.endswith('/telegram'):
                    data = dict(auto_enabled=False, events=[])
                else:
                    data = []
                route.fulfill(json=dict(status='success', data=data))

            ctx = browser.new_context(viewport=dict(width=width, height=950), timezone_id='Asia/Ho_Chi_Minh')
            ctx.add_init_script("const f=fetch;window.fetch=function(i,o){const u=new URL(typeof i==='string'?i:i.url,location.href);return u.pathname==='/api/auth/payment-events'?Promise.resolve(Response.json({status:'success',data:[]})):f.call(this,i,o);};")
            ctx.add_cookies([dict(name='himoto_management_session', value=(Path(args.sessions) / f'session-{role}.txt').read_text().strip(),
                                 url=args.url, httpOnly=True, sameSite='Strict')])
            ctx.route('**/api/**', mock)
            page = ctx.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(args.url + '/contracts/ownership', wait_until='networkidle', timeout=120000)
            page.locator('button.mg-row-menu-trigger').filter(visible=True).first.click()
            page.get_by_role('menuitem', name='Xem chi tiết', exact=True).click()
            detail = page.get_by_role('dialog', name='Chi tiết hợp đồng: VPS-QA-901', exact=True)
            expect(detail).to_be_visible()
            entry = detail.get_by_role('button', name='Sửa thời hạn / mức đóng', exact=True)
            if not allowed:
                expect(entry).to_have_count(0)
                checks.append(f'{engine}/{role}: correction entry is unavailable')
                ctx.unroute_all(behavior='ignoreErrors')
                ctx.close()
                continue
            expect(entry).to_be_visible()
            detail.locator('#contract-detail-tab-contract').click()
            summary = detail.locator('#contract-detail-panel-contract')
            expect(summary).to_contain_text('Chưa xác định')
            entry.click()
            editor = page.get_by_role('dialog', name='Thời hạn & mức đóng thuê sở hữu · VPS-QA-901', exact=True)
            term = editor.get_by_label('Thời hạn thuê sở hữu', exact=True)
            daily = editor.get_by_label('Số tiền đóng mỗi ngày (VNĐ)', exact=True)
            save = editor.get_by_role('button', name='Lưu thời hạn và mức đóng', exact=True)
            expect(daily).to_have_value('')
            term.select_option('12')
            daily.fill('135000')
            expect(daily).to_have_value('135.000')
            editor.screenshot(path=str(out / f'{engine}-{role}-edit.png'))
            save.click()
            expect(editor).not_to_be_visible()
            expect(summary).to_contain_text('12 tháng')
            expect(summary).to_contain_text('135.000')
            assert record()['total_amount'] == 3000000 and record()['paid_amount'] == 2200000 and record()['deposit_amount'] == 2000000
            entry.click()
            expect(daily).to_have_value('135.000')
            editor.get_by_text('Lịch sử sửa thời hạn và mức đóng (1)', exact=True).click()
            expect(editor).to_contain_text('Quản lý QA')
            checks.append(f'{engine}/{role}: manager/admin can correct a legacy term and daily amount; detail refreshes, audit and saved values survive reopening, financial totals stay unchanged')
            if role == 'ownership_manager':
                flags['conflict'] = True
                daily.fill('140000')
                save.click()
                expect(editor.get_by_role('alert')).to_contain_text('Hợp đồng đã thay đổi')
                expect(daily).to_have_value('140.000')
                editor.get_by_role('button', name='Tải lại', exact=True).click()
                expect(daily).to_have_value('135.000')
                daily.fill('0')
                count = len(writes)
                save.click()
                expect(editor.get_by_role('alert')).to_contain_text('lớn hơn 0')
                assert count == len(writes)
                daily.fill('')
                flags['lost_response'] = True
                save.click()
                expect(editor.get_by_role('status')).to_contain_text('Chưa xác nhận được kết quả lưu')
                expect(daily).to_be_disabled()
                save.click()
                expect(editor).not_to_be_visible()
                assert writes[-1] == writes[-2]
                assert state['daily_amount'] is None and len(state['history']) == 2
                expect(summary).to_contain_text('Chưa xác định')
                entry.click()
                expect(daily).to_have_value('')
                page.set_viewport_size(dict(width=320, height=812))
                editor.screenshot(path=str(out / f'{engine}-manager-320.png'))
                assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
                assert editor.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
                checks.append(f'{engine}: stale save prompts reload without overwriting, zero is rejected, blank remains unknown, lost-response retry reuses its ID without duplicate history; dialog fits 320px')
            ctx.unroute_all(behavior='ignoreErrors')
            ctx.close()
        browser.close()

assert not errors, errors
report = dict(passed=len(checks), checks=checks, javascriptErrors=errors, simulatedWrites=len(writes), realBusinessWrites=0, realTelegramRequests=0)
(out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
