# Phí quá hạn của hợp đồng thuê sở hữu cũ

Hồ sơ thuê sở hữu nhập từ app cũ, chưa có lịch đóng tiền, hiển thị **Phí trễ tạm tính** ở cột Số tiền và tách **Nợ thuê đã ghi nhận** bên dưới. Các khoản theo lịch đóng tiền tiếp tục dùng kỳ đến hạn. Phí tạm tính được đọc lại theo thời gian; nhân viên xác nhận phí thực tế khi trả xe/đối chiếu.

Quy tắc đã đối chiếu trực tiếp mã nguồn và dữ liệu trên `app.himoto.vn` ngày 27/10/2026: miễn đến 30 phút; sau đó làm tròn phút sang giờ gần nhất, đủ 24 giờ tính một ngày, giờ lẻ từ 8 giờ tính thêm một ngày. Đơn giá riêng trên dòng xe được ưu tiên, còn lại dùng dòng đầu theo ID trong bảng `pricing` đã nhập. Xe số/ga 15.000đ/giờ, xe côn 25.000đ/giờ; giữ cách tính giờ bằng 0 của xe điện/SH ở app cũ. Dòng có tổng giá chốt dương không cộng phí quá hạn. Thiếu dữ liệu giá cần đối chiếu, không suy thành 0đ.

Phí cộng trên các xe còn thuê; xe đã trả và thời gian chưa đến hạn không phát sinh. Nợ xấu giữ mốc chốt. Danh sách, bộ lọc/sắp xếp, xuất dữ liệu và báo cáo xử lý nợ dùng cùng kết quả. Báo cáo gửi thủ công hiển thị riêng nợ đến hạn và phí quá hạn tạm tính.

Việc đọc danh sách không ghi phí vào tổng hợp đồng, tạo phiếu, trừ cọc, cập nhật kho hoặc gửi thông báo. Luồng chốt phí thực tế khi trả xe giữ việc nhân viên đối chiếu/xác nhận. Migration `2026-10-27-legacy-ownership-overdue-pricing.sql` chỉ cấp quyền đọc bốn cột tham chiếu `id,type,price_type,price` cho `himoto_scoped`; phạm vi hợp đồng/khách tiếp tục theo RLS.

Kiểm thử: công thức và mốc làm tròn của app cũ; cả ba mẫu VPS-29986/VPS-31140/VPS-28513; giá riêng, tổng giá chốt, thiếu giá, nhiều xe, xe đã trả, nợ xấu, lịch đóng tiền; truy vấn trang/xuất và cache giá trong một lượt đọc. Kiểm tra API thật theo quản trị/nhân viên cơ sở, chặn đọc ngoài cơ sở và so hash 3 hợp đồng, 3 dòng xe, các phiếu trước/sau. Giao diện Chromium/WebKit dùng dữ liệu giả, bản production chỉ đọc.
