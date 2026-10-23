# QA hợp đồng, GPS và báo cáo cuối ngày — 24/10/2026

## Phạm vi

Gộp cột thời gian / tổng hợp đồng; đủ xe trên GPS; báo cáo nợ chậm theo PGD; thu gọn form và tin Telegram trả xe; mẫu báo cáo cuối ngày thuê sở hữu, tự thống kê và gửi khi chốt. Mô tả nguồn và giới hạn: `docs/2026-10-24-operating-reports.md`.

## Đối chiếu chỉ đọc

- Đọc trực tiếp cả bốn tài khoản GPS đã bật: Protrack 117 + 219 thiết bị; IOPGPS 47 + 9. Tập ID phía nhà cung cấp khớp các thiết bị đang hiện của từng tài khoản trong DB, không thiếu/thừa. Không sửa đồng bộ hoặc ghép xe. Thiết bị không còn trong tài khoản được giữ lịch sử và trạng thái riêng.
- API production build local với Supabase thật: quản trị thấy **383 xe**, gồm **8 chưa có GPS**; nhân viên / quản lý thuê sở hữu thấy **126 xe** trong phạm vi, gồm **3 chưa có GPS**. Không cookie nhận 401. Nhân viên thuê sở hữu đọc báo cáo PGD khác không thấy dữ liệu.
- Cùng giao dịch REPEATABLE READ READ ONLY cho ba quyền: quản trị, nhân viên thuê sở hữu, quản lý thuê sở hữu. CS Thuê sở hữu có **198 hợp đồng xe**, **128 đang thuê**, **68 hoàn thành**, **2 chờ thanh toán**. **60 quá hạn** khớp báo cáo nợ chậm. Ô toàn bộ vẫn 198 ở tab Nháp rỗng; tìm kiếm / phân trang không đổi ô tổng. HTTP cả ba quyền tới trang cuối thật **20/20, 8 dòng**, vẫn có mã VPS cũ.
- 41 bản ghi còn lại trong tổng 239 cũ là neo lịch sử thuê pin (`sourceStoreId=30`). Đối chiếu ID nguồn `legacy_migration.sourceOrderId` với `battery_contracts.legacy_source_order_id`: **41/41 có hợp đồng pin tương ứng**. Đã đồng nhất điều kiện loại neo này ở chỉ mục phân trang, hydrate và đếm tổng với nguồn chi tiết / báo cáo. Không xóa hoặc sửa bản ghi lịch sử.
- Bảng lease_contracts và vehicle_ownerships cũ không có dữ liệu. Không tìm thấy nguồn bảo lưu có cấu trúc. Phần lớn VPS thiếu kỳ hạn; chỉ thống kê kỳ hạn đã ghi, phần thiếu hiển thị chưa xác định. Không suy từ ngày trả đã gia hạn.

## Kiểm thử

- `npm.cmd run build`, `npm.cmd run typecheck`, ESLint các tệp sửa, `git diff --check`: đạt. Build còn cảnh báo có sẵn ở StaffOrganizationChart và cấu hình plugin Next ESLint.
- `check-operating-reports.cjs`: 7 nhóm, PostgreSQL TEMP + RLS + rollback. Bao gồm xe không trùng, khách trả xe không trùng, phân loại gia hạn addon cũ, phiếu đã duyệt / mốc ngày Việt Nam, loại neo pin, không giả tồn kho ngày cũ; đủ số trước chốt; nguồn app đọc lại trên server; replay chốt chỉ một hàng đợi; ghi chú theo phiên bản và lịch sử; ngoài PGD bị chặn; gửi thành công phải có message ID, không gửi lại khi mất phản hồi, lỗi chắc chắn có thể thử lại; chia tin dưới 4.000 ký tự.
- Hồi quy đạt: contract-history 6 nhóm; contract-tabs 4; contract-monitoring 5; management-table 10; shift-autofill; shift-reports; shift-report-retries 11; shift-audits 6; gps-contract-integrations 36; return-refunds 17. Tất cả kiểm thử ghi dùng TEMP/schema kiểm thử và rollback; không thay đổi dữ liệu hoặc sequence nghiệp vụ.
- `check-contract-tabs-ui.py`: **15 tình huống** đạt trên production build local, Chromium desktop / WebKit điện thoại, ba quyền. Giữ tải riêng từng tab, trang cuối / tìm lịch sử, ngày thuê đúng trên desktop/mobile, phản hồi đến muộn, lỗi nền 503 và form đang nhập. Bộ dữ liệu UI 239 là fixture kiểm tra phân trang, không phải tổng DB thật sau loại neo pin.
- `check-operating-reports-ui.py`: **6 nhóm** đạt trên Chromium desktop / WebKit điện thoại. Đủ GPS và chưa gắn; nợ chậm chỉ đọc khi mở, ghi lỗi không mất nội dung; cập nhật tình trạng khách, xem trước báo cáo PGD; tự thống kê ngày/thuê sở hữu, giữ ô nhập tay khi tự điền lại hoặc lỗi, chốt một lần và hiện trạng thái Telegram. Kiểm tra root không tràn ngang và không có lỗi JS.
- `check-return-compact-ui.py`: **13 tình huống mỗi trình duyệt**, đạt trên Chromium desktop và WebKit điện thoại, gồm phí thực tế 0 / 50.000, đổi thời điểm trả không đổi tiền đã nhập sai loại, QR hoàn cọc, giữ tệp khi lưu lỗi, ảnh bổ sung sau trả, lô 17 ảnh, không trả / hoàn trùng và thao tác điều chuyển. Bài kiểm tra được đồng bộ với hành vi đã có: mặc định giữ cọc, ảnh chưa lưu khóa nút xác nhận; không đổi quy tắc quyết toán trong phiên này. Tổng ba bộ giao diện: **47 tình huống / nhóm, không lỗi JS**.

SQL `2026-10-24-operating-reports.sql` đã tạo ba bảng + policy RLS. Số dòng orders / vehicles / transactions không đổi; các bảng ghi chú, lịch sử và hàng đợi mới đều rỗng ngoài dữ liệu tạm QA. Bằng chứng và cookie chỉ ở `.backups/shift-gps-20261024/`, bị Git bỏ qua.

**Không gửi Telegram thật trong QA. Kết quả trên được xác minh trên production build local; trạng thái triển khai phải đối chiếu riêng theo commit.** Các mục không có nguồn yêu cầu nhập thực tế; không tự đánh “Khớp” khi thiếu số đối chiếu. Không thêm lưu form offline.
