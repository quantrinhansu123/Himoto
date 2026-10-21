# Thu gọn trả xe, gom ảnh và nhập phí thực tế

## Đối chiếu phản hồi

Đã đọc lần lượt 10 ảnh hội thoại và hai file video. Hai video có cùng SHA-256, cùng nội dung 13,67 giây. Nội dung phản hồi nói về **màn hình nhập ảnh** quá dài, không phải cách chia album Telegram. Chốt cuối của người phụ trách: tải nhiều ảnh cùng lúc, không cần luôn hiện từng vị trí ảnh; phí quá hạn cho sửa theo thực tế.

- Màn hình chuyển xe chỉ nhận đúng cả chuỗi “biển số — tên xe”, nên nhập riêng biển không xác định được xe. Hỗ trợ nhập nguyên biển, không dấu chấm/gạch, không phân biệt hoa thường; chỉ tự chọn khi khớp duy nhất. Kho chung chỉ giúp giải thích vị trí xe ngoài phạm vi, không cấp quyền chuyển.
- Mỗi lượt thuê/trả có một khối tải ảnh chính. Chọn nhiều ảnh xe, hợp đồng, biên nhận và QR cùng lúc; ảnh/video đã lưu, lựa chọn theo vị trí và hồ sơ bổ sung mặc định thu gọn. Nút lưu xuất hiện ngay dưới nút chọn tệp, trước danh sách ảnh.
- QR VietQR đọc được trong lô ảnh trả xe lưu vào slot QR hiện có khi slot còn trống. Các ảnh thường dùng slot ảnh xe; không dùng nhầm slot QR cho ảnh thường, không ghi đè QR đã lưu. Ảnh, video và dữ liệu cũ vẫn được giữ, không đổi schema hoặc cơ chế gửi Telegram.
- Phí quá hạn thực tế cho nhập 0 hoặc số đã thỏa thuận. Thiếu giá ngày thì để trống ô phí thay vì hiển thị số 0 chưa được xác nhận. Đổi giờ trả trong cùng nhóm trả trễ / trả sớm hoặc đổi đơn giá gợi ý không ghi đè số tiền đã nhập; đổi từ trễ sang sớm hoặc ngược lại đưa khoản điều chỉnh về 0 để tránh đảo dấu phí thành giảm doanh thu. Miễn phí về 0 loại khoản thu quá hạn cũ bị ẩn khỏi dữ liệu xác nhận; không tạo phiếu thu 0đ.
- Thu/hoàn cọc xuất hiện trước ảnh; thời điểm, GPS, phí sửa chữa và hướng dẫn để trong phần mở rộng. Thiếu quyết định hoàn cọc thì nêu đúng lỗi và đưa tiêu điểm tới mục cần chọn. Không luôn hiện cảnh báo đỏ trong chân hộp thoại. Vẫn cần quyết định đã hoàn / chưa hoàn cọc để không ghi sai tiền.
- Bổ sung ảnh sau khi xe đã trả chỉ lưu hồ sơ; không có nút xác nhận trả lại hoặc yêu cầu quyết toán lần hai. Enter tiếp tục không xác nhận trả xe.

## Kiểm chứng

- `node scripts/check-return-refunds.cjs`: PostgreSQL TEMP và rollback, có phí quá hạn thực tế 0đ / 50.000đ, giữ nguyên cọc/tiền đã thu và không tạo phiếu chưa thu.
- `python scripts/check-return-compact-ui.py --url <url> --cookie-file <ignored-file> --browser chromium|webkit`: form ngắn, tiêu điểm báo lỗi, phí 0, khoản thu bị ẩn, gộp ảnh xe + QR, lưu thất bại rồi thử lại, QR dùng lại khi hoàn cọc, bổ sung ảnh hợp đồng đã trả và chọn xe bằng biển số. API / Cloudinary được giả lập hoàn toàn.
- Hồi quy đọc QR hoàn cọc, thu/hoàn cọc, bổ sung ảnh sau trả và các kiểm tra gửi toàn bộ ảnh/video trước một nội dung tổng hợp.
- Typecheck, lint và build trước push; kiểm tra bản deploy trước khi báo hoàn tất.

Video, ảnh hội thoại, ảnh kiểm thử, cookie QA và đối chiếu dữ liệu thật giữ ngoài Git trong `.backups/return-ux-20261021/`. Không chuyển xe, phát hành/đóng hợp đồng, thu/hoàn tiền hoặc gửi/xóa Telegram thật để thử.

Kết quả trước push: 12 tình huống mới trên mỗi Chromium / WebKit, 22 tình huống thu/hoàn cọc, 14 tình huống đọc QR và 6 tình huống tách lưu ảnh khỏi xác nhận trả đều đạt; không lỗi JavaScript. Máy chủ đạt 13 nhóm thu/hoàn cọc, 5 nhóm QR và 4 nhóm delivery Telegram. Build, typecheck, lint thành công; 3 cảnh báo hook cũ không thay đổi. Các tình huống WebKit được tách bằng trang mới để tránh lỗi hủy fetch giả lập của Playwright khi điều hướng toàn trang.
