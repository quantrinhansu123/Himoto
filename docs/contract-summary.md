# Bộ đếm hợp đồng theo bộ lọc

Năm ô thống kê trên Hợp đồng và Log dùng toàn bộ kết quả sau khi lọc cơ sở, khách hàng, từ khóa, trạng thái, loại thuê và ngày bắt đầu thuê. Chuyển trang, đổi số dòng hoặc sắp xếp không làm thay đổi số liệu.

Quy tắc đã được người dùng xác nhận ngày 08/10/2026:

- **Số hợp đồng:** số dòng hợp đồng phù hợp, gồm nháp và đã hủy. Một hợp đồng có nhiều xe chỉ đếm một lần.
- **Số Blacklist:** số khách hàng duy nhất có trạng thái Blacklist trong các hợp đồng phù hợp; dùng ID khách và trạng thái hồ sơ hiện tại. Nhiều hợp đồng của cùng khách chỉ đếm một khách. Không suy Blacklist từ ghi chú hoặc trạng thái hợp đồng.
- **Tổng tiền:** tổng `total_amount` của các hợp đồng phù hợp, bỏ nháp và đã hủy. Đây là tiền hợp đồng, không phải tổng thu hoặc tiền cọc.
- **Công nợ:** cộng `max(total_amount - paid_amount, 0)` riêng từng hợp đồng ở trạng thái `renting`, `overdue`, `wait_payment`, `bad_debt`. Bao gồm nợ xấu. Tiền thu dư của một đơn không bù nợ đơn khác. Đây là công nợ tạm tính theo số đã ghi nhận, không thay thế quyết toán/phí phát sinh.
- **Nợ xấu:** phần công nợ trên chỉ thuộc các hợp đồng trạng thái `bad_debt`. Không tự chuyển đơn quá hạn hoặc đơn của khách Blacklist thành nợ xấu.

`paid_amount` là `orders.pid` (tổng đã thu), không phải cọc riêng. Nháp có tiền trong snapshot vẫn không phát sinh thống kê tiền/công nợ. Thiếu số liệu cần thiết thì ô liên quan hiển thị `—`, không coi thiếu là 0 hoặc công bố tổng một phần. Không có kết quả thì hiển thị 0; đang tải/lỗi thì hiển thị `—`.

Tính toán chỉ đọc dữ liệu API hiện có, không thêm truy vấn hay thay đổi bảng vận hành.

Kiểm tra: `npm.cmd run test:contract-summary`, `npm.cmd run test:management`, `npm.cmd run typecheck`, `npm.cmd run lint`. UI được kiểm tra với toàn bộ `/api/**` giả lập.
