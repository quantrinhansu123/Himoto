# Himoto mobile 1.0.6 — hiệu năng toàn ứng dụng

Đã fast-forward từ `b345075` tới `6f3ad68`, giữ thay đổi local; bao gồm hai commit mới về danh sách hợp đồng và timeout Telegram. Không chạy lại SQL lịch sử; tài liệu của thay đổi danh sách xác nhận chỉ mục đã áp dụng.

## Thay đổi

- Tách preview danh sách khỏi cache chi tiết. Mở hợp đồng/khách gọi cập nhật; không đánh dấu dữ liệu cũ thành mới. Hồ sơ xe hiện preview có sẵn trong lúc lấy profile thật, dùng cùng khóa cho tải trước và màn chi tiết.
- Cache tra cứu SQLite mã hóa khôi phục vào Query trước khi mở navigator. Giữ timestamp gốc, đánh dấu cần xác minh khi mount. Phạm vi gồm tài khoản/cơ sở/quyền/role/server; giới hạn 40 query, tổng 4 MiB, tối đa ba trang đầu mỗi danh sách, TTL 24 giờ.
- Lỗi mạng/5xx khi cập nhật nền giữ nội dung tra cứu đã tải và timestamp gốc; hiển thị trạng thái dữ liệu đã lưu. 401/403/404 xóa dữ liệu query đang hiển thị, không chuyển từ chối truy cập thành thành công từ cache.
- Phục hồi phiên từ quyền offline còn hợp lệ trên máy, sau đó xác thực nền. Không kéo dài hạn xác minh 24 giờ; 401 vẫn thu hồi quyền. Banner báo đang cập nhật/ngoại tuyến. Không phục hồi kết quả ghi, media permission, token, QR, biểu mẫu quyết toán hoặc giao dịch đang chờ như kết quả thành công.
- Hàng đợi rỗng không gọi API đồng bộ/xác thực hai lần mỗi 15 giây. Giữ kiểm tra foreground định kỳ, khi quay lại app và khi mạng phục hồi.
- Danh sách chính memo hóa dữ liệu/renderItem và giới hạn cửa sổ/batch render; thumbnail cache trong RAM, khóa riêng theo phiên/quyền, xóa khi đổi phạm vi/đăng xuất. Không lưu ảnh nghiệp vụ vào disk cache chung.
- GPS phân trang tại PostgreSQL, chỉ trả 25 hàng đầy đủ; giữ đếm tổng, thiết bị không gắn xe/xe chưa gắn GPS, quy tắc nhiều thiết bị, bằng chứng dừng và phạm vi như web. Export vẫn đọc đủ dữ liệu.
- Báo cáo hỗ trợ phân trang từng mục 20 hàng theo thương lượng với app mới. Giữ nguyên totals và export đầy đủ; client cũ tiếp tục nhận hợp đồng cũ. Bản app mới có fallback cho backend cũ.
- Excel danh sách, báo cáo và sổ quỹ thương lượng truyền nhị phân, tương thích JSON/Base64 cũ. Giới hạn 12 MiB, kiểm metadata/header/magic/đủ byte và hủy; mã hóa khi lưu nhường luồng UI theo khối. Mẫu kiểm tra giảm từ 266.824 byte JSON xuống 200.003 byte nhị phân. Không coi đây là phép đo độ trễ production.

## Kiểm tra source

- Web/mobile typecheck; web/mobile lint đạt.
- 35 suite `npm run test:mobile` đạt cả trước và sau pull.
- Offline/SQLite, token lifecycle, worker, biometric fixture và payload 500 xe đạt.
- `test:mobile:performance`: timestamp/preview, cách ly scope, phục hồi và hủy phiên, quota 4 MiB/40 query, invalidation và danh sách bị giới hạn đạt.
- Binary Excel roundtrip và client API, chunk không trùng biên, metadata sai, file thiếu/quá lớn/hủy; 500 hàng báo cáo qua 25 trang và export reader không nhận bộ lọc phân trang đạt.
- GPS PGlite đối chiếu SQL với projection web trên 3 phạm vi × 9 trạng thái × 3 provider, tìm kiếm literal và clamp trang đạt.
- Reports, cashbook, support, notifications và 124 ca SQL tài chính PGlite đạt.
- 43 ca browser trên bốn kích thước/sáng tối và 6 nhóm nhập/xuất Excel đạt; không page error hoặc ghi dữ liệu production.
- Hai bộ kiểm tra mới từ pull về danh sách hợp đồng và timeout Telegram đạt.
- Backend `64e8684` đã deploy Production thành công; 23 kiểm tra route/gate công khai đạt, trang web đăng nhập trả 200. Không dùng kiểm tra gate để thay nghiệm thu đăng nhập admin.

Bằng chứng trong `.backups/mobile-speed-20261108/`. Các ca ghi tiền/kho/chấm công dùng dữ liệu cô lập; không tạo giao dịch thật bằng tài khoản admin trên Samsung.

## Samsung và bản cài

Samsung SM-N960N đã kết nối; bản trước là 1.0.5/code 6, đang đăng nhập quản trị. Đã lấy hai lượt cuộn cho xe/khách/hợp đồng trước thay đổi; dữ liệu trong `baseline/`. Số đo readiness dùng UI Automator bao gồm chi phí dump/polling, không phải TTID hoặc so sánh app/web được kiểm soát.

Bản 1.0.6/code 7 đang chuẩn bị đóng gói và kiểm tra máy thật. Kết quả APK/cài đặt/nghiệm thu được cập nhật sau khi hoàn tất. Chưa khẳng định toàn bộ thao tác nhanh hơn web hoặc độ trễ bằng 0.

Tài liệu API đối chiếu: [Expo SQLite SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/), [Expo Image SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/image/), [React Native FlatList](https://reactnative.dev/docs/optimizing-flatlist-configuration), [TanStack initial data](https://tanstack.com/query/latest/docs/framework/react/guides/initial-query-data).
