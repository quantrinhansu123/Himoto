# Bàn giao tiếp tục app Himoto —03/11/2026

## Bàn giao chuyển chat04/11 — đọc bản mới trước

Đã chốt [bàn giao04/11](mobile-handoff-2026-11-04.md) và
[prompt chat mới](mobile-next-chat-prompt-2026-11-04.md). Đây là trạng thái
mới nhất, thay các PID/handle/generation trong checkpoint cũ phía dưới.
Đã pull27a87f1/giữ source, thêm gia hạn nhiều xe và duyệt sở hữu sau phát
hành. SQL4/types/lint/export và Samsung run1 terminal exit0 lúc02:45:30,
447file/0crash-ANR; chỉ preview native, không gửi duyệt. QA7/Tổng quan/
work-ledger rỗng, generation71/26checkpoint giữ; QA8131 handle59922/PID16456,
Metro admin7600/origin8091 giữ. **Tiếp theo: full edit native chưa làm**;
đọc mục3 bản mới để giữ overwrite/permissive semantics và tiền/kho/audit web.
[QA duyệt](qa/2026-11-04-mobile-issued-approval.md). Mục tiêu chưa hoàn tất.

## Cập nhật04/11: đã pull27a87f1, tiếp tục gia hạn/thu nhiều xe

Pull explicit origin/main fast-forward11commit, giữ846file nguồn:
840nguyên byte/6gộp3chiều,0mất/mismatch, không commit/stash/reset/env.
Backup `.backups/prepull-mobile-20261104-021022`. [QA pull/triển khai](qa/2026-11-04-mobile-renewal-parity-and-pull.md).

Native source đã nối giờ/ngày/số kỳ/đơn giá/hẹn trả trực tiếp; ngày gia hạn
thực tế đặt trước đơn vị, cùng ngày phiếu thu theo web mới, recorded_at
server riêng. Quy tắc tách ngày phiếu ở cập nhật03/11 bên dưới đã được thay
theo web27a87f1. Thu+gia hạn nhiều xe trong thu/chi: tối đa50, tiền/hẹn riêng,
một phiếu/UUID/recovery bằng actual writer web; không migration mới.
SQL4/pure3/finance8/form4/backfill4+SQL4/workspace3/types/lint/export đạt.
Native run2 handle97021 terminal exit0 lúc02:27:01,3nhóm màn hình/441file
khớp/0crash-ANR; QA7/Tổng quan/work-ledger rỗng, toàn state64/26checkpoint
giữ nguyên. Chưa gửi phiếu/bill/tiền native trong bài này.
QA thêm field63→64, mọi field cũ giữ; same8131/checkpoint handle69857/
PID15336. Metro admin mới7600/launcher8384/origin8091/dotenv tắt, USB giữ.
Tiếp tục action web mới full edit/duyệt/correction/bảo lưu và in/Excel/video;
chưa staging/iPhone/full acceptance, mục tiêu vẫn active.

## Nhập bổ sung đủ ba lối vào —Samsung xem màn hình đạt23:25

Đã nối hợp đồng/gia hạn/thu-chi lịch sử, quyền riêng/scope/picker trước
paging, đúng ID; actual web returned-line reader/writer/helper và phiếu/
bill/UUID/recovery. occurred_at riêng ngày thu, trong lượt thuê; giữ kho/
completed_at, nợ có thể đưa completed→wait_payment như web. Phí khác/VAT,
thu ngoài và note chung web/native; mặc định ngày trống/xác nhận tiền/
tài khoản theo web. [QA/phần thiếu](qa/2026-11-03-mobile-backfill-flows.md).

SQL4/form backfill4/renewal6/form cũ4/bill4/write4/workspace3 đạt;
root/mobile types/scoped-shared lint exit0. Unit write negative cũ đã
chuyển từ occurred_at hợp lệ sang tương lai2099, positive kiểm actualSQL.
Export64277 exit0 web/android/ios, dotenv tắt/APIplaceholder; chỉ JS/Hermes.
QA chỉ thêm field62→63, giữ mọi field cũ; server43534/PID19296 same8131/
checkpoint, Metro6480/origin8091 giữ. Native run1 dừng trước write ở ô
placeholder; run2 handle25648 terminal exit0 lúc23:25:46,3nhóm màn hình/
435file/0crash-ANR/QA7/Tổng quan/work-ledger rỗng; toàn state63/26checkpoint
giữ nguyên. Không chọn ngày/ghi tiền/upload bill native trong bài này;
chưa native financial-write acceptance. Helper web chỉ áp trong PGlite tạm,
không DB vận hành/migration/deploy. Tiếp tục action/in/Excel/correction/video.

## Tích hợp / điều hành / nhập lịch sử —Samsung kiểm nhanh đạt22:54

Đã nối source/API/UI GPS Protrack/IOPGPS, bật-tắt, cấu hình bot/nhóm/chủ đề/
hai nhóm sở hữu, trạng thái/lịch sử/thông báo; actual web reader/writer,
admin gate, cipher/HMAC server, CAS/UUID/typed receipt/recovery. Điều hành
có5công cụ, tìm hợp đồng/tổng theo scoped SQL web, active/renewable trước
pagination. Composer có đang thuê/đã trả lịch sử và durable work tách chế
độ; validation dùng chung web. [QA và giới hạn](qa/2026-11-03-mobile-integrations-operations.md).

SQL4+3nhóm/workspace3/form4/pending25 đạt; root/mobile types/scoped/shared
lint đạt. QA thêm field generation52→53, giữ mọi field cũ, không reset mã.
Native run1–3 dừng trước write ở harness; run4 có read/local-work, run5 tiếp
tục đúng work sau kiểm source trừ harness, không reset. Handle8125 terminal
exit0,430file/3UUID-ack/0crash-ANR, QA7/Tổng quan/work-ledger rỗng. Mọi field
nghiệp vụ/account5receipt/26checkpoint giữ, chỉ auth parent/2expiry con đổi
đúng login. Generation62, QA8131 handle94779/PID5116; Metro8081 admin6480/
origin8091 giữ nguyên. Export3893 terminal exit0 web/android/ios, dotenv tắt/
APIplaceholder, chỉ JS/Hermes chưa signed APK/IPA.
resource_key staging chưa áp; chưa gửi thật/ghi DB vận hành/đủ nghiệm thu.
Còn nhập bổ sung gia hạn/thu-chi, Excel/in/correction/video/action khác;
SQL fixture web branch cũ thiếu store_directory, pure2nhóm đạt, giữ failure.
Portfolio điều hành native chỉ đọc riêng, chưa chứng nhận dataset demo liên
thông toàn app. Tiếp tục action còn thiếu, mục tiêu vẫn active.

## Tài khoản có source/API; Samsung được audit đạt —22:03 (+07)

**Mục tiêu active; tiếp tục tích hợp/vận hành/action chưa phủ.** Có quản
trị account list/filter/search/paging/profile/tạo/sửa/role/scope/grants/
khóa-mở/xóa mềm; credentials ban đầu một lần/che/chia sẻ/tải text do người
dùng chọn. Xem mật khẩu chỉ admin145/160, actual cipher/audit; admin reset
vẫn bị cấm. Cá nhân tự đổi password, actual version trigger/escrow/audit,
phiên cũ hết hiệu lực và đăng nhập lại. UUID/CAS/receipt/Account recovery,
không plaintext trong cache/pending/receipt/audit. [QA](qa/2026-11-03-mobile-managed-accounts.md).

Dùng actual listManagedAccounts/saveManagedAccount/deleteManagedAccount/
revealAccountPassword/changeOwnPassword, cùng DB/quyền mặc định/web.
Owner admin gate giống route web, không ủy quyền accounts.manage cho role
khác. Shared nguyên pure permissions/role/validation; web re-export, key/
bcrypt/cipher chỉ server. Password fingerprint HMAC khóa server. Không
migration/deploy/DB vận hành, module account dùng ledger số hiện hành.

SQL6nhóm đạt, có actual mobile session reader từ chối account khóa và
version cũ, new password authenticate được/replay không đổi hai lần;
staff regression4/auth-client/recovery6/pending24 đạt. Root types/scoped+
shared lint99682, mobile types/lint72371 terminal exit0. Native run1–4 chưa
accountwrite (USB/hint nhập/Laban/viewport), giữ nguyên trước khi tiếp tục.

Run5 có5UUID/5audit/create#2001→đổi tên-khóa→mở→reveal che→xóa mềm/ack.
Harness exit1 ở preservation vì parent login mới làm đổi2expiry phiên QA
con. Đã backup source cũ/hash; chỉ sửa comparison đúng2path, buộc khớp
expiry parent sống. Completion audit chỉ đọc handle16247 exit0 lúc22:03:02,
không replay/ghi lại;414/415file khớp, chỉ harness sửa, source app nguyên.
0crash/ANR/work/ledger rỗng, QA7/Tổng quan.3happy path được audit đạt;
native self-password write/share/file chưa nghiệm thu. Giữ cả failure/
audit evidence `.backups/mobile-accounts-native-20261103-run5`.

QA thêm accounts_workspace37→38; auth login/logout và5mutation nay52.
Mọi businessfield/account nền/26checkpoint giữ nguyên; chỉ phiên QA cha/
hai expiry con thay do login. Không reset/replay5UUID. Server8131
handle74944/PID12188 cùng checkpoint, Metro admin6480/origin8091/dotenv tắt,
USB reverse8081→8081/8091→8131. Export web/Android/iOS handle79328 terminal
exit0 tại `.backups/mobile-accounts-export-20261103-run1`, dotenv tắt/API
placeholder, chỉ JS/Hermes chưa signed APK/IPA. Tổng hợp
`.backups/mobile-accounts-verification-20261103.json`. Toàn role/cơ sở/RLS/mạng
lỗi/nhiều phiên/staging/iPhone/release chưa nghiệm thu, app chưa done.

## Loại hợp đồng có source/API và Samsung smoke đạt —20:48 (+07)

**Mục tiêu active; tiếp tục tài khoản/tích hợp/vận hành/action còn thiếu.**
Danh mục loại có đọc/tìm/lọc/tạo/đổi tên/ẩn-hiện, immutable billing/term,
CAS/UUID/receipt ID chữ/Account recovery. Trong actual composer mở quản
lý tại chỗ, tạo/ack thì tự chọn loại mới đúng chooseDraftType, giữ durable
work. Hợp đồng đã lưu giữ snapshot tên/thời hạn khi danh mục đổi hoặc ẩn.
Không có DELETE như web. [QA và giới hạn](qa/2026-11-03-mobile-contract-types.md).

Web/mobile cùng saveContractTypeRecord; saveContractType web giữ signature/
list cũ. Shared validation/type/billing. Quyền đọc contracts.read; ghi
cả settings.write+finance.write theo hai gate web, không scope/operation/
owner exception mới. RLS global catalogue giữ như web: scoped đọc, admin
dùng nhánh pool admin hiện hữu. SQL4nhóm là domain/gate/metadata, chưa RLS.

IDvarchar80 được giữ thật qua resource_key varchar160 nullable trong
mobile ledger, resource_id NULL; không ép số/tạo businessID giả. Script
review-only `docs/sql/2026-11-03-mobile-text-receipts.sql` **chưa áp**; staging
cần cột trước khi bật ghi/đối chiếu. Preflight chỉ đọc đã thêm kiểm schema.
Receipt số tiền/khách/xe không đổi. Generic resolver không nhận ID chữ;
endpoint typed riêng và pending cùng actor/origin/global catalogue.

SQL nhúng4nhóm, web compatibility3/pending23/recovery6 đạt. Root types/
scoped+shared lint handle10171, mobile types/lint final5180 terminal exit0.
Samsung run1 dừng trước write để thêm remount khi session/scope/quyền đổi;
run2 handle16570 terminal exit0 lúc20:48:14,400file khớp,3happy path:
CRUD/status+5receipt/ack, inline tạo/chọn đúng, bỏ riêng local draft QA rồi
work/ledger rỗng/Tổng quan.0crash/ANR/0DB vận hành. QA chỉ thêm
types_workspace31→32; sau5write37, giữ field cũ/9loại nền/26checkpoint.
Không reset/replay5UUID. Hai loại active mới giữ để demo đọc/chọn.

Export web/Android/iOS handle90224 terminal exit0; output
`.backups/mobile-types-export-20261103-run1`, dotenv tắt/APIplaceholder,
chỉ JS/Hermes chưa signed APK/IPA. Tổng hợp
`.backups/mobile-types-verification-20261103.json`. Server8131 handle33075/PID6080
cùng checkpoint, Metro admin6480/origin8091/dotenv tắt, USB reverse giữ.
Toàn role/cơ sở/schema staging/nhiều phiên/mạng lỗi/iPhone/release chưa
nghiệm thu; không coi module/app done.

## Pin / sạc có source/API và Samsung smoke đạt —20:18 (+07)

**Mục tiêu active; tiếp tục loại hợp đồng/quản trị/action còn thiếu.** Pin/
sạc có list/filter/profile/lập/sửa/prefill từ hợp đồng xe, tiền thuê-cọc/
tài khoản, gia hạn ghi nợ hoặc thu ngay/thu một phần/trả/xóa mềm/history/
UUID/CAS/receipt/Account recovery. Preview/trạng thái/gửi Telegram có xác
nhận dùng helper web,0tin thật. Shared validation/calendar/DTO và actual
web reader/writer, cùng bảng/phiếu, không DB app riêng. Trả pin giữ nợ/
cọc, không tự tạo hoàn tiền. [QA/phần thiếu](qa/2026-11-03-mobile-battery.md).

SQL nhúng5nhóm đạt, mobile↔web cùng ID và actual300thuê/1000cọc/200thu
nợ, replay không thu trùng; ngày cuối tháng/legacy/CAS/quyền/actor/xóa giữ
phiếu. Pending22nhóm đạt. Root types/scoped lint handle70899 và mobile
types/lint89779 terminal exit0; shared duplicate import đã sửa, lint riêng
exit0 không warning. Export web/Android/iOS handle89852 đã terminal exit0;
output `.backups/mobile-battery-export-20261103-run1`, dotenv tắt/API
placeholder.invalid, chỉ JS/Hermes, chưa signed APK/IPA. Tổng hợp
`.backups/mobile-battery-verification-20261103.json`.

QA chỉ thêm battery_workspace generation27→28, backup giữ mọi field cũ.
Run1/2 chưa write: harness chưa cuộn rồi phát hiện fixture USER thiếu
renew/return; đã thêm đúng quyền cho QA actor, không đổi quyền app/backend.
Run3 handle90514 terminal exit0 lúc20:18:15,392file khớp,3happy path:
gia hạn300chưa thu→trả→xóa mềm và3receipt/ack. Revision#2:769→772,
history2dòng/nợ300giữ, generation31.0crash/ANR/work/ledger rỗng, trả Tổng
quan; mọi field ngoài battery_workspace/26checkpoint giữ nguyên. Không
reset/replay3UUID. Native chưa kiểm tạo/sửa/thu tài chính/gửi Telegram.

Server8131 handle90362/PID14040 cùng checkpoint, Metro admin6480 vẫn8081/
origin8091/dotenv tắt, USB reverse giữ8081→8081/8091→8131. Pin còn in/xuất
mẫu, picker CCCD/SĐT/nhân viên, đổi pin xe điện/phí/phiếu/batch và full
acceptance; không coi module hoặc app done. Loại hợp đồng đã có cập nhật
20:48 ở đầu tài liệu: hai quyền ghi web, IDtext thật và typed receipt;
cột resource_key staging chưa áp, tiếp tục quản trị/action còn thiếu.

## Báo cáo ca PGD/KTNB có source/API và Samsung smoke đạt —19:42 (+07)

**Mục tiêu active.** Có source/API/UI danh sách/hồ sơ/lập/sửa/chốt,6phần
kiểm kê/12chỉ số/thuê sở hữu/tự điền DB; ảnh6nhóm PGD/KTNB, đối soát độc
lập/app-sổ-thực tế/fingerprint/lưu nháp-xác nhận; outbox/trạng thái/thử gửi
Telegram đúng domain web. Web routes đã gọi chung domain/handler tách từ
code cũ, không writer mobile riêng.4module thuần chuyển shared và web
re-export, không mở watch root web/env. [QA/phần còn thiếu](qa/2026-11-03-mobile-shift-reports.md).

SQL nhúng5nhóm đạt, actual shared media transaction và metadata/audit
writers; snapshot/ownership source trong SQL là QA adapter cố định, chưa
RLS/analytics acceptance. Web shift-reports/audits offline checks đạt,
pending21nhóm đạt. Root/mobile typecheck và mobile lint final2 handles
35869/7908 đã terminal exit0. Root scoped lint exit0; shared lint qua Expo
config riêng exit0 vì config root không nhận files ngoài src. Export mới
web/Android/iOS handle18624 terminal exit0 tại
`.backups/mobile-shifts-export-20261103-run1`, APIplaceholder.invalid/dotenv
tắt, chỉ JS/Hermes, không signed APK/IPA. Final root types handle11437
exit0 sau khôi phục thứ tự check quyền web trước parse/DB. Tổng hợp
`.backups/mobile-shifts-verification-20261103.json`.

QA chỉ thêm shifts_workspace generation24→25, giữ mọi field cũ. Native
run1 dừng trước thao tác vì module nằm ngoài Metro watch roots; đã chuyển
pure modules shared và SQL qua lại. Run2 handle56083 terminal pass3nhóm
lúc19:42:43 trên376file khớp,2request lưu/chốt/ack, revision#3 lên3/status
submitted, generation27.0crash/ANR/work/ledger rỗng, trả Tổng quan;
mọi field cũ và26checkpoint giữ nguyên. Không replay/reset2UUID đã ghi.
Phiếu#3 là portfolio PGD riêng, không Telegram;
snapshot readonly cố định, media/KTNB write/autofill ngoài phạm vi fixture
báo rõ. Server8131 handle92160/PID18404 lúc kiểm, cùng checkpoint; kiểm
listener trước restart. Metro admin6480 vẫn8081,
origin8091/dotenv tắt. Còn video native/copy-export KTNB và toàn nghiệm thu
sâu, không coi module/app done. Tiếp tục pin/loại hợp đồng/quản trị sau
kiểm nhanh, không chờ full matrix báo cáo ca.

## Nhắc nợ đã nối source/API; smoke Samsung đạt —19:18 (+07)

**Mục tiêu vẫn active.** Nhắc nợ có lịch sử20dòng/cơ sở/phân trang, tìm hợp
đồng remindable bằng reader web, soạn riêng/nội dung mẫu/số khách readonly,
chọn nhiều trang/rà soát/gửi tuần tự từng hợp đồng, trạng thái và mở hồ sơ.
Dùng actual `readDebtReminderContext`/`sendDebtReminder`/`listDebtReminders`.
Pure DTO/format message/phone/status chuyển sang shared, web re-export cùng
hàm. Không đưa webhook/cấu hình bí mật vào app.

Web writer chỉ thêm optional reservation adapter, caller cũ giữ hành vi.
Mobile ledger UUID/receipt và reservation lịch sử cùng transaction trước
provider I/O; cancellation chặn gửi muộn, replay không gửi lại. Receipt ghi
ID hợp đồng/revision lúc chuẩn bị, không chứng nhận khách nhận tin. Chỉ quyền
contracts.read + (contracts.draft hoặc finance.write) được gửi/đối chiếu;
lịch sử contracts.read. Bulk giữ từng key chưa rõ, tiếp tục hợp đồng độc lập;
terminal accepted/failed đọc proof rồi đóng key, không tự retry lỗi.

SQL nhúng5nhóm đạt, fake provider4lần/0tin thật, pending20nhóm đạt;
root/mobile typecheck/lint đạt. `.backups/mobile-reminders-domain-checks-final.log`,
`mobile-reminders-root-checks-final.log`, `mobile-reminders-mobile-checks-final.log`.
Mobile typecheck/lint final2 sau chỉnh batch đã terminal exit0, không warning;
recovery6nhóm đạt. Samsung run2 đạt3happy path trên357file: rà bulk không
gửi, soạn/xác nhận1tin giả/ack, lịch sử/hồ sơ liên kết;0crash/ANR, work/
ledger rỗng, trả Tổng quan. Chỉ1row/request mới local, generation24;
mọi field cũ và26checkpoint giữ nguyên. [QA nhắc nợ](qa/2026-11-03-mobile-debt-reminders.md).
Export ba nền tảng handle63649 đã terminal exit0,
`.backups/mobile-reminders-export-20261103-run1`, dotenv tắt/APIplaceholder;
chỉ JS/Hermes, không signed APK/IPA. Tổng hợp
`.backups/mobile-reminders-verification-20261103.json`.

QA chỉ thêm reminders_workspace manifest/rows/requests, generation22→23,
mọi field cũ giữ nguyên, backup `.backups/mobile-reminders-qa-upgrade-20261103`.
Context hợp đồng17001 từ actual SQL nhúng, linked-record QA chỉ đọc; không
phải fixture cho mọi action tài chính/kho trên hợp đồng đó. Đầu nhận chỉ
ghi local accepted, không có HTTP client/không gửi Zalo thật. Native run1
dừng ở preflight vì USB reverse rỗng, chưa mở/ghi app. Đã khôi phục đúng
8081→8081/8091→8131. Run2 từng timeout lúc launch do Samsung khóa; PID20737
vẫn sống, sau mở khóa tiếp tục đúng phiên và giữ audit, không restart/mutation
lặp. Server8131 handle12984,
PID20384 lúc kiểm, cùng checkpoint. Metro admin6480 vẫn8081/origin8091,
dotenv tắt. Không reset/replay khi native đã có receipt; xem source/state
và đối chiếu UUID trước. Tiếp tục báo cáo ca/quản trị sau kiểm nhanh.

## Báo cáo thuê xe/doanh số đã nối source/API —03/11, lượt tiếp

**Mục tiêu vẫn active; tiếp tục phủ nhắc nợ/báo cáo ca/quản trị.** Đã có
10nhóm báo cáo,7kỳ/ngày Việt Nam/cơ sở, lọc/phân trang thu-chi và xe,
drilldown/hồ sơ, tiến độ ngày. Gọi9reader/domain web chung trong snapshot
read-only/repeatable-read. Ngoại lệ đội xe chỉ admin145/160 đúng helper web;
không nâng quyền/scope các workspace khác. CSV toàn bộ theo filter và
Excel sổ thu/chi có bộ dựng workbook chung với web, giữ hai sheet/16cột/
dấu/tổng/định dạng. [QA báo cáo](qa/2026-11-03-mobile-reports.md).

Root/mobile typecheck và lint liên quan đạt; SQL nhúng5nhóm đạt, không có
ghi DB vận hành. Samsung run1 đạt3nhóm tập trung lúc18:14: kỳ tháng/thực
thu, xe→lượt thuê, phiếu chi→Excel hai sheet/8dòng/9729byte khớp bytes;
349file nguồn khớp, một harness sửa selector có audit. 0crash/ANR,
work/ledger rỗng, trả Tổng quan. Native giữ main checkpoint và26checkpoint
cũ; không chứng nhận toàn10panel/filter/role/native/iPhone. Export cuối
web/Android/iOS đã terminal exit0 tại `.backups/mobile-reports-export-20261103-run1`,
API placeholder.invalid/dotenv tắt; chỉ JS/Hermes, không signed APK/IPA.
Tổng hợp `.backups/mobile-reports-verification-20261103.json`.
Android SAF đã mở rộng Base64 XLSX;
iOS dùng thư mục tạm UUID riêng, Share/iPhone thật chưa nghiệm thu.

QA chỉ thêm manifest reports_workspace, generation21→22, mọi field cũ
giữ nguyên. Catalogue từ actual SQL domain trên PGlite tách biệt có113scope
đọc/96scope xuất; bộ lọc QA ngoài danh mục báo thiếu dữ liệu chuẩn bị,
không trả kỳ khác/số0 thay thế. Portfolio báo cáo khác hợp đồng/phiếu CRUD
cũ: không dùng chúng đối chiếu nhau hoặc chứng nhận link hồ sơ native.
Checkpoint cũ không reset; backup `.backups/mobile-reports-qa-upgrade-20261103`.
Server8131 mới handle7420/PID19516 cùng checkpoint; kiểm listener trước restart.
Metro admin6480/8081/origin8091 và USB giữ nguyên, dotenv tắt.

## Xóa phiếu hàng loạt đã nối và smoke Samsung đạt —17:17 (+07)

**Toàn mục tiêu vẫn active; tiếp tục phủ module báo cáo/quản trị.** Bulk sổ
quỹ đã có chọn từng phiếu/chọn trang/nhiều trang/bỏ chọn và xóa toàn bộ loại
thu/chi theo filter lúc mở rà soát. Xóa toàn bộ gõ XOA, xem count/amount/ID
mẫu, gọi actual `parseBulkDelete`/`bulkDelete(transactions)` web, tối đa500
phiếu/batch. Giữ quyền xóa settings.write, đọc finance.read, scope actor/
cơ sở; không thay bằng finance.write hoặc owner/fleet scope.

Mỗi batch dùng UUID trong transaction; chỉ gửi batch sau khi đọc receipt
gốc và đối chiếu số lượng. Lỗi giữa chừng giữ key và dừng, Account recovery
có kết quả xóa/ack hoặc cancellation chặn request muộn. Khóa một intent theo
actor/origin qua đổi cơ sở, không thay ranh giới create của nghiệp vụ khác.
Riêng cashbook.delete, ledger resource_id=count và revision=receipt-format1,
không phải ID/phiên bản phiếu; DTO/UI ghi rõ count. Không migration mới.
Chi tiết/giới hạn [QA bulk](qa/2026-11-03-mobile-cashbook-delete.md).

SQL nhúng8nhóm đạt: thêm actual hoàn tác tiền thuê/extra/gia hạn/hoàn sớm,
pending/outside, tiền pin và payment-proof; replay không trừ hai lần,
rollback/cancel/quyền/max500/filter/receipt sau xóa. Pending19/recovery6đạt.
Root/mobile typecheck và lint backend/mobile liên quan đạt.

Samsung run1 đạt3nhóm happy path lúc17:17:30 trên343file source khớp,
0crash/ANR, work/ledger rỗng và trả Tổng quan. Chỉ xóa3phiếu mẫu mới15001–3
bằng2receipt(count1,2), giữ nguyên mọi field cũ/10phiếu/4receipt cashbook cũ
và26checkpoint. `.backups/mobile-cashbook-delete-native-20261103-run1/results.json`.
Không tạo lại các phiếu mẫu đã xóa để chạy lại bài kiểm.

QA upgrade chỉ thêm cashbook_bulk_workspace, generation18→19, nay21 với
rows rỗng/2receipt. Server8131 hiện handle78099, PID14052 lúc kiểm; checkpoint
vẫn `.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json`.
Metro admin6480/launcher364 vẫn8081, API8091, dotenv tắt; USB giữ nguyên.
Dataset8130/watch8101 được giữ trên đĩa; không mặc định process cũ còn chạy.
Phải kiểm listener/handle trước restart, không reset fixture/ledger.

Export web/Android/iOS mới đã terminal exit0,
`.backups/mobile-cashbook-delete-export-20261103-run1`, API placeholder.invalid,
dotenv tắt; chỉ JS/Hermes bundles, không signed APK/IPA. Tổng hợp
`.backups/mobile-cashbook-delete-verification-20261103.json`.
Native của lượt này không phải full matrix.
Sau native chỉ chỉnh2chuỗi UI trong cashbook-delete-actions: khoảng cách
“500 phiếu” và bỏ nhắc implementation web trong cảnh báo người dùng. Logic
không đổi; mobile typecheck/lint đã qua lại. Không lấy343hash native trước
chỉnh copy chứng nhận file copy
mới, không lặp mutation chỉ để kiểm một sửa chữ. Bundle cuối run2 đã
terminal exit0 tại `.backups/mobile-cashbook-delete-export-20261103-run2`;
handle94550 đã kết thúc. API placeholder.invalid, dotenv tắt.
Chưa kiểm sâu >500native, nhiều phiên/mạng lỗi giữa batch/lifecycle/RLS
staging, toàn vai trò/cơ sở, signed iPhone và release. Không chờ các mục này
trước khi triển khai tiếp báo cáo; không tuyên bố done toàn cashbook/app.

## Cập nhật sổ quỹ/két và Metro admin —03/11, cuối lượt

**Mục tiêu vẫn active.** Người dùng vừa nhắc lại ưu tiên giao app và cho phép
khởi động Metro bằng quyền admin. Giữ `mobile/` làm nền, domain/backend/dữ
liệu chung web, đủ100%action cuối cùng; không đổi các ràng buộc mục0.

Đã thêm source/API/native sổ quỹ: phân trang/sort thu-chi riêng, tìm kiếm,
ngày Việt Nam/người/cơ sở, tổng thuê xe và chi tiết đối chiếu. Ngân hàng/két
có hồ sơ/số dư toàn thời gian/lịch sử, tạo/sửa/trạng thái/ngừng dùng/xóa có
điều kiện, shared validation, xmin CAS/UUID/receipt/recovery và khóa pending.
Dùng reader `listCashbook` và domain `cashbook-account-domain.ts` chung web;
không có DB riêng hoặc dữ liệu cần chép lại sau. Liên kết từ Tổng quan/cơ sở.

Xuất CSV toàn bộ theo filter đã nối, dùng trực tiếp formatter12cột của web,
BOM UTF-8/escape công thức/ngày-tiền như web. Android SAF chọn thư mục,
iOS share file tạm, web download. Đã sửa lỗi Android9 Downloads-provider trả
raw tree không ghi được: mở mặc định ở Download qua device-storage provider;
người dùng vẫn chọn nơi lưu. Lỗi filesystem hiện thông báo tiếng Việt, không
đưa stack/URI hệ thống vào UI. [QA/phần thiếu](qa/2026-11-03-mobile-cashbook.md).

Kiểm nhanh: SQL nhúng5nhóm đạt, có mobile tạo→web đọc và web tạo→mobile đọc
cùng ID/số dư, cùng phép tính/điều kiện xóa, CSV byte-for-byte formatter web.
Pending18/recovery6đạt; root/mobile types và lint liên quan đạt (shared TS
không nằm trong config eslint root; được kiểm bởi typecheck/mobile lint).

Samsung CRUD run2 giữ ảnh qua tạo/sửa số dư-500/ngừng dùng/xóa két12001 và
4receipt riêng, work/ledger rỗng/Overview; bị ngắt khi thu diagnostics, không
có verdict native cuối, **không báo0crash/ANR cho run đó**. Audit sau ngắt
giữ mọi field QA cũ/4phiếu và333file lúc đó. Không rerun write hoặc reset.
Evidence `.backups/mobile-cashbook-native-20261103-run2/interrupted-audit.json`.
Lượt xuất CSV mới run2 đạt16:57:33 (+07), đúng1file/10phiếu/2204byte/BOM/
CRLF, hash khớp; checkpoint nguyên vẹn, work/key rỗng và0crash/ANR trong
lượt xuất file.337file khớp, chỉ QA helper đổi nhãn tiếng Việt/raw adb,
app/shared/config không thay khi picker mở. Samsung đang Tổng quan.
`.backups/mobile-cashbook-export-native-20261103-run2/results.json`.
Run1 phát hiện lỗi Downloads-provider Android9, giữ evidence; không xóa
file demo đã lưu để chạy lại. Các bytes sai khác qua `adb shell cat` là
transport CRCRLF; `exec-out cat` đã xác minh file thật đúng.

QA8131 vẫn checkpoint `.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json`;
chỉ thêm cashbook_workspace, upgrade13→14, nay giữ4phiếu cashbook +3xe +4staff
+0store. Server hiện handle60233 sau restart cùng file để thêm export;
PID3752 tại lúc kiểm; phải kiểm PID/listener/terminal trước khi thay đổi.
Không reset dữ liệu cũ. Export bundle web/Android/iOS đã terminal exit0,
output `.backups/mobile-cashbook-export-20261103-run1`, API placeholder.invalid.
Đây là JS/Hermes bundle, không phải signed APK/IPA hoặc nghiệm thu iPhone.
Tổng hợp `.backups/mobile-cashbook-verification-20261103.json`.

Metro được khởi động lại theo quyền admin người dùng vừa cấp; launcher
PID364/node6480 ở lúc xác minh, port8081, origin8091, EXPO_NO_DOTENV=1.
USB8081→8081/8091→8131. Artifact `.backups/mobile-metro-admin-20261103-run1`.
Lệnh trực tiếp trước đó bị auto-review từ chối “blocked by policy”; lần gọi
admin `-File` kết thúc trước khi chạy; gọi admin `-Command` thành công, không
thay ExecutionPolicy. Đã khôi phục Metro, không còn chặn theo dõi vì lý do đó.

Còn thiếu bulk phiếu/chọn toàn bộ filter; báo cáo doanh số có nhiều panel
(actual/ledger/vehicles/overview/owned-fleet/contracts +5tab con), không chỉ
bảng nhân viên; nhắc nợ, báo cáo ca, pin/quản trị/tích hợp và Excel/action
con trong backlog23khu vực. Tiếp tục phủ chức năng, không chờ deep matrix
của cashbook. Backend thật chưa rollout/staging, signed iPhone/release chưa
nghiệm thu; PGlite/fixture không chứng minh đã đồng bộ DB vận hành.

## Cập nhật nhân sự sau14:54 (+07) — tiếp tục đẩy tiến độ giao app

Người dùng vừa nhấn mạnh: đẩy nhanh phủ chức năng để nộp sản phẩm, khớp
backend/dữ liệu với web, giữ100%chức năng và nghiệp vụ. Không thay các ràng
buộc QA/deploy/migration/production hoặc điều kiện nghiệm thu cuối. Tiếp tục
module tiền/báo cáo/quản trị và các action thiếu; không chuyển sang kiểm thử
sâu từng lát hoặc coi module vừa làm là toàn mục tiêu.

Đã thêm nhân sự: danh sách/hồ sơ/tạo/sửa/trạng thái/nghỉ việc/tái làm/xóa có
điều kiện, cấp tài khoản một lần và đồng bộ login/cơ sở bằng domain web chung.
Web/mobile dùng `saveDatabaseStaff`/`syncStaffAccount`; xóa dùng `bulkDelete`
web, không tự khóa tài khoản khi chỉ xóa hồ sơ. Shared validation/chức vụ,
CAS/UUID/receipt/recovery và lọc3trạng thái/chức vụ. [QA nhân sự](qa/2026-11-03-mobile-staff.md).

Kiểm nhanh: SQL nhúng4nhóm, có actual bcrypt/cipher/atomic staff-login/rollback/
leave-rehire/delete/recovery và **mobile-write→web-reader cùng ID/cơ sở**.
Không DB vận hành hoặc nạp env. Root/mobile types, lint mobile/backend liên
quan đạt; pending17/recovery6/workspace3 đạt. Export3platform cuối exit0 tại
`.backups/mobile-staff-export-20261103-run1` với API placeholder.invalid.

Samsung run1 đạt3nhóm happy path lúc14:54:04 trên318file,0crash/ANR, work/key
rỗng; tạo nhân sự10001/login110001, bàn giao che mật khẩu, sửa/nghỉ việc/xóa
hồ sơ,4phiếu UUID riêng đã ack.26checkpoint và mọi field QA cũ giữ nguyên.
Chỉ staff_workspace thay đổi; login QA110001 giữ trạng thái đã nghỉ/khóa,
hồ sơ10001 đã xóa theo kịch bản, không reset hoặc tạo lại. Không Share thật/
full roles/network/staging/iPhone trong lượt. `.backups/mobile-staff-native-20261103-run1/results.json`.

QA8131 vẫn giữ nguyên origin8091/Metro8081 và checkpoint xe/cơ sở. Server cũ
đã terminal trước restart cùng file; upgrade **chỉ thêm staff_workspace**,
giữ3phiếu xe/0phiếu cơ sở và mọi field trước đó. Evidence
`.backups/mobile-staff-qa-upgrade-20261103/results.json`. Server mới handle39447,
PID8804 tại lúc kiểm; phải kiểm sống/terminal thật trước thao tác tiếp.
Samsung đang Tổng quan QA. Tổng hợp `.backups/mobile-staff-verification-20261103.json`.

Còn thiếu: sơ đồ tổ chức/bulk/Excel và full custom-position filter, clipboard/
tải file login; drilldown hợp đồng/sổ két cơ sở; các action kho/ảnh trước tạo
xe; tiền/báo cáo/quản trị và toàn bộ phần còn lại trong backlog23khu vực.
Backend vận hành chưa rollout: không suy PGlite/Samsung fixture thành sync
production. Xem cập nhật [preflight](mobile-real-backend-preflight-2026-11-03.md).

## Cập nhật tiếp quản —03/11,14:27 (+07)

**Mục tiêu vẫn active; tiếp tục phủ chức năng theo mục0.** Đã triển khai thêm:

- Xe: tạo/sửa hồ sơ bằng domain web, giấy tờ xe đã lưu/OCR có rà soát,
  timeline/audit và danh sách điều chuyển toàn hệ thống. UUID/receipt/recovery,
  pending chung với4action kho. [QA xe](qa/2026-11-03-mobile-vehicles.md).
- Cơ sở: hồ sơ/tạo/sửa/xóa có điều kiện bằng domain web, shared validation/
  default, timestamp CAS riêng với xmin receipt, giữ phiếu sau xóa thật và
  Account recovery; từ hồ sơ mở nhân sự/xe/khách với filter cơ sở.
  [QA cơ sở](qa/2026-11-03-mobile-stores.md).
- SQL nhúng xe5nhóm/cơ sở4nhóm đạt; recovery6/workspace3/pending16 đạt.
  Root/mobile types và lint mobile/targeted backend đạt (root lint bỏ qua
  shared do config). Không phải full suite hoặc deployed RLS.
- Samsung xe run5 đạt happy path/read tập trung lúc14:08 trên295file,
  giữ failed run1–4 (lỗi script cuộn/nhập nối/tra cứu/placeholder), sửa km125
  bằng update trên đúng xe8001, không reset hoặc tạo lại.1create+2update,
  work/key rỗng,0crash/ANR. Không kiểm native upload/OCR/provider trong lượt.
- Samsung source mới cho cơ sở review run2 đạt lúc14:25 trên306file; mở hồ
  sơ23/form sửa/form tạo, đóng không ghi; toàn state giữ nguyên và26checkpoint
  cũ giữ SHA, work/key rỗng,0crash/ANR. Chưa CRUD native acceptance. Run1 giữ
  failed do mapping USB mất ở guard; phục hồi đúng mapping rồi mới chạy run2.

Samsung hiện **QA xe/cơ sở8131**, USB8091→8131, Metro8081/origin8091 giữ nguyên.
Server `scripts/mobile-vehicle-fixture-server.py`, checkpoint
`.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json`.
Đã dừng process8131 cũ bằng handle và xác nhận terminal trước restart cùng
checkpoint; chỉ bổ sung field `store_workspace`, mọi field cũ khớp hoàn toàn
với backup QA. Bằng chứng `.backups/mobile-stores-qa-upgrade-20261103/`.
8130/watch8101 vẫn giữ riêng. Grant settings.write mới chỉ cho actor fixture,
không sửa DB/quyền thật. [Kịch bản hiện tại](mobile-demo-script-2026-11-03.md).

Export xe3platform đạt trước câu xác nhận cuối. Export web/Android/iOS cho
source cơ sở cuối đạt exit0 tại `.backups/mobile-stores-export-20261103-run1`,
dùng `EXPO_NO_DOTENV=1` và API placeholder.invalid; mobile types/lint cuối0.
Không là signed build/iPhone thật. Không deploy/migration/production/commit/
push hoặc thêm dependency. Tổng hợp `.backups/mobile-vehicles-stores-verification-20261103.json`.

Còn thiếu chính: ảnh xe trước metadata, action kho/nhập khách–hồ sơ, Excel/
bulk/reset; CRUD nhân sự (giữ cả đồng bộ tài khoản), drilldown hợp đồng/sổ két
cơ sở; sổ quỹ/nhắc nợ/báo cáo/quản trị và mọi action chưa phủ trong backlog.
Tiếp tục triển khai các nhóm này; full role/network/race/native/iPhone để sau
khi phủ chức năng, không giữ nhịp ở vòng kiểm sâu của lát vừa làm.

Các mốc8130/8101 và giới hạn source bên dưới là lịch sử trước cập nhật này.

## Cập nhật tiếp quản —03/11,12:56 (+07)

Đã rà23entry point và chia [các đợt triển khai](mobile-implementation-waves-2026-11-03.md).
Đã nối workspace hợp đồng/nháp/đến hạn/quá hạn/thuê sở hữu/VAT, lọc ngày/kho,
lịch trực CRUD+UUID/receipt/recovery, danh bạ nhân sự/cơ sở chỉ đọc và lối vào
demo trên Tổng quan. [Kịch bản QA](mobile-demo-script-2026-11-03.md) và
[kết quả/giới hạn](qa/2026-11-03-mobile-workspace-waves.md). Mục tiêu vẫn active.

Samsung hiện **QA demo8130**, USB8091→8130; Metro8081/origin8091 giữ nguyên.
Đã guard work/key rỗng và logout QA watch8101 trước chuyển; không reset dataset
cũ. Watch8101 vẫn giữ, không restart. Dataset demo có checkpoint riêng tại
`.backups/mobile-demo-workspace-fixture-20261103-run1/state.json`.

Native run1 thực hiện4nhóm nhưng tổng failed vì helper thu log thiếu tham số;
giữ nguyên failed evidence. Review cuối riêng đạt280file khớp/26checkpoint
không đổi/0crash-ANR/work+key rỗng, để máy Tổng quan QA. Không coi đây là
full native pass; các mục môi trường8101 bên dưới là lịch sử trước cập nhật này.

Typecheck web/mobile, lint mobile/targeted backend, checks workspace3/duty
PGlite4/API8/pending13/recovery6/access4/management11 đạt. Export3platform
trước chỉnh UI cuối; Android bundle cuối mở được qua Metro. Không deploy/
migration/ghi production/commit/push; giữ source access đang dở, native matrix
sâu chuyển sau. Một script hồi quy cũ nạp env bị offline guard chặn DB;
chi tiết QA ghi riêng, không gọi script đó đạt.

Tiếp theo phủ CRUD xe/lịch sử/danh sách điều chuyển, rồi các action quản trị/
tiền/báo cáo/Excel còn thiếu. Không dừng toàn mục tiêu tại đợt đã có smoke.

Mốc chuyển chat: khoảng12:15 (+07). Người dùng yêu cầu báo tiến độ và ghi lại
để chuyển sang chat mới. Mục tiêu toàn dự án **chưa hoàn thành**; không thu hẹp
thành phần đã có test. Đây là điểm bắt đầu mới nhất, thay cho việc dùng nguyên
handoff01/11 hoặc mốc native11:08 làm trạng thái source hiện tại.

## 0. Ưu tiên mới của người dùng —03/11,12:18 (+07)

Người dùng sắp demo với khách hàng và yêu cầu **triển khai đầy đủ chức năng/
hoàn thiện luồng demo trước, kiểm thử sâu và nghiệm thu tổng thể sau**. Đây
là thứ tự thực hiện mới nhất, áp dụng thay cho ưu tiên native từng lát bên
dưới. [Nội dung copy sang chat mới](mobile-next-chat-prompt-2026-11-03.md).

- Rà nhanh backlog23entry point, tận dụng module đồng nghiệp và triển khai
  theo các đợt phủ chức năng có đầu ra. Ưu tiên luồng demo xuyên suốt hợp đồng/
  khách/xe/ảnh/GPS, đồng thời tiếp tục các module còn thiếu trong toàn backlog.
- Trong lúc code giữ typecheck/lint/biên dịch và kiểm tra nhanh thao tác chính;
  sửa lỗi chặn chạy/demo hoặc sai nghiệp vụ nghiêm trọng ngay khi phát hiện.
  Gom full role/scope/network/race/fault/native regression vào giai đoạn sau
  khi phủ chức năng; không bắt buộc đủ chứng nhận từng lát trước module mới.
- Phần access đang sửa giữ nguyên để tiếp tục source cần cho demo. Native
  matrix sâu/fixture bổ sung của phần này chuyển thành backlog kiểm thử sau;
  không tiếp tục ưu tiên lượt test đó trước việc phủ chức năng app.
- Duy trì app Samsung chạy được, dữ liệu QA và kịch bản demo rõ ràng. Theo dõi
  riêng đã triển khai/chạy được/chưa kiểm sâu, không lấy số test làm tiến độ.
- Điều kiện done toàn dự án và các ràng buộc dữ liệu/backend ở mục1/3 giữ
  nguyên. Bản demo chưa được coi là nghiệm thu phát hành Android/iPhone.

## 1. Mục tiêu và điều kiện done giữ nguyên

Hoàn thiện app Himoto iOS/Android tại `E:/Himoto`, lấy `mobile/` làm nền và
chuyển chọn lọc module từ `E:/Himoto_MobileApp`; đủ **100% chức năng web hiện
tại theo từng vai trò**, gồm đọc/tạo/sửa/xóa/duyệt/cấu hình/nhập xuất/Excel và
mọi action con. Giữ đúng trình tự, điều kiện, mặc định, quyền/cơ sở, số tiền,
kho, trạng thái, phiếu/audit và kết quả nghiệp vụ web. UI native cho điện thoại,
rõ ràng, mượt, ổn định; không chép nguyên giao diện desktop.

Ưu tiên nhập hợp đồng–khách–ảnh và GPS, rồi tiếp tục **toàn bộ backlog**. Chỉ
done khi đủ chức năng, staging/toàn bộ quyền–cơ sở/nhiều phiên/lỗi mạng, native
Android/Samsung và signed iOS/iPhone thật, release/vận hành đã nghiệm thu.
Export iOS hoặc một nhóm test Samsung không thay các điều kiện này.

**Chưa gần done toàn dự án.** Không có phần trăm hoàn thành đủ chứng cứ, vì
action inventory23entry point chưa bóc và nghiệm thu đầy đủ. Ước50–60% trong
tài liệu01/11 là lịch sử, không là tiến độ hiện tại hoặc mức sẵn sàng phát hành.

## 2. Đọc theo thứ tự

1. Tài liệu này; sau đó `mobile/AGENTS.md` và hướng dẫn AGENTS của người dùng.
2. [Backlog hành động](mobile-action-backlog.md), [ma trận chức năng](mobile-web-parity.md),
   [roadmap](mobile-roadmap.md), [trạng thái](mobile-status-2026-11-02.md).
3. [Đánh giá tích hợp hai bản](mobile-integration-assessment-2026-11-02.md),
   [preflight backend thật](mobile-real-backend-preflight-2026-11-03.md).
4. [Thiết kế durable work](mobile-durable-draft-work-plan-2026-11-03.md),
   [QA form](qa/2026-11-03-mobile-draft-work-form.md),
   [QA transitions](qa/2026-11-03-mobile-draft-work-transitions.md),
   [QA copy qua work](qa/2026-11-03-mobile-draft-work-copy.md).
5. Đọc source hiện tại trước khi sửa. Handoff02/11 và các mục thời gian cũ là
   lịch sử/bằng chứng từng source, không tự suy rằng mọi trạng thái còn hiện hành.

## 3. Workspace và nguyên tắc bắt buộc

- Web/app chính `E:/Himoto`, nhánh `feat/mobile-foundation`, HEAD `d1ea473`
  vừa kiểm lại. Web đã pull trước đó, giữ rất nhiều sửa đổi chưa commit và
  file untracked. Không reset/clean/stash/reclone đè/commit/push/deploy.
- Repo đồng nghiệp ở `E:/Himoto_MobileApp`, baseline từng kiểm `main/c08bfb9`
  (26/10); nguồn tham khảo/chuyển chọn lọc. Không ghép nguyên backend/auth/
  lockfile cũ. Hai URL app ban đầu là cùng một repo và một thư mục con.
- Không đọc/log/sao lưu/sửa `.env.local`, không chép bí mật vào app hoặc tài
  liệu. Không tự áp migration hoặc ghi dữ liệu thử production. Backend writes
  phục vụ test chỉ trong QA tổng hợp riêng, có checkpoint.
- Mọi Expo command đặt `EXPO_NO_DOTENV=1`; build/export riêng đặt rõ
  `EXPO_PUBLIC_API_URL=https://mobile-api.example.invalid`. Không thay env của
  Metro đang chạy hoặc âm thầm chuyển QA/backend thật.
- Windows PowerShell: dùng `npm.cmd`/`npx.cmd`; file UTF8. Chạy Python chứa
  tiếng Việt qua here-string phải đặt `$OutputEncoding =
  [System.Text.UTF8Encoding]::new($false)`. Log redirect PowerShell có thể là
  UTF16; logs bàn giao mới bên dưới ghi UTF8 bằng Python subprocess.
- Không tự thêm dependency/generated native code. Expo58/RN0.88: đọc docs
  đúng SDK theo `mobile/AGENTS.md`, typecheck/lint trước tuyên bố đạt.
- Chỉ một reader UIAutomator. Freeze `mobile/`, `shared/`, scripts fixture/native
  trong native acceptance. Không chạy export nặng đồng thời UI test Samsung.
- Không reset fixture đã ghi hoặc xóa ledger để chạy lại. Giữ nguyên lượt
  lỗi; giải quyết request/work gốc qua UI/server gốc trước khi đổi fixture.
  Các fixture có thể trùng origin/actor/resourceID, đổi backend khi còn key là sai.
- Timeout quan sát không có nghĩa process kết thúc. Poll đúng session/process
  đang chạy; chỉ restart khi có chứng cứ terminal. Không có yêu cầu Telegram.

## 4. Đã có bằng chứng gì

Các mục sau là nghiệm thu tập trung, không phải full app/full roles.

| Phần | Bằng chứng / giới hạn |
| --- | --- |
| Luồng5bước hợp đồng, tìm/chọn/tạo khách, trùng hồ sơ, giấy tờ/OCR | Có source/API/browser và các lượt Samsung tập trung; còn toàn trường/default/mode/quyền, nhập bổ sung và inline customer durable work |
| GPS | Shared domain/quyền/độ mới/lịch sử/sync/mapping; Samsung run5 đạt4/4, browser5/5, chưa provider thật/staging/iPhone; `qa/2026-11-03-mobile-gps.md` |
| Ảnh hợp đồng/biển số/OCR/thứ tự upload | Có SQL/API/browser/native; chọn ảnh ký trước GPLX vẫn lưu theo nhóm web; giữ exact slot/xe/phiếu; xem QA contract-photos và contract-photo-order |
| Copy giấy tờ chỉ điền ô thiếu, xóa ảnh/CAS/replay | Dùng domain web, có SQL/PGlite và tranh chấp PostgreSQL QA thật2kết nối; native riêng đã có. Chưa migration/staging/full roles/iPhone |
| Durable work foundation | Schema/journal generation+seal+SHA/owned JPEG/planned UUID/receipt→ack→ledger; core7,321điểm lỗi, adapter/mock/disk và Samsung adapter4/4. Không chứng nhận disk-full/power-loss/cleanup |
| Form/ảnh/Account | Samsung regression run3 đạt4/4 lúc10:51 trên258file,0crash/ANR;1nháp/4ảnh/1tombstone/session0/work+ledger rỗng. Metadata lost/kill/Account originalID, GPLX lost/kill/exact photo, drop/late409; đúng xe/driver/tiền/note |
| Leave/picker/AppState | Samsung transitions run2 đạt4/4 lúc10:39 trên258file; lỗi trước copy chặn rời form/picker, retry giữ ảnh, HOME/kill/reopen khớp note/photo SHA. Không là actual disk-full hoặc iPhone deadline |
| Copy qua durable work | Samsung run1 đạt4/4 lúc11:08:51 trên259file,0crash/ANR. Có ảnh/lost/kill/Account original work; không ảnh/drop/kill/cancel/late409/resume copy. Cuối2nháp/1ảnh/2copy/8giấy tờ/1tombstone/session0/work+ledger rỗng;24checkpoint cũ giữ SHA |
| Bundle/browser/core trước sửa access |33script mobile exit0, types/lint0, export web/Android/iOS và browser hồi quy4/4 đạt ở mốc transitions; chưa phải kết quả source access hiện tại |

Bằng chứng native mới nhất đã đạt:

```text
.backups/mobile-draft-work-copy-native-20261103-run1/results.json
.backups/mobile-draft-work-copy-native-20261103-run1/source-provenance.json
.backups/mobile-draft-work-copy-final-review-20261103.json
.backups/mobile-draft-work-native-20261103-run3/results.json
.backups/mobile-draft-work-transitions-native-20261103-run2/results.json
```

**Source hiện tại đã đổi sau các lượt native trên. Không lấy4/4 cũ chứng nhận
nhánh access mới.** Snapshot/bản sao công việc hiện tại:

```text
.backups/mobile-chat-handoff-20261103/source-snapshot.json
.backups/mobile-chat-handoff-20261103/work-in-progress-manifest.json
.backups/mobile-chat-handoff-20261103/work-in-progress/
.backups/mobile-draft-work-access-before-20261103/
```

## 5. Phần đang sửa dở — tiếp quản theo ưu tiên ở mục0

Lỗi xác định: Account mở media/copy request gắn work bằng DraftEditor; editor
bắt `contracts.read` + `contracts.draft`, trong khi record-photo/copy API theo
quyền/RLS web riêng. Nếu thu hồi draft grants hoặc đổi scope thì có thể kẹt
đối chiếu/hoàn tất ảnh của metadata đã lưu. Không được thêm quyền giả hoặc tự
đổi scope/ID hợp đồng để né lỗi này.

Source đã sửa, **chưa native/browser/export/full-suite nghiệm thu**:

- `mobile/src/lib/draft-work-access.ts`: chọn form/media/held theo quyền và
  scope; metadata chưa có kết quả vẫn cần quyền/destination gốc.
- `mobile/src/lib/draft-work-media-resume.ts`: mở journal actor gốc, yêu cầu
  API review/RLS original contract trước khi đưa owned photos ra view hoặc
  settle metadata đã có phiếu; giữ original create scope khi complete key.
- `mobile/src/components/draft-work-media.tsx`, route
  `mobile/src/app/draft-work-media/[id].tsx`: hoàn tất ảnh/copy trên ID đã lưu,
  không mở metadata editor. Reuse ContractPhotoSave/CustomerPhotoCopyStage.
- `shared/mobile-contract-work.ts`, `contract-work-intent.ts`: cùng actor nhưng
  đổi cơ sở được plan ảnh/copy và finish saved work qua current review/RLS;
  metadata/bind/remove/import vẫn không tự chuyển scope, phiếu vẫn exact checks.
- `pending-writes.ts`: Account có opt-in list resource intents của cùng
  origin/actor qua scope; create vẫn destination-specific. Complete resource
  dùng exact actor/action/key; không xóa create ở cơ sở khác.
- `pending-write-recovery.tsx`, `draft-work-list.tsx`, account/route/layout:
  chọn đường media, list work cùng actor kể cả mất draft grants; token/perms/
  origin keys remount owner, list có epoch/unmount guard. Editor key bổ sung
  origin/token/permissions.
- `scripts/check-mobile-draft-work-access.cjs` mới:4nhóm thực thi helper và
  journal/controller thật trong bộ nhớ; RLS reject/wrong actor/origin/session,
  exact ID/photo/copy và original scope. Pending-scope đã thêm nhóm thứ13.
- Fixture access mới: `scripts/lib/mobile_work_access_fixture.py`, được nối
  vào contract-flow model/server; opt-in trên checkpoint mới, modes
  full/media/all-media/hidden, synthetic qa/qa-other. **Chưa chạy acceptance
  fixture mới hoặc native với overlay này.** Các server cũ giữ module đã load,
  không restart chúng chỉ vì source fixture đổi.

Kết quả vừa chạy lại trước bàn giao, logs UTF8:

```text
.backups/mobile-chat-handoff-20261103/checks.json
```

TypeScript/lint exit0; access-offline4, work-core7, controller5, pending-scope13
exit0. Mỗi check có log riêng trong cùng thư mục. Chỉ là offline checks:
**full `npm run test:mobile` chưa rerun sau access; script access chưa được nối
vào root command/CI; native access chưa viết/chạy.**

Công việc kỹ thuật còn lại của nhánh access. Xếp theo ưu tiên demo ở mục0;
không yêu cầu xong toàn bộ các bước QA này trước khi mở rộng module khác:

1. Review source access hiện tại, nhất là quyền media theo backend web,
   current-scope photo review, route khi thiếu grants, ack khi ledger removal
   trước đó lỗi, và token/owner thay giữa các await. Không suy4offline là full
   role acceptance. Metadata mất phản hồi mà chưa lưu local proof vẫn cần lối
   recovery theo quyền gốc; hiện media resume chưa giải quyết ca đó.
2. Sửa/kiểm overlay fixture: nhánh hidden đang kiểm prefix `/writes` nhưng
   API thực là `/write-requests/<uuid>/resolve`; phải khớp route trước test.
   Bổ sung session expiry/control và validation nếu dùng, kiểm đủ actor/RLS
   và mode changes; hiện overlay chưa có control forced expiry.
3. Nối offline access gate vào root mobile suite/CI paths và thêm fixture
   access vào native provenance. Hiện snapshot263file tự bắt4file product mới
   nhưng chưa bao gồm new fixture module/access test/native chưa có.
4. Viết native suite riêng, một reader và fixture mới port8130 nếu vẫn rảnh.
   Gợi ý chuỗi: full grants lưu metadata/giữ ảnh → photo drop → đổi sang
   all-media (mất draft grants) → Account thấy exact key → cancel/late409 →
   mở original work/media → lưu ảnh rồi copy lost; hidden/RLS deny giữ key;
   logout/login actor khác không thấy work/key gốc; về actor gốc/expiry/relogin
   mở phiếu copy và ack/finish originalID. Kiểm không gọi metadata writer/
   options khi thiếu grants, scope/input gốc giữ nguyên và backend không trùng.
5. Chạy types/lint/full core, fixture tests rồi freeze source và native. Chỉ
   sau kết quả thật mới cập nhật mốc QA. Export/browser regression khi product
   thay đổi; giữ logs/source SHA/APK/bundle/diagnostics. Sau native trả máy về
   QA watch8101 theo guarded opener, đừng chuyển fixture khi còn key/work.
6. Sau nhánh này tiếp tục storage repair/cleanup/performance, inline customer
   durable docs và full contract parity; không để CF-05d thay toàn bộ mục tiêu.

## 6. Android và các process giữ theo dõi

Vừa xác minh ADB `device`; Samsung SM-N960N Android9/API28,
serial `282a05859f3f7ece`, package `vn.himoto.staff`. ADB:
`E:/Android/Sdk/platform-tools/adb.exe`.

```powershell
& 'E:/Android/Sdk/platform-tools/adb.exe' -s 282a05859f3f7ece get-state
& 'E:/Android/Sdk/platform-tools/adb.exe' -s 282a05859f3f7ece reverse --list
```

USB đang8081→8081,8091→8101. App API origin `http://127.0.0.1:8091`;
host watch8101 là QA fixtureOnly, **không phải backend vận hành**. Metro8081
PID13376, watch8101 PID10548 vừa thấy còn sống. Fixture8128 PID19440 và
static8092 PID7720 còn sống; các PID/port khác phải kiểm lại, không kill hàng loạt.

Lần mở UI đã xác minh gần nhất11:10:48: hợp đồng QA cũ → ảnh/hồ sơ,
ledger rỗng; runtime
`.backups/mobile-android-watch-draft-work-copy-20261103-run1/runtime.json`.
Watch giữ1khách/1nháp/0ảnh/0copy/0delete,12phiên QA giữ chủ ý ở mốc đó. Chỉ
auth thay khi mở lại watch. Source access hiện đã đổi và Metro có thể reload;
**không tuyên bố UI/source mới đạt native từ runtime11:10**. Không có native
acceptance process đang chạy tại lúc chuyển chat; không có test access cần poll.

Không reset các dataset trước. Các checkpoint quan trọng:

```text
.backups/mobile-contract-flow-fixture-20261102/state.json          # watch8101
.backups/mobile-draft-work-fixture-20261103-run3/state.json         # accepted8128
.backups/mobile-draft-work-copy-fixture-20261103-run1/state.json    # accepted8129
```

Hai lượt lỗi form run1 và transitions run1 đã được settle qua UI gốc, giữ
nguyên failed evidence + settlement riêng. Không dùng settlement bù acceptance.
Ảnh cá nhân không bị chọn/xóa; các file QA history/owned đã giữ nguyên.

## 7. Backend vận hành chưa sẵn sàng cho app mới

Preflight trước đó chỉ đọc catalog/TLS và rollback: DB thật đang legacy
sessions, thiếu request/receipt/media tables mới. Production web từng thấy
`/login`200 nhưng API mobile session/me404; đây là quan sát lịch sử, phải
revalidate trước rollout, không suy nguồn production hiện đã bằng worktree.

Đã soạn migration chuyển tiếp session legacy/current/mixed và các migration
proof/journal/media; có SQL QA, **chưa áp DB thật, chưa deploy**. Còn exact
rollback/legacy APK compatibility/multi-connection rollout/staging validation.
Chuẩn bị thay đổi cụ thể và bằng chứng trước khi xin duyệt hành động thật;
quyền dùng cấu hình không tự cho phép schema writes/publish hoặc test production.

## 8. Các nhóm lớn còn thiếu ngoài lát đang làm

Backlog liệt kê23entry point, từng action phải đối chiếu source web mới và
quyền/domain/cơ sở. Không dùng số màn hình hoặc số test làm tỷ lệ hoàn thành.

- Hợp đồng: đủ field/default/mode/nhiều xe, nháp/xóa/lọc, nhập bổ sung,
  cọc/phát hành/duyệt/giao/gia hạn/thu–chi/trả–đổi/thu hồi/correction, lịch sử,
  media/in/xuất; workspace due/overdue/ownership/VAT/battery/types chưa đủ.
- Xe/điều chuyển/khách: CRUD và các action thực có trên web, trạng thái,
  chứng từ/OCR/lịch sử, nhập/xuất và đầy đủ phạm vi quyền.
- Dashboard/drilldown; sổ quỹ độc lập; nhắc nợ; staff-sales/shift reports;
  lịch trực; operations; quản lý nhân sự/cơ sở/tài khoản/integrations.
- Khôi phục local: actual disk-full/partial copy/generation corruption,
  repair/cleanup an toàn, ảnh cache chưa kịp giữ, hiệu năng chain/hash khi nhiều
  ảnh; inline customer/documents/OCR còn cần thiết kế/implementation riêng.
- Full staging, roles/store/actor/expiry/network/lifecycle/multiple sessions;
  camera/HEIC/video/batch theo web; signed iPhone thật và Android toàn app.
- Release/signing/distribution/update/rollback/observability/vận hành và
  nghiệm thu người dùng. Chưa có chứng cứ hoàn tất các nhóm này.

Thực hiện từng lát trọn vẹn, cập nhật action inventory và proof; tiếp tục lấy
module đồng nghiệp có ích để tiến toàn backlog. Không dừng ở việc làm nhiều
fault-test cho một lát nhỏ rồi gọi toàn dự án done.
