# Báo cáo thuê xe/doanh số —03/11/2026

## Chức năng đã nối

`/staff-sales` có10nhóm: thực thu/ước tính/công nợ; sổ thu/chi; doanh thu từng
xe và lượt thuê; tổng quan cơ sở/ngày; đội xe chủ quản; tổng quan hợp đồng;
theo NVKD; theo cơ sở; khách mới theo nguồn; phân công NVKD/TLS. Có7kỳ ngày
Việt Nam, ngày tùy chọn, cơ sở, tìm kiếm/lọc tương ứng, phân trang riêng
thu/chi và xe, mở chi tiết/hồ sơ, tiến độ tiền thuê lũy kế theo ngày.

API `/api/mobile/v1/reports/options`, `/{kind}`, `/{kind}/export` gọi trực
tiếp `rentalRevenue`, `estimatedSales`, `revenueLedger`, `vehicleRevenue`,
`rentalOverview`, `ownedFleetRevenue`, `readSalesSummary`, `staffSales`,
`newCustomersBySource` của web. Mỗi lần đọc dùng snapshot repeatable-read,
read-only, actor/scope hiện hành; không viết bảng nghiệp vụ hoặc có DB app
riêng để đồng bộ sau. Backend thật chưa deploy; Samsung vẫn QA.

Giữ các cách tính khác nhau của web: thực thu chỉ hợp đồng mở trong kỳ,
sổ thu/chi theo ngày phiếu đã duyệt, xe theo lượt bắt đầu thuê và giá trị
lượt thuê, khách mới dựa hợp đồng đầu tiên toàn thời gian. Không cộng cọc/
sửa chữa vào doanh thu thuê. Khoản chưa tách hình thức không tự phân bổ.

Quyền đọc `contracts.read`. Báo cáo đội xe chủ quản chỉ ngoại lệ đúng
`canViewOwnedFleetRevenue`: admin cụ thể145/160; không truyền quyền này cho
admin khác, không nâng scope_all/fleet hoặc đổi scope các workspace. Chỉ
reader đội xe được dùng ownerDatabase, read-only như web.

CSV theo toàn bộ bộ lọc cho xe/cơ sở-ngày/NVKD/cơ sở ghi nhận/phân công/
khách mới, giữ cột/tổng/format và escape công thức. Excel sổ thu/chi lấy cả
hai phía, giữ giới hạn10000phiếu mỗi phía từ reader web. Bộ dựng workbook
được tách từ `RevenueLedger.tsx` sang `revenue-ledger-workbook.ts` để web và
app dùng chung: hai sheet,16cột, dấu thu/chi, tổng, kiểu ô, freeze/filter/in.
Không thêm nút xuất ở các mục web không hỗ trợ hoặc chi tiết lượt thuê.

Android SAF lưu CSV UTF-8 hoặc XLSX Base64, đọc lại nội dung trước báo thành
công; chỉ dọn file vừa tạo khi thất bại. iOS chia sẻ file tạm trong thư mục
UUID riêng mỗi lần để tránh trùng tên; chưa kiểm trên iPhone thật. Web dùng
Blob/download. Không thêm dependency/native code/migration.

## Kiểm tra nhanh source/SQL

`node scripts/check-mobile-reports.cjs --pglite-path
.backups/mobile-sql-qa/node_modules/@electric-sql/pglite`:5nhóm đạt,
`.backups/mobile-reports-domain-checks.log`.

- So trực tiếp reader web: doanh thu thực thu1400, hợp đồng2, ước tính theo
  ngày·xe; actor/cơ sở/operation giữ nguyên trong context read-only.
- Sổ hai phía: thu3020, chi500, doanh thu1400; phân trang và tổng không lấy
  riêng trang đang xem. Xe301 có doanh thu lượt3400 khác thực thu1400.
- Nhóm NVKD/cơ sở, tiến độ ngày, NVKD/TLS, nguồn khách và chưa ghi nguồn có
  drilldown; tổng khách phân biệt distinct như web.
- Admin99 bị chặn đội xe trước connect, admin145 được đọc; chặn input
  lặp/đổi actor/ngày sai/quyền thiếu. Đây không phải staging RLS proof.
- CSV xuất11xe dù trang1ít dòng, escape tên `=QA Formula`; Excel mở bằng
  ExcelJS đủ2sheet/16cột, tiền mặt thu2350/chi−200, doanh thu1400, ghi chú
  `=SUM(1,2)` là text. Bảng hợp đồng/dòng xe/phiếu không đổi.

Root/mobile typecheck và lint phần liên quan đạt; kết quả bundle/native
cuối cùng được bổ sung dưới đây. Không lấy test nhúng chứng nhận RLS/
multi-session/network/native hoặc full app.

## Dữ liệu Samsung

Catalogue tạo bằng actual SQL domain trên PGlite tách biệt:
`.backups/mobile-reports-qa-20261103-run2/catalogue.json`,113scope đọc và
96scope xuất. Chỉ scope QA đã chuẩn bị mới được trả; scope khác báo thiếu
dữ liệu QA, không lấy kỳ khác hoặc số0 thay thế. Đây là hạn chế fixture,
không phải giới hạn API nghiệp vụ thật.

Checkpoint hiện có được bổ sung duy nhất manifest reports_workspace,
generation21→22, mọi field cũ giữ nguyên; backup/audit tại
`.backups/mobile-reports-qa-upgrade-20261103`. Không reset/replay mutation.
Các hợp đồng101–103/khách201–203/xe301–312 trong portfolio báo cáo riêng
khác portfolio CRUD cũ; native không mở link hợp đồng/khách qua hai bộ này.
Không dùng số báo cáo mẫu để đối chiếu với10phiếu sổ quỹ demo cũ.

## Chưa nghiệm thu

Staging PostgreSQL/RLS, toàn vai trò/cơ sở, entitlement145/160 trên thiết bị,
đa phiên/mạng lỗi/lifecycle/race, dataset lớn/XLSX giới hạn, mọi tổ hợp lọc,
biểu đồ với TalkBack, link hồ sơ thực cùng dataset, iOS Share và signed
iPhone thật, release/vận hành. Các module nhắc nợ/báo cáo ca/quản trị/Excel
và action còn thiếu tiếp tục theo backlog, không chờ full acceptance nhóm này.

## Samsung smoke hoàn tất —18:14 (+07)

`.backups/mobile-reports-native-20261103-run1/results.json`:3nhóm happy
path đạt: kỳ tháng ước tính4000/thực thu1400; xe301→lượt REPORT-101/doanh
thu3400; sổ thu/chi→phiếu chi→lưu Excel. Đã xem ảnh UI thực thu và chi tiết
lượt thuê, số/ngày Việt Nam đọc được, không có lỗi chặn demo trong các bước này.

349file trong provenance khớp; app/shared/config không thay trong lượt.
Một file QA harness đổi selector: tên báo cáo đang chọn trùng nhãn field,
Android nối selected value vào content-desc. Hai lần selector chưa đúng
được tiếp tục từ đúng màn hiện tại, không reset source/checkpoint hoặc chạy
lại mutation; `failure.xml` và `harness-selector-update.json` giữ bằng chứng.
Không lấy việc sửa harness chứng nhận thêm bộ lọc/panel chưa mở trên thiết bị.

File mới trên Samsung:
`Download/HimotoQA/Reports-20261103/HIMOTO-so-thu-chi-2026-11-01-2026-11-03.xlsx`.
9729byte,8dòng, SHA256
`8d89c0ffcd1e375d9f66e5164d696601ee482311296108683fd5a8e8c13b945c`.
Đọc bytes qua adb exec-out đúng Base64 catalogue đã trả. ExcelJS mở bản
lấy từ điện thoại: hai sheet Phiếu thu/chi,16cột,6/2phiếu, tiền mặt tổng
2350/−200, doanh thu1600/−200→1400; `workbook-audit.json`.

0crash/ANR mới, work/ledger rỗng, trả Tổng quan. Main checkpoint không đổi
trong native; audit sau xác nhận mọi field trước upgrade và26checkpoint
cũ giữ nguyên, chỉ thêm manifest báo cáo, generation21→22.
`preservation-audit.json`; Metro admin6480 và QA8131 giữ USB mapping.
Không kiểm native toàn10panel, mọi tổ hợp filter/phân trang/role/CSV và
link xuyên portfolio. Không xóa file cũ/phiếu cũ hoặc lặp mutation để test.

Export web/Android/iOS terminal exit0:
`.backups/mobile-reports-export-20261103-run1`, API placeholder.invalid,
EXPO_NO_DOTENV=1; chỉ JS/Hermes, chưa signed APK/IPA. Mobile typecheck/lint
cuối không còn warning; root types/scoped lint đạt. Tổng hợp/hashes:
`.backups/mobile-reports-verification-20261103.json`.
