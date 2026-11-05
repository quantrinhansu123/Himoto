# Đổi trạng thái, pull mới và preflight DB thật — 05/11/2026

Mục tiêu Android chưa đạt. iPhone không chặn done. User đã trực tiếp chạy SQL
01/02 trên Supabase và xác nhận Success; agent hậu kiểm catalog chỉ đọc.
Chưa deploy/QA ghi nghiệp vụ thật hoặc gửi tin thật. Phần ghi thiếu schema ở
dưới lưu kết quả trước migration; ưu tiên cập nhật mới ngay sau đây.

## Cập nhật sau SQL và chốt Excel

- Ảnh tiếp theo xác nhận CLI65.11.0 đã login/Linked đúng project từ source đã
  giải nén. CLI tự tạo OIDC .env.local/gitignore, không hỏi tải env. Không đọc,
  log, copy hoặc yêu cầu user gửi file/token. Hướng dẫn chuyển sang feature
  gateProduction rồi deploy; chưa nhận kết quả hai thao tác này. Read-only
  ls-remote trước deploy vẫn mainf74c5a0, khớp gói build931file.

- Đã nối7màn Excel còn lại: Điều chuyển/GPS/pin-sạc/tài khoản/báo cáo ca/lịch
  trực/nhắc nợ. Web và mobile dùng chung cột/cell tại filtered-list-export.ts,
  actual web workbook builder; không viết writer hoặc query nghiệp vụ mới.
- Paged transfers/reminders đọc đủ trang trong1snapshot READ ONLY, kiểm tổng/
  trùng ID và fail closed khi thiếu; battery/accounts/GPS lọc toàn bộ snapshot.
  Shift giữ cap100của actualweb và ghi rõ UI; duty lọc ca vắt ngày như list.
- `check-mobile-list-export.cjs`3nhóm đạt:7workbooks mở lại,53dòng toàn trang,
  số tiền/tọa độ0numeric, leading zero/IMEI/phone/formula literal, secret không
  có trong5cột tài khoản; role/branch/fleet scope và lỗi bộ lọc/trang đầy đủ.
  `.backups/mobile-list-excel-adapters-20261105-run2.log`.
- Hồi quy GPS/battery/accounts/vehicles/debt/duty/shift đều PASS (log tương ứng
  `.backups/mobile-list-excel-*-20261105-run1.log`). Root/mobile types đạt;
  mobile lint0warning, root scoped lint0error/2shared-file ignored warnings.
- Browser375sáng/430tối:2luồng/4ảnh, export503 rồi retry,53dòng dù chỉ mount1dòng,
  file bytes exact/0page error/0network ngoài/0write. Đã xem ảnh375, không tràn
  chiều ngang. `.backups/mobile-list-excel-ui-20261105-run1/results.json`.
- Expo Android/web run2 đạt với EXPO_NO_DOTENV1/OFFLINE1 và
  EXPO_PUBLIC_API_URL=https://mobile-api.example.invalid. Run1 dùng nhầm tên
  API_ORIGIN, không dùng chứng nhận origin của lượt đó. Không đọc dotenv.
- Backend mirror931file/source unchanged/no env/offline build run3 đạt.
  `.backups/mobile-postpull-backend-build-20261105-run3/results.json`.
- Native status preview run3 trước Excel mới đã PASS4ảnh/566source/0submit/
 0crash/ANR, fork business/checkpoint gốc nguyên/reverse phục hồi. Chứng nhận
  review/hủy/giữ form, chưa chứng nhận native lưu/chia sẻ XLSX hoặc toàn app.
- User báo backup20giờ,3scope guards true,01/02 Success. Hậu kiểm trực tiếp
  `.backups/mobile-live-postmigration-20261105-run1/verification.json`:14bảng/RLS,
  grant credential/GPS owner-only, requests scoped update và proof insert-only,
  resource_key160, credential2họ/legacy giữ,3helper definer/searchpath/photo
  guards đúng.0businessrows đọc/ghi; chưa kiểm hành vi RLS bằng live nhiều vai trò.
- Vercel Project himoto/Scope congs-projects-f25af77d từ ảnh user. User đang
  làm link và yêu cầu đợi, chưa xác nhận link/deploy. Sourcebackendrun3 đã cung
  cấp, source ZIP SHA8d2b6d4b5e31ac19c29068d133cf421b1e1e86e34fe40aa0116816b08ece2378.
  Gói đầy đủ `.backups/himoto-rollout-20261105-run3.zip`, SHA
  c5498fa0a2f8afb60a8b96128e84164b566ff8cc93d1bfb8777349030db12315.
- Pointer đã cập nhật runtime sau kiểm đúng PID/port và SHAgen81, bản cũ giữ
  riêng. MetroCI cần restart/watch cho source mới trước native tiếp theo.

## Đổi trạng thái / tạo nháp từ kho

- API/native editor/review/confirm/result đã nối `applyVehicleAction` và
  `saveDatabaseDraft` actual web. Tách customer matcher thành helper dùng chung,
  giữ nguyên lock/parser/identity/blacklist/permissive semantics của writer.
- Default giữ ready/using hiện tại; trạng thái khác trống, kho vật lý làm cơ sở,
  khách/note trống. Nhánh using tạo/khớp khách rồi tạo nháp, xe vẫn ready,
  không thu tiền hoặc phiếu. Nhánh ready dùng writer trạng thái actual.
- Operation `vehicle.status:<vehicleId>` giữ numeric resource ID là ID xe.
  Proof gốc gồm actor/UUID/nháp/code/review/event và được ký HMAC, lưu trong
  audit_snapshot cùng transaction, không thêm schema mới hoặc owner connection.
  Lost response/replay đọc đúng nháp cũ. Cờ current đối chiếu xe/event/nháp riêng.
- Có pending/recovery/Account/ack và xung đột với sửa xe/4action điều chuyển/bulk.
  Có link từ hồ sơ xe đầy đủ và record. UUID giữ đến khi kiểm kết quả hoặc
  server xác nhận chưa ghi + khóa mã cũ.
- SQL5nhóm actual scoped role/RLS/PGlite đạt sau pull:
  `.backups/mobile-postpull-20261105-vehicle-status-sql-run1.log`.
  Rollback cả khách/nháp/audit/proof/UUID khi lỗi receipt, lost COMMIT/replay,
  stale khách/xe, blacklist/split identity, tiền-kho unchanged, HQ/phạm vi.
- Browser2luồng375sáng/430tối,4ảnh đạt, review-hủy/giữ form/lost commit/Account/
  original draft NHAP-10001/ack. `.backups/mobile-vehicle-status-ui-20261105-run5/`.
  Các run1–4 trước đó lỗi harness DTO/revision, assertion web aria-valuetext,
  path resolve; giữ evidence fail, không gọi các lượt đó pass.
- Pending30/recovery6/transfer9 hồi quy đạt. Native Samsung đang kiểm tập trung
  trên fork riêng8137: run1 fail vì chuỗi tên có dấu cách bị guard harness chặn;
  run2 fail do kỳ vọng chuỗi trước IME, source vẫn giữ text thực nhập. Run3
  dùng readback để kiểm giữ nội dung; chỉ khi có results.json đạt mới chứng nhận.

## Pull được người dùng yêu cầu

- `git pull --ff-only --no-rebase origin main`: d3ce3c6→f74c5a0,
  3commit/14file. Backup1.179file dirty/untracked:
  `.backups/prepull-mobile-20261105-002352/`.
-1.176file giữ byte exact;3file merge: BatteryContractsPage,
  ContractRenewalDialog, ManagementPage.2conflict block ở ManagementPage được
  review giữ export Excel incoming; shared CSV helper mobile vẫn ở module riêng.
-0mismatch/0staged/0unmerged. Không reset/clean/stash/commit/push. Pointer
  `.backups/mobile-pull-current.json` đã trỏ backup mới.
- Source mới thêm Excel theo filter ở nhiều màn, cả Điều chuyển. Nhận định cũ
  “web không có export Điều chuyển” hết hiệu lực sau pull này.
- App đã sửa giới hạn ngày bắt đầu gia hạn theo writer mới: được ghi sau hẹn
  trả mới, vẫn giữ start/completed/future bounds. Form5nhóm/web2nhóm đạt.

## Excel đã nối sau pull

-5danh mục xe/khách/hợp đồng/nhân sự/cơ sở và Sổ quỹ có XLSX theo bộ lọc,
  cùng actual web workbook builder. CSV cũ vẫn hỗ trợ ở API. Toàn trang trong
  snapshot read-only; giữ cột/nhãn/định dạng/leading zeros/literal formulas;
  Sổ quỹ giữ tiền dạng số. UI chọn cột/lưu/chia sẻ dùng file adapter hiện có.
- Catalogue5nhóm/cashbook SQL9nhóm đạt. XLSX mở lại53dòng/10phiếu và đối chiếu
  ô/money exact. Browser2luồng375sáng/430tối4ảnh tải53dòng byte-exact đạt:
  `.backups/mobile-filtered-excel-ui-20261105-run1/`.
- Còn delta Excel web mới ở Điều chuyển, GPS, pin/sạc, tài khoản, báo cáo ca,
  lịch trực, nhắc nợ. Chưa chứng nhận native xuất XLSX. Harness CSV native cũ
  cần cập nhật cho action mới, không dùng để chứng nhận Excel.

## Build và dữ liệu thật

- Root/mobile types và mobile lint cuối đạt. Next production build bản sao
 927file/source exact/0env copied/network ngoài bị chặn đạt:
  `.backups/mobile-postpull-backend-build-20261105-run2/results.json`.
 1warning estimated-sales unused import có trước. `git diff --check` toàn repo
 còn blank EOF có trước ở contract-approval.ts; không gọi toàn repo sạch.
- Export Android/web đạt, dotenv tắt/API origin giả:
  `.backups/mobile-postpull-excel-build-20261105-run1/`.
- Người dùng cho phép thử QA trên dữ liệu vận hành và cho riêng preflight nạp
  DATABASE_URL từ .env.local vào bộ nhớ. Không in/log/copy/sửa file hoặc nạp
  secret khác. Runner khôi phục process env sau chạy. Không bật Expo dotenv.
- PreflightTLS/read-only catalog0business rows/0write/0DDL xác nhận session cũ,
  thiếu13bảng mobile. Credential password-version và các bảng ca có; các guard
  helper/4policy photo khớp. Customer-source helper còn invoker, cần patch đã
  chuẩn bị. Bằng chứng mới nhất `.backups/mobile-live-preflight-20261105-run4/`.
- GET không xác thực https://himoto.vercel.app/api/mobile/v1/session vẫn404.
  Không suy DB/API sẵn sàng từ việc local build đạt.

## Gói phối hợp

- Người dùng được điều khiển Supabase/Vercel máy đồng nghiệp; đang xem tên
  Project/Team. Hướng dẫn từng bước tại `docs/mobile-remote-rollout-2026-11-05.md`.
- Gói `.backups/himoto-rollout-20261105-run2.zip`, SHA256
  `94d01aacd360a07f1756446177d8680db57d734ff8abc447322861c6b94ee346`.
  Backend source archive bên trong1.607file, không env, basef74c5a0+dirty,
  manifest SHA đầy đủ. Không deploy riêng HEAD Git vì mobile chưa commit.
- Bộ SQL ghép4prerequisite +16mobile theo2transaction.16mobile kiểm legacy/
  current/rerun/rollback ở PGlite đạt; chưa áp DB thật. Không bỏ guard khi lỗi.
  Có hậu kiểm chỉ đọc. Root source zip đóng trước các harness/docs bổ sung;
  backend src/shared đúng build2 đã chứng minh. Cần đồng bộ source vào repo dev
  web sau nghiệm thu để auto-deploy Git sau không ghi đè mất API mobile.

Checkpoint gốc vẫn gen81/SHA5771b6d…; không reset/replay. Runtime phục hồi sau
khi xác minh PID/port cũ không còn: Metro6552/8081, fixture12552/8131,
forkstatus12444/8137; health200, EXPO_NO_DOTENV1/offline. ADB reverse gốc8081→8081/
8091→8131; native harness tạm trỏ8137 và restore trong finally. Runtime Metro
đang CI nên không hot reload, lần sửa JS sau cần xử lý watch/reload có kiểm.
