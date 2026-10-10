# Sổ quỹ / Sổ két

Cập nhật 08/10/2026. `/cashbook` đọc giao dịch thật từ Supabase qua GET `/api/auth/transactions`, trong phiên admin. Không fallback dữ liệu demo. Hai bảng Phiếu Thu và Phiếu Chi dùng chung 12 cột:

| Cột | Nguồn / ý nghĩa |
| --- | --- |
| ID | ID giao dịch |
| Ngày | Ngày phát sinh |
| Giờ | Giờ phát sinh, giữ giây nguồn |
| Loại phiếu | `in`/`addon` là Thu; `out` là Chi |
| Người thực hiện | Người tạo phiếu, liên kết `user_id` |
| Số tiền | `transactions.value` |
| Mã hợp đồng | `order_id` liên kết hợp đồng; bấm để mở đúng hợp đồng |
| Hình thức thanh toán | Tiền mặt / Chuyển khoản / CK tài khoản công ty / hỗn hợp theo dữ liệu lưu |
| Tài khoản nhận / chi | Ngân hàng/chủ tài khoản/số tài khoản hoặc két tiền mặt |
| Cơ sở | Cơ sở của giao dịch |
| Lý do | Tên nghiệp vụ; `order:payment` hiển thị Thanh toán hợp đồng, `order:renewal` Thu tiền gia hạn, `order:extra` Phiếu thu thêm hợp đồng |
| Nội dung | `desc` hoặc `note`; thu hợp đồng mặc định `Gia hạn hợp đồng_<mã hợp đồng>` |

Thanh toán từ Hợp đồng tạo một phiếu Thu riêng mỗi lần và cập nhật Tổng đã thu cùng transaction, xem [contract-payments.md](contract-payments.md). Danh sách Sổ quỹ tự tải dữ liệu mới khi mở lại; đang ở trang có thể bấm Tải lại. Không có thao tác tạo/sửa/xóa phiếu trực tiếp tại danh sách này.

Tìm không dấu theo ID, người thực hiện, mã hợp đồng, hình thức, tài khoản, cơ sở, lý do và nội dung. Bộ lọc người thực hiện bằng ID, ngày từ/đến gồm cả hai đầu và cơ sở dùng dropdown chung. Mỗi bảng sắp xếp/phân trang riêng, 5/10/20/50 dòng. CSV xuất đủ 12 cột theo bộ lọc, escape công thức spreadsheet. Khoảng ngày ngược báo lỗi và khóa xuất. Số tiền 0 là giá trị hợp lệ; trường thiếu hiển thị **—**.

Giờ có timezone đổi sang Asia/Ho_Chi_Minh; giờ không timezone giữ thành phần nguồn. API không tự tạo phiếu hoặc thay lịch sử. Adapter kiểm tra tổng/trang, ID trùng và loại giao dịch; lỗi quyền/mạng/cấu trúc báo lỗi, không âm thầm bỏ phiếu hoặc thay fixture. API hiện trả toàn bộ danh sách một lần; adapter vẫn hỗ trợ dữ liệu phân trang.

Hai bảng xếp dọc, cuộn ngang để xem đủ cột trên màn nhỏ. Số đếm theo bộ lọc là số phiếu, không phải số dư. Không tự tính/cập nhật số dư đầu kỳ.

Kiểm tra dữ liệu bằng `npm.cmd run test:cashbook`; kiểm tra tích hợp thanh toán bằng `scripts/check-contract-payments-ui.py` (mọi API giả lập), lint/build. Kết quả mới nằm trong `.backups/contract-payments/`; ảnh ở `docs/qa/cashbook/` là QA phiên bản cũ 7 cột, không dùng làm bằng chứng cho 12 cột hiện tại.
