# GPS native —03/11/2026

Phạm vi: màn hình `/gps` hiện tại của web, thêm vào Tổng quan của mobile.
Không coi đây là nghiệm thu toàn bộ app hoặc các báo cáo công nợ có dùng GPS.

## Đã triển khai

- Đội xe đầy đủ, gồm xe chưa gắn GPS, thiết bị chưa ghép và nhiều thiết bị cùng
  xe; lọc cơ sở/nền tảng/trạng thái/tìm kiếm, phân trang25 dòng không cắt đội xe.
- Quy tắc web được chuyển nguyên byte sang `shared/gps.ts`; web giữ đường dẫn
  import qua re-export. Không suy đang chạy từ tốc độ cũ; dữ liệu quá10 phút
  hiện Chưa cập nhật. Dừng trên3 ngày cần hơn72 giờ và mọi thiết bị còn khả
  dụng của cùng xe đồng thuận, ưu tiên mốc Protrack, không dùng khóa điện.
- Hiện riêng Himoto đọc/tín hiệu/vị trí/mốc dừng và nguồn bằng chứng. Tọa độ0
  hợp lệ; tọa độ sai không mở map. Google Maps chỉ nhận tọa độ, không bearer.
- Nhật ký100 sự kiện, lọc nguồn/thiết bị/cơ sở; lấy mẫu dùng observed_at,
  đọc bù/trực tiếp dùng thời điểm nhà cung cấp theo truy vấn web.
- Đọc mỗi5 giây khi màn hình có focus và AppState active; không đọc chồng,
  hủy đọc khi rời màn hình/background. Giữ dữ liệu cùng bộ lọc khi đọc lỗi.
- Đồng bộ dùng `syncGpsAccounts` và lịch sử/lease hiện có, khóa gửi lặp trong
  UI, không tự retry POST. Không cấp đồng bộ cho phiên chưa xác thực.
- Ghép/bỏ ghép chỉ canonical admin, gồm tương thích nhận diện admin legacy;
  settings.write riêng không nâng quyền. Dùng cùng SQL mutation với web.
  Chỉ đổi xe mới xóa hai mốc dừng. Snapshot review chỉ gồm thông tin ghép,
  tránh xung đột giả do mỗi bản tin tín hiệu thay xmin của thiết bị.
- UUID/journal/receipt nguyên tử, bản kết quả gốc theo actor, tombstone chặn
  yêu cầu muộn; mở kết quả trong Tài khoản, giữ key tới khi đối chiếu xong.
  Receipt giữ được ngay cả khi ghép đã đổi hoặc thiết bị bị xóa sau đó.

`docs/sql/2026-11-03-mobile-gps-mappings.sql` chỉ đã chạy offline. Chưa áp lên
DB thật. Khóa GPS/provider vẫn chỉ ở server. Android vẫn cấu hình QA rõ nhãn.

## Kiểm chứng

- API/client/PGlite7 nhóm đạt, fixture/journal3 nhóm và overlay watch giữ dữ
  liệu cũ đạt; không env/network/provider thật. Native session gate kiểm đủ
  GET/POST read/refresh/candidate/mapping/receipt. Scoped actor giữ branch
  scope ngoài fleet_read; receipt table không cấp quyền cho scoped clients.
- Bộ mobile core25 script đạt trên source mới; pending-scope có thêm GPS.
- Browser run4 đạt5 nhóm trên bundle cuối: role, filter, trạng thái/dừng lâu,
  map không Authorization, history, read/sync errors, polling dừng khi rời
  màn hình, lost/drop/late409/stale review,320/375/390/430 không tràn ngang.
  Không page errors hoặc host ngoài danh sách QA.
- Typecheck web/mobile và lint phần server mới/mobile đạt. Web release44 suite
  offline đạt sau khi chuyển GPS domain sang shared; không network thật.
- Đồng bộ đã kiểm qua Next Node adapter thật: POST rỗng vẫn có stream được
  chấp nhận; payload có byte bị chặn. SQL receipt revoke cả quyền default
  anon/authenticated và scoped, được kiểm với default grants mô phỏng Supabase.
- Hermes iOS/Android và web export đạt. Đây không phải signed iPhone test.

Proof: `.backups/mobile-gps-tests-20261103.json`,
`.backups/mobile-gps-ui-20261103-run4/results.json`,
`.backups/mobile-gps-domain-equivalence-20261103.json`,
`.backups/mobile-gps-web-query-equivalence-20261103.json` (4 SQL nguyên byte),
`.backups/mobile-gps-core-final-20261103.log`,
`.backups/mobile-gps-export-20261103.log`,
`.backups/mobile-gps-web-release-20261103.log`.

Samsung run5 đã đạt **4/4 liên tục** lúc02:50 ngày03/11, checkpoint riêng8112.
210 file nguồn/QA khớp,0 crash/app ANR/SystemUI ANR;1 lần ghép QA, hai mã
tombstone, late409, ledger rỗng/logout0 phiên, USB route đã khôi phục. Đã kiểm
process kill sau commit và mở kết quả gốc qua Tài khoản. Proof terminal:
`.backups/mobile-gps-native-20261103-run5/{results,fixture-final,source-provenance,usb-route,runtime-diagnostics}.json`.
Đây là nghiệm thu GPS tập trung, không phải full app pass.

## Chưa nghiệm thu

Provider thật, staging/full roles/nhiều phiên DB, reconnect/lifecycle đầy đủ,
signed iPhone/iOS, dữ liệu legacy thật và rollout. Báo cáo nợ/Telegram có GPS
thuộc entrypoint nghiệp vụ tương ứng, không tự gộp vào nghiệm thu màn hình này.
Các lần browser lỗi giữ nguyên checkpoint/proof; đã logout fixture sessions,
không reset request/receipt hoặc dùng lại dataset đã ghi để báo đạt.

Native run1–4 giữ nguyên proof lỗi: run1/run4 nhập tài khoản QA có thêm ký tự
do helper tap lại tọa độ khi IME đang dịch; run2 helper đòi48px cho dòng chữ
nhỏ; run3 đạt2 nhóm đọc nhưng dừng xác nhận ô nhập khi đổi tài khoản. Tất cả
0 lần ghép,0 phiên fixture active ở terminal; không cộng các lượt này thành
full native pass. Helper mới tap một lần rồi kiểm focus/đọc lại nội dung trước
submit, không đổi IME/autofill của người dùng.

## Android đã mở để theo dõi —02:53 ngày03/11

Màn GPS đang mở trên Samsung qua Metro8081, device8091→host8101. Watch QA
đã restart giữ nguyên SHA/generation12/digest checkpoint; không reset khách/
hợp đồng/ảnh cũ. GPS overlay chỉ thêm seed synthetic/read counters,0 lần ghép.
Ledger rỗng,210 file khớp nghiệm thu native;4 phiên QA active do watch chủ ý
giữ đăng nhập. Runtime/screenshot:
`.backups/mobile-android-watch-gps-20261103-run1/{runtime.json,gps-watch.png}`.
Đây là lượt mở theo dõi, không cộng vào acceptance. Cần giữ cáp USB.
