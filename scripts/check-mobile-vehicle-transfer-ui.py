"""Transfer editor acceptance; actor-bound intercepted synthetic API only."""
import argparse
import hashlib
import json
import re
from copy import deepcopy
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect,sync_playwright
from lib.mobile_vehicle_transfer_fixture import seed_state,response,record

def run(base_url,output):
    output.mkdir(parents=True,exist_ok=True)
    state=seed_state();checks=[];calls=[];errors=[];unexpected=[]
    source={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for folder in (Path("mobile/src"),Path("shared")) for p in folder.rglob("*") if p.suffix in (".ts",".tsx")}
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch()
        context=browser.new_context(viewport={"width":375,"height":812},color_scheme="light",reduced_motion="reduce")
        def intercept(route):
            request=route.request;url=urlparse(request.url)
            if url.netloc==urlparse(base_url).netloc:return route.continue_()
            if url.hostname!="mobile-api.example.invalid":unexpected.append(url.hostname);return route.abort()
            headers={"Access-Control-Allow-Origin":base_url.rstrip("/"),"Access-Control-Allow-Headers":"authorization,content-type,idempotency-key","Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS"}
            if request.method=="OPTIONS":return route.fulfill(status=204,headers=headers)
            body=request.post_data_json if request.post_data else {}
            calls.append({"path":url.path,"method":request.method,"key":request.headers.get("idempotency-key")})
            status,data,lost=response(request.url,request.method,body,request.headers,state)
            if state.get('legacyReply') and url.path.startswith('/api/mobile/v1/vehicle-transfers/requests/') and data.get('receipt'):
                data=deepcopy(data)
                data['receipt']['review']['vehicle'].pop('ownerStoreId',None);data['receipt']['review']['vehicle'].pop('ownerStoreName',None)
                data['receipt']['review']['after'].pop('ownerStoreId',None)
            if status==404:unexpected.append(url.path)
            if lost:return route.abort("failed")
            route.fulfill(status=status,headers=headers,json=data)
        context.route("**/*",intercept)
        page=context.new_page();page.set_default_timeout(18000);page.on("pageerror",lambda error:errors.append(str(error)))
        def button(name):return page.get_by_role("button",name=name,exact=True)
        def heading(name):return page.get_by_role("heading",name=name,exact=True)
        def tab(name):return page.get_by_role("tab",name=name,exact=True)
        def back():page.get_by_role("link",name=re.compile(r", back$")).click()
        def tabs():
            for _ in range(4):
                expect(tab('Đội xe').or_(page.get_by_role('link',name=re.compile(r', back$'))).first).to_be_visible()
                if tab('Đội xe').is_visible():break
                previous=page.url;back();page.wait_for_url(lambda value:str(value)!=previous)
            expect(tab("Đội xe")).to_be_visible()
        def login(name="qa"):
            page.get_by_role("textbox",name="Tài khoản",exact=True).fill(name)
            page.get_by_label("Mật khẩu",exact=True).fill("fixture-password");button("Đăng nhập").click();expect(tab("Đội xe")).to_be_visible()
        def logout():tabs();tab("Tài khoản").click();button("Đăng xuất").click();expect(button("Đăng nhập")).to_be_visible()
        def open_editor(vehicle,pending=False):
            tabs();tab("Đội xe").click()
            button(f"Xem QA-TRANSFER-{vehicle}, Xe điều chuyển QA {vehicle}").click()
            button("Điều chuyển và nhận xe").click()
            expect(heading("Thao tác kho đang chờ đối chiếu" if pending else "1. Chọn thao tác kho")).to_be_visible()
        def transfer(destination="Kho nhận QA"):
            button("Chuyển kho").click();page.get_by_role("radio",name="Chọn kho đến "+destination,exact=True).click()
        def review():button("Rà soát thao tác kho").click();expect(heading("3. Rà soát thao tác kho")).to_be_visible()
        def commit(action="chuyển kho"):button("Ghi thao tác kho").click();button("Xác nhận "+action).click()
        def acknowledge():button("Xác nhận đã kiểm tra phiếu kho").click();page.wait_for_url(re.compile(r"/record/vehicles/[1-9][0-9]*$"));tabs()
        def leave():
            previous=page.url;back();button('Rời bước điều chuyển').click()
            page.wait_for_url(lambda value:str(value)!=previous);tabs()
        try:
            page.goto(base_url);login();open_editor(7101);button("Chuyển kho").click()
            page.get_by_role("radio",name="Chọn kho đến Kho nhận QA",exact=True).click()
            button("Trang cơ sở tiếp").click()
            expect(page.get_by_text("Trang kho 2",exact=True)).to_be_visible()
            expect(page.get_by_text("Kho đã chọn: Kho nhận QA",exact=True)).to_be_visible()
            page.get_by_role("textbox",name="Tìm kho đến",exact=True).fill("_%");button("Tìm cơ sở nhận").click()
            page.get_by_role("radio",name="Chọn kho đến Kho_% QA",exact=True).click()
            page.get_by_role("textbox",name="Ghi chú thao tác kho",exact=True).fill("  Lượt chuyển QA  ");review()
            expect(page.get_by_text('Cơ sở sở hữu trước: Kho đi QA',exact=True)).to_be_visible()
            expect(page.get_by_text('Cơ sở sở hữu sau: Kho_% QA',exact=True)).to_be_visible()
            assert state["writes"]==0 and not state["requests"] and not any(call["key"] for call in calls)
            button("Ghi thao tác kho").click();button("Tiếp tục chỉnh sửa").click()
            back();button("Tiếp tục chỉnh sửa").click();expect(heading("3. Rà soát thao tác kho")).to_be_visible()
            for width,height,scheme in [(375,812,"light"),(430,932,"dark"),(812,375,"light"),(1024,768,"dark")]:
                page.set_viewport_size({"width":width,"height":height});page.emulate_media(color_scheme=scheme)
                button("Ghi thao tác kho").scroll_into_view_if_needed()
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
                assert button("Ghi thao tác kho").bounding_box()["height"]>=48
                page.screenshot(path=str(output/f"review-{width}-{scheme}.png"),full_page=True)
            page.set_viewport_size({"width":375,"height":812});page.emulate_media(color_scheme="light")
            commit();expect(heading("Chuyển kho đã được ghi nhận")).to_be_visible()
            sender_proof=next(iter(state["requests"].values()))["receipt"];sender_key=sender_proof["requestId"]
            assert state["writes"]==1 and sender_proof["review"]["toStore"]["id"]==232 and sender_proof["review"]["note"]=="Lượt chuyển QA"
            assert state["vehicles"]["7101"]["status"]=="in_transit"
            assert sender_proof['review']['vehicle']['ownerStoreId']==23 and sender_proof['review']['after']['ownerStoreId']==232
            assert state['vehicles']['7101']['ownerStoreId']==232
            page.screenshot(path=str(output/"sender-original-receipt.png"),full_page=True)
            checks.append("Pagination preserves destination; literal search, trim, readonly/no UUID review, cancelled write/back dialogs and four responsive light/dark viewports; one dispatch receipt")
            previous=page.url;back();page.wait_for_url(lambda value:str(value)!=previous)
            tabs();logout();login("qa-receiver")
            tab("Tài khoản").click();expect(page.get_by_text("Không có thao tác chờ đối chiếu trong phạm vi này.",exact=True)).to_be_visible()
            open_editor(7101);expect(button("Hủy điều chuyển")).to_be_disabled();button("Nhận xe").click();review();commit("nhận xe")
            expect(heading("Nhận xe đã được ghi nhận")).to_be_visible();acknowledge()
            assert state["writes"]==2 and state["vehicles"]["7101"]["storeId"]==232 and state["vehicles"]["7101"]["status"]=="ready"
            logout();login();tab("Tài khoản").click();button("Đối chiếu chuyển kho #7101").click();button("Đối chiếu với máy chủ").click();button("Mở kết quả chuyển kho #7101").click()
            expect(heading("Chuyển kho đã được ghi nhận")).to_be_visible()
            expect(page.get_by_text(re.compile(sender_key))).to_be_visible()
            expect(page.get_by_text("Xe hoặc lượt chuyển đã được xử lý tiếp hay chỉnh sửa. Đây là phiếu gốc; kiểm tra trạng thái hiện tại trước thao tác mới.",exact=True)).to_be_visible()
            assert next(row for row in state["requests"].values() if row["key"]==sender_key)["receipt"]==sender_proof
            state['legacyReply']=True;button('Tải lại phiếu kho').click()
            expect(page.get_by_text('Phiếu cũ không lưu cơ sở sở hữu trước/sau.',exact=True)).to_be_visible()
            expect(page.get_by_text(re.compile('^Cơ sở sở hữu (trước|sau):'))).to_have_count(0)
            assert next(row for row in state['requests'].values() if row['key']==sender_key)['receipt']==sender_proof
            page.screenshot(path=str(output/'legacy-ownership-free-receipt.png'),full_page=True)
            state['legacyReply']=False;button('Tải lại phiếu kho').click()
            expect(page.get_by_text('Cơ sở sở hữu trước: Kho đi QA',exact=True)).to_be_visible()
            acknowledge();checks.append("Actor switch hides sender key from receiver, blocks foreign cancel, permits receipt; original sender recovers unchanged proof with later-resolution warning")

            open_editor(7102);transfer();review();expect(page.get_by_text("Xe chuyển kho ngay và giữ nguyên trạng thái hiện tại.",exact=True)).to_be_visible()
            expect(page.get_by_text('Cơ sở sở hữu trước: Cơ sở QA 01',exact=True)).to_be_visible()
            expect(page.get_by_text('Cơ sở sở hữu sau: Kho nhận QA',exact=True)).to_be_visible();commit()
            expect(heading("Chuyển kho đã được ghi nhận")).to_be_visible()
            assert state["vehicles"]["7102"]["status"]=="using" and state["vehicles"]["7102"]["storeId"]==24
            assert len(list(state["requests"].values())[-1]["receipt"]["events"])==2
            assert state['vehicles']['7102']['ownerStoreId']==24
            acknowledge();checks.append("Nonready stock transfers immediately, retains using status and shows both immutable dispatch/automatic receive events")

            open_editor(7103);transfer();state["pageError"]=True;button("Trang cơ sở tiếp").click()
            expect(page.get_by_text("Lỗi tải trang kho QA.",exact=True)).to_be_visible();expect(button("Rà soát thao tác kho")).to_be_disabled()
            expect(page.get_by_text("Kho đã chọn: Kho nhận QA",exact=True)).to_be_visible()
            state["pageError"]=False;button("Tải lại kho đến").click();review();leave()
            checks.append("Destination fetch failure retains selection and disables review until explicit successful retry")

            open_editor(7104);transfer();review();state["mode"]="lost";commit()
            expect(heading("Thao tác kho đang chờ đối chiếu")).to_be_visible();expect(button("Mở phiếu chuyển kho")).to_be_enabled()
            lost=list(state["requests"].values())[-1]["receipt"];before=state["writes"];leave()
            open_editor(7104,pending=True);expect(button("Ghi thao tác kho")).to_have_count(0)
            button("Mở phiếu chuyển kho").click();expect(heading("Chuyển kho đã được ghi nhận")).to_be_visible()
            expect(page.get_by_text(re.compile(lost["requestId"]))).to_be_visible();acknowledge();assert state["writes"]==before
            checks.append("Lost response locks every action for that vehicle across navigation; reopened editor retrieves exact committed UUID with no duplicate write")

            open_editor(7105);transfer();page.get_by_role("textbox",name="Ghi chú thao tác kho",exact=True).fill("Giữ ghi chú khi chưa gửi");review();state["mode"]="drop";commit()
            expect(heading("Thao tác kho đang chờ đối chiếu")).to_be_visible();button("Đối chiếu chuyển kho").click();button("Đối chiếu với máy chủ").click()
            expect(heading("2. Chuyển kho")).to_be_visible();expect(page.get_by_role("textbox",name="Ghi chú thao tác kho",exact=True)).to_have_value("Giữ ghi chú khi chưa gửi")
            delayed=state["delayed"][-1];assert record(state,state["vehicles"]["7105"],delayed["body"],delayed["key"],delayed["actorId"])[0]==409
            review();commit();expect(heading("Chuyển kho đã được ghi nhận")).to_be_visible();acknowledge()
            checks.append("Unsent request reconciles to a tombstone, rejects late delivery and retains destination/note for explicit review under a fresh UUID")

            open_editor(7106);transfer();review();commit();expect(heading("Chuyển kho đã được ghi nhận")).to_be_visible();acknowledge()
            open_editor(7106);expect(button("Nhận xe")).to_be_disabled();expect(button("Từ chối điều chuyển")).to_be_disabled()
            button("Hủy điều chuyển").click();review();commit("hủy điều chuyển");expect(heading("Hủy điều chuyển đã được ghi nhận")).to_be_visible();acknowledge()
            assert state["vehicles"]["7106"]["storeId"]==23 and state["vehicles"]["7106"]["status"]=="ready"
            assert state['vehicles']['7106']['ownerStoreId']==23
            checks.append("Creator cannot receive/reject their own dispatch; cancel restores ready stock to the original warehouse with linked cancellation proof")

            open_editor(7107);transfer();review();commit();expect(heading("Chuyển kho đã được ghi nhận")).to_be_visible();acknowledge();logout();login("qa-receiver")
            open_editor(7107);button("Từ chối điều chuyển").click();review();commit("từ chối điều chuyển")
            expect(heading("Từ chối điều chuyển đã được ghi nhận")).to_be_visible();acknowledge()
            assert state["vehicles"]["7107"]["storeId"]==23 and state["vehicles"]["7107"]["status"]=="ready"
            assert state['vehicles']['7107']['ownerStoreId']==23
            logout();login();checks.append("Independent receiver rejection restores original ready stock; both actors acknowledge only their own receipts")

            open_editor(7108);transfer();state["vehicles"]["7108"]["revision"]="101";button("Rà soát thao tác kho").click()
            expect(page.get_by_text("Thông tin xe QA đã thay đổi. Tải lại xe.",exact=True)).to_be_visible()
            button("Tải lại để nhập lại").click();button("Tải lại và nhập lại").click();expect(heading("1. Chọn thao tác kho")).to_be_visible();transfer();review()
            state["mode"]="conflict";before=state["writes"];commit();expect(heading("Thao tác kho đang chờ đối chiếu")).to_be_visible();assert state["writes"]==before
            button("Đối chiếu chuyển kho").click();button("Đối chiếu với máy chủ").click();expect(heading("2. Chuyển kho")).to_be_visible()
            button("Tải lại để nhập lại").click();button("Tải lại và nhập lại").click();expect(heading("1. Chọn thao tác kho")).to_be_visible()
            transfer();review();commit();expect(heading("Chuyển kho đã được ghi nhận")).to_be_visible();acknowledge()
            checks.append("Stale preview has no write key; stale confirmed write is locked and reconciled before explicit reset uses current revisions")
            open_editor(7109);expect(button("Chuyển kho")).to_be_disabled();back();tabs()
            open_editor(7110);transfer();review();state["mode"]="drop";commit();expect(heading("Thao tác kho đang chờ đối chiếu")).to_be_visible();leave();logout()
            state["scopes"]["7"]=True;login();open_editor(7110,pending=True)
            button("Đối chiếu chuyển kho").click();button("Đối chiếu với máy chủ").click();expect(heading("1. Chọn thao tác kho")).to_be_visible()
            back();tabs();tab("Tài khoản").click();expect(page.get_by_text("Không có thao tác chờ đối chiếu trong phạm vi này.",exact=True)).to_be_visible()
            logout();checks.append("Sold stock is blocked; actor scope change retains original pending action and reopening/reconciliation clears it without new dispatch; final ledger empty and logout acknowledged")
            assert not errors and not unexpected,{"errors":errors,"unexpected":unexpected}
            assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest()==sha for p,sha in source.items())
        except Exception:
            page.screenshot(path=str(output/"failure.png"),full_page=True)
            (output/"failure.txt").write_text(page.locator("body").inner_text(),encoding="utf-8")
            raise
        finally:
            (output/"summary.json").write_text(json.dumps({"passed":len(checks),"checks":checks,"writes":state["writes"],"fixtureOnly":True,"errors":errors,"unexpected":unexpected,"source":source},ensure_ascii=False,indent=2),encoding="utf-8")
            context.close();browser.close()
    print(json.dumps({"passed":len(checks),"checks":checks,"writes":state["writes"],"fixtureOnly":True},ensure_ascii=False,indent=2))
if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--base-url",default="http://127.0.0.1:8083");parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args();run(args.base_url,args.output)
