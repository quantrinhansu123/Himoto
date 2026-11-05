# Preflight backend thật —03/11/2026

## Cập nhật duyệt sở hữu04/11

Mobile approval dùng actual read/approveIssuedContract trong scoped
transaction + management_mobile_requests ledger hiện có; không migration
mới. Kiểm role/cơ sở/CAS và SQL fixture4nhóm đạt, native chỉ xem/hủy xác
nhận; **chưa kiểm writer/RLS trên staging**. Không áp SQL/deploy/ghi DB
vận hành. Full edit native chưa triển khai; đối chiếu mục3
[handoff04/11](mobile-handoff-2026-11-04.md) trước nối web writer.

## Cập nhật04/11 sau pull27a87f1

Gia hạn mới dùng occurred_at làm created_at của lịch sử và ngày phiếu thu,
recorded_at lưu lúc server ghi riêng. Không migrate các receipt cũ. Thu+
gia hạn nhiều xe dùng cùng recordContractPayment, transactions và
management_contract_payments/mobile request ledger; không có migration
mới cho giờ/ngày/batch. Mỗi item revision và tổng phiếu phải khớp; giữ scope/
role/ownership-plan/returned-line/account web. SQL4nhóm mới và backfill
regression4nhóm đã kiểm trên PGlite, chưa DB staging/RLS thật.

Pull không áp bất kỳ SQL/deploy/ghi production nào; actual helper lịch sử
vẫn cần preflight schema riêng như bên dưới. [QA](qa/2026-11-04-mobile-renewal-parity-and-pull.md).

## Nhập bổ sung gia hạn/thu-chi —source03/11

Gia hạn xe đã trả cần helper web hiện hành
`extend_returned_contract_vehicle_line(bigint,bigint,text,timestamptz,bigint,timestamptz)`
và role/grant/actor/store đúng schema web. Preflight chỉ đọc đã thêm kiểm
sự tồn tại/EXECUTE/security definer/search path; chưa chạy trên staging và
không tự áp script2026-10-24. SQL4nhóm chỉ áp actual helper trong PGlite tạm.

Giữ completed_at/kho, có thể phát sinh wait_payment đúng nợ mới. Ngày gia
hạn occurred_at khác ngày phiếu thu. Bill lịch sử dùng cờ rõ ràng và vẫn
chặn finance audience tạo phiên bản tương lai. Thu/chi dùng writer/ledger
hiện hành, không migration mới cho module. Không deploy/ghi thử DB vận
hành hoặc gửi tin thật. [QA](qa/2026-11-03-mobile-backfill-flows.md).

## Tích hợp và điều hành —source03/11

Tích hợp dùng actual bảng/writer web, owner transaction chỉ sau admin gate.
Password GPS/bot token cipher/key chỉ server, request fingerprint HMAC;
không plaintext trong cache/pending/receipt. Cần schema tích hợp web hiện
hành và `management_mobile_requests.resource_key` nullable varchar160;
script review-only chưa áp. UUID GPS thật/singleton Telegram thật, checksum
cấu hình không phải xmin; job runtime không làm stale CAS giả. Không có
gửi/provider I/O khi lưu cấu hình.

Điều hành dùng scoped `readOperationsSummary` và catalogue chung; composer
lịch sử dùng writer hiện hành. SQL nhúng không thay staging/RLS/all-role
acceptance. Không tự deploy/áp schema hay thử DB vận hành. [QA](qa/2026-11-03-mobile-integrations-operations.md).

## Tài khoản / mật khẩu —source03/11

Mobile quản trị dùng cùng users/account_access/password escrow/access audit
và writer web, owner transaction chỉ sau requireAccountScope/admin. Quyền
accounts.manage legacy trên tài khoản thường không nâng quyền. Xem mật
khẩu chỉ ID145/160 theo entitlement web; mật khẩu/key/cipher ở server,
plaintext cấp/xem trả nhất thời vào UI được che, không trong cache/receipt/
ledger/audit. HMAC fingerprint dùng khóa server, không bundle secret.

Tự đổi dùng actual changeOwnPassword và trigger password_version hiện
hành; session reader revalidate status/enabled/grants/version mỗi request.
Không migration mới cho module này. Cần schema account/password/session
web đang có đúng checkpoint staging, chưa kiểm/áp schema DB vận hành.
SQL nhúng6nhóm/session trigger và native fixture không thay full RLS/
nhiều phiên/backend staging. Không reset password admin. [QA](qa/2026-11-03-mobile-managed-accounts.md).

## Loại hợp đồng / xác nhận ID chữ —source03/11

Danh mục dùng chung management_contract_types và writer web, IDvarchar80.
Mobile ledger cần cột nullable resource_key varchar160, giữ resource_id
NULL và xmin gốc cho receipt ID chữ; không đổi receipt số. Script chuẩn bị
`sql/2026-11-03-mobile-text-receipts.sql` **chưa áp**. Preflight SQL chỉ đọc
đã thêm kiểm kiểu/độ dài/nullable, thiếu cột thì chưa bật ghi/đối chiếu trên
staging. Không lấy fixture/PGlite thay bằng chứng schema DB vận hành.

Read contracts.read; write cần settings.write VÀ finance.write như web.
RLS catalogue cho scoped role đọc/chặn ghi; admin dùng nhánh pool admin
sẵn có. Không nâng scope/operation hoặc dùng owner pool riêng. SQL4nhóm
kiểm gate/domain/receipt, không chứng nhận custom role/RLS staging.
[QA và điều kiện còn thiếu](qa/2026-11-03-mobile-contract-types.md).

## Pin / sạc —source03/11

App/web cùng battery_contracts, workflow_history, transactions và mobile
request ledger hiện hành, cùng writer/validation/calendar. Không migration
mới hoặc bước đồng bộ qua DB app. Quyền draft/renew/return riêng theo web,
không thêm finance.write cho thu pin. Transaction thường giữ scope/RLS;
chỉ helper Telegram theo owner pool có kiểm actor/cơ sở/quyền như web,
secrets chỉ server. Không áp schema/deploy/ghi DB vận hành/gửi tin thật.
SQL nhúng5nhóm/Samsung3happy path không thay nghiệm thu RLS/staging;
fixture native chỉ có gia hạn chưa thu/trả/xóa mềm. [QA](qa/2026-11-03-mobile-battery.md).

## Báo cáo ca —source03/11

Web/mobile dùng cùng shift-report-domain/shift-audit-domain và shared media/
photo/Telegram handlers, cùng bảng reports/audits/media/photos/requests và
report_deliveries. Mobile thêm UUID trong management_mobile_requests hiện
có, không migration mới. PGD chốt chụp snapshot qua savepoint; analytics
lỗi không hoàn tác kiểm kê, như web. Ownership refresh app và queue outbox
trước commit; delivery sau commit theo cấu hình server, không bí mật app.
Không deploy/áp schema/ghi DB vận hành. SQL5nhóm dùng snapshot QA cố định;
Samsung2write vào portfolio mới chỉ kiểm PGD/readonly KTNB, không RLS/
analytics thực/staging hoặc gửi Telegram thật. [QA](qa/2026-11-03-mobile-shift-reports.md).

## Nhắc nợ —source03/11

Mobile dùng cùng domain/history web, cùng management_debt_reminders và
management_mobile_requests; reservation/receipt trước I/O, không có DB app
riêng. Web writer có optional reservation adapter; caller cũ vẫn dùng được.
Phụ thuộc schema nhắc nợ/webhook web hiện hành, không thêm migration/deploy.
Webhook và secrets chỉ server. PGlite5nhóm/fake provider và Samsung1tin
local giả không chứng minh gửi thật/RLS staging. Không tự gửi khách trong
phát triển. [QA](qa/2026-11-03-mobile-debt-reminders.md).

## Báo cáo thuê xe/doanh số —source03/11

API báo cáo gọi cùng9reader/domain hiện hành của web trong transaction
read-only/repeatable-read; không có DB app riêng hoặc bước chép dữ liệu.
Chỉ báo cáo đội xe dùng ngoại lệ ownerDatabase đúng entitlement145/160 của
web. Các báo cáo khác giữ actor/store/scope_all/operation. Xuất sổ thu/chi
dùng chung workbook builder với web, giới hạn10000phiếu mỗi phía như web.
Không thêm migration/ghi DB vận hành/deploy. SQL nhúng5nhóm đạt; Samsung
vẫn QA8131 với portfolio báo cáo riêng, không phải đã nối backend thật.
[QA/giới hạn dữ liệu](qa/2026-11-03-mobile-reports.md).

## Xóa phiếu sổ quỹ —source03/11

Bulk mới gọi actual `bulkDelete(transactions)` web, cùng scoped transaction
với ledger UUID. Không có SQL hoàn tác tiền riêng hoặc migration mới.
Quyền xóa settings.write theo backend web, không thay bằng finance.write.
Source ledger hiện hành cho phép actor-only receipt không có resource FK;
riêng cashbook.delete lưu count/format-version, public DTO không gọi đó là
ID/phiên bản phiếu. Xem [QA bulk](qa/2026-11-03-mobile-cashbook-delete.md).
PGlite8nhóm xác nhận domain thuê/pin/payment-proof/replay/rollback; không
phải staging PostgreSQL/RLS/multi-session acceptance. Không rollout thật.

## Sổ quỹ và tài khoản/két —source03/11

API cashbook mới gọi trực tiếp `listCashbook` và domain tài khoản chung
web/mobile, cùng bảng transactions/cash/banks/stores. SQL QA nhúng kiểm
mobile tạo két → reader web đọc cùng ID/số dư, web tạo ngân hàng công ty →
mobile đọc đúng dữ liệu. Chỉ là bằng chứng source/SQL, chưa staging/RLS
vận hành. Không có cơ chế đồng bộ bằng cách chép dữ liệu giữa hai DB.

Sử dụng ledger `management_mobile_requests` hiện có trong source; không thêm
migration riêng. Các phụ thuộc reader web gồm management_contract_payments
và các bảng hợp đồng/pin hiện hành. Không deploy/apply migration/ghi thử
production. Samsung vẫn dùng QA8131, không dùng kiểm nhúng để kết luận đã
nối backend thật. Chi tiết [QA sổ quỹ](qa/2026-11-03-mobile-cashbook.md).

## Source mới sau ưu tiên giao app —14:54 (+07)

API mobile xe/cơ sở/nhân sự hiện gọi domain web chung và cùng các bảng web,
không tạo DB riêng để đồng bộ sau. Staff writer web/mobile dùng chung
`saveDatabaseStaff`/`syncStaffAccount`; đã kiểm mobile tạo/chuyển cơ sở rồi
reader web thấy đúng ID/cơ sở trong PostgreSQL QA nhúng. HTTP dữ liệu dùng
no-store; web cần tải lại danh sách để đọc commit mới, chưa có push realtime.

Các nhóm mới dùng `management_mobile_requests` hiện có trong source, không
thêm migration riêng. Nhân sự còn phụ thuộc các bảng account/access/password/
staff links của domain web hiện hành; khóa cipher chỉ ở server. Cần kiểm
đúng dependency/schema khi rollout staging. Không có thao tác DB vận hành,
deploy hoặc apply migration trong các lượt triển khai này.

Các quan sát backend thật bên dưới là bằng chứng thời điểm cũ. Bàn giao hiện
tại yêu cầu không đọc/log/sao lưu/sửa `.env.local`; không tự lặp lại loader
cũ từ tài liệu này. Samsung vẫn dùng QA8131, không fallback dữ liệu thật.

Người dùng đã chủ động cung cấp cấu hình và cho phép dùng nếu cần. Quyền mới
cho phép nạp cấu hình phía server cho bước kiểm tra này; không đưa giá trị khóa
vào app, log, backup hoặc tài liệu. Không chép nội dung env vào đây. Cấu hình
vừa được chia sẻ trong chat nên đã khuyến nghị người dùng thay khóa.

## Đã xác minh chỉ đọc

- Kết nối qua adapter ownerDatabase hiện có, TLS/CA vẫn bật; nạp cấu hình bằng
  Next env loader với logger im lặng. Không sửa env file.
- Chạy `docs/sql/2026-11-02-mobile-schema-preflight.sql`: transaction READ ONLY,
  timeout, catalog session columns/mobile tables/RLS/grants và rollback. Thêm
  catalog constraint lookup cho mobile_record_media cũng READ ONLY.
- Chỉ đọc catalog, không đọc business rows/tài khoản/phiên/token/provider data;
  không login thật hoặc áp migration/deploy/ghi thử. Proof không chứa env:
  `.backups/mobile-real-schema-preflight-20261103.json`.
- Session schema: `legacy_requires_transition_before_current_mobile`.
  Có id/user_id, access_token_hash/refresh_token_hash, access_expires_at/
  refresh_expires_at, created_at/rotated_at/revoked_at. Bốn cột access/refresh
  đều NOT NULL. Hai bảng mobile hiện có: sessions và login_attempts, RLS bật;
  không có mobile request/receipt/media tables mới. Chưa chứng minh quyền/RLS
  nghiệp vụ hoặc tính năng mobile đã sẵn sàng.

GitHub xác nhận homepage repo web `https://himoto.vercel.app`; Production mới
nhất đã quan sát ở d1ea473 chưa có source API mobile. URL riêng deployment bị
Vercel Protection redirect login. Proof deployment có trước ở
`.backups/mobile-production-deployment-preflight-20261103.json`.

## Kế hoạch chuyển tiếp cần làm cụ thể trước rollout

1. Đối chiếu schema legacy thật với migration đồng nghiệp
   `E:/Himoto_MobileApp/Himoto/docs/sql/2026-10-25-mobile-sessions.sql` và code
   access/refresh cũ. Không chạy thẳng migration CREATE IF NOT EXISTS hiện tại:
   bảng đã tồn tại nhưng thiếu token_hash/password_version/device/platform/
   expires_at; NOT NULL legacy chặn insert của API mới.
2. Soạn migration chuyển tiếp riêng có guard schema/type, bảo toàn id/session
   cũ và index/constraint; không drop/rename bảng hoặc tự revoke phiên cũ.
   Đánh giá hai định dạng phiên cùng tồn tại và route/API rollout; đổi bảng
   thôi không chứng minh APK đồng nghiệp vẫn đăng nhập được.
3. Chạy migration/rollback và auth/login/refresh/revoke/password-version/expiry
   trên DB QA seeded legacy/current/mixed; giữ proof row/hash và kiểm quyền
   owner-only. Kiểm nhiều phiên PostgreSQL trước nếu cần thay writer/lease.
4. Kiểm dependencies/RLS/chữ ký function cho toàn bộ migration request/receipt/
   return/swap/transfer/media, gồm migration customer documents và customer-photo-copy mới. Không đọc
   dữ liệu vận hành làm fixture. Chuẩn bị thứ tự áp, rollback và build review.
5. Chỉ sau bản thay đổi cụ thể được kiểm tra mới xin duyệt bước deploy/migration
   thật nếu chưa được người dùng cho phép. Quyền dùng env không tự cho phép
   publish/API replacement hoặc schema write. Sau rollout mới xác minh bearer
   login trên staging/quyền/phạm vi rồi mở Android dữ liệu thật.

Hiện Android vẫn QA rõ nhãn; không fallback fixture âm thầm. Không tuyên bố
backend thật sẵn sàng hoặc schema current chỉ vì kết nối TLS thành công.


## Source chuyển tiếp đang chuẩn bị —03/11

Đã soạn `docs/sql/2026-11-03-mobile-session-transition.sql`, chưa áp DB thật. Đã đạt7 nhóm SQL/auth trên PostgreSQL nhúng tách biệt
cho legacy/current/mixed, rerun giữ nguyên metadata và rollback nguyên tử khi
gặp partial/type sai/nullable actor/policy lạ/row không hợp lệ. Guard legacy/current/mixed types,
giữ nguyên UUID/hash/expiry/metadata, thêm nullable cột của hai family và
CHECK bắt buộc đúng một family đầy đủ mỗi row. Không backfill/revoke/drop row.
Login limits mới tách bucket khỏi login_attempts legacy; cả ba bảng owner-only.

Rollback vận hành ưu tiên tắt feature flag/đổi lại server build, giữ additive
schema và mọi phiên đã có. Legacy SQL vẫn dùng đúng cột cũ; không drop cột/row
current để ép lại NOT NULL legacy. Điều này không chứng minh APK đồng nghiệp
hoạt động: route/DTO/token lifetime phải kiểm riêng trước rollout.

Bằng chứng: `.backups/mobile-session-transition-results-20261103.json`, test
`scripts/check-mobile-session-transition.cjs`; CI đã nối suite với PGlite.
Kiểm gồm legacy INSERT/refresh một lần theo SQL cũ, bearer hm1 hiện tại,
password_version/expiry/revoke/disabled user/rate-limit và grants owner-only.
DDL legacy fixture nguyên byte từ repo đồng nghiệp ở
`scripts/fixtures/mobile-session-legacy.sql`; không có dữ liệu thật.
Chưa chứng minh đa connection PostgreSQL, rollout route/DTO cũ, APK legacy
hoặc signed iOS; không được suy schema compatibility thành app compatibility.

## Dependency sao chép giấy tờ khách —03/11

Source CF-05b thêm journal `media.copy` và bảng proof riêng
`docs/sql/2026-11-03-mobile-customer-photo-copies.sql`, sau mobile-writes và
record-photo/RLS hiện hành. Chỉ metadata, không backfill hoặc đổi ảnh/khách/HĐ.
Default grants PUBLIC/anon/authenticated được revoke; scoped chỉ SELECT/INSERT,
RLS proof theo actor + order visibility, không cho sửa/xóa phiếu.

API dùng cùng domain copy của web sau metadata/ảnh, REPEATABLE READ/khóa order,
không rollback metadata khi copy lỗi. API/PGlite5/browser4 và Samsung3/3 tập trung đã kiểm; PostgreSQL thật5 nhóm
trên2 kết nối/4 lock observation trong DB QA đã đạt. Chưa staging/fullroles
hoặc áp migration thật. Rollout
phải có đủ proof table trước khi mở copy route/UI, giữ routes cũ để rollback
app; không xóa request/proof đã ghi. [QA copy](qa/2026-11-03-mobile-customer-photo-copy.md).

## Dependency xóa tệp hồ sơ —03/11

Thêm `docs/sql/2026-11-03-mobile-media-deletions.sql` sau mobile-writes và
record-photo/RLS hiện hành. Metadata/proof append-only theo actor + parent;
revoke public/anon/authenticated default grants, scoped chỉ SELECT/INSERT.
Không backfill/xóa ảnh thật khi áp DDL; CHƯA áp DB vận hành.

Source dùng nguyên deleteRecordPhoto và slot domain web, exact revision và
snapshot để chặn ảnh bị thay; upload/copy/delete giữ chung pending intent trên
mobile. API/PGlite5, PostgreSQL thật4 nhóm/2 kết nối/4 observed lock waits,
browser4 và Samsung3/3 tập trung đạt trong QA. Chưa full-role/HQ deployed RLS
hoặc signed iPhone. Rollout phải có proof table trước mở DELETE/receipt/UI;
rollback giữ request/proof đã ghi, không drop journal để chạy lại.
[QA xóa](qa/2026-11-03-mobile-media-delete.md).
