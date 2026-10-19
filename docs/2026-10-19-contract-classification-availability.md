# Phân loại hợp đồng pin và lý do xe chưa được nhận cọc

## Hồ sơ pin xuất hiện ở Thuê sở hữu

VPS-28781 của Lê Văn Ninh là hồ sơ thuê pin tại cơ sở nguồn #30. Sau nhập, bản ghi xe #56696 vẫn tồn tại để giữ liên kết phiếu lịch sử; bản ghi pin chính là PIN-VPS-28781 (#27). Cơ sở đích #35 có loại `lease_to_own`, nên bộ lọc cũ đưa cả bản ghi lịch sử pin vào Thuê sở hữu. Hợp đồng xe VPS-28187 là hồ sơ riêng và tiếp tục hiển thị.

`VEHICLE_ORDER_SQL` loại các bản ghi có `legacy_migration.sourceStoreId=30` khỏi danh sách, tổng hợp hợp đồng xe, trả/đổi xe, điều kiện giữ xe và gửi Telegram của xe. Phân loại dựa vào nguồn nhập, không dựa vào tên khách, biển số hay việc hợp đồng xe có liên kết hợp đồng pin. Hợp đồng xe mới kèm pin và hồ sơ sở hữu từ cơ sở nguồn #29 vẫn được giữ.

Hồ sơ pin, số tiền, phiếu thu, trạng thái và dữ liệu gốc không bị sửa hoặc xóa. Bản ghi lịch sử tiếp tục làm điểm liên kết của phiếu cũ. Các lượt Telegram lịch sử đã gửi không thay đổi; bản ghi pin không được gửi qua hàng đợi thuê xe kể cả khi trước đó đã có lượt chờ gửi.

## Xe 12T1-217.42

Xe #369 đang Lưu kho tại CS Nguyễn Hoàng. Hai hồ sơ cũ vẫn chặn phát hành:

- VPS-12427 (#34027), CS Hà Đông, giữ cọc từ 28/11/2024, chưa đóng.
- VPS-9262 (#33149), CS Nguyễn Hoàng, đã trả xe nhưng hợp đồng vẫn chờ thanh toán.

Trước đây ô chọn ẩn toàn bộ xe có hợp đồng mở. Truy vấn theo cơ sở còn có thể không thấy hợp đồng ở cơ sở khác, nên nhân viên không biết lý do hoặc chỉ phát hiện ở bước lưu chính thức.

Ô chọn nay tìm biển số cả khi không có dấu gạch/chấm; xe bị vướng vẫn xuất hiện cùng tất cả mã hợp đồng, trạng thái và cơ sở giữ. Chặn chọn bằng chuột và bàn phím; xe đã chọn ở dòng khác cũng không được chọn trùng. Xe hợp lệ vẫn được ưu tiên trước. Chỉ khi hợp đồng cũ được xử lý đúng nghiệp vụ và xe Lưu kho, điều kiện chọn/phát hành mới hết chặn. Không tự đóng hồ sơ, miễn nợ hay hoàn cọc.

`vehicle_rental_blockers(bigint[])` dùng `SECURITY DEFINER`, cố định `search_path`, thu hồi quyền PUBLIC và chỉ cấp cho vai trò ứng dụng. Trả về tối thiểu mã/trạng thái/cơ sở/hẹn trả và ID để nhận diện hợp đồng đang sửa. Không mở quyền SELECT hợp đồng khác cơ sở hoặc trả thông tin khách, tài khoản, tiền. Các dòng xe đã trả nhưng hợp đồng còn chờ thanh toán vẫn chặn theo quy tắc phát hành hiện có.

Migration `sql/2026-10-19-contract-classification-availability.sql` thay định nghĩa năm hàm đọc/kiểm tra; không cập nhật bảng nghiệp vụ. Đã lưu định nghĩa trước sửa và ảnh chụp dữ liệu tại `.backups/contract-classification-20261019/` (Git ignored).

## Kiểm tra

- `node scripts/check-contract-classification-availability.cjs`: schema QA riêng, chạy migration hai lần và rollback; kiểm tra danh sách, hợp đồng pin đi kèm xe, RLS khác cơ sở, điều kiện phát hành và bỏ chặn sau khi đóng hợp đồng hợp lệ.
- `node scripts/check-gps-contract-integrations.cjs`: Telegram mô phỏng, gồm chặn bản ghi pin cũ đang chờ gửi.
- `node scripts/check-management-table.cjs --live-read`: đối chiếu chỉ đọc danh sách/tổng hợp/phân trang với dữ liệu thật.
- `node scripts/check-contract-finalize.cjs --live-temp` và `node scripts/check-battery-contracts.cjs --live-temp`: ghi bảng TEMP, rollback.
- `npm.cmd run test:contract-reservations -- --pglite-path .backups/contract-flow-qa/node_modules/@electric-sql/pglite`: đặt cọc/giao xe/thu tiếp và chống trùng bằng PostgreSQL cục bộ. Cập nhật các cột fixture theo schema hiện tại.
- `python -X utf8 scripts/check-contract-classification-availability-ui.py --session-cookie-file <session-file>`: Chromium 1440px và WebKit 390px; dữ liệu đọc thật, chặn mọi API ghi và gửi Telegram. Kiểm tra riêng trang đang triển khai bằng `--url https://himoto.vercel.app --output <folder>`.
- Typecheck, lint và build; lint còn cảnh báo đã có ở `StaffOrganizationChart.tsx:58`, ngoài phạm vi sửa này.
