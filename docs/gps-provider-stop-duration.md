# Thời gian dừng từ Protrack

Nhóm **Xe dừng trên 3 ngày** lọc xe hiện đang dừng, dữ liệu còn mới, đã ghép xe và thời gian dừng **hơn 72 giờ**. Đúng 72 giờ chưa thuộc nhóm. Không cộng thời gian tắt khóa điện vào thời gian dừng.

Nguyên nhân bản trước luôn có thể hiện 0 dù Protrack đã báo nhiều ngày: `stopped_since` chỉ là mốc Himoto bắt đầu quan sát liên tục. Nếu mới bật theo dõi hoặc đồng bộ bị gián đoạn trên 10 phút, mốc này bắt đầu lại từ lúc đồng bộ, không phản ánh khoảng dừng từ trước.

## Nguồn thời gian

Đã đối chiếu mã giao diện Protrack V2 (25/10/2026):

- Khi trạng thái static, Protrack tính thời gian từ `servertime - systime`.
- Trường hợp engine-idle dùng `engineidlestarttime`.
- Khi OFF, bộ đếm dùng heartbeat; đây là thời gian mất kết nối, không phải thời gian dừng của nhóm này.
- `acctime` là mốc khóa điện, xử lý độc lập. `gpstime` chỉ là thời gian vị trí GPS, không dùng thay thế mốc dừng.

Nguồn công khai đã kiểm tra: `https://www.protrack365.com/V2/dist/static/js/0.588b9178a51d20f36f48.js` và `8.759ab1bfc75ccf2db038.js`. Chỉ chuẩn hóa các trường đã xác minh; không suy ra thời gian Protrack từ nhãn “Dừng” đơn thuần.

Mốc đã chuẩn hóa lưu riêng tại `gps_devices.provider_stopped_since`. Mỗi lần đọc nhà cung cấp thành công cập nhật lại mốc này. Giao diện ghi **Theo Protrack** hoặc **Himoto ghi nhận** cho người xem biết nguồn của thời gian. Nếu thiếu/không hợp lệ hoặc có bằng chứng xe chạy sau mốc Protrack, dùng theo dõi liên tục của Himoto. IOPGPS tiếp tục dùng nguồn Himoto khi chưa xác minh được mốc thời gian tương ứng của nhà cung cấp.

Xe đang chạy, OFF, cảnh báo, mất quyền xem thiết bị hoặc dữ liệu đồng bộ quá 10 phút không vào nhóm. Xe có nhiều GPS chỉ được đếm một lần và cần các thiết bị còn theo dõi cùng xác nhận; tìm kiếm/cơ sở/nền tảng vẫn áp dụng. Lịch sử bật/tắt khóa điện không hủy thời gian dừng; bằng chứng di chuyển đọc bù có thể hủy mốc Protrack mâu thuẫn, lần polling tiếp theo không tự khôi phục lại mốc bị bác bỏ đó.

## Triển khai

```powershell
node scripts/migrate-gps-provider-stop.cjs --apply
# Deploy code sau migration; lịch đồng bộ đang có sẽ điền mốc từ nguồn thật.
```

Migration chỉ thêm cột nullable và chỉ mục tìm bằng chứng di chuyển. Không backfill bằng thời gian vị trí, không sửa dữ liệu xe/hợp đồng/tài chính, không bật/tắt lịch và không gửi lệnh xuống thiết bị. Rollback code cũ vẫn chạy được với cột nullable còn giữ.

## Kiểm tra

```powershell
node scripts/check-gps-contract-integrations.cjs --gps-only
node scripts/check-gps-events.cjs
python scripts/check-gps-long-stops-tabs-ui.py --url http://127.0.0.1:3025 --session-cookie-file <tep-phien-kiem-tra>
```

Kiểm tra PostgreSQL dùng schema riêng và rollback, gồm 23 ngày theo Protrack với dưới một phút theo dõi local, biên 72 giờ, engine idle, giây/mili giây, sai thời gian, khóa điện, vị trí cũ, di chuyển đọc bù, nhiều GPS cùng xe và phạm vi cơ sở. UI Chromium/WebKit dùng dữ liệu tổng hợp, chặn request ghi/nhà cung cấp/Telegram. Kiểm tra production chỉ đọc sau khi đồng bộ bình thường hoàn thành; không sửa mốc của từng xe để ép ra cảnh báo.
