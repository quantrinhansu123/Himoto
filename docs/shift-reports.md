# Báo cáo cuối ca

Tổng kết xe cuối ngày = xe cho thuê ngày + xe cho thuê tháng + xe lưu kho thực tế. Ví dụ 16 + 7 + 20 = 43 xe. Hai trường xe cho thuê được nhập và lưu cùng báo cáo, tổng tự tính; báo cáo cũ thiếu số liệu không hiển thị tổng giả định. Không cộng lại số xe điều chuyển vào tổng.

Tab **Báo cáo cuối ca** tại `/shift-reports` dành cho người có quyền xem hợp đồng. Người có quyền lập hợp đồng nháp hoặc thu/chi được tạo và chốt báo cáo trong PGD được phân công.

Áp dụng bảng dữ liệu trước khi sử dụng:

```powershell
node scripts/migrate-shift-reports.cjs --apply
```

Mỗi PGD có một báo cáo mỗi ngày. Chọn PGD, ngày, nhập nhân sự, số xe lưu kho, tổng pin/pin đầy, xe điều chuyển, tiền mặt và số dư hai loại tài khoản. Số tiền tính bằng đồng; số lượng và số tiền là số nguyên không âm.

Lưu nháp giữ dữ liệu và ảnh trên hệ thống. Chốt yêu cầu đủ sáu ảnh (xe, pin, tiền mặt, tài khoản cá nhân, tài khoản Công ty, khóa cửa) và xác nhận tắt điện. Báo cáo đã chốt chỉ được xem. Kiểm soát phiên bản ngăn ghi đè khi nhiều người cùng sửa. Ảnh được lưu riêng từng mục, tối đa 2 MB sau xử lý, chỉ truy cập qua phiên đăng nhập trong phạm vi PGD.

Thống kê theo PGD và ngày báo cáo gồm tổng số hợp đồng, hoàn thành, đang thuê, quá hạn; tổng thu thực tế, thu cọc, thu gia hạn, thu phí thuê; tổng chi thực tế, tiền cọc phải trả, hoàn lại do trả sớm, tiền phạt muộn. Người trực ca nhập các số liệu và tổng thực tế riêng để đối chiếu. Hệ thống không tự cộng tiền phạt vào chi hoặc cộng các trạng thái hợp đồng có thể trùng nhau. Số liệu được lưu cùng báo cáo; báo cáo cũ đã chốt chưa có phần này hiển thị chưa ghi nhận, không tự thêm số 0. Không cần migration bổ sung.

Nút điền mẫu Hà Đông ngày 21/10/2026 chỉ điền số liệu được cung cấp, không tự tạo báo cáo, ảnh hoặc xác nhận an toàn. Thay PGD/ngày của báo cáo đã lưu bằng cách tạo báo cáo mới.
