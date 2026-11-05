# Pull web và gia hạn giờ/ngày / thu nhiều xe —04/11/2026

Mục tiêu active, phủ chức năng và demo trước. Chưa nghiệm thu parity100%.

## Pull và bảo toàn công việc

Nhánh local `feat/mobile-foundation` không có upstream; dùng explicit
`git pull --ff-only --no-rebase --no-autostash origin main`. Fast-forward
`d1ea473` → `27a87f1` gồm11commit/55file. Không commit/stash/push/reset/clean.

Trước pull sao lưu846file nguồn đang sửa/chưa tracked kèm SHA256 và patch
index/worktree.840file giữ nguyên từng byte;6file giao nhau được gộp3chiều
với newline chuẩn hóa: BatteryContractsPage, ContractRenewalDialog,
contract-payments, contract-renewals, server management-table, tsconfig.
Hai conflict là import Send+batteryMatchesSearch và danh sách exclude;
giữ cả hai phía. Không mất/mismatch/file untracked đụng tên, index không
unmerged. Toàn dữ liệu/env vận hành giữ; không đọc/sao lưu `.env.local`.

Evidence `.backups/prepull-mobile-20261104-021022/{manifest,merge-plan,verification}.json`
và hai pull log.840/6 là bằng chứng ngay sau pull, trước các thay đổi triển
khai mới trong đợt này; không dùng SHA cũ để chứng nhận source mới.

Web mới có full edit/ownership approval, ngày gia hạn/recorded_at, correction
ngày-thu/tiền, tên khách ưu tiên profile, bảo lưu/mở lại và UI. Những action
native chưa phủ vẫn trong backlog, không coi pull là đã triển khai native.

## Đã triển khai tiếp

- Gia hạn: ngày gia hạn thực tế đặt trước phần đơn vị, mặc định hiện tại
  với giao dịch thường/trống với nhập bổ sung. Phiếu đã thu dùng chính
  ngày thực tế này, đúng web mới; không còn trường thu độc lập gây lệch ngày.
  Audit `recorded_at` do actual writer web ghi riêng. Đây thay quy tắc tách
  ngày ở tài liệu03/11 trước pull; không đổi các receipt đã ghi trước đó.
- Ngày/giờ, số kỳ, đơn giá, nhập hẹn trả trực tiếp, phí thỏa thuận, phí khác/
  VAT và thu ngoài. Đổi đơn vị reset gợi ý theo web; mặc định giờ20000,
  ngày lấy daily_price. Giới hạn365ngày/720giờ cho gợi ý; phần giờ/ngày dùng
  pure helper web chia sẻ, luôn cộng từ hẹn trả của xe và làm tròn kỳ bắt đầu.
- Trong thu/chi, thêm mục gia hạn một/nhiều xe: chọn tối đa50, số ngày1–365,
  tiền từng xe, gợi ý/cảnh báo thu thấp, phân trang25xe/lựa chọn giữ giữa
  trang. Rà soát nêu từng biển số/hẹn trả mới/tiền và tổng phiếu. Chỉ ghi
  khoản thực nhận; không giả thu một phần cho action web thu đủ này.
- Ghi batch dùng actual `recordContractPayment`, một phiếu `order:renewal`
  và renewal_payload cùng dòng xe/phiên bản gốc. Tổng/đã thu tăng bằng
  tổng phí, nợ không đổi. Cùng operation `payment.record:<id>` và UUID/CAS/
  Account recovery hiện có; không migration mới hoặc backend app riêng.
- Quyền finance.write cho thu+gia hạn theo dialog web, contracts.renew cho
  ghi phiên bản gia hạn riêng. Trạng thái/ownership-plan/returned-line/store/
  tài khoản vẫn do domain web chặn; không dùng quyền mới để né điều kiện.

Shared `rental-time` và `renewal-duration` là pure web hiện hữu; web re-export,
không chép client/session/lockfile/native generated từ repo đồng nghiệp.
Giữ `mobile/` và dependency hiện hành; đã tham khảo workflow đồng nghiệp ở
các đợt trước, không mang điều kiện cũ vào thay web27a87f1.

## Kiểm tra nhanh đã đạt

- SQL mới4nhóm trên actual scopedConnect/PGlite:2xe phí200000/400000,
  hẹn riêng06/07→08/09tháng11, một phiếu600000; total1m→1.6m,
  paid200k→800k, nợ800k giữ; UUID replay chỉ một phiếu. Xe thứ hai stale/
  sum sai/nhầm purpose rollback; scope đúng. Giờ2×20000+VAT10000=50000,
  ngoài5000 tách tổng/chưa thu; occurred_at/created_at/recorded_at đúng
  actual writer. Toàn dòng xe giữ nguyên.
- Pure mới3nhóm: helperweb identity/đổi năm/làm tròn phút, chọn50xe,
  ngày/tiền sai, tổngbatch, ngày phiếu theo ngày gia hạn thực tế.
- Finance regression8, form gia hạn4, backfill pure4/SQL4, workspace3 đạt.
  Root/mobile types và mobile/scoped/shared lint final đều terminal exit0.
- Export web/Android/iOS handle87493 terminal exit0 ở
  `.backups/mobile-renewal-parity-export-20261104-run1`, dotenv tắt/API
  placeholder. JS/Hermes, chưa signed APK/IPA.

```powershell
node scripts/check-mobile-renewal-parity.cjs
node scripts/check-mobile-finance-sql.cjs --pglite-path .backups/mobile-sql-qa/node_modules/@electric-sql/pglite --renewal-parity-only
```

SQL run1 dừng do bootstrap thiếu bảng customers cho reader mới, chưa xuất
catalogue; run2/3 bổ sung fixture phù hợp và đạt4nhóm. Không đổi writer để
né lỗi. Backfill regression cập nhật ngày phiếu kỳ vọng theo parser mới
vừa pull; cả phiếu thật và replay được kiểm, không chỉ sửa assertion.

## QA / Samsung / runtime

Checkpoint8131 giữ nguyên, thêm `renewal_parity_workspace` generation63→64;
mọi field cũ giữ, catalogue SQL run2/SHA manifest. Portfolio9103 chỉ đọc,
không thử ghi tiền; có2xe19104/19105 với ID thật của tập SQL QA.
Không reset/replay các portfolio account/type/battery/integrations/backfill.

Old QA tool handle43534 không còn, process đã terminal khi kiểm; server
mới cùng checkpoint handle69857/PID15336. Metro cũ không còn listen8081,
USB reverse mất; đã xác minh trước khôi phục. Launcher admin8384/Metro7600
ở `.backups/mobile-metro-admin-20261104-run1`, origin8091/dotenv tắt, cổng
loopback8081. USB8081→8081/8091→8131 đã khôi phục. Không sửa `.env.local`.

Native run1 dừng ngay ở reverse check, chưa prewarm/ghi/mở form. Run2
handle97021 terminal exit0 lúc02:27:01 (+07),3nhóm màn hình đạt:
ngày nổi bật/giờ2×20000=40000, chọn2xe tổng600000 và trả QA7/Tổng quan/
work-ledger rỗng.441file nguồn khớp,0crash/ANR mới, toàn checkpointstate64
và26checkpoint cũ giữ nguyên. Đây chỉ kiểm màn hình/tính gợi ý/chọn xe,
không gửi phiếu/bill/tiền native. Evidence
`.backups/mobile-renewal-parity-native-20261104-run2/results.json`;
tổng hợp `.backups/mobile-renewal-parity-verification-20261104.json`.

## Chưa đạt / tiếp theo

Native ghi phiếu/giờ/ngày/mất mạng/batch50/datasetlớn/bill, staging schema/
toàn vai trò-cơ sở/RLS/nhiều phiên/race/fault và signed iPhone/release. Các
action web mới: full sửa hợp đồng, duyệt sở hữu hiển thị actor, correction
ngày/số tiền/thu, bảo lưu/mở lại phải tiếp tục đối chiếu native. In/Excel/
video/action khác vẫn bắt buộc; không lấy đợt này làm nghiệm thu app.
