# Thêm, sửa và xóa cơ sở

Nút **Thêm cơ sở** ở đầu danh sách mở form tên, mã, loại cơ sở, điện thoại, địa chỉ, người phụ trách và trạng thái. Mã để trống được tạo tự động theo dạng `CS-<ID>`; có thể nhập mã riêng gồm chữ không dấu, số, dấu `-` hoặc `_`. Tên và mã không được trùng. Loại mặc định là Cơ sở cho thuê (`physical`), có thể chọn Kho thuê mua (`lease_to_own`). Hồ sơ tạo thành công xuất hiện ngay ở bảng và danh sách chọn cơ sở. Chỉ gửi thông báo thành công sau khi API xác nhận lưu; lỗi giữ nguyên form.

Tại **Cơ sở**, cột **Thao tác** có Xem, Sửa và Xóa. **Sửa** mở form tên cơ sở, điện thoại, địa chỉ, người phụ trách (tài khoản hiện có) và trạng thái Hoạt động / Tạm ngừng. Lưu trực tiếp vào `himoto.stores`; trạng thái Hoạt động lưu `opening`, Tạm ngừng lưu `inactive` để khớp ứng dụng cũ. Mã và loại cơ sở được giữ nguyên. Danh sách cơ sở ở bộ lọc và tên cơ sở trên các danh mục được cập nhật sau khi lưu.

Người phụ trách mới phải là tài khoản đang hoạt động và chưa bị xóa. Có thể giữ nguyên người phụ trách cũ hoặc chọn Chưa phân công. Tên cơ sở không được trùng. Form dùng `updated_at` làm revision để chặn ghi đè thay đổi của người khác; nếu bị chặn, nhấn **Làm mới** và mở lại.

**Xóa** có hộp thoại xác nhận. Server chỉ xóa cơ sở chưa có dữ liệu liên quan. Schema hiện tại không có foreign key đến `stores`, nên server dò các cột `store_id` / `*_store_id` trong schema `himoto` (cả cơ sở gốc, hiện tại, đi/đến), khóa các bảng liên quan trong transaction rồi kiểm tra. Không bỏ qua bản ghi đã xóa mềm hoặc lịch sử. Cơ sở có xe, nhân sự, khách hàng, tài khoản, đơn thuê, giao dịch hoặc các dữ liệu liên quan sẽ bị chặn và báo loại dữ liệu; có thể dùng Tạm ngừng để giữ lịch sử.

API: `GET` / `POST /api/auth/stores`, `PATCH` / `DELETE /api/auth/stores/:id`, `GET /api/auth/stores/managers`. Quyền quản trị và cùng origin theo cơ chế hiện có. Không đổi schema hoặc thay đổi code module thuê xe. Timeout khóa 5 giây; bước xóa có timeout câu lệnh 15 giây.

Ứng dụng quản lý Next.js đọc toàn bộ cơ sở từ DB. Source Laravel cũ còn lọc danh mục cố định sáu mã trong `HimotoStores`; chức năng này không sửa bộ lọc của module đó.

Kiểm tra: `npm.cmd run test:stores` dùng DB mock; browser dùng dữ liệu giả và chặn ghi DB thật. Không xóa/sửa cơ sở vận hành để kiểm thử.
