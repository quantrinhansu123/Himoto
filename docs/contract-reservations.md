# Nhận cọc giữ xe trước ngày thuê

Khoản giữ xe 100–200k được **trừ vào tiền thuê** khi khách nhận xe. Chức năng nằm tại **Hợp đồng → Nhận cọc giữ xe**, dùng chung trên desktop và mobile.

## Nhận tiền hôm nay

1. Chọn **Cửa hàng xe** đang giữ xe. Gợi ý nhân viên làm hợp đồng tải từ danh sách nhân sự của cửa hàng này.
2. Tra cứu khách bằng SĐT/CCCD; tạo hồ sơ nếu chưa có. Cơ sở nguồn khách/doanh thu lấy theo hồ sơ và có thể chỉnh ở **Liên kết nguồn khách**. Việc này giữ nguyên cửa hàng xe và nhân viên đã chọn.
3. Chọn xe, **Dự kiến nhận xe**, hẹn trả và tiền thuê dự kiến. Ngày nhận mặc định là ngày mai. Chọn xe đầu tiên sẽ đồng bộ cửa hàng xe theo cơ sở hiện đang giữ xe (`current_store_id`, dự phòng `store_id`). Nếu đổi sang cơ sở khác, chọn lại nhân viên tại đó.
4. Bấm **Ghi nhận cọc giữ xe**, nhập đúng số đã nhận (ví dụ 100.000 đ), hình thức, tài khoản nhận và thời điểm nhận thực tế.
5. Bấm **Xác nhận đã nhận cọc giữ xe**. Đơn có mã và trạng thái **Đã cọc, chờ nhận xe**; phiếu Thu liên kết với mã đơn xuất hiện trong Sổ quỹ, số dư két/tài khoản tăng theo khoản đã nhận.

Địa chỉ, người thân và ngày ký có thể bổ sung trước khi in hợp đồng. Xem mẫu in vẫn kiểm tra đầy đủ thông tin. **Lưu nháp** chỉ giữ thông tin để nhập tiếp, chưa ghi nhận tiền hoặc giữ xe chính thức.

Tiền giữ xe được ghi vào tiền thuê đã thu; không nhập vào ô tiền cọc bảo đảm hoàn trả. Ví dụ tiền thuê dự kiến 300.000 đ, đã giữ xe 100.000 đ: đã thu tiền thuê 100.000 đ, còn phải thu 200.000 đ, cọc bảo đảm đã thu 0 đ.

## Khi khách nhận xe

Trong danh sách Hợp đồng, mở **ba chấm → Giao xe → Xác nhận giao xe**. Đơn chuyển sang **Đang thuê**, xe chuyển sang Đang thuê tại kho hiện tại. Mã đơn và tiền đã thu được giữ nguyên; thao tác giao xe không tạo phiếu thu thêm.

Nếu còn tiền thuê, hệ thống mở thanh toán trong Sổ quỹ để ghi khoản còn lại. Nếu đã trả đủ trước lúc nhận xe thì không mở form thu thêm. Có thể vào **ba chấm → Thanh toán** ngay khi đơn đang chờ giao để ghi thêm tiền trả trước.

Ví dụ trên: nhận 100.000 đ hôm nay, thu thêm 200.000 đ khi giao xe. Hợp đồng ghi tổng đã thu 300.000 đ, công nợ 0 đ; Sổ quỹ có hai phiếu Thu 100.000 và 200.000 đ. Số dư tài khoản tăng tổng 300.000 đ.

## Dữ liệu và kiểm thử

Dùng trạng thái `deposit_contract`, bảng đơn/xe/phiếu thu và JSON hợp đồng hiện có; không cần migration mới. Phiếu giữ xe có loại `order:rental_fees` và nội dung ghi rõ trừ tiền thuê. Các khoản được ghi cùng đơn trong một transaction; xung đột xe, phiên bản cũ hoặc ghi lỗi không lưu một phần. **Chen lịch trước ngày nhận (phương án B):** xe đang `deposit_contract` vẫn cho lập HĐ khác nếu **hẹn trả ≤ ngày dự kiến nhận** của khách đã cọc. Nếu hẹn trả **chồng/vượt** ngày nhận → cảnh báo trên picker và khi phát hành phải tick xác nhận (`acknowledge_reservation_overlap`). Hợp đồng đang thuê / chờ thanh toán / nợ xấu vẫn chặn cứng. Cần migration `docs/sql/2026-10-20-reservation-window-conflicts.sql`.

Kiểm thử SQL chạy bằng PostgreSQL trong bộ nhớ (PGlite), kiểm thử trình duyệt giả lập toàn bộ API nghiệp vụ. Không chạy migration hoặc ghi dữ liệu nghiệp vụ thật vào Supabase.

```powershell
npm.cmd install --prefix .backups/contract-flow-qa --no-package-lock --no-save @electric-sql/pglite
npm.cmd run test:contract-reservations -- --pglite-path .backups/contract-flow-qa/node_modules/@electric-sql/pglite
python scripts/check-contract-reservations-ui.py --browser chromium --session-cookie-file <cookie QA cục bộ>
python scripts/check-contract-reservations-ui.py --browser webkit --session-cookie-file <cookie QA cục bộ>
```

Các trường hợp SQL gồm thu 100k tiền mặt/200k chuyển khoản, đối chiếu số dư, giao xe, thu phần còn lại, trả trước đủ tiền khi đang chờ giao, gửi lại yêu cầu và rollback khi ghi lỗi. Giao diện được kiểm tra ở 320/375/1440px trên Chromium và WebKit. WebKit chạy trên Windows; chưa kiểm tra trên Safari/iPhone thật.

Ảnh dữ liệu QA: [nhận cọc mobile](qa/contract-reservations/advance-webkit-375.png), [giao xe mobile](qa/contract-reservations/handover-webkit-375.png), [desktop](qa/contract-reservations/advance-chromium-1440.png). Kết quả: [SQL](qa/contract-reservations/sql-results.json), [Chromium](qa/contract-reservations/chromium-results.json), [WebKit](qa/contract-reservations/webkit-results.json).
