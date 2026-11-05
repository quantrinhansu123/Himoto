# Xóa tệp hồ sơ —03/11/2026

CF-05c đang triển khai. Phạm vi100% web/full role/staging/Android/signed iPhone
vẫn active. Lát này không chứng nhận toàn bộ media hoặc toàn bộ app.

## Source và hành vi

Dùng nguyên `deleteRecordPhoto` + `requireContractPhotoSlot` của web; xóa dòng
ảnh/tệp trong hồ sơ, không xóa asset ngoài storage hay đổi metadata/tiền/kho/
trạng thái. Auth + RLS và row lock theo web; không áp quyền ghi giao dịch trả/
đổi xe cho thao tác xóa ảnh. Giữ phạm vi hồ sơ/line/event và customer ownership.

Xem đúng tệp → xác nhận rõ → DELETE với UUID, parent/reference revision,
target snapshot và photo revision. Rà soát cũ không xóa được ảnh mới. Journal
và immutable proof chung transaction; rollback nếu ghi phiếu lỗi. Mất phản hồi
tra đúng yêu cầu; chưa ghi thì tombstone trước khi cho phép rà soát/gửi mới.
Replay sau khi ô có ảnh mới chỉ trả phiếu gốc và slotEmpty=false, không xóa lại.
Account mở được phiếu xóa sau kill. Upload/copy/delete cùng parent khóa một
intent ở SecureStore theo actor/origin/scope, không gán UUID của action khác.

Ảnh xem được phải tải đầy đủ trước xác nhận. Video/định dạng chưa hỗ trợ xem
vẫn có thể xóa đúng quyền sau xác nhận thông tin mục/thời điểm; không mở tải
video mới. Phần xóa không đồng nghĩa video upload/playback đã hoàn thành.
Client gắn phiếu vào đúng target/request/slot/revision/MIME/bytes/updatedAt.

## Bằng chứng hiện có

- API/PGlite5: quyền/RLS/binding ảnh/return/customer/transfer/video, malformed
  trước DB, stale review, rollback/lost commit/tombstone, replay giữ ảnh mới,
  actor isolation, client từ chối tráo phiếu, bảng proof append-only dù default
  grants cho public roles. `.backups/mobile-media-delete-api-final-20261103.log`.
- PostgreSQL thật4 nhóm:2 kết nối/4 observed pg_blocking_pids; upload thắng thì
  delete cũ bị chặn, delete thắng thì upload cũ bị chặn; retry upload mới rồi
  replay delete cũ vẫn giữ ảnh mới; cancel và resolver cùng tranh chấp request
  row được kiểm. Chỉ DB QA pin cluster/loopback55439.
  `.backups/mobile-media-delete-postgres-20261103-run1/results.json`.
- Journal3: exact restart, phiếu gốc, thay ảnh sau xóa, replay không xóa mới,
  cancellation/late409/logout0. Core28 script và web release44 suite đạt.
- Browser run1 đạt4/4; hồi quy copy4/4 và media8/8 trên bundle mốc đầu đạt.
  Browser bản `verified`4/4 trên236 file cuối đã đạt; export Android/iOS/web,
  root/mobile types và lint đạt sau tăng kiểm metadata phiếu. Samsung
  run1/checkpoint8123 đạt3/3 liên tục lúc07:44,236 file khớp/0 app crash/ANR/
  SystemUI ANR:3 phiếu xóa/2 tombstone, lost commit+kill/Account phục hồi phiếu,
  ảnh thay thế được giữ, stale/drop/late409/fresh review và xóa video sau xác
  nhận metadata; ledger rỗng/logout0 phiên.1 nháp tổng hợp đã seed trước test,
  không cộng thêm metadata/upload trong lượt xóa. USB trước/sau khớp restored.
  Đây là native tập trung, chưa full app/roles/staging/iPhone.

Migration `docs/sql/2026-11-03-mobile-media-deletions.sql` chỉ metadata, chưa áp
DB thật; không deploy, không sửa env/khóa, không test ghi production. CI nối
API/SQL/journal/browser; bài PostgreSQL nhiều kết nối chạy local cluster riêng.

## Còn phải nghiệm thu

Native tập trung đã đạt; ma trận full roles,
HQ/deployed RLS, khách liên cơ sở, mọi loại return/swap/transfer ở native, camera/
HEIC/staging/iPhone vẫn cần kiểm, không suy từ fixture hẹp thành full pass.

Tiếp theo CF-05d: giữ hàng đợi ảnh chưa gửi sau kill/đổi phiên; full video/batch,
23 entrypoint và tất cả action web vẫn bắt buộc.

Proof browser cuối: `.backups/mobile-media-delete-ui-20261103-verified/results.json`;
source/export `.backups/mobile-media-delete-verified-source-20261103.json`,
`.backups/mobile-media-delete-verified-export-20261103.log`. Native chỉ cập nhật
sau terminal proof/diagnostics/ledger/logout; không ghép các lượt khác thành pass.

Proof native: `.backups/mobile-media-delete-native-20261103-run1/results.json`,
`source-provenance.json`, `fixture-final.json`, `runtime-diagnostics.json`,
`usb-route.json` cùng thư mục. Checkpoint8123 giữ nguyên sau logout.

## Android theo dõi sau nghiệm thu

Android đã mở lại lúc07:47 ngày03/11 tại hợp đồng QA đã có → Ảnh và hồ sơ
nghiệp vụ. Runtime `.backups/mobile-android-watch-media-delete-20261103-run1/runtime.json`:
236 file khớp native, ledger rỗng, USB8081→8081/8091→8101 giữ để theo dõi.
Restart giữ exact SHA/generation/digest; sau mở chỉ đổi sessionSeq/sessions,
giữ1 khách/1 nháp/0 ảnh khách/0 ảnhHĐ/0 copy/0 delete của watch cũ,7 phiên QA
active chủ ý. Không còn native runner/reader, không ghi/xóa nghiệp vụ trong
lượt mở watch, không seed lại dữ liệu. Đây là QA tách biệt; chưa nối dữ liệu
vận hành thật hoặc cộng thêm lượt nghiệm thu.

## Mốc phát hiện image error —đã xử lý08:04

Ở mốc07:47, ảnh được DTO đánh dấu readable nhưng tải lỗi thực tế làm nút xóa
khóa vĩnh viễn. Nhánh này đã nối retry và metadata consent sau onError, không
tự xác nhận khi đang tải; browser5/5 và Samsung run2 4/4 đã đạt08:04. Chưa đóng
full CF-05c vì full roles/staging/iPhone và các target native còn phải nghiệm thu.

## Image download error đạt nghiệm thu tập trung —08:04

Đã có source imageFailed từ callback lỗi thực tế, retry ảnh và metadata consent
riêng; trong loading chưa cho consent. Retry/load mới hủy consent cũ và phiên
preview có generation guard để sự kiện ảnh cũ không mở khóa phiên mới. Read
metadata lỗi cũng hủy trạng thái checked/info cũ. Backend/CAS/phiếu không đổi.
Browser mới5/5 đạt, có giữ request ảnh đang loading, trả503, retry thành công,
hủy không tạo UUID và xóa theo metadata sau lỗi có xác nhận. Export3 nền tảng/
mobile types/lint đạt. Samsung run2/checkpoint8124 đạt4/4 liên tục lúc08:04 trên236 file khớp trước/sau,
0 app crash/ANR/SystemUI ANR,4 phiếu xóa/2 tombstone, ledger rỗng/logout0 và USB
restore. Trong đó có retry thành công/hủy không ghi, hủy consent cũ rồi xóa khi
ảnh tiếp tục lỗi; giữ đúng phiên bản và ảnh thay thế. Không ghép run1 cũ vào lượt này.
Proof `.backups/mobile-media-delete-image-error-ui-20261103-run1/results.json`.

Proof native mới: `.backups/mobile-media-delete-native-20261103-run2/results.json`,
`source-provenance.json`, `fixture-final.json`, `runtime-diagnostics.json`,
`usb-route.json` cùng thư mục. Bản đầu vào native chỉ khác browser ở script bảo
vệ thêm hash checkpoint xóa cũ; product source không đổi. Proof
`.backups/mobile-media-delete-image-error-native-source-20261103.json`.
Backend/CAS/migration không đổi, không áp DB thật hoặc deploy.

## Android theo dõi sau image-error acceptance

Android đã mở lại lúc08:08 ngày03/11 tại hợp đồng QA cũ → Ảnh và hồ sơ nghiệp
vụ. Runtime `.backups/mobile-android-watch-image-error-20261103-run1/runtime.json`:
236 file khớp native mới, ledger rỗng, USB8081→8081/8091→8101 giữ để theo dõi.
Restart giữ exact SHA/generation/digest; chỉ sessionSeq/sessions đổi sau mở,
giữ1 khách/1 nháp/0 ảnh/0 copy/0 delete cũ;8 phiên QA của mô hình đang lưu chủ ý.
Không seed lại hoặc ghi/xóa nghiệp vụ khi mở watch. Không còn native runner/
reader; đây là QA, chưa nối dữ liệu vận hành thật hoặc thêm lượt nghiệm thu.
