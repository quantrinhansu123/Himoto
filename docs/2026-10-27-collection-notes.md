# Ghi chú tình trạng khách trên báo cáo xử lý nợ

Trong **Định vị GPS → Báo cáo nợ chậm**, cột **Ghi chú tình trạng khách** cho phép nhân viên có quyền cập nhật nhập nhiều dòng, tối đa 3.000 ký tự. Bấm **Lưu ghi chú** để lưu hoặc **Huỷ** để trở về nội dung đã lưu. Nút **Cập nhật** vẫn dùng để sửa tình trạng liên hệ, tình trạng khách và bộ phận xử lý.

Ghi chú dùng trường `notes` hiện có của từng hợp đồng; không cần migration. API giữ quyền `contracts.draft`, phạm vi PGD, kiểm tra revision và lịch sử người cập nhật hiện có. Sửa ghi chú không thay tiền, cọc hoặc trạng thái hợp đồng.

Lỗi mạng giữ nội dung đang nhập. Nếu người khác sửa ghi chú cùng lúc, màn hình hiển thị nội dung mới và yêu cầu chọn dùng ghi chú mới hoặc giữ bản đang nhập trước khi lưu lại; các trường liên hệ/xử lý mới không bị ghi đè bằng dữ liệu cũ. Làm mới sau khi lưu giữ các bản nhập của dòng khác và cập nhật nội dung xem trước báo cáo. Chưa lưu ghi chú thì chưa xem/gửi báo cáo; phần nhập ghi chú không tự gửi Telegram.

Kiểm thử giao diện dùng toàn bộ API giả, bao gồm thao tác lưu, xung đột, mất phản hồi và tải lại. Kiểm thử API/phân quyền dùng bảng TEMP và rollback; kiểm tra production chỉ đọc và không ghi ghi chú thử lên hợp đồng thật.
