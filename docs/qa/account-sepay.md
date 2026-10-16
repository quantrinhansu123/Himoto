# Kiểm thử tài khoản cơ sở và SePay — 17/10/2026

- Đăng nhập: 10 kiểm tra, gồm tài khoản cũ, phạm vi mới, khóa tài khoản, cookie và chống giả mạo phiên.
- Phân quyền PostgreSQL: 9 kiểm tra trong schema riêng rồi rollback. Bao gồm tạo/sửa tài khoản và audit, hoàn tất hợp đồng/phiếu thu, gia hạn, trả xe, chuyển/nhận xe, ngăn thuê trùng khi hợp đồng ở cơ sở khác bị ẩn bởi RLS.
- Supabase transaction pool: 3 kiểm tra chỉ đọc, gồm 16 truy vấn cơ sở chạy đồng thời, rollback/savepoint, truy vấn sau commit và kiểm tra role không rò sang kết nối xác thực.
- SePay: 5 nhóm kiểm tra với bảng TEMP. Xác thực webhook; đúng ngân hàng/tài khoản/nội dung/số tiền; ghi nhận thu nguyên tử; chống webhook lặp; rollback và gửi lại; test mode không ghi tiền thật.
- Chuyển xe: 9 kiểm tra, gồm người chuyển khác người nhận, cập nhật cơ sở/trạng thái và rollback nếu audit lỗi.
- Tải dữ liệu quản lý: 12 kiểm tra hồi quy.
- HTTP: đăng nhập thật 10 tài khoản mới, chỉ đọc dữ liệu và gọi các thao tác bị chặn trước xử lý. Kiểm tra danh sách/ID/ảnh chéo cơ sở, nhân viên thuê sở hữu không duyệt, vai trò HCNS/kế toán/quản trị, người chưa đăng nhập.
- Giao diện Chromium và WebKit: tạo tài khoản với form giả lập, QR theo số tiền còn phải thu, sửa số tiền/kiểm tra giới hạn, cập nhật giao dịch demo, giao diện 375px và chặn trang quản trị theo vai trò.
- PDF Chromium: QR và nội dung chuyển khoản có trong bản in hợp đồng nhiều xe; giữ 2 trang A4 ngang như mẫu trước khi thêm QR.

Kiểm thử giao diện dùng API giả lập và dữ liệu tổng hợp. Không gửi giao dịch giả vào hợp đồng thật; chưa xác nhận giao dịch từ ngân hàng/SePay thật. Các ảnh và PDF thử nằm trong thư mục `.backups/account-access/ui/` bị loại khỏi Git.

Chạy lại theo hướng dẫn trong [ACCOUNT-SEPAY-SETUP.md](../ACCOUNT-SEPAY-SETUP.md). Lint và build production (bao gồm kiểm tra TypeScript) phải qua trước khi phát hành.
