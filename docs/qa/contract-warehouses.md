# Kho xe và nguồn khách trên danh sách hợp đồng

Kiểm tra ngày 29/10/2026.

- VPS-28521 / 98E1-438.66 (xe 1194) và VPS-28404 / 29B2-153.34 (xe 1214): kho gốc/hiện tại đều Nguyễn Hoàng (32), nguồn hợp đồng Láng (31). Dữ liệu kho ban đầu đã đúng; nhãn cơ sở dưới khách và bộ lọc danh sách trước đây đang dùng nguồn hợp đồng.
- Danh sách hợp đồng lọc cơ sở đang xem theo **nguồn khách**; nhãn Kho xe/Nguồn khách vẫn hiện. API `store_basis=warehouse` chỉ dùng khi cần lọc theo kho.
- Bộ lọc xét xe chưa trả trước, bỏ xe cũ đã trả khi đổi xe; hợp đồng đã trả hết dùng các dòng lịch sử. Nháp có kho dự kiến dùng kho đã lưu khi chưa có dòng xe. Một hợp đồng nhiều xe chỉ đếm một lần.
- Tên/ID kho lấy theo xe hiện tại, kể cả xe kho ngoài cơ sở nguồn. Không thay `orders.store_id`, kho xe, giao dịch, hạn thuê hoặc gửi Telegram. Bộ lọc danh sách không thay cơ sở ghi nhận tiền.
- Quyền đọc hợp đồng vẫn theo phạm vi tài khoản. Kiểm tra nhân viên Láng đọc được hợp đồng của mình với vị trí xe Nguyễn Hoàng; nhân viên Nguyễn Hoàng không được cấp thêm quyền đọc tài chính hợp đồng Láng chỉ do xe ở kho mình.

Kiểm tra:

- `node scripts/check-contract-warehouses.cjs --live-temp --live-read`: ánh xạ kho/nguồn, đổi xe, kho chưa xác định, phân trang/xuất CSV, khóa cache thống kê theo cách lọc, SQL PostgreSQL TEMP (rollback), hai hợp đồng thật ở trang/xuất đầy đủ.
- Đọc thật: bộ đếm nhanh Đang thuê của kho Nguyễn Hoàng khớp truy vấn SQL độc lập; tra hai hợp đồng bằng tài khoản quản trị/nhân viên nguồn; kiểm tra quyền đọc tài khoản kho không tự mở rộng.
- `node scripts/check-contract-classification-availability.cjs`: 6 nhóm PostgreSQL, gồm RLS đọc nhãn xe kho khác và xe đã trả/pin.
- `node --require ./scripts/lib/offline-tests.cjs scripts/check-management-table.cjs`: 10 nhóm phân trang.
- `python scripts/check-contract-warehouses-ui.py --cookie-file <phiên cục bộ>`: Chromium 1440px, WebKit 390px/320px; chọn Láng thấy hợp đồng nguồn Láng dù kho Nguyễn Hoàng; chọn Nguyễn Hoàng theo nguồn không kéo nhầm các hợp đồng nguồn Láng. API giả lập.
- Bộ release có thêm `contract-warehouses`; typecheck, ESLint file sửa, production build và `git diff --check`.

Ảnh/kết quả trong `.backups/contract-warehouses/` (không đưa phiên đăng nhập vào Git).
