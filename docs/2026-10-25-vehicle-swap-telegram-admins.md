# Gửi Telegram khi đổi xe và đồng bộ hai tài khoản quản trị

## Hành vi

- Sau đổi xe: lưu ảnh, bấm **Kiểm tra & gửi Telegram**, kiểm tra thông tin rồi **Gửi toàn bộ Telegram**. Hiện trạng thái gửi và khóa lượt đã gửi để tránh trùng.
- Mỗi lượt đổi xe có một sự kiện `vehicle-swap:<order>:<swap>`, lấy biển số/loại xe cũ và mới từ lịch sử đổi xe. Chỉ gom ảnh của chính lượt đó, gồm ảnh bổ sung; gửi ảnh trước, tin tổng hợp sau. Thay xe lần tiếp theo không làm đổi nội dung lượt cũ.
- Có thể mở lại ở **Ảnh thuê / trả xe → Bổ sung ảnh đổi xe**, kể cả lượt cũ như hợp đồng 011020. Không cần thao tác đổi xe thêm lần nữa.
- Cần quyền `contracts.return` cho ảnh và gửi Telegram đổi xe. Hợp đồng thường gửi nhóm cơ sở; thuê sở hữu gửi nhóm thuê sở hữu. Không tự gửi các lượt cũ khi triển khai.

## Hai tài khoản quản trị

Theo yêu cầu người dùng, `quanlyvanhanh` (145) và `quantri` (160) cùng có 18/18 quyền, bao gồm `shift.review`. Cả hai được xem bản lưu mật khẩu nhân viên và báo cáo đội xe theo cơ sở. Các quản trị khác không nhận hai quyền riêng này; tài khoản mất vai trò quản trị cũng mất quyền riêng.

API danh sách và form sửa luôn hiển thị đầy đủ quyền hiệu lực của quản trị, kể cả danh sách lưu cũ thiếu quyền. Đồng bộ dữ liệu thật bằng `node scripts/sync-primary-admin-permissions.cjs --apply`; có kiểm tra đúng hai danh tính, sao lưu quyền cũ và ghi audit. Không đổi mật khẩu, khóa phiên hay sửa các tài khoản khác. Lệnh `--check` chỉ kiểm tra và rollback.

## Triển khai và kiểm tra

- Áp dụng `docs/sql/2026-10-25-vehicle-swap-telegram.sql` trước code mới; migration chỉ mở rộng loại sự kiện, không tạo lượt gửi.
- Đã áp dụng migration và đồng bộ hai tài khoản 18/18 trong ngày 25/10/2026.
- TypeScript, ESLint và production build đạt. Integration GPS/Telegram 49 nhóm, API mật khẩu 3 nhóm, service mật khẩu 5 nhóm, quyền/API đội xe 3 nhóm, sửa hồ sơ trả xe 12 nhóm, API quản lý tài khoản 3 nhóm, xóa ảnh 8 nhóm và nhiều ảnh 5 nhóm đạt. Schema thử rollback, không gửi Telegram thật.
- 44 ca trình duyệt local đạt (8 ảnh/đổi xe, 21 tài khoản, 15 đội xe), không lỗi JavaScript. Bao gồm nút gửi sau đổi xe và khi mở lại, chặn gửi trùng, đủ 18/18 quyền ở form quản trị, và quyền riêng của cả hai tài khoản trên máy tính/điện thoại. Kết quả và ảnh riêng ở `.backups/swap-admin-20261025/`.
