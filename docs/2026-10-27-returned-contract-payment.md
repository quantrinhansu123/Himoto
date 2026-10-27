# Thu đủ tiền sau trả xe và hồ sơ xe đã lưu ẩn

Hợp đồng `wait_payment` đã trả toàn bộ xe chuyển sang `completed` khi ghi nhận khoản thu tiền thuê/phí cuối cùng làm công nợ về 0. Quy tắc áp dụng cho hợp đồng thường và hồ sơ nhập bổ sung. Phiếu thu, tổng tiền đã thu và trạng thái được ghi trong cùng transaction; gửi lại cùng mã yêu cầu không tạo phiếu thứ hai.

Chưa trả đủ xe, không có dòng xe hợp lệ hoặc chỉ có dòng đã xóa thì không tự hoàn thành. Nợ xấu và bảo lưu giữ luồng xác nhận riêng. Thu/hoàn cọc không kích hoạt việc chốt công nợ tiền thuê; cọc đang giữ tiếp tục được đối chiếu riêng theo luồng trả xe hiện có.

Danh sách xe cần trả lấy dòng xe của hợp đồng làm nguồn chính. Tài khoản có phạm vi cơ sở đọc thông tin xe qua `contract_vehicle_labels()`, kể cả xe đã chuyển cơ sở hoặc lưu ẩn khỏi kho. Tìm bằng biển số dùng cùng nguồn mô tả xe; không mở quyền đọc hoặc sửa các hợp đồng khác cơ sở. Bản ghi xe thiếu thông tin mô tả không làm mất mã dòng thuê và mã xe gốc.

Không sửa hàng loạt hợp đồng cũ, tự ghi ngày trả xe, tạo phiếu tiền hoặc khôi phục xe lưu ẩn. Nhân viên vẫn nhập ngày trả thực tế và xác nhận khoản đã thu. Kiểm thử nghiệp vụ dùng bảng TEMP/schema riêng và rollback, không thực hiện thanh toán hoặc trả xe trên hợp đồng thật.
