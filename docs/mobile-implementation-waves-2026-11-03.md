# Triển khai mobile theo đợt — 03/11/2026

Quyết định04/11,22:04+07: chốt Android trước; bỏ iOS/iPhone khỏi điều kiện
done theo yêu cầu người dùng. Giữ mọi chức năng web/staging/Samsung/bản ký
Android/bàn giao-vận hành. Không tiếp iPhone trừ khi được yêu cầu lại.
[Scope hiện hành](mobile-android-done-scope-2026-11-04.md).

Cập nhật04/11 sau23:05+07: picker pin-sạc/Kho chung đã nối shared web/API/UI,
quick checks/browser/native Samsung riêng560file/0submit/0crash-ANR đạt;
sửa splash, APK debug mới cùng cert/419file data exact lúc nâng cấp.
[QA](qa/2026-11-04-mobile-android-battery-fleet-startup.md). Tiếp Đổi trạng
thái/tạo nháp từ kho và audit23khu vực, rồi QA tổng thể/DB-BE web/release.
App chung BE/DB/tài khoản với web; không tạo DB vận hành riêng. Gốc hiện81
chỉ refresh metadata phiên QA, nghiệp vụ nguyên theo audit. Không làm lại
export Điều chuyển riêng vì web không có action này. Các mốc dưới là lịch sử.

Cập nhật04/11,20:30+07: sơ đồ nhân sự/hợp đồng cơ sở/bulk4danh mục và
Dashboard7chỉ số/kỳ/cơ sở/CSV đã có source/API/UI/actual web semantics.
SQL directory3/bulk4/dashboard3/browser4luồng10ảnh/types/lint/export3 đạt;
chưa native/staging/iPhone ký. [QA](qa/2026-11-04-mobile-directory-bulk-dashboard.md).
Người dùng có iPhone12ProMax/iOS18.7.8, Apple Developer Program chưa có/chưa
rõ; hướng dẫn free Expo Go và bản ký được lưu riêng, chưa cloud upload.

Cập nhật04/11,19:45+07: import nháp hợp đồng/Telegram hợp đồng-điều chuyển/
pending30/KTNB xem-clipboard-TXT đã có source/API/UI/UUID/recovery. SQL/browser/
types/lint/export3nền tảng đạt theo QA từng cụm.0tin thật/chưa native mới/
staging/signed iPhone; clipboard thêm module cần binary mới. Đợt5 tiếp cơ sở/
nhân sự/Excel-batch/action con23khu vực, không làm lại import/video/full edit.
[QA import](qa/2026-11-04-mobile-contract-import.md),
[QA Telegram/KTNB](qa/2026-11-04-mobile-telegram-and-ktnb-export.md).

Chuẩn nghiệp vụ hiện tại: web `d3ce3c6` sau pull mới04/11 + worktree hiện tại. Giữ toàn bộ thay đổi chưa
commit. QA hiện tại riêng biệt; không deploy, migration hoặc ghi production.

Cập nhật04/11,18:40+07: video ca180s đã khép source/API/UI/player/review/
UUID/recovery, SQL actual5nhóm và browser2luồng đạt. Delta giá xe/thumbnail/
hợp đồng xe/nguồn khách Tên _Phòng-TLS đã nối source, SQL xe8nhóm đạt.
Goal chat mới active. Tiếp import hợp đồng/Telegram/action con23khu vực;
chưa native/staging toàn cụm, không coi export là signed release.
[QA cụm mới](qa/2026-11-04-mobile-shift-video-and-web-delta.md).

Ưu tiên phủ chức năng/demo trước, kiểm thử sâu sau. Mỗi dòng dưới là phạm vi
cần hoàn thiện, không phải chứng nhận parity. Không công bố phần trăm từ số màn.

| Đợt | Khu vực trong 23 entry point | Đầu ra cụ thể và phần thiếu |
| --- | --- | --- |
| 1 — Demo và workspace hợp đồng | dashboard; customers; contracts; contracts/drafts; contracts/due; contracts/overdue; contracts/ownership; contracts/vat; gps | Đường đăng nhập → tổng quan → tìm/tạo khách → 5 phần hợp đồng → nhiều xe/chi phí → giấy tờ/ảnh → lưu/mở đúng ID → GPS. Bổ sung workspace dùng scope/phép tính web, tìm kiếm/lọc/cơ sở/ngày/phân trang và mở action hồ sơ. Tiếp tục full trường/default/mode/xóa nháp/nhập bổ sung/correction/lịch sử/in/xuất. |
| 2 — Xe và vận hành cơ sở | vehicles; vehicles/transfers; duty-roster; staff; stores | Tạo/sửa xe/giấy tờ/lịch sử; danh sách điều chuyển toàn hệ thống + 4 action đã có; tuần/ngày/cơ sở lịch trực và CRUD có revision/chặn trùng; danh sách/hồ sơ/CRUD nhân sự và cơ sở. Tham khảo module đồng nghiệp, dùng domain/auth/DTO hiện tại. |
| 3 — Tiền và báo cáo | cashbook; debt-reminders; staff-sales; shift-reports | Sổ quỹ độc lập/phiếu thu chi/tổng đối chiếu, ngân hàng/két CRUD/trạng thái/lịch sử, bulk phiếu/chọn theo filter/xuất; nhắc nợ soạn/gửi/theo dõi đúng quyền (không tự gửi khi phát triển); các báo cáo doanh số; lập/nộp/duyệt ca và bằng chứng. |
| 4 — Sản phẩm và quản trị | contracts/battery; contracts/types; operations; accounts; integrations | Toàn vòng đời pin/sạc; loại/mẫu hợp đồng; từng công cụ vận hành; tài khoản/role/scope/khóa; cấu hình tích hợp/kiểm tra theo domain, bí mật chỉ phía server. |
| 5 — Khép kín toàn bộ action | Cả 23 khu vực | Excel nhập/xuất, lịch sử/correction, in/chứng từ, các action con chưa phủ; đối chiếu tiền/kho/trạng thái/audit và quyền/cơ sở với web. |
| 6 — Nghiệm thu và phát hành | Toàn app | Staging đủ vai trò/cơ sở, nhiều phiên/mạng yếu/race/fault/lifecycle; Android/Samsung thật; bản Android ký/release/vận hành/khôi phục. iPhone đã được người dùng bỏ khỏi gate. Chỉ done sau khi có bằng chứng đầy đủ. |

## Trạng thái tiếp quản

Sau pull18:10/04-11:7commit/33file,1.065file local được giữ (1.060exact/
5merge sạch). Slot ảnh xe/ngày gia hạn trống đã nối source/kiểm nhanh;
video ca180s có server/API/hook đang dở, thiếu editor/router/player và SQL
video ca mới. Tiếp cụm này rồi delta web giá xe/thumbnail/hợp đồng xe/nguồn
khách, import hợp đồng/Telegram/action con. Types/lint/export3nền tảng đạt;
chưa native mới/staging, SQL vehicle-photo chưa áp DB. Samsung nhận lại,
Metro18372/QA7944,gen80 nguyên; kiểm lại PID lúc tiếp quản. Goal tool hiện
usageLimited, mục tiêu chưa hoàn tất. [Handoff](mobile-handoff-2026-11-04.md),
[QA](qa/2026-11-04-mobile-pull-d3ce3c6.md). Các mốc sau là lịch sử.

Mốc13:01/04-11, đẩy nhanh bàn giao theo cụm: direct MP4 CloudFly và hồ sơ
gia hạn/phiếu/đổi pin đã có source/API/native/actual parser-writer/CAS/UUID/
recovery/permissive next versions. SQL8/adapter2/types/lint/export3/browser
2luồng8ảnh đạt; chưa native ghi mới. Samsung gen80/26checkpoint giữ, không
install/clear/reset. Tiếp video ca180s, import hợp đồng, Telegram/action con,
rồi khớp DB/BE web staging và nghiệm thu sâu toàn thể. [QA](qa/2026-11-04-mobile-direct-video-history.md).

Video lập/giao/trả xe có source/API/native authenticated range player và
chọn/quay/review/phiếu/CAS/UUID/recovery, actual writer Cloudinary→Cloudinary/
CloudFly,45MiB/60s. SQL4/types/lint/export3nền tảng/browser2luồng6ảnh đạt.
Samsung phát hết/phát lại sau sửa ended→idle/mở-hủy picker: audit cuối
12:35:43 exit0/521file exact/0crash-ANR/26checkpoint/gen80 nguyên/QA7-ledger
rỗng;0upload-submit. Hai run gốc lỗi accessibility, không gọi full harness đạt.
Tiếp direct CloudFly MP4/gia hạn/ca/Telegram, import hợp đồng và action con.
QA mới: [video](qa/2026-11-04-mobile-record-video.md).

Cập nhật04/11 chat goal active: full edit, correction cọc/gia hạn/trả xe,
lifecycle6action đã có API/native/actual domain; Samsung4đợt preview/hủy
đạt,0submit. Tiền/ngày thuê, lịch sử/phiếu, thời hạn sở hữu, xóa nháp:
SQL4+2/types/lint/export đạt; Samsung485file/6màn/audit nối tiếp exit0,
generation77/26checkpoint giữ. In/PDF/QR và nhập Excel khách có source,
SQL5/2/4nhóm/types/lint/export đạt. APK mới build/chữ ký đạt, chưa cài vì
mất USB. Xuất CSV5danh mục và khớp cơ sở Excel/stream/batch/partial/CAS/
UUID đã có source; SQL3/stream3/adapter4, browser6luồng đạt,0pageerror.
Excel xe sync/replace/reset/backup/normalized có source/API/native, SQL4/
web6/types/lint/export/browser4luồng đạt. Samsung install-r cùng live cert/
342file nguyênSHA lúc11:37:40. Samsung7ảnh/512source/audit nối tiếp exit0
lúc11:52:17,0crash-ANR,PDF1trang/share-in mở-hủy/picker mở-hủy/resetblocker.
0import/xóa/tiền,gen80/auth-only/26checkpoint/QA7-ledger rỗng.
Đợt5 tiếp import hợp đồng/action con; đợt6 chưa nghiệm thu.
Các mốc tiếp quản dưới là lịch sử, không phải danh sách source hiện còn thiếu.

Chốt04/11 lúc02:45: đợt5 đã nối duyệt sở hữu sau phát hành (actual web
reader/writer, role/scope/CAS, actor, UUID/recovery). SQL4/regression8/types/
lint/export đạt; Samsung447file/0crash-ANR, chỉ preview/hủy xác nhận, không
submit. QA7/Tổng quan/work-ledger rỗng, generation71/26checkpoint giữ.
**Hạng mục tiếp: full edit native**, không đồng nhất với duyệt.
[Bàn giao04/11](mobile-handoff-2026-11-04.md),
[QA](qa/2026-11-04-mobile-issued-approval.md).

04/11 đã pull11commit/bảo toàn846file (840exact/6gộp3chiều). Đợt5 gia hạn
đã thêm giờ/ngày/số kỳ/đơn giá, actual date nổi bật và thống nhất ngày phiếu
theo web mới; thu+gia hạn nhiều xe một phiếu/UUID/CAS/recovery,50xe/phân
trang25/hẹn riêng/tiền riêng. SQL4/pure3/regression/types/lint/export đạt;
Samsung run2 đạt3nhóm màn hình/441file/0crash-ANR lúc02:27, QA7/work-ledger
rỗng/toàn state64/26checkpoint giữ, chưa native gửi tiền/bill. Web mới full edit/duyệt/correction/ngày-thu/
bảo lưu tiếp tục nằm trong scope, chưa coi pull là native parity.
[QA](qa/2026-11-04-mobile-renewal-parity-and-pull.md).

Nhập bổ sung đợt4/5 đã có ba nhánh hợp đồng/gia hạn/thu-chi lịch sử:
actual web reader/writer/helper/bill/phiếu/UUID/recovery, occurred_at riêng
ngày thu, phí khác/VAT/thu ngoài/note chung; giữ kho và completed_at đúng
web. SQL4/pure4/regression/types/lint/export đạt; Samsung run2 đạt3nhóm
màn hình/435file/0crash-ANR lúc23:25, QA7/work-ledger rỗng/toàn state63/
26checkpoint giữ. Chưa native financial-write acceptance. Còn batch gia hạn trong
dialog thu/chi, đơn vị giờ/ngày/đơn giá đầy đủ và action/in/Excel/correction/
video ở đợt5. [QA](qa/2026-11-03-mobile-backfill-flows.md).

Đợt4 tích hợp/điều hành đã có source/API/UI: actual web GPS/bot/nhóm hai
tuyến sở hữu/cipher server/UUID/CAS/recovery; quầy5công cụ/tổng scoped/
active-renewable/tìm hồ sơ. Composer nhập lịch sử đang thuê/đã trả, shared
validation và local work theo mode. SQL4+3/workspace3/form4/pending25,
types/lint đạt; Samsung continuation run4/5 đạt3nhóm/430file/3UUID-ack lúc
22:54,0crash/ANR/work-ledger rỗng/QA7, giữ26checkpoint. Export ba nền tảng
exit0. Tiếp tục đợt5 action/in/Excel/
correction còn thiếu; chưa nghiệm thu toàn đợt4. [QA](qa/2026-11-03-mobile-integrations-operations.md).

Hai nhánh gia hạn bị quên và thu/chi lịch sử đã nối trong cập nhật phía trên;
chưa native ghi tiền/full staging acceptance. Tiếp tục action còn thiếu.

Tài khoản đợt4 đã nối source/API/UI CRUD mềm/role/scope/grants/khóa-mở/
credentials một lần/reveal riêng145/160; tự đổi password cá nhân, version/
session cùng web, UUID/recovery. SQL6/staff4/auth-client/pending24/recovery6
đạt; Samsung5write/ack/3happy path được audit chỉ đọc xác minh22:03,
0crash/ANR/QA7/Tổng quan; không replay. Native self-change/file/share/full
acceptance còn thiếu. Tiếp tục tích hợp/vận hành/action. [QA](qa/2026-11-03-mobile-managed-accounts.md).

Loại hợp đồng đợt4 có source/API/UI đọc/tạo/đổi tên/ẩn-hiện, shared web
writer/validation/snapshot cũ/immutable billing-term; inline composer tạo/
chọn sau ack, receipt ID chữ/CAS/UUID/recovery. SQL4nhóm/web3/pending23/
recovery6; Samsung3happy path/400file/5request đạt20:48. Cột resource_key
staging chưa áp, toàn nghiệm thu còn thiếu. Tiếp tục tài khoản/tích hợp/
vận hành/action, không chờ full matrix danh mục. [QA](qa/2026-11-03-mobile-contract-types.md).

Pin/sạc đợt4 có source/API/UI vòng đời lập/sửa/prefill/tiền thuê-cọc/gia
hạn/thu từng phần/trả/xóa mềm/history/Telegram/UUID/recovery bằng domain
web. SQL5nhóm/pending22, Samsung3happy path/392file/3request đạt20:18.
Còn in/xuất mẫu/picker CCCD-SĐT-NV/đổi pin xe điện và nghiệm thu sâu;
tiếp tục loại hợp đồng/quản trị/action, không chờ full matrix pin.
[QA](qa/2026-11-03-mobile-battery.md).

Báo cáo ca đợt3 có source/API/UI PGD nháp/chốt/kiểm kê/tự điền DB/thuê sở
hữu; ảnh6nhóm, KTNB đối soát/nháp/xác nhận, outbox Telegram/trạng thái/thử
gửi bằng domain/handler web chung. SQL5nhóm và Samsung3happy path/376file/
2request đạt19:42; còn video/copy-export KTNB và full acceptance. Tiếp tục
pin/loại hợp đồng/quản trị, không chờ full matrix nhóm này. [QA](qa/2026-11-03-mobile-shift-reports.md).

Nhắc nợ đợt3 đã nối lịch sử/picker đến hạn/soạn/bulk/rà/gửi/receipt/recovery
bằng domain web; SQL5nhóm/Samsung3happy path với1tin giả đạt19:18. Không
gửi Zalo thật, không chờ full module acceptance trước báo cáo ca/quản trị.
[QA/giới hạn](qa/2026-11-03-mobile-debt-reminders.md).

Đợt3 tiếp theo: báo cáo thuê xe/doanh số10nhóm đã nối source/API và UI,
7kỳ ngày Việt Nam, lọc/phân trang/drilldown/tiến độ ngày, CSV toàn kết quả và
Excel sổ thu/chi dùng workbook chung web. SQL nhúng5nhóm, Samsung3nhóm
happy path/Excel hai sheet đạt18:14; export web/Android/iOS exit0. Phần thiếu ghi
trong [QA báo cáo](qa/2026-11-03-mobile-reports.md).
Nhắc nợ/báo cáo ca và quản trị tiếp tục, không coi đợt3 hoàn tất.

Đợt3 đã triển khai sổ quỹ phân trang/lọc/tổng bằng reader web và tài khoản
ngân hàng/két tạo/sửa/trạng thái/xóa có điều kiện/lịch sử/số dư bằng domain
web chung; CAS/UUID/recovery. CSV toàn bộ theo filter dùng formatter web.
SQL nhúng8nhóm có mobile↔web đọc cùng dữ liệu, CSV và actual bulk hoàn tác
tiền. Bulk phiếu/chọn theo filter đã nối, batch500/UUID/receipt/recovery và
settings.write đúng backend web. [QA](qa/2026-11-03-mobile-cashbook.md),
[QA bulk](qa/2026-11-03-mobile-cashbook-delete.md).
Chuyển tiếp báo cáo/quản trị; không coi đợt3 hoàn tất sau phần này.

Nhân sự tiếp theo đã có CRUD có điều kiện/trạng thái/nghỉ việc/tái làm và
đồng bộ tài khoản trong domain web chung; mobile→web reader trên PGlite và
Samsung happy path3nhóm trên318file đạt lúc14:54. Sơ đồ tổ chức/Excel và
nghiệm thu toàn thể còn thiếu; chuyển tiếp các module tiền/báo cáo/quản trị.

Cập nhật tiếp: xe có tạo/sửa hồ sơ, giấy tờ/OCR, timeline và lịch sử điều
chuyển toàn hệ thống; cơ sở có CRUD theo domain web, timestamp CAS/UUID/
receipt sau xóa/Account recovery và liên kết nhân sự/xe/khách theo cơ sở.
SQL xe5nhóm/cơ sở4nhóm đạt. Samsung xe run5 đạt smoke tập trung trên295file;
source tiếp tục đổi cho cơ sở, không lấy lượt đó chứng nhận source mới.

Đã triển khai trong lượt này: workspace hợp đồng/nháp/đến hạn/quá hạn/thuê sở
hữu/VAT và lọc ngày/kho; tạo/sửa/xóa mềm lịch trực kèm revision/UUID/xác nhận/
recovery; tra cứu nhân sự/cơ sở; các lối vào demo trên Tổng quan. Đây là phần
đầu của đợt1/2, chưa hoàn thành toàn bộ các đợt đó. Chi tiết kiểm chứng và lỗi
QA harness được ghi riêng; không gộp các lượt tập trung thành full app pass.

- Demo nền đã có source: đăng nhập, danh mục khách/xe/hợp đồng, tạo/sửa khách,
  hợp đồng 5 phần, picker xe/lịch, ảnh/OCR/copy/xóa, durable work và GPS.
- Phần access đang dở được giữ nguyên; native matrix sâu chuyển đợt 6.
- Các module bản đồng nghiệp dùng Expo 57/auth/DTO khác; chỉ chuyển có chọn
  lọc vào Expo 58/session/domain hiện tại. Không gộp backend/lockfile.
- Bằng chứng các lượt cũ không chứng nhận source sau thay đổi mới.

## Kiểm tra trong lúc triển khai

Typecheck/lint/biên dịch và thao tác chính; kiểm logic riêng cho phép tính,
quyền hoặc mutation mới. Không chờ bộ hồi quy sâu trước module tiếp theo.
Duy trì Samsung trên QA đang được bàn giao mới nhất (xe/cơ sở8131, USB8091→8131;
demo8130 và watch8101 giữ riêng). Dữ liệu cũ giữ nguyên; không reset
fixture/ledger hoặc đổi server khi còn thao tác chưa đối chiếu. Chi tiết theo
[backlog](mobile-action-backlog.md) và [QA xe](qa/2026-11-03-mobile-vehicles.md).
