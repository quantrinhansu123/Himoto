# Đổi nhanh Blacklist

Trên mỗi dòng Khách hàng có nút **Đưa vào Blacklist** hoặc **Bỏ Blacklist**, thao tác trực tiếp mà không mở form sửa toàn bộ hồ sơ. Trong lúc gửi, các nút đổi nhanh bị khóa; chỉ cập nhật giao diện sau khi API xác nhận thành công. Lỗi mạng hoặc xung đột hiển thị ngay trên bảng, có nút Làm mới để kiểm tra trạng thái hiện tại.

API `PATCH /api/auth/customers/:id/blacklist` yêu cầu phiên quản trị hiện hữu, cùng origin và body `{ blacklisted: boolean, revision: string }`. Phiên bản từ `customers.xmin` được đối chiếu sau khi khóa dòng trong transaction. API chỉ sửa `status` và `updated_at`, giữ nguyên toàn bộ hồ sơ, ghi chú, cơ sở, hợp đồng và giao dịch.

- Đưa vào Blacklist: `status=2`, áp dụng được cả với hồ sơ chưa hoàn tất.
- Bỏ Blacklist: hồ sơ đủ tên, điện thoại hợp lệ, CCCD/CMND hợp lệ và địa chỉ trở về `status=1`; hồ sơ thiếu/sai các thông tin này trở về `status=0` (Chưa hoàn tất). Giữ nguyên cảnh báo; hồ sơ hoàn tất còn cảnh báo hiển thị Cần lưu ý.
- Không tự đổi trạng thái hợp đồng thành Nợ xấu hoặc thay số tiền. Bộ đếm Blacklist trong Hợp đồng đọc trạng thái khách hiện tại nên cập nhật theo ngay trong phiên làm việc.

Kiểm tra `npm.cmd run test:customer-blacklist -- --live-temp`: chỉ bảng TEMP với identity riêng và ROLLBACK ngoài cùng. Kiểm tra UI giả lập toàn bộ `/api/**`, không đổi khách thật để thử.
