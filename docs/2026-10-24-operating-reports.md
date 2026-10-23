# Hợp đồng, GPS và báo cáo cuối ngày — 24/10/2026

- Danh sách hợp đồng gộp bắt đầu / dự kiến trả trong cột **Thời gian thuê**, gồm thẻ điện thoại và CSV. Ô **Toàn bộ hợp đồng** đếm độc lập với tab, tìm kiếm và ngày, trong phạm vi cơ sở / quyền truy cập. Chỉ tải chi tiết trang đang chọn.
- Đồng nhất danh sách phân trang với nguồn hợp đồng xe: loại bản ghi neo lịch sử thuê pin (`legacy_migration.sourceStoreId=30`), đã có ở module Hợp đồng pin. Không xóa bản ghi hay phiếu thu. Snapshot CS Thuê sở hữu: 239 bản ghi cũ = **198 hợp đồng xe + 41 neo lịch sử pin**; 128 đang thuê, 68 hoàn thành, 2 chờ thanh toán. Quá hạn là tập con đang thuê, hiện 60. Các báo cáo QA 23/10 ghi lại kết quả của phiên trước, không phải số chuẩn sau sửa phân loại.
- GPS lấy thêm xe chưa ghép thiết bị và bỏ giới hạn 2.000 thiết bị. Đếm tổng xe không trùng; bộ đếm trạng thái vẫn theo thiết bị. Tách rõ **Chưa gắn GPS**, **Chưa cập nhật**, **Không còn trong tài khoản GPS**. Không đổi quy tắc ON/OFF, nhịp 5 giây hoặc tự sửa ghép xe.
- Mở **Báo cáo nợ chậm** trên GPS mới đọc hợp đồng quá hạn / nợ xấu. Có nợ đến hạn, phí trễ tạm tính, GPS, liên hệ, ghi chú theo ngày, tình trạng khách, PGD xử lý / chuyển XLN. Ghi chú có phiên bản và lịch sử; không ghi đè âm thầm. Xem trước rồi gửi báo cáo của một PGD vào nhóm đã cấu hình; tin dài chia đoạn. Cùng nội dung/ngày không gửi trùng.
- Form trả xe thu gọn thời gian thuê, bảng đối chiếu tiền và hồ sơ xe đã trả. Tin Telegram thường còn khách, biển số, xe, cọc, quá hạn, hoàn cọc, hình thức và mã HĐ. Chỉ thêm phí sửa chữa / giảm trả sớm / khoản thu khi phát sinh; giữ thông tin chờ kế toán hoàn cọc. Ảnh/video và dữ liệu quyết toán giữ nguyên.

## Báo cáo thuê sở hữu

Trong **Báo cáo cuối ca**, chọn mẫu Thuê sở hữu ở tab Thông tin (tự chọn cho cơ sở thuê sở hữu). Báo cáo mới tự thống kê hợp đồng và thu chi ngày; tab **Thuê sở hữu & Telegram** có mẫu bốn phần, số liệu ngày/tháng và xem trước nội dung. Tự điền lại giữ các ô đã nhập thực tế; lỗi đọc giữ nguyên form.

- Xe đang chạy đếm ID xe không trùng từ hợp đồng đang thuê. Kỳ hạn chỉ lấy trường đã lưu; hợp đồng VPS thiếu kỳ hạn nằm trong nhóm chưa xác định. Không suy kỳ hạn từ ngày dự kiến trả đã gia hạn. Kho là tổng xe chưa bán tại cơ sở, khác với số xe đang thuê.
- HĐMM theo ngày bắt đầu thuê; khách trả xe trong tháng theo thời điểm trả thực tế trên dòng xe, đếm ID khách không trùng (thiếu ID thì để chưa xác định). Thu/chi theo phiếu đã duyệt và múi giờ Việt Nam; cộng doanh thu tháng đến ngày báo cáo. Gia hạn cũ `addon` được tính đúng. “Lãi thuê” là doanh thu thuê thuần, chưa trừ chi phí vận hành.
- Chưa có dữ liệu bảo lưu hoặc lượt mua/chuyển sở hữu trong app cũ / DB đang dùng; các bảng lease và chuyển sở hữu cũ đều rỗng. Chưa có luồng bán pin/sạc đầy đủ. Các mục này và tổng doanh thu pin/sạc tháng để trống, nhập theo sổ thực tế. Không dùng số ví dụ của người dùng làm mặc định.
- TK THU đối chiếu tài khoản cá nhân được phân công PGD; TK CTY đối chiếu tài khoản công ty được phân công. Thiếu tài khoản nguồn hiện chưa đối chiếu. Số thực tế / sổ độc lập phải nhập; không tự sao chép rồi ghi “Khớp”. Không lấy tồn kho hiện tại thay cho ngày quá khứ chưa có snapshot.
- Chốt kiểm tra đủ số, tổng kỳ hạn và an toàn cuối ca; đọc lại nguồn tài chính trên server, khóa báo cáo và ghi hàng đợi cùng giao dịch. Sau COMMIT, gửi vào nhóm `ownership_new` hiện có. Mã gửi gắn ID báo cáo, replay lưu không tạo tin mới. Gửi lỗi không mở khóa hay xóa báo cáo; kết quả không rõ không tự gửi lại. Không có lịch gửi theo giờ tự chạy khi báo cáo chưa được chốt.

SQL bổ sung: `docs/sql/2026-10-24-operating-reports.sql` (ghi chú/lịch sử/hàng đợi báo cáo, RLS theo PGD). Đã áp dụng thêm bảng; không sửa dữ liệu nghiệp vụ. Không gửi Telegram thật trong QA.
