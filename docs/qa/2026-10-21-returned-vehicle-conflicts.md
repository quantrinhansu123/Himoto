# Xe đã trả, hợp đồng cũ còn chờ quyết toán

Hai hàm `vehicle_has_other_rental` / `vehicle_other_rental_conflicts` còn tính dòng xe đã có `completed_at` là đang thuê khi hợp đồng cha chưa đóng. Vì vậy bước giao xe hoặc thao tác kho có thể vẫn bị chặn dù kho chung và kiểm tra phát hành đã xác nhận xe rảnh.

- Migration `docs/sql/2026-10-21-returned-vehicle-conflicts.sql` thêm điều kiện `d.completed_at IS NULL` cho hai hàm, giữ nguyên chữ ký, quyền thực thi và `SECURITY DEFINER` / `search_path`.
- Nhánh truy vấn trực tiếp của `vehicle-actions.ts` dùng cùng điều kiện. Dòng đang thuê thực tế vẫn chặn; không bỏ chống thuê trùng hoặc nới quyền đọc hợp đồng khác cơ sở.
- Migration chỉ thay định nghĩa hàm. Việc hiệu chỉnh xe đã về kho thực hiện riêng theo yêu cầu, có snapshot và ghi nhận xác nhận trong chat. Ngày thu hồi gốc chưa được cung cấp phải để `actual_recovery_at=null`; mốc kỹ thuật giải phóng xe không thay cho ngày trả gốc. Không tự hoàn cọc, tính lại phí hay gửi Telegram.

Kiểm tra:

- `node scripts/check-contract-classification-availability.cjs`: 6 nhóm, gồm migration chạy hai lần; dòng đã trả / chưa trả ở đủ 6 trạng thái hợp đồng; loại hồ sơ pin, bỏ chính hợp đồng đang thao tác và quyền PostgreSQL theo cơ sở. Cập nhật môi trường thử theo chữ ký blocker và dữ liệu danh sách hiện hành.
- `node scripts/check-vehicle-transfers.cjs`: 10 nhóm trong TEMP rollback; dòng chưa trả chặn chuyển, dòng đã trả thuộc hợp đồng chờ quyết toán cho chuyển, giữ nguyên số tiền và trạng thái hợp đồng cũ.
- Typecheck, lint riêng file sửa và build. Bộ thử không ghi dữ liệu nghiệp vụ thật, không thay sequence thật và không gọi Telegram.

Đối chiếu production qua API kho chung, danh sách xe và dòng trả của cơ sở hợp đồng. Snapshot hiệu chỉnh / định nghĩa hàm cũ và kết quả máy chạy giữ trong `.backups/`, không commit.

Kết quả: hai bộ thử đạt 6 + 10 nhóm; typecheck, lint file sửa và build thành công (3 cảnh báo hook có sẵn). Migration đã áp dụng và đối chiếu quyền hàm giữ nguyên. API production xác nhận xe đã hiệu chỉnh có thể cho thuê, không còn blocker; phiếu tiền / thông báo trước sau khớp hoàn toàn và tiền cọc vẫn để cơ sở quyết toán.
