# Kết nối Supabase — 07/10/2026

Repo chính: https://github.com/quantrinhansu123/Himoto. Không giới hạn kết nối ở môi trường development nữa; local và production đều dùng cùng Route Handlers và xác thực tài khoản DB.

## Biến môi trường phía server

- `DATABASE_URL`: chuỗi PostgreSQL trong Supabase → Connect → Transaction pooler, cổng 6543. `SUPABASE_DATABASE_URL` được chấp nhận nếu chưa có `DATABASE_URL`.
- `MANAGEMENT_SESSION_SECRET`: chuỗi ngẫu nhiên ít nhất 32 ký tự, dùng chung và giữ ổn định giữa các instance. Thiếu hoặc quá ngắn trong production sẽ chặn đăng nhập/API.
- `DATABASE_SSL_CA`: tùy chọn PEM CA bổ sung; root CA công khai của Supabase đã có trong source. Kết nối luôn xác minh CA và hostname, không dùng `rejectUnauthorized: false`.

Đặt ở `.env.local` khi chạy local; đặt ở Environment Variables của đúng project Vercel khi triển khai. Không đặt mật khẩu DB hoặc session secret vào biến `NEXT_PUBLIC_*`, Git, ảnh QA hay tài liệu. Không cần Data API key vì truy vấn chạy phía server bằng `pg`.

Ứng dụng luôn dùng API `/api` cùng origin, không chọn fixture theo cờ môi trường và không fallback khi lỗi. Pool có tối đa 4 kết nối mỗi instance, idle timeout 5 giây; dùng `attachDatabasePool` trên Vercel để thu hồi kết nối trước khi instance nghỉ. SQL không dùng named prepared statements, phù hợp transaction pooler.

## Phạm vi dữ liệu

Schema hiện có là `himoto`; không chạy migration, seed, thay schema hoặc chép DB. Mỗi request cần phiên đăng nhập của quản trị viên đang hoạt động. Quyền theo từng cơ sở cho tài khoản nhân viên chưa được triển khai, nên tài khoản không phải quản trị bị từ chối.

Danh mục/sổ quỹ lấy trực tiếp từ DB. Khách hàng tạo/sửa/xóa qua API hiện có; hồ sơ có đơn thuê không được xóa. Log lưu và cập nhật `orders.order_status='draft'`, giữ snapshot và kiểm tra revision; không cập nhật hợp đồng đã phát hành, không sinh giao dịch hay đổi tình trạng xe. API sửa nhân sự/cơ sở/xe và sao chép hợp đồng đã phát hành chưa có, nên giao diện chỉ cho đọc các phần này.

Sơ đồ nhân sự đọc `staff_profiles` và `stores`, không chứa danh sách điện thoại cố định trong code. Nút Làm mới chỉ đọc lại DB; endpoint gán cơ sở hàng loạt bằng danh sách cố định đã bỏ.

## Đối chiếu chỉ đọc ngày 07/10/2026

Kết nối transaction pooler với TLS xác minh đầy đủ đạt. Tại thời điểm kiểm tra: 25 nhân sự, 6 cơ sở, 2.418 khách hàng, 2.691 hợp đồng chưa xóa, 172 xe và 8.844 giao dịch. Số liệu có thể thay đổi khi hệ thống vận hành. Không dùng các con số này làm fixture hay giới hạn danh sách.

Nguồn: [kết nối PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres), [xác minh TLS](https://supabase.com/docs/guides/platform/ssl-enforcement), [pool cho Vercel](https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute).
