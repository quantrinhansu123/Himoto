# Thanh toán hợp đồng và Hợp đồng VAT

Cập nhật 08/10/2026. `/contracts` có nút **Thanh toán** cho hợp đồng Đang thuê, Quá hạn, Chờ thanh toán và Nợ xấu. Chi tiết hợp đồng đã phát hành có **Thanh toán / Lịch sử** để tra phiếu kể cả khi không còn được thu thêm.

Mỗi lần thu tạo một `transactions` loại `in`, trạng thái `approved`, gắn `order_id`, cơ sở của hợp đồng và người đăng nhập. `orders.pid` (Tổng đã thu) tăng đúng số tiền đó. Cho phép thanh toán nhiều lần, mỗi lần có ID phiếu riêng. Không thu vượt phần còn thiếu `max(total - pid, 0)`; số liệu thiếu/sai, nháp và trạng thái chưa được phép thu đều bị chặn.

Nội dung tự điền **`Gia hạn hợp đồng_<mã hợp đồng>`**, có thể chỉnh trước khi gửi. Đây là nội dung phiếu thu/chuyển khoản; thao tác thanh toán không tự thay ngày hẹn trả, phát hành gia hạn, đổi trạng thái hợp đồng hoặc sửa tiền cọc.

## Tài khoản nhận và VAT

- Tiền mặt: két đang hoạt động đúng cơ sở hợp đồng.
- Chuyển khoản: tài khoản nhận Thu hoặc Thu & Chi đang hoạt động đúng cơ sở, không thuộc nhóm Công ty.
- CK tài khoản công ty: tài khoản ngân hàng được cấu hình rõ `owner_type='company'`, đang hoạt động và nhận Thu/Thu & Chi. Dùng được từ mọi cơ sở. Tài khoản dùng chung lưu `store_id=0` theo quy ước Cửa hàng tổng của nguồn cũ; phiếu vẫn ghi cơ sở của hợp đồng.
- Không suy loại Công ty từ tên chủ tài khoản. Thông tin ngân hàng thực tế được cấu hình trong CSDL, không hardcode trong mã nguồn/tài liệu công khai.

Sau khi xác nhận khoản thu công ty, giao diện chuyển đến `/contracts/vat?contract_id=<id>`. Hợp đồng vẫn có trong danh sách chung. Bảng VAT lấy hợp đồng có phiếu Thu được duyệt với snapshot `bank_owner_type='company'`; có cột Đã thu vào TK công ty, bộ lọc và bộ đếm như danh sách chung. Gỡ lọc hợp đồng để xem toàn bộ danh sách VAT.

Danh sách này phục vụ theo dõi hợp đồng có khoản thu công ty. Không tự tạo hóa đơn, số hóa đơn, thuế suất hoặc ghi `accounting_vat_documents` khi chưa có chứng từ.

## Giao dịch và chống thu trùng

Chạy migration [2026-10-08-contract-payments.sql](sql/2026-10-08-contract-payments.sql) trước khi bật POST thanh toán. Bảng mới `management_contract_payments` chỉ lưu UUID lần thu, liên kết hợp đồng/phiếu/người thực hiện và SHA-256 của yêu cầu; bật RLS, thu hồi quyền anon/authenticated.

API `/api/auth/order/car-rental/[id]/payments` GET/POST yêu cầu phiên admin hợp lệ; POST kiểm tra cùng nguồn, lấy người thực hiện từ session. Không nhận actor, tổng đã thu hay trạng thái do trình duyệt cung cấp. Khóa UUID, khóa hàng hợp đồng và revision `xmin`, kiểm tra lại tài khoản trước ghi. Phiếu Thu, cập nhật `pid` và UUID được COMMIT cùng nhau; lỗi thì ROLLBACK.

Gửi lại cùng UUID/nội dung trả về phiếu đã có, kể cả revision đã đổi. Dùng UUID cho nội dung khác bị từ chối. Trình duyệt lưu lần thu đang gửi trong `sessionStorage` trước POST; mất phản hồi giữ nguyên nội dung và UUID để thử lại qua đóng/mở hoặc tải lại trang trong cùng tab. Lỗi rõ ràng 4xx tải lại số liệu trước khi cho sửa. Không tự báo thành công hoặc cộng tiền khi chưa xác nhận.

Không sửa giá, tổng phí, cọc, trạng thái hợp đồng, số dư đầu kỳ hoặc lịch sử phiếu cũ. Số dư ngân hàng/két vẫn dựa vào giao dịch và số dư đầu kỳ; không cộng thêm lần thứ hai vào một cột số dư.

## Kiểm chứng

```powershell
npm.cmd run test:contract-payments
node scripts/check-contract-payments.cjs --live-temp
npm.cmd run test:cashbook
npm.cmd run lint
npm.cmd run build
python scripts/check-contract-payments-ui.py --session-cookie-file .backups/contract-payments/qa-session.txt
```

TEMP dùng identity riêng trước INSERT, thay toàn bộ tên bảng vận hành trong truy vấn và outer ROLLBACK. Browser giả lập mọi `/api/**`; kiểm tra thu từng phần, thu trùng khi mất mạng/tải lại, revision, công ty dùng chung, chuyển bảng VAT, 12 cột Thu/Chi, liên kết hợp đồng và 1440/375px. Không tạo phiếu QA trên bảng vận hành. Cookie và ảnh/kết quả cục bộ nằm trong `.backups/` được Git ignore.

Kết quả/ảnh tổng hợp không chứa dữ liệu vận hành: [6 nhóm UI](qa/contract-payments/results.json), [desktop](qa/contract-payments/desktop-payment.png), [mobile](qa/contract-payments/mobile-company-payment.png), [Hợp đồng VAT](qa/contract-payments/mobile-vat.png).
