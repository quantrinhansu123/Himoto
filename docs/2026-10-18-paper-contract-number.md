# Số hợp đồng giấy và nút gửi Telegram

- Số nhập ở “Mã hợp đồng / Số HĐ giấy” trở thành số chính thức khi hoàn tất, dùng chung trong danh sách, chi tiết, phiếu thu, mẫu in và Telegram. Giữ số 0 đầu; chỉ bỏ khoảng trắng ở hai đầu. Tối đa 32 ký tự, chặn ký tự điều khiển.
- Có thể nhập/sửa/xóa số khi còn nháp. Để trống thì lúc phát hành cấp YYMMDD-NNNN. Mã nội bộ NHAP-/EXCEL- không trở thành số HĐ giấy. Mã EXCEL của nguồn nhập vẫn được giữ để ngăn nhập trùng.
- Kiểm tra trùng trên cả số chính thức và mã nháp, kể cả hợp đồng ở cơ sở khác. Tài khoản cơ sở chỉ nhận kết quả có/không, không đọc được hợp đồng cơ sở khác. Khóa giao dịch theo số để tuần tự hóa việc giữ số/phát hành; cấp tự động bỏ qua số đã được một nháp khác giữ.
- Migration `sql/2026-10-18-paper-contract-number.sql` chỉ thêm hàm kiểm tra số và quyền thực thi cho ứng dụng; không tự sửa hợp đồng hay gửi tin.
- Bản xem Telegram dùng số hiện tại. Thông báo đã xếp/gửi giữ nguyên ảnh chụp dữ liệu và nhật ký gửi. Nếu số được đối chiếu sửa lại, giao diện chỉ rõ mã lần gửi trước và cho phép chủ động gửi bản cập nhật; không tự gửi lại tin cũ.
- Khi nội dung đã gửi thành công, nút hiển thị “Đã gửi Telegram” và lý do khóa gửi trùng. Đang gửi/mất phản hồi/thiếu quyền có trạng thái riêng. Bản cập nhật mới được gửi vẫn đi qua kiểm tra quyền, ảnh chưa lưu, nội dung thay đổi và mã yêu cầu chống lặp.

Đối chiếu dữ liệu yêu cầu: Mỹ Ngọc đã nhập `000867` nhưng được cấp `261018-0004`; Đức Anh đã nhập `007180` nhưng được cấp `261018-0005`. Việc sửa đúng hai hồ sơ giữ nhật ký `management_composer.number_corrections`, lưu bản sao trước sửa, không sửa tiền, phiếu thu, dòng xe hay các thông báo Telegram đã gửi. Số tự động cũ được giữ làm mã tham chiếu để chặn cấp lại cho hợp đồng khác; số giấy gốc vẫn có trong snapshot và nhật ký.

Kiểm tra: draft unit, finalize trên PostgreSQL TEMP (số giấy/phiếu thu/trùng số/cấp tự động), phân quyền cơ sở trên schema rollback, Telegram bằng transport giả, nhập Excel TEMP, typecheck/lint/build; Chromium 1440px và WebKit 390px với mọi API ghi được giả lập. Không tạo hợp đồng, phiếu thu hoặc gửi Telegram thật khi chạy QA.
