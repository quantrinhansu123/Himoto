# Thanh toán hợp đồng và Hợp đồng VAT

Cập nhật 08/10/2026. `/contracts` có nút **Thanh toán** cho hợp đồng Đang thuê, Quá hạn, Chờ thanh toán và Nợ xấu. Chi tiết hợp đồng đã phát hành có **Thanh toán / Lịch sử** để tra phiếu kể cả khi không còn được thu thêm.

Mỗi lần thu tạo một `transactions` loại `in`, trạng thái `approved`, gắn `order_id`, cơ sở của hợp đồng và người đăng nhập. Cho phép thanh toán nhiều lần, mỗi lần có ID phiếu riêng. Có hai nghiệp vụ:

- **Thu công nợ còn thiếu:** tăng `orders.pid` đúng số tiền thu; không vượt `max(total - pid, 0)`. Không đổi phí hoặc ngày trả.
- **Thu tiền gia hạn:** dành cho Đang thuê/Quá hạn, chọn một xe chưa trả, nhập phí nguyên VNĐ và ngày hẹn trả mới sau ngày hiện tại của xe. Tăng cả `orders.total` và `orders.pid` đúng phí mới, nên công nợ cũ giữ nguyên; cộng `order_vehicle_details.total_renewal_amount` và đổi ngày trả của xe đã chọn. Các xe khác giữ nguyên. Hợp đồng đã trả đủ hoặc có tổng đã thu lớn hơn tiền kỳ cũ vẫn gia hạn được. Mỗi xe/lần gia hạn có một phiếu riêng.

Khi không còn công nợ và có xe được gia hạn, hộp thoại tự chọn **Thu tiền gia hạn**. Số liệu tiền thiếu/sai, nháp, xe đã trả/xóa, ngày không tăng và trạng thái không phù hợp đều bị chặn. Ngày trả chung dùng ngày lớn nhất của các chi tiết còn hiệu lực nếu parent trống; parent có ngày chỉ được tăng, không giảm ngày của xe khác.

Ô số tiền tự thêm dấu chấm hàng nghìn khi gõ/dán, ví dụ `1.000.000`; nội dung gửi API và lưu để thử lại vẫn là chuỗi số nguyên `1000000`.

Nội dung tự điền **`Gia hạn hợp đồng_<mã hợp đồng>`**, có thể chỉnh trước khi gửi. Thao tác ghi nhận tiền đã nhận; không thực hiện chuyển tiền hoặc tự xác minh ngân hàng. Không đổi trạng thái hợp đồng hay tiền cọc, không tính lại các khoản gia hạn/thu lịch sử.

## Tài khoản nhận và VAT

- Tiền mặt: két đang hoạt động đúng cơ sở hợp đồng.
- Chuyển khoản: tài khoản nhận Thu hoặc Thu & Chi đang hoạt động đúng cơ sở, không thuộc nhóm Công ty.
- CK tài khoản công ty: tài khoản ngân hàng được cấu hình rõ `owner_type='company'`, đang hoạt động và nhận Thu/Thu & Chi. Dùng được từ mọi cơ sở. Tài khoản dùng chung lưu `store_id=0` theo quy ước Cửa hàng tổng của nguồn cũ; phiếu vẫn ghi cơ sở của hợp đồng.
- Không suy loại Công ty từ tên chủ tài khoản. Thông tin ngân hàng thực tế được cấu hình trong CSDL, không hardcode trong mã nguồn/tài liệu công khai.

**Chuyển khoản / CK tài khoản công ty:** nhập số tiền và tài khoản rồi bấm **Hiện mã QR chuyển khoản**. Bước này chỉ hiện QR, không gọi POST, không lưu phiếu/gia hạn hoặc chuyển bảng VAT. QR giữ tài khoản và số tiền, nội dung không dấu hiển thị rõ ở dưới mã. Có Quay lại để sửa; Đóng không ghi dữ liệu. Sau khi kiểm tra tiền đã vào, chọn **Tôi đã kiểm tra tài khoản và nhận đủ…** rồi bấm **Xác nhận đã nhận tiền** mới ghi phiếu và ngày gia hạn. Tiền mặt vẫn ghi nhận trực tiếp. Mất phản hồi sau xác nhận giữ UUID để thử lại.

QR dùng [VietQR Quick Link](https://www.vietqr.io/en/danh-sach-api/link-tao-ma-nhanh/) và danh sách công khai [ngân hàng hỗ trợ](https://api.vietqr.io/v2/banks), đối chiếu chính xác BIN/tên/code. Directory công khai lưu ở `vietqr-banks.json`, cập nhật 08/10/2026; chỉ nhận alias khớp, không đoán ngân hàng. Tài khoản thật lấy trường có cấu trúc từ DB, không tách bằng dấu phân cách trong label. Tên chủ tài khoản/số tiền/nội dung truyền sang dịch vụ tạo ảnh khi mở QR; không gửi giấy tờ khách hàng hay phiên đăng nhập. Nội dung QR không dấu, bỏ ký tự đặc biệt, tối đa 50 ký tự; nội dung phiếu gốc giữ nguyên. QR lỗi tải có nút tải lại và thông tin tài khoản để chuyển thủ công. Hệ thống chưa có kết nối xác nhận tiền vào từ ngân hàng.

Sau khi xác nhận khoản thu công ty, giao diện chuyển đến `/contracts/vat?contract_id=<id>`. Hợp đồng vẫn có trong danh sách chung. Bảng VAT lấy hợp đồng có phiếu Thu được duyệt với snapshot `bank_owner_type='company'`; có cột Đã thu vào TK công ty, bộ lọc và bộ đếm như danh sách chung. Gỡ lọc hợp đồng để xem toàn bộ danh sách VAT.

Danh sách này phục vụ theo dõi hợp đồng có khoản thu công ty. Không tự tạo hóa đơn, số hóa đơn, thuế suất hoặc ghi `accounting_vat_documents` khi chưa có chứng từ.

## Giao dịch và chống thu trùng

Chạy migration [2026-10-08-contract-payments.sql](sql/2026-10-08-contract-payments.sql) và [2026-10-08-contract-renewals.sql](sql/2026-10-08-contract-renewals.sql) trước khi bật tính năng. `management_contract_payments` lưu UUID lần thu, liên kết hợp đồng/phiếu/người thực hiện, SHA-256 yêu cầu và `renewal_payload` cho lần gia hạn: xe, ngày trả trước/sau, phí và tổng đã thu trước/sau. Bảng bật RLS, thu hồi quyền anon/authenticated. Migration gia hạn chỉ thêm cột JSONB nullable, không cập nhật dữ liệu vận hành.

API `/api/auth/order/car-rental/[id]/payments` GET/POST yêu cầu phiên admin hợp lệ; POST kiểm tra cùng nguồn, lấy người thực hiện từ session. Không nhận actor, tổng đã thu hay trạng thái do trình duyệt cung cấp. Khóa UUID, hàng hợp đồng và revision `xmin`; gia hạn khóa thêm hàng chi tiết xe và kiểm tra revision riêng; kiểm tra lại tài khoản trước ghi. Phiếu Thu, phí, ngày trả và UUID được COMMIT cùng nhau; lỗi thì ROLLBACK toàn bộ. Phiếu gia hạn có `name='order:renewal'`, `order_item_id` và liên kết chi tiết xe; Sổ quỹ hiển thị lý do **Thu tiền gia hạn**.

Gửi lại cùng UUID/nội dung trả về phiếu đã có, kể cả revision đã đổi. Dùng UUID cho nội dung khác bị từ chối. Trình duyệt lưu lần thu đang gửi trong `sessionStorage` trước POST; mất phản hồi giữ nguyên nội dung và UUID để thử lại qua đóng/mở hoặc tải lại trang trong cùng tab. Lỗi rõ ràng 4xx tải lại số liệu trước khi cho sửa. Không tự báo thành công hoặc cộng tiền khi chưa xác nhận.

Không suy giá gia hạn từ giá xe hoặc lịch sử. Chỉ cộng phí mới được nhập rõ; giữ giá thuê ban đầu, cọc, trạng thái, số dư đầu kỳ và phiếu cũ. Số dư ngân hàng/két vẫn dựa vào giao dịch và số dư đầu kỳ; không cộng thêm lần thứ hai vào một cột số dư. Không dùng tổng phiếu lịch sử để sửa lại `pid` khi dữ liệu cũ lệch nhau.

## Kiểm chứng

```powershell
npm.cmd run test:contract-payments
node scripts/check-contract-payments.cjs --live-temp
npm.cmd run test:cashbook
npm.cmd run lint
npm.cmd run build
python scripts/check-contract-payments-ui.py --session-cookie-file .backups/contract-payments/qa-session.txt
```

11 nhóm dữ liệu TEMP dùng identity riêng trước INSERT, thay toàn bộ tên bảng vận hành trong truy vấn và outer ROLLBACK. Browser giả lập mọi `/api/**` và ảnh QR; kiểm tra thu từng phần, thu trùng khi mất mạng/tải lại, revision, công ty dùng chung, chuyển bảng VAT, 12 cột Thu/Chi, liên kết hợp đồng và 1440/375px. Mở QR/Quay lại không ghi tiền hoặc gia hạn; bắt buộc xác nhận đã nhận tiền trước POST. Ảnh VietQR riêng với tài khoản ví dụ công khai đã được giải mã kiểm tra BIN, tài khoản, số tiền, nội dung và CRC. Gia hạn được kiểm tra với số liệu kiểu legacy đã thu vượt phí cũ, nhiều xe, ngày sai, xe sai/đã trả, rollback sau khi ghi phiếu/chi tiết, công nợ cũ không đổi và retry không gia hạn hai lần. Không tạo phiếu QA trên bảng vận hành. Cookie và kết quả cục bộ nằm trong `.backups/` được Git ignore.

Kết quả/ảnh tổng hợp không chứa dữ liệu vận hành: [9 nhóm UI](qa/contract-payments/results.json), [thu công nợ](qa/contract-payments/desktop-payment.png), [QR desktop](qa/contract-payments/desktop-transfer-qr.png), [QR mobile](qa/contract-payments/mobile-transfer-qr.png), [Hợp đồng VAT](qa/contract-payments/mobile-vat.png). QR trong ảnh UI là giả lập có chữ QA ONLY; không dùng để chuyển tiền.
