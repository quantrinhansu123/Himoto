# Đăng nhập HIMOTO — 07/10/2026

`/` chuyển đến `/login`. Ảnh nền và logo HIMOTO giữ theo web cũ. Không có nút vào demo. Mọi trang quản lý yêu cầu đăng nhập, kể cả khi cấu hình DB thiếu hoặc DB bị lỗi; khi thiếu cấu hình, màn đăng nhập báo lỗi cấu hình và không mở dữ liệu mẫu.

`POST /api/session` kiểm tra email/mật khẩu bcrypt hiện có trong `himoto.users`, hỗ trợ hash Laravel `$2y$`, kiểm tra chưa xóa, `status='active'` và quyền quản trị qua role/role_id/roles.slug. Không tạo tài khoản, đặt lại mật khẩu hoặc tự nâng quyền khi kết nối.

Phiên có HMAC SHA-256, cookie HttpOnly, SameSite Strict, thời hạn 8 giờ và Secure trên HTTPS. Production bắt buộc `MANAGEMENT_SESSION_SECRET` ít nhất 32 ký tự; không dùng khóa ngẫu nhiên riêng từng instance. Mọi API quản lý kiểm tra lại tài khoản còn hoạt động và còn quyền. Đăng xuất xóa cookie; API không có phiên trả 401, thao tác ghi khác origin trả 403, thiếu cấu hình trả 503.

Giới hạn 10 lần đăng nhập/email/15 phút hiện nằm trong bộ nhớ của instance. Đây chưa phải bộ đếm dùng chung giữa các instance Vercel. Không có cơ chế tự đăng nhập hoặc bỏ qua mật khẩu ở production.

Kiểm tra: `npm.cmd run test:login` gồm chữ ký/giới hạn phiên, bcrypt, quyền, hạn chế lần thử, thiếu cấu hình, cờ demo cũ, HTTPS production, cookie Secure và bảo vệ API. Kiểm tra browser với dữ liệu thật không chụp/lưu hồ sơ cá nhân, không ghi dữ liệu nghiệp vụ.
