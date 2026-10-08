# Khớp cơ sở khách hàng theo căn cước

Tại **Khách hàng → Khớp cơ sở theo căn cước**, chọn **Tải mẫu Excel căn cước / cơ sở**. Sheet dữ liệu chỉ có hai cột **Căn cước**, **Cơ sở**; sheet **Cơ sở** liệt kê ID, mã và tên hiện có, có danh sách chọn tên trong cột cơ sở. Mẫu trống, không xuất dữ liệu khách hàng thật.

Điền số căn cước (12 số) hoặc CMND (9 số) dưới dạng Text, giữ số 0 đầu. Cơ sở nhận tên, mã hoặc ID khớp duy nhất; so tên không phân biệt hoa thường, dấu tiếng Việt và khoảng trắng. Có thể đổi thứ tự cột. Các tiêu đề Căn cước, Số căn cước, CCCD, Số CCCD, CCCD / CMND, CMND được nhận diện. Chỉ nhận `.xlsx`, tối đa 5 MB; không dùng công thức hoặc tự thêm số 0 đã mất. File trên 1.000 dòng được đọc hết và tự động gửi nối tiếp từng phần tối đa 1.000 dòng, không cần tách file. Số dòng gốc trong Excel được giữ nguyên, kể cả vượt dòng 10.000 hoặc có khoảng trống.

Tải file lên để xem khách hàng khớp, cơ sở hiện tại, nội dung cơ sở từ Excel và cơ sở sẽ lưu. Kết quả nối thêm sau từng phần, có tiến độ số dòng đã đối chiếu; chỉ bật cập nhật khi đã kiểm tra đủ file. Mỗi căn cước phải khớp đúng một khách hàng đã có. Mọi dòng căn cước trùng trong file đều bị bỏ qua, kể cả cùng cơ sở hoặc nằm ở hai phần khác nhau; toàn bộ file được kiểm tra trùng trước khi gửi phần đầu tiên. Không tìm thấy khách, nhiều hồ sơ trùng căn cước, căn cước sai hoặc cơ sở không rõ được báo ở từng dòng. Dòng đã đúng cơ sở giữ nguyên.

Chọn **Cập nhật cơ sở cho N khách hàng** để lưu các dòng cần cập nhật; dòng lỗi bị bỏ qua. Chỉ đổi `customers.store_id` và thời điểm `updated_at`, giữ nguyên giấy tờ, trạng thái, ghi chú và các thông tin khác. Không tạo khách hàng mới, chuyển xe, sửa hợp đồng hoặc giao dịch. Nếu chưa có căn cước trong hồ sơ khách, cần bổ sung giấy tờ trước để đối chiếu.

API `POST /api/auth/customers/match-stores` dùng phiên admin và kiểm tra cùng origin. Mỗi request tối đa 1.000 dòng và 2 MB. `commit: false` chỉ đọc và trả revision SHA-256 của kết quả từng phần. Khi lưu, gửi lại toàn bộ dòng trong phần đó và revision đã xem trước; server khóa bảng khách, khóa đọc các cơ sở, đối chiếu lại rồi cập nhật phần đó trong một transaction. Phần không có dòng cần cập nhật được bỏ qua. Nếu khách, cơ sở hoặc file thay đổi ảnh hưởng kết quả, hoặc số dòng cập nhật không đủ, rollback phần đang lưu và dừng gửi các phần tiếp theo. Những phần trước đã lưu được giữ lại; lỗi hiển thị số khách đã xác nhận lưu. Nhấn **Kiểm tra lại** để xác định phần còn lại. Mất phản hồi khi lưu cũng yêu cầu kiểm tra lại vì phần vừa gửi có thể đã được lưu; các dòng đã cập nhật được nhận diện là đã đúng cơ sở và không ghi lại.

Kiểm chứng:

```powershell
npm.cmd run test:customer-stores
npm.cmd run test:customer-stores -- --live-temp
python scripts/check-customer-store-excel-ui.py --url http://127.0.0.1:3009 --session-cookie-file .backups/customer-store-qa-cookie.txt --output .backups/customer-store-ui
```

Kiểm thử DB dùng mock hoặc PostgreSQL TEMP trên một kết nối và rollback transaction ngoài cùng. TEMP sao chép schema khách và thay ID default bằng identity riêng trước khi INSERT. Không ghi bảng/sequence vận hành. Browser giả lập toàn bộ `/api/**`; phiên QA dùng admin hiện hữu, không tạo/nâng quyền tài khoản.
