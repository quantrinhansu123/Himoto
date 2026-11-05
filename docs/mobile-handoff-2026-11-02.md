# Bàn giao tiếp tục mục tiêu Himoto — 02/11/2026

> **Bàn giao mới nhất03/11:** đọc [mobile-handoff-2026-11-03.md](mobile-handoff-2026-11-03.md)
> và [đoạn copy sang chat mới](mobile-next-chat-prompt-2026-11-03.md). Toàn dự án
> chưa done. Source access/quyền/cơ sở đang sửa có types/lint và offline checks
> đạt, chưa native/browser/export/full-suite; không dùng các mốc native cũ
> chứng nhận source mới. Các mục bên dưới giữ nguyên làm lịch sử/baseline.


## CF-05d copy qua durable work đạt native tập trung —03/11,11:08

Samsung run1 đạt4/4 liên tục trên259file khớp,0crash/ANR: có ảnh → copy lost →
kill/Account original work/ID/phiếu → ack/finish; không ảnh → copy drop → kill/
Account cancellation/late409 → resume chỉ retry copy trên ID gốc. Cuối2nháp/
1ảnh/2copy/8bản giấy tờ/1tombstone/session0, work+ledger rỗng;24checkpoint cũ
không đổi. [QA và giới hạn](qa/2026-11-03-mobile-draft-work-copy.md).
Product source giữ nguyên mốc transitions/form10:39/10:51; mới thêm native
suite/provenance và CI path, không đổi API/migration. Mobile types/lint0.
Android trả lại11:10:48 ở hợp đồng QA cũ → ảnh/hồ sơ,259file khớp, ledger rỗng,
USB giữ theo dõi; runtime `.backups/mobile-android-watch-draft-work-copy-20261103-run1/runtime.json`.
Chỉ thêm session QA, không ghi nghiệp vụ/reset dữ liệu. CF-05d chưa done; tiếp
đến auth/actor/origin/store recovery, storage repair/cleanup/performance,
inline customer/documents, full staging/roles và signed iPhone.

## CF-05d giữ ảnh trước leave/picker và khi ra nền —03/11,10:39

Đã sửa nhánh import lỗi: chưa giữ được ảnh thì chặn rời form và mở picker
tiếp; retry xác minh association gốc, không copy ảnh thứ hai. AppState flush
ảnh/input bằng cùng ranh giới; cache chưa giữ không bị cleanup view xóa.
Core33script/types/lint đạt; Samsung transitions run2 đạt4/4 liên tục trên258
file khớp,0crash/ANR, checkpoint/ledger nghiệp vụ không đổi.
[QA và giới hạn](qa/2026-11-03-mobile-draft-work-transitions.md).
Hồi quy form/API run3 đạt4/4 riêng lúc10:51:01 trên fixture8128 và cùng258file:
1nháp/4ảnh/1tombstone/session0, work+ledger rỗng,0crash/ANR, USB trả đúng.
Export3platform/browser hồi quy4/4 đạt. Android trả lại10:52 tại hợp đồng QA
cũ → ảnh/hồ sơ; runtime `.backups/mobile-android-watch-draft-work-transitions-20261103-run1/runtime.json`,
258file khớp, ledger rỗng, USB giữ theo dõi; chỉ thêm session, không ghi nghiệp vụ.
Tiếp theo native copy qua durable controller, rồi auth/actor/store recovery.
CF-05d chưa done: copy/role/scope, storage repair/cleanup/performance, inline
customer documents, staging và iPhone còn mở.

## CF-05d form/ảnh/Account đạt nghiệm thu tập trung —03/11,09:56

Đã nối và bật native autosave/flush/resume, owned photos, planned UUID và
receipt→ack→ledger. Samsung run2 đạt4/4 liên tục trên253 file khớp,0crash/ANR:
kill trước metadata, mất phản hồi metadata/kill/Account đúng originalID,
mất phản hồiGPLX/kill/Account đúng photo, drop signed/tombstone/late409.
Cuối1nháp/4ảnh/1tombstone/session0, openWork/ledger rỗng; giữ đúng xe/driver/
mũ/tiền/ghi chú. Core32script/types/lint đạt; không reset/gộp run1 lỗi do bộ gõ.
[QA và giới hạn](qa/2026-11-03-mobile-draft-work-form.md).
Export3platform/browser hồi quy4/4 đạt; web dùng memory preview, không là
chứng nhận filesystem. Ưu tiên tiếp: ensure ảnh durable khi rời form ở nhánh
import lỗi + AppState/picker flush, rồi copy/lifecycle/role/storage matrix.

Android đã trả lại09:58 ở hợp đồng QA cũ → ảnh/hồ sơ; runtime
`.backups/mobile-android-watch-draft-work-form-20261103-run1/runtime.json`:
253 file khớp, ledger rỗng, USB8081/8091→8101 giữ theo dõi. Chỉ sessions thay
đổi (10 phiên QA giữ chủ ý), không ghi thêm metadata/ảnh hoặc reset dataset.

CF-05d chưa done: copy/lifecycle/role/scope matrix, inline customer documents,
storage-error recovery/cleanup, hiệu năng nhiều ảnh/generation, full staging/
nhiều phiên/network và signed iPhone vẫn bắt buộc. Mục tiêu100%web giữ nguyên.

## CF-05d có lớp lưu trữ, native adapter đạt —03/11,09:12

Đã có schema/journal generation+checksum/owned JPEG files/planned UUID và
receipt→ack→ledger;7 nhóm core (57+264 điểm fault injection),4 nhóm adapter
mock,3 nhóm disk/cold Node. Bộ test mobile31script exit0; mobile types/lint0.
Samsung native FileSystem thật4/4 trên246 file khớp,0crash/ANR; khôi phục form/
ảnh/mã và originalID tổng hợp qua process kill, chặn generation ghi dở và giữ
bản sealed cũ. Backend watch và pending ledger nghiệp vụ không đổi.
[QA và giới hạn](qa/2026-11-03-mobile-contract-work-storage.md).

Android đã trả về09:13 hợp đồng QA cũ → Ảnh và hồ sơ nghiệp vụ; runtime
`.backups/mobile-android-watch-work-storage-20261103-run1/runtime.json`.
246 file khớp, ledger rỗng, USB8081→8081/8091→8101;1khách/1nháp/0ảnh/0copy/
0delete,9 phiên QA giữ nguyên chủ ý. SHA checkpoint không đổi qua native test
và mở watch, không seed/reset hoặc ghi backend. Form recovery chưa tích hợp.

Chưa nối lớp mới vào DraftEditor/useContractPhotos/useDraftWrite/photo/copy/
Account; không đánh dấu CF-05d done. Tiếp theo autosave/flush/resume/discard,
đối chiếu UUID đúng work/actor/scope, recovery storage lỗi và đo hiệu năng
chain/ảnh trước bật. Cần full flow native/staging/quyền và signed iPhone; mục
tiêu vẫn100%web theo vai trò, không lấy lượt adapter này thay nghiệm thu.

## Thứ tự lưu ảnh khớp nhóm web —03/11,08:25

Đã sửa queue theo slot đã validate: giấy tờ khách → biển số → GPLX → ảnh lập/
giao HĐ → copy; giữ thứ tự nội bộ, giữ phiếu cũ và chặn ảnh chưa gắn đúng xe.
Chọn ảnh ký trước GPLX vẫn ghi GPLX trước ảnh ký. API/logic6, journal3,
browser4/4, Samsung3/3 trên237 file khớp; native1nháp/4ảnh/1tombstone,
ledger rỗng/logout0/0crash/ANR, USB restore. Không đổi backend/migration.
[QA và giới hạn](qa/2026-11-03-mobile-contract-photo-order.md).

Android đã mở lại08:27 tại HĐ QA cũ → Ảnh và hồ sơ nghiệp vụ; runtime
`.backups/mobile-android-watch-photo-order-20261103-run1/runtime.json`.
237 file khớp, ledger rỗng, USB8081/8091→8101 giữ để theo dõi. Restart giữ exact
SHA/generation/digest; sau mở chỉ sessions/sessionSeq đổi (9 phiên QA đang lưu
chủ ý), giữ1khách/1nháp/0ảnh/0copy/0delete. Không seed/reset hoặc ghi nghiệp vụ;
đây là QA, chưa kết nối dữ liệu vận hành. Native runner/reader đã kết thúc.

Tiếp theo CF-05d: lưu bền vững input + ảnh chưa gửi + UUID/receipt và nối Account
ack. Chưa có persistence. Source SDK58 iOS overwrite xóa destination trước
move nên không dùng một manifest overwrite duy nhất; giữ generation hợp lệ
trước và kiểm recovery khi lỗi. Full100%web/roles/staging/signed iPhone còn.

Đây là mốc mới nhất; các trạng thái “đang chạy” trong bàn giao ngày 01/11 là
lịch sử, không dùng để khởi động lại hoặc suy ra test hiện còn chạy.

## Ảnh lỗi tải trong thao tác xóa đạt nghiệm thu tập trung —03/11,08:04

Đã sửa nhánh readable nhưng download lỗi: chỉ cho metadata consent sau lỗi
thực tế; loading vẫn khóa, retry/load mới hủy consent và preview cũ không mở
khóa phiên mới. Browser5/5, Samsung run2/checkpoint8124 đạt4/4 liên tục/236 file
khớp/0 crash/ANR;4 phiếu/2 tombstone, ledger rỗng/logout0 và USB restore.
Không thay backend/CAS/migration. [QA xóa](qa/2026-11-03-mobile-media-delete.md).

Android đã mở lại lúc08:08 ngày03/11 tại hợp đồng QA cũ → Ảnh và hồ sơ nghiệp
vụ. Runtime `.backups/mobile-android-watch-image-error-20261103-run1/runtime.json`:
236 file khớp native mới, ledger rỗng, USB8081→8081/8091→8101 giữ để theo dõi.
Restart giữ exact SHA/generation/digest; chỉ sessionSeq/sessions đổi sau mở,
giữ1 khách/1 nháp/0 ảnh/0 copy/0 delete cũ;8 phiên QA của mô hình đang lưu chủ ý.
Không seed lại hoặc ghi/xóa nghiệp vụ khi mở watch. Không còn native runner/
reader; đây là QA, chưa nối dữ liệu vận hành thật hoặc thêm lượt nghiệm thu.

Thứ tự upload đã sửa và nghiệm thu tập trung ở mốc08:25 bên trên. Tiếp theo
CF-05d private durable files + work item/input/UUID/receipt/Account ack; mới có
[thiết kế chi tiết](mobile-durable-draft-work-plan-2026-11-03.md), chưa persistence.
Full role/staging/video upload/batch/23 entrypoint và signed iPhone vẫn bắt buộc.

## Xóa tệp hồ sơ đạt nghiệm thu tập trung —03/11,07:44

CF-05c đã có review/confirm/UUID/phiếu/tombstone và Account recovery, replay giữ
ảnh thay thế; cùng intent upload/copy/delete. API/PGlite5, PostgreSQL thật4 nhóm/
2 kết nối/4 observed waits, journal3/core28/web release44/types/lint/export và
browser bản cuối4/4 đạt. Samsung run1/checkpoint8123 đã đạt3/3 tập trung/236 file khớp/0 crash/ANR:
lost commit+kill/Account, ảnh thay thế giữ nguyên, stale/drop/late409 và video
cần xác nhận metadata;3 phiếu/2 tombstone, ledger rỗng/logout0, USB restore. [QA xóa](qa/2026-11-03-mobile-media-delete.md).
Android đã mở lại lúc07:47 ngày03/11 tại hợp đồng QA đã có → Ảnh và hồ sơ
nghiệp vụ. Runtime `.backups/mobile-android-watch-media-delete-20261103-run1/runtime.json`:
236 file khớp native, ledger rỗng, USB8081→8081/8091→8101 giữ để theo dõi.
Restart giữ exact SHA/generation/digest; sau mở chỉ đổi sessionSeq/sessions,
giữ1 khách/1 nháp/0 ảnh khách/0 ảnhHĐ/0 copy/0 delete của watch cũ,7 phiên QA
active chủ ý. Không còn native runner/reader, không ghi/xóa nghiệp vụ trong
lượt mở watch, không seed lại dữ liệu. Đây là QA tách biệt; chưa nối dữ liệu
vận hành thật hoặc cộng thêm lượt nghiệm thu.

Watch07:18 bên dưới là mốc lịch sử.
Xóa tệp không chứng nhận video upload/playback; CF-05d/roles/staging/iPhone còn.
Nhánh readable tải lỗi đã được bổ sung ở mốc08:04 phía trên. Bằng chứng3/3
07:44 giữ nguyên phạm vi lịch sử; chưa đóng full CF-05c/role/staging/iPhone.

## Lấy giấy tờ khách vào hợp đồng đạt nghiệm thu tập trung —03/11,07:15

CF-05b đã nối metadata → ảnh → copy bằng nguyên domain web, không ghi đè ảnh
HĐ, có snapshot/UUID/phiếu/tombstone và phục hồi Account. API/PGlite5, browser4,
journal3, hồi quy nhập nháp15/ảnhHĐ4, core27/web release44/types/lint/export đạt.
Samsung run1/checkpoint8122 đạt3/3 liên tục/229 file khớp/0 crash/ANR:1 nháp,
1 ảnh chọn rồi4 giấy tờ; lost commit+kill→Account phiếu gốc, drop/tombstone/
late409/no-op, ledger rỗng/logout0 và USB restore. PostgreSQL thật5 nhóm đạt
trên2 kết nối/4 lock observation, chỉ DB QA; chưa áp migration/backend thật.
[QA copy](qa/2026-11-03-mobile-customer-photo-copy.md).

Android đã mở lại lúc07:18 ngày03/11 trên form nháp chưa lưu/Bước2/Khách hàng,
USB8081→8081 và8091→8101. Runtime
`.backups/mobile-android-watch-customer-photo-copy-20261103-run1/runtime.json`:
229 file khớp native, ledger rỗng; giữ1 khách/1 nháp/0 ảnh khách/0 ảnhHĐ/
0 copy của watch trước,6 phiên QA active chủ ý. Restart giữ exact SHA/generation/
digest; sau mở chỉ thay sessionSeq/sessions, không reset hoặc ghi nghiệp vụ.
Không còn native runner/reader. Giữ cáp USB để theo dõi; đây là QA tách biệt,
chưa nối backend/dữ liệu vận hành thật và không cộng thêm lượt nghiệm thu.

Xóa ảnh/batch/video/hàng đợi chưa gửi khi kill/fullroles/staging/iPhone còn
thiếu; không doneCF05/full app.

## Ảnh HĐ/biển số đạt nghiệm thu tập trung —03/11,04:00

Đã thêm queue trước lưu, rà soát/UUID/phiếu từng ảnh sau lưu, nhiều trang ký
riêng bill, gallery rental/plate và OCR exact kho giữ manual fields. API/PGlite5,
journal3/core26/web release44 đạt; sau polish typecheck/lint/export3 nền tảng
và browser bản cuối4/4 đạt. Samsung run2/checkpoint8121 đạt3/3 liên tục,
221 file khớp/0 crash/ANR;1 nháp/2 ảnh, lost/drop/tombstone/late409/only-remainder,
JPEG4200→2200/full decode/SHA, ledger rỗng/logout0 và USB restore.

Run1 lỗi harness chưa chờ tombstone trước late delivery; checkpoint giữ nguyên,
đã đối chiếu2 ảnh gốc/ledger rỗng/logout0. Không ghép run1 thành pass. Source
sau polish dùng tên nghiệp vụ/thứ tự/biển số thay slot/UUID trong điều khiển;
manual bind/bỏ ảnh xóa lỗi OCR cũ. [QA ảnh HĐ](qa/2026-11-03-mobile-contract-photos.md).

Android watch đã mở lại lúc04:03 ngày03/11 tại form nháp chưa lưu/Bước3/ảnh
biển số, USB8081→8081 và8091→8101. Runtime
`.backups/mobile-android-watch-contract-photos-20261103-run1/runtime.json`:
221 file khớp native, ledger rỗng, giữ1 khách/1 nháp/0 ảnh khách/0 ảnh HĐ cũ,
5 phiên QA active chủ ý. Restart giữ exact SHA/generation/digest; sau đó chỉ đổi
flag kho biển số QA và phiên đăng nhập, không có business write/reset. Đã kết
thúc native runner/reader; giữ cáp USB để theo dõi. Đây là watch, không cộng
thêm nghiệm thu và không nối dữ liệu vận hành thật.

Copy giấy tờ khách/xóa/video/batch/lifecycle/iPhone còn thiếu; không doneCF05/06
hoặc full app. CF05b/c/d đã tách trong backlog.

## GPS đạt nghiệm thu tập trung —03/11

Đã triển khai GPS-01/02, API/PGlite7 nhóm + browser5/5/core25 script/typecheck/lint
đạt. Samsung checkpoint8112/run5 đã đạt4/4 liên tục,210 file khớp/0 crash/ANR.
1 lần ghép QA/lost response+process kill/Account recovery/drop+late409/stale
review, ledger rỗng/logout0 phiên và USB restore. [QA GPS](qa/2026-11-03-mobile-gps.md).
Android đã mở GPS watch lúc02:53 qua8081/8091→8101;210 file khớp, ledger rỗng,
0 GPS writes và giữ nguyên khách/nháp/ảnh cũ;4 phiên QA đang đăng nhập chủ ý.
Runtime `.backups/mobile-android-watch-gps-20261103-run1/runtime.json`.
Không còn native runner/reader; nguồn/QA không đổi sau acceptance.

## Quyền dùng cấu hình mới và preflight thật —03/11

Người dùng đã cung cấp cấu hình và nói nếu cần thì dùng. Từ mốc này được nạp
cấu hình phía server cho công việc cần thiết; KHÔNG chép/log/backup giá trị
khóa, không đưa vào mobile, không tự deploy/migration/production write. Quy
định không đọc env ở mục tiêu/bàn giao cũ là lịch sử, được cập nhật trong phạm
vi quyền mới này. Đã khuyến nghị thay khóa vì nội dung được dán vào chat.

Đã nạp env bằng Next loader im lặng, chạy READ ONLY catalog preflight/rollback
qua ownerDatabase TLS, không business rows/login/session data. Kết quả thật:
schema sessions **legacy_requires_transition_before_current_mobile**, chỉ có
mobile_sessions và mobile_login_attempts (RLS bật); chưa có bảng request/receipt/
media mới. Không áp migration. Proof không env
`.backups/mobile-real-schema-preflight-20261103.json`; [kế hoạch rollout](mobile-real-backend-preflight-2026-11-03.md).
CREATE IF NOT EXISTS migration cũ không đủ. Đã soạn transition riêng03/11
và đạt7 nhóm SQL/auth offline, giữ legacy/current/mixed và rollback khi guard
fail. Chưa áp thật/kiểm đa connection/rollout routes hoặc APK legacy; xem
`docs/sql/2026-11-03-mobile-session-transition.sql` và proof
`.backups/mobile-session-transition-results-20261103.json`.

## CF-05 giấy tờ khách/OCR —03/11, native đang chạy

Đã có form giấy tờ trước thông tin khách/GPLX, chọn/chụp/batch ảnh và OCR có
merge đúng quy tắc web, giữ sửa tay trong lúc đọc, bỏ qua/AI lỗi vẫn giữ ảnh.
Sau tạo/sửa/chọn trùng có ảnh mở bước rà soát đúng ID/tên/cơ sở, upload từng
ảnh bằng media.customer UUID/receipt, lost/drop/tombstone và giữ phần còn lại;
khóa tạo lại khách. CanWrite theo scope thật, ảnh khách khác cơ sở chỉ xem.

API/client và PGlite7 nhóm; mobile24 script; SQL hồi quy124; journal ảnh3,
contract4/duplicate4; types/lint mobile0 lỗi, backend0 lỗi/1 warning cũ.
Browser source cuối ảnh8/8, duplicate7/7, nền/khách35/35; hợp đồng15/15; media
cũ run2 8/8. Media run trước failed3 do harness đọc counter trước khi PUT
trả về, sửa chờ response; không gộp các lượt. iOS/Android Hermes+web export
terminal tại `mobile/.expo/customer-documents-final-qa-20261103`.
[QA giấy tờ khách](qa/2026-11-03-mobile-customer-documents.md).

Native run1 failed0 vì GMS picker không lộ filename; run2 failed0 vì preview
ảnh ở dưới viewport, đã có1 OCR nhưng0 khách/ảnh/nháp/key. Cả hai lượt giữ
checkpoint/proof riêng và đã logout phiên QA qua fixture, không reset. User
đã chọn ảnh QA ở run2. Đã sửa harness dùng MediaStore exactname/hash/unique
second theo Android persist.sys.timezone (shell date là UTC), cuộn tới preview
khi quay về app; không chọn thumbnail chưa xác định.

Đã đối chiếu lại quyền record-photo web: mọi authenticated actor qua RLS,
không đồng nhất với customers.write của editor. Đã sửa customer media API/
resolver/gallery/recovery cho đúng, test PGlite7 gồm actor không có quyền sửa
profile vẫn lưu ảnh đúng scope; OCR giữ customers.write như web. Types/lint
mobile và backend types đạt, mobile24 script/SQL7 mới đạt; browser source
permission cuối8 ảnh/7 duplicate/8 media đạt.

Run3 cũng terminal failed0 do tên OCR nằm dưới preview; exact QA đã tự chọn
và có proof filename/hash/unique timestamp.1 OCR,0 khách/ảnh/nháp/key. Giữ
output/checkpoint8106, đã logout phiên QA qua API. Không ghép các lượt fail.
Đã sửa script cuộn tới tên/status và product cuộn đầu form khi quay lại bước
hoàn tất ảnh. Types/lintmobile và browser mới8 ảnh/7 duplicate đạt lại.

**Native run4 terminal3/3 tập trung lúc01:42 ngày03/11**,199 source/QA khớp,
0 crash/ANR/SystemUI ANR mới. Proof
`.backups/mobile-customer-documents-native-20261103-run4/results.json`.
Dataset riêng8107/PID13096/session95825/checkpoint
`.backups/mobile-customer-documents-fixture-20261103-run4/state.json` giữ1 khách/
2 ảnh/2 nháp/2 OCR QA; đúng ID/xe303/số giấy/1.250.000 VND, lost/drop/tombstone/
late409, ledger rỗng/logout/session0/USB restore. JPEG4200×2800→2200×1467,
80474 bytes/full decode/hash phiếu. Không reset/replay hoặc ghép lượt failed.
Native fileproof và source-provenance giữ cùng output;199 file vẫn khớp.

Hermes iOS/Android+web source cuối terminal tại
`mobile/.expo/customer-documents-native-final-qa-20261103` (iOS entryb4c6b5ac,
Android entryb590fcbb). Chỉ export, chưa signed iPhone/full app acceptance.
Static web8095/PID21356/session28573. Mobile24/API SQL7/SQL hồi quy124 và
browser ảnh8/duplicate7/media8/nền35 đạt, backend lint0 lỗi/1 warning cũ.
Hồi quy hợp đồng15 là trước thay đổi scroll2 dòng, không gộp thành fullnative.

Fixture watch8101/PID7800/session98799 đã restart exact fullstate/digest/
generation11 giữ nguyên,1 khách/1 nháp/2 profileQA và0 documentWrites;
proof `.backups/mobile-customer-documents-watch-restart-20261103/results.json`.
**Đã mở lại Android theo dõi lúc01:53 ngày03/11**, runtime terminal
`.backups/mobile-android-watch-documents-20261103-run4/runtime.json`, màn hợp
đồng mới, ledger rỗng,199 file khớp native;3 phiên QA active (khác0 phiên của
fixture8107 tại kết thúc acceptance). Giữ1 khách/1 nháp/2 profileQA cũ và0 ảnh,
không thêm write trong lượt mở. Cần cáp USB8081→8081,8091→8101 giữ có chủ đích.
Banner root “Bản phát triển · Chưa xác nhận dữ liệu thật”, cơ sởQA; vẫn là QA,
chưa nối business thật. Watch1–3 failed do harness nhập lại/hint/keyboard;
watch4 dùng form trống và ẩn bàn phím đạt, không tính vào3 nhóm acceptance.

Không có reader/runner còn chạy. Runtime giữ: Metro8081/PID13376, watch API
8101/PID7800/session98799, static source cuối8095/PID21356/session28573,
media8099/PID19324, PostgreSQL QA55439/PID6908, nativefixture8107/PID13096.
Các fixture failed8104/8105/8106 vẫn giữ checkpoint/phiếu và đã logout; không
reset/replay các dataset đã ghi. Kiểm runtime thật trước tiếp tục.

Preservation321 file công việc khác giữ hash,39 path đổi có chủ đích (gồm3
pull merge),0 unexpected; `.backups/mobile-customer-documents-preservation-20261103.json`.
Env chỉ được nạp phía server READ ONLY preflight theo quyền mới đầu file;
không sao lưu/log giá trị, không deploy/migration/production write. RealDB
legacy+thiếu bảng mới: chuẩn bị chuyển tiếp/test QA trước đề xuất rollout.

Tiếp theo giữ nguyên100% web: CF-05 ảnh hợp đồng/biển số/copy/xóa/lifecycle/
fullrole/iPhone chưa đủ; GPS ưu tiên theo domain/entitlement web. Bản đồng
nghiệp còn GPS/lịch trực/history/reminder cần chuyển chọn lọc. Không complete
hoặc pause goal. Không lấy các nativefocused3/3 làm full app pass.

## Tiếp tục CF-04 — đầu ngày03/11, native đang chạy

Đã triển khai xem/dùng/sửa hồ sơ trùng trong form tạo khách và hợp đồng. Tách
lỗi duplicate khỏi revision cũ; exact lookup liên cơ sở readonly, ID reload/
sửa qua scopedConnect/RLS. Hủy/đối chiếu UUID tạo cũ trước chuyển hồ sơ, commit
cũ phải dùng đúng receipt gốc. Modal sửa dùng CustomerForm/recovery chung;
quay lại giữ form. Chưa có phần giữ/chuyển ảnh/OCR, không done CF-04/full app.

Web/mobile types/lint exit0; mobile23 script; match API/client6 và cùng6 với
PGlite/scopedConnect/RLS thật; journal duplicate4 và contract-flow4; browser
khách trùng7/7, hồi quy hợp đồng15/15 và nền/khách35/35 đạt.
[QA khách trùng](qa/2026-11-02-mobile-customer-duplicates.md).

**Native source cuối terminal 3/3 tập trung lúc00:13 ngày03/11**,189 file
khớp,0 crash/ANR/SystemUI ANR mới. Proof
`.backups/mobile-duplicates-native-20261103-run2/results.json`.
Fixture riêng8103/PID13524/checkpoint `.backups/mobile-duplicates-fixture-20261103/state.json`:
0 khách tạo/1 sửa/2 nháp đúng khách–xe–số–tiền, ledger rỗng/logout/session0.
Không replay/reset dataset đã ghi. Lượt failed8102 được giữ riêng, UUID đã
hủy qua Tài khoản,0 business write; không ghép failed run. Không có runner
native còn chạy. iOS/Android Hermes+web export source cuối terminal tại
`mobile/.expo/customer-duplicates-final-qa-20261103`,189 file vẫn khớp native.
Browser cuối7/15/35, mobile23 script, PGlite6, journal4 và web release44 đạt.

**Android đã mở lại để theo dõi lúc00:17**, checkpoint cũ8101/PID18468 giữ đủ
1 khách/1 nháp/receipt/UUID; restart exact full state/digest/generation9 đã
kiểm trước khi append2 hồ sơ QA trùng LocalQA/OtherQA (phone0901111111).
Proof `.backups/mobile-duplicates-watch-restart-20261103/results.json`.
Runtime mới `.backups/mobile-android-watch-20261103/runtime.json`: 2 phiên QA
active, ledger rỗng, màn hợp đồng mới;0 write ở lượt mở theo dõi, không cộng
vào3 nhóm native. Root hiển thị “Bản phát triển · Chưa xác nhận dữ liệu thật”,
các cơ sở là QA. USB8081→8081 và8091→8101 giữ có chủ đích; cần cáp USB.
Phiên QA đang active không phải0 session tại kết thúc native8103.

Runtime giữ: Metro8081/PID13376; watchfixture8101/PID18468/session19547;
static source cuối8088/PID1784/session16448; media8099/PID19324,
PostgreSQL QA55439/PID6908; fixture failed8102/PID8128 và native8103/PID13524
vẫn giữ. Phải kiểm thực tế trước tiếp tục. Runtime source cuối đồng nhất189
file, chưa signed iOS/iPhone/full roles/staging/full app.

GitHub CLI chỉ đọc xác nhận homepage repo là `https://himoto.vercel.app`.
Production deployment7494158381 commitd1ea473 success; URL riêng bị Vercel
Protection redirect login, không coi HTTP200 sau redirect là API200. Mobile
API trên commit đó chưa có (`git ls-tree` rỗng), public homepage probe404;
source mobile/API vẫn chưa commit/deploy. Proof:
`.backups/mobile-production-deployment-preflight-20261103.json`.
Không đọc env hoặc ghi DB thật. Goal **active**, đủ100% web/role/Android+iPhone,
không complete/pause. CF-05 tiếp theo phải giữ đúng thứ tự giấy tờ/OCR → khách/
địa chỉ → GPLX, giữ ảnh khi trùng/upload lỗi và đúng hồ sơ chọn; GPS vẫn ưu tiên.

## Bắt đầu triển khai kế hoạch kết hợp —23:30 ngày02/11

Người dùng đã đồng ý triển khai đến done và yêu cầu chạy trên Android để theo
dõi. Goal mới được tạo thành công ở trạng thái **active**, không có token budget;
phạm vi đủ100% web/role/native Android+iPhone giữ nguyên. Không coi trạng thái
paused quan sát ở chat trước trong các phần lịch sử là trạng thái hiện tại.

Đã sửa soạn hợp đồng thành năm phần theo web, thêm khách ngay trong hợp đồng
bằng form/recovery dùng chung; mặc định khách thường active và hồ sơ tạm phải
chọn rõ. Giữ số HĐ/xe/ngày/giá khi trở lại; mất phản hồi hoặc lookup hồ sơ lỗi
không tạo lại khách. Browser15/15, mobile22 script, types/lint đạt; Samsung
run3 đã terminal **4/4 tập trung**,185 file khớp/0 crash/ANR/SystemUI ANR,
ledger rỗng/logout/USB restore. Không phải full app pass. Hai lượt fail script
trước giữ riêng, không có write. Xem [QA luồng nhập](qa/2026-11-02-mobile-contract-flow.md).

Source cuối đã export iOS/Android Hermes + web tại
`mobile/.expo/contract-flow-final-qa-20261102`;185 source/QA file vẫn khớp native.
Browser hợp đồng source cuối15/15 và hồi quy nền/khách hàng35/35 đạt. Hồi quy35
run1 failed do script toggle phần Giấy tờ đã tự mở; run2 sửa harness đạt, product
không đổi. SQL preflight4 schema QA đạt, chưa chạy DB thật. Kiểm preservation
343 file công việc ngoài17 file dự kiến sửa khớp, không mất source cũ.

[Backlog action](mobile-action-backlog.md) giữ đủ23 entrypoint và ghi riêng phần
đã triển khai với phần thiếu. Tiếp tục khách trùng, ảnh/OCR nhập hồ sơ, GPS và
module đồng nghiệp; không tự thu hẹp mục tiêu về CF-01/03 hoặc chỉ tra cứu.

Samsung đã kết nối ADB; app có sẵn `vn.himoto.staff`, JS mới qua Metro8081.
Fixture riêng8101/checkpoint `.backups/mobile-contract-flow-fixture-20261102/state.json`
đã lưu1 khách/1 nháp QA, giữ nguyên qua restart HTTP exact state/digest; không
reset/chạy lại dataset đã ghi. Sau test đã mở lại app để người dùng theo dõi:
`.backups/mobile-android-watch-20261102/runtime.json`, USB8081→8081 và8091→8101
giữ có chủ đích,1 phiên QA active, màn nhập hợp đồng mới. Đây là chế độ theo
dõi riêng, không cộng vào4 nhóm native; cần giữ USB. Runtime cũ/media8099 vẫn
giữ; phải kiểm listener/process thực tế khi tiếp tục.

Runtime kiểm cuối: Metro8081/PID13376, fixture hợp đồng8101/PID7076, static
browser source cuối8085/PID14656; media8099/PID19324 và PostgreSQL55439/PID6908
giữ nguyên. Không có native/test runner còn chạy. Không mở lại fixture8091
trắng;8091 chỉ là port phía phone qua USB tới8101. Phiên QA theo dõi đang active
khác với0 phiên tại thời điểm kết thúc native. Người dùng có thể tự thao tác QA
sau mốc này: kiểm checkpoint thật, không suy count cố định hoặc reset.

Đã kiểm URL tìm thấy trong repo `https://himoto.vercel.app`: login web200 nhưng
mobile session/me404. **Chưa kết nối dữ liệu thật**. Người dùng yêu cầu tự kiểm
giúp vì chưa rõ backend là gì; chưa xác nhận deployment vận hành hay schema DB.
Không đọc env. Đã chuẩn bị SQL catalog chỉ đọc trong
`docs/sql/2026-11-02-mobile-schema-preflight.sql`, chưa áp migration/deploy.

## Phân tích kết hợp app đồng nghiệp — sau mốc22:05

Đã pull web `ac4b189` → `d1ea473` từ `origin/main`, giữ công việc chưa commit;
360 file được đối chiếu, ba file domain giao nhau đã gộp, không mismatch.
Backup source không chứa env: `.backups/prepull-mobile-review-20261102-223205/`.
Đã clone repo `quanhoang55/Himoto_MobileApp` vào `E:/Himoto_MobileApp`,
HEAD `c08bfb9` ngày26/10. Chưa chuyển module vào app hoặc chạy bản đồng nghiệp.

[Phân tích và kế hoạch kết hợp](mobile-integration-assessment-2026-11-02.md)
đề xuất giữ `mobile/` Expo58 làm nền; chuyển chọn lọc GPS/lịch trực/xe/lịch sử/
nhắc nợ và phần phù hợp, giữ domain web mới nhất. Hai bản dùng cùng tên bảng
session nhưng khác schema, cần preflight/chuyển tiếp trước nối thật. Cả hai
luồng nhập hợp đồng/khách/ảnh đều còn khoảng trống so với web; bản hiện tại
cũng cần sửa defaults và trình tự, không tự coi đã đủ parity.

Phạm vi100% web và nghiệm thu native Android/iPhone giữ nguyên. Đây là mốc
phân tích, không phải đã tích hợp hoặc nghiệm thu mới. Trạng thái runtime ở
các phần trước vẫn phải kiểm thực tế khi tiếp tục; không đổi env/backend thật.

## Xác nhận cuối trước chuyển chat —100% web và luồng thao tác

Người dùng đã nhấn mạnh: **đủ100% chức năng web hiện tại theo đúng vai trò**.
Bao gồm cả đọc/tạo/sửa/xóa/duyệt/cấu hình/nhập xuất mà web cho vai trò đó, không
chỉ tra cứu. Giữ điều kiện, thứ tự nghiệp vụ, mặc định, xác nhận, số tiền/trạng
thái, phiếu/lịch sử và kết quả như web; UI được thiết kế cho điện thoại, không
tự rút gọn hoặc đổi nghiệp vụ. Chỉ done sau đủ chức năng và native Samsung/iPhone
acceptance, phát hành/vận hành theo checklist. Dùng ma trận để bóc từng action,
không lấy số page hoặc số test thay thế chức năng đầy đủ.

Sau lượt bị ngắt, công cụ get_goal hiện trả **paused**; đây là trạng thái quan
sát của chat hiện tại, khác với yêu cầu **tiếp tục/giữ active ở chat mới**. Không
được tuyên bố công cụ đã active khi chưa xác nhận. Không đánh dấu complete.
Runtime kiểm lại: không native/test runner;8081/8083/8099/55439 vẫn listen với
PID như snapshot22:05. Không đổi source sản phẩm hoặc kết nối thật trong lượt
xác nhận bàn giao này.

## Chuyển chat —22:05 ngày02/11, Android dùng dữ liệu thật

**Giữ mục tiêu active, không pause/complete. Phạm vi chính thức: đủ chức năng
web theo đúng vai trò**, gồm cả GPS/pin-sạc/VAT/thuê sở hữu, sổ quỹ/công nợ,
báo cáo/ca trực/lịch trực/nhân sự/cơ sở/tài khoản/tích hợp/Excel và action con.
UI rõ, dễ thao tác, mượt/ổn định; cần native Android và signed iOS/iPhone thật.
55–60% roadmap vận hành cũ **không áp dụng cho phạm vi full web mới**. Chưa có
phần trăm full web đáng tin cậy. Đọc `docs/mobile-web-parity.md`, bóc23 entrypoint
thành action/effort; không tự loại module khỏi done hoặc coi bundle/browser là app.

**Yêu cầu mới nhất: kết nối backend/dữ liệu thật để người dùng theo dõi trên
Android khi triển khai.** Đây là quyền chuẩn bị/kết nối thật sau preflight API/
schema/auth, không phải quyền tự tạo/xóa chứng từ giả hoặc chạy test phá trạng
thái production. Nghiệp vụ thật theo UI/quyền người dùng vẫn là mục tiêu. Test
retry/lost/drop/rollback/races dùng QA riêng. Vẫn không tự commit/push/deploy/áp
migration, không đọc/log/sao lưu/sửa `.env.local`; không fallback fixture âm thầm.

**Chưa chuyển Android sang backend thật trong chat này.** URL thật chưa xác minh;
migration mobile chưa deploy bởi phiên này, backend đích cần kiểm thực tế. Mốc
native cuối đã logout; Metro vẫn API `http://127.0.0.1:8091`, reverse rỗng/host8091
offline. Tiếp theo kiểm public config/deployment metadata rồi hỏi đúng URL nếu
thiếu; preflight endpoint/session/feature gate/schema trước khi chuyển. Không
đoán URL hoặc dùng qa/fixture-password trên backend thật. User đăng nhập account
thật trên Android khi backend sẵn sàng. Dùng process EXPO_PUBLIC_API_URL; npx
Metro Administrator đã được cho phép. Không tự deploy/bypass gate chỉ để mở app.

Runtime kiểm thực tế22:05, snapshot
`.backups/mobile-chat-handoff-runtime-20261102-220508.json`:

- Branch feat/mobile-foundation, HEAD ac4b189. Giữ mọi local/upstream/untracked;
  không reset/clean/stash. Không còn test/build/native runner/UIAutomator reader;
  source/QA đã giải phóng. Samsung282a05859f3f7ece/SM-N960N còn USB; reverse rỗng.
- Metro Admin8081/PID13376; static QA8083/PID15624 phục vụ
  `mobile/.expo/media-editor-native-fix-web-qa-run1`; media8099/PID19324.
- Media journal generation17/5 receipt/1 tombstone/0 active sessions; giữ toàn
  bộ keys/proofs/delayed bodies/ảnh.8091/8093/8094/8097/8098 offline. Checkpoint
  8097 vẫn25 phiếu/2 tombstone,8098 vẫn10 phiếu/3 tombstone, SHA nguyên vẹn.
- PostgreSQL17.11 QA PID6908/127.0.0.1:55439, cluster `himoto-mobile-local-qa`,
  data `.backups/mobile-postgres-local-qa-20261102/pgdata`, latest DB
  `himoto_media_races_1793630418053`. Giữ các DB cũ, không re-init/drop/reset.
- Latest proofs: Samsung media8/8 và ledger3/3 riêng,0 crash/ANR,180 file khớp
  mỗi lượt. PGlite124; PostgreSQL9 nhóm/2 sessions/7 waits/285 inputs khớp,
  `.backups/mobile-media-postgres-20261102-run4/` có results/verification/QA dump.
  Mobile155/22, release44/44, types/lint; backend QA602 file unchanged trước
  khi chỉ thêm test/script/docs. Không lấy các mốc này chứng nhận full app.

**Ưu tiên tiếp: kết nối Android thật đúng môi trường và triển khai GPS.** GPS
mới chỉ kiểm source, chưa viết API/UI. Web có `src/lib/management/gps.ts`,
`vehicle-gps-query.ts`, `selected-vehicle-gps.ts`, GPS page/API/refresh/history/
mapping. DTO catalogue mobile hiện cố ý loại tọa độ: làm endpoint riêng, scoped
fleet_read/read-only trước; dùng chung device selection/status/stop evidence/
quyền và giữ provider secrets server-side. Tách HIMOTO đọc–heartbeat–vị trí,
vị trí cũ không gọi là live. Rồi UI list/detail/map/history, sync đúng lease và
admin mapping. Camera/video/HEIC/Activity kill/cache còn thiếu; test picker-cancel
mới chưa viết/chạy. Không tự gọi provider thật trong các test source.

## Steering mới nhất — GPS và phạm vi full web

**Sau đó người dùng đã chọn rõ: “Đủ chức năng web theo đúng vai trò”. Đây là
phạm vi done chính thức**, gồm cả báo cáo/quản trị sâu/ca trực/nhân sự/tài khoản/
tích hợp/Excel. Giữ mục tiêu active, chưa complete. Không dùng55–60% roadmap
vận hành cũ để mô tả full web; cần backlog/effort mới. Tiếp tục GPS trước,
đối chiếu23 entrypoint cùng action con trong `docs/mobile-web-parity.md`.

Người dùng hỏi vì sao không thử ghi production rồi xóa: đã giải thích delete
không hoàn tác kho/ownership/tiền/proof/pending; câu hỏi không cấp quyền ghi thật.
Vẫn không đọc env/commit/push/deploy/production. Người dùng hỏi phần trăm: đã
báo55–60% theo roadmap cũ. Sau câu hỏi GPS và “app done đủ web không”, đã kiểm
source và làm rõ **đó không phải55–60% toàn bộ web**.23 management entrypoint có
nhiều module mobile chưa có. Ma trận `docs/mobile-web-parity.md` ghi cụ thể,
ban đầu chưa chốt phạm vi; lựa chọn full web mới nhất đã ghi ở trên, không được
loại báo cáo/quản trị/Excel khỏi tiêu chí done.

**GPS xe đã xác nhận bắt buộc, ưu tiên triển khai tiếp.** Hiện chưa có API/màn
mobile GPS; mobileRecord chủ động loại tọa độ khỏi DTO chung. Web có shared
`VEHICLE_GPS_JOIN_SQL`, `displayedGpsState`, stop evidence, map link và GPS page.
Tiếp tục bằng endpoint GPS riêng, readonly/scoped theo fleet_read như web,
giữ provider accounts/tokens phía server; UI trạng thái/vị trí/độ mới rõ ràng.
Chưa có GPS source mới ở mốc này. Native picker-cancel/background-kill test
mới chỉ đang cân nhắc, chưa viết/chạy; đừng coi đã kiểm.

## Mốc mới nhất — media JPEG Samsung8/8, ledger riêng3/3, PostgreSQL races9

Đã bổ sung role reconciliation: PGlite **124 nhóm** tại
`.backups/mobile-media-roles-sql-20261102-run1.log`, không đổi entitlement web.
Đã chạy PostgreSQL **17.11 native Windows**, actual media writer/resolver/shared
photo/scopedConnect với hai phiên thật: **9 nhóm đạt**,7 wait có `pg_blocking_pids`,
2 PID riêng,285 source/input hash khớp. Kiểm same UUID/different UUID/photo conflict,
cancel–late/commit–resolve/rollback–resolve, bytes mismatch, actor/branch isolation
và pool reset role/scope/pinned vehicle. Output cuối
`.backups/mobile-media-postgres-20261102-run4/`, log cùng tên thêm`.log`.
Đây là minimal branch fixture, không phải deployed HQ/RLS/staging hoặc toàn bộ
writer concurrency. Xem `docs/qa/2026-11-02-mobile-postgres-races.md`.

Runtime thêm **PostgreSQL PID6908/127.0.0.1:55439**, cluster sentinel
`himoto-mobile-local-qa`, data `.backups/mobile-postgres-local-qa-20261102/pgdata`.
Mỗi run tạo DB timestamp mới; giữ DB cũ, không re-init/drop/reset cluster. Binary
portable EDB chính thức trong `.backups/tools/postgresql-17.11-qa/` có manifest;
không OS service hoặc env file. Docker đã thử mở nhưng init VM treo, đã force stop
đúng instance vừa mở; không còn Docker Desktop/backend, không sửa WSL hoặc tạo
container/image/DB Docker. Backend app không đổi sau mốc build602/native dưới.

Samsung media run2/PID10768 đã **terminal exit0 lúc20:57:55,8/8 tập trung**.
180 source/QA file khớp trong lượt;0 crash/app ANR/SystemUI ANR, không xuất hiện
native error overlay. Đủ picker/review/ảnh/phiếu exact return/swap/transfer/receive,
mất phản hồi/scope/force-stop/Tài khoản và tombstone/late409. 1 phiếu9100 cũ giữ
nguyên,4 phiếu9200 mới; tổng5 phiếu/1 tombstone. JPEG mới2200×1467/81400 bytes,
full pixel decode; old JPEG80836 bytes giữ SHA. Verification
`.backups/mobile-media-native-20261102-run2/verified-after-native.json`.

Ledger cuối được kiểm **riêng3/3**, terminal exit0 lúc21:02:07 tại
`.backups/mobile-media-native-ledger-20261102-run1/`. Tài khoản thật hiển thị
không có thao tác chờ; không upload/resolve/ack ảnh nào trong lượt này,5 phiếu/
tombstone nguyên vẹn; session restore/logout,0 crash/ANR.180 file khớp trong lượt;
product source trùng run2, chỉ QA runner thêm `--ledger-only` và kiểm ledger cuối
cho các lượt full sau. Không cộng8+3 thành một lượt full app. Proof
`verified-after-native.json` trong output ledger. Fixture cuối generation17,
5 phiếu/1 tombstone/0 phiên active; giữ toàn bộ checkpoint/UUID/delayed request.
USB mapping trước/sau rỗng đã kiểm thực tế. Checkpoint điều chuyển/thu hồi vẫn
nguyên SHA,8091/8093/8094/8097/8098 vẫn offline. Không còn UIAutomator reader;
source/QA đã được giải phóng. Metro8081/PID13376 và media8099/PID19324 giữ chạy;
static browser8083 phục vụ `mobile/.expo/media-editor-native-fix-web-qa-run1`.
Phải kiểm process/listener thật trước lần tiếp theo; các dòng “đang chạy” phía
dưới là lịch sử.

Mục tiêu vẫn active. Còn camera thực/video/HEIC/xoay/Activity kill/cache,
vai trò/nhiều phiên PostgreSQL/staging, signed iOS/iPhone và release. Docker CLI
có trên host nhưng local engine hiện chưa chạy; chưa có bằng chứng nhiều phiên
PostgreSQL thật ở mốc cũ; bộ media9 nhóm mới ở đầu tài liệu đã bổ sung phần này.
Không commit/push/deploy/production hoặc đọc env.

## Chi tiết triển khai media và lịch sử chạy

Đã mở editor `/record-media/:entity/:id` từ chi tiết hợp đồng/xe: chọn đúng dòng
trả hoặc lượt đổi/chuyển/nhận đã lưu, gallery phân trang, chọn mục/thêm ảnh phụ,
picker, xem lớn, rà soát rồi xác nhận. Ảnh hiện tại và ảnh mới phải tải được;
phiếu cũng đợi exact-revision image trước ack. Camera có đường quyền/settings
trên native nhưng chưa được nghiệm thu. Web dùng adapter JPEG riêng để kiểm
browser; không thay adapter native Expo.

Discovery25/trang và exact-slot metadata/next supplementary slot đã bổ sung;
next slot tính trên toàn nhóm, không suy ảnh vắng từ trang đầu. Target snapshot
bind cả nhãn/revision/reference và được writer kiểm lại dưới lock. Giữ ảnh gốc/
extras/video metadata, phiếu cũ và parent-level pending UUID qua scope/process.
Hai editor cùng parent dùng exclusive reservation; không chia sẻ nhầm intent.

Mobile155 nhóm/22 module, SQL123, release44/44, root/mobile types/lint đạt;
root lint còn1 warning sẵn có `estimated-sales.ts`. Backend QA terminal exit0,
602 src/shared/public file unchanged/noenv/network blocked. Browser8/8 có
picker JPEG thực,4 viewport light/dark, ảnh lớn/replacement,2 actor/scope,
lost/drop/conflict/late409, phiếu gốc và ledger rỗng/logout. Journal media8
nhóm có restart HTTP thật và đối chiếu bytes/hash. Xem QA media và artifacts
`.backups/mobile-media-editor-*20261102*`, `.backups/mobile-media-journal-*`.
Export native terminal exit0: `mobile/.expo/media-editor-native-qa-run2`;
browser cuối `mobile/.expo/media-editor-web-qa-run4`. Không coi export là native pass.

Runtime được kiểm lại lúc20:23: Metro/fixture cũ đã dừng, không có reader cũ.
Checkpoint điều chuyển generation74/25 phiếu/2 tombstone và thu hồi generation30/
10 phiếu/3 tombstone khớp exact fixture-final native; không dựng lại RAM từ counts.
Preflight `.backups/mobile-media-editor-native-preflight-20261102.json`.
Chỉ khởi động lại Metro Admin bằng helper có EXPO_NO_DOTENV=1 và fixture media
mới8099/PID19324, checkpoint `.backups/mobile-media-fixture-20261102/state.json`.
8091/8093/8094/8097/8098 offline; giữ nguyên trạng thái trong lượt native.

Samsung media run1 đã **terminal failed**:1 nhóm hoàn tất,1 ảnh return-extra13
đã commit,0 crash/ANR; JPEG2200×1467/80836 bytes/full pixel decode. Lỗi raw JSX
space mở native LogBox và chặn quay về chi tiết sau ack; không coi là native pass.
Giữ `.backups/mobile-media-native-20261102-run1/`, phiếu/UUID/checkpoint; USB
đã restore rỗng. Đã sửa fragment messages, thêm lint chặn raw JSX text; chuyển
editor→receipt sang replace và đồng bộ prevention state khi rời editor.
Mobile types/lint, negative lint proof, browser hồi quy8/8 và export web/native
đã terminal đạt ở `.backups/mobile-media-native-fix-*20261102*`;
browser artifact `mobile-media-native-fix-ui-20261102-run1/`. Backend/SQL không đổi.

Samsung media run2 (đã terminal như mốc đầu), dataset9200 được append giữ toàn
bộ records/photos/proofs/sessions/scopes cũ; preflight
`.backups/mobile-media-fixture-9200-preflight-20261102.json`. Có bước đối chiếu
key9101 qua Tài khoản nếu còn, không xóa tay hoặc reset. Output/log
`.backups/mobile-media-native-20261102-run2/` và cùng tên thêm`.log`.
Runner từ chối tiếp tục khi thấy native error overlay. Trong mỗi lượt phải freeze
mobile/shared/QA và chỉ1 UIAutomator reader; không sửa source, chạy build hoặc
restart fixture khi runner sống. Phone API8091 reverse sang8099 tạm thời;
finally phải restore mapping trước lượt. Picker chỉ chọn file synthetic có tên trong created-qa-media.json;
không tap thumbnail cá nhân. Khi chuyển chat, kiểm PID/log/results/runtime thật.
Không chạy lại9100/9200 sau khi đã ghi; giữ mọi UUID/proof/tombstone/checkpoint.

Mục tiêu active. Video/camera thực/HEIC/xoay/Activity kill/cache, vai trò/nhiều
phiên PostgreSQL staging, signed iPhone và release vẫn còn; chưa đủ nghiệm thu.
Không commit/push/deploy/ghi production hoặc đọc/sửa/backup `.env.local`.

## Mốc trước — media API/writer/phiếu

Đã thêm `shared/mobile-record-media.ts`, server preparation/metadata/image GET,
JPEG PUT writer, migration proof bất biến, resolver/ledger `media.contract:id`
và `media.vehicle:id`, typed client và Tài khoản → `/media-receipt/:entity/:id`.
Target return bind itemId, swap bind swapId, transfer/receive bind đúng typed
event. Slot/extras/domain/quyền dùng chung web;ảnh proxy exact revision<=2MiB,
metadata giữ video với lý do chưa hỗ trợ. Không URL storage/token trong DTO.
Writer khóa parent/reference/photo, kiểm revision, ghi ảnh+proof+ack atomic;
flags parent/reference/photo độc lập, original proof không chứa bản sao ảnh cũ.

API7 nhóm, mobile154 nhóm/22 module, SQL121, release44/44, root/mobile types/lint
đạt. Root lint có1 warning sẵn có ở `estimated-sales.ts`,0 lỗi. SQL thực thi
domain/RLS/constraints trong PGlite, không server DB; có readonly/no sequence,
actor/branch/pinned vehicle scope, lost commit/rollback/tombstone/late write,
archive/correction và all4 targets. Migration `2026-11-02-mobile-record-media.sql`
chưa deploy. Docs QA `docs/qa/2026-11-02-mobile-record-media.md` có giới hạn.
Export iOS/Android/web terminal exit0: `mobile/.expo/record-media-foundation-qa`.
Backend build QA session53729/PID3612 **terminal exit0** lúc17:53,601 file
src/shared/public khớp trước/sau,noenv/network blocked. Log
`.backups/mobile-record-media-foundation-backend-build-20261102.log`, proof
`.backups/mobile-record-media-foundation-backend-verified-20261102.json`.
Không còn build/export/unit/SQL đang chạy ở mốc này. Không đọc env.

Chưa có màn chọn slot/ảnh/camera/rà soát/upload. Màn phục hồi đã nối code nhưng
chưa browser/native acceptance; không lấy native ownership/thu hồi trước đó
chứng nhận source mới. Tiếp tục editor với ảnh xem thật trước confirm, giữ form,
pending khóa theo parent, tử tế với photo conflict/reload, rồi durable fixture/
browser/Samsung. Video/camera/HEIC/Activity kill/cache và signed iPhone/staging/
release còn thiếu; mục tiêu active. Không commit/push/deploy/ghi production.
Không còn native reader. Fixture8097 generation74 và8098 generation30 được
đối chiếu live khớp nguyên summary/digest của fixture-final native; giữ toàn bộ
phiếu/tombstone/pending và Metro, không reset hay seed lại datasets cũ.

## Sau chuyển chat — thu hồi và ownership điều chuyển đều đã terminal

Samsung run5/PID16644 đã kết thúc16:54: **10/10 tập trung**, 0 crash/ANR/SystemUI
ANR. Verdict cuối `.backups/mobile-recovery-native-20261102-run5/results.json`,
mode focused-bad-debt-recovery. Đối chiếu thêm `verified-after-handoff.json`:
165 file source/QA khớp,10 phiếu (4 cũ/6 mới),3 tombstone8205/8206/8207,0 phiên
active. Ledger rỗng/logout, old receipts/checkpoint8097 không đổi, USB restore
mapping trước lượt rỗng đã kiểm. Các dòng “run5 đang chạy” bên dưới là lịch sử
lúc16:44; không chạy lại bộ8200 hoặc reset checkpoint.

Đã sửa DTO/backend/UI điều chuyển để bind/hiển thị ownerStoreId/ownerStoreName
thực tế trước và ownerStoreId sau, tách khỏi kho hiện tại. Writer kiểm cả hai;
snapshot bind cả label chủ sở hữu khác kho, lock thêm cơ sở sở hữu. Phiếu schema
cũ vẫn đọc/resolve được, không backfill/suy diễn ownership. API preparation/
preview mới yêu cầu đủ projection; UI phiếu cũ báo thiếu dữ liệu ownership.
SQL111, API điều chuyển10 nhóm, root/mobile types/lint, journal8, export ba
nền tảng và browser10/10 đạt. Browser có hai actor, owner khác kho, legacy wire
projection, bốn viewport light/dark; không sửa proof đã lưu của fixture.
Artifacts `.backups/mobile-transfer-ownership-*20261102*`. Mobile147/21 và
release44/44, backend build QA595 file unchanged/noenv/network blocked đã đạt.
Native ownership run1 **terminal exit0, 9/9 tập trung** lúc17:26, dataset7400;
log/output `.backups/mobile-transfer-ownership-native-20261102-run1*`.
0 crash/app ANR/SystemUI ANR,165 source/QA file khớp; đủ4 action/2 actor,
owner khác kho, before/after, mất phản hồi/force-stop/Tài khoản và tombstone.
Đối chiếu cuối `verified-after-native.json`:17 phiếu cũ giữ nguyên,8 phiếu mới,
tổng25 phiếu/2 tombstone,0 phiên QA active, ledger rỗng/logout; checkpoint thu
hồi8098 nguyên hash,8091/8093/8094 vẫn offline, USB restore mapping rỗng.
PID4996 đã kết thúc; source/QA đã giải phóng. Metro8081/PID18612,
transfer8097/PID10200, recovery8098/PID10724 còn được giữ; phải kiểm runtime
thực tế trước dùng. Snapshot mới `.backups/mobile-transfer-ownership-runtime-20261102.json`.
8097 đã restore exact generation50/digest cũ rồi append12 xe mới, tất cả state
cũ giữ nguyên; preflight `.backups/mobile-transfer-ownership-fixture-preflight-20261102.json`.
Không chạy lại bộ7400/8200 hay reset checkpoint/pending. Các mục “đang chạy”
phía dưới là lịch sử. Media tiếp theo đã đối chiếu target/slot/domain/quyền trong
`docs/mobile-architecture.md`, mục Next record-media integration; chưa có API/UI
media trả–đổi/điều chuyển mới. Tiếp tục scoped preparation/metadata trước writer/
proof/tombstone/pending/UI, rồi staging vai trò/nhiều phiên, iPhone và release.
Mục tiêu active, không commit/push/deploy, không đọc env/ghi production.

## Chuyển chat trong lúc native đang chạy — 16:44 ngày02/11

Người dùng yêu cầu ghi bàn giao để tiếp tục mục tiêu ở chat mới; **không yêu cầu
pause hoặc complete**. Không đổi mục tiêu đầy đủ trong ảnh thành một tác vụ nhỏ.
Ưu tiên đọc runtime trước khi sửa source hoặc chạy test mới:

- Snapshot quan sát .backups/mobile-chat-handoff-runtime-20261102.json; chỉ là
  thời điểm ghi, trạng thái có thể đã tiến thêm. HEAD hiện ac4b189, pull đã xong.
- Runner Samsung run5 **PID16644/session34244**, bộ8200, output
  .backups/mobile-recovery-native-20261102-run5/; log cùng tên thêm .log bên ngoài.
  Lần quan sát16:44 đã có4 nhóm của lượt mới; checkpoint generation12/tổng7 phiếu
  =4 phiếu bộ8100 cũ +3 phiếu mới,0 tombstone. **Chưa có results.json/verdict cuối,
  không gán full pass.** Snapshot này có thể đã tiến thêm khi đọc ở chat mới.
- Metro Administrator **PID18612/8081**, fixture thu hồi **PID10724/8098**,
  checkpoint .backups/mobile-recovery-fixture-20261102/state.json. Source/QA
  đang freeze165 file; giữ nguyên cho đến khi runner kết thúc. Chỉ một reader
  UIAutomator. Không chạy thêm runner, build nặng, hoặc sửa mobile/shared/QA lúc này.
- Cổng8091/8093/8094/8097 đang offline; không dựng fixture RAM từ counts và không
  mở lại8097 giữa lượt: runner so sánh trạng thái cổng cũ và SHA checkpoint cũ.
  Giữ nguyên .backups/mobile-transfer-fixture-20261102/state.json.
- Phone API8091 tạm reverse tới host8098. Runner tự phục hồi USB mapping trong
  finally theo usb-fixture-route.json (mapping trước lượt là rỗng). Không tự đổi
  reverse trong lúc chạy; nếu process đã chết, kiểm cả file và adb reverse --list.
- Qua chat mới, kiểm process bằng Get-CimInstance Win32_Process, listener bằng
  Get-NetTCPConnection; đọc tail log/results trước. Session ID có thể không dùng
  được giữa chat; PID/runtime trên host và artifact cuối mới là căn cứ.

Sau lượt: nếu pass, xác nhận source/QA khớp,0 crash/ANR, ledger QA rỗng/logout,
phiếu cũ không đổi và USB đã restore rồi mới ghi nhận native tập trung. Nếu fail,
giữ toàn bộ proof/pending/checkpoint, đọc lỗi/screenshot và đối chiếu đúng key;
không chạy lại nguyên bộ8200 khi đã có ghi. Có thể append bộ8300 qua control
fixture sau khi xử lý các key cũ, tuyệt đối không reset bộ trước.

Việc tiếp theo sau khi source được giải phóng: upstream vừa đổi store_id cùng
current_store_id khi điều chuyển. SQL đã kiểm cả hai cột, nhưng mobile DTO/preview/
phiếu và UI hiện chỉ thể hiện kho; cần hiển thị/bind cơ sở sở hữu trước/sau và
giữ tương thích phiếu cũ, không diễn giải lại proof cũ thành nghiệp vụ mới.
Sau đó tiếp tục media trả–đổi/điều chuyển theo roadmap, vai trò/nhiều phiên
staging, signed iOS/iPhone và release; chưa đủ điều kiện hoàn thành toàn app.

## Mục tiêu và mức hoàn thiện

Mục tiêu vẫn **active**, chưa hoàn thành. Người dùng yêu cầu tiếp tục chế độ
mục tiêu và làm việc theo tiêu chuẩn dự án lớn cùng dev mobile chuyên nghiệp:
đẹp, rõ ràng, dễ thao tác, mượt, ổn định; đủ nghiệp vụ, kiểm thử từng phần,
build native và kiểm chứng thiết bị trước khi chốt. Không thu hẹp mục tiêu về
bundle hoặc vài màn hình; không tự pause/complete hoặc tạo mục tiêu trùng khi
mục tiêu hiện tại còn active.

Ước lượng cũ **55–60% roadmap vận hành**, không áp dụng phạm vi full web mới;
không phải phần trăm full web hoặc tỷ lệ nghiệm thu hay
sẵn sàng phát hành. iOS chưa có signed development build và chưa kiểm tra trên
iPhone. Không dùng browser/Hermes để tuyên bố app iOS/Android hoàn thiện.

App dùng `/api/mobile/v1` trên backend Next.js/PostgreSQL hiện có của web;
cùng môi trường backend thì chung database, dữ liệu nghiệp vụ và RLS. App
không kết nối thẳng DB. Dùng lại domain web, kiểm tra quyền/phạm vi từng API;
chưa đủ chức năng để thay toàn bộ bản web. Native/browser kiểm tra ghi đang
dùng fixture QA riêng, không chứng minh app trên điện thoại đang nối production.

## Đọc và giữ nguyên

1. Tài liệu này, `docs/mobile-status-2026-11-02.md`.
2. `docs/mobile-roadmap.md`, `docs/mobile-architecture.md`, `mobile/AGENTS.md`.
3. `docs/mobile-handoff-2026-11-01.md` cho bằng chứng và lịch sử chi tiết.
4. QA chuẩn bị trả xe, thu theo kỳ, phục hồi lệnh ghi và Android thật trong
   `docs/qa/`.

Workspace `E:\Himoto`, PowerShell. Branch `feat/mobile-foundation`, HEAD
**ac4b189**. Yêu cầu pull mới ngày02/11 đã được thực hiện: fetch từ1d17b67,
gộp giữ thay đổi local trong package.json và vehicle-actions.ts rồi fast-forward;
chạy lại `git pull --ff-only origin main` báo Already up to date. Không có commit
hoặc stash mới. Backup .backups/prepull-mobile-20261102-160140/ gồm332 file,
integration.json xác nhận330 file còn lại giữ nguyên SHA. Không backup env.

Worktree có rất nhiều thay đổi chưa commit, gồm cả file untracked. Giữ toàn
bộ công việc; không reset/clean/checkout đè, không stash/drop hàng loạt. Backup
trước pull `.backups/prepull-mobile-20261101-194530/` và stash
`85ddeb4bb71a03b726c21d2ee02aef447dad7b8b` vẫn giữ. Không commit/push/deploy,
áp migration production hoặc ghi thử dữ liệu thật trong lượt bàn giao này.

Không đọc ra, log, tự sửa hoặc đưa `.env.local` vào backup/prompt. Dùng biến môi
trường process cho QA/build. Không gửi Telegram khi chưa được yêu cầu.

## Mốc hiện tại — writer/editor thu hồi, đã pull; Samsung đang chạy

Thu hồi vật lý nợ xấu đã có POST /contracts/:id/recoveries, original proof GET
/recoveries/requests/:key, return.recover resolver/tombstone/device ledger và
Tài khoản. Writer khóa order/item, recompute snapshot rồi gọi recordBadDebtRecovery
trong cùng transaction. Kiểm tiền/cọc/ledger nguyên vẹn, lưu actor/event/line
proof trước parent ack; original proof không bị sửa khi hồ sơ đổi về sau, kể cả
soft-delete theo đúng order RLS. Migration docs/sql/2026-11-02-mobile-recoveries.sql
chưa deploy. Quyền contracts.read + contracts.return; không mở rộng finance/scope.

Editor3 bước chọn xe/ngày thực tế/rà soát số dư và xác nhận. Dùng date/time picker
native đang có; ngày/ghi chú giữ khi lỗi, preview không UUID. Khóa nhóm chung
return.record/swap/recover trên một hợp đồng bằng reserveExclusive; mã qua đổi
scope/process restart vẫn thuộc action cũ, không gửi lại khi chưa đối chiếu.

Sau pull ac4b189: mobile **146 nhóm/21 module**, SQL **108**, release **44/44**,
root/mobile types/lint đạt. SQL bổ sung đối chiếu cả store_id/current_store_id
cho transfer/receive/reject/cancel/immediate vì upstream đổi cả chủ sở hữu và kho.
Không chạy script web cần DB thật. Logs mobile-postpull-* dưới .backups/.
Backend build QA595 file src/shared/public khớp trước/sau, không env/network thật:
.backups/mobile-postpull-recovery-backend-verified-20261102.json.

Browser thu hồi **10/10** run3; hồi quy trả xe **9/9**, đổi xe **10/10** cùng
mobile/.expo/native-recovery-writer-qa. Không page errors/unexpected hosts;
không login/ghi dữ liệu thật. Run1 lỗi giả định định dạng ngày của script, run2
lỗi giả định retry; giữ kết quả thất bại riêng. Export iOS/Android/web đạt,
137 file mobile source/assets/plugins/config/shared giữ nguyên; root pull
không sửa mobile/shared. Không lấy export/browser làm native acceptance.

Host reboot lần nữa lúc **15:55 ngày02/11** (Win32 LastBootUpTime): tất cả Metro/
fixture/web process cũ đã dừng. Checkpoint8097 vẫn trên disk, không reset hoặc
khôi phục RAM8093/8094 từ counts. Đã mở **fixture thu hồi riêng8098** với journal
.backups/mobile-recovery-fixture-20261102/state.json; fixtureOnly, không DB/thật.
Journal mới **9 nhóm** có restart HTTP thật, actor/scope, tombstone/lost commit,
atomic replacement failure/lock/corrupt digest; journal điều chuyển hồi quy8 nhóm.
Metro Admin PID18612/8081 đã kiểm listener/health. Fixture8098 PID10724/session49907
đã restore exact generation7/4 phiếu sau sửa harness HTTP503 rồi append bộ8200,
không reset dữ liệu8100. Proof mobile-recovery-fixture-server-fix-verified-20261102.json.
Không tin PID/session lịch sử bên dưới nếu host/runtime thay đổi.

Native thu hồi **đang chạy, chưa full pass**. Run1/run2 dừng0 nhóm trước ghi vì
helper chỉ tìm control trong khi tiêu đề là Text offscreen; 0 crash/ANR. Run3 đạt4
nhóm (picker/pagination/original proof/ownership/settled), có4 phiếu; ca đóng socket
bị Android tự replay cùng UUID và nhận đúng phiếu cũ nên chưa stress pending.
Giữ proof/key8104, không ghép4 nhóm thành kết quả full. Harness sửa trả HTTP503
sau commit; journal test xác nhận một phiếu/replay, không dựa vào socket retry.
Run4 đã đối chiếu/ack đúng phiếu8104 (prior-recovery.json, không tính vào lượt mới),
rồi dừng0 nhóm trước ghi mới vì helper replace coi placeholder tìm kiếm là text.
Đã dùng nút Xóa tìm kiếm và kiểm đúng ID sau nhập; không nới helper xoá chung.
Run5/session34244 dùng bộ8200, bắt đầu từ4 phiếu cũ/0 tombstone, không reset.
Logs/results .backups/mobile-recovery-native-20261102-run{1..5}/ giữ riêng.
Freeze source/QA, một UIAutomator reader; capture165 file source/QA trên APK đúng.
Lượt đang kiểm: picker/note/confirm, ownership/settled, lost response+scope/process
restart, tombstone/late request, conflict và khóa trả–đổi cùng hợp đồng.
APK ARM64 bridge IME đã build/cài từ mốc trước; không clear data/uninstall.
Media, staging nhiều phiên/quyền, signed iPhone/release và roadmap còn tiếp tục.

## Mốc trước — API readonly thu hồi và khôi phục sau host reboot

Đã thêm GET /contracts/:id/recoveries và POST /recoveries/preview (chỉ đọc),
DTO/client typed. Preparation25 dòng/trang, active trước lịch sử; scope hợp
đồng/HQ/legacy29, label foreign/archived không xóa dòng xe. Preview không UUID,
giữ nguyên số dư/cọc, bind contract/item revisions, ngày/ghi chú, composer và
ledger revisions vào snapshot. Parser thời gian/ghi chú và plan gate dùng chung
domain web. Mobile **142 nhóm/21 module**, SQL **103**, release **44/44**,
root/mobile types/lint đạt. SQL có readonly enforcement và parity writer web
ordinary/early/late/multiple/settled/HQ legacy29, không row/sequence mutations.
**Chưa có mobile writer/proof/resolver/ledger/editor/nút thu hồi nợ xấu.**

Host Windows đã reboot lúc khoảng **09:32 ngày02/11**, Win32 LastBootUpTime
đã kiểm. Tất cả service/build trước reboot đều dừng, cổng8081/8091/8093/8094/
8097 không listen. Log build backend mới run1 dừng ở compiling, không gán pass.
Không restart fixture RAM8093/8094 bằng seed; artifact/proof cũ giữ nguyên
nhưng không đủ checkpoint RAM. Không thể nói còn live/unchanged sau reboot.
8091 vẫn offline từ trước. Record .backups/mobile-environment-reboot-20261102.json.

Chỉ fixture journal8097 đã mở lại exact checkpoint: **PID2656/session18289**,
generation50,17 receipt/1 tombstone,0 active session; digest
d7442c0b3e734954e2604fa2e164bbcb4b3ba97f758d80f2139949aecb0c35c9.
Proof .backups/mobile-transfer-fixture-restored-after-reboot-20261102.json.
Không dựng state từ counts. Metro/web servers cũ vẫn offline, native QA đã kết thúc.

Backend build resume/session89976 **terminal exit0**, log
.backups/mobile-recovery-preview-backend-build-20261102-run2.log.
Copy source577 file khớp trước/sau build; hai route recoveries có trong manifest,
không env, network thật bị chặn. Proof
.backups/mobile-recovery-preview-backend-verified-20261102.json.
Helper .backups/resume-mobile-recovery-preview-backend-20261102.ps1.

Mobile export/session80708 **terminal exit0**, iOS/Android/web đạt:
.backups/mobile-recovery-preview-export-20261102.log;
target mobile/.expo/native-recovery-preview-qa. Mọi build/test/export ở mốc
readonly đã terminal; chỉ fixture journal8097 còn live. Native IME/điều
chuyển phía dưới thuộc source trước API, không lấy bundle làm native acceptance.

Tiếp tục writer atomic/immutable proof cho return.recover:<contractId>, khóa
order/item rồi recompute snapshot, gọi recordBadDebtRecovery trong cùng tx,
xác nhận tiền/cọc/ledger không đổi, lưu exact recovery event/line proof trước
parent ack. Thêm actor receipt/current flags, resolver/tombstone/pending và
Tài khoản trước nút ghi. Kiểm cả return.record/swap/recover chờ trên cùng HĐ
bằng reserveExclusive, giữ key qua đổi scope/process death; không chỉ lookup
action đang chọn. SQL rollback/lost commit/replay/scope/HQ/hidden hires, rồi
editor → browser → native đúng source. Media/staging/iPhone/release vẫn tiếp tục.

## Mốc trước — sửa nhập tài khoản với Telex

Đã kiểm docs Expo58/RN0.88 và thiết bị: inputMode=email thực sự tạo Android
inputType0x80021 nhưng Laban Key vẫn ghép qa-receiver thành qa-rêciver; native
IME run1 terminal failed0 trước auth, 0 crash/ANR, không ghi nghiệp vụ.
Đổi riêng ô tài khoản Android sang keyboardType visible-password (không mask
username, vẫn autoComplete username), iOS/web dùng email-address; spellCheck
false, autoCorrect false, không strip dấu/biến đổi credentials hoặc đổi IME.
Ô mật khẩu giữ nguyên secureTextEntry/current-password.

Mobile types/lint đạt: .backups/mobile-login-ime-final-{types,lint}-20261102.log.
Export mới iOS/Android/web: mobile/.expo/native-login-ime-final-qa,
.backups/mobile-login-ime-final-export-20261102.log. Browser điều chuyển cùng
source **10/10**: .backups/mobile-login-ime-final-transfer-ui-20261102/summary.json.

Native IME run2/session2008 **terminal failed0**, cùng lỗi ghép dấu; Android
thực nhận0x80090 thiếu TYPE_CLASS_TEXT. Giữ nguyên artifact, không coi là pass.
Đã thêm mobile/plugins/with-literal-account-input.cjs (Expo withMainActivity)
và nativeID cho ô account. Hook focus chỉ bổ sung TYPE_CLASS_TEXT khi đúng ID,
variation visible-password và class0; gọi setter ReactEditText để staged flags
cũng cập nhật, giữ selection; không sửa text/IME/autofill hay ô mật khẩu.
Plugin test scripts/check-mobile-login-config.cjs đạt; CNG prebuild Android đã
áp dụng, package.json không đổi. Không sửa tay native generated code.

**ARM64 Gradle/session87764 terminal exit0**, BUILD SUCCESSFUL23m4s. APK debug
.backups/mobile-login-ime-arm64-debug-20261102.apk đã cài install-r, không
clear/uninstall app. SHA f28d864c55f6a1ba9eebb2ebb5e7bb4368bdb6b494140d74624c5b8bef6747c0.
ABI chỉ arm64-v8a, cert khớp bản cũ,15 launcher image payloads giữ nguyên.
Proof .backups/mobile-login-ime-{arm64-debug,apk-check}-20261102.json.
Source có nativeID/plugin đã export: mobile/.expo/native-login-ime-bridge-qa,
log .backups/mobile-login-ime-bridge-export-20261102.log; browser điều chuyển
source mới10/10. Root/mobile types/lint đạt, unit API138/20 và release44/44.
Backend domain build QA đạt;573 file src/shared/public khớp source, không env/
network thật. .backups/mobile-recovery-domain-backend-build-20261102.log và
mobile-recovery-domain-backend-provenance-20261102.json.

**Native IME run3/session99816 terminal failed0 trước UI**: USB8081 probe
không nhận được HTTP; startedEpoch null, crash/ANR unknown. Host/status cũng
timeout, fixture8097 vẫn200. Đã dùng quyền Admin được cho phép restart đúng
Himoto Expo CLI qua helper cũ (helper14732), không đụng fixture. Metro mới
**8081/PID17824**, log .backups/mobile-phone-metro-admin-20261102-091703.log;
origin vẫn127.0.0.1:8091. Host và USB/status đã xác nhận running trước retry.

**Native IME run4/session81087 terminal exit0**, **4/4 focused-login-ime**,
0 crash/ANR/SystemUI ANR,153 source/QA file khớp. Tên qa-receiver giữ nguyên
trước/sau Next và đăng nhập đúng actor8 không alias. Username thường, session
restore/logout/ledger rỗng đều đạt; default IME và business state không đổi.
Probe riêng input flags xác nhận0x80091 tại
.backups/mobile-login-ime-native-input-flags-20261102/input-flags-after-fix.json.
App logout và USB8091 trả8091 cuối lượt; không native QA đang chạy. Đây là
source trước API readonly thu hồi. [QA IME](qa/2026-11-02-mobile-login-ime.md).
Các PID/session dịch vụ ở phần lịch sử không còn live sau reboot đầu tài liệu.

SQL thu hồi nợ xấu đã tái hiện và sửa lỗi mốc nợ của shared domain
recordBadDebtRecovery: backdated recovery làm nợ2m thành1m. Giữ plan đã chốt;
legacy known cutoff dùng mốc nợ cũ, thiếu cutoff chặn trước write; auto-close
không sinh lại kỳ thuê. SQL99 nhóm (thêm10), gồm ledger/ack có dữ liệu trước/
sau (không chỉ so mảng rỗng), root types/lint/release/backend QA đạt, chưa có
mobile API/editor/writer mới. [QA domain](qa/2026-11-02-mobile-bad-debt-recovery.md).
Log before-fix-run2 và after-fix-run1; trước-run1 là lỗi kiểu fixture, không
gán thành domain bug. Source baseline được giữ trong .backups, không động DB thật.

## Mốc trước — editor điều chuyển, journal và Samsung 9/9

[QA điều chuyển](qa/2026-11-02-mobile-vehicle-transfers.md): editor ba bước,
destination literal/phân trang, preview readonly, confirmation và recovery đủ
bốn action đã có. `reserveExclusive` giữ một UUID cho nhóm bốn action cùng xe;
lệnh chưa rõ kết quả khóa form, giữ action/key qua đổi scope và restart.
Browser **10/10** hai tài khoản, Samsung **9/9 tập trung** trong một lượt liên
tục (run4), 0 crash/ANR/SystemUI ANR, **151 file source/QA khớp**. Có đủ bốn
action/hai actor, immediate stock movement, lost commit/force-stop/Account,
unsent/force-stop/reopen/tombstone/late409, session restore/logout. Đây là bộ
điều chuyển riêng, không phải full app acceptance. Mobile **138 nhóm/20 module**,
SQL **89**, release **44/44**, root/mobile types/lint và Hermes mới đạt.
Backend vẫn khớp 12 SHA của build QA trước. Chưa ký iOS/iPhone, migration chưa deploy.

Fixture điều chuyển riêng **8097/PID 7012/session 95071**, checkpoint
`.backups/mobile-transfer-fixture-20261102/state.json`, ghi đủ trạng thái
trước phản hồi, lock owner/atomic replace; không reset/seed lại khi rerun.
Fixture journal tests **8 nhóm**, có stop/start server thật. Token hai actor
riêng, logout/revocation thật trong fixture, không đổi USER toàn cục.

Native run4/session 26910 **đã terminal exit 0**, dataset 7301..7312:
`.backups/mobile-transfer-native-20261102-run4/results.json`, mode focused-transfer.
App đã logout, ledger QA rỗng; USB reverse trả 8081→8081, 8091→8091 (host 8091
vẫn offline). Không có native QA đang chạy. Giữ Metro 8081/PID 15536, return 8093/
PID 15756, swap 8094/PID 4988; cả hai fixture cũ khớp before/after. Web source mới
8098/PID 6912/session 54946. Những build/test/export mốc editor đều terminal.

Journal 8097 giữ **17 receipt, 1 tombstone vehicle.transfer:7305**, generation 46,
không còn phiên QA active; digest ec4ae841c6b73595095350edbb63857e180d078b595ff8427f72319d7879fb23.
Snapshot `.backups/mobile-transfer-native-20261102-run4/fixture-final.json`.
Prior transfer proofs unchanged; return/swap fixtures unchanged; legacy8091
availability false/originalFixtureUnchanged=null (không bịa bảo toàn RAM cũ).

Lịch sử trước run4:
Run1 terminal failed0 trước login, helper QA cố xóa chữ placeholder trống;
0 session/0 write trên journal, 0 crash/ANR. Đã sửa script nhập fresh login
và dùng nguyên checkpoint. Run2 terminal failed2 ở login actor8: Telex Laban
biến qa-receiver thành qa-rêciver. Có một phiếu transfer7101 đã ack, giữ nguyên.
Thêm alias fixture qa8, restart server có so sánh exact checkpoint digest/
generation/summary trước/sau; artifact mobile-transfer-fixture-restart-20261102.json.
Append dataset mới (không overwrite/reset), run3 đạt5 nhóm rồi terminal failed
ở selector recovery còn hardcode7104 trong khi pending đúng là7204. Giữ 9
receipt cũ (7101 và các ca720x), gồm lost commit7204 và key trên thiết bị.
Đã sửa selector theo vehicle-base; run4 dùng --recover-vehicle 7204 để mở/kiểm
tra exact UUID rồi ack key đó trước bộ ca mới. Không ghi lại/hủy phiếu đã commit,
không reset fixture, không ghép5 nhóm run3 thành full pass. Giữ cả phiếu/xe cũ.
Khi có native QA tiếp theo phải freeze source/script QA, một UIAutomator
reader, không chạy heavy build/test song song. Kiểm tra handle/process/results
thật trước chờ hoặc tiếp tục, không restart vì log im lặng.

### Việc tiếp theo, giữ nguyên mục tiêu đầy đủ

1. Xử lý UX ô đăng nhập với bộ gõ Telex trên Samsung: hiện TextInput account
   dùng keyboard mặc định; đã thấy qa-receiver bị nhập thành qa-rêciver.
   Alias qa8 chỉ giúp kiểm nghiệp vụ hai actor, chưa chứng minh email/username
   có ký tự lặp gõ đúng. Cần kiểm docs RN/Expo58 rồi keyboardType/inputMode
   email phù hợp; giữ nguyên keyboard/autofill của người dùng, không tự bỏ dấu
   trong tài khoản. Kiểm lại tên gốc trên thiết bị trước đóng việc này.
2. Media theo slot và dịch vụ lưu trữ web, và thu hồi vật lý nợ xấu riêng:
   domain `recoverBadDebtVehicle`/parser trong src/lib/server/contract-returns.ts
   đã có, bảo toàn nợ/tổng/cọc/receipts; không dùng completeReturnBatch cho ca đó.
   Tiếp tục atomic proof/ledger/tombstone trước nút ghi, SQL → UI → native.
3. Staging nhiều phiên/RLS/vai trò/cơ sở/hiệu năng, trợ năng/chữ lớn, signed
   iOS/iPhone và release acceptance. Không đánh dấu app hoàn thành từ các
   bundle hoặc cộng các bộ native tập trung thành full app pass.

## Mốc trước — backend điều chuyển đủ bốn hành động

[QA điều chuyển](qa/2026-11-02-mobile-vehicle-transfers.md): preparation/kho đến/
preview readonly, writer dùng applyVehicleAction, immutable receipt và
vehicle.transfer/receive/reject/cancel resolver/tombstone/ledger/Tài khoản/
màn phiếu gốc đã có. **Chưa có editor/nút ghi, fixture/browser/native điều chuyển.**

Full mobile **132 nhóm/20 module**, SQL **89**, release **44/44**,
root/mobile types/lint và backend build QA đạt. 12 file backend/shared khớp
SHA copy build. Migration mobile-vehicle-transfers chỉ chạy trong PGlite.
Hermes source mới iOS/Android xuất đạt: mobile/.expo/native-transfer-backend-qa,
log .backups/mobile-transfer-native-export-20261102.log; đây chỉ đóng gói.
Mọi build/test mốc này đã terminal, không chờ lại các exec cũ.
Đã sửa lỗi shared writer cho phép điều chuyển soft-deleted stock, có SQL tái
hiện trước sửa. HĐ mở không chặn transfer; ready chờ người khác nhận, các
status khác chuyển ngay/giữ status. Không đổi hợp đồng/tiền, không gửi Telegram.

Native đổi xe 6/6 phía dưới thuộc source trước bổ sung này; không gán cho
source điều chuyển mới. Fixture 8091 vẫn offline, không restart/reset trắng.
Giữ fixture 8093/8094 và pending keys; chưa có native QA đang chạy.

## Mốc trước — editor đổi xe và Samsung

[QA đổi xe cập nhật](qa/2026-11-02-mobile-swaps.md): đã có editor ba bước,
preview chỉ đọc không UUID, writer/receipt/recovery và nút ghi. Browser source
cuối **10/10**, hồi quy trả xe cùng bundle **9/9**, mobile **126 nhóm/19 module**,
SQL **77**, release **44/44**, root/mobile types/lint đạt.

Samsung **6/6 tập trung đổi xe**, 0 crash/ANR/SystemUI ANR, source trước/sau
khớp 140 file. Có search keyboard, cancel confirmation, receipt/ack, mất phản
hồi/force-stop/Tài khoản, unsent key/force-stop/reopen/cancel/late409 và session/
logout. Không ghép thành full app pass. Result:
.backups/mobile-swap-native-20261102-run2/results.json. App đã logout/ledger rỗng,
native QA đã kết thúc. APK dev từ mốc icon, source JS mới qua Metro; chưa ký iOS.

Backend source mới build đạt (copy không env/DB thật, chặn network), chín file
backend/shared khớp SHA:
.backups/mobile-swap-editor-backend-build-20261102.log và provenance JSON cùng
prefix. Hermes mới mobile/.expo/native-swap-editor-qa xuất đạt; đây chỉ đóng gói,
không phải signed native/release acceptance. Tất cả build/test mốc này terminal.

**Thay đổi môi trường cần giữ:** fixture cũ 8091/PID 15412 đã dừng trước native
swap run1 (connection refused, process và session cũ mất); nguyên nhân chưa xác
định. Không reset/khởi động lại bằng dữ liệu trắng. Artifact cũ còn nhưng chưa đủ
snapshot để khôi phục chính xác toàn bộ RAM. Run1 failed 0 nhóm trước prewarm,
chưa đổi USB/mở app/ghi. Run2 dùng flag QA --allow-missing-prior-fixture, JSON
ghi priorFixtureAvailableBeforeRun=false, originalFixtureUnchanged=null;
không tuyên bố bảo toàn server cũ. Không dùng count cũ để dựng trạng thái giả.

Fixture trả xe 8093/PID 15756 vẫn giữ đúng hai receipt/tombstone before/after.
Fixture swap riêng 8094/PID 4988/session 15222 giữ hai receipt 6101/6104 và
tombstone 6105. Không reset hai fixture này. Metro 8081/PID 15536 vẫn chạy.
Phone reverse đã trả 8081 → 8081, 8091 → 8091 (cổng cũ offline). Web cuối
8096/PID 4360/session 62694. Trước QA tiếp theo kiểm tra state/process/key thật.

## Mốc trước — backend đổi xe và phạm vi thuê sở hữu

Chi tiết: [QA đổi xe](qa/2026-11-02-mobile-swaps.md). Đã thêm GET preparation/
candidates, POST writer dùng replaceContractVehicle cùng transaction kho/
snapshot/history/immutable proof; return.swap đã có tombstone/ledger/Tài khoản
và màn receipt gốc. **Chưa có editor/nút chọn đổi xe, browser hoặc native đổi xe.**

Full mobile **125 nhóm/19 module**, SQL **76 nhóm**, release **44/44**,
root/mobile types/lint đạt. Đã tái hiện/fix RLS recursion 54001 ở nguồn HQ
thuê sở hữu, thiếu scope HQ trong label/physical return helpers, legacy-29
và nhả xe cũ ở kho khác. Bốn migration mới chỉ chạy trong PGlite, chưa deploy.
Các log/mốc native phía dưới thuộc source trước đổi xe; không gán pass đó cho
source mới. Fixture 8091/8093 và pending keys giữ nguyên, chưa có native QA chạy.

Backend đổi xe build đạt trong bản sao không chứa env, DB giả/network bị chặn:
.backups/mobile-swap-backend-build-20261102.log; tám file backend/shared
khớp SHA source, .backups/mobile-swap-backend-provenance-20261102.json.
Hermes source mới iOS/Android xuất đạt: mobile/.expo/native-swap-https-qa,
origin QA HTTPS giả, log .backups/mobile-swap-native-https-export-20261102.log.
Đây chỉ kiểm tra đóng gói; chưa ký iOS hoặc chạy UI đổi xe trên máy.
Tất cả build/test mốc đổi xe này đã kết thúc, không chờ lại exec cũ.

## Mốc trước — writer/editor trả xe và icon

Phần preview phía dưới là lịch sử trước writer. Mốc hiện tại:
[QA writer/editor trả xe](qa/2026-11-02-mobile-return-write.md).

- Đã có writer atomic qua completeReturnBatch, fee/settlement snapshots sau
  lock, UUID con server, immutable proof và GET receipt riêng. return.record
  vào resolver/tombstone/SecureStore/Tài khoản; editor bốn bước và xác nhận
  receipt trước bỏ key. Migration 2026-11-02-mobile-returns.sql **chưa deploy**.
- Full mobile **120 nhóm/18 module**, SQL **64 nhóm**, release **44/44**,
  root/mobile types/lint và browser source cuối **9/9** đạt. Các tổng
  114/59/44 phía dưới là mốc preview trước writer.
- Backend source mới build đạt trong bản sao QA không chứa .env.local, DB giả
  và chặn network: .backups/mobile-return-final-backend-build-20261102.log.
  Có route trả xe/preview/settlement-preview/receipt trong output build.
- Web và Hermes Android/iOS source cuối đã xuất lại; native export
  mobile/.expo/native-return-write-qa, log
  .backups/mobile-return-final-native-export-20261102.log. Android
  entry-254739102b263ee82ff844c4eb1b8a3c.hbc, iOS
  entry-f8f5a432481fd0843d7dc813f8177eff.hbc. Chưa có signed iOS build.
  Tất cả build/test lượt này đã kết thúc; không dùng exec đã đóng để chờ lại.
- Icon **đã build/cài và xác minh trên Samsung**, đủ chữ Himoto:
  .backups/mobile-icon-samsung-launcher-20261102.png. APK ARM64 96.046.955 byte,
  SHA 61e9a55e72642b77a7e7b75bb29de3ee83a7270640e810eaf75dc0a2771c4da4
  khớp máy; SecureStore và fixture cũ không đổi.
- Native trả xe run1 failed trước prewarm do Metro timeout, 0 nhóm, chưa ghi.
  Đã restart **đúng** Metro bằng helper Admin sau lỗi HTTP/config rõ ràng;
  metadata mới .backups/mobile-phone-metro-admin.json. Không dùng PID 8600 cũ.
- Native run2 **6/6 tập trung đạt**, 0 crash/ANR/SystemUI ANR, source khớp,
  đã đăng xuất/ledger rỗng/khôi phục USB route, fixture cũ giữ nguyên.
  Artifact .backups/mobile-return-native-20261102-run2/. Đã sửa riêng nhánh
  mở lại editor không có form sau cancel: quay về chọn xe. Browser cuối **9/9**
  đạt; native source cuối hồi quy riêng **4/4 đạt**, 0 crash/ANR/SystemUI ANR,
  source khớp, .backups/mobile-return-native-reopen-20261102/results.json.
  Cả hai lượt đã kết thúc; không có native UI QA đang chạy.
- Fixture trả xe riêng 8093/PID 15756/session 59947, giữ fixture 8091/PID
  15412 nguyên trạng. Phone reverse đã trả 8091 → host 8091, ledger rỗng và đã
  đăng xuất. Fixture 8093 giữ 2 receipt (5101, 5104) và các tombstone cho 5105;
  không reset hoặc ghi lại để test xanh. Metadata tuyến trong artifact.
  Metro hiện PID 15536. Web cuối 8089/PID 16452/session 75432.

## Phần preview trước writer (lịch sử)

GET `/api/mobile/v1/contracts/:id/returns?page=1` đã có chuẩn bị trả xe: quyền
`contracts.read` + `contracts.return`, transaction repeatable-read/read-only,
25 dòng/trang, revision, số dư/cọc, tài khoản theo phương thức, gate nợ xấu/
thiếu hạn/đã trả, không chiếu giấy tờ/raw composer. Có 4 nhóm SQL riêng trong
suite 47 nhóm đã đạt.

**Đã có hai POST chỉ đọc** `/api/mobile/v1/contracts/:id/returns/preview` và
`/returns/settlement-preview`, cùng client typed. **SQL preview/parity đã đạt**;
chi tiết [QA preview](qa/2026-11-02-mobile-return-preview.md):

- `src/lib/server/contract-returns.ts`: tách `calculateVehicleReturn` để writer
  web và preview dùng cùng phép tính; thêm `loadContractReturnableSelection`
  giới hạn 1–50 dòng, đọc được lựa chọn qua nhiều trang. Loader web cũ giữ nguyên.
- `src/lib/server/mobile-return-preview.ts`: parse allowlist revision/items,
  đọc scope/readonly, kiểm tra phiên bản/dòng xe, tính phí theo thứ tự item ID
  như `completeReturnBatch`. Có dự phóng tổng/tiền còn thiếu/credit giảm sớm,
  cọc và điều kiện trả đủ xe; phân biệt base/accrued của thuê sở hữu.
- Snapshot SHA-256 chứa revisions, projected items/balances và dấu cashbook
  `id:xmin`; SQL đã chứng minh ổn định/invalidations khi cashbook hoặc kỳ thu
  thay đổi dù order xmin giữ nguyên, không hash thời gian quan sát thuần túy.
- `shared/mobile-returns.ts`: input/DTO/validator, response ghi rõ `phase:fees`.
  `mobile/src/lib/api.ts` ràng buộc kết quả đúng hợp đồng/revision/dòng/giờ/
  giá/override/giảm/sửa/nội dung. Preview không tạo UUID/receipt và không thu tiền.
- `mobile-return-settlement.ts`/`shared/mobile-return-settlement.ts`: preview
  tiền thực thu, tác động thu vượt, hoàn thuê theo credit, hoàn/giữ cọc; kiểm
  tra snapshot phí trước và phương thức/tài khoản từng khoản. Chưa ghi tiền.
- `scripts/check-mobile-returns.cjs`: 12 nhóm API/client/parser/calculation;
  SQL riêng trong `scripts/lib/mobile_return_sql.cjs`, gọi từ suite SQL chính.
  Tổng SQL **59 nhóm**, so trực tiếp `completeReturnBatch` trong transaction
  rollback: phí/số dư/trạng thái và exact loại/tiền/tài khoản/ngày phiếu.
- Thuê sở hữu base/accrued, qua kỳ thu, trả cuối/thu vượt đã so parity. Lịch
  `paused_at` mà trả cuối làm lệch `stopped_at` bị chặn; không tự sửa bảo lưu.
- Logo launcher đã sửa foreground Android riêng `assets/adaptive-icon.png`,
  logo SVG gốc rộng 600/1024 px trên nền trong suốt, đủ chữ trong mask tròn/
  bo góc và safe circle. Prebuild Android đã chạy, APK icon ARM64 đang build
  ở exec **43962**, log `.backups/mobile-icon-arm64-build-20261102.log`.
  Samsung vừa kết nối lại ADB; cần verify APK/cài -r và chụp launcher, giữ data.

**Chưa có:** POST ghi trả xe mobile, metadata/receipt
bất biến, `return.record` trong resolver/ledger/Tài khoản, editor/UI trả xe,
đổi xe hoặc native cho các nghiệp vụ này. Chưa export/build backend lại sau
thay đổi preview; bundle đã xuất trước đó không đại diện source preview mới.

## Kiểm tra ở mốc preview (lịch sử)

- Root/mobile typecheck và lint đạt. Logs:
  `.backups/mobile-return-settlement-{root,mobile}-{types,lint}-20261102.log`.
- 12 nhóm preparation/preview/calculation đạt:
  `.backups/mobile-return-settlement-api-20261102.log`.
- Full mobile API/form **114 nhóm/17 module** đạt:
  `.backups/mobile-return-settlement-all-api-20261102.log`.
- SQL **59 nhóm** đạt, có preview/parity với `completeReturnBatch`:
  `.backups/mobile-return-settlement-sql-20261102.log`.
- `git diff --check` đạt, chỉ có cảnh báo CRLF cũ ở loader TS và auth route.
- Release bản source mới **44/44** đạt, terminal exit 0:
  `.backups/mobile-return-settlement-release-20261102.log`. Các suite đã kết
  thúc; riêng native icon build theo exec ở trên cần kiểm tra trạng thái.

PGlite là PostgreSQL tách biệt một kết nối, chạy domain/scoped plumbing thật
nhưng không chứng minh row-lock nhiều phiên, deployed RLS hay hiệu năng staging.
Mọi test mới đều không có operational writes. Không có native QA đang chạy
trong lúc thay source ở lượt này.

## Thiết bị, tiến trình và artifact cần giữ

Samsung **SM-N960N**, Android 9/API 28, ARM64, USB serial
`282a05859f3f7ece`. APK package `vn.himoto.staff`, 96.058.863 byte, SHA-256
`6cd7ccfe840b96ed174d21a48a3fc386edac1ca6ad1f9afb1ffb264b001e8334`
đã build/cài/đối chiếu. Backup `.backups/mobile-phone-arm64-debug-20261101.apk`.
Generated APK hiện là ARM64; bản x86_64 backup riêng, không cài nhầm lên máy.

Samsung nền **7/7**, bill tập trung **4/4**, 0 crash/app ANR/SystemUI ANR;
chi tiết ở status và QA Android thật. Thu theo kỳ có bằng chứng từng ca:
bill, giữ form, thu 10.000, mất phản hồi/phục hồi phiếu 5.000, tombstone chặn
late retry. **Chưa có một lượt full liên tục trên Samsung; không ghép failed
runs thành full pass.** Người dùng đã chọn ảnh đỏ “SYNTHETIC BILL - QA ONLY”
hai lần theo yêu cầu trước đó; không hỏi/chọn lại nếu không có ca mới cần ảnh.
Không tự chọn ảnh cá nhân, không chụp gallery. Native bill 4/4 có trước sửa
nhỏ vị trí chỉ dẫn/nhãn nút; sửa UI này đã qua browser 9/9, types/lint/export.

Đã kiểm tra listener trong lượt bàn giao:

- Metro **8081**, PID **8600**, npx chạy Administrator. API USB
  `http://127.0.0.1:8091`. Metadata `.backups/mobile-phone-metro-admin.json`,
  helper `.backups/start-mobile-phone-metro-admin.ps1`. Người dùng đã cho phép
  npx/Admin; không hỏi lại chỉ để khởi động khi thực sự cần. Không restart khi
  chưa có lỗi. Không sửa `.env.local` để đổi origin.
- Fixture **8091**, PID **15412**, exec session cũ **16441**. Lần chứng minh
  cleanup cuối có ledger rỗng/đăng xuất, giữ 2 khoản thu + 2 bill + 1 tombstone.
  Không reset trước khi đối chiếu pending keys và snapshot; không ghi lại khoản
  đã có để làm test xanh.
- Preview cũ **8085–8088** còn listen. Artifact mới nhất trước preview phí là
  `mobile/.expo/web-returns-preparation-qa`, server 8088/PID 9600/session 70573.
  `mobile/.expo/native-returns-preparation-qa`: Android
  `entry-0e5170d1311b1e190dfeec78a3fc0508.hbc`, iOS
  `entry-75b9db9940f1ff86ad57f2299b7cfc07.hbc`. Không phải signed iOS build.

Host 8 GB; không chạy build/test nặng cùng emulator hoặc native UI QA.
SDK `E:\Android\Sdk`, Gradle `E:\Android\Gradle`, JDK
`E:\Java\temurin-21\jdk-21.0.12.1+1`; TEMP/TMP process
`E:\Himoto\.backups\mobile-tmp`. Cấu hình Expo SDK 58; đọc docs đúng SDK trước
khi chạm Expo/RN API. Không sửa native generated dirs bằng tay. Không sửa source/
QA script trong một lượt nghiệm thu native đang chạy; chỉ một UIAutomator reader.

## Việc tiếp theo của mốc preview (lịch sử)

1. Hoàn tất build/cài/launcher icon trên Samsung theo exec ở trên; không xóa
   app data, fixture hoặc pending keys. Không chạy test/build nặng cùng native UI QA.
2. SQL preview/phí/quyết toán/parity đã đạt. Giữ bộ test này khi làm writer;
   PGlite một kết nối và scoped stock helpers fixture chưa chứng minh staging.
3. Writer phải recompute fee/settlement snapshot sau lock; yêu cầu xác nhận
   rõ thu vượt và giữ đúng tác động tăng tổng của web. Hoàn thuê trong credit,
   hoàn cọc chỉ đủ xe/hết nợ. Không tách ghi xe và ghi tiền.
4. Writer qua `completeReturnBatch` trong cùng transaction với money/stock/
   immutable receipt/parent UUID; extend `return.record` vào generic resolver,
   durable tombstone, device pending ledger và Tài khoản trước nút ghi UI.
   UUID con sinh trên server sau lock; replay trả đúng kết quả gốc, không thu
   lại. Phục hồi/ack đúng receipt rồi mới bỏ pending key.
5. UI/editor → fixture/browser → export mới → native đúng source. Sau đó
   đổi xe (`replaceContractVehicle`), điều chuyển/nhận xe, media theo roadmap.
   Nợ xấu dùng recovery riêng. Giữ media trả xe tách ảnh phát hành/bill.
6. Nghiệm thu staging nhiều phiên/quyền/cơ sở/mạng/chữ lớn/trợ năng, signed
   development build iOS/iPhone thật và release builds trước khi complete.

Chủ động triển khai, chỉ hỏi khi thiếu thông tin thực sự chặn. Không spawn
sub-agent nếu người dùng/AGENTS/skill chưa yêu cầu rõ. Không áp dụng lại quyền
admin hay xác nhận picker cũ thành quyền sửa env, reset fixture hoặc ghi dữ
liệu thật.

## Việc tiếp theo sau backend điều chuyển

1. Giữ SQL/preflight/receipt và các mốc native cũ. Làm hub/editor điều chuyển
   đủ bốn hành động, kho đến phân trang, note, preview/effect và confirmation.
   Trước ghi lookup pending cả bốn operation cho cùng xe qua thay đổi scope;
   giữ mã/khóa form khi chưa rõ kết quả. Migration mới chưa deploy.
2. Backend đã dùng applyVehicleAction và pin đúng vehicle trong dataAccess,
   không bật scope_all; có strict parser/readonly snapshot/receipt/recovery.
   Nghiệp vụ web cho phép chuyển xe có HĐ mở; không áp gate cấm thuê của swap
   vào transfer. Xe ready → in_transit/chờ người khác nhận. Xe trạng thái khác
   chuyển kho ngay/giữ status, ghi dispatch + receive cùng tx. Chỉ sender
   được hủy, sender không được tự nhận/từ chối, event cũ không receivable bị chặn.
   Nguồn: src/lib/server/vehicle-actions.ts, vehicle-transfers.ts, vehicle-audit.ts.
3. Fixture riêng và snapshot/journal đầy đủ intent/proof để không phụ thuộc RAM.
   Không restart/reset 8091 hoặc dựng lại bằng count. Sau điều chuyển tiếp tục
   media trả xe và recovery nợ xấu theo roadmap.
4. Staging PostgreSQL nhiều phiên, RLS/quyền/cơ sở/mạng, chữ lớn/trợ năng,
   iOS signing/iPhone và release builds; chưa complete mục tiêu app.

## Đoạn copy sang chat mới

```text
Tiếp tục phát triển Himoto tại E:\Himoto ở chế độ mục tiêu đang theo đuổi.
Mình và một dev mobile chuyên nghiệp làm dự án lớn: cần giao diện đẹp, rõ ràng,
dễ thao tác, mượt, ổn định; đủ nghiệp vụ và kiểm chứng native trước khi done.

Đọc trước docs/mobile-handoff-2026-11-02.md, docs/mobile-status-2026-11-02.md,
docs/mobile-roadmap.md, docs/mobile-architecture.md và mobile/AGENTS.md.
Đọc bàn giao 01/11 nếu cần lịch sử; mốc 02/11 mới là trạng thái hiện tại.

Branch feat/mobile-foundation, HEAD 1d17b67; git pull đã thực hiện. Rất nhiều
thay đổi chưa commit: giữ nguyên, không reset/clean hoặc commit/push/deploy.
Không đọc ra/log hoặc tự sửa .env.local. Metro npx Admin đã được cho phép.

App React Native + Expo dùng chung backend/DB và phân quyền với web theo môi
trường, nhưng chưa đủ chức năng như web. Hiện ước 50–60% khối lượng roadmap,
chưa đủ điều kiện phát hành. Samsung ARM64 đã chạy thật: nền 7/7, bill tập trung
4/4; thu theo kỳ mới có bằng chứng từng ca, không được ghép thành full pass.
iOS chưa có signed development build/iPhone acceptance.

Trả xe đã có GET chuẩn bị, hai preview, writer atomic qua completeReturnBatch,
receipt bất biến, UUID con server, return.record tombstone/ledger/Tài khoản và
editor bốn bước. Mobile 120 nhóm, SQL 64 nhóm, release 44/44, root/mobile
types/lint, backend build QA và browser cuối 9/9 đạt. Samsung 6/6 tập trung
trước sửa một nhánh mở lại editor, rồi 4/4 hồi quy source cuối; cả hai 0 crash/
ANR, source khớp, không ghép thành full pass toàn app. Icon đã cài/xác minh
đủ chữ trên Samsung. Migration mới chưa áp production.

Đổi xe đã có editor ba bước, readonly preview, writer/receipt và return.swap
tombstone/ledger/Tài khoản. Mobile 126 nhóm/19 module, SQL 77, release 44/44,
root/mobile types/lint/backend build/Hermes đạt. Browser 10/10; hồi quy trả xe
cùng bundle 9/9. Samsung 6/6 tập trung đổi xe, 0 crash/ANR/SystemUI ANR và source
khớp; không ghép thành full app pass. 4 migration helper/proof mới chưa deploy.

Fixture cũ 8091/PID 15412 đã dừng trước native; không reset/restart trắng hoặc
dựng lại bằng count. Artifact còn nhưng thiếu full RAM snapshot. Run2 native
swap ghi rõ priorFixtureAvailableBeforeRun=false/originalFixtureUnchanged=null.
Giữ fixture trả xe 8093/PID 15756 (2 receipt/tombstone) và swap 8094/PID 4988
(2 receipt 6101/6104, tombstone 6105). Metro 8081/PID 15536. App logout/ledger rỗng,
phone reverse 8091 → 8091 đã trả (cổng cũ offline), không có native QA đang chạy.
Mọi build/test mốc swap đã terminal; đọc mốc hiện tại đầu tài liệu, không chờ
exec cũ trong phần lịch sử.

Backend điều chuyển đã có preparation/destinations/readonly preview/writer/
immutable receipt, vehicle.* resolver/ledger/Tài khoản và màn phiếu gốc.
Mobile 132 nhóm/20 module, SQL 89, release 44/44, root/mobile types/lint và
backend build QA đạt. Shared writer đã chặn soft-deleted stock. Migration
mới chưa deploy; chưa có editor/nút ghi/fixture/browser/native điều chuyển.
Native đổi xe cũ không đại diện source mới.

Tiếp theo editor đủ bốn hành động và fixture journal đầy đủ/two-actor, rồi
browser/build/native theo applyVehicleAction (HĐ mở vẫn chuyển được, ready chờ
nhận, trạng thái khác chuyển ngay giữ status). Sau đó media và recovery nợ xấu.
Giữ fixture/pending keys/worktree; lưu đủ intent/proof cho QA. Kiểm tra staging nhiều phiên,
phân quyền/cơ sở/mạng/chữ lớn/trợ năng, signed iOS/iPhone và release trước done.
Không coi bundle/browser hoặc vài ca Samsung là app hoàn thiện.

Giữ nguyên mục tiêu đầy đủ, chưa đánh dấu hoàn thành. Chủ động triển khai,
chỉ hỏi khi thiếu thông tin thực sự chặn công việc.
```
