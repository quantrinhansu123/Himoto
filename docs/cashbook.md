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

Thanh toán từ Hợp đồng tạo một phiếu Thu riêng mỗi lần và cập nhật Tổng đã thu cùng transaction, xem [contract-payments.md](contract-payments.md). Danh sách Sổ quỹ tự tải dữ liệu mới khi mở lại; đang ở trang có thể bấm Tải lại. Không có thao tác tạo/sửa phiếu trực tiếp tại danh sách này.

Mỗi bảng có ô tick (tick tiêu đề chọn cả trang); nút **Xóa phiếu đã chọn** gọi DELETE `/api/auth/bulk-delete/transactions` (tối đa 500 phiếu). Xóa vĩnh viễn, tất cả hoặc không phiếu nào. Phiếu thu gắn hợp đồng được trừ lại khỏi Tổng đã thu (`orders.pid`, không âm); phiếu `order:renewal`/`order:extra` trừ thêm khỏi `orders.total`. Ngày trả đã gia hạn không tự lùi lại.

Tìm không dấu theo ID, người thực hiện, mã hợp đồng, hình thức, tài khoản, cơ sở, lý do và nội dung. Bộ lọc người thực hiện bằng ID, ngày từ/đến gồm cả hai đầu và cơ sở dùng dropdown chung. Mỗi bảng sắp xếp/phân trang riêng, 5/10/20/50 dòng. CSV xuất đủ 12 cột theo bộ lọc, escape công thức spreadsheet. Khoảng ngày ngược báo lỗi và khóa xuất. Số tiền 0 là giá trị hợp lệ; trường thiếu hiển thị **—**.

Giờ có timezone đổi sang Asia/Ho_Chi_Minh; giờ không timezone giữ thành phần nguồn. API không tự tạo phiếu hoặc thay lịch sử. Adapter kiểm tra tổng/trang, ID trùng và loại giao dịch; lỗi quyền/mạng/cấu trúc báo lỗi, không âm thầm bỏ phiếu hoặc thay fixture. API hiện trả toàn bộ danh sách một lần; adapter vẫn hỗ trợ dữ liệu phân trang.

Hai bảng đặt song song (Phiếu Thu bên trái, Phiếu Chi bên phải) từ màn rộng 1200px; hẹp hơn thì xếp dọc. Mỗi bảng tự cuộn ngang để xem đủ cột. Số đếm theo bộ lọc là số phiếu, không phải số dư. Không tự tính/cập nhật số dư đầu kỳ.

Bảng **Danh sách TK** (trên hai bảng phiếu) đọc GET `/api/auth/cashbook/accounts`: mọi tài khoản `himoto.banks` và két `himoto.cash`, mỗi dòng có Số dư đầu kỳ (`opening_balance`), Tổng thu (`in`/`addon`), Tổng chi (`out`) và Số dư = đầu kỳ + thu − chi, chỉ tính phiếu `approved` gắn `bank_id`/`cash_id`. Số dư tính trên toàn bộ phiếu, không theo từ khóa/ngày/người thực hiện; chọn cơ sở thì chỉ hiện tài khoản của cơ sở đó và tài khoản công ty dùng chung (`store_id=0`). Phiếu chưa gắn tài khoản không vào số dư nào.

Nút **Thêm tài khoản** gọi POST `/api/auth/cashbook/accounts/{cash|bank}`; Sửa gọi PATCH `/api/auth/cashbook/accounts/{kind}/{id}`. Hai form dùng chung các trường: loại (Tiền mặt / Ngân hàng cơ sở / TK công ty), cơ sở, ngân hàng, chủ tài khoản, số tài khoản, số dư đầu kỳ (số nguyên) và trạng thái (`Active`/`Inactive`). TK công ty lưu `owner_type='company'`, chọn được cơ sở riêng; `store_id=0` là tùy chọn dùng chung mọi cơ sở. Ngân hàng cơ sở lưu `owner_type='unknown'`. Tài khoản ngân hàng mới có `account_type=1` để hiện trong hộp thoại thanh toán hợp đồng. Khi sửa không đổi được giữa két tiền mặt và ngân hàng (hai bảng khác nhau); phiếu cũ giữ nguyên cơ sở và loại tài khoản đã ghi. Gợi ý chủ tài khoản có nút × để ẩn trên trình duyệt hiện tại; sửa tên tài khoản nguồn qua Sửa tài khoản.

Kiểm tra dữ liệu bằng `npm.cmd run test:cashbook`; kiểm tra tích hợp thanh toán bằng `scripts/check-contract-payments-ui.py` (mọi API giả lập), lint/build. Kết quả mới nằm trong `.backups/contract-payments/`; ảnh ở `docs/qa/cashbook/` là QA phiên bản cũ 7 cột, không dùng làm bằng chứng cho 12 cột hiện tại.
