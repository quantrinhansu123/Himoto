# Trạng thái app Himoto — 02/11/2026

> **Ưu tiên mới03/11,12:18:** triển khai đầy đủ chức năng và hoàn thiện luồng
> demo trước; kiểm thử sâu/nghiệm thu tổng thể sau. Trong lúc code giữ kiểm
> tra nhanh biên dịch/types/lint/thao tác chính và sửa lỗi chặn demo. Đọc
> [mục0 bàn giao](mobile-handoff-2026-11-03.md) và
> [nội dung copy mới](mobile-next-chat-prompt-2026-11-03.md). Phạm vi100%web
> và điều kiện nghiệm thu Android/iPhone vẫn giữ nguyên.


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

Trước CF-05d cần sửa thứ tự upload theo nhóm web (native hiện theo thứ tự
chọn ảnh). Tiếp theo private durable files + work item/input/UUID/receipt/
Account ack; hiện mới có
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

## Các mốc tập trung trước bước sao chép

GPS run5 đạt4/4 tập trung,210 file khớp/0 crash/ANR; [QA GPS](qa/2026-11-03-mobile-gps.md).
Ảnh HĐ/biển số run2 đạt3/3 tập trung,221 file khớp/0 crash/ANR; [QA ảnh HĐ](qa/2026-11-03-mobile-contract-photos.md).
Giấy tờ khách/OCR run4 đạt3/3 tập trung,199 file khớp/0 crash/ANR; [QA giấy tờ](qa/2026-11-03-mobile-customer-documents.md).
Trùng khách run2 đạt3/3 tập trung,189 file khớp/0 crash/ANR; [QA trùng khách](qa/2026-11-02-mobile-customer-duplicates.md).
Năm phần hợp đồng/thêm khách tại chỗ/mặc định hồ sơ: Samsung4/4 tập trung,
185 file khớp/0 crash/ANR; [QA nhập hợp đồng](qa/2026-11-02-mobile-contract-flow.md).
Đây là các lượt riêng, không cộng thành full app pass. Copy source229 mới nhất
được kiểm riêng ở đầu tài liệu. Signed iPhone/full roles/staging vẫn bắt buộc.

User đã cho phép dùng cấu hình phía server nếu cần; không chép/log/backup khóa
hoặc đưa vào app, không tự ghi production/schema/deploy. Catalog preflight thật
READ ONLY/rollback xác nhận sessions legacy, chỉ2 bảng mobile cũ; transition đã
soạn và SQL/auth7 nhóm đạt, chưa áp thật. [Preflight/rollout](mobile-real-backend-preflight-2026-11-03.md).
Phân tích sau pull web d1ea473 và app đồng nghiệp c08bfb9:
[kế hoạch kết hợp](mobile-integration-assessment-2026-11-02.md), [backlog action](mobile-action-backlog.md).

## Phạm vi và kiểm kê trước đó

Các đoạn có ngày/mốc cũ dưới đây là lịch sử; dùng bằng chứng03/11 ở đầu tài
liệu cho GPS/khách/ảnh/copy. Phạm vi100% web và tiêu chí native vẫn giữ nguyên.

Yêu cầu mới nhất: Android dùng backend/dữ liệu thật sau khi xác minh API/schema/
đăng nhập, để người dùng theo dõi. **Chưa chuyển sang dữ liệu thật ở mốc22:05**;
Metro vẫn8091 QA, reverse rỗng/host8091 offline. Không fallback fixture âm thầm
hoặc chạy test ghi giả production. Xem bàn giao/runtime mới nhất.

**Chưa hoàn thành app. Phạm vi đã chốt: đủ chức năng web theo đúng vai trò.**
Chưa có tỷ lệ hoàn thành full web đáng tin cậy.55–60% là ước lượng roadmap ưu
tiên vận hành trước khi đổi phạm vi, không dùng cho mục tiêu full web mới.
Đây là ước lượng khối lượng theo roadmap, chưa phải chỉ số nghiệm thu hoặc tỷ
lệ sẵn sàng phát hành. Backlog chưa có trọng số effort đầy đủ; không lấy số test
đạt, số màn hình hay bundle xuất được để suy ra phần trăm sản phẩm hoàn thiện.

Không phải55–60% toàn bộ web. Kiểm kê23 entrypoint cho thấy GPS, pin/sạc, VAT,
sổ quỹ độc lập, nhắc nợ, báo cáo ca/doanh số, lịch trực, nhân sự/cơ sở/quản lý
tài khoản/tích hợp còn thiếu hoặc chưa đủ. **Tất cả đã nằm trong phạm vi done
được người dùng chọn**, cần bóc effort và ước lượng lại;
xem [ma trận chức năng](mobile-web-parity.md). GPS đã xác nhận bắt buộc; chưa có
màn/API mobile GPS ở mốc này, đang ưu tiên triển khai.

| Phạm vi | Đã có bằng chứng | Còn phải làm/kiểm chứng |
| --- | --- | --- |
| Nền app, tra cứu, phiên và phạm vi | UI tra cứu/lọc/chi tiết, bearer API, SecureStore, khôi phục/đăng xuất. Samsung nền 7/7; sửa Telex bằng native bridge + APK mới, IME 4/4 riêng/0 crash/ANR | Vai trò/cơ sở thực tế, chữ lớn/trợ năng, lỗi mạng đa dạng và iOS thật |
| Khách hàng, chuẩn bị hợp đồng | Tạo/sửa, hồ sơ nước ngoài/người thân, chọn xe/kiểm lịch, soạn/lưu/mở nháp. Có browser và Android emulator theo phạm vi trong QA | Hồi quy ghi nghiệp vụ trên Samsung/iPhone, các ca quyền và xung đột staging |
| Phát hành, nhận cọc, giao xe | Domain chung, kiểm tra phiên bản, mã ghi/receipt/tombstone, native emulator và browser | Kiểm tra thiết bị thật đủ luồng và môi trường đã áp migration/RLS |
| Thu/chi sau phát hành | Năm nghiệp vụ, đối chiếu số dư, tài khoản riêng theo phương thức, phục hồi. Android emulator đã có lượt full | Samsung/iPhone, tranh chấp nhiều phiên PostgreSQL và hiệu năng staging |
| Gia hạn và thu theo kỳ | Gia hạn có/chưa thu, thu ngoài tách phiếu; danh sách kỳ và thu một phần. SQL 43 nhóm, mobile API/form 102 nhóm, browser thu theo kỳ 9/9 | Chưa có một lượt full thu theo kỳ liên tục trên Samsung; bằng chứng từng phần không tự ghép thành full. iOS chưa nghiệm thu |
| Bill | Picker/chuẩn bị JPEG/lưu ảnh/xem lớn và phục hồi bill. Samsung đã chọn ảnh QA, downsample/codec thật và kiểm tra tập trung 4/4 | Camera thực, HEIC/xoay, hủy picker/Activity kill, cache và các loại media khác |
| Trả/đổi xe | Đổi xe browser10/10, Samsung6/6 tập trung/0 crash/ANR. Thu hồi nợ xấu browser10/10 và Samsung run5 10/10 tập trung,165 file khớp/0 crash/ANR; hồi quy trả9/9/đổi10/10 | Camera/video/HEIC/lifecycle media, staging nhiều phiên/quyền/hiệu năng và iPhone; không ghép các mốc thành full app pass |
| Điều chuyển/nhận xe | Đủ bốn action; bản mới mô tả/khóa/kiểm cả kho và cơ sở sở hữu, giữ phiếu schema cũ. Browser10/10; Samsung ownership9/9 tập trung,165 file khớp/0 crash/ANR; mobile147/21, SQL111, journal8 | Vai trò/cơ sở/nhiều phiên staging, camera/video/lifecycle media, iPhone và release; không phải full app pass |
| Phát hành app | APK debug x86_64 và ARM64 build/cài thành công; Hermes iOS/Android xuất được | Signed iOS development build, iPhone thật, release Android/iOS, phân phối và nghiệm thu vận hành |
| Media trả/đổi/chuyển/nhận | Editor discovery/gallery/slot/picker/xem lớn/review/upload và phiếu ảnh, JPEG writer atomic, target snapshot/exact revision, resolver/tombstone/ledger/Tài khoản. Browser8/8 và hồi quy8/8, journal8, API8/mobile155/22, SQL124, release44/44, types/lint/backend602 đạt. Samsung run2 8/8 tập trung và ledger3/3 riêng,180 file khớp/0 crash/ANR. Media PostgreSQL thật9 nhóm/2 phiên/7 observed waits,285 file khớp | Camera thực/video/HEIC/xoay/Activity kill/cache, full roles/HQ/deployed RLS/nhiều phiên các writer khác/staging/iPhone; migration chưa deploy |

## Media đang triển khai

Editor đã mở cho4 loại target theo exact line/swap/event và shared domain/slot/
quyền web. Discovery/next slot không phụ thuộc trang ảnh hiện tại; review bind
target snapshot và ảnh cũ/mới; phiếu giữ metadata gốc với current flags độc lập.
Browser8/8 và durable journal8 đạt; backend build terminal exit0,602 file khớp/
noenv/network blocked. Samsung run1 failed với lỗi raw JSX native;1 ảnh QA đã lưu,
JPEG2200×1467/80836 bytes/full decode; phiếu và checkpoint giữ nguyên. Đã sửa
render/prevention/navigation; mobile types/lint và browser hồi quy8/8 đạt.
Samsung run2/dataset9200 terminal8/8 tập trung; ledger cuối3/3 riêng.180 file
khớp mỗi lượt,0 crash/ANR.5 phiếu/1 tombstone/0 phiên active, original9100 giữ
nguyên; ảnh native mới2200×1467/81400 bytes full decode. USB restore, checkpoint
cũ nguyên vẹn; không ghép hai lượt thành full app pass.
PostgreSQL media9 nhóm bổ sung actual lock races và pool isolation; minimal
branch fixture không chứng nhận deployed HQ/RLS hay concurrency mọi writer.
[QA PostgreSQL](qa/2026-11-02-mobile-postgres-races.md).
[QA media](qa/2026-11-02-mobile-record-media.md).

## Cập nhật thu hồi nợ xấu và IME

Source ownership điều chuyển sau thu hồi: mobile147 nhóm/21 module, SQL111,
release44/44, root/mobile types/lint, backend QA595 file unchanged/noenv/network
blocked, export iOS/Android/web và browser10/10 đạt. Phiếu cũ vẫn đọc/đối chiếu
được, không suy diễn cơ sở sở hữu lịch sử. Native ownership run1 đã terminal9/9
tập trung trên Samsung,165 file khớp/0 crash/ANR.25 phiếu/2 tombstone được giữ,
0 phiên QA active/ledger rỗng/logout, recovery8098 unchanged và USB restore.
[QA ownership điều chuyển](qa/2026-11-02-mobile-vehicle-transfers.md).

Writer/proof/return.recover recovery/editor thu hồi đã có; browser10/10 và khóa
pending chung trả–đổi–thu hồi. Đã giữ mốc chốt domain, tiền/cọc không đổi. Sau pull
HEAD ac4b189: mobile146/21, SQL108, release44/44, root/mobile types/lint và backend
build QA595 file đạt. Export iOS/Android/web137 file unchanged; native thu hồi
run5 bộ8200 đã terminal10/10 tập trung,165 file khớp/0 crash/ANR. Giữ nguyên4
phiếu bộ8100 và6 phiếu mới/3 tombstone; ledger rỗng/logout/USB restore.
[QA thu hồi](qa/2026-11-02-mobile-bad-debt-recovery.md).

Samsung IME 4/4 riêng trên APK ARM64 mới có native bridge, 0 crash/ANR, 153 file
khớp; tên qa-receiver nhập đúng, IME/autofill và fixture không đổi. Không dùng
native cũ để chứng nhận source readonly mới. [QA IME](qa/2026-11-02-mobile-login-ime.md).

Host reboot09:32 và15:55 làm service cũ dừng; checkpoint8097 (17 phiếu/1 tombstone)
giữ trên disk, không seed lại RAM8093/8094 từ counts. Fixture thu hồi8098 mới có
journal; journal9 nhóm/restart thật đạt. Metro Admin đã chạy cho native;
trạng thái process cần đọc trong bàn giao/runtime hiện tại.

## Mốc trước: editor điều chuyển

Đã có editor/nút ghi xác nhận, khóa pending chung bốn action của cùng xe và
giữ UUID/action qua đổi scope. Browser **10/10**, journal **8 nhóm** có
restart server thật; mobile **138/20**, SQL **89**, release **44/44**,
types/lint/Hermes đạt. Samsung **9/9 tập trung** run4, source 151 file khớp,
0 crash/ANR/SystemUI ANR. App đã logout/ledger QA rỗng; USB trả route cũ.
Fixture 8097 có checkpoint đầy đủ (17 receipt/1 tombstone), giữ nguyên 8093/8094
và 8091 offline. Còn sửa UX nhập username với Telex (alias QA không phải fix
product), media/recovery nợ xấu, staging và iPhone; không phải full app pass.
[QA và artifact](qa/2026-11-02-mobile-vehicle-transfers.md).

## Mốc trước: backend điều chuyển

Đã có API và receipt/recovery đủ chuyển/nhận/từ chối/hủy, giữ nghiệp vụ web
ready chờ nhận/các trạng thái khác chuyển ngay, không đổi hợp đồng/tiền.
SQL **89**, mobile **132 nhóm/20 module**, release **44/44**,
root/mobile types/lint và backend build QA đạt. Sửa shared writer chặn xe
soft-delete. Migration chưa deploy. Chưa có editor/nút ghi, browser/native
điều chuyển; native đổi xe phía dưới là source trước bổ sung mới.
[QA](qa/2026-11-02-mobile-vehicle-transfers.md).

## Mốc trước: editor/native đổi xe

Đổi xe có editor ba bước, preview readonly không UUID, confirmation, writer/
receipt/recovery. Browser **10/10**, hồi quy trả xe cùng web source **9/9**;
Samsung **6/6 tập trung**, 0 crash/ANR/SystemUI ANR, source 140 file khớp;
session restore/logout/ledger rỗng. Mobile **126 nhóm/19 module**, SQL **77**,
release **44/44**, root/mobile types/lint, backend build và Hermes mới đạt.
Bốn migration chưa deploy; iOS và staging nhiều phiên/quyền chưa nghiệm thu.
[QA và giới hạn môi trường](qa/2026-11-02-mobile-swaps.md).

Fixture cũ 8091 đã dừng trước native, không reset/restart trắng; không tuyên bố
bảo toàn RAM cũ. Native result ghi priorFixtureAvailableBeforeRun=false.
Fixture trả xe 8093 unchanged, swap riêng 8094 giữ 2 receipt/tombstone. App đã
logout, USB route trả về 8091 hiện offline. Không có native QA đang chạy.

## Mốc trước: backend đổi xe

Đã có preparation/candidates/writer atomic/immutable proof và return.swap
resolver/tombstone/ledger/Tài khoản/màn phiếu gốc. Đã kiểm chứng/fix legacy-29,
kho cũ ở cơ sở khác, hidden bad_debt và SQL helper HQ recursion/scope.
Full mobile **125 nhóm/19 module**, SQL **76**, release **44/44**,
root/mobile types/lint đạt. Bốn migration mới chưa áp môi trường thật.
Chưa có editor/nút ghi, fixture/browser/native đổi xe; native/icon phía dưới
là bằng chứng mốc trước source mới. [QA](qa/2026-11-02-mobile-swaps.md).

## Mốc trước: writer/editor trả xe

Đã triển khai writer atomic, receipt bất biến, return.record recovery/tombstone/
ledger/Tài khoản và editor bốn bước. Full mobile **120 nhóm/18 module**, SQL
**64 nhóm**, release **44/44**, root/mobile types/lint đạt. Browser cuối **9/9**;
Samsung **6/6 tập trung** trước sửa nhánh mở lại editor và **4/4 hồi quy riêng**
trên source cuối, không ghép thành full pass toàn app. Cả hai native đều 0 crash/
ANR/SystemUI ANR, source khớp. Migration chưa áp production.
[QA và giới hạn](qa/2026-11-02-mobile-return-write.md).

Logo launcher đã sửa và xác minh đủ chữ trên Samsung với APK ARM64 mới.
Hash SecureStore và fixture cũ giữ nguyên sau cài. Đây chỉ nghiệm thu icon.

## Bằng chứng thiết bị thật và giới hạn

Samsung SM-N960N, Android 9/API 28, ARM64; APK debug 96.058.863 byte, SHA
`6cd7ccfe840b96ed174d21a48a3fc386edac1ca6ad1f9afb1ffb264b001e8334` đã đối chiếu
trên máy. Thiết bị dùng API QA loopback qua USB, không dùng tài khoản hay dữ
liệu nghiệp vụ để ghi thử.

- Nền **7/7**: `.backups/mobile-phone-smoke-20261102-reviewed/`.
- Thu theo kỳ có bằng chứng riêng cho chặn vượt phí/thiếu bill, giữ form khi
  trở lại từ bill, ghi một phiếu 10.000 VND, phục hồi đúng phiếu 5.000 VND sau
  mất phản hồi/force-stop và tombstone chặn yêu cầu chưa ghi đến muộn. Các lượt
  có lỗi QA (cuộn/IME/picker không hiện tên file) vẫn giữ trạng thái failed.
- Bill tập trung **4/4**, 0 crash/app ANR/SystemUI ANR, source trước/sau khớp:
  `.backups/mobile-phone-pending-bill-20261102/`. Kiểm tra chặn thu khi bill chưa
  xác nhận, phục hồi đúng bill/kỳ qua Tài khoản sau force-stop, ack/xóa mã,
  khôi phục và đăng xuất phiên. Hai lần chọn ảnh QA trong picker do người dùng
  thực hiện; không tuyên bố picker tự động hoàn toàn.
- JPEG thực nhận từ Samsung: 2200×1467, 160.317 byte, decode toàn bộ pixels đạt.
  `.backups/mobile-phone-bill-codec-20261102.log`. Camera chưa được kiểm chứng.

Sau lượt native, chỉ dẫn bill đang chờ được chuyển sát khu vực bill và nút mở
kết quả đổi tên theo trạng thái. Bản sửa vị trí/nhãn này đã qua typecheck/lint,
browser thu theo kỳ 9/9 và xuất web/Hermes; kết quả native 4/4 ở trên là trước
thay đổi UI nhỏ đó. GET chuẩn bị trả xe được kiểm tra riêng trong
[QA chuẩn bị trả xe](qa/2026-11-02-mobile-return-preparation.md).

## Thứ tự triển khai tiếp

1. Giữ đầy đủ bằng chứng và UUID còn chờ cho đến khi kết quả được xác nhận.
   Bản chỉ dẫn bill đã qua lint/typecheck/browser, bundle đã xuất lại; lượt
   native cuối đã xác nhận ledger rỗng/đăng xuất. Bộ kiểm tra hiện tại là
   120 nhóm API/form, 64 SQL, 44/44 release. Backend source writer build QA
   đạt, browser cuối 9/9, Samsung 6/6 tập trung và 4/4 hồi quy riêng, không
   ghép thành full pass. [Chi tiết và giới hạn](qa/2026-11-02-mobile-return-write.md).
   Native không được tự suy rộng sang toàn app hoặc iOS.
2. Đổi xe dùng replaceContractVehicle theo scope/kho/thuê sở hữu, cùng
   receipt/recovery; nợ xấu dùng recovery riêng. Trả xe tiếp tục kiểm tra
   staging nhiều phiên, ma trận vai trò/cơ sở và các ca native còn thiếu.
3. Điều chuyển/nhận xe và media hồ sơ theo roadmap.
4. PostgreSQL staging nhiều phiên, ma trận vai trò/cơ sở, mạng, chữ lớn/trợ năng,
   ký iOS/iPhone và release build trước khi đánh dấu app hoàn thành.

Migration mobile mới chưa áp production. Không commit/push/deploy trong lượt
này; giữ các thay đổi hiện có, không đọc ra hoặc tự sửa `.env.local`.

Chi tiết: [roadmap](mobile-roadmap.md),
[Android thật](qa/2026-11-01-mobile-physical-android.md),
[thu theo kỳ](qa/2026-11-01-mobile-renewal-collections.md),
[bàn giao mới nhất và điểm đang dở](mobile-handoff-2026-11-02.md).
