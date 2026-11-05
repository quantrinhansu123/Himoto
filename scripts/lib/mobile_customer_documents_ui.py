"""Browser acceptance of paper-first customer entry and retained document photos."""
import base64
from copy import deepcopy
from playwright.sync_api import expect
from lib.mobile_record_media_fixture import image_blob
from lib.mobile_customer_matches_fixture import seed_duplicates


def run_document_workflows(page, state, base_url, output, checks):
    file = output / 'synthetic-documents-qa.jpg'
    file.write_bytes(image_blob())
    button = lambda label: page.get_by_role('button', name=label, exact=True)
    field = lambda label: page.get_by_role('textbox', name=label, exact=True)
    def choose(label, value): button(label).click(); button(value).click()
    def pick(label, count=1):
        with page.expect_file_chooser() as chooser: button(label).click()
        chooser.value.set_files([file]*count)
    page.context.route('https://mobile-api.example.invalid/mobile-identity-qr',lambda route:route.fulfill(content_type='text/html',body='<html><body>QR bridge fixture</body></html>'))
    def scan(name='Synthetic QA',during=None):
        button('Quét QR căn cước').click()
        frame=page.frame_locator('iframe[title="Camera quét QR căn cước"]').locator('body')
        expect(frame).to_contain_text('QR bridge fixture')
        if during:during()
        frame.evaluate('''(node,name)=>parent.postMessage(JSON.stringify({type:'himoto.identity-qr.v1',nonce:location.hash.slice(1),scan:{fields:{id_card:'001234567890',name,id_card_issued_on:'2022-06-05'},identifiers:['001234567890']}}),'*')''',name)
        expect(button('Quét QR căn cước')).to_be_visible()
    def new_contract(number):
        button('Thêm bản nháp').click(); field('Số hợp đồng giấy').fill(number)
        button('Bước 3: Phương tiện').click(); button('Thêm xe vào bản nháp').click(); button('Chọn xe QA-003').click()
        button('Bước 4: Chi phí').click(); field('Tổng giá trị hợp đồng (VND)').fill('1250000')
        button('Bước 2: Khách hàng').click(); button('Thêm khách trong hợp đồng').click()
    def leave_contract():
        page.go_back()
        if button('Rời bản nháp').count(): button('Rời bản nháp').click()
        expect(button('Thêm bản nháp')).to_be_visible()
    def save_profile():
        field('Số điện thoại').fill('0901111111');field('Địa chỉ').fill('Manual current address QA')
        button('Lưu khách hàng').click()
    def stage_save():
        button('Lưu ảnh vào đúng hồ sơ').click();button('Xác nhận lưu ảnh').click()
    page.goto(base_url);field('Tài khoản').fill('qa');page.get_by_label('Mật khẩu', exact=True).fill('fixture-password');button('Đăng nhập').click()
    page.get_by_role('tab', name='Hợp đồng', exact=True).click();new_contract('93001')
    expect(button('Giấy tờ')).to_have_attribute('aria-expanded', 'true')
    assert field('Số CCCD/CMND').evaluate('(node)=>node.getBoundingClientRect().top') < field('Họ và tên').evaluate('(node)=>node.getBoundingClientRect().top')
    pick('Chọn nhiều ảnh giấy tờ', 2)
    assert state.get('ocr_calls',0)==0
    scan(during=lambda:(page.locator('[aria-label="Họ và tên"]').fill('ManualDuringReadQA',force=True),page.locator('[aria-label="Địa chỉ"]').fill('Manual current address QA',force=True)))
    expect(field('Số CCCD/CMND')).to_have_value('001234567890')
    expect(field('Họ và tên')).to_have_value('ManualDuringReadQA')
    expect(field('Địa chỉ')).to_have_value('Manual current address QA')
    expect(button('Bỏ qua AI')).to_have_count(0)
    assert state.get('ocr_calls',0) == 0
    checks.append('Domestic document photos are retained without AI; bound QR result fills identity, preserves manual edits in flight and never fills current address')
    button('Bỏ ảnh id_back').click();button('Tiếp tục chỉnh sửa').click()
    expect(button('Bỏ ảnh id_back')).to_be_visible()
    button('Quay lại hợp đồng').click();button('Tiếp tục chỉnh sửa').click()
    expect(field('Họ và tên')).to_have_value('ManualDuringReadQA')
    expect(button('Bỏ ảnh id_front')).to_be_visible()
    checks.append('Discarding photos or leaving the customer form requires explicit confirmation; cancelling preserves all images and text')
    state['mode'] = 'doc-lost'
    save_profile()
    expect(page.get_by_role('heading', name='Hoàn tất ảnh khách hàng', exact=True)).to_be_visible()
    assert state['customer_creates'] == 1
    button('Quay lại biểu mẫu khách').click()
    expect(button('Lưu khách hàng')).to_be_disabled()
    expect(field('Họ và tên')).to_have_value('ManualDuringReadQA')
    button('Tiếp tục lưu ảnh khách hàng').click()
    stage_save()
    expect(button('Đối chiếu ảnh với máy chủ')).to_be_enabled()
    assert state['document_writes'] == 1 and state['customer_creates'] == 1
    first = deepcopy(next(iter(state['document_receipts'].values()))['receipt'])
    button('Đối chiếu ảnh với máy chủ').click()
    button('Đã kiểm tra phiếu ảnh').click()
    button('Tải lại ô ảnh, giữ ảnh đang chọn').click()
    stage_save()
    expect(field('Họ tên khách thuê')).to_have_value('ManualDuringReadQA')
    assert state['document_writes'] == 2 and state['customer_creates'] == 1
    assert state['document_receipts'][first['requestId']]['receipt'] == first
    checks.append('After create, returning keeps the exact saved profile locked; a lost photo commit reconciles original proof and uploads only remaining photos without creating again')
    button('Bước 1: Hợp đồng & pháp lý').click();expect(field('Số hợp đồng giấy')).to_have_value('93001')
    button('Bước 4: Chi phí').click();expect(field('Tổng giá trị hợp đồng (VND)')).to_have_value('1250000')
    button('Lưu nháp').click();expect(button('Tiếp tục soạn hợp đồng')).to_be_visible()
    saved = state['draft_profiles'][2001]['input']['draft']
    assert saved['customer_id'] == 100 and saved['vehicles'][0]['id'] == '303' and saved['total_amount'] == '1250000'
    checks.append('Completing images returns the exact customer to an unchanged contract; draft save binds ID, selected vehicle and money')
    leave_contract();new_contract('93002');seed_duplicates(state)
    pick('Chọn ảnh CCCD mặt trước');scan('DuplicateDocQA');expect(field('Họ và tên')).to_have_value('DuplicateDocQA')
    save_profile();expect(button('Dùng khách hàng #501')).to_be_visible()
    button('Dùng khách hàng #501').click()
    expect(page.get_by_role('heading', name='Hoàn tất ảnh khách hàng', exact=True)).to_be_visible()
    assert state['customer_creates'] == 1
    state['mode'] = 'doc-drop';stage_save()
    expect(page.get_by_text('QA chưa nhận được ảnh.', exact=True)).to_be_visible()
    expect(button('Đối chiếu ảnh với máy chủ')).to_be_enabled()
    old_key = state['delayed_document']['headers']['idempotency-key']
    button('Đối chiếu ảnh với máy chủ').click();button('Tải lại ô ảnh, giữ ảnh đang chọn').click()
    assert state['tombstones'][old_key] == 'media.customer:501'
    from lib.mobile_customer_documents_fixture import document_response
    delayed = state['delayed_document']
    assert document_response(delayed['path'], delayed['method'], delayed['body'], delayed['headers'], state)[0] == 409
    stage_save();expect(field('Họ tên khách thuê')).to_have_value('LocalQA')
    assert state['document_writes'] == 3 and state['customer_creates'] == 1
    checks.append('Duplicate selection retains captured photos for the chosen profile; a dropped upload is tombstoned before retry and its late delivery is rejected')
    leave_contract();new_contract('93003')
    state.pop('ocr_fields', None);state['ocr_failure'] = True
    pick('Chọn ảnh CCCD mặt trước')
    expect(page.get_by_text('Ảnh được giữ để lưu vào hồ sơ. Dùng Quét QR căn cước để điền thông tin, hoặc nhập bằng tay.', exact=True)).to_be_visible()
    expect(button('Bỏ ảnh id_front')).to_be_visible()
    field('Số CCCD/CMND').fill('001234567891');field('Họ và tên').fill('ForeignSelectionQA');save_profile()
    button('Dùng khách hàng #502').click()
    expect(page.get_by_role('heading', name='Hoàn tất ảnh khách hàng', exact=True)).to_be_visible()
    expect(button('Lưu ảnh vào đúng hồ sơ')).to_be_disabled()
    button('Bỏ ảnh đang chọn và tiếp tục với hồ sơ').click();button('Bỏ ảnh chưa lưu và tiếp tục').click()
    expect(field('Họ tên khách thuê')).to_have_value('OtherQA')
    assert state['document_writes'] == 3
    checks.append('Domestic photos never invoke AI even when the OCR service fails; manual entry and photos remain available and unauthorized photo writes remain blocked')
    leave_contract();new_contract('93004')
    pick('Chọn ảnh CCCD mặt trước');button('Quét QR căn cước').click()
    button('Đóng quét qr căn cước').click()
    field('Họ và tên').fill('SkipAiManualQA')
    expect(field('Họ và tên')).to_have_value('SkipAiManualQA')
    expect(field('Số CCCD/CMND')).to_have_value('')
    assert state.get('ocr_calls',0)==0
    checks.append('Cancelling the QR scanner retains images and manual text and makes no OCR request')
    for width, height, scheme in ((320,740,'light'),(375,812,'dark'),(390,844,'light'),(430,932,'dark')):
        page.set_viewport_size({'width':width,'height':height});page.emulate_media(color_scheme=scheme,reduced_motion='reduce')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
        button('Giấy tờ').scroll_into_view_if_needed();page.screenshot(path=str(output/f'documents-{width}-{scheme}.png'),full_page=True)
    checks.append('Paper-first controls, document previews and batch actions fit four phone widths in light/dark themes')
