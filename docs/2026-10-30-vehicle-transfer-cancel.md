# Người chuyển tự huỷ điều chuyển

Xe đang **Chờ luân chuyển** có nút **Huỷ điều chuyển** trên thẻ điện thoại, bảng desktop, menu thao tác và chi tiết xe khi tài khoản đang đăng nhập là người tạo lượt chuyển. Hộp xác nhận hiển thị biển số, chiều chuyển và cơ sở sẽ nhận lại xe; **Quay lại** không gửi yêu cầu. Có thể ghi lý do và thử lại nếu lưu lỗi.

Server lấy người thao tác từ phiên đăng nhập, khoá xe và lượt chuyển trong cùng transaction, kiểm tra đúng ID lượt chuyển, phiên bản xe và trạng thái còn chờ xử lý. Tài khoản khác không thể tự huỷ lệnh; người gửi vẫn không được tự nhận hoặc dùng thao tác từ chối của bên nhận. Lệnh đã nhận, từ chối hoặc huỷ không xử lý lại được.

Huỷ thành công đưa xe về **Lưu kho tại cơ sở chuyển đi**, giữ cơ sở sở hữu và phiếu gốc. Sự kiện `manual_transfer_cancel` liên kết lượt gốc, ghi người huỷ, thời điểm, ghi chú và thay đổi trước/sau. Cả lịch sử xe và lịch sử luân chuyển hiển thị **Huỷ điều chuyển**; lịch sử luân chuyển có bộ lọc riêng. Thao tác này không gửi Telegram hoặc thay đổi hợp đồng/phiếu tiền.

Trước deploy áp dụng migration idempotent [2026-10-30-vehicle-transfer-cancel.sql](sql/2026-10-30-vehicle-transfer-cancel.sql). RLS chỉ mở xe được ghim trong request cho thao tác điều chuyển; kiểm tra người tạo nằm trong service. Khoá tham chiếu cơ sở dùng `FOR SHARE`; policy vẫn `WITH CHECK(false)` để không cấp quyền sửa cơ sở. Quyền đối với khách hàng, hợp đồng và tiền giữ nguyên.

Đã kiểm tra:

- Build production, typecheck và lint các file thay đổi đạt. Migration đã thử trong transaction rồi rollback, sau đó áp dụng lên DB với bản sao định nghĩa cũ; các policy ngoài phạm vi giữ nguyên và không ghi dữ liệu nghiệp vụ.
- `node scripts/check-vehicle-transfers.cjs`: 12 nhóm, gồm chủ lệnh huỷ, người khác bị chặn, ID/phiên bản cũ, nhận trước khi huỷ, huỷ trùng và rollback khi ghi audit lỗi.
- `node scripts/check-global-vehicle-transfers.cjs`: 7 nhóm; migration chạy hai lần trên schema cô lập rồi rollback, thử RLS thật với tài khoản ngoài cả hai cơ sở, chặn sửa xe khác/cơ sở và đọc dữ liệu hợp đồng ngoài phạm vi.
- `node scripts/check-vehicle-transfer-history.cjs`: 7 nhóm, có bộ lọc và nhãn huỷ riêng.
- `scripts/check-vehicle-transfer-cancel-ui.py`: Chromium desktop 1440px và WebKit 320/375px, tổng 9 ca giao diện; người tạo/người khác/lệnh đã nhận, xác nhận/quay lại, giữ ghi chú sau lỗi, trạng thái và lịch sử sau huỷ. Không có lỗi JavaScript, không ghi nghiệp vụ hay gửi Telegram thật.

Bằng chứng và bản trước thay đổi DB giữ riêng trong `.backups/vehicle-transfer-cancel-72g1-84613-20261030/`; không đưa dữ liệu vận hành hoặc phiên đăng nhập lên Git. WebKit trên Windows là kiểm thử engine, không thay cho xác nhận bằng iPhone thật.
