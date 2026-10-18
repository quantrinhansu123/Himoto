# GPS: thống nhất trạng thái với nhà cung cấp

Nguyên nhân đã xác minh ở xe `90B3-092.33`:

- Đồng bộ cloud vẫn chạy mỗi 5 giây, 4 tài khoản không báo lỗi; một lượt đọc tài khoản Protrack khoảng 0,7 giây tại thời điểm kiểm tra.
- HIMOTO dùng ngưỡng heartbeat 5 phút; giao diện Protrack hiện dùng 25 phút. Vì vậy xe đang dừng và phát tín hiệu thưa có thể bị HIMOTO báo OFF sớm.
- HIMOTO dùng tốc độ lưu trong bản tin cuối mà không xét tuổi bản tin. Xe 092.33 còn lưu tốc độ 12 km/h từ ngày 11/10, dù Protrack đang báo dừng; lúc heartbeat mới về lại bị báo đang chạy.
- Trang chọn xe và danh sách dùng thứ tự chọn thiết bị khác nhau khi một xe có nhiều GPS. Nếu lỗi refresh ở trang danh sách thì không tải lại DB để hiện cảnh báo dữ liệu cũ.

Sửa:

- Protrack OFF sau 25 phút không có heartbeat; đang chạy khi bản tin `systime` trong 35 giây và tốc độ đạt ngưỡng của Protrack (ngoại lệ biểu tượng 33 cho tốc độ 0–5). Bản tin cũ là dừng; tốc độ cũ không hiển thị như tốc độ hiện tại.
- Thiếu/sai timestamp, chưa kích hoạt, bị khóa/hết quyền là cần kiểm tra; không suy đoán OFF từ timestamp lỗi. Tắt khóa điện độc lập với kết nối GPS. IOPGPS giữ trạng thái kết nối do nhà cung cấp trả về.
- Dừng hiển thị **ON · Đang dừng** ở danh sách, GPS, lập/trả hợp đồng. Dữ liệu đồng bộ quá 10 phút hoặc chưa có mốc đồng bộ là **Chưa cập nhật**; thiết bị không còn trong tài khoản giữ nhãn riêng.
- Danh sách và chọn xe dùng chung SQL chọn thiết bị: ưu tiên thiết bị còn trong tài khoản, đồng bộ mới hơn rồi heartbeat/id. Không dùng trạng thái của vị trí lịch sử thay cho trạng thái lấy mẫu hiện tại.
- Lưu riêng thời điểm tín hiệu, bản tin và vị trí; heartbeat đổi được lưu dù tọa độ không đổi. Không gán thời điểm vị trí mới khi tọa độ thiếu/không hợp lệ và vẫn giữ tọa độ trước đó.
- Hiện mốc **HIMOTO đọc**, **Tín hiệu thiết bị**, **Vị trí GPS**, đánh dấu vị trí cũ. Refresh lỗi vẫn đọc DB để cập nhật nhãn cũ; giữ nhịp 5 giây, chống yêu cầu chồng nhau và dừng polling khi tab ẩn.

Nguồn đối chiếu chính: mã monitor hiện hành của [Protrack](https://real.gpscenter.xyz/V2/dist/static/js/0.588b9178a51d20f36f48.js), đọc lại ngày 18/10/2026, khớp bản asset đang được nhà cung cấp phục vụ. Đối chiếu trực tiếp 343 thiết bị từ hai tài khoản Protrack: 343/343 khớp, tại mẫu kiểm tra có 39 phân loại thay đổi so với thuật toán cũ. Không gọi lệnh thiết bị hoặc liên hệ nhà cung cấp.

Migration cộng thêm `sql/2026-10-18-gps-status-evidence.sql`: 3 cột thời gian/bằng chứng trên `gps_devices`, không đổi ghép xe/hợp đồng/tiền/ảnh. Backup trước migration ở `.backups/gps-status-debug/before-migration.json` (không commit). Trạng thái GPS được sửa bằng lượt đồng bộ mới, không xóa/sửa nhật ký cũ.

Kiểm tra: `test:gps-contract-integrations` gồm ranh giới 25 phút/35 giây, tốc độ thấp, timestamp giây/mili giây, timestamp lỗi/tương lai, chọn thiết bị và dữ liệu cũ; `test:gps-events`, `test:account-scope`, typecheck/lint/build. UI giả lập tại `scripts/check-gps-status-ui.py`: 390/1440px, nhịp 5 giây khi lỗi refresh, nhãn ON/OFF/cũ và không hiển thị tốc độ lưu cũ như tốc độ hiện tại. Nhật ký và số liệu đọc thực tế ở `.backups/gps-status-debug/`.

Kết quả trước triển khai: 23 kiểm tra tích hợp, 4 kiểm tra sự kiện GPS, 17 kiểm tra phân quyền đạt; build (gồm lint/typecheck) đạt. Chromium và WebKit đều đạt 2 luồng UI tại 390/1440px, không lỗi JavaScript hoặc request ngoài fixture. Ảnh và JSON tại `qa/gps-status-parity/`. Trường hợp tọa độ thiếu một phía giữ nguyên cả cặp tọa độ trước và mốc vị trí, vẫn cập nhật heartbeat mới. QA không ghi giao dịch thật hoặc gửi Telegram thật.
