# Duyệt hợp đồng thuê sở hữu

Áp dụng cho loại hợp đồng `ownership` và `ownership_cd`.

- Nhân viên chọn **Lưu nháp chờ duyệt**. Bản nháp chưa phát hành, chưa đổi trạng thái xe hoặc tạo phiếu thu.
- Quản lý mở bản nháp bằng nút **Duyệt hợp đồng** trên danh sách, kiểm tra hồ sơ và tiền đã nhận, rồi chọn **Xác nhận duyệt hợp đồng**.
- Chỉ sau xác nhận mới phát hành hợp đồng, tạo các phiếu thu đã chọn và chuyển sang **Đang thuê**. Đơn cọc giữ xe vẫn chờ giao xe theo luồng hiện có.
- Người duyệt phải là quản trị viên, quản lý thuê sở hữu hoặc quản lý cơ sở và có quyền `contracts.finalize`. Phạm vi cơ sở vẫn áp dụng. Quyền phát hành rộng được cấp riêng cho nhân viên không cho phép duyệt thuê sở hữu.
- API phát hành và giao xe cùng kiểm tra quy tắc này trước khi ghi hợp đồng, tiền hoặc tồn xe. Lưu người duyệt, vai trò và thời điểm trong `draft_payload.management_composer.approval`.

Hợp đồng thuê thường giữ quyền phát hành hiện có. Không sửa lại hợp đồng, giao dịch hoặc xe đã phát hành trước bản sửa này; không thay đổi quyền tài khoản trong cơ sở dữ liệu.

## Kiểm tra

- `npm run typecheck`, `npm run lint`, `npm run build`.
- `npm run test:release`: 36 nhóm kiểm tra, gồm `check-ownership-approval.cjs` kiểm tra chính sách và API phát hành/giao xe.
- `node scripts/check-contract-finalize.cjs --live-temp`: 16 nhóm trên bảng PostgreSQL TEMP, kiểm tra nhân viên bị chặn, quản lý duyệt thành công và lưu thông tin người duyệt.
- `python scripts/check-ownership-approval-ui.py --sessions <private-fixtures-dir> --output <private-output-dir>`: Chromium và WebKit, vai trò quản lý thuê sở hữu, nhân viên thuê sở hữu và NVKD trụ sở. API nghiệp vụ được giả lập; không ghi dữ liệu nghiệp vụ hoặc gửi Telegram thật.

Các phiên đăng nhập và bộ dữ liệu giao diện để trong thư mục riêng được Git bỏ qua. Không đưa cookie hoặc dữ liệu cá nhân vào kho mã nguồn.
