# Ngày tạo/ngày ký hợp đồng trong danh sách phân trang

Kiểm tra ngày 29/10/2026, hợp đồng 007180 (ID 57506).

- Dữ liệu gốc: tạo 18/10/2026 17:28:22, ký 18/10/2026; thuê 18/10 17:19, hẹn trả 19/10 17:19 (giờ Việt Nam).
- API danh sách phân trang bỏ sót `created_at` và `signed_on`. Màn chi tiết dựng lại biểu mẫu từ dòng danh sách, thiếu hai trường này nên tự lấy ngày hiện tại. Đã tái hiện cả trên API production và hàm dựng biểu mẫu.
- Bổ sung hai trường vào truy vấn chi tiết trang. Chuẩn hóa ngày ký PostgreSQL/ISO thành ngày Việt Nam và lấy ngày tạo theo múi giờ Việt Nam, kể cả khi timestamp UTC nằm ở ngày trước.
- Chỉ hợp đồng mới được gợi ý hôm nay. Hợp đồng đã tồn tại thiếu dữ liệu ngày thì để trống, tránh hiển thị một ngày không có trong hồ sơ. Ngày được lưu rõ trong bản nháp vẫn được giữ.
- Hợp đồng này thuê 1 ngày; đến rạng sáng 29/10 đã quá hạn 9 ngày. Số 1 cạnh tab Quá hạn là số hợp đồng sau lọc. Ngày tạo/ngày ký không quyết định số ngày quá hạn.
- Không cập nhật dữ liệu nghiệp vụ. Hạn trả, thời gian thuê và cách tính quá hạn được giữ theo hồ sơ gốc.

Kiểm tra:

- `node scripts/check-contract-dates.cjs --live-read`: 6 nhóm, gồm tái hiện mở từ dòng phân trang, ngày Việt Nam lúc nửa đêm, dữ liệu ngày bị thiếu, bản nháp có ngày riêng, thời gian thuê/quá hạn và đối chiếu chỉ đọc HĐ 007180 ở hai danh sách.
- `python scripts/check-contract-dates-ui.py --cookie-file <phiên cục bộ>`: Chromium 1440px/WebKit 390px, mở chi tiết từ danh sách; ngày thuê/hẹn trả đúng, ngày tạo/ngày ký đúng 18/10, thiếu ngày không tự hiện hôm nay; API nghiệp vụ giả lập.
- Bộ kiểm tra release có thêm `contract-dates`; kiểm tra phân trang, ESLint, production build và `git diff --check`.

Ảnh và kết quả cục bộ: `.backups/contract-dates/` (không commit phiên đăng nhập).
