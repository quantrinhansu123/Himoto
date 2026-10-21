# Chụp đăng ký xe để điền số khung, số máy

- Thêm và sửa xe có chụp camera sau / chọn ảnh thư viện, xem ảnh, bỏ ảnh, đọc lại và bỏ qua AI. Ảnh được xử lý theo giới hạn hiện có rồi gửi trực tiếp đến OCR, chỉ dùng để đọc; chưa lưu ảnh đăng ký vào hồ sơ xe.
- OCR chỉ trích xuất `chassis` và `engine`, giữ chuỗi và số 0 đầu, không tự đổi biển số hay thông tin xe khác. Chỉ điền ô trống hoặc giá trị AI đã điền; không ghi đè giá trị nhập tay trước hoặc trong lúc chờ. Đổi/bỏ ảnh và đóng/lưu form hủy kết quả cũ. Lỗi/quota/ảnh thiếu trường vẫn cho phép nhập tay và lưu theo kiểm tra xe hiện có.
- API dùng quyền `vehicles.write` cho `vehicle_registration`; OCR giấy tờ khách hàng vẫn cần `customers.write`. Không cấp thêm quyền, sửa dữ liệu thật hay gọi Telegram khi QA.
- Kiểm tra: `npm.cmd run test:vehicle-registration-ocr` kiểm tra hai trường, phần thiếu, bảo toàn nhập tay, schema Gemini và toàn bộ API wrapper với phiên giả lập; `check-photo-ocr.cjs` và `check-refund-qr.cjs` kiểm tra hồi quy OCR cũ. `scripts/check-vehicle-registration-ocr-ui.py` chạy Chromium/WebKit, chặn toàn bộ API nghiệp vụ và giả lập phản hồi OCR, kiểm tra cả POST/PATCH xe khi bấm lưu.
- Thử Gemini thật bằng ảnh chữ tổng hợp: số khung/động cơ thông thường cần khớp chính xác. Một mẫu khó chứa đồng thời chữ O và số 0 được Gemini đọc nhầm chữ O thành 0, kể cả khi prompt yêu cầu chép nguyên ký tự. Đây là giới hạn OCR, không được coi là kiểm định số xe; giao diện hiển thị lưu ý 0/O, 1/I và yêu cầu đối chiếu trước khi lưu. Các test giả lập bảo đảm ứng dụng không tự thay các ký tự đã nhận từ OCR.

Ảnh và kết quả QA nằm ngoài Git ở `.backups/vehicle-registration-20261021/`. Không gửi giấy tờ xe/khách thật cho nhà cung cấp khi kiểm thử.
