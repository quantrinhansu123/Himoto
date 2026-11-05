"""GPS browser acceptance with durable intercepted synthetic API; no real login."""
import argparse
import json
import time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from lib.mobile_fixture_journal import FixtureJournal
from lib import mobile_gps_fixture as model

def run(base,output):
    output.mkdir(parents=True,exist_ok=False)
    journal=FixtureJournal(output/'state.json',model=model)
    checks=[];errors=[];unexpected=[];maps=[]
    with sync_playwright() as p:
        browser=p.chromium.launch()
        context=browser.new_context(viewport={'width':375,'height':812},reduced_motion='reduce')
        def intercept(route):
            request=route.request;url=urlparse(request.url)
            if url.netloc==urlparse(base).netloc:return route.continue_()
            if url.hostname=='www.google.com':maps.append({'url':request.url,'authorization':request.headers.get('authorization')});return route.fulfill(status=204)
            if url.hostname!='mobile-api.example.invalid':unexpected.append(url.hostname);return route.abort()
            headers={'Access-Control-Allow-Origin':base,'Access-Control-Allow-Headers':'authorization,content-type,idempotency-key','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'}
            if request.method=='OPTIONS':return route.fulfill(status=204,headers=headers)
            body=request.post_data_json if request.post_data else {}
            status,data,lost=journal.transact(url.path+('?' +url.query if url.query else ''),request.method,body,dict(request.headers))
            if lost:status,data=503,{'code':'SERVICE_UNAVAILABLE','message':'QA mất phản hồi sau commit GPS.'}
            return route.fulfill(status=status,headers=headers,json=data)
        context.route('**/*',intercept)
        page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
        button=lambda text:page.get_by_role('button',name=text,exact=True)
        field=lambda text:page.get_by_role('textbox',name=text,exact=True)
        def login(email):
            page.goto(base);field('Tài khoản').fill(email);page.get_by_label('Mật khẩu',exact=True).fill('fixture-password');button('Đăng nhập').click();expect(button('Định vị GPS')).to_be_visible();button('Định vị GPS').click();expect(button('Mở bản đồ GPS-QA-101').first).to_be_visible()
        def choose(label,value):button(label).click();button(value).click()
        def reset():button('Toàn bộ xe · 36').click()
        def logout():
            tab=page.get_by_role('tab',name='Tài khoản',exact=True)
            for _ in range(6):
                if tab.is_visible():break
                page.go_back();page.wait_for_timeout(250)
            tab.click();button('Đăng xuất').click();expect(button('Đăng nhập')).to_be_visible()
        try:
            login('qa-settings')
            expect(page.get_by_text('39 dòng · Trang 1/2',exact=True)).to_be_visible()
            expect(button('Ghép GPS GPSQA001')).to_have_count(0)
            page.screenshot(path=str(output/'01-staff-gps.png'),full_page=True)
            button('Xe dừng trên 3 ngày · 1').click();expect(page.get_by_text('2 dòng · Trang 1/1',exact=True)).to_be_visible()
            expect(button('Mở bản đồ GPS-QA-101')).to_have_count(2)
            button('Mở bản đồ GPS-QA-101').first.click();page.wait_for_timeout(400);assert maps and maps[-1]['url']=='https://www.google.com/maps?q=0,0' and maps[-1]['authorization'] is None
            reset();button('Bộ lọc GPS').click();field('Tìm GPS').fill('GPSQA004');button('Tìm GPS theo nội dung đã nhập').click()
            expect(page.get_by_text('1 dòng · Trang 1/1',exact=True)).to_be_visible();expect(page.get_by_text('Chưa cập nhật',exact=True)).to_be_visible();expect(page.get_by_text('Chưa có tốc độ hiện tại',exact=True)).to_be_visible();expect(page.get_by_text('45 km/h',exact=True)).to_have_count(0)
            reset();choose('Cơ sở GPS','Cơ sở GPS QA B');expect(page.get_by_text('18 dòng · Trang 1/1',exact=True)).to_be_visible()
            choose('Cơ sở GPS','Toàn bộ cơ sở');button('Ẩn bộ lọc GPS').click();button('Trang GPS tiếp').click();expect(page.get_by_text('39 dòng · Trang 2/2',exact=True)).to_be_visible()
            checks.append('Settings-only staff sees full fleet with exact unique long-stop count, old speed hidden, store/search filters and all pagination; no administrator mapping controls')
            button('Trang GPS trước').click();button('Lịch sử GPS').click();choose('Nguồn lịch sử GPS','Nhật ký đọc bù');expect(page.get_by_text('Tắt khóa điện',exact=True)).to_be_visible();expect(page.get_by_text('Mất kết nối',exact=True)).to_have_count(0)
            choose('Nguồn lịch sử GPS','Tất cả nguồn');choose('Thiết bị trong lịch sử GPS','GPS-QA-102');expect(page.get_by_text('Kết nối trở lại',exact=True)).to_be_visible();expect(page.get_by_text('Tắt khóa điện',exact=True)).to_have_count(0)
            button('Thiết bị GPS').click();journal.control(lambda state:state.update(mode='read-error'));button('Tải lại GPS').click();expect(page.get_by_text('QA gián đoạn đọc GPS; giữ dữ liệu gần nhất.',exact=True)).to_be_visible();expect(button('Mở bản đồ GPS-QA-101').first).to_be_visible()
            journal.control(lambda state:state.update(mode='sync-error'));button('Đồng bộ ngay').click();expect(page.get_by_text('QA chưa đồng bộ được GPS. Giữ trạng thái gần nhất.',exact=True)).to_be_visible();expect(button('Mở bản đồ GPS-QA-101').first).to_be_visible()
            journal.control(lambda state:state.update(mode='none'));button('Tải lại GPS').click()
            before=journal.state['reads'];page.wait_for_timeout(5500);assert journal.state['reads']>before
            page.go_back();before=journal.state['reads'];page.wait_for_timeout(5500);assert journal.state['reads']==before
            page.get_by_role('tab',name='Tài khoản',exact=True).click();button('Đăng xuất').click();expect(button('Đăng nhập')).to_be_visible()
            checks.append('History source/device filters, retained last good GPS on read/sync errors, five-second foreground polling and no reads after leaving screen')
            login('qa-admin');button('Ghép GPS GPSQA001').click();expect(page.get_by_text('Đang ghép: GPS-QA-101 · Cơ sở GPS QA A',exact=True)).to_be_visible()
            field('Tìm xe để ghép GPS').fill('GPS-QA-102');button('Tìm xe ghép GPS').click();button('Chọn ghép GPS-QA-102').click()
            expect(page.get_by_text('Sẽ ghép: GPS-QA-102 · Cơ sở GPS QA B',exact=True)).to_be_visible()
            journal.control(lambda state:state.update(mode='mapping-lost'));button('Lưu ghép GPS với xe đã chọn').click();expect(button('Đối chiếu và kết thúc mã ghép GPS')).to_be_visible();assert journal.state['writes']==1
            button('Đối chiếu và kết thúc mã ghép GPS').click();expect(page.get_by_text('Đã ghi: GPS-QA-102 · Cơ sở GPS QA B',exact=True)).to_be_visible();page.screenshot(path=str(output/'02-original-mapping-proof.png'),full_page=True)
            assert journal.state['writes']==1 and model.device(journal.state,1)['stopped_since'] is None
            button('Đã kiểm tra kết quả ghép GPS').click();expect(button('Ghép GPS GPSQA001')).to_be_visible()
            checks.append('Administrator reviews exact device/vehicle, one lost commit recovers its immutable original proof and reassignment clears both stop clocks')
            button('Ghép GPS GPSQA001').click();button('Chọn không ghép xe').click();journal.control(lambda state:state.update(mode='mapping-drop'));button('Lưu bỏ ghép GPS khỏi xe').click();expect(button('Đối chiếu và kết thúc mã ghép GPS')).to_be_visible()
            button('Đối chiếu và kết thúc mã ghép GPS').click();expect(button('Lưu ghép GPS với xe đã chọn')).to_be_visible();assert journal.state['writes']==1
            assert journal.transact(**journal.state['delayed'])[0]==409
            page.go_back();button('Ghép GPS GPSQA001').click();journal.control(lambda state:state.update(mode='mapping-conflict'));button('Lưu ghép GPS với xe đã chọn').click();expect(page.get_by_text('Thiết bị QA đã thay đổi. Đối chiếu và tải lại.',exact=True)).to_be_visible()
            button('Đối chiếu và kết thúc mã ghép GPS').click();expect(button('Lưu bỏ ghép GPS khỏi xe')).to_be_visible();assert journal.state['writes']==1
            checks.append('Dropped mapping is tombstoned before retry; late delivery stays blocked; concurrent mapping change requires a new review without extra write')
            page.go_back()
            for width,height in [(320,740),(390,844),(430,932)]:
                page.set_viewport_size({'width':width,'height':height});expect(button('Tải lại GPS')).to_be_visible();assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
                page.screenshot(path=str(output/f'03-gps-{width}.png'),full_page=True)
            checks.append('GPS list fits 320/375/390/430 widths without horizontal page overflow')
            logout();assert journal.summary()['activeSessions']==0;assert not errors and not unexpected
        except Exception as error:
            page.screenshot(path=str(output/'failure.png'),full_page=True);(output/'failure.txt').write_text(str(error)+'\n'+page.locator('body').inner_text(),encoding='utf-8')
            (output/'results.json').write_text(json.dumps({'status':'failed','passed':len(checks),'checks':checks,'error':str(error),'pageErrors':errors,'unexpectedHosts':unexpected},ensure_ascii=False,indent=2),encoding='utf-8');raise
        finally:
            for token in list(journal.state['sessions']):journal.transact('/api/mobile/v1/session','DELETE',{}, {'Authorization':'Bearer '+token})
            browser.close();journal.close()
    result={'status':'passed','passed':len(checks),'checks':checks,'pageErrors':errors,'unexpectedHosts':unexpected,'fixtureOnly':True,'operationalWrites':0}
    (output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:8096');parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();run(args.url.rstrip('/'),args.output)
