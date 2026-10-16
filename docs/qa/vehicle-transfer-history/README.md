# Lịch sử luân chuyển chung — 16/10/2026

## Cách dùng

1. Vào **Danh sách xe → Lịch sử luân chuyển**, hoặc chọn mục cùng tên ở menu.
2. Trang mở mặc định **hôm nay theo giờ Việt Nam**. Chọn Từ ngày, Đến ngày, cơ sở chuyển đi, cơ sở nhận, thao tác hoặc từ khóa rồi bấm **Xem lịch sử**.
3. Mỗi dòng là một thao tác Chuyển xe hoặc Nhận xe: biển số/tên xe, cơ sở đi → đến, ngày giờ, người thao tác, ghi chú và giá trị cũ → mới đã được ghi log. Số lượng là số thao tác, không phải số xe duy nhất.
4. Trên điện thoại, chiều chuyển hiện ngay khi thẻ còn đóng; chạm thẻ để xem đầy đủ nội dung log. Cơ sở đang xem ở thanh trên lọc cả cơ sở gửi và cơ sở nhận.
5. Nút **Chuyển xe** hiện trực tiếp tại đầu Danh sách xe, trên desktop và điện thoại. Nút mở hộp thoại chọn xe, cơ sở đến và ghi chú. Ngày giờ/người thao tác lấy tự động; khi lưu xe chuyển sang Chờ luân chuyển và đổi cơ sở hiện tại trong cùng giao dịch với log.

## Dữ liệu và phạm vi

- API GET `/api/auth/vehicles/transfers` có xác thực phiên, không cache hồ sơ; phân trang tại server 25 dòng, mới nhất trước. Trang chỉ tải danh sách cơ sở và trang log cần xem, không tải toàn bộ đội xe hoặc gọi lịch sử từng xe.
- Lọc ngày trực tiếp trên timestamp địa phương của log; trả thời gian có múi giờ để hiển thị đúng giờ Việt Nam.
- Dùng tên xe/biển số/cơ sở/người thao tác đã chụp trong `audit_snapshot`; dữ liệu cũ chưa có snapshot sử dụng log và danh mục hiện có. Không dựng lại thay đổi trước đây chưa được ghi.
- Hiển thị log chuyển/nhận thủ công, phiếu điều chuyển cũ và log nhận theo Đổi trạng thái → Lưu kho nếu đã ghi rõ trạng thái Chờ luân chuyển → Lưu kho. Không đưa các thao tác cân bằng UAT, chỉnh sửa xe hoặc cho thuê vào danh sách này.
- Không sửa schema, không thêm biến môi trường. Phân quyền tài khoản theo cơ sở chưa thay đổi trong phần này.

## Xác minh

- Build, lint và typecheck.
- `npm.cmd run test:vehicle-transfer-history`: bảng TEMP riêng và rollback; kiểm tra biên ngày Việt Nam, phân trang, kết hợp bộ lọc, giữ tên lịch sử, log cũ, tìm kiếm tham số hóa và từ chối dữ liệu không hợp lệ. Không ghi dữ liệu/sequence nghiệp vụ.
- `npm.cmd run test:management-loading`: kiểm tra phụ thuộc trang và cache tải dữ liệu.
- `scripts/check-vehicle-transfer-history-ui.py`: Chrome/WebKit, API GET giả lập; kiểm tra mặc định hôm nay, hướng chuyển chưa mở thẻ, phân trang, lọc, lỗi/thử lại, ngày không hợp lệ và màn hình 320 px.
- `scripts/check-vehicle-transfers-ui.py`: mở nút Chuyển xe trực tiếp, chọn xe trong popup; kiểm tra chuyển/nhận, thử lại khi lỗi, log và giao diện điện thoại bằng API giả lập.

Ảnh và `results.json` trong thư mục này chỉ chứa dữ liệu QA. Cookie kiểm thử được lưu ngoài Git và xóa sau khi xác minh.
