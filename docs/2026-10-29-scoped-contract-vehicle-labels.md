# Tài khoản quản lý thuê sở hữu không tải được danh sách

Tài khoản Nguyễn Như Hoài Linh và tài khoản quản lý thuê sở hữu nhận HTTP 503 với PostgreSQL `42703: column v.store_id does not exist`. Tài khoản admin tải được cùng 203 hợp đồng. Truy vấn theo quyền dùng `contract_vehicle_labels()` để đọc thông tin xe; hàm này còn thiếu `store_id` mà danh sách cần để hiển thị cơ sở sở hữu xe.

Đã áp dụng `docs/sql/2026-10-29-contract-vehicle-owner-labels.sql` trên database production. Hàm bổ sung ID cơ sở sở hữu xe; giữ nguyên điều kiện người đăng nhập, phạm vi hợp đồng, `SECURITY DEFINER`, search path và quyền thực thi. Thay hàm trong một giao dịch, không dùng `CASCADE`; không cần triển khai lại frontend.

Kiểm tra:

- `node scripts/check-account-scope.cjs`: đạt 25 kiểm tra trong schema riêng rồi rollback. Bao gồm phân trang, tìm kiếm, xuất danh sách và lịch sử trả xe có cơ sở khác; dữ liệu cơ sở khác vẫn bị chặn. Migration được chạy hai lần để kiểm tra chạy lại.
- API production và truy vấn có phạm vi thực: Hoài Linh, quản lý thuê sở hữu và hai tài khoản admin đều trả HTTP 200 với 203 hợp đồng thuê sở hữu.
- Tập xe được phép đọc của hai tài khoản trên và hai tài khoản nhân viên cơ sở giữ nguyên. ACL của hàm, quyền tài khoản và hash hợp đồng, dòng xe, xe, phiếu tiền giữ nguyên.
- Bản định nghĩa hàm trước sửa, kết quả kiểm tra và hash được lưu riêng tại `.backups/ownership-scoped-read-20261029/`, được Git bỏ qua.
