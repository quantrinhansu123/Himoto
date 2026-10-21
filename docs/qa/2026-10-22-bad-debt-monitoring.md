# Chờ tất toán và theo dõi Nợ xấu

- Đổi tên hiển thị trạng thái `wait_payment` từ **Chờ thanh toán** thành **Chờ tất toán**. Tên này phù hợp cả trường hợp còn công nợ và trường hợp đã thu đủ nhưng chưa đóng/đối chiếu hợp đồng. Không thay mã trạng thái hoặc dữ liệu cũ.
- **Nợ xấu** là trạng thái hợp đồng `bad_debt` đã được đánh dấu theo nghiệp vụ khách không trả xe. Không tự suy từ số ngày quá hạn, số tiền thiếu hoặc blacklist khách hàng.
- Thêm nhóm **Nợ xấu + số lượng** cạnh các nhóm ngày ở thuê thường và thuê sở hữu. Đếm toàn bộ kết quả khớp cơ sở, từ khóa và bộ lọc trước phân trang; bộ đếm giữ nguyên khi chuyển giữa nhóm ngày và Nợ xấu. Nợ xấu không cộng vào các nhóm ngày quá hạn.
- Danh sách quá hạn có thể đọc hợp đồng Nợ xấu ngay cả khi thiếu ngày hẹn trả hoặc ngày hẹn còn ở tương lai. Khi mở trang thuê thường, nhóm Quá hạn được chọn mặc định; bấm Nợ xấu để chuyển nhóm.
- Dòng Nợ xấu có nhãn đỏ và số **tiền thuê còn thiếu** đã ghi nhận. Không dùng phí trễ tạm tính làm giá trị Nợ xấu, không tự ước tính tổn thất giá trị xe hoặc trừ tiền cọc. Hợp đồng Nợ xấu còn thiếu 0đ vẫn xuất hiện và được đếm.

SQL vẫn giới hạn phạm vi danh sách và RLS. Riêng màn hình theo dõi giữ tập ứng viên trước lọc trạng thái, để các nút nhóm có số đếm đầy đủ. Các danh sách trạng thái thông thường giữ cách tối ưu cũ. Xuất CSV và phân trang dùng chung điều kiện lọc. Không có migration, không cập nhật khách hàng, hợp đồng, xe hoặc chứng từ vận hành.

Kiểm tra dữ liệu:

```powershell
node scripts/check-contract-monitoring.cjs
node scripts/check-management-table.cjs
node scripts/check-contract-overdue.cjs
node scripts/check-contract-summary.cjs
node scripts/check-contract-payments.cjs
npm.cmd run build
```

Đã kiểm tra READ ONLY trên nguồn thật: nhóm Nợ xấu và bộ đếm khớp nhau, số đếm không đổi khi chuyển về Quá hạn cho cả hai loại thuê; tài khoản Láng lọc cơ sở ngoài quyền trả danh sách rỗng và số đếm 0. Hai lượt đọc thuê thường khoảng 3.5 giây, hai lượt thuê sở hữu khoảng 4.3 giây trên kết nối kiểm thử.

Browser: `scripts/check-contract-monitoring-ui.py` dùng hợp đồng và API giả lập để kiểm tra nhóm tuổi nợ, Nợ xấu, số dư 0, ngày hẹn tương lai, chọn cơ sở, nhãn Chờ tất toán và bố cục desktop/mobile trên Chromium/WebKit. Ảnh và kết quả riêng tại `.backups/bad-debt-20261022/`, được Git ignore. Không gửi Telegram và không ghi dữ liệu nghiệp vụ thật.
