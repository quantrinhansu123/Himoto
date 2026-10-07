# Nhập khách hàng từ Excel

Tại **Khách hàng**, chọn **Tải mẫu Excel**. Sheet **Khách hàng** để nhập dữ liệu, **Cơ sở** chứa ID/mã/tên cơ sở hiện tại, **Hướng dẫn** mô tả định dạng. Mẫu không chứa hồ sơ khách hàng thật.

Các cột khớp với hồ sơ hiện có: Họ và tên, Số điện thoại, CCCD / CMND, Email, Địa chỉ, Cơ sở, Trạng thái hồ sơ, Ghi chú / cảnh báo. Họ tên, điện thoại, CCCD/CMND, địa chỉ và cơ sở bắt buộc. Cơ sở nhận ID, mã hoặc tên duy nhất. Trạng thái để trống là Bình thường. Có ghi chú sẽ hiển thị Cần lưu ý, trừ hồ sơ Blacklist; ghi chú luôn được lưu.

Giữ điện thoại và CCCD/CMND ở dạng **Text** để không mất số 0 đầu. Không dùng công thức. Không tự thêm số 0 vào dữ liệu đã bị Excel làm mất. Họ tên, email, địa chỉ và ghi chú tối đa 191 ký tự theo schema Supabase hiện tại. Chỉ nhận `.xlsx`, tối đa 5 MB và 1.000 khách hàng mỗi lần. Dữ liệu gửi tới API giới hạn 2 MB; file nhiều ghi chú dài cần chia nhỏ.

Chọn **Nhập Excel**, tải file lên và kiểm tra bảng xem trước. Các cột được đối chiếu theo tiêu đề, có thể đổi thứ tự. Dòng thiếu/sai dữ liệu, cơ sở không tồn tại hoặc trùng CCCD/điện thoại trong file/hệ thống được báo theo số dòng. Điện thoại `+84` / `0084` và `0` được đối chiếu cùng một số. Mọi dòng trùng trong file đều được bỏ qua để người dùng chọn lại hồ sơ đúng.

Chọn **Nhập N khách hàng hợp lệ** để lưu những dòng hợp lệ. Dòng lỗi/trùng bị bỏ qua; không cập nhật đè hồ sơ đã tồn tại. Server kiểm tra lại dữ liệu và cơ sở trước khi ghi. Nếu xuất hiện trùng mới sau bước xem trước, cả lần nhập bị hủy và cần **Kiểm tra lại**. Tất cả dòng được lưu trong một transaction; lỗi DB hủy cả lần nhập. Kết quả không xác định do mất mạng cũng yêu cầu kiểm tra lại để tránh nhập lặp.

API `POST /api/auth/customers/import` dùng quyền quản trị và kiểm tra cùng origin như các API hiện có. `commit: false` chỉ kiểm tra trong transaction chỉ đọc; `commit: true` nhập các dòng hợp lệ đã chọn. Bước ghi khóa bảng khách hàng trong transaction ngắn để tránh trùng với các thao tác tạo/sửa đồng thời, có timeout khóa 5 giây và timeout câu lệnh 15 giây. Không thay đổi schema.

Kiểm tra: `npm.cmd run test:customer-import` dùng workbook tự tạo và DB mock, không ghi dữ liệu vận hành. Browser QA dùng dữ liệu giả và chặn mọi request ghi tới DB thật.
