# Mục tiêu app Himoto

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

Mục tiêu sản phẩm: hoàn thiện app iOS/Android cho nhân viên và quản lý,
ưu tiên dễ thao tác, dễ đọc, ổn định. Không đánh dấu hoàn thành bằng việc chỉ
xuất bundle JavaScript hoặc kiểm thử trên trình duyệt.

**Phạm vi mới đã chốt: đủ100% chức năng web theo đúng vai trò**, gồm báo cáo, ca trực,
nhân sự/cơ sở/tài khoản, tích hợp và nhập/xuất/Excel. Các module trong
`mobile-web-parity.md` đều phải được bóc action và nghiệm thu; không tự để quản
trị sâu/Excel ra ngoài tiêu chí done. UI riêng cho điện thoại, backend/quyền chung
web. GPS ưu tiên tiếp theo; mục tiêu active.

Giữ đúng luồng thao tác/nghiệp vụ web hiện tại: điều kiện, trình tự, mặc định,
xác nhận, quyền, số tiền/trạng thái và kết quả/phiếu/lịch sử. Bao gồm đọc và các
thao tác ghi mà vai trò được phép; không tự rút thành bản chỉ tra cứu. UI điều
chỉnh cho màn hình/cử chỉ điện thoại, không tự đổi hoặc lược bỏ nghiệp vụ.

Android phải kết nối backend/dữ liệu thật cho người dùng theo dõi khi API/schema/
auth sẵn sàng; hiện chưa chuyển từ runtime QA. Hiển thị đúng môi trường/độ mới,
không fallback fixture âm thầm. Test ghi trùng/mất phản hồi/rollback dùng QA
riêng; không tự tạo/xóa dữ liệu thử production hoặc tự deploy/áp migration.

Ngày02/11: **chưa hoàn thành**.55–60% là ước lượng roadmap vận hành trước khi
chốt full web, **không còn dùng làm phần trăm mục tiêu mới**. Chưa có effort
backlog đủ để công bố tỷ lệ full web đáng tin cậy. Phạm vi đã có bằng chứng và việc
còn thiếu: [trạng thái hiện tại](mobile-status-2026-11-02.md).

**Làm rõ phạm vi:**55–60% áp dụng roadmap mobile ưu tiên vận hành, chưa phải
phần trăm toàn bộ web. [Ma trận23 entrypoint web → app](mobile-web-parity.md)
ghi các module chưa có; phạm vi full web cần backlog/ước lượng riêng. GPS xe
đã xác nhận là yêu cầu bắt buộc và được ưu tiên triển khai tiếp.

[Bàn giao chat mới ngày 02/11/2026](mobile-handoff-2026-11-02.md) có trạng thái
worktree, bằng chứng và việc tiếp theo. Mục tiêu cũ từng `usageLimited`; lượt tiếp
tục đã đặt lại mục tiêu đầy đủ ở trạng thái `active`, chưa hoàn thành.

Mốc đổi xe: editor ba bước/readonly preview/writer atomic/immutable receipt và
return.swap recovery/ledger/Tài khoản đã có; SQL 77 nhóm, mobile 126 nhóm/19
module, release 44/44 và root/mobile types/lint/backend/Hermes đạt. Browser 10/10;
Samsung 6/6 tập trung/source khớp, 0 crash/ANR. Bốn migration mới chưa deploy;
iPhone/staging chưa nghiệm thu. Không ghép các ca native thành full app pass.
Điều chuyển/nhận/từ chối/hủy đã có mốc riêng phía dưới; tiếp tục media và recovery nợ xấu.
[QA đổi xe và giới hạn fixture](qa/2026-11-02-mobile-swaps.md).

## Tiêu chí giao diện

Mobile điều chuyển có editor đủ chuyển/nhận/từ chối/hủy, preview readonly,
writer/immutable receipt và recovery/ledger/Tài khoản; pending khóa chung bốn
action cùng xe. SQL 89, mobile 138 nhóm/20 module, release 44/44 và types/lint/
Hermes đạt; backend 12 SHA vẫn khớp build QA. Browser 10/10 hai actor, fixture
journal restart 8 nhóm. Samsung **9/9 tập trung** cùng lượt, source 151 file khớp,
0 crash/ANR/SystemUI ANR, ledger QA rỗng/logout. Migration chưa deploy;
không ghép thành full app pass. Telex đã sửa bằng native bridge + APK mới,
Samsung IME4/4 riêng. Thu hồi nợ xấu có preparation/preview readonly, sửa domain
giữ nợ chốt; đã thêm writer/proof/ledger/editor thu hồi3 bước, browser10/10;
sau pull ac4b189 mobile146/21, SQL108, release44/44, types/lint/backend QA đạt.
Samsung thu hồi run5 đã đạt10/10 tập trung,165 file khớp/0 crash/ANR. Điều chuyển
đã bổ sung ownership theo upstream, SQL111/browser10/10 và Samsung source mới9/9
tập trung đạt,165 source/QA file unchanged/0 crash/ANR.
Source mới đã qua mobile147/21, release44/44, root/mobile types/lint, backend
build QA595 file unchanged và export ba nền tảng; Samsung ownership run1 bộ7400
đã terminal9/9, ledger rỗng/logout/USB restore. Phiếu schema cũ giữ nguyên,
chưa deploy migration. Tiếp tục media, vai trò/nhiều phiên staging và iPhone.
Tiếp tục media, vai trò/cơ sở/nhiều phiên staging
và signed iPhone. Host reboot làm RAM fixture8093/8094 offline, giữ artifact;
8097 đã restore exact journal, không dựng lại các fixture từ counts.
[QA điều chuyển](qa/2026-11-02-mobile-vehicle-transfers.md).

- Màn hình công việc ưu tiên dữ liệu và thao tác, hạn chế phần trang trí chiếm chỗ.
- Tìm kiếm luôn truy cập được khi cuộn danh sách; bộ lọc có lựa chọn rõ ràng,
  nút Áp dụng, Đặt lại và đóng mà không vô tình đổi điều kiện đang xem.
- Xe lưu kho, hợp đồng quá hạn và bản nháp mở được trực tiếp từ Tổng quan.
- Mọi màn hình có trạng thái tải, rỗng, lỗi và đường thử lại; lỗi tải trang sau
  không được làm mất các hồ sơ đã tải hoặc tự thử lặp liên tục.
- Vùng bấm ít nhất 48 đơn vị, hỗ trợ safe area, chữ lớn, giao diện sáng/tối,
  giảm chuyển động và điều hướng quay lại.
- Thao tác ghi phải giữ dữ liệu khi lưu lỗi, tránh gửi trùng, kiểm tra quyền
  ở backend và xử lý phiên bản/xung đột trước khi báo thành công.

## Thứ tự triển khai

1. Hoàn thiện UX tra cứu, màn hình chi tiết và build Android native trên máy này.
2. Khách hàng, chuẩn bị hợp đồng, chọn xe/kiểm tra lịch, lưu và tiếp tục bản nháp.
3. Hoàn thiện hồ sơ, phát hành/giao xe, gia hạn, nhận tiền và trả xe theo nghiệp vụ
   backend hiện có; thêm thử lại an toàn và kiểm tra ghi trùng.
4. Điều chuyển/nhận xe và các công cụ vận hành cần trên điện thoại; camera,
   giấy tờ/ảnh/video theo luồng nghiệp vụ, không tạo một kho dữ liệu tách rời.
5. Kiểm thử theo vai trò/cơ sở, lỗi mạng, bàn phím, chữ lớn và thiết bị thật;
   phát hành bản thử nghiệm đã ký rồi mới chốt hoàn thành.

Nhập Excel hàng loạt và quản trị chuyên sâu đã nằm trong phạm vi full web mới;
thiết kế luồng phù hợp điện thoại và đúng quyền, không tự bỏ khỏi checklist done.

Media ngày02/11 đã có scoped metadata/image GET và atomic JPEG writer theo4
target trả/đổi/chuyển/nhận, original metadata proof/resolver/tombstone/ledger/
Tài khoản và editor discovery/gallery/slot/picker/xem lớn/rà soát/upload. API8,
mobile155/22, SQL124, release44/44, types/lint/backend602 đạt. Browser8/8 và
journal8 có restart HTTP thật đạt; Samsung run1 failed vì raw JSX native. Đã sửa
render/navigation, types/lint và browser hồi quy8/8 đạt; Samsung media run2/bộ9200
terminal8/8 tập trung, ledger3/3 riêng,180 file khớp mỗi lượt/0 crash/ANR.5 phiếu/
1 tombstone/0 phiên active/USB restore, phiếu cũ giữ nguyên. Tiếp tục camera/video/HEIC/xoay/picker Activity kill/
cache trước staging/signed iPhone/release. Migration chưa deploy.
[Bằng chứng và việc còn thiếu](qa/2026-11-02-mobile-record-media.md).

Media PostgreSQL17.11 thật đã đạt9 nhóm với2 phiên,7 observed lock waits và pool
role/scope/pinned vehicle reset,285 file khớp. Chỉ là minimal branch QA fixture;
deployed HQ/RLS, concurrency các writer khác và staging performance vẫn cần làm.
[Bằng chứng nhiều phiên](qa/2026-11-02-mobile-postgres-races.md).

## Trạng thái xác nhận cập nhật 01/11/2026

- Mốc mới hơn ngày 02/11: trả xe đã có writer atomic/immutable receipt,
  return.record recovery/tombstone/SecureStore/Tài khoản và editor bốn bước.
  Mobile **120 nhóm**, SQL **64 nhóm**, release **44/44**, browser cuối **9/9**
  đạt; Samsung **6/6** tập trung và **4/4** hồi quy nhánh mở lại editor, 0 crash/
  ANR, không ghép thành full pass toàn app. Icon mới đã xác minh đủ chữ trên
  launcher Samsung. [QA trả xe](qa/2026-11-02-mobile-return-write.md).
  Migration chưa deploy; đổi xe/điều chuyển/media/staging/iOS còn tiếp tục.

- Cập nhật 02/11: preview phí đã qua SQL/parity với `completeReturnBatch`;
  thêm preview quyết toán chỉ đọc cho tiền thực thu, hoàn thuê/cọc, thu vượt.
  Bộ mobile **114 nhóm**, SQL **59 nhóm**, release **44/44** đạt. Đã sửa asset
  adaptive icon và xem mask đủ chữ; chưa xác nhận lại launcher thiết bị.
  Writer/receipt/recovery/editor trả xe vẫn chưa triển khai.
  [QA preview](qa/2026-11-02-mobile-return-preview.md).

- Đã bắt đầu GET chuẩn bị trả xe/client typed, phân trang, quyền trả/đổi xe và
  số dư dùng chung domain web. **4 nhóm API + 4 nhóm SQL mới đạt, 47 SQL toàn
  suite**. Chưa có ghi trả xe/quyết toán/editor/đổi xe hoặc native cho nghiệp vụ
  này. [QA chuẩn bị trả xe](qa/2026-11-02-mobile-return-preparation.md).

- Ngày 02/11 đã build/cài ARM64 và kiểm tra trực tiếp Samsung SM-N960N, Android
  9/API 28. **7/7 nhóm nền đạt**, 0 crash/app ANR/SystemUI ANR, gồm bàn phím,
  đăng nhập, tra cứu/Back/lọc và giữ/xóa phiên qua đóng tiến trình. Thu theo kỳ
  trên điện thoại đang kiểm chứng, chưa nghiệm thu nghiệp vụ toàn app hoặc
  release. [Android thật](qa/2026-11-01-mobile-physical-android.md).

- Thu phí cho kỳ gia hạn đã lưu đã nối danh sách, editor thu một phần, bill
  theo quyền tài chính và phục hồi chuyên biệt. Mobile **102 nhóm**, SQL **43
  nhóm**, browser bản cuối **9/9**; backend build và Hermes iOS/Android đạt.
  **Native thu theo kỳ đang kiểm chứng**, chưa dùng 11/11 native gia hạn để
  chứng nhận phần mới. [QA thu theo kỳ](qa/2026-11-01-mobile-renewal-collections.md).
  Migration metadata thu liên kết chưa áp production; staging nhiều phiên,
  thiết bị thật và ký iOS vẫn chưa nghiệm thu.

- Đã build và cài APK Android debug x86_64 có module chọn ngày; 10/10 nhóm native
  đạt ngày 01/11/2026, gồm bàn phím, điều hướng, lọc, tạo/sửa khách hàng, khôi phục
  lần lưu bị mất phản hồi sau khi đóng tiến trình, giữ phiên và đăng xuất.
- Màn soạn hợp đồng đạt 5/5 nhóm Android native trong lượt kiểm tra tập trung:
  chọn ngày/giờ/khách/xe, tạo và sửa bản nháp, hủy rời biểu mẫu bằng Back,
  khôi phục qua đóng tiến trình rồi đăng xuất/đăng nhập, giữ/xóa phiên. Đây là
  `writes-only`, không tính thành một lượt đầy đủ 13 nhóm hay nghiệm thu iPhone.
- Đã thêm rà soát/phát hành, nhận cọc giữ xe và giao xe qua nghiệp vụ dùng chung;
  các khoản thực nhận có kiểm tra phiên bản, mã thao tác, tài khoản và số còn thu.
  API phát hành đạt 8 nhóm; Android native `--contracts` đạt
  10/10 nhóm, mode full, dùng fixture, ở lượt trước. Browser phát hành đã đạt
  7/7 gồm tải lại sau mất phản hồi; kiểm tra mobile lint/typecheck đã đạt.
  Đã thêm API/màn đối chiếu yêu cầu ở Tài khoản, tombstone server chặn request
  đến muộn; bộ mobile ở mốc này đạt 49 nhóm. Bằng chứng native/bundle mới và giới hạn
  nằm trong [QA đối chiếu](qa/2026-11-01-mobile-write-recovery.md).
  Lượt native mới `--contracts` đạt 12/12, full, gồm hai ca đối chiếu sau đóng
  tiến trình. Audit riêng ghi nhận 0 crash mới; crash inspector debug của lượt
  trước vẫn cần điều tra. Hermes iOS/Android cuối đã xuất lại thành công.
  [Bằng chứng và giới hạn](qa/2026-11-01-mobile-contract-actions.md).
- Đã triển khai thu/chi sau phát hành cho 5 nghiệp vụ qua domain dùng chung:
  thu thuê/công nợ, thu cọc, thu thêm, trả cọc và hoàn thuê trả sớm. Quyền tài
  chính được kiểm tra riêng; lịch sử phân trang không làm sai số dư tổng hợp.
  Thêm kiểm tra số dư đã rà soát và clock server cho kỳ thuê sở hữu ngoài
  `xmin`; yêu cầu chưa rõ kết quả khóa biểu mẫu đến khi đối chiếu an toàn.
  API/client tài chính đạt 8 nhóm; bộ mobile đạt 62 nhóm tại mốc tài chính,
  hiện 91 nhóm sau preparation/ảnh/bill/API, form và tính toán thu theo kỳ. SQL PostgreSQL
  tách biệt đạt 30 nhóm (9 tài chính + 2 preparation + 5 bill + 11 ghi gia hạn + 3 thu theo kỳ) với domain/transaction
  thật và migration request. Bộ SQL
  một kết nối chưa chứng minh tranh chấp nhiều phiên hay RLS production. Browser
  tài chính đạt 11/11, hồi quy 35/35 + 12/12 + 10/10; domain 44/44, backend
  build và Hermes iOS/Android đạt. Đã sửa nút đối chiếu cố định, nhãn trợ năng
  sau loading và giữ UUID cùng người dùng khi đổi scope của hồ sơ đã tồn tại.
  Android tài chính đạt 12/12, full, 0 crash/ANR mới trong lượt cuối lúc 15:22:42.
  Đổi scope với SecureStore đạt riêng 3/3, writes-only, lúc 15:28:07; 0 crash/ANR mới.
  xem [QA tài chính](qa/2026-11-01-mobile-finance.md).
- Luồng thêm/sửa khách hàng có kiểm tra phiên bản, chống ghi trùng và khôi phục
  kết quả đã lưu sau lỗi mạng. Các trường liên hệ khách nước ngoài và giấy tờ/
  người thân tùy chọn đã có. Soạn bản nháp hợp đồng đã có giao diện bốn bước,
  chọn khách/xe, kiểm tra lịch chung, phí, kỳ đóng tiền và lưu/mở lại theo phiên bản.
- Kiểm thử trình duyệt đạt 35/35 hồi quy và 12/12 cho soạn hợp đồng; kiểm tra
  API/client đạt 8 nhóm, khách hàng/lưu mã đạt 10 nhóm, bản nháp API/client đạt 9
  nhóm, biểu mẫu đạt 5 nhóm, màu sắc/preset đạt 3 nhóm. Sáu truy vấn bản nháp đã
  qua EXPLAIN trong giao dịch chỉ đọc; đây chưa phải đo hiệu năng thực thi.
  Mobile typecheck/lint và Expo Doctor 20/20 đạt.
- Build production backend và xuất JS/Hermes iOS/Android với màn soạn hợp đồng
  đều đạt. Artifact bundle không được tính thành app iOS đã ký hoặc bản release
  đã nghiệm thu hiệu năng.
- Các kết quả trên dùng dữ liệu QA. Chưa chứng nhận tốc độ mở app bản release,
  thiết bị thật, VoiceOver/TalkBack, chữ lớn native hoặc ký/phân phối iOS.
- Mã lần lưu chưa được xác nhận được giữ riêng theo tài khoản/cơ sở sau khi hết
  phiên/đăng xuất, chỉ chứa UUID và phạm vi truy cập; không lưu token hay biểu mẫu
  trong phần khôi phục này. Có giới hạn tám yêu cầu và chặn gửi mới nếu dữ liệu
  khôi phục trên thiết bị bị hỏng.
- Đã đối chiếu lịch chuẩn: giá thuê, in và phát hành dùng lịch chung hợp đồng.
  Dòng xe lưu thời gian cũ được hiển thị và cần xác nhận đồng bộ/lưu trước phát hành.
- Đối chiếu/hủy mã chưa ghi và thu/chi sau phát hành đã có giao thức/giao diện.
  Hoàn tất kiểm chứng native tài chính và PostgreSQL staging, rồi tiếp tục
  gia hạn/thu cho phiên bản gia hạn, trả/đổi xe, điều chuyển và media.
- API/client cho bản nháp đã có: tùy chọn hợp đồng, mở/lưu bản nháp, chọn kho xe,
  kiểm tra lịch, danh sách nhân sự và tra cứu khách theo quyền. Giao diện soạn đã
  có và đã qua lượt Android native tập trung. [Bằng chứng và giới hạn](qa/2026-11-01-mobile-drafts.md).

Chi tiết artifact và bằng chứng: [báo cáo QA khách hàng](qa/2026-10-31-mobile-customers.md).

## Điều kiện iOS

Người dùng xác nhận đã có iPhone, chưa cấu hình Apple Developer/Expo. Tiếp tục
triển khai mã nguồn và QA độc lập; phần ký/phân phối iOS cần cấu hình tài khoản
của dự án khi tới bước build thử nghiệm. Không yêu cầu mật khẩu hoặc khóa bí mật
qua chat. `xtool` được tham khảo cho Swift/SwiftPM; không thay thế bằng lời hứa
rằng nó build được project React Native trên Windows.

Trạng thái các mốc sẽ được cập nhật bằng kết quả kiểm thử và artifact thực tế,
không tự đánh dấu các mục chưa kiểm chứng.

## Điểm cần giữ khi triển khai tài chính tiếp theo

- Thu/chi sau phát hành phải dùng `recordContractPayment` và quyền hiện có
  `finance.write`; không suy từ quyền phát hành thành quyền sửa tài chính chung.
- Domain thanh toán có các loại thu thuê, cọc bổ sung, hoàn cọc/thuê, phiếu thu
  bổ sung và thu cho phiên bản gia hạn. Cần DTO và xác nhận rõ từng nghiệp vụ,
  giữ riêng định danh két/ngân hàng cá nhân/ngân hàng công ty.
- Nghiệp vụ thu thuê hiện có cho phép một số trường hợp thu vượt và tăng tổng
  hợp đồng. Phải đối chiếu quy tắc dùng chung và hiển thị tác động trước xác
  nhận; không áp nguyên giới hạn nhận tiền lúc phát hành vào mọi khoản thu sau.
- Receipt domain thanh toán và receipt mobile phải cùng transaction; thêm loại
  thao tác vào validation/ledger/đối chiếu trước khi mở nút ghi trên app.
- Gia hạn có thu ngay phải đi qua `renewContractAndCollect`: domain yêu cầu ảnh
  bill đã lưu ở đúng phiên bản gia hạn trước khi hoàn thành khoản thu. Triển khai
  phần ảnh bill cần thiết cùng luồng gia hạn; không bỏ kiểm tra này để mở nút thu.
  Phiên bản mới lấy từ `nextContractRenewalVersion`, gồm cả tham chiếu thông báo/
  phiếu đã nhập. Kiểm thử hai người cùng thao tác và giữ ảnh đúng phiên bản.
- Đã bắt đầu service/DTO chuẩn bị gia hạn: quyền `contracts.renew`, snapshot
  chỉ đọc theo scope, danh sách xe 25/trang, phiên bản kế tiếp từ tham chiếu đã
  lưu và trạng thái bill. GET `/contracts/:id/renewals` phục vụ preparation này.
  `check-mobile-renewals.cjs` đạt 6 nhóm. Đã thêm POST gia hạn, receipt riêng,
  mã bền vững/đối chiếu, metadata bất biến và màn chọn xe/ngày/phí/thu/bill với
  xác nhận theo phiên bản. API thêm 4 nhóm, form 4 nhóm; browser 8/8. SQL kiểm tra
  ghi nguyên tử, mất phản hồi, rollback, tham chiếu bị chỉnh và phiên bản qua
  nhân viên khác. Android gia hạn đạt 6/6 `writes-only` và 11/11 full trên AVD AOSP
  (0 crash/ANR mới, hash app/script trước/sau khớp). Tranh chấp nhiều phiên,
  thiết bị thật và iOS vẫn chưa nghiệm thu.
  [QA gia hạn](qa/2026-11-01-mobile-renewals.md). Migration mới chưa áp production.
- Đã cài `expo-image-picker`, `expo-image-manipulator`, `expo-file-system` đúng
  SDK 58 và cấu hình quyền ảnh/camera để triển khai bill. Màn bill và API upload/
  receipt/đối chiếu đã có. Android bill đạt 11/11 full và 6/6 tập trung; bản sửa
  viewport sau đó đạt riêng 3/3, 0 crash/ANR mới trong các lượt đạt. Prebuild/APK
  media chạy qua Expo/Gradle; bản debug x86_64 chưa phải release/thiết bị thật.
  [QA bill](qa/2026-11-01-mobile-bills.md). Migration bill chưa áp production.
  Helper chuẩn bị ảnh JPEG/giới hạn 2 MiB/hủy/dọn cache có 5 nhóm kiểm thử stub;
  đọc được bill, ảnh HEIC/xoay và camera thực vẫn chưa kiểm chứng.
