# Hiệu năng mobile và GPS — 16/11/2026

## Phạm vi đã phát hành

Source sản phẩm: `6b3dfa161bd5c95fcc941b12645c8cab36829dfc`, nhánh `main`; phần tối ưu chính ở `edc0d2f`, hoàn thiện cuộn native ở `26ce121` và `6b3dfa1`. Đã đọc hướng dẫn repo, `mobile/AGENTS.md`, biên bản đồng bộ trước và `git pull --ff-only` trước khi sửa. Native giữ `1.0.11`, Android versionCode `12`.

Himoto đang dùng API Next.js với domain/RLS dùng chung cho web và mobile; mobile đã có TanStack Query và SQLite mã hóa. Đợt này tiếp tục kiến trúc đó, không thêm MMKV/PowerSync hoặc native dependency, không thay bằng Supabase client riêng trên từng màn hình. Các writer tài chính, tồn kho, hợp đồng vẫn chờ xác nhận server và giữ cơ chế chống gửi trùng/đối chiếu kết quả.

- Bỏ đăng ký listener mạng trong từng instance transport offline. Quyết định gọi mạng/đọc cache vẫn dùng trạng thái kết nối và network probe hiện có.
- Danh sách danh mục giữ tối đa 8 trang, 160 dòng trong RAM; có đường tải trang trước và giữ vị trí cuộn native khi loại trang cũ. Kiểm tra vị trí cuối danh sách cả khi thả tay/dừng vuốt; mỗi lượt kéo chỉ tự tải thêm một trang để sự kiện layout sau loại trang không tải dây chuyền. Có nút “Tải thêm kết quả” khi native bỏ lỡ sự kiện cuối cuộn. Refetch chỉ tải cửa sổ hiện tại. Excel vẫn xuất toàn bộ kết quả theo bộ lọc server.
- Tách GPS thành đọc thiết bị, lịch sử, bộ chọn lịch sử và trạng thái đồng bộ. Chỉ mở lịch sử mới đọc 100 sự kiện và bộ chọn thiết bị; màn thiết bị và Excel không chờ truy vấn lịch sử. API cũ còn tương thích.
- Lịch sử dùng đúng biểu thức thời gian theo nguồn và thứ tự `event_at DESC, id DESC`. Truy vấn theo cơ sở lấy tối đa 100 sự kiện mỗi xe đủ quyền rồi gộp top 100; giữ liên kết xe lịch sử, không thay bằng xe đang ghép hiện tại.
- GPS lưu cache ngắn hạn 5 phút trong SQLite hiện có, phân tách theo API/tài khoản/phạm vi/bộ lọc. Giữ timestamp dữ liệu gốc; snapshot không khôi phục quyền ghép GPS. Không lưu lịch sử, trạng thái đồng bộ hay kết quả ghi vào cache GPS này. Phản hồi xác thực/quyền đã xác định sẽ loại HTTP cache tương ứng.
- “Đồng bộ ngay” dùng `Prefer: respond-async`, trả trạng thái đã xếp lượt/đang chạy/chưa đến lượt/chưa cấu hình. Danh sách đang xem được giữ; nút chống gửi lặp, có giới hạn chờ và thông báo chưa xác nhận. Nhánh client cũ không gửi Prefer vẫn có hợp đồng phản hồi cũ.
- Giữ collector và đọc màn hình ở nhịp 60 giây. Chỉ polling khi đúng màn/tab đang hiển thị và app foreground; rời màn/ẩn app sẽ hủy đọc. Bộ chọn lịch sử tái sử dụng trong 5 phút. Chỉ khi đang đợi đồng bộ thủ công mới đọc trạng thái 2 giây/lần.

Đọc từ API nhanh hơn không làm tín hiệu thiết bị GPS mới hơn. Hai nhịp collector và UI độc lập, cộng độ trễ nhà cung cấp/thiết bị; không cam kết tín hiệu xuất hiện trong tối đa 60 giây. Nhãn “Himoto đọc”, “Tín hiệu thiết bị”, “Vị trí” vẫn tách riêng.

## Index production

Đã chạy migration additive [GPS event read indexes](../sql/2026-11-16-gps-event-read-indexes.sql) bằng `CREATE INDEX CONCURRENTLY`, ngoài transaction, lúc `2026-11-16T07:34:30Z`:

- `idx_gps_events_event_time_id`: biểu thức `CASE WHEN source='poll' THEN observed_at ELSE COALESCE(provider_recorded_at, observed_at) END DESC, id DESC`.
- `idx_gps_events_vehicle_event_time_id`: `vehicle_id` rồi biểu thức/thứ tự trên.

`node scripts/migrate-gps-event-read-indexes.cjs --check`: cả hai index valid. Không đổi RLS, không xóa index cũ, không sửa dữ liệu nghiệp vụ, checkpoint hoặc lịch collector.

## Kiểm tra tự động

| Lệnh / phạm vi | Kết quả |
|---|---|
| Web và mobile lint/typecheck; web production build | Đạt |
| `npm.cmd run test:release` | 55 suite đạt |
| `npm.cmd run test:mobile` | Toàn bộ lệnh đạt |
| `npm.cmd run test:mobile:offline` | 4 script đạt |
| `npm.cmd run test:mobile:performance` | 3 script đạt |
| `npm.cmd run test:mobile:parity` | Toàn bộ lệnh đạt; Excel đủ kết quả theo bộ lọc |
| `check-mobile-gps.cjs` + PGlite | 8 nhóm đạt, gồm quyền, mapping, receipt |
| `check-gps-event-reads.cjs` + PGlite | 200.000 sự kiện giả; 36 phép đối chiếu owner/fleet/branch, đúng thứ tự/phạm vi và sử dụng index |
| `check-mobile-finance-sql.cjs` + PGlite | 124 nhóm đạt |
| `check-mobile-gps-ui.py` trên Expo web export | 9 nhóm đạt, không lỗi JS/host ngoài dự kiến |

Bổ sung kiểm tra 100 transport không tạo listener; cache TTL/timestamp/quyền; 403 loại cache; InfiniteQueryObserver đi qua 40 trang vẫn tối đa 8 trang/160 dòng, refetch 8 request và tải lại được trang trước. Fixture SQL được bổ sung cột `vehicles.status` còn thiếu; fixture Excel được chỉnh theo nhãn cột hiện hành, vẫn kiểm tra cả tọa độ bằng 0 và mốc đồng bộ. Sau sửa cuối cuộn ở `26ce121`, đã chạy lại mobile lint/typecheck, performance/offline và kiểm tra render navigation (9 nhóm, có callback cuối cuộn/nút tải thêm và chặn khi đang tải/lỗi/hết kết quả). Sau chặn tải dây chuyền ở `6b3dfa1`, chạy lại mobile lint/typecheck, performance và navigation; kiểm tra sự kiện layout/edge lặp không tải thêm nếu chưa có lượt kéo mới, nút tải chủ động vẫn hoạt động.

Kiểm tra trình duyệt dùng dữ liệu giả: mở thiết bị không gọi lịch sử, lỗi lịch sử không chặn thiết bị, tái sử dụng bộ chọn, đồng bộ bất đồng bộ giữ danh sách và khóa gửi lặp, polling phút/focus/background; các kích thước 320/375/390/430px, sáng/tối, dọc/ngang, reduced motion. Phần này không phải kiểm tra native hoặc benchmark Samsung.

## Đọc production

Vercel source `edc0d2f`: GitHub status Vercel thành công, deployment `dpl_ANWoYfxj7kdsbppBnmcreHyHNe6W`. Public gate 23 kiểm tra đạt; bốn endpoint GPS mới trả 401 khi không xác thực. Source OTA cuối `6b3dfa1` đã triển khai thành công, deployment `dpl_31EASRvG5TerN36bTnJiyqLYCJ8n`; 23 public gate chạy lại đạt.

Phiên QA đọc có xác thực đã được xóa sau kiểm tra và xác nhận 401. Không ghi hợp đồng, tiền, kho hay chấm công. Mẫu đọc từ máy phát triển lúc `2026-11-16T08:08:33Z`:

| Endpoint | Mẫu | Trung vị | Kết quả |
|---|---:|---:|---|
| GPS devices | 5 | 161 ms | 25 dòng/trang; tổng 457 |
| GPS history | 5 | 127 ms | 100 sự kiện |
| Event options | 1 | 128 ms | 432 thiết bị |
| Sync state | 1 | 126 ms | DTO hợp lệ |
| API GPS cũ | 1 | 229 ms | Tương thích |
| Excel GPS | 1 | 1.129 ms | 457 dòng, khớp tổng trước/sau, 10 cột |

Đây là mẫu nhỏ sau triển khai, có độ trễ mạng máy phát triển; không phải kiểm tra tải nhiều người, p95 ổn định, SLA hoặc thời gian render trên điện thoại. Dữ liệu GPS thay đổi liên tục nên tổng ở lần kiểm tra Samsung sau đó có thể khác.

## Samsung thật

Thiết bị USB ADB: Samsung SM-N960N, app `vn.himoto.staff`, version `1.0.11`, code `12`. Màn Tài khoản sau mở lại hiện đúng “Cập nhật 15:46, 16/11/2026”, khớp OTA cuối bên dưới. Không cài lại APK, không đăng xuất tài khoản trên máy, không chạy giả lập Android.

- Cold start vào GPS online có danh sách thật; không hiển thị trạng thái rỗng giả.
- Tắt Wi-Fi và dữ liệu di động, force-stop rồi mở GPS: khôi phục 465 dòng tổng/25 dòng trang từ cache, có banner ngoại tuyến và giờ lưu; giữ timestamp nguồn, không có thao tác ghép thiết bị trên cache. Khôi phục đúng trạng thái Wi-Fi/dữ liệu gốc sau kiểm tra.
- Mở Lịch sử GPS và cuộn: có sự kiện production và timestamp/nguồn hiển thị. Trở lại màn thiết bị bình thường.
- Bấm “Đồng bộ ngay” một lần: nhận thông báo đang theo nhịp một phút/chưa tới lượt, danh sách giữ nguyên. Nhánh queued/running và khóa gửi lặp được kiểm tra bằng fixture; không tuyên bố đã quan sát queued trên máy ở lượt này.
- Danh sách xe với bộ lọc đọc thực tế 418 kết quả: cuộn tới các dòng 196–198, vượt cửa sổ 160 dòng; không lỗi đọc hoặc vùng dữ liệu trống trong các ảnh quan sát. Đối chiếu vị trí bằng dữ liệu đọc theo đúng thứ tự/bộ lọc, không suy ra từ số lượt vuốt. Sau loại trang, nút xem kết quả trước khôi phục các dòng 41 từ cửa sổ bắt đầu ở dòng 61; phục hồi snapshot cũng tải được từ dòng 261 về 241.
- Ngừng cuộn 10 giây sau loại trang: các dòng 164–167 giữ nguyên, không tự tải dây chuyền tới cuối danh sách như lỗi đã phát hiện khi QA. Bộ lọc thử nghiệm đã xóa sau kiểm tra.

Lượt GPS online/offline, lịch sử và kiểm tra cuộn/khôi phục/idle đều chạy lại trên OTA cuối `6b3dfa1`. Lượt bấm đồng bộ thủ công quan sát trước đó dùng cùng nhánh GPS ở `edc0d2f`. Máy bàn giao đang mở danh sách thiết bị GPS online; Wi-Fi/dữ liệu và thiết lập giữ màn hình khi cắm sạc đã đối chiếu đúng giá trị ban đầu.

Đo ADB gồm khởi chạy intent, UIAutomator dump và screenshot; không dùng làm TTID, thời gian gọi API hay so sánh phần trăm tăng tốc. Phép dò trước phát hành đợi IMEI ngoài vùng nhìn thấy đã bị loại; không dùng con số chờ đó làm baseline. Không chứng nhận 60/120fps hoặc kiểm tra tải lớn từ các thao tác này.

## OTA Android production

- Source: `6b3dfa161bd5c95fcc941b12645c8cab36829dfc`.
- Branch/channel: `production`; runtime `1.0.11`; Expo project `f928280d-4ea8-4574-b64e-51dd44b94d68`.
- Group: `6514f69a-d330-481c-99df-fdac4db8aebc`.
- Update ID: `01a1e389-7723-77fb-abe5-ce1c15cba32b`, tạo `2026-11-16T08:46:39.395Z`.
- Bundle: `entry-f8b6faa3a5ddc9b88a0bab87ef44aa50.hbc`, 8.929.220 bytes.
- SHA-256: `aed9a4257d728feff8e75d7af693e4ffe5cdbea59913f7f4860d5fa009e1868c`.

Export từ source sạch, tại `mobile`, với `EXPO_NO_DOTENV=1`, API `https://himoto.vercel.app`, environment production và cấu hình push Android hiện hữu. Đã đọc manifest production, tải launch asset từ CDN theo asset headers và đối chiếu bytes/SHA-256 khớp export; `androidPushConfigured=true`.

Runtime `1.0.9` vẫn nhận group `71e7a3fd-35c9-45f9-9e2f-f8db5772614f`, không nhận bundle cần native 1.0.11. Máy 1.0.11 cập nhật tại Tài khoản → Kiểm tra bản cập nhật mới hoặc mở lại sau tải nền; không tự reload form đang nhập.

Artifact/log/screenshot Samsung và dữ liệu QA nằm trong `.backups/mobile-gps-speed-20261116` (bản cuối tại `samsung/final2`), `.backups/mobile-gps-performance-*20261116*`, `.backups/mobile-gps-speed-public*-20261116` cục bộ, không đưa vào Git. Không gửi Telegram.

Tài liệu đã đối chiếu: [Expo SQLite SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/), [TanStack infinite queries/maxPages](https://tanstack.com/query/v5/docs/framework/react/guides/infinite-queries), [PostgreSQL expression indexes](https://www.postgresql.org/docs/17/indexes-expressional.html), [CREATE INDEX CONCURRENTLY](https://www.postgresql.org/docs/17/sql-createindex.html), [Next.js 15 after](https://nextjs.org/docs/15/app/api-reference/functions/after).
