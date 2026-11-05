# Thu hồi vật lý nợ xấu — writer, editor và phục hồi

Đã có preparation/preview readonly, writer atomic, immutable original proof,
resolver/tombstone, device pending ledger, Tài khoản và editor3 bước. Ordinary
return vẫn chặn bad_debt. Mục tiêu app vẫn active; Samsung thu hồi đã có lượt
10/10 tập trung, chưa phải nghiệm thu toàn app/iPhone hoặc backend production.

## Samsung run5 — kết thúc lúc 16:54 ngày 02/11

Run5 bộ8200 **10/10 tập trung**, 0 crash/app ANR/SystemUI ANR, 165 file source/QA
khớp trước/sau. Gồm picker/phân trang/note, review hủy không ghi, phiếu gốc,
ownership/settled, lost response + đổi scope/force-stop/Tài khoản, tombstone/
late409, stale revision và khóa pending chung trả–đổi–thu hồi, restore/logout.
Runner PID16644 đã kết thúc; verdict cuối là
`.backups/mobile-recovery-native-20261102-run5/results.json`
(mode focused-bad-debt-recovery; logger generic in `full` trước wrapper).

Đối chiếu sau chuyển chat: `verified-after-handoff.json`, `fixture-final.json`,
`source-provenance.json`, diagnostics và screenshots cùng thư mục. Journal8098
có10 phiếu =4 phiếu bộ8100 cũ +6 phiếu mới;3 tombstone8205/8206/8207,0 phiên QA
active. Phiếu cũ/checkpoint8097 không đổi, ledger rỗng/logout. USB reverse được
restore đúng mapping trước lượt là rỗng, đã kiểm `adb reverse --list`.
Không reset dữ liệu hoặc chạy lại bộ8200. Source được giải phóng sau đối chiếu;
phần điều chuyển sửa sau mốc này cần bằng chứng riêng.

## Writer/editor và kiểm chứng mới

- POST /contracts/:id/recoveries khóa order + selected line, recompute snapshot,
  gọi shared recordBadDebtRecovery trong cùng tx và bảo đảm tiền/cọc/cashbook
  không đổi. Lưu original actor/date/note/event/line/financial fingerprint trước
  parent ack. Migration mobile-recoveries mới chỉ nằm trong repo, chưa deploy.
- GET /recoveries/requests/:key đọc proof của actor theo normal order RLS,
  original sống qua corrections/soft-delete; item/history/money/contract current
  flags độc lập. Không gán xe chắc chắn lưu kho từ các hires visible.
- return.recover dùng chung resolver/tombstone và reserveExclusive với
  return.record/swap trên cùng hợp đồng. UUID giữ qua scope/process restart,
  Account mở đúng phiếu gốc; không tự resubmit/đổi key khi lỗi chưa rõ kết quả.
- Editor chọn xe, picker ngày/giờ Việt Nam, note<=1000, review before=after,
  explicit confirmation. Browser10/10 run3, return9/9 và swap10/10 cùng source;
  light/dark375/430/landscape/tablet có screenshot, target>=48, không overflow.
  .backups/mobile-recovery-editor-ui-20261102-run3/results.json;
  .backups/mobile-recovery-{return,swap}-regression-ui-20261102/results.json.
- Sau pull ac4b189, SQL108/mobile146 nhóm21module/release44/44, types/lint đạt.
  Backend QA595 file khớp/noenv/network blocked, proof
  .backups/mobile-postpull-recovery-backend-verified-20261102.json.
  Export iOS/Android/web137 file unchanged: .backups/mobile-recovery-editor-export-20261102-run2.log.
  Browser/SQL/export không chứng nhận native thu hồi, RLS deployed hoặc nhiều phiên.
- Durable fixture8098 riêng, không reset fixture cũ; journal9 nhóm có HTTP
  stop/start thật, actor/scope, proof/tombstone, failed atomic replacement và
  corrupt digest. .backups/mobile-recovery-journal-results.json.
  Native run5 đã có verdict10/10 ở phần trên; giữ mọi checkpoint/phiếu/tombstone.

Các phần dưới giữ lịch sử các mốc domain/readonly trước writer/editor.

## Native tại thời điểm chuyển chat

Run5 đang live lúc16:44 ngày02/11: PID16644/session34244, bộ8200, output
.backups/mobile-recovery-native-20261102-run5/. Đã log4 nhóm của lượt mới,
chưa có verdict cuối. Đọc runtime/results trước khi chạy thêm hoặc sửa source.
Capture165 file source/QA trên APK ARM64 f28d864c55f6a1ba9eebb2ebb5e7bb4368bdb6b494140d74624c5b8bef6747c0.
Metro8081/fixture8098 giữ live; không mở lại fixture cũ giữa lượt.

Run1/2 lỗi harness tìm tiêu đề offscreen bằng helper control, chưa ghi; run3 đạt4
nhóm rồi ca socket-loss được Android tự replay cùng UUID/nhận đúng phiếu, nên
chưa kiểm pending. Không ghép kết quả. Giữ4 phiếu cũ; server đã restart exact
checkpoint, sửa ca lỗi thành HTTP503 sau commit và append bộ8200. Run4 ack đúng
phiếu8104 cũ trước lượt mới, sau đó dừng trước ghi mới vì helper replace đọc hint
tìm kiếm là text. Run5 dùng nút Xóa tìm kiếm và kiểm ID thực, không nới helper
xoá chung. Bàn giao/runtime có chi tiết proof/key/PID; không reset bất kỳ bộ nào.

## API readonly mới

- GET /api/mobile/v1/contracts/:id/recoveries: 25 dòng/trang, dòng còn giữ xe
  trước lịch sử. Cùng contracts.read/contracts.return và scope hợp đồng của
  web; không scope_all/fleet_read override. Không yêu cầu quyền tài chính.
- POST /recoveries/preview không Idempotency-Key: contract/item revisions,
  ngày thu hồi theo phút giờ Việt Nam và ghi chú <=1000 dùng parser domain
  chung. Kiểm actual>=rent_at, chưa hoàn tất dòng, bad_debt và plan/cutoff hợp lệ.
- Repeatable-read/readonly transaction, không cấp UUID/sequence hoặc lưu rows.
  Snapshot bind input đã normalize, composer/ledger row revisions, labels và
  before/after. Không dự đoán chắc chắn trạng thái kho từ các hợp đồng visible:
  writer vật lý phải dùng helper kiểm occupancy toàn cục. Không gán trả xe
  thường/hoàn cọc/thu tiền cho thao tác thu hồi.
- Nợ/tổng thuê/đã thu/thừa/cọc before=after; nếu dữ liệu tiền cũ chưa rõ, DTO
  giữ null thay vì bịa0. Có mốc chốt/stopped và trạng thái hoàn tất chỉ khi đã
  tất toán thật từ trước và đây là dòng cuối. Không lộ raw composer, giấy tờ
  khách, danh sách transaction hoặc bank details.
- Typed DTO/client bind đúng id/page/revisions/ngày/note. Bốn nhóm unit mới:
  scripts/check-mobile-bad-debt-recovery.cjs, artifact
  .backups/mobile-bad-debt-recovery-results.json. Full mobile **142/21**.
- SQL **103 nhóm** (thêm4 trên domain99): readonly enforcement bằng lệnh UPDATE
  phải bị25006; hash toàn bảng/xmin/sequence trước/sau giống nhau; pagination/
  scope; missing end/foreign/archived labels; plan/cutoff gate; stable snapshot;
  parity với writer thật ordinary/early/late/multiple/settled/HQ legacy29; stale
  rev/wrong line/pre-rental date; ledger correction không đổi order xmin vẫn
  đổi snapshot. Log cuối .backups/mobile-recovery-preview-sql-20261102-run2.log.
- Root/mobile types/lint và release44/44 đạt; backend build run1 bị host reboot
  giữa compiling, run2 đã resume/build đạt với exact copy577 file không env/
  network thật. Hai route trong manifest và source khớp trước/sau:
  .backups/mobile-recovery-preview-backend-verified-20261102.json.
  Export iOS/Android/web sau API đạt: mobile/.expo/native-recovery-preview-qa,
  .backups/mobile-recovery-preview-export-20261102.log. Không dùng export hoặc
  native IME4/4/transfer9/9 trước đây để chứng nhận nghiệp vụ native thu hồi.

## Lỗi đã tái hiện và sửa

Domain web dùng chung là recordBadDebtRecovery trong
src/lib/server/contract-returns.ts. Trước sửa, khi thu hồi dòng cuối, hàm lấy
ngày thu hồi thực tế để ghi đè installment_plan.stopped_at. SQL/RLS thật đã
tái hiện nợ chốt2 triệu bị giảm thành1 triệu khi thu hồi lùi ngày:
.backups/mobile-recovery-sql-before-fix-20261102-run2.log.
Run1 trước đó lỗi khai báo kiểu parameter trong fixture, không phải bằng
chứng lỗi domain; giữ log riêng để không nhầm hai kết quả.

Đã sửa scoped trong domain chung:

- Giữ nguyên toàn bộ plan đã có stopped_at, kể cả ngày thu hồi sớm/muộn.
- Với legacy chưa có stopped_at nhưng có mốc chốt Nợ xấu, chỉ đóng lịch ở
  mốc chốt cũ khi thu hồi hết xe; không dùng ngày thu hồi làm mốc tiền.
- Plan thiếu mốc chốt/không hợp lệ bị chặn trước thay đổi dòng xe. Không
  tự đoán nợ từ ngày hiện tại hoặc ngày thu hồi.
- Ngày thu hồi thực tế vẫn được ghi đúng vào dòng xe/history. Giữ nguyên
  tiền, nợ, cọc và mọi transaction/payment. Đóng hợp đồng đã tất toán vẫn
  theo domain hiện có, với plan đã đóng để không tái sinh kỳ thuê.

Không sửa dữ liệu production hay tự chữa các hồ sơ lịch sử. Snapshot source
trước sửa: .backups/contract-returns-before-mobile-recovery-freeze-20261102.ts.

## Kiểm chứng

Mốc domain trước API: SQL **99 nhóm**, thêm10 nhóm trong scripts/lib/mobile_bad_debt_recovery_sql.cjs:
ordinary physical recovery; replay/actor/payload; sớm/muộn với plan đã chốt;
legacy known cutoff; auto-close đã tất toán; thiếu cutoff; nhiều lần thu hồi;
HQ/legacy29/scope kho; hidden open hire; rollback malformed plan. Chạy đúng
domain và các SECURITY DEFINER/RLS hiện có trong PGlite, không server DB.
Money/order financial columns và toàn bộ transaction/payment rows được so
trước/sau, không chỉ so một số tổng. Sửa chung cho web và mobile tương lai.

Log cuối .backups/mobile-recovery-sql-after-fix-20261102-run2.log (tăng cường
fixture có rental/deposit transactions và management_contract_payments rows,
assert nonempty trước khi so); run1 đã qua các ca tính nợ trước tăng cường.
result .backups/mobile-finance-sql-results.json. Single connection chưa chứng
minh tranh chấp nhiều phiên, deployed RLS hoặc hiệu năng staging.

Root types/lint đạt: .backups/mobile-recovery-domain-root-{types,lint}-20261102.log.
Mobile API regression138 nhóm/20 module, release44/44 đạt. Backend build trong
copy QA không env/network thật đạt: .backups/mobile-recovery-domain-backend-build-20261102.log;
573 file src/shared/public khớp SHA .backups/mobile-recovery-domain-backend-provenance-20261102.json.
Không coi phần sửa domain này là đã triển khai đủ thu hồi mobile.

## Tiếp tục

Writer dùng cùng transaction với domain và phải tính lại snapshot sau khóa
order/item; giữ original actor-bound
proof, exact event/line/current flags, resolver/tombstone/pending trước UI.
Khóa nhóm return.record/swap/recover chờ trên cùng hợp đồng, giữ exact UUID
qua scope/process change. Tiền/cọc và ledger phải được đối chiếu không đổi,
original proof phải sống qua mất phản hồi, correction và soft-delete theo scope.
Kiểm dòng không có hạn trả, nhiều xe, HQ/foreign/archived stock, hidden hire,
lost response/replay/rollback và sửa history sau commit. Sau SQL → editor →
native đúng source; media và iPhone/staging vẫn nằm trong mục tiêu đầy đủ.
