# Hai tab tải ảnh và thông tin khách quá hạn

- Tải nhanh / Hàng loạt là tab mặc định. Tải ảnh chi tiết giữ phần chọn từng vị trí trong mục mở rộng; thư viện đã lưu và giấy tờ bổ sung tiếp tục thu gọn. Hai tab dùng chung các ảnh đang chọn, không bắt buộc đủ các vị trí ảnh. Giữ nút lưu gần nút chọn ảnh; chuyển tab không xác nhận trả xe hoặc gửi Telegram.
- Tab có liên kết ARIA với nội dung, phím trái/phải, Home/End và trạng thái tiêu điểm. Mục chi tiết và các ảnh đang chọn vẫn được giữ khi chuyển tab.
- Danh sách Hợp đồng quá hạn có thời gian ngày / giờ / phút, phí quá hạn tạm tính và tiền thuê còn thiếu. Điện thoại hiển thị đủ ba thông tin trên từng thẻ. Bộ lọc ngày vẫn tính ngày tròn; sắp xếp mặc định theo tổng phút để không gộp xe trễ vài giờ vào cùng mức 0 ngày.
- Thời gian lấy xe chưa trả lâu nhất trong hợp đồng; phí cộng từng xe đang trễ, bỏ qua xe đã trả và xe chưa đến hạn. Phí dùng cùng nguồn giá thuê ngày và hàm tính khi trả xe (20.000đ/giờ mặc định, ngày tròn và phần lẻ trên 8 giờ). Giá ngày chưa xác định thì báo Cần đối chiếu; không hiển thị phí 0 giả. Số tiền cuối vẫn do nhân viên chốt theo thực tế.
- Phí tạm tính không cộng vào doanh thu/công nợ, không tạo phiếu tiền, không trừ cọc. Công nợ thuê hiển thị riêng. Chỉ danh sách quá hạn đọc thêm hạn trả và giá từng dòng; giữ nguyên truy vấn nhẹ của các danh sách khác, phân quyền và các phiếu đã ghi.

Kiểm chứng: `node scripts/check-contract-overdue.cjs --live-read` kiểm tra mốc giờ/ngày, nhiều xe, xe đã trả, thiếu giá, lọc/sắp xếp/phân trang/export và hydration; phần dữ liệu thật chạy trong giao dịch READ ONLY. `check-contract-overdue-ui.py` kiểm tra cột/thẻ, lọc 0 ngày và sắp xếp tiền. `check-return-compact-ui.py` kiểm tra hai tab, bàn phím, giữ ảnh/QR chưa lưu, các trường ảnh tùy chọn và hồi quy phí 0. `check-return-photo-separation-ui.py` kiểm tra lưu ảnh không trả xe lại. API nghiệp vụ/Cloudinary trong kiểm tra giao diện được giả lập, không gửi Telegram thật.

Ảnh kiểm thử và kết quả nằm ngoài Git tại `.backups/media-tabs-overdue-20261021/`. Chạy typecheck, lint và build trước push, kiểm tra deployment sau push.

Kết quả: 14 tình huống ảnh/trả xe trên mỗi Chromium và WebKit, 3 tình huống danh sách quá hạn trên mỗi trình duyệt, 6 tình huống tách lưu ảnh khỏi trả xe và 5 nhóm hồi quy phân trang đạt. Đã xem ảnh desktop/điện thoại; nút Telegram trên thẻ quá hạn nằm dưới thông tin để tránh làm cột nội dung bị bó hẹp. Typecheck/build thành công; lint không có lỗi, còn 3 cảnh báo hook có từ trước.

Kiểm tra máy chủ đạt 7 nhóm gồm READ ONLY trên dữ liệu thật (10/135 hợp đồng, khoảng 1,3 giây) và đối chiếu hạn trả/múi giờ/giá ngày với màn trả xe. Dòng dữ liệu cũ không còn liên kết xe được bỏ khỏi phần ước tính như màn trả xe; không sửa dữ liệu nguồn hoặc lịch sử hợp đồng.
