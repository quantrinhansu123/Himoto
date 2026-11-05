# Giấy tờ khách → hợp đồng —03/11/2026

Đang triển khai CF-05b. Giữ mục tiêu100% web/full roles/staging/Android và signed
iPhone; đây là một action, không phải nghiệm thu full media hoặc full app.

Cập nhật11:08 ngày03/11: copy qua durable draft work đạt Samsung4/4 riêng trên
259file/0crash/ANR, bao phủ có ảnh/lost/kill/Account original work và không ảnh/
drop/kill/cancel/late409/resume copy. Cuối2nháp/1ảnh/2copy/8giấy tờ/1tombstone/
session0, work+ledger rỗng. [QA work và giới hạn](2026-11-03-mobile-draft-work-copy.md).
Các bằng chứng bên dưới giữ nguyên mốc source/domain trước đó.

## Hành vi và nguồn web

Dùng nguyên `copyContractCustomerPhotos` của web: chỉ copy CCCD/hộ chiếu/GPLX
và ảnh bổ sung từ customer_id của hợp đồng, chỉ điền ô thiếu; giữ inline bytes,
MIME và Cloudinary refs. Không ghi đè ảnh HĐ; sửa ảnh khách sau đó không sửa
bản sao đã lưu. Quyền theo đăng nhập + RLS như endpoint web, không thêm quyền
profile-edit giả. Không đổi tiền/kho/trạng thái/metadata.

Luồng mobile lưu metadata → ảnh được chọn → tự copy giấy tờ; lỗi ảnh/copy không
lặp POST tạo nháp. Copy là transaction riêng REPEATABLE READ, khóa order rồi
kiểm parent revision và snapshot nguồn/đích; copy bị thay đổi phải rà soát lại.
Phiếu bất biến ghi số ảnh copy/đã có/khách/actor/thời điểm/hash đích; thay đổi
nguồn không làm phiếu lỗi thời, thay đổi bản sao hoặc parent được báo rõ.

UUID riêng `media.copy:<id>`, journal/idempotency/tombstone chung, receipt riêng;
Account mở đúng phiếu copy sau kill. Actor+origin+scope trong SecureStore, copy
và image-upload cùng hợp đồng dùng reserveExclusive để đối chiếu thao tác trước.
Copy receipt/journal mới có migration metadata riêng, CHƯA áp DB thật.

## Bằng chứng đang có

API/PGlite5 nhóm: exact web copy/inline/cloud/extra, giữ đích có sẵn, RLS,
no-op/no-customer, nguồn đổi/đích đổi, actor isolation, proof rollback, lost
commit, cancelled late request, stale review, privilege revocation dưới default
grants và client từ chối tráo contract/customer/request/counts. Proof
`.backups/mobile-customer-photo-copy-api-final-20261103.log`.

Journal3: exact restart/replay/no duplicate, tombstone/late409/logout0. Core27
script đạt; test pending scope đã mở rộng khóa copy/image. Root/mobile types
và lint đã đạt sau sửa import/type guard; export Android/iOS/web đạt.
Browser copy4/4, hồi quy nhập nháp15/15 và ảnh HĐ4/4 trên bundle cuối đã đạt;
web release44 suite đạt. Samsung run1/checkpoint8122 đạt3/3 liên tục lúc07:15,
229 file khớp trước/sau,0 app crash/ANR và0 SystemUI ANR.1 nháp/1 ảnh chọn,
4 giấy tờ được copy sau ảnh; lost commit + kill → Account về đúng phiếu gốc,
metadata riêng vẫn đối chiếu được; drop/tombstone/late409/no-op giữ4 ảnh đã có,
ledger rỗng/logout0 phiên. USB trước/sau đều rỗng và đã restore, watch được mở
lại riêng sau đó. Không dùng lượt này chứng nhận full app hoặc iPhone.

## Còn phải kiểm/triển khai

Native tập trung đã đạt; chưa chứng nhận staging/backend vận hành, toàn bộ
multiple-session actions, legacy APK hoặc signed iPhone. Xóa ảnh/batch/video/khôi phục hàng đợi chưa gửi/full role vẫn còn
trong backlog, không gộp vào CF-05b để tuyên bố done.

Proof browser: `.backups/mobile-customer-photo-copy-ui-20261103-run1/results.json`;
hồi quy `.backups/mobile-customer-photo-copy-draft-regression-20261103/results.json`
và `.backups/mobile-customer-photo-copy-photo-regression-20261103/results.json`.
Proof source/export: `.backups/mobile-customer-photo-copy-source-20261103.json`,
`.backups/mobile-customer-photo-copy-export-20261103.log`. CI đã nối API/SQL/journal/
browser; YAML parse đạt, chưa chạy remote CI.

## Tranh chấp PostgreSQL thật trong QA

`scripts/check-mobile-customer-photo-copy-postgres.cjs` đạt5 nhóm trên cluster
loopback55439 pin `himoto-mobile-local-qa`, DB mới chỉ dữ liệu tổng hợp. Có2
backend PID khác nhau và4 lần quan sát pg_blocking_pids thực tế:

- Hai kết nối dùng cùng UUID chỉ ghi một copy/phiếu. Trong REPEATABLE READ,
  request chờ có thể nhận serialization conflict; giữ UUID và resolver trả
  phiếu gốc, replay sau đó không thêm ảnh.
- Resolver chờ transaction copy chưa commit rồi trả committed khi copy thắng;
  cancellation thắng trước thì request đồng thời và request đến muộn không ghi.
- Order lock chặn phiên đổi customer_id đến sau copy; phiếu cũ giữ customer201,
  sau đổi khách parentCurrent=false; không tráo nguồn ảnh giữa transaction.
- Nguồn đổi trong lúc transaction copy đã đọc snapshot vẫn copy đúng bytes đã
  rà soát; source sửa sau đó không làm bản sao thay đổi. Đây là bảo đảm snapshot,
  không phải cam kết nguồn không thể đổi sau lần đọc.

Proof `.backups/mobile-customer-photo-copy-postgres-20261103-run1/results.json`.
Không đọc env/DB vận hành. Không có listener/lease nghiệp vụ được rollout;
CI hiện chỉ nối suitePGlite/browser/journal, bài hai kết nối này chạy local
với cluster QA đã có và từ chối cluster/host/port khác.

Proof native `.backups/mobile-customer-photo-copy-native-20261103-run1/results.json`,
`source-provenance.json`, `fixture-final.json`, `usb-route.json` cùng thư mục.

## Android theo dõi sau nghiệm thu

Android đã mở lại lúc07:18 ngày03/11 trên form nháp chưa lưu/Bước2/Khách hàng,
USB8081→8081 và8091→8101. Runtime
`.backups/mobile-android-watch-customer-photo-copy-20261103-run1/runtime.json`:
229 file khớp native, ledger rỗng; giữ1 khách/1 nháp/0 ảnh khách/0 ảnhHĐ/
0 copy của watch trước,6 phiên QA active chủ ý. Restart giữ exact SHA/generation/
digest; sau mở chỉ thay sessionSeq/sessions, không reset hoặc ghi nghiệp vụ.
Không còn native runner/reader. Giữ cáp USB để theo dõi; đây là QA tách biệt,
chưa nối backend/dữ liệu vận hành thật và không cộng thêm lượt nghiệm thu.
