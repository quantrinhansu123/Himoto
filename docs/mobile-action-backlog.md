# Backlog hành động web → native

Điểm tiếp hiện hành: [bàn giao05/11](mobile-handoff-2026-11-05.md).

## Scope mới22:04+07 — hoàn tất Android trước

Người dùng bỏ iOS/iPhone khỏi điều kiện done, để trao đổi khách sau. Không
tiếp luồng iPhone. Các dòng “signed iPhone còn thiếu” dưới là lịch sử, không
còn chặn done Android. Giữ parity web/staging/quyền/Samsung/bản ký Android/
bàn giao. [Tiêu chí hiện hành](mobile-android-done-scope-2026-11-04.md).

## Android/pin-sạc/Kho chung — 04/11 sau23:05+07

Picker pin-sạc và Kho xe toàn hệ thống đã có shared web/API/UI; SQL pin6/
reader kho5/browser4luồng8ảnh/types/lint/export Android-web và Samsung riêng
560file/0submit/0crash-ANR đạt. Sửa native splash; APK debug mới cùng cert/
419file data exact khi nâng cấp. [QA hiện hành](qa/2026-11-04-mobile-android-battery-fleet-startup.md).

Tiếp Đổi trạng thái/tạo nháp từ kho và audit action con23khu vực. Web không
có export Điều chuyển riêng; in pin/sạc đã có, không làm lại theo bảng cũ.
App dùng chung BE/DB với web; URL https://himoto.vercel.app/ hiện GET session
mobile404, chưa deploy/ghi thử. [Kiến trúc](mobile-backend-shared-2026-11-04.md).
Gốc hiện gen81/SHA5771b6d7… chỉ refresh2hạn phiên mirror QA, nghiệp vụ đối
chiếu nguyên; đọc pointer `.backups/mobile-android-current.json`. Các bảng
bên dưới là baseline lịch sử, phải đối chiếu source mới trước khi triển khai.
Chưa QA tổng thể/DB-BE staging/Android release; iPhone không chặn done.

## Cụm nhân sự/cơ sở/bulk/Tổng quan — 04/11,20:30+07

Đã có sơ đồ nhân sự dùng shared web semantics/TLS/kiêm nhiệm/nghỉ việc,
hợp đồng cơ sở/summary/tìm/phân trang25, bulk xóa4danh mục actual web/
review/CAS/quyền/UUID/recovery và chép-tải credentials nhân sự một lần.
Web cơ sở/nhân sự dùng CSV đã có, không có Excel import riêng để tự tạo.
Dashboard7chỉ số/preset/ngày/cơ sở/CSV đã nối actual SQL/pure helper chung.
SQL3/4/3, reports5/duty4/pending30/recovery6/browser4luồng10ảnh/types/lint/
export3nền tảng đạt; chưa native/staging. [QA](qa/2026-11-04-mobile-directory-bulk-dashboard.md).
Tiếp action con23khu vực theo source thật; staging và iPhone ký vẫn chưa có.

## Cụm Telegram/KTNB — 04/11,19:45+07

Telegram hợp đồng/điều chuyển/pending30 đã có source/API/UI đầy đủ action
web hiện tại, UUID/receipt/resolve/ack. KTNB xem–chép–xuất dùng formatter
web/bản đã lưu. SQL Telegram5/route3/ca6/browser Telegram2luồng7ảnh + KTNB
2luồng2ảnh/types/lint/export3nền tảng đạt;0tin thật. Chưa native/staging.
Clipboard thêm module cần binary mới. [QA](qa/2026-11-04-mobile-telegram-and-ktnb-export.md).
Tiếp drilldown hợp đồng cơ sở/sơ đồ nhân sự/Excel-batch/action con23khu vực.

## Cụm import và Telegram — 04/11,19:10+07 trở đi

Import nháp hợp đồng admin-only đã có source/API/UI/mẫu12cột/branch-map,
actual parser-plan-writer và backup đọc lại/SHA256 trước ghi; revision/count/
namespace/duplicate/metadata/UUID/recovery. SQL3/web7/pending28/recovery6/
backup adapter3/browser2luồng6ảnh/types/lint/export đạt; chưa native/staging.
[QA import](qa/2026-11-04-mobile-contract-import.md).

Telegram hợp đồng/điều chuyển và danh sách chưa gửi đã có source/API/UI:
send/resume/retry-confirmed-absent/retract, xem ảnh-video, actual writer/
outbox/UUID/recovery; SQL5/route3nhóm đạt,0tin thật. Giao diện và kiểm cuối
đang triển khai. Tiếp copy/export KTNB, Excel-batch/action con23khu vực;
không dùng source mới để chứng nhận nghiệm thu native/staging/iPhone.

## Tiếp tục sau pull — 04/11,18:40+07

Goal thực tế chat mới active. Video ca180s đã khép source/API/UI/player/
chọn-quay/review/UUID/recovery; SQL actual5+ca cũ5nhóm và browser2luồng/5ảnh
đạt. Delta giá xe/thumbnail/hợp đồng xe/nguồn khách Tên _Phòng-TLS đã có
source/API/UI; SQL xe8nhóm đạt. Chưa native/staging/acceptance tổng thể;
tiếp import hợp đồng/Telegram/action con23khu vực, không làm lại video UI.
[QA và giới hạn](qa/2026-11-04-mobile-shift-video-and-web-delta.md).

## Sau pull d3ce3c6 ngày04/11 — đọc trước mốc cũ

Đã pull7commit mới, bảo toàn1.065file local. Slot vehicle-photo và ngày gia
hạn mặc định trống đã nối source/kiểm nhanh. Video ca180s có server/API/hook
đang dở, **chưa editor/router/player nối ShiftEvidence**; ưu tiên khép cụm
này, kiểm nhanh actual writer rồi tiếp module. Khớp delta web giá trị/giá
thuê xe, thumbnail/hợp đồng của xe, nguồn khách Tên _Phòng/TLS; tiếp import
hợp đồng/Telegram/action con. SQL vehicle-photo chưa áp DB. Xem
[handoff mục3.1](mobile-handoff-2026-11-04.md) và
[QA sau pull](qa/2026-11-04-mobile-pull-d3ce3c6.md). Chưa staging/acceptance.
Goal tool usageLimited, mục tiêu chưa hoàn tất; không lấy “active” ở mốc cũ
làm trạng thái tool hiện tại. Tiếp ưu tiên bàn giao nhanh theo cụm.

## Đang triển khai04/11 — goal active

Mốc13:01: direct MP4 CloudFly (không bắt buộc Cloudinary nếu tương thích),
ảnh/video kỳ gia hạn/phiếu gia hạn/đổi pin đã có API/native/actual web domain,
permissive next versions/CAS/UUID/recovery. SQL8/adapter2/types/lint/export3/
browser2luồng8ảnh đạt. Chưa native submit mới, Samsung/gen80/26checkpoint giữ.
Tiếp video ca180s (writer có sẵn), import hợp đồng, Telegram/action con;
đẩy nhanh theo cụm và gom deep QA sau. [QA](qa/2026-11-04-mobile-direct-video-history.md).

Video lập/giao/trả xe: source/API/native có player/picker/quay/review/phiếu/
CAS/UUID/recovery, actual writer Cloudinary→Cloudinary/CloudFly,45MiB/60s.
SQL4/types/lint/export3nền tảng/browser2luồng6ảnh đạt. Samsung đọc/phát hết/
phát lại/mở-hủy picker; audit cuối12:35:43 exit0/521file/0crash-ANR/26checkpoint/
gen80 nguyên/QA7-ledger rỗng;0upload-submit. Hai run gốc fail fresh hierarchy,
không gọi full harness đạt. Chưa native upload/submit. Direct CloudFly MP4 và video gia hạn/ca/
Telegram còn thiếu. Xem [QA video](qa/2026-11-04-mobile-record-video.md).

Full edit5phần, correction cọc/chia phiếu và gia hạn thực thu, lifecycle6action,
correction quyết toán trả xe đã có API/native/actual domain/quyền/UUID/recovery.
SQL tương ứng5/4/4/3nhóm đạt. Samsung453/459/465/471file đạt preview/hủy,
0submit/0crash-ANR, QA7/ledger rỗng,26checkpoint giữ. Không gọi là nghiệm thu ghi tiền.

Tiền/ngày thuê riêng, lịch sử/phiếu và thời hạn/mức đóng sở hữu:
SQL4nhóm đạt; xóa nháp máy chủ SQL2nhóm đạt. Samsung485file/6màn,
audit nối tiếp exit0 lúc04:28:17,0submit, export đạt; same8131 generation77.
In/PDF/QR và nhập Excel khách đã có source/API/native; SQL in5/QR2/import4,
types/lint/export3nền tảng đạt. Xuất CSV5danh mục/filter/chọn cột và khớp
cơ sở Excel theo batch/stream/partial/CAS/UUID đã có source/API/native.
SQL khớp3/stream3/adapter xuất4; browser6luồng375sáng/430tối đạt,0pageerror,
có mất response phần2/đối chiếu/ack không gửi lặp. Excel xe sync/replace/
reset/backupJSON/normalized đã có source/API/native, SQL4/web6/types/lint/
export và browser4luồng sáng-tối/0pageerror đạt. Samsung nối lại, install-r
cùng live cert lúc11:37:40,342file data nguyênSHA; Samsung7ảnh/512file
source exact/audit nối tiếp exit0 lúc11:52:17/0crash-ANR. PDF1trang/
share-in mở-hủy/picker mở-hủy/resetblocker;0import/xóa/tiền. Gen80/auth
expiry-only/26checkpoint giữ/QA7-ledger rỗng. Chưa native gửi file/ghi xe.
Tiếp import hợp đồng,
Telegram/video,
batch/action con và phần thiếu23khu vực. [Bàn giao](mobile-handoff-2026-11-04.md).

## Chốt chuyển chat04/11 lúc02:45

Duyệt sở hữu sau phát hành đã có source/API/UI/role/scope/CAS/UUID/recovery,
actual writer web; SQL4/regression8/types/lint/export đạt. Samsung447file/
0crash-ANR, xem quyền và hủy xác nhận, **chưa native submit**. QA7/Tổng quan/
work-ledger rỗng; generation71. [Bàn giao mới](mobile-handoff-2026-11-04.md),
[QA](qa/2026-11-04-mobile-issued-approval.md). **Việc tiếp theo: full edit
native**, rồi correction/bảo lưu/in/Excel/video/action con. Không coi pull
hoặc duyệt là đã phủ full edit/100% chức năng.

## Cập nhật04/11 sau pull27a87f1

Đã giữ846file nguồn qua pull11commit (840exact/6merge), tiếp tục native
gia hạn giờ/ngày/số kỳ/đơn giá; ngày gia hạn và ngày phiếu đã thu thống nhất
theo web mới, recorded_at riêng. Thu+gia hạn nhiều xe có lựa chọn50/phiếu,
tiền và hẹn trả từng xe, actual domain web/UUID/CAS/recovery. SQL4/pure3/
regression/types/lint/export đạt; Samsung run2 đạt3nhóm màn hình/441file/
0crash-ANR lúc02:27, QA7/work-ledger rỗng/toàn state64/26checkpoint giữ.
Chưa native gửi phiếu/bill/tiền. [QA](qa/2026-11-04-mobile-renewal-parity-and-pull.md).

Backlog web mới vừa pull: full sửa hợp đồng và duyệt thuê sở hữu, actor
duyệt batch, correction ngày/tiền thực thu, bảo lưu/mở lại/đổi hạn trả.
Phải đối chiếu native từng action, không coi việc pull là đã phủ đủ app.

## Đợt triển khai sau tiếp quản03/11

Nhập bổ sung ba nhánh: source/API/UI hợp đồng/gia hạn xe đã trả/thu-chi
lịch sử; actual web reader/writer/helper, occurred_at/ngày thu riêng,
phiếu/bill/UUID/CAS/recovery; phí khác/VAT/thu ngoài/note chung web/native,
giữ hiện trạng kho/completed_at và trạng thái nợ đúng web. SQL4/backfill4/
regression/types/lint/export đạt; Samsung run2 đạt3nhóm màn hình/435file/
0crash-ANR lúc23:25, QA7/work-ledger rỗng/toàn state63 và26checkpoint giữ.
Không chọn ngày/ghi tiền/upload bill native trong bài này, chưa financial-
write acceptance. [QA](qa/2026-11-03-mobile-backfill-flows.md).

Tích hợp/điều hành/nhập lịch sử: source/API/UI đã nối actual domain web,
GPS account/bật-tắt, bot/nhóm/chủ đề/hai nhóm sở hữu, trạng thái/lịch sử/
thông báo;5công cụ quầy và tổng/tìm hồ sơ; composer đang thuê/đã trả với
validation/durable work theo mode. SQL4+3/workspace3/form4/pending25,
types/lint đạt. Samsung run4/5 continuation3nhóm/430file/3UUID-ack đạt22:54,
0crash/ANR/QA7/Tổng quan/work-ledger rỗng, giữ businessfield/26checkpoint.
Export ba nền tảng exit0; chưa full acceptance/gửi thật. Còn nhánh gia hạn/
thu-chi lịch sử và schema resource_key staging duyệt riêng. [QA](qa/2026-11-03-mobile-integrations-operations.md).

Tài khoản: có quản trị list/profile/tạo/sửa/role/scope/grants/khóa-mở/xóa
mềm, credentials cấp một lần/che/share/textfile, reveal chỉ145/160 và tự
đổi password cá nhân theo domain/session web, UUID/CAS/receipt/recovery.
SQL6/staff4/auth-client/pending24/recovery6 đạt. Samsung5write/ack thực
hiện, audit chỉ đọc preservation2expiry QA đạt22:03; app source giữ nguyên,
0crash/ANR, QA7/Tổng quan. Native self-change/file/share và full staging/
RLS/role/network/iPhone chưa nghiệm thu. [QA](qa/2026-11-03-mobile-managed-accounts.md).

Loại hợp đồng: có source/API/native danh mục/tạo/đổi tên/ẩn-hiện, giữ
billing/term và snapshot hợp đồng cũ; tạo tại composer/ack/tự chọn đúng.
Receipt ID chữ, CAS/UUID/recovery; SQL4nhóm/web3/pending23/recovery6,
Samsung3happy path/400file/5request đạt20:48,0crash/ANR. Cần schema
resource_key được duyệt/áp riêng; hiện chưa áp/deploy. Không có DELETE như
web, mẫu/in không thuộc danh mục đã hoàn tất. [QA](qa/2026-11-03-mobile-contract-types.md).

Pin/sạc: có source/API/native list/profile/lập/sửa/prefill/thu tiền thuê-
cọc/gia hạn/thu từng phần/trả/xóa mềm/history/receipt/recovery và Telegram
theo actual domain web. SQL5nhóm, pending22, Samsung3happy path/392file/
3request đạt20:18;0crash/ANR. Còn in/xuất mẫu, picker CCCD/SĐT/NV, đổi pin
xe điện/phí/phiếu/batch và full acceptance. Trả pin không tự hoàn cọc/xóa
nợ. [QA](qa/2026-11-03-mobile-battery.md).

Báo cáo ca: có source/API/UI PGD/KTNB, nhập/kiểm kê/tự điền DB/chốt,6nhóm
ảnh/quyền-stage/receipt, đối soát fingerprint/revision, Telegram outbox/
trạng thái/thử gửi. SQL5nhóm/web offline checks và Samsung3happy path đạt
19:42 trên376file,2request/0crash/ANR. Còn video/copy-export KTNB và nghiệm
thu sâu. [QA](qa/2026-11-03-mobile-shift-reports.md).

Nhắc nợ: đã nối lịch sử/cơ sở/phân trang, picker hợp đồng đến hạn/soạn/
nội dung mẫu, chọn nhiều trang/rà/gửi tuần tự, kết quả/Account recovery và
link hồ sơ, actual domain web + UUID trước I/O. SQL5nhóm/pending20/recovery6,
Samsung3happy path/1tin local giả/357file đạt19:18;0tin thật. Chưa toàn role/
staging/iPhone/bulk nhiều/mạng lỗi. [QA nhắc nợ](qa/2026-11-03-mobile-debt-reminders.md).

Báo cáo thuê xe/doanh số: đã nối10nhóm, bộ lọc/kỳ Việt Nam/phân trang/
drilldown/tiến độ ngày bằng reader web chung; CSV toàn kết quả và Excel
sổ thu/chi dùng bộ dựng workbook chung web. Giữ entitlement riêng đội xe,
không mở rộng quyền/scope. SQL nhúng5nhóm, Samsung3nhóm happy path đạt
18:14, Excel lưu đúng hai sheet/8dòng; export web/Android/iOS exit0. Chưa full
role/staging/iPhone. [QA báo cáo](qa/2026-11-03-mobile-reports.md).

Sổ quỹ/két: đã nối reader phân trang/tổng web, lọc ngày/người/cơ sở/tìm kiếm;
tài khoản ngân hàng/két có danh sách/hồ sơ/lịch sử/tạo/sửa/ngừng dùng/kích
hoạt/xóa có điều kiện, CAS/UUID/receipt/recovery bằng domain chung web. SQL
nhúng8nhóm có đọc chéo mobile↔web cùng ID, CSV và actual web bulk domain.
CSV toàn bộ theo filter và bulk phiếu/chọn theo filter đã nối; batch500/
UUID/receipt/recovery, quyền xóa settings.write đúng backend web;
chưa full role/staging/iPhone. [QA sổ quỹ](qa/2026-11-03-mobile-cashbook.md).

Nhân sự: đã nối source/API tạo/sửa, trạng thái/nghỉ việc/tái làm, xóa có điều
kiện; hồ sơ và login dùng chung transaction/domain web. Có cấp tài khoản một
lần, CAS/UUID/receipt/recovery, lọc3trạng thái/chức vụ. Xóa hồ sơ không thay
tài khoản như web; nghỉ việc mới khóa login. [QA/phần còn thiếu](qa/2026-11-03-mobile-staff.md).
Sơ đồ tổ chức/Excel và full role/native/staging chưa nghiệm thu.

Cơ sở: đã nối source/API tạo/sửa/xóa có điều kiện bằng domain web; biểu mẫu
native dùng chung validation/default, người phụ trách, timestamp CAS và UUID/
receipt/Account recovery. Xóa quét mọi tham chiếu và giữ phiếu sau xóa thật.
Hồ sơ có liên kết nhân sự/xe/khách/sổ quỹ-két theo cơ sở; chi tiết hợp đồng và
Excel còn thiếu. [QA cơ sở](qa/2026-11-03-mobile-stores.md). Nhân sự đã nối
CRUD/đồng bộ tài khoản ở cập nhật trên; sơ đồ tổ chức/bulk/Excel còn thiếu.

Nhóm xe tiếp theo: đã nối source/API tạo/sửa hồ sơ xe bằng domain web,
giấy tờ trên xe đã lưu và OCR đăng ký có rà soát, timeline/audit và danh sách
điều chuyển toàn hệ thống. UUID/receipt/recovery và khóa pending chung với
thao tác kho. [QA/phần còn thiếu](qa/2026-11-03-mobile-vehicles.md); native/
staging/full role chưa mặc định đạt. Xóa lẻ không được tự tạo khi web không có;
Excel/bulk/reset và action đánh dấu thuê/nhập hồ sơ từ kho còn phải triển khai.

[Kế hoạch theo23khu vực](mobile-implementation-waves-2026-11-03.md) và
[kịch bản demo QA](mobile-demo-script-2026-11-03.md).

| ID | Đã nối source/API | Còn thiếu / chưa nghiệm thu |
| --- | --- | --- |
| INT-01 | GPS account/upsert/bật-tắt; Telegram bot/nhóm/chủ đề/hai nhóm sở hữu; trạng thái/lịch sử/thông báo, actual web SQL/cipher/HMAC/admin/CAS/typed receipt/recovery | Schema resource_key staging chưa áp; native credential/bot write, gửi thật và full role/network/staging/iPhone chưa nghiệm thu |
| OPS-01 | Năm lối vào quầy/tổng scoped/tìm hồ sơ; nhập bổ sung ba nhánh, actual web writer/phiếu/bill/UUID; gia hạn giờ/ngày/số kỳ/đơn giá và ngày thực tế theo web27a87f1; thu+gia hạn50xe/phiếu/hẹn-tiền riêng/khóa UUID | Native gửi phiếu/bill/tiền/50xe/mất mạng, full edit/duyệt/correction/bảo lưu web mới, toàn role/cơ sở/staging/network/iPhone chưa nghiệm thu |
| ACC-01 | Admin account CRUD mềm/role/scope/grants/khóa-mở, credentials một lần/che/share/textfile, riêng145/160 reveal/audit; cá nhân tự đổi password, version/session web chung, CAS/UUID/receipt/recovery | Native self-password write/timeout/background/share/file, full admin/role/cơ sở/RLS/network/race/staging/iPhone/release chưa nghiệm thu |
| CT-01 | Danh mục loại/tạo/đổi tên/ẩn-hiện, immutable billing-term/snapshot cũ, inline composer tạo/chọn; shared web writer/validation và typed text-ID receipt/CAS/UUID/Account recovery | Schema resource_key staging chưa áp; full role/cơ sở/RLS/mạng lỗi/nhiều phiên/iPhone/release chưa nghiệm thu. Mẫu/in hợp đồng ở backlog riêng |
| BAT-01 | Hợp đồng pin/sạc CRUD mềm/prefill, tiền thuê-cọc/tài khoản, gia hạn ghi nợ hoặc thu ngay/thu một phần/trả/history/Telegram/UUID/CAS/receipt/recovery bằng domain web | In/xuất mẫu, picker CCCD/SĐT/NV, đổi pin xe điện/phí/phiếu/batch; native tạo/sửa/thu tài chính/Telegram và full role/staging/iPhone chưa nghiệm thu |
| SHIFT-01 | Báo cáo ca PGD nháp/chốt/kiểm kê/tự điền/ownership, ảnh6nhóm/stage/CAS/receipt; KTNB app-sổ-thực tế/fingerprint/nháp/xác nhận; outbox Telegram/trạng thái/thử gửi, common web domain/handler | Video native/copy-export KTNB, ảnh/KTNB-write/autofill/ownership/Telegram native, actual analytics/RLS/toàn role-cơ sở/network/staging/iPhone chưa nghiệm thu |
| REM-01 | Lịch sử/picker remindable/soạn Zalo/chọn nhiều trang/rà bulk/gửi tuần tự theo domain web, UUID/receipt/recovery, cùng kết quả/cooldown/quyền/điện thoại/nợ đến hạn | Toàn role/cơ sở/staging/iPhone, bulk nhiều/8pending/network/race/lifecycle và gửi thật chưa nghiệm thu |
| REP-01 | Báo cáo thực thu/ước tính/công nợ, sổ thu chi, xe/lượt thuê, cơ sở/ngày, đội xe chủ quản, hợp đồng/NVKD/cơ sở/khách mới/phân công; CSV/XLSX/filter/drilldown/tiến độ ngày dùng reader và workbook web | Toàn tổ hợp lọc/role/scope/staging/network/native/iPhone, link cùng dataset thật và dataset lớn chưa nghiệm thu |
| CW-01 | Nháp/Đến hạn/Quá hạn/Thuê sở hữu/VAT dùng scope/reader web; tìm kiếm, cơ sở, ngày/kho, phân trang; projection số tiền/kỳ | Đủ action con, thống kê/filter nâng cao/Excel, toàn vai trò/cơ sở/staging/iPhone |
| CW-02 | Sửa reader dùng chung: lọc scope quá hạn trước đếm/phân trang, loại hồ sơ chưa đến hạn, giữ nợ xấu | SQL regression đã kiểm tập trung; nhiều phiên/RLS/staging chưa kiểm |
| HR-01 | Lịch trực tuần/ngày/cơ sở; tạo/sửa/xóa mềm bằng domain web; revision/chặn trùng/UUID/receipt/Account recovery | Native smoke riêng; full role/scope/network/race/lifecycle/iPhone chưa kiểm |
| DIR-01 | Nhân sự tạo/sửa/nghỉ việc/tái làm/xóa có điều kiện + đồng bộ login; cơ sở có CRUD có điều kiện; CAS/UUID/recovery và liên kết nhân sự/xe/khách/sổ quỹ-két theo cơ sở | Sơ đồ tổ chức/bulk/Excel, drilldown hợp đồng cơ sở; chưa full role/staging/iPhone, CRUD cơ sở chưa native acceptance |
| FIN-02 | Sổ quỹ phân trang/lọc/tổng, tài khoản/két CRUD có điều kiện/trạng thái/lịch sử/số dư, CAS/UUID/recovery; CSV và bulk phiếu/chọn theo filter theo domain web, batch500/receipt/recovery | Full role/scope/network/staging/iPhone; iOS share file thật, native >500/mất mạng giữa batch chưa nghiệm thu |
| DEMO-01 | Tổng quan có Lập hợp đồng/Thêm khách/GPS và lối vào module đang có; fixture demo tách biệt có checkpoint | Không coi đây là đủ KPI/panel Dashboard, hoặc đủ luồng mọi loại hợp đồng |

Kiểm tra nhanh đợt này ghi riêng, không tăng phần trăm hoặc gọi done toàn app.
Nguồn đồng nghiệp được dùng chọn lọc cho mô hình tuần và mặc định ca08–17giờ;
giữ session/DTO/runtime/backend hiện tại, không nhập dependency hay backend cũ.

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


Phạm vi: 100% chức năng web theo vai trò; chuẩn source web `d1ea473` và worktree.
Không lấy số màn hình, route hoặc test làm tỷ lệ hoàn thành. Đây là backlog
đang bóc chi tiết; các nhóm dưới không phải một bản kê action hoàn chỉnh đã
nghiệm thu. Backend/domain/quyền web vẫn quyết định hành vi.

## Quy tắc theo dõi

Mỗi action cần: nguồn web/domain, vai trò và quyền thực tế, cơ sở/phạm vi dữ liệu,
điều kiện/thứ tự/mặc định, input, thay đổi tiền/kho/trạng thái, phiếu/audit,
source tái dùng, effort/người phụ trách, test quyền và bằng chứng Android/iPhone.
Đánh dấu riêng `source`, `API`, `QA`, `Android`, `iPhone`; không dùng một dấu
done chung khi mới có UI. Effort chưa bóc ghi chưa ước lượng.

## Lát triển khai hiện tại: nhập hợp đồng/khách

| ID | Action / kết quả | Quyền chính, vẫn kiểm domain/cơ sở | Source và trạng thái |
| --- | --- | --- | --- |
| CF-01 | Năm phần Hợp đồng & pháp lý → Khách hàng → Phương tiện → Chi phí → Ký kết & ghi chú; lỗi mở đúng phần | `contracts.read` + `contracts.draft` | Đã sửa source; browser đạt. Android tập trung4/4 gồm luồng này; iPhone chưa kiểm. Chưa xác nhận mọi field/default đã parity |
| CF-02 | Tìm/chọn khách tại cơ sở và exact liên cơ sở, giữ snapshot/người lái | thêm `customers.read` | Có picker/API; giữ bộ hồi quy, chưa nghiệm thu full roles/native |
| CF-03 | Tạo khách ngay trong hợp đồng; quay lại dùng đúng ID, giữ xe/ngày/giá; hủy có xác nhận | thêm `customers.read` + `customers.write` | Source mới dùng chung CustomerForm và recovery. Browser15/15; Samsung4/4 tập trung có lost response/failed reload/cancel và save đúng ID, iPhone chưa kiểm |
| CF-03a | Khách thường mặc định active; hồ sơ thiếu chỉ khi chọn rõ mode tạm | `customers.write` | Đã sửa mặc định; bộ client/API và browser đạt. Không tự đổi validation domain |
| CF-04 | Trùng khách: mở hồ sơ theo quyền hoặc dùng khách đã có, giữ ảnh | quyền đọc/sửa hồ sơ và scope thực tế | Đã có API exact/bounded/scoped reload và UI xem/dùng/sửa tại chỗ, resolver hủy UUID trước chuyển hồ sơ. API/client6, PGlite6, browser source cuối7/7 và hồi quy15/35 đạt; Samsung3/3 tập trung,189 file khớp/0 crash/ANR trên fixture riêng8103. Giữ ảnh đã nối CF-05 (browser8/8), Samsung3/3 tập trung source199 file khớp/0 crash/ANR; iPhone chưa kiểm |
| CF-05 | Giấy tờ/OCR trước thông tin khách theo web, CCCD/hộ chiếu/GPLX có rà soát; upload lỗi giữ form/ảnh và đúng hồ sơ | theo từng target/slot/domain web | Đang có giấy tờ khách/batch OCR/rà soát/giữ ảnh khi trùng và lost response. API/client7/PGlite7, browser8/7/15/35 và media8 đạt; Samsung run4 3/3 tập trung/199 file khớp/0 crash/ANR, giữ ảnh khi trùng/lost/drop/late409 và codec thật đã kiểm. Ảnh HĐ/biển số/copy/xóa/lifecycle/iPhone chưa đủ |
| CF-05a | Ảnh lập/giao HĐ, trang ký/bill riêng, queue trước lưu và đối chiếu sau lưu | authenticated + RLS record-photo web | Source/API6/journal3; thứ tự nhóm web browser4/4, Samsung3/3 trên237 file khớp/0 crash/ANR, fixture8125:1nháp/4ảnh/1tombstone; [QA thứ tự](qa/2026-11-03-mobile-contract-photo-order.md), ledger rỗng/logout0. Copy/xóa/video/lifecycle/iPhone vẫn thiếu; [QA ảnh HĐ](qa/2026-11-03-mobile-contract-photos.md) |
| CF-06a | OCR biển số → unique kho, đúng dòng/xe, ảnh riêng và giữ sửa tay | OCR customers.write như web; lookup contracts.read/draft + fleet | Source/API5/browser bản cuối4 đã có, Samsung run2 đạt3/3 tập trung/221 file khớp/0 crash/ANR; không tự chọn khi trùng và không gọi provider thật |
| CF-05b | Tự sao chép giấy tờ khách vào HĐ, chỉ điền ô thiếu | authenticated + RLS như web `copyContractCustomerPhotos` | Đã có source + API/PGlite5/browser4/journal3; core27/web release44/types/lint/export đạt. Samsung run1 đạt3/3 tập trung/229 file khớp/0 crash/ANR trên8122, có kill/Account recovery; PostgreSQL thật5 nhóm/2 kết nối/4 lock observation đạt. Giữ metadata → ảnh → copy bằng domain web; không ghi đè ảnh HĐ, UUID/phiếu/no-op/lost/tombstone. Chưa iPhone/staging/full roles; [QA copy](qa/2026-11-03-mobile-customer-photo-copy.md) |
| CF-05c | Xóa ảnh đã lưu và rà soát đúng hồ sơ | quyền record-photo thực tế/RLS, domain web | Source/API-PGlite5/journal3, PostgreSQL thật4 nhóm/2 kết nối/4 lock observation, browser cuối4/4 đã đạt; Samsung run1 đạt3/3 tập trung/236 file khớp/0 crash/ANR trên8123, có kill/Account/video metadata/ledger rỗng. Có review/confirm/phiếu/tombstone/replay giữ ảnh thay thế, chung intent upload/copy/delete. Runtime ảnh readable nhưng tải lỗi đã có retry/metadata consent/generation guard: browser5/5 và Samsung run2 4/4 tập trung/236 file khớp/0 crash/ANR trên8124; chưa full roles/staging/iPhone; [QA xóa](qa/2026-11-03-mobile-media-delete.md) |
| CF-05d | Khôi phục hàng đợi ảnh chưa gửi khi kill/đổi phiên | scope origin/actor/cơ sở; dữ liệu riêng trong app | Đang triển khai: schema/journal/owned files/intent helper; core7/mock4/disk3, Samsung adapter4/4 trên246 file,0crash/ANR ([QA](qa/2026-11-03-mobile-contract-work-storage.md)). Source đã nối form/ảnh/metadata/copy/Account/flush/ledger guard, core32/types/lint0; Samsung form/ảnh/Account run2 đạt4/4 trên253 file/0crash/ANR, fixture8127,1nháp/4ảnh/1tombstone/session0/ledger+work rỗng ([QA form](qa/2026-11-03-mobile-draft-work-form.md)). Leave/picker/AppState và retry association đã sửa; core33/types/lint0, Samsung transitions run2 đạt4/4 và form/API regression run3 đạt4/4 riêng, cùng258file/0crash/ANR ([QA transitions](qa/2026-11-03-mobile-draft-work-transitions.md)). Copy qua durable work Samsung run1 đạt4/4 riêng trên259file/0crash/ANR: có ảnh/lost/kill/Account original work và không ảnh/drop/kill/cancel/late409/resume copy, cuối2nháp/1ảnh/2copy/8giấy tờ/1tombstone/session0/work+ledger rỗng,24checkpoint cũ giữ SHA ([QA copy work](qa/2026-11-03-mobile-draft-work-copy.md)). Actual disk-full/partial manifest repair/cleanup, actor/scope/role/full lifecycle và iPhone còn thiếu. [Thiết kế](mobile-durable-draft-work-plan-2026-11-03.md); thứ tự nhóm web đã đạt riêng, chưa done CF-05d |
| CF-06 | Nhiều xe thật, kiểm lịch, người lái/thiết bị, ảnh biển số riêng | thêm fleet entitlement web | Picker/lịch có một phần; ảnh/OCR và full trường còn thiếu |
| CF-07 | Lưu/mở/sửa/xóa nháp theo revision/quyền; cho thiếu dữ liệu đúng web | `contracts.draft` và điều kiện domain | Có source lưu/mở/sửa/xóa mềm/recovery; xóa dùng actual writer/CAS/chặn phiếu hoặc mọi lịch sử xe, receipt sau xóa vẫn scoped. SQL2nhóm đạt; native preview đang chạy, chưa submit/ma trận sâu/full filter |
| CF-08 | Đặt cọc/phát hành/duyệt/giao xe; thu thực nhận, chia khoản, phiếu | quyền từng action, duyệt ownership theo role | Có implementation và QA từng phạm vi; phải đối chiếu đủ mọi nhánh web |
| CF-09 | Mất phản hồi/xung đột/hết phiên/đóng app; giữ key, đối chiếu trước gửi mới | quyền của action gốc | Nền recovery có; mở rộng và nghiệm thu từng action mới, không reset ledger |
| GPS-01 | Danh sách/chi tiết/map, trạng thái/heartbeat/vị trí/độ mới, lịch sử và dừng lâu | fleet entitlement + scope web | Đã có mobile module, domain GPS chung/web SQL chung, 7 nhóm API/PGlite và browser run4 5/5 trên bundle cuối; Samsung run5 đạt4/4 tập trung,210 file khớp/0 crash/ANR; iPhone/staging chưa kiểm |
| GPS-02 | Refresh/sync/mapping đúng quyền và lease | entitlement web thực tế; mapping admin | Đã nối sync lease/history server và admin-only mapping, snapshot review/UUID/receipt/tombstone/Account recovery. API/PGlite và browser đạt; Samsung run5 đạt4/4 tập trung gồm process-kill/Account recovery; chưa gọi provider thật hoặc áp migration |

## Nhóm bắt buộc còn phải bóc và nghiệm thu

| Entry point web | Nhóm hành động bắt buộc phải đối chiếu | Nguồn chuyển có thể tận dụng |
| --- | --- | --- |
| `/dashboard` | KPI/panel, bộ lọc/thời gian/phạm vi, drilldown, quyền từng chỉ số | Home hiện tại và đồng nghiệp |
| `/vehicles` | Tìm/lọc/phân trang/chi tiết, tạo/sửa hồ sơ, giấy tờ/ảnh/OCR, lịch sử, nhập/xuất và action web thực có | Form tạo/sửa/lịch sử đồng nghiệp + domain mới |
| `/vehicles/transfers` | Danh sách/lịch sử/lọc toàn hệ thống; chuyển/nhận/từ chối/hủy, ownership khác kho, ảnh/thông báo | Writer hiện tại + danh sách đồng nghiệp |
| `/gps` | Thiết bị/xe chưa ghép, trạng thái/độ mới, bản đồ/nhật ký/dừng lâu, lọc, đồng bộ/ghép theo quyền | UI đồng nghiệp + shared GPS web |
| `/customers` | Tìm/chọn/tạo/sửa/xóa nếu web cấp; trạng thái/blacklist, giấy tờ/người thân/lịch sử, nhập/xuất | Customer domain hiện tại; không chép route SQL cũ |
| `/contracts` | Nhập/nháp/cọc/phát hành/duyệt/giao/gia hạn/thu–chi/trả–đổi/thu hồi; sửa hồ sơ/tiền/ngày, correction, lịch sử/media/in/xuất, nhập bổ sung | Nền hiện tại + chọn lọc lịch sử/nhập bổ sung đồng nghiệp |
| `/contracts/drafts` | Danh sách/filter, tạo/mở/sửa/xóa nháp và mọi loại/mode được cấp | Nền hiện tại; tham khảo xóa nháp đồng nghiệp |
| `/contracts/due` | Danh sách/nhắc kỳ/chỉ số/filter và các action liên quan | Domain web; màn kỳ trong hồ sơ chưa thay thế workspace |
| `/contracts/overdue` | Công nợ/liên hệ/GPS/thu hồi, danh sách/filter/lịch sử | Một phần hiện tại + web |
| `/contracts/ownership` | Toàn vòng đời thuê sở hữu, phân loại/kỳ/duyệt/bảo lưu/thu–trả/chứng từ/correction | Domain shared hiện tại; còn full workspace |
| `/contracts/vat` | Danh sách, bộ lọc, chứng từ và action theo web | Chưa có màn tương đương |
| `/contracts/battery` | Đã có CRUD mềm/prefill/hồ sơ/tiền thuê-cọc/gia hạn/thu từng phần/trả/history/UUID/recovery/Telegram theo domain web; SQL5nhóm/Samsung3happy path đạt20:18 | Còn in/xuất mẫu, picker CCCD/SĐT/NV, đổi pin xe điện/phí/phiếu/batch và nghiệm thu sâu. Không tự hoàn cọc khi trả. [QA](qa/2026-11-03-mobile-battery.md) |
| `/contracts/types` | Đã có danh mục/tạo/đổi tên/ẩn-hiện, immutable billing-term/snapshot và inline tạo/chọn; typed text-ID receipt/CAS/UUID/recovery, Samsung3happy path đạt20:48 | Schema resource_key staging chưa áp, full role/RLS/network/iPhone/release còn thiếu; mẫu/in hợp đồng ở luồng riêng. [QA](qa/2026-11-03-mobile-contract-types.md) |
| `/cashbook` | Sổ quỹ độc lập/phân trang/lọc/tổng, tài khoản-két CRUD/trạng thái/lịch sử, CSV, bulk phiếu/chọn toàn bộ theo filter đã nối | Dùng reader/domain/formatter web chung; settings.write cho xóa, batch500/UUID/receipt/recovery. Nghiệm thu toàn vai trò/staging/iPhone còn thiếu |
| `/debt-reminders` | Danh sách/chọn hồ sơ/soạn/gửi/theo dõi/kết quả/lịch sử, chống gửi trùng | Workflow đồng nghiệp + quyền/domain mới |
| `/staff-sales` | Các workspace báo cáo/filter/drilldown/xuất theo quyền, dữ liệu nguồn khách và hiệu lực sửa | Web mới nhất |
| `/shift-reports` | Tạo/sửa nháp, bằng chứng/nộp/đối soát/duyệt/lịch sử và số liệu | Đồng nghiệp chỉ có danh sách gần nhất |
| `/duty-roster` | Cá nhân/tuần/cơ sở, tạo/sửa/xóa mềm/lọc/chồng lịch, revision/phục hồi | Module đồng nghiệp là ứng viên chuyển |
| `/operations` | Đã nối5công cụ/lập-trả-gia hạn-kho-nhập lịch sử, tìm biển số/SĐT, tổng scoped active/overdue, nháp/đến hạn và hồ sơ gốc | Reader/writer/validation web chung; lịch sử ghi server và toàn role/staging/native chưa nghiệm thu. [QA](qa/2026-11-03-mobile-integrations-operations.md) |
| `/staff` | Danh sách/hồ sơ/tạo/sửa/ngừng hoạt động theo web; dữ liệu riêng theo quyền | Đồng nghiệp có tra cứu |
| `/stores` | Danh sách/hồ sơ/tạo/sửa/xóa/cấu hình đúng điều kiện web | Đồng nghiệp có danh bạ |
| `/accounts` | Đã có source/API/native tạo/sửa/khóa-mở/xóa mềm/role/scope/grants/receipt, cấp credentials một lần; reveal riêng145/160; cá nhân tự đổi password/session theo domain web | Native self-password write/file/share và full role/RLS/network/staging/iPhone/release chưa nghiệm thu. [QA](qa/2026-11-03-mobile-managed-accounts.md) |
| `/integrations` | Đã nối GPS account/upsert/bật-tắt, bot/nhóm/chủ đề/hai nhóm sở hữu, trạng thái/lịch sử/thông báo bằng actual domain web/admin gate, secret server, CAS/UUID/recovery | Schema resource_key staging chưa áp; native credential/bot write, gửi thật và full acceptance còn thiếu; màn web hiện tại không có test-connection hoặc ghi scheduler. [QA](qa/2026-11-03-mobile-integrations-operations.md) |

Không suy quyền quản lý tài khoản từ mảng permission: `canManageAccounts` và
`accounts.manage` chỉ admin theo domain; khôi phục mật khẩu/báo cáo đội xe còn
có entitlement cá nhân. Fleet read/transfer/receive được web cấp cho tài khoản
workspace, không chỉ role mặc định có string đó. Phải gọi helper quyền dùng
chung; không tạo bảng role mới trên app để thay backend.

## Kết nối và nghiệm thu

Ngày02/11 đã probe công khai `https://himoto.vercel.app`: `/login` trả200,
`/api/mobile/v1/session` và `/api/mobile/v1/me` trả404. Đây là địa chỉ tìm được
trong repo, chưa xác minh là deployment người dùng đang vận hành hay schema DB
đích. Chưa đăng nhập thật, chưa đọc env và chưa áp migration/deploy.

Samsung đã kết nối ADB, app debug có sẵn `vn.himoto.staff`. Bản JS mới dùng
Metro hiện có và API QA riêng port8101 với checkpoint bền vững; đây là kiểm
chứng UI/native, chưa phải theo dõi dữ liệu thật. Giao diện đánh dấu bản phát
triển. Không chuyển sang backend thật khi API/session/schema chưa sẵn sàng.

Done toàn mục tiêu vẫn cần full action inventory, role/scope/staging, nhiều
phiên/xung đột/ghi trùng, native Android và signed iOS/iPhone, release/vận hành.
Không ghép các lượt test tập trung thành một lượt full app pass.
