# GPS một phút và phương án vận hành giờ cao điểm

## Thay đổi triển khai

- `shared/gps.ts`: đọc GPS trên web và bundle mobile mới mỗi 60 giây khi màn hình hoạt động. Mở màn hình/quay lại vẫn đọc dữ liệu gần nhất; nút tải lại vẫn dùng được.
- `claimGpsAccounts`: khóa nhịp 60 giây tại database cho từng tài khoản, dùng chung cho cron, web, mobile và client cũ. Nhiều tab/instance không được nhân số lượt gọi nhà cung cấp. Lease 90 giây, kiểm tra token khi hoàn tất và backoff lỗi giữ nguyên.
- Lịch `himoto-integrations-5s` giữ nguyên. Telegram, push, webhook và luồng đọc bù lịch sử không bị giảm xuống một phút. Không đổi thông tin tài khoản GPS, cách ghép xe hoặc quy tắc ON/OFF/dừng lâu.
- Nội dung trợ giúp/footer phản ánh nhịp mới. Mobile đã cài không tự nhận JavaScript mới vì dự án chưa cấu hình OTA; giới hạn đồng bộ phía server vẫn có hiệu lực ngay với app cũ. Nhịp GET 60 giây trên native cần bản app mới.
- Chi tiết xe đang mở lấy dòng mới nhất từ trang xe hiện tại. Trước sửa, danh sách phân trang nhận GPS mới nhưng dialog vẫn lấy dataset toàn kho cũ hoặc snapshot lúc mở; kiểm tra ON→OFF trên cả Chromium/WebKit phát hiện lỗi này. Thao tác sửa/đổi trạng thái từ dialog cũng nhận cùng dòng mới nhất.

Độ trễ vị trí/trạng thái tăng theo nhịp lấy mẫu. Trình duyệt đọc cache ngay trước một lần đồng bộ có thể cần tới lượt đọc tiếp theo mới thấy dữ liệu mới; không cam kết hiển thị trong đúng 60 giây. Lấy mẫu không bảo đảm ghi đủ mọi chuyển trạng thái ngắn giữa hai lần quét. Webhook/đọc bù lịch sử là nguồn bổ sung; backlog hiện tại chưa cho phép cam kết lịch sử đầy đủ.

## Kiểm chứng

- PostgreSQL 17.11 QA riêng tại loopback: tám kết nối tranh một tài khoản chỉ một claim thành công; gọi lại tại 0/5/30/59 giây bị bỏ qua, sau 61 giây được chạy. Lease chưa hết không bị lấy lại; completion cũ bị từ chối; retry và tài khoản disabled được giữ đúng. Bốn nhóm qua; không gọi provider hoặc ghi nghiệp vụ production.
- Typecheck/lint web và mobile, production build qua. Bộ release 47 suite qua; kiểm tra mobile GPS bốn nhóm qua. Sau sửa dialog, ba bộ management data/loading/timeout qua.
- UI web Chromium và WebKit qua ba nhóm mỗi trình duyệt ở 390/1440 px: không còn nhịp mạng 5 giây, có nhịp một phút, provider lỗi vẫn đọc dữ liệu đã lưu, dialog đang mở đổi ON→OFF→ON và không hiển thị tốc độ cũ. Mobile web bundle mới qua sáu nhóm, gồm nhịp một phút và dừng đọc khi rời màn hình; 0 lỗi JavaScript/host ngoài fixture. Đây không phải thử nghiệm trên iPhone hoặc APK mới.
- Lượt web UI đầu phát hiện dialog cũ; lượt hai qua hành vi nhưng fixture thiếu hai API đọc ảnh/danh mục kho. Đã bổ sung fixture có phạm vi cụ thể; lượt ba đạt toàn bộ. Không bỏ assertion hoặc cho phép request provider thật để làm test đạt.
- Lệnh tái kiểm tra: `node scripts/check-gps-sync-cadence-postgres.cjs` với cụm QA riêng đang chạy; `node scripts/check-mobile-gps.cjs`; `npm run typecheck`; `npm run lint`; `npm --prefix mobile run typecheck`; `npm --prefix mobile run lint`; `npm run test:release`; `npm run build`.

Nghiệm thu production: đối chiếu Vercel báo success cho commit đã push; quan sát `last_attempt_at` của cả bốn tài khoản qua ít nhất hai lần thay đổi/tài khoản, mọi khoảng cách từ 60 giây trở lên. Đồng thời đếm các lượt dispatch của scheduler và kiểm tra cron vẫn active `5 seconds`, không tự gọi endpoint cron để thử vì endpoint đó có gửi thông báo thật. Đo GET bằng quyền nhân viên cơ sở; giữ kết quả là mẫu kiểm tra, không coi là p95 giờ cao điểm. Kết quả chi tiết ghi tại `.backups/gps-cadence-20261111/production-cadence.json` và báo cáo hoàn tất phiên triển khai.

## Bằng chứng dùng để chọn hướng tiếp theo

Snapshot production 23:24–23:29 ngày 11/11/2026:

- Bốn tài khoản GPS được bật, hai Protrack và hai IOPGPS. Lịch cron active mỗi 5 giây. Đổi nhịp quét tài khoản từ 5 sang 60 giây giảm mức lý thuyết từ 48 xuống 4 lượt/phút; không đồng nghĩa CPU toàn hệ thống giảm 92%.
- `max_connections=60`, database khoảng 1,68 GB. Một snapshot có một kết nối active (là truy vấn kiểm tra) và chín kết nối idle phía client. Snapshot này không chứng minh đủ dung lượng kết nối lúc cao điểm.
- Web có pool tối đa bốn kết nối **mỗi instance**, nên tăng số instance vẫn có thể tăng tổng kết nối. Scoped queries hiện pin role/context trong transaction, phù hợp pooler giao dịch; không được thay bằng session `SET ROLE`.
- 868 cursor lịch sử GPS, 832 cursor chậm hơn 10 phút. Các channel liên quan đều bật. Protrack có lỗi `HISTORY_PROTRACK_10009`; cursor cũ nhất từ 17/10. Cần đối chiếu quyền/giới hạn API nhà cung cấp và năng lực đọc bù; không nhảy checkpoint hoặc xóa lịch sử để làm số liệu hết backlog.
- `pg_stat_statements` tích lũy có GPS bulk, sự kiện GPS và helper xe trong nhóm tốn thời gian/đọc đĩa. Số liệu chứa cả thời kỳ trước sửa index, không dùng trung bình tích lũy làm hiệu năng sau phát hành. Đo delta theo cửa sổ thời gian, giữ fingerprint thay vì log SQL/khách hàng.

## Phương án ưu tiên

Giữ Vercel + Supabase + CloudFly, ưu tiên giảm cạnh tranh tài nguyên và có số đo. Chưa có bằng chứng cần chuyển toàn bộ hệ thống hoặc thêm read replica. Những bước bên dưới là đề xuất tiếp theo, chưa tự triển khai hoặc tăng phí.

1. **Tách công việc nền theo hàng đợi và thời hạn riêng.** GPS hiện tại, lịch sử, Telegram và push có giới hạn song song/timeout/backoff độc lập. Hiện handler cron vẫn chờ GPS trước khi trả response và bắt đầu `after()`; một provider chậm vẫn có thể làm thông báo khởi chạy muộn trong lượt đó. Tách execution này là ưu tiên tiếp theo. Ưu tiên giao dịch nhân viên; worker lịch sử dùng ngân sách nhỏ, không chạy bù không giới hạn. Có lease/checkpoint và cơ chế dừng từng nguồn khi provider lỗi.
2. **Giới hạn lượng dữ liệu mỗi thao tác.** Helper nhãn/vị trí xe nên nhận đúng ID hợp đồng/xe cần hiển thị, thay vì materialize lịch sử/inventory toàn cơ sở cho trang 10 dòng. Giữ RLS và kiểm tra parity với xe chuyển kho, lưu trữ, thuê sở hữu, khác cơ sở trước khi phát hành. Cache ngắn chỉ áp dụng dữ liệu đọc, có khóa theo actor/phạm vi/bộ lọc và invalidation sau ghi; không cache kết quả ghi thu chi/trả xe.
3. **Đặt chỉ tiêu và đo giờ cao điểm.** Mục tiêu ban đầu để nghiệm thu: p95 GET danh sách/thống kê dưới 1 giây ở tầng server, p95 ghi giao dịch dưới 3 giây không tính upload, lỗi 5xx/timeout dưới 0,5%. Đây là mục tiêu đề xuất, chưa đạt/chưa ký SLA. Thu thêm thời gian chờ pool/khóa, CPU, Disk IO Balance, độ mới GPS, tuổi hàng đợi và lỗi provider. Cảnh báo theo cửa sổ 5–10 phút; log request ID/route/timing, không token, signed URL, ảnh hoặc nội dung hồ sơ.
4. **Kiểm thử tải staging bằng dữ liệu đại diện.** Tăng từng nấc 5/10/20/40 phiên, kết hợp tìm/lọc/thống kê/mở chi tiết và ghi fixture có idempotency, đồng thời cho worker chạy. Lấy số phiên giờ cao điểm thực tế làm mức nghiệm thu, giữ dư địa khoảng 30%. Kiểm cả provider lỗi/timeout, retry, queue dồn và kết nối hồi phục. Không dùng thử tải ghi trên production.
5. **Chọn compute theo tải đã đo.** Small 2 GB là bước nâng đầu tiên hợp lý nếu Micro còn thiếu RAM/I/O sau tối ưu; không mặc định Small giải quyết mọi nút thắt. Tài liệu hiện tại: Micro 1 GB, baseline 500 IOPS/11 MB/s; Small 2 GB, 1.000 IOPS/22 MB/s; giá compute khoảng $10 và $15/tháng, chưa tính khoản khác. Nếu vẫn không đạt chỉ tiêu thì đo tiếp để chọn Medium hoặc dedicated compute. Chưa thay gói.

Nguồn hạ tầng: [Supabase compute, giá và I/O](https://supabase.com/docs/guides/platform/compute-and-disk), [quản lý kết nối và pool theo từng role](https://supabase.com/docs/guides/database/connection-management). Pool mỗi instance không thay cho giới hạn tổng; tăng pool tùy ý trên Micro có thể tăng tranh chấp.

## Quay lại và dữ liệu

Nếu cần phục hồi nhịp trước, quay lại commit trước thay đổi cadence, giữ nguyên index GPS/ảnh/schema. Không reset `last_attempt_at`, lease, checkpoint, sự kiện hoặc hàng đợi Telegram khi rollback. Không xóa nguồn ảnh cũ hoặc đổi khóa CloudFly. Chỉ quay về bản đã đọc được ảnh CloudFly.

Bằng chứng riêng tư: `.backups/gps-cadence-20261111/`; không commit cookie, credential hoặc dữ liệu khách hàng.
