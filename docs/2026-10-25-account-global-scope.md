# Phạm vi tất cả cơ sở cho nhân sự

Quản trị viên vào **Tài khoản & Phân quyền → Phân quyền → Cơ sở được phân quyền → Tất cả cơ sở → Lưu tài khoản**. Lựa chọn này có cho mọi vai trò nhân viên/quản lý, gồm quản lý cơ sở như tài khoản `nv0034`.

Phạm vi cơ sở áp dụng cho những quyền thao tác đang được cấp; đổi phạm vi không đổi vai trò, tự cấp thêm quyền hoặc đặt lại mật khẩu. Với quyền xem xe hiện có, phạm vi tất cả cơ sở cũng cho xem GPS trên toàn hệ thống. Các tài khoản hiện hữu giữ nguyên phạm vi cho đến khi quản trị viên chủ động lưu thay đổi. Không tự chuyển tài khoản Phượng sang toàn cơ sở.

Chỉ quản trị viên được quản lý tài khoản và phân quyền, kể cả cấp phạm vi tất cả cơ sở. Nhân viên và quản lý cơ sở không được cấp quyền này. Việc đổi cơ sở trong hồ sơ nhân sự tự đồng bộ sang tài khoản theo một cơ sở; tài khoản toàn cơ sở giữ nguyên phạm vi đã cấp. Xem `docs/2026-10-25-admin-only-permissions-staff-transfers.md`.

Triển khai `docs/sql/2026-10-25-account-global-scope.sql` trước mã ứng dụng: chỉ bỏ ràng buộc cũ cấm vai trò cơ sở có `scope_all`. Giữ các ràng buộc vai trò, quyền dạng mảng và bắt buộc tài khoản đang bật phải có cơ sở hoặc phạm vi toàn hệ thống. SQL chạy lặp được, không cập nhật dữ liệu tài khoản.

Kiểm tra:

- `node scripts/check-account-global-scope.cjs`: SQL chạy lặp, lưu/đọc phiên đăng nhập cho bốn vai trò, giữ mật khẩu/quyền, kiểm tra giới hạn cấp quyền. Mọi dữ liệu thử nghiệm trong schema riêng và rollback.
- `node scripts/check-account-management-api.cjs`
- `node scripts/check-staff-accounts.cjs`
- `node scripts/check-account-scope.cjs`
- `node scripts/check-account-passwords.cjs`
- `python scripts/check-account-global-scope-ui.py --sessions-file <private-json>`: Chromium 1440px và WebKit 390px, lưu/mở lại toàn cơ sở rồi thu về một cơ sở cho cả bốn vai trò; quản lý cơ sở không thấy lựa chọn toàn cơ sở. Mọi yêu cầu ghi bị mô phỏng.
- Bản build production gồm kiểm tra TypeScript và lint.

Các bài kiểm tra tài khoản dùng cùng advisory lock nghiệp vụ, cần chạy lần lượt để tránh timeout giữa các schema QA.
