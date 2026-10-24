# GPS dừng liên tiếp và số đếm tab hợp đồng

- GPS có nhóm riêng **Xe dừng trên 3 ngày**, chuyển xe ra khỏi nhóm dừng thông thường khi vượt 72 giờ; bảng và thẻ mobile hiển thị thời gian dừng cùng mốc bắt đầu.
- Nhóm đếm xe không trùng. Thiết bị chưa ghép xe không tạo cảnh báo xe; nếu một xe có nhiều GPS đang theo dõi, tất cả phải xác nhận dừng đủ thời gian. GPS chạy/mất kết nối/cảnh báo/chưa cập nhật ngăn xe vào nhóm.
- `gps_devices.stopped_since` bắt đầu ở lượt đồng bộ thành công đầu tiên. Giữ mốc khi quan sát dừng liên tục; xóa hoặc tính lại khi chạy, OFF, warning, gián đoạn đồng bộ trên 10 phút, đổi tài khoản nguồn, mất quyền xem thiết bị hoặc đổi xe ghép. Khóa điện bật/tắt không thay đổi thời gian dừng.
- Lịch sử/webhook bổ sung có di chuyển hoặc OFF sau mốc bắt đầu sẽ hủy bằng chứng dừng liên tiếp, không sửa trạng thái hiện tại. Bản tin vị trí cũ và thời điểm đổi trạng thái cũ không dùng để suy ra ba ngày dừng.
- Giao diện tự loại cảnh báo hết độ mới khi đọc API thất bại kéo dài; không cần chờ một phản hồi thành công mới.
- Tất cả danh sách hợp đồng hiện số trên tab trạng thái; các nhóm ngày quá hạn cũng luôn hiện số. Số đếm giữ phạm vi cơ sở/tìm kiếm/bộ lọc và độc lập với trang, trạng thái, nhóm ngày đang chọn. Ngày trả chỉ có trên dòng xe cũ và biển số xe khác cơ sở dùng cùng nguồn như danh sách.

Áp dụng `docs/sql/2026-10-24-gps-long-stops.sql` trước khi chạy bản code mới. Migration chỉ thêm cột nullable, chạy lại an toàn; không suy diễn/backfill dữ liệu cũ. Hệ thống cần tích lũy hơn 72 giờ quan sát sau cập nhật mới có cảnh báo đầu tiên.

Kiểm tra:

```text
node scripts/check-gps-contract-integrations.cjs --gps-only
node scripts/check-gps-events.cjs
node scripts/check-contract-tab-counts.cjs
node scripts/check-management-table.cjs
node scripts/check-contract-overdue.cjs
python scripts/check-gps-long-stops-tabs-ui.py --url http://127.0.0.1:3025 --session-cookie-file <local-session-file>
```

Kiểm thử cơ sở dữ liệu dùng schema/TEMP riêng và rollback; giao diện chặn API ghi và nhà cung cấp thật. Không gửi Telegram hoặc lệnh xuống thiết bị GPS.

Kết quả local: GPS riêng 9 nhóm kiểm tra; GPS events 4; tab counts 2; management table 10; overdue 5; UI Chromium 1440px và WebKit 390px 6 nhóm kiểm tra, không lỗi JavaScript, không tràn ngang. Bản build production trong checkout QA đạt lint/typecheck. Truy vấn chỉ đọc xác nhận số đếm trên sáu phạm vi hợp đồng thật; không áp migration hoặc phát hành website trong đợt này. Ảnh và báo cáo UI ở `.backups/gps-long-stops-20261024/ui/`.

Bộ tích hợp GPS/Telegram đầy đủ gặp lỗi quyền của fixture `staff_account_attribution` trong nhánh Telegram recovery; kiểm thử `--gps-only` và GPS events độc lập đều đạt.

Chuẩn bị phát hành ngày 25/10/2026: phần số đếm hợp đồng đã nằm trong `42c3f07` trên `main`. Đã áp migration GPS lúc 00:15 (UTC+7), xác nhận cột `stopped_since` nullable và quyền SELECT của `himoto_scoped`; không sửa các dòng dữ liệu kinh doanh. Kiểm tra lại GPS 9 nhóm, GPS events 4 nhóm, tab counts 2 nhóm và typecheck đều đạt trước push.
