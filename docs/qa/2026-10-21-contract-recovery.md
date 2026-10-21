# Số HĐ nháp đã xóa, trả xe khác cơ sở và giữ xe cũ

## Phát hiện và sửa

- `005970` bị giữ bởi draft #57740 của Hà Đông, đã xóa lúc 22:06 ngày 20/10/2026 (giờ Việt Nam). Nháp chưa phát hành, không có dòng xe hoặc phiếu tiền. `draft_reference` vẫn chịu unique index nên kiểm tra số trùng. Khi xóa nháp hợp lệ, nay đổi tham chiếu thành `DELETED-<id>` và lưu số cũ trong audit. Migration bổ sung sửa 28 nháp đã xóa đáp ứng cùng điều kiện. Số hợp đồng đã phát hành và nháp có phiếu/dòng xe vẫn bị chặn tái sử dụng.
- Ảnh khách **LÊ THỊ THANH LAN** không hiện số HĐ; không tìm được hồ sơ đã lưu với tên này trong dữ liệu hợp đồng. Không suy đoán số hoặc giải phóng số đang dùng. Bản sửa xử lý nguyên nhân chung nháp đã xóa còn giữ số; vẫn cần số giấy cụ thể nếu khách tiếp tục báo trùng.
- `VPS-32017` (#57586, dòng #62396, xe `17B5-141.53` #245) thuộc Hà Đông (#33), xe do Giáp Bát (#23) giữ. Tái hiện bằng tài khoản Hà Đông cho lỗi PostgreSQL `42501` ở RLS update dòng xe. Hai hàm server hạn chế theo cơ sở hợp đồng cho phép cập nhật thời điểm trả và giải phóng đúng xe đã trả; không cấp quyền đọc/sửa chung kho khác cơ sở. Xe giữ nguyên cơ sở vật lý Giáp Bát. Hợp đồng thực tế vẫn chờ nhân viên xác nhận trả; không ghi trả hoặc hoàn cọc hộ qua QA.
- Giao xe từ hợp đồng cọc cũng dùng helper khóa xe khác cơ sở đã có; sửa nhánh admin để không gọi helper bắt buộc actor scope khi admin đang dùng kết nối chủ. Chặn hợp đồng thuê thực tế khác còn mở; dòng đã trả không tạo xung đột.
- Danh sách và chi tiết hợp đồng cọc thêm **Bổ sung hồ sơ / Tiếp tục hợp đồng cọc**. Hồ sơ được lưu qua API profile đang có; sau khi lưu mở **Tiếp tục giao xe**. Nút không chuyển tiền hoặc thu lại cọc; khách đã nhận xe vẫn cần nhân viên xác nhận giao. Thay đổi profile sau khi lưu yêu cầu lưu lại trước khi tiếp tục.

## Gỡ hai liên kết giữ xe cũ theo yêu cầu

- `12T1-217.42` #369: `VPS-12427` (#34027), dòng #37110, hẹn nhận 28/11/2024.
- `29E2-662.29` #653: `VPS-12436` (#50216), dòng #54460, hẹn nhận 28/11/2024.
- Cả hai có lịch sử thuê/hoàn trả sau thời điểm giữ cũ và không có hợp đồng thuê thực tế đang mở. Gỡ mềm đúng dòng liên kết cũ, ghi `management_composer.reservation_releases` với actor, lý do, mã xe, thời gian hẹn cũ, trạng thái kho cũ và chứng cứ lượt sau đã trả. Ngày thu hồi gốc để `null`, không giả lập đây là trả xe hôm nay.
- `29E2-662.29` từ `using` về `ready`; `12T1-217.42` vẫn `ready`. Giữ nguyên cơ sở, trạng thái hợp đồng cũ, `total`, `pid` và toàn bộ phiếu tiền. Lịch sử hợp đồng có dòng **Gỡ giữ xe**; tiền giữ xe cũ còn để đối chiếu, không tự hoàn hoặc chốt mất cọc. Không tạo thông báo Telegram.
- Bản chụp đầy đủ trước áp dụng trong `.backups/contract-issues-20261021/before-apply.json` (Git ignored). Checksum toàn bộ phiếu trước/sau khớp. Script áp dụng chỉ dùng cho hai target này và không chạy lại để nhập dữ liệu cũ.

## Kiểm tra

- `node scripts/check-contract-support.cjs`: 5 nhóm đạt, TEMP rollback; nháp xóa được dùng lại số, hồ sơ đã phát hành/có tiền giữ số, migration chạy hai lần.
- `node scripts/check-account-scope.cjs`: 19 nhóm đạt, schema QA rollback. Có trả và giao xe khác cơ sở, xe về đúng kho cũ, không nhả xe khi một hợp đồng khác còn thuê; cơ sở không liên quan bị từ chối gọi helper.
- Tái hiện chính xác VPS-32017 với tài khoản Hà Đông sau sửa: return, snapshot thông báo và trạng thái xe `ready` tại Giáp Bát đều đạt, sau đó rollback toàn bộ.
- Typecheck, lint và production build đạt; còn 3 cảnh báo có sẵn ở `ManagementPage.tsx:110` và `StaffOrganizationChart.tsx:58`.
- UI trên production build local: 6 tình huống Chromium desktop / WebKit iPhone đạt, `errors=[]`; kiểm tra mở hồ sơ đơn cọc, lưu profile, yêu cầu lưu lại sau thay đổi và mở giao xe giữ nguyên khoản trả trước. Mọi API ghi được mô phỏng. Domain production sẽ được kiểm tra sau triển khai.

Không đưa các file không thuộc đợt này vào commit: sửa cũ `scripts/check-contract-support-ui.py` và 3 file untracked của người dùng được giữ nguyên.
