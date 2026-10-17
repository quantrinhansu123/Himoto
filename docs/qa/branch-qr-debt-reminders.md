# QR theo cơ sở và nhắc nợ Zalo — 17/10/2026

## Đã kiểm tra

- `npm.cmd run test:sepay`: 8 nhóm. QR lấy đúng cơ sở; tài khoản chung/cơ sở khác không được dùng; tài khoản thường được ưu tiên, tài khoản công ty chọn được. Webhook ghi đúng ngân hàng thực tế, giao dịch sai cơ sở chờ đối chiếu. Dedupe vẫn hoạt động khi ngân hàng đã ngừng sử dụng. Tất cả kiểm thử ghi tiền dùng bảng TEMP và rollback.
- `npm.cmd run test:debt-reminders`: 6 nhóm. Chuẩn hóa số điện thoại, kiểm tra quyền, nội dung và công nợ mới nhất; chặn gửi trùng; phân biệt tiếp nhận/lỗi/chưa xác định; không nhắc kỳ tương lai. Migration chạy hai lần được; RLS chặn đọc/ghi cơ sở khác và chặn đọc URL webhook bằng role ứng dụng. Dùng TEMP/schema riêng rồi rollback.
- `test:login`, `test:account-scope`, `test:scoped-pool`, `test:contract-payments`, `test:management-table`: đạt. Scope và `SET LOCAL ROLE` vẫn nằm trong transaction qua Supabase pool cổng 6543.
- Production build đạt, gồm TypeScript và lint. Cảnh báo cấu hình ESLint plugin Next.js có sẵn, không chặn build.
- `python scripts/check-debt-reminders-ui.py --browser chromium` và `--browser webkit`: mỗi trình duyệt 4 nhóm đạt, không có lỗi console hoặc API ngoài dự kiến. Kiểm tra tạo mới, nút trong menu/chi tiết hợp đồng, sửa nội dung, trạng thái tiếp nhận/lỗi/chưa xác định, chọn tài khoản cơ sở và quyền nhân viên/kế toán/HCNS. Kích thước 1440×1000, 375×812, 812×375; không tràn ngang.
- API thật trên local: quản trị/nhân viên cơ sở/kế toán đọc lịch sử được; HCNS nhận 403; chưa đăng nhập nhận 401; gửi dữ liệu trống nhận 400 trước khi gọi webhook.
- Truy vấn chỉ đọc trên dữ liệu hiện tại: hợp đồng của cả 6 cơ sở `23,31,32,33,34,35` đều tạo QR từ tài khoản thuộc đúng cơ sở khi chạy bằng tài khoản nhân viên của cơ sở.
- Quét toàn bộ 116 tệp JavaScript client của build: không có domain webhook Zalo. Quyền bảng cấu hình thực tế chỉ thuộc `postgres`.

## Cấu hình

Đã áp dụng `docs/sql/2026-10-17-debt-reminders.sql`. URL lấy từ form HTML người dùng cung cấp, lưu bằng tham số vào bảng cấu hình chỉ server đọc. Không lưu URL trong Git hoặc client bundle. Giữ nguyên chế độ SePay test.

## Giới hạn nghiệm thu

Các bài kiểm thử gửi tin dùng webhook giả; không gửi Zalo tới khách thật. HTTP thành công chỉ xác nhận hệ thống webhook đã tiếp nhận, chưa chứng minh Zalo đã chuyển tin tới máy khách hoặc khách đã đọc. Cần đối chiếu một lần gửi do người dùng chủ động thực hiện trên hệ thống/Zalo.

Không chỉnh hợp đồng, khách hàng, xe, số dư hoặc giao dịch tiền thật; không sử dụng sequence nghiệp vụ thật khi chạy test. Ảnh chụp và cookie QA lưu tại `.backups/zalo-qr-qa/`, không đưa vào Git.
