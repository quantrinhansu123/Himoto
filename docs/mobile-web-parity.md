# Đối chiếu chức năng web → app Himoto

Điểm tiếp hiện hành: [bàn giao05/11](mobile-handoff-2026-11-05.md).

## Scope mới04/11,22:04+07

Done Android trước theo yêu cầu mới; iOS/iPhone không còn là gate. Giữ parity
web23khu vực/quyền/cơ sở/DB-BE staging/Samsung/bản Android ký/release-vận hành.
Yêu cầu iPhone trong các mốc bên dưới được hoãn riêng. Chưa done Android.
[Quyết định và tiêu chí](mobile-android-done-scope-2026-11-04.md).

## Cập nhật04/11 sau23:05+07 — Android/chung BE-DB web

Picker pin-sạc/Kho xe toàn hệ thống đã nối shared web/API/UI; quick checks,
browser4luồng8ảnh và Samsung riêng560file/0submit/0crash-ANR đạt. Sửa splash
native kẹt; APK debug mới cùng cert/419file data exact khi nâng cấp. Chưa
toàn app/DB thật/release. [QA](qa/2026-11-04-mobile-android-battery-fleet-startup.md).

Tiếp Đổi trạng thái/tạo nháp từ kho và audit23khu vực. Không thêm export Điều
chuyển riêng vì web không có action đó. App dùng chung BE/DB với web, không
tạo DB vận hành riêng. [Kiến trúc](mobile-backend-shared-2026-11-04.md).
Checkpoint hiện gen81/SHA5771b6d7… chỉ refresh metadata phiên QA, nghiệp vụ
nguyên theo audit. Các bảng bên dưới là baseline cũ; iPhone đã bỏ khỏi gate.

## Cập nhật20:30+07 — source mới, chưa acceptance tổng thể

Sơ đồ nhân sự/TLS/kiêm nhiệm/nghỉ việc, hợp đồng cơ sở/summary/phân trang25,
bulk4danh mục/actual domain/quyền/CAS/UUID/recovery và credentials một lần
đã có source/API/UI. Dashboard7chỉ số/kỳ7preset/ngày/cơ sở/CSV dùng actual
web SQL/validator/pure helper đã có. SQL/browser/types/lint/export3nền tảng
đạt theo [QA](qa/2026-11-04-mobile-directory-bulk-dashboard.md). Chưa native/
staging/acceptance tổng thể/iPhone ký/release. Người dùng chỉ có iPhone12
ProMax/iOS18.7.8, đang hướng dẫn free Expo Go và signing theo tài khoản.

## Cập nhật19:45+07 — source mới, chưa acceptance tổng thể

Import nháp hợp đồng admin-only/backup đọc lại-SHA/branch-map/prepared
revision/count/namespace/UUID đã có source/API/UI. Telegram hợp đồng và
điều chuyển dùng actual web writer, pending30, review/ảnh-video/send/resume/
confirmed-absent/retract/receipt/recovery; KTNB xem/chép/xuất dùng formatter
web/bản đã lưu. SQL/browser/types/lint/export3nền tảng đạt theo QA từng cụm.
Chưa native bản mới/staging/signed iPhone/release; clipboard cần binary mới.
Tiếp cơ sở/nhân sự/Excel-batch/action con, không gọi parity100%.
[QA import](qa/2026-11-04-mobile-contract-import.md),
[QA Telegram/KTNB](qa/2026-11-04-mobile-telegram-and-ktnb-export.md).

## Cụm mới sau pull — 04/11,18:40+07

Video ca180s đã có source/API/UI/player/preview/review/UUID/resolve/ack và
actual writer/parser/proxy; SQL5/browser2luồng đạt. Delta giá mua/giá thuê xe,
thumbnail/hợp đồng xe/nguồn khách Tên _Phòng-TLS đã nối source, SQL xe8nhóm
đạt. Chưa native/staging/toàn role-cơ sở/iPhone signed/release.
Goal chat mới active; tiếp import hợp đồng/Telegram/action con, chưa parity100%.
[QA](qa/2026-11-04-mobile-shift-video-and-web-delta.md).

## Chuẩn web sau pull d3ce3c6 — 04/11 lúc18:10

Đã pull7commit/33file và giữ1.065file local. Native/shared đã nhận slot ảnh
xe mới và ngày gia hạn mặc định trống/buộc chọn; SQL/types/lint/export đạt,
chưa native bản sau pull. Còn khớp giá trị/giá thuê xe, thumbnail/hợp đồng
của xe, nguồn khách Tên _Phòng/TLS. Migration slot ảnh xe mới chỉ có source,
chưa áp DB. Video ca180s đang có server/API/hook, chưa UI hoàn chỉnh/SQL video
ca mới; tiếp import hợp đồng/Telegram/action con. Không gọi parity100%.
[Điểm tiếp](mobile-handoff-2026-11-04.md),
[QA sau pull](qa/2026-11-04-mobile-pull-d3ce3c6.md). Tool goal usageLimited,
mục tiêu chưa hoàn tất; các mốc “active” bên dưới là lịch sử.

## Tiếp tục04/11 — full edit/correction/lifecycle đã có source

Mốc13:01: direct MP4 CloudFly và ảnh/video gia hạn/phiếu gia hạn/đổi pin có
source/API/native, actual parser/writer, legacy/durable numbering, giữ hai
next permissive của web, receipt theo transaction ID. SQL8/adapter2/types/
lint/export3/browser2luồng8ảnh đạt. Chưa native ghi/staging; phần video ca180s/
Telegram/import hợp đồng còn tiếp. Không lấy native521file cũ chứng minh
bản mới. [QA cụm](qa/2026-11-04-mobile-direct-video-history.md).

Video lập/giao/trả xe có API/native authenticated range player, chọn/quay/
review/lưu/receipt/recovery, actual writer Cloudinary→Cloudinary/CloudFly,
45MiB/60s. SQL4/types/lint/export3nền tảng/browser2luồng6ảnh đạt. Chưa native
upload/staging/iPhone; direct CloudFly MP4/gia hạn/ca/Telegram chưa khép kín.
Samsung xem/phát hết/phát lại/mở-hủy picker; audit bản cuối12:35:43 exit0,
521file exact/0crash-ANR/26checkpoint/gen80 nguyên/QA7-ledger rỗng/0upload.
Run gốc fail fresh hierarchy, không gọi full harness đạt.
Xem [QA video](qa/2026-11-04-mobile-record-video.md).

Đã thêm full edit5phần theo overwrite/permissive semantics web; correction
cọc/chia phiếu/gia hạn thực thu; lifecycle6action; correction trả xe giữ
lượt sau/phiếu hủy. SQL5/4/4/3nhóm; Samsung4đợt preview/hủy đạt,0submit.
Không đồng nhất source hoặc số màn với100% nghiệp vụ/acceptance.

Tiền/ngày thuê riêng, lịch sử/phiếu, thời hạn sở hữu và xóa nháp máy chủ
đã có source; SQL4+2/types/lint/export đạt, Samsung485file/6màn/audit nối
tiếp exit0 lúc04:28:17,0submit. Same8131 generation77 giữ26checkpoint.
In/PDF/QR và nhập Excel khách đã có source/API/native; SQL5/2/4nhóm,
types/lint/export đạt. APK mới đã install-r lúc11:37:40+07, cùng live cert,
342file data nguyênSHA qua cập nhật. Samsung7ảnh/512source/audit nối tiếp
exit0 lúc11:52:17/0crash-ANR; PDF1trang/share-in mở-hủy/picker mở-hủy/
resetblocker.0import/xóa/tiền, gen80/auth-only/26checkpoint/QA7-ledger rỗng.
Đã có xuất CSV5danh mục/filter/chọn cột và khớp cơ sở Excel theo batch,
stream một upload/CAS/partial/UUID. SQL khớp3/stream3/adapter4; browser
6luồng375sáng/430tối đạt,0pageerror, có lost-response phần2/ack không lặp.
Excel xe sync/replace/reset/backup/normalized có source/API/native, SQL4/
web6/types/lint/export/browser4luồng sáng-tối đạt,0pageerror.
Goal vẫn active; còn import hợp đồng/Telegram/video/batch/action
con và đối chiếu23khu vực, staging/toàn role/scope/mạng/nhiều phiên,
Samsung tổng thể, signed iPhone thật, release/vận hành.

## Cập nhật chuyển chat04/11 — duyệt đã có, full edit còn thiếu

Duyệt sở hữu sau phát hành dùng actual web reader/writer, đúng role/cơ sở/
CAS, người/ngày duyệt và mobile UUID/recovery. SQL4/regression8/types/lint/
export đạt. Samsung447file/0crash-ANR đạt phần xem và hủy xác nhận, chưa gửi
duyệt native/staging. Tiếp theo full edit native chưa triển khai; correction,
bảo lưu/in/Excel/video/action con và nghiệm thu sâu vẫn còn. [Bàn giao](mobile-handoff-2026-11-04.md),
[QA và giới hạn](qa/2026-11-04-mobile-issued-approval.md).

## Cập nhật04/11 —chuẩn web27a87f1

Đã pull11commit/bảo toàn source. Native gia hạn đã thêm giờ/ngày/số kỳ/
đơn giá, ngày thực tế nổi bật dùng cả phiếu thu như web mới; thu+gia hạn
nhiều xe một phiếu/UUID với hẹn/tiền riêng. SQL4/pure3/regression/types/
lint/export đạt; Samsung run2 đạt3nhóm màn hình/441file/0crash-ANR lúc02:27,
QA7/work-ledger rỗng/toàn state64/26checkpoint giữ, chưa native gửi tiền/bill.
Full edit/duyệt/correction
ngày-thu/bảo lưu mới trong web còn phải phủ; chưa full parity/acceptance.
[QA và phạm vi](qa/2026-11-04-mobile-renewal-parity-and-pull.md).

## Cập nhật triển khai03/11 sau ưu tiên demo

Nhập bổ sung đã có ba nhánh source/API/UI: hợp đồng, gia hạn cả xe đã trả,
thu-chi đúng ngày thực tế/xác nhận tiền/quyền/cơ sở; actual web reader/
writer/helper/phiếu/bill/UUID/recovery, phí khác-VAT/thu ngoài/note chung.
SQL4/pure4/regression/types/lint/export ba nền tảng đạt; Samsung run2 đạt
3nhóm màn hình/435file/0crash-ANR lúc23:25, QA7/work-ledger rỗng/toàn state
63/26checkpoint giữ. Chưa chọn ngày/ghi tiền/upload bill native hoặc full
acceptance. [QA](qa/2026-11-03-mobile-backfill-flows.md).

Tích hợp/điều hành/nhập bổ sung có source/API/UI cùng reader/writer và
validation web: GPS account/bật-tắt, Telegram bot/nhóm/chủ đề/hai nhóm sở
hữu; trạng thái/lịch sử/thông báo; quầy5công cụ/tổng scoped/tìm hồ sơ;
composer lịch sử đang thuê/đã trả và durable work. SQL4+3/workspace3/form4/
pending25/types/lint đạt; Samsung run4/5 continuation3nhóm/430file/3UUID-ack
đạt22:54,0crash/ANR/QA7/Tổng quan/work-ledger rỗng, giữ26checkpoint. Export
ba nền tảng exit0. Còn gia hạn/thu-chi lịch sử, schema staging/gửi thật/full
acceptance và demo dataset liên thông. [QA](qa/2026-11-03-mobile-integrations-operations.md).

Quản trị tài khoản có source/API/UI CRUD mềm/role/scope/grants/khóa-mở/
credentials một lần/reveal riêng145/160; tự đổi password cá nhân/version/
session dùng actual domain web. SQL6/staff4/auth-client/pending24/recovery6
đạt; Samsung5write/ack/audit chỉ đọc preservation đạt22:03, không replay,
0crash/ANR, QA7/Tổng quan. Full acceptance còn thiếu. [QA](qa/2026-11-03-mobile-managed-accounts.md).

Loại hợp đồng đã nối danh mục/tạo/đổi tên/ẩn-hiện, immutable billing/term,
snapshot cũ; inline composer tạo/ack/tự chọn bằng shared domain web và
receipt ID chữ. SQL4nhóm/web3/pending23/recovery6, Samsung3happy path/
400file/5request đạt20:48. Cột resource_key staging chưa áp; full acceptance
và mẫu/in hợp đồng chưa có chứng nhận. [QA](qa/2026-11-03-mobile-contract-types.md).

Pin/sạc đã có source/API/UI list/filter/profile/tạo/sửa/prefill hợp đồng
xe, tiền thuê/cọc, gia hạn/thu từng phần/trả/xóa mềm/history/Telegram và
UUID/recovery bằng domain web. SQL5nhóm/pending22, Samsung3happy path/
392file/3request đạt20:18,0crash/ANR. Chưa in/xuất mẫu/lookup/đổi pin xe
điện và full acceptance. [QA](qa/2026-11-03-mobile-battery.md).

Nhắc nợ đã nối lịch sử/soạn/nội dung mẫu/picker đến hạn/bulk/chọn nhiều
trang/rà/gửi tuần tự/receipt/recovery/link hồ sơ bằng actual domain web.
SQL5nhóm, Samsung3happy path/1tin local giả đạt19:18,357file/0crash/ANR.
Chưa toàn quyền/staging/iPhone/bulk nhiều/gửi thật. [QA](qa/2026-11-03-mobile-debt-reminders.md).

Báo cáo thuê xe/doanh số có source/API10nhóm,7kỳ Việt Nam, lọc/phân trang/
chi tiết/tiến độ ngày, CSV toàn kết quả và Excel sổ thu/chi. Dùng reader
và bộ dựng workbook chung web; entitlement đội xe đúng ngoại lệ tài khoản,
không nâng scope workspace. SQL nhúng5nhóm và Samsung3nhóm happy path đạt
18:14, Excel thật hai sheet/8dòng; export web/Android/iOS exit0.
[QA báo cáo và phần chưa nghiệm thu](qa/2026-11-03-mobile-reports.md).

Sổ quỹ/két có source/API danh sách thu chi/phân trang/lọc/tổng theo reader
web; ngân hàng/két có hồ sơ, số dư, lịch sử, tạo/sửa/trạng thái/xóa có điều
kiện bằng domain web chung. CSV toàn bộ theo filter dùng formatter web.
SQL nhúng8nhóm kiểm đọc chéo mobile↔web, CSV và bulk hoàn tác tiền theo
domain web. Bulk phiếu/chọn theo filter/batch500/receipt/recovery đã nối,
settings.write đúng backend web; nghiệm thu sâu còn thiếu.
[QA sổ quỹ](qa/2026-11-03-mobile-cashbook.md).

Nhân sự đã có source/API tạo/sửa/nghỉ việc/tái làm/xóa có điều kiện, cấp tài
khoản một lần, cùng domain/transaction/scope với web; CAS/UUID/recovery và
lọc3trạng thái/chức vụ. Samsung run1 đạt3nhóm happy path trên318file lúc14:54;
SQL nhúng4nhóm có mobile-write→web-read cùng ID/cơ sở. Sơ đồ tổ chức/Excel và
full role/staging/iPhone còn thiếu. [QA nhân sự](qa/2026-11-03-mobile-staff.md).

Xe đã nối tạo/sửa hồ sơ, giấy tờ trên xe đã lưu/OCR có rà soát, timeline và
lịch sử điều chuyển toàn hệ thống; Samsung smoke run5 đạt tập trung trên295file
tại14:08, không phải full upload/OCR/role/staging/iPhone. Cơ sở đã nối CRUD
có điều kiện, shared validation/default/CAS, receipt sau xóa và Account recovery;
SQL nhúng4nhóm đạt. Nhân sự/xe/khách từ hồ sơ cơ sở giữ filter theo cơ sở.
Chi tiết hợp đồng/Excel và nghiệm thu CRUD cơ sở còn thiếu; nhân sự và liên
kết sổ quỹ/két đã có ở cập nhật mới. [QA cơ sở](qa/2026-11-03-mobile-stores.md).

Các dòng trạng thái chỉ đọc cơ sở bên dưới là mốc cũ trước mở rộng này.

Đã thêm source/API cho workspace nháp/đến hạn/quá hạn/thuê sở hữu/VAT,
lọc ngày/cơ sở/kho và số tiền từ reader web; lịch trực tuần/ngày/cơ sở với
tạo/sửa/xóa mềm/revision/UUID/phiếu/đối chiếu; danh bạ nhân sự/cơ sở chỉ đọc.
Tổng quan có lối vào các phần này và các action demo khách/hợp đồng/GPS.
Tham khảo [đợt triển khai](mobile-implementation-waves-2026-11-03.md) và
[kịch bản](mobile-demo-script-2026-11-03.md). Các dòng cũ dưới đây là baseline;
phần mới chưa đạt full role/staging/iPhone. Không suy có workspace là đủ action.

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

**Phạm vi chính thức: đủ100% chức năng web hiện tại theo đúng vai trò.** Bao gồm
cả thao tác đọc/tạo/sửa/xóa, duyệt, cấu hình, nhập/xuất mà web cấp cho vai trò đó;
không giới hạn ở tra cứu hoặc hiển thị. Giữ điều kiện, trình tự nghiệp vụ, mặc
định, xác nhận, số tiền, trạng thái, phiếu/lịch sử và kết quả như web. Bố cục và
điều khiển được thiết kế cho điện thoại, không tự thay đổi hoặc rút gọn nghiệp vụ.

Bao gồm các module báo cáo/quản trị/Excel/tích hợp; chỉ mở chức năng đúng
quyền, giữ backend/domain web và thiết kế UI cho điện thoại. Không tự loại module
khỏi tiêu chí done. Mục tiêu active. GPS đã đạt Samsung4/4 tập trung, các module còn lại vẫn bắt buộc.

03/11: queue ảnh HĐ/trang ký/biển số/OCR và phục hồi từng ảnh đã đạt Samsung
3/3 tập trung trên221 file,0 crash/ANR, browser bản cuối4/4. [Bằng chứng](qa/2026-11-03-mobile-contract-photos.md).
Đây là một phần CF-05/06; copy giấy tờ khách/xóa/video/batch/lifecycle và nghiệm
thu full roles/staging/iPhone vẫn bắt buộc. Không dùng số test làm tỷ lệ parity.

03/11,07:15: tự lấy giấy tờ khách vào HĐ sau ảnh đã có Samsung3/3 tập trung,
229 file khớp/0 crash/ANR, browser4/API5; PostgreSQL thật5 nhóm/2 kết nối/
4 lock observation chỉ DB QA. [QA copy](qa/2026-11-03-mobile-customer-photo-copy.md).
Chưa full role/staging/iPhone; copy không thay thế xóa ảnh/video/hàng đợi sau kill.

03/11,07:44: xóa tệp đã lưu có review/confirm/exact revision/phiếu/Account đã
đạt Samsung3/3 tập trung trên236 file khớp/0 crash/ANR, browser4, SQL5 và
PostgreSQL thật4 nhóm/2 kết nối/4 observed waits chỉ DB QA. [QA xóa](qa/2026-11-03-mobile-media-delete.md).
Chưa chứng nhận full-role/HQ/staging/iPhone; video upload/playback, batch và
khôi phục hàng đợi chưa gửi vẫn là action bắt buộc riêng.

03/11,08:04: xóa khi ảnh readable tải lỗi đã có retry/metadata consent riêng,
loading không tự xác nhận; browser5/5 và Samsung run2 4/4/236 file khớp/0 crash/
ANR đạt trên QA8124. [QA cập nhật](qa/2026-11-03-mobile-media-delete.md).
Hàng đợi bền vững CF-05d chưa triển khai; full role/staging/iPhone còn bắt buộc.

Kiểm kê02/11/2026, feat/mobile-foundation/HEAD ac4b189 và worktree hiện tại.
Mục tiêu active. **Chưa được tuyên bố app đủ100% chức năng web.** Ước lượng
55–60% trước đây áp dụng roadmap mobile ưu tiên vận hành, không phải toàn bộ
web. Chưa có effort-weighted backlog để công bố phần trăm cho phạm vi full web.

Nguồn:23 page entrypoints `src/app/(management)`, components/domain web và
route/API mobile hiện có. Inventory vòng đầu cần tiếp tục tách từng action,
filter/report/import/export; số page không dùng làm phần trăm hoàn thiện.
“Có một phần” chưa có nghĩa nghiệm thu đủ Android/iPhone.

Bổ sung sau pull web lên `d1ea473`: đã đối chiếu source app đồng nghiệp
`c08bfb9` tại `E:/Himoto_MobileApp`. [Phân tích kết hợp hai bản](mobile-integration-assessment-2026-11-02.md)
ghi module có thể tận dụng, khác biệt API/session/schema và các lệch luồng
khách–hợp đồng–ảnh của cả hai bản. Chưa nhập module đồng nghiệp; các trạng
thái app trong bảng dưới không tự tăng vì repo kia đã có screen/route.

Đã bắt đầu [backlog hành động](mobile-action-backlog.md): năm phần soạn hợp đồng,
thêm khách tại chỗ và mặc định hồ sơ đã sửa; browser15/15 và Samsung4/4 tập
trung/185 file khớp/0 crash/ANR. Khách trùng, ảnh/OCR lúc nhập và full action
vẫn thiếu; không nâng hai dòng khách/hợp đồng thành đủ parity. Xem
[QA luồng nhập](qa/2026-11-02-mobile-contract-flow.md).

| Chức năng web | App hiện tại | Phần cần đối chiếu/triển khai tiếp |
| --- | --- | --- |
| Tổng quan `/dashboard` | Có một phần | Có số lượng danh mục, lối Lập hợp đồng/Thêm khách/GPS và workspace theo quyền; KPI/panel báo cáo đầy đủ còn thiếu |
| Đội xe `/vehicles` | Có source/API tạo/sửa/hồ sơ/giấy tờ/OCR/lịch sử | Dùng domain/quyền/revision/audit web, giữ pending/receipt; còn đầy đủ action kho/nhập hồ sơ, ảnh trước metadata, Excel/bulk/reset và nghiệm thu toàn thể |
| Điều chuyển `/vehicles/transfers` | Có4 action và danh sách source/API toàn hệ thống | Có filter ngày/cơ sở đi–đến/thao tác/tìm/phân trang/audit và mở editor hiện tại; còn đủ thông báo/Excel và staging/role/iPhone |
| GPS `/gps` | Source + API/PGlite7 và browser5/5 đã đạt; Samsung run5 đạt4/4 tập trung/210 file khớp/0 crash/ANR; signed iPhone/staging còn thiếu | Đội xe đầy đủ/phân trang/lọc, state/evidence/dừng lâu, map,100 sự kiện, sync lease và admin-only mapping có UUID/receipt/recovery; [QA GPS](qa/2026-11-03-mobile-gps.md) |
| Khách hàng `/customers` | Có một phần | Có tra cứu/tạo/sửa/nhân thân; còn đối chiếu hồ sơ/lịch sử/nhập/xuất/action quản trị |
| Hợp đồng `/contracts` | Có một phần | Có nháp/phát hành/giao/gia hạn/thu–chi/trả–đổi–thu hồi; còn full trường/lịch sử/chỉnh sửa, chứng từ/in/xuất/correction/action web |
| Nháp `/contracts/drafts` | Có một phần | Có soạn/lưu/mở; còn đủ filter/loại hợp đồng/kiểm hồ sơ và action |
| Sắp đến kỳ `/contracts/due` | Đã có workspace source/API | Dùng scope/phép tính kỳ của web, tìm/lọc/ngày/cơ sở/kho/phân trang và mở hồ sơ; dữ liệu kỳ thật/đủ chỉ số/action/staging/role/iPhone chưa nghiệm thu |
| Quá hạn `/contracts/overdue` | Có workspace source/API | Lọc trước đếm/phân trang; có tiền thuê còn thiếu/phí trễ tạm tính từ web; còn công nợ/liên hệ/nhắc nợ/đủ action và nghiệm thu tổng thể |
| Thuê sở hữu `/contracts/ownership` | Có workspace source/API | Dùng phân loại web và trường kỳ/phải đóng, mở action hồ sơ hiện có; toàn vòng đời/bảo lưu/correction/chứng từ/staging/role/iPhone còn thiếu |
| VAT `/contracts/vat` | Có workspace source/API | Lọc theo khoản thu công ty và số đã thu từ web; đủ luồng/chứng từ/Excel/staging/role/iPhone chưa nghiệm thu |
| Pin/sạc `/contracts/battery` | Có list/profile/tạo/sửa/prefill hợp đồng xe, tiền thuê-cọc/tài khoản, gia hạn/thu từng phần/trả/xóa mềm/history/UUID/recovery, trạng thái-gửi Telegram bằng domain web chung; SQL5nhóm/Samsung3happy path đạt20:18 | In/xuất mẫu, picker CCCD/SĐT/NV, đổi pin xe điện/phí/phiếu/batch; native tài chính/Telegram và toàn role/staging/iPhone chưa nghiệm thu. Trả pin không tự hoàn cọc hoặc xóa nợ. [QA](qa/2026-11-03-mobile-battery.md) |
| Loại hợp đồng `/contracts/types` | Có danh mục/tạo/đổi tên/ẩn-hiện, immutable billing-term/snapshot cũ, inline tạo/chọn ở composer; shared web writer/validation, CAS/UUID/typed receipt/recovery; Samsung3happy path đạt20:48 | Schema resource_key staging chưa áp; toàn role/cơ sở/RLS/nhiều phiên/mạng lỗi/iPhone/release chưa nghiệm thu. Mẫu/in chứng từ ở luồng hợp đồng riêng |
| Sổ quỹ `/cashbook` | Có source/API sổ quỹ phân trang/lọc/tổng, ngân hàng/két CRUD có điều kiện/trạng thái/lịch sử/số dư, CSV và bulk phiếu/chọn theo filter | Dùng reader/domain/formatter web chung; batch500/UUID/receipt/recovery; nghiệm thu toàn quyền/staging/iPhone còn thiếu |
| Nhắc nợ `/debt-reminders` | Có lịch sử/picker đến hạn/soạn/bulk/rà/gửi tuần tự/receipt/recovery/link hồ sơ | Actual domain web/UUID/đúng quyền/cơ sở/tiền/phone/cooldown; SQL và Samsung tập trung đã kiểm; toàn role/staging/iPhone/bulk/network/gửi thật chưa nghiệm thu |
| Doanh số nhân viên `/staff-sales` | Có source/API10nhóm báo cáo, filter/kỳ/ngày, phân trang/drilldown/tiến độ ngày, CSV/XLSX chung reader/formatter web | Giữ entitlement đội xe145/160; chưa full role/cơ sở/staging/network/native/iPhone/dataset lớn và link cùng dataset thật |
| Báo cáo ca `/shift-reports` | Có source/API/UI PGD nhập/kiểm kê/tự điền/nháp/chốt, ảnh6nhóm; KTNB đối soát/nháp/xác nhận; Telegram outbox/trạng thái/thử gửi; UUID/receipt/recovery dùng domain/handler chung web | SQL5nhóm/web offline checks và Samsung3happy path/376file/2request đạt19:42. Video/copy-export KTNB, ảnh/KTNB-write/ownership/autofill native, analytics/RLS/staging/toàn role/cơ sở/iPhone/network chưa nghiệm thu |
| Lịch trực `/duty-roster` | Có source/API tạo/sửa/xóa mềm | Tuần/ngày/cơ sở, revision/chặn trùng/UUID/xác nhận/Account recovery dùng domain web; kiểm PGlite và native tập trung riêng, full role/scope/network/staging/iPhone còn thiếu |
| Vận hành `/operations` | Đã nối5công cụ/quầy/tổng scoped/tìm hồ sơ/active-renewable và composer lịch sử ongoing-returned bằng domain web | Native ghi lịch sử máy chủ/full role-cơ sở/staging/iPhone chưa nghiệm thu; [QA](qa/2026-11-03-mobile-integrations-operations.md) |
| Nhân sự `/staff` | Có danh sách/hồ sơ/tạo/sửa/trạng thái/nghỉ việc/tái làm/xóa có điều kiện | Cùng domain/transaction/scope web, cấp login một lần, CAS/UUID/recovery; SQL/mobile→web read và Samsung happy path đã kiểm; còn sơ đồ tổ chức/bulk/Excel và full roles/staging/iPhone |
| Cơ sở `/stores` | Có source/API danh sách/hồ sơ/tạo/sửa/xóa có điều kiện | Dùng validation/default/domain web; CAS/UUID/receipt/recovery, mở nhân sự/xe/khách/sổ quỹ-két theo cơ sở. Còn drilldown hợp đồng/Excel và nghiệm thu CRUD native/staging/toàn quyền |
| Quản lý tài khoản `/accounts` | Có admin list/profile/tạo/sửa/khóa-mở/xóa mềm/role/scope/grants, credentials một lần/che/share/textfile, reveal riêng145/160; cá nhân tự đổi password/version/session web, CAS/UUID/receipt/recovery | Native self-password write/file/share và toàn role/cơ sở/RLS/network/staging/iPhone/release chưa nghiệm thu. [QA](qa/2026-11-03-mobile-managed-accounts.md) |
| Tích hợp `/integrations` | Đã có GPS account/upsert/bật-tắt, bot/nhóm/chủ đề/hai nhóm sở hữu, lịch sử/trạng thái/thông báo và typed receipt/recovery; actual web SQL/admin/secret server | Schema resource_key staging chưa áp; native credential/bot write/gửi thật/full acceptance chưa đạt; [QA](qa/2026-11-03-mobile-integrations-operations.md) |

Các nhóm dùng chung phải được đối chiếu trong từng module: search/filter/paging,
giấy tờ/ảnh/camera/video/OCR, QR/chứng từ/in/xuất, nhập Excel hàng loạt, lịch sử/
correction, thông báo/báo cáo/gửi ra ngoài, lỗi mạng và quyền. Không tự bật gửi
thông báo hoặc ghi production khi phát triển.

## Phạm vi phát hành

- **Ưu tiên vận hành:** hoàn tất nghiệp vụ chốt cho nhân viên/quản lý, gồm GPS
  vừa xác nhận bắt buộc. Module để sau phải ghi rõ; không gọi đây là full web.
- **Đủ chức năng web:** từng dòng và action con được đối chiếu, triển khai và
  nghiệm thu theo vai trò. Báo cáo/quản trị/Excel cũng phải được xử lý hoặc có
  quyết định phạm vi rõ ràng. UI thiết kế riêng cho điện thoại; nghiệp vụ/quyền
  tương đương backend web.

Roadmap cũ từng để Excel hàng loạt/quản trị sâu chờ đánh giá. Người dùng đã chọn
phạm vi **đủ chức năng web theo đúng vai trò**, vì vậy các module này thuộc
backlog bắt buộc. Phương án ưu tiên vận hành ở trên chỉ là lịch sử lựa chọn,
không phải tiêu chí done đã chốt. Cần bóc action/effort và tính lại tiến độ full web.

## Điều kiện done

Checklist chức năng được chốt; từng luồng chạy đúng backend/quyền/cơ sở/dữ liệu
staging sát thực tế. Có kiểm tra ghi trùng/xung đột/mất phản hồi/nhiều phiên và
phiếu gốc; UI nghiệm thu chữ lớn/trợ năng/mạng yếu/lỗi/bộ nhớ. Android/iOS có
native build đã ký, kiểm Samsung/iPhone thật, đủ phát hành/vận hành/khôi phục.
Bundle/browser hoặc vài lượt native tập trung không thay các gate này. Mục tiêu
active đến khi đủ phạm vi đã chốt và mọi điều kiện được kiểm chứng.
