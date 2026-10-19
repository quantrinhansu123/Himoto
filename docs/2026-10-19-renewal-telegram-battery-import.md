# Gia hạn Telegram và dữ liệu hợp đồng pin ngày 19/10/2026

## Gia hạn có thu tiền

Dialog gia hạn lưu phiên bản trước rồi ghi phiếu thu thông thường. Phiếu trước đây không có liên kết với phiên bản, nên mẫu Telegram ghi “Chưa ghi nhận thanh toán” dù đã nhận tiền. Dialog nay gửi `renewal_version`; server kiểm tra phiên bản thuộc hợp đồng, giới hạn phần phí chưa thu và lưu bản chụp vào `management_contract_payments.renewal_payload`. Việc thu tiền không cộng lại phí hoặc dời ngày trả lần nữa. Mã lần thu vẫn chống ghi trùng.

Telegram lấy hình thức từ phiếu đã duyệt của đúng phiên bản. Không dùng tiền cọc, phiếu của kỳ khác hoặc phiếu chưa duyệt. Một phiên bản có nhiều lần thu vẫn chỉ có một sự kiện gia hạn; giữ nguyên ảnh của phiên bản. Nhân viên tiếp tục xác nhận gửi ở bước cuối.

Đã liên kết phiếu #172159, 763.000đ, CK tài khoản cá nhân với gia hạn v2 của hợp đồng VPS-31390 (#57372). Cùng người thực hiện, thời gian tạo cách nhau 459ms, đúng số tiền và ghi chú là bằng chứng ghép. Chỉ sửa metadata liên kết; giữ nguyên phiếu tiền và các tin Telegram đã gửi. Không tự gửi lại tin cũ.

## Nhập hợp đồng pin

Người dùng xác nhận chuyển dữ liệu hợp đồng pin từ `app.himoto.vn`, lấy nguồn cũ khi có xung đột. Chụp nguồn chỉ đọc lúc **17:15:23 ngày 19/10/2026, giờ Việt Nam**. Phạm vi là toàn bộ 42 hợp đồng chưa xóa tại cơ sở nguồn #30 “Thuê pin”, gồm **19 đang thuê, 23 đã kết thúc**. Dữ liệu được nhập vào cơ sở #35 trên app mới, mã `PIN-VPS-<ID nguồn>`.

- Giữ nguyên 3 bản ghi pin có sẵn trên app mới, kể cả trạng thái xóa hiện tại; không gộp chỉ vì cùng khách. Có 41 hồ sơ liên kết với hợp đồng xe nguồn đã nhập trước đó. Hợp đồng #32119 phát sinh sau lần đồng bộ buổi sáng được nhập độc lập.
- Giữ thông tin khách, giấy tờ dưới dạng chuỗi, ngày thuê/hẹn trả, giá kỳ ban đầu, trạng thái, tiền thuê và cọc. Nguồn không có tên pin/công suất cụ thể: dùng “Pin xe điện”. Ngày ký lấy ngày tạo hồ sơ nguồn vì nguồn không tách ngày ký.
- Lưu nguyên bản hợp đồng, chi tiết xe, khách, xe và 168 phiếu nguồn trong `legacy_source_payload`. Đối chiếu đủ 168 phiếu với sổ quỹ: 166 phiếu đã tồn tại được giữ nguyên; chỉ nhập thêm 2 phiếu của #32119 (cọc 2.000.000đ và thuê 650.000đ). Đây là sao chép phiếu lịch sử; không tạo chuyển khoản ngân hàng hoặc gửi Telegram. Người thực hiện nhập phiếu là #145; mã người lập nguồn #83 giữ trong mô tả và bản chụp, không giả lập đã ánh xạ nhân viên.
- Hai phiếu bổ sung dùng `battery:legacy:deposit` / `battery:legacy:rental`, tách khỏi các khoản thu mới. Không gán tài khoản/két khi nguồn không cung cấp tài khoản cụ thể.
- `legacy_paid_amount` / `legacy_deposit_amount` giữ số đã thu từ nguồn. Khi sửa hồ sơ không yêu cầu chọn lại tài khoản cho khoản cũ và không phát sinh thu lại. Chỉ phần tăng thêm sau nhập mới tạo phiếu; không cho giảm thấp hơn số đã thu hoặc đổi cơ sở của khoản lịch sử. Client không được gửi sửa các trường nguồn này.

**Các vấn đề nguồn vẫn còn:** 3 hồ sơ không còn danh mục xe (#27067, #28142, #28148), nên giữ biển số trống và ghi chú mã xe nguồn. Có 26 hợp đồng mà `pid` nguồn khác tổng phiếu thu/điều chỉnh đã duyệt; giữ cả hai giá trị, ghi chênh lệch trong ghi chú và báo cáo. Không tạo phiếu cân tiền, không coi chênh lệch đã được xác minh, không khôi phục gate cũ. Số đã thanh toán/cọc trên hồ sơ pin là tổng phiếu nguồn tương ứng; phiếu hoàn giữ riêng trong lịch sử.

Đây là nhập tại một thời điểm; không bật đồng bộ liên tục.

## Bằng chứng và kiểm tra

Migration: `sql/2026-10-19-battery-legacy-import.sql`.

Bản chụp nguồn/trước sửa, kế hoạch, checksum, kiểm tra TEMP, kết quả áp dụng và đối chiếu độc lập: `.backups/battery-import-20261019/` (Git ignored). Các batch trong `himoto.legacy_migration_batches`: `himoto-battery-import-20261019`, `himoto-battery-new-receipts-20261019`, `himoto-renewal-telegram-link-20261019`. Không chạy lại các script áp dụng.

Kiểm tra liên quan: `node scripts/check-contract-payments.cjs --live-temp`, `node scripts/check-battery-contracts.cjs --live-temp`, `node scripts/check-gps-contract-integrations.cjs`, lint, typecheck và production build. Các kiểm thử ghi vào bảng/schema tách biệt rồi rollback; Telegram và nhà cung cấp GPS được mô phỏng. Các lần nhập lịch sử thật ở trên được ghi riêng trong batch.
