# Phí quá hạn, GPS tại quầy và đối chiếu Telegram

- Gợi ý 20.000đ/giờ. Mỗi 24 giờ quá hạn là một ngày; phần lẻ đến 8 giờ làm tròn giờ lên, phần lẻ vượt 8 giờ thành một ngày. Giá ngày lấy từ dòng xe của hợp đồng, không lấy bảng giá mới. Ví dụ giá 150.000đ/ngày: 8 giờ = 160.000đ, 8 giờ 1 phút = 150.000đ; 3 ngày 4 giờ 2 phút = 550.000đ. Cho phép nhân viên sửa phí đã đối chiếu. Nếu thiếu giá ngày thì yêu cầu nhập phí, không tự đoán. Server và giao diện dùng chung công thức; lịch sử trả xe cũ giữ nguyên.
- Xóa trống đơn giá giờ vẫn dùng gợi ý 20.000đ, trở lại giá này khi rời ô. Nhập 0 là đơn giá giờ 0; muốn miễn toàn bộ thì điều chỉnh phí trả muộn về 0.
- Chọn xe trong lập hợp đồng hoặc trả xe có trạng thái GPS, đọc cùng một lượt tối đa 20 xe, làm mới mỗi 5 giây khi màn hình hiển thị. ON đang di chuyển, ON đang dừng, OFF mất kết nối, chưa cập nhật và chưa gắn GPS được phân biệt. API chỉ đọc xe có quyền xem, không gọi lệnh thiết bị hoặc dùng GPS để tự phát hành hợp đồng.
- Đang thuê bao gồm cả Quá hạn chưa trả xe. Tìm cùng biển số vẫn thấy trong Tất cả, Đang thuê và Quá hạn; các bộ lọc cơ sở và quyền đọc vẫn áp dụng.
- Telegram mất phản hồi vẫn chặn gửi lặp tự động. Khi chưa có mã tin nào được Telegram trả về, người có quyền gửi có thể xác nhận đã kiểm tra nhóm và dùng **Gửi lại sau khi đối chiếu**. Lượt đối chiếu ghi người, thời điểm và mã yêu cầu vào `delivery_review`; nhấn lặp không tạo thêm lượt. Nếu đã có mã tin gửi một phần, không gửi lại cả bộ.
- Lượt gửi trực tiếp chỉ xử lý thông báo của hợp đồng vừa thao tác, thời gian xử lý tối đa 300 giây; lấy ảnh Cloudinary theo nhóm ba tệp để giảm chờ. Lỗi mạng hoặc timeout hiển thị riêng và giữ trạng thái chưa xác định. Không coi phát hành hợp đồng là Telegram đã nhận tin.

Migration: `sql/2026-10-18-telegram-delivery-review.sql` chỉ thêm nhật ký đối chiếu, không sửa tiền hay tự gửi lại thông báo cũ.

Kiểm tra: `test:counter-workflow`, `test:gps-contract-integrations`, `test:account-scope`, `test:management-table`, typecheck/lint/build và Chromium/WebKit. Dữ liệu nghiệp vụ thử dùng schema rollback hoặc chặn API ghi; việc gửi lại hợp đồng thật chỉ thực hiện sau xác nhận nhóm chưa có tin.
