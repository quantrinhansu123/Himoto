# Tài khoản cơ sở và thanh toán SePay

## Đăng nhập

Đăng nhập bằng tên tài khoản hoặc email. Mật khẩu khởi tạo được cấp riêng, không lưu trong Git. Không thay mật khẩu các tài khoản cũ.

| Tài khoản | Phạm vi | Quyền mặc định |
| --- | --- | --- |
| `nv.giapbat` | CS Giáp Bát | Hợp đồng, gia hạn, trả xe, chuyển/nhận xe |
| `nv.lang` | CS Láng | Như trên |
| `nv.nguyenhoang` | CS Nguyễn Hoàng | Như trên |
| `nv.hadong` | CS Hà Đông | Như trên |
| `nv.hangbut` | CS Hàng Bút | Như trên |
| `nv.thuesohuu` | CS Thuê sở hữu | Lập hợp đồng nháp, khách hàng, tra cứu xe |
| `ql.thuesohuu` | CS Thuê sở hữu | Hoàn tất & thanh toán, gia hạn, trả xe, chuyển/nhận xe |
| `hcns` | Toàn hệ thống | Nhân sự, lịch trực |
| `ketoan` | Toàn hệ thống | Sổ quỹ, tài khoản thu chi, tra cứu hợp đồng |
| `quantri` | Toàn hệ thống | Quản trị và tạo/phân quyền tài khoản |

Quản trị mở **Tài khoản & phân quyền** để tạo, khóa, đổi mật khẩu và chọn quyền. Tài khoản nhân viên cơ sở luôn gắn một cơ sở. Phân quyền được kiểm tra ở API và PostgreSQL RLS, bao gồm truy cập bằng ID trực tiếp.

## Test chuyển xe

1. Đăng nhập nhân viên cơ sở A, chọn một xe Lưu kho của A, bấm **Chuyển xe**, chọn B và xác nhận.
2. Xe chuyển sang **Chờ luân chuyển** và cơ sở hiện tại là B. Người chuyển không được nhận cùng lượt chuyển.
3. Đăng nhập nhân viên cơ sở B, mở xe và bấm **Nhận xe**. Xe chuyển về **Lưu kho**.
4. Mở **Lịch sử luân chuyển**, chọn ngày để xem cơ sở đi/đến, người chuyển, người nhận và các thay đổi. Lịch sử của từng xe vẫn được giữ.

## Biến môi trường

Điền trong `.env.local` khi chạy máy cá nhân; trên Vercel vào **Project → Settings → Environment Variables**, chọn Production và redeploy. Các biến dưới đây chỉ dùng trên server, không thêm tiền tố `NEXT_PUBLIC_`.

| Biến | Nội dung |
| --- | --- |
| `SEPAY_WEBHOOK_SECRET` | Chuỗi bí mật trùng API Key trong cấu hình webhook SePay |
| `SEPAY_BANK_CODE` | Mã ngân hàng/BIN tương ứng tài khoản nhận, ví dụ `VPB` |
| `SEPAY_ACCOUNT_NUMBER` | Số tài khoản nhận đúng với SePay |
| `SEPAY_ACCOUNT_NAME` | Tên chủ tài khoản |
| `SEPAY_BANK_ID` | ID ngân hàng ghi sổ HIMOTO; tài khoản demo đã tạo là `33` |
| `SEPAY_SERVICE_USER_ID` | ID người ghi nhận tự động; đã tạo là `150`, không được đăng nhập tương tác |
| `SEPAY_MODE` | `test` để thử; chỉ bật `live` khi tài khoản ghi sổ đã được đối chiếu |

Tài khoản ngân hàng demo hiện có loại chủ tài khoản **chưa xác định**, không tự coi là tài khoản công ty hoặc sinh dữ liệu VAT. Khi chuyển live, đối chiếu loại chủ tài khoản và cơ sở sở hữu; sai tài khoản/phạm vi thì giao dịch chuyển sang chờ đối chiếu, không tự ghi sổ.

## Cấu hình webhook SePay

- URL: `https://himoto.vercel.app/api/webhooks/sepay`
- Phương thức: POST; thông báo tiền vào đúng tài khoản đã cấu hình.
- Bảo mật: **API Key**, dùng cùng giá trị `SEPAY_WEBHOOK_SECRET`. SePay gửi header `Authorization: Apikey <giá trị>`.
- Thành công trả HTTP 200 và `{"success":true}`. Gửi lại cùng giao dịch không thu trùng.
- Nút **Gửi thử** dùng dữ liệu mẫu (`id=0`): HIMOTO xác thực API key rồi trả thành công, không mở kết nối ghi sổ và không cập nhật hợp đồng. Đây là kiểm tra kết nối; để thử thông báo thanh toán, dùng giao dịch mô phỏng trong Test mode SePay.
- Tài liệu chính thức: [Webhook](https://docs.sepay.vn/tich-hop-webhooks.html), [mô phỏng giao dịch](https://developer.sepay.vn/vi/tien-ich-khac/test-mode/mo-phong-tao-ma-vietqr).

`SEPAY_MODE=test` chỉ ngăn HIMOTO ghi tiền thật; nó không biến số tài khoản ngân hàng thật thành tài khoản giả lập. Dùng Test mode và nút mô phỏng giao dịch trên SePay. QR luôn chứa số tài khoản đã cấu hình.

## Test thanh toán

1. Mở hợp đồng đã phát hành và còn phải thu → **Nhập phiếu chi**. Đây là thao tác tạo QR **thu tiền hợp đồng**, theo nghiệp vụ đã xác nhận.
2. Mặc định số tiền là tổng hợp đồng còn phải thu (trừ phần đã thu); có thể sửa giảm. Mở QR không ghi thu/chi.
3. Nội dung: `Thanh toán cho hợp đồng [Mã hợp đồng]`. Khi tạo VietQR, nội dung được bỏ dấu cho ngân hàng.
4. QR xuất hiện trên form và cuối bản in hợp đồng. Không tạo QR cho hợp đồng nháp/hủy hoặc đã thu đủ.
5. Trong SePay, mô phỏng tiền vào với đúng tài khoản, số tiền và nội dung. Ở `test`, HIMOTO báo giao dịch demo, giữ nguyên công nợ và Sổ quỹ.
6. Trong menu tài khoản bật **Bật âm báo tiền**. Thông báo và trạng thái được cập nhật mỗi 4 giây khi trang đang hiển thị.
7. Với `live`, tiền vào hợp lệ tự tạo phiếu thu và cập nhật đã thu. Tiền ra, nội dung không khớp/khớp nhiều hợp đồng, số tiền vượt nợ hoặc tài khoản không hợp lệ không tự ghi thu. Sự kiện được lưu để đối chiếu.

API chỉ đọc `/api/auth/payment-events?after=0` cho tài khoản có quyền hợp đồng, theo phạm vi cơ sở; quản trị/kế toán toàn hệ thống xem được cả sự kiện cần đối chiếu.

## Kiểm tra kỹ thuật

```powershell
npm.cmd run test:login
npm.cmd run test:account-scope
npm.cmd run test:scoped-pool
npm.cmd run test:sepay
npm.cmd run test:vehicle-transfers
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

Test phân quyền dùng schema riêng rồi rollback; test tài chính dùng bảng TEMP. Test kết nối dùng truy vấn chỉ đọc qua Supabase transaction pool, với scope và role đặt trong từng transaction. Không chỉnh hợp đồng, xe, số dư hoặc sequence nghiệp vụ thật.

Hai migration trước khi chạy bản mới: `docs/sql/2026-10-17-account-access.sql` và `docs/sql/2026-10-17-sepay-events.sql`. Đã áp dụng cho cơ sở dữ liệu của dự án khi triển khai tính năng.
