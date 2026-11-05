# Khách trùng trong hợp đồng — 02/11/2026

Đang triển khai CF-04. Phạm vi lát này: phát hiện trùng, xem/dùng đúng hồ sơ,
sửa tại chỗ trong phạm vi được cấp; giữ form hợp đồng và đối chiếu UUID trước
khi chuyển hồ sơ. Phần giữ/chuyển ảnh chờ CF-05, không đánh dấu CF-04 hoàn tất.

## Thay đổi

- Tách `CUSTOMER_EXISTS` khỏi `CUSTOMER_CONFLICT` (revision cũ), giữ chung domain
  web. Không đổi ưu tiên giấy tờ rồi điện thoại của writer web.
- API bearer POST `/api/mobile/v1/customers/matches`: exact giấy tờ/điện thoại,
  không nhận scope tự khai, tối đa10 kết quả/hasMore; projection phục vụ hợp đồng.
  Exact lookup liên cơ sở như web; chỉ đọc trong repeatable-read transaction.
  Reload theo ID vẫn qua scopedConnect/RLS; `canEdit` theo admin/scope/cơ sở.
- Xem hồ sơ trùng, quay lại giữ form; hồ sơ ngoài cơ sở không có nút sửa. Chọn
  dùng hoặc mở sửa phải đối chiếu/hủy UUID tạo cũ và tải lại hồ sơ khớp.
  Nếu UUID đã commit, hiện đúng kết quả gốc thay vì chuyển sang hồ sơ khác.
- Sửa hồ sơ có sẵn trong modal dùng chung; xác nhận rời form, revision, lost
  response và receipt được giữ; hồ sơ mới nhất trả về đúng hợp đồng đang nhập.
- Client bind response vào identity/ID; ẩn dữ liệu nếu quyền đọc/sửa bị mất.

## Kiểm tra trước native

- Web/mobile typecheck, mobile lint: terminal exit0.
- `npm.cmd run test:mobile`:23 script, terminal exit0;
  `.backups/mobile-duplicates-unit-20261102.log`.
- Match API/client6 nhóm; cùng6 nhóm chạy PostgreSQL in-memory PGlite với
  scopedConnect và RLS thật: `.backups/mobile-duplicates-sql-20261102.json`.
  Chặn request sai quyền/body/size/scope trước DB, exact liên cơ sở readonly,
  ID reload theo quyền, giới hạn10, dedup, rollback/release và response binding.
- Durable duplicate model4 nhóm/restart và hồi quy contract model4 nhóm đạt.
  UUID/checkpoint ngẫu nhiên mới, không reset dataset đã ghi.
- Browser khách trùng7/7, 0 page error/host ngoài:
  `.backups/mobile-duplicates-browser-20261102-run2/results.json`.
  Run1 failed0 do harness dùng role radio thay vì button, chưa ghi; sửa harness.
- Browser hợp đồng15/15 và nền/khách hàng35/35 source hiện tại:
  `.backups/mobile-duplicates-draft-regression-20261102/results.json`,
  `.backups/mobile-duplicates-regression-20261102/results.json`.

## Native source cuối — terminal 00:13 ngày 03/11

Samsung SM-N960N Android9/API28, package `vn.himoto.staff`: **3/3 tập trung**,
189 file source/QA khớp, 0 crash/ANR/SystemUI ANR mới. Kết quả:
`.backups/mobile-duplicates-native-20261103-run2/results.json`.

Một lượt liên tục kiểm xem khác cơ sở/giữ form, resolver và fresh lookup lỗi,
hủy UUID trước chọn khách có sẵn, modal sửa trong phạm vi với hủy có xác nhận,
mất phản hồi sau sửa và dùng đúng snapshot mới cho hợp đồng. Fixture mới8103/
`.backups/mobile-duplicates-fixture-20261103/state.json`: 0 khách tạo, 1 sửa,
2 nháp đúng ID/xe/số giấy/tiền; ledger rỗng/logout, session0. Không ghép failed
run. USB restore chính xác về8081→8081 và8091→8101; checkpoint watch8101 và
transfer/recovery/media cũ giữ SHA trong lượt test.

Lượt đầu `.backups/mobile-duplicates-native-20261102/` failed sau1 nhóm do lỗi
đối chiếu nằm ngoài viewport. 0 khách/nháp/sửa. Đã sửa product cuộn tới lỗi và
announce trợ năng, view chi tiết cũng cuộn tới lỗi. UUID cũ được hủy qua Tài
khoản, ledger rỗng/logout; proof `settlement/results.json`. Giữ checkpoint8102,
không reset/xóa ledger. Browser source cuối7/15/35 đạt sau sửa:
`.backups/mobile-duplicates-browser-final-20261103`,
`.backups/mobile-duplicates-draft-final-20261103`,
`.backups/mobile-duplicates-general-final-20261103`.

iOS/Android Hermes + web export source cuối đạt tại
`mobile/.expo/customer-duplicates-final-qa-20261103`;189 file vẫn khớp native
trong `.backups/mobile-duplicates-final-source-verified-20261103.json`.
Web release44 suite đạt, types/lint mobile đạt; backend lint0 lỗi/1 warning
`emptyEstimatedSales` ở estimated-sales.ts đã có từ trước và không sửa. CI YAML
parse đạt; đã nối match unit/PGlite/journal/browser vào workflow, chưa chạy
GitHub Actions từ remote. Đây không phải signed iOS/
iPhone hoặc full app acceptance.

Fixture theo dõi8101 đã restart với full state/digest/generation9 giữ nguyên;
chỉ sau khi xác minh mới append2 hồ sơ QA trùng, mọi state cũ/receipt/UUID giữ
nguyên. Proof `.backups/mobile-duplicates-watch-restart-20261103/results.json`.
Không reset1 khách/1 nháp QA cũ. Runtime theo dõi mới được ghi riêng trong
`.backups/mobile-android-watch-20261103/`, không cộng vào3 nhóm native.
App mở ở hợp đồng mới, ledger rỗng,2 phiên QA active; giữ USB8081→8081 và
8091→8101. Runtime riêng, không phải dữ liệu vận hành. Preservation335 file
công việc ngoài25 path đổi có chủ đích (gồm3 pull merge) giữ hash;0 unexpected
trong `.backups/mobile-duplicates-preservation-20261103.json`.

## Backend vận hành

GitHub API đã xác nhận homepage của repo web là `https://himoto.vercel.app`.
Deployment Production mới nhất `7494158381` thành công với commit `d1ea473`.
URL riêng deployment bị Vercel Protection chuyển sang login; HTTP200 sau
redirect không phải mobile API200. Public homepage có mobile404 theo probe
trước; `git ls-tree d1ea473 -- src/app/api/mobile` rỗng, API mobile vẫn là
source chưa commit/deploy tại máy. Proof chỉ đọc:
`.backups/mobile-production-deployment-preflight-20261103.json`.
Chưa xác minh schema DB thật, signed iOS/iPhone, staging/full roles/full app.
Không đọc env, deploy/migration hoặc ghi thử production.
