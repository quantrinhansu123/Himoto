# IOPGPS: sửa mã trạng thái theo nền tảng gốc

Kiểm tra ngày 18/10/2026 phát hiện bộ chuyển đổi IOPGPS dùng sai mã: `0` bị hiểu là OFF, `10` bị hiểu là cần kiểm tra. Mã hiện hành của IOPGPS là `0` đứng yên, `1` di chuyển, `10` mất kết nối. Tốc độ lưu trong bản tin vị trí không thay thế mã trạng thái; đã gặp ba thiết bị báo đứng yên nhưng còn lưu tốc độ 6 km/h.

Nguồn chính: [monitor IOPGPS](https://iopgps.com/main.html), asset hiện hành [app.1c71776d.js](https://static.hw.gpscdn.com/gpsen_v2/js/app.1c71776d.js), SHA256 `b8aa40704a123561ae75c720eaf46a1eecc00ec57687ddd7d7e8ed8e864ce466`. Trong `status.normal.subStatus`: motionless=0, move=1, sleep=2; offline=10, unused=20, expired=30. Phần hiển thị thiết bị cũng xác nhận 0/1 là online và 10 là offline.

Sửa bộ chuyển đổi riêng của IOPGPS:

| Mã IOPGPS | Trạng thái HIMOTO |
|---|---|
| 0 | ON · Đang dừng |
| 1 | ON · Đang di chuyển |
| 10 | OFF · Mất kết nối |
| 2, 20, 30, thiếu bản tin hoặc mã chưa hỗ trợ | Cần kiểm tra; giữ mã gốc, không suy thành OFF |

Lưu thêm mốc bản tin `sysTime` vào `provider_reported_at`, độc lập với `gpsTime`, `heartTime`, khóa điện và mốc HIMOTO đọc. Dùng migration cộng thêm của đợt GPS trước đã áp dụng; không cần migration mới. Trạng thái và metadata được cập nhật bằng lượt đồng bộ bình thường, không sửa nhật ký cũ hoặc ghép thiết bị/xe.

Đối chiếu trước triển khai: đọc đủ 49 thiết bị, 49 IMEI khác nhau từ 2 tài khoản IOPGPS; bộ chuyển đổi mới khớp 49/49 với enum của monitor hiện hành. Ở mẫu lúc 23:33: 17 đứng yên, 3 di chuyển, 1 mất kết nối, 28 chưa có bản tin vị trí. Có 18 trạng thái lưu hiện tại cần sửa (17 OFF giả và 1 OFF đang bị ghi cảnh báo). Snapshot trước sửa và script đọc/đối chiếu tại `.backups/gps-status-debug/iop-live-snapshot.json`, `compare-iop-live.cjs` (không commit).

Kiểm tra tự động bao gồm các mã 0/1/10/2/20/30/mã lạ/null kết hợp tốc độ null/0/6/42; mốc giây/mili giây, tọa độ, thời điểm bản tin và khóa điện độc lập. Đợt sửa Protrack vẫn được kiểm tra hồi quy trong cùng suite. Không gửi Telegram thật, không gọi lệnh thiết bị, không liên hệ nhà cung cấp.

Trước triển khai: `test:gps-contract-integrations` đạt 24 kiểm tra, `test:gps-events` đạt 4 kiểm tra, build gồm lint/typecheck đạt. Bộ mã riêng của từng nhà cung cấp được kiểm tra độc lập; không áp ngưỡng thời gian của Protrack sang IOPGPS.
