# QA duyệt thuê sở hữu sau phát hành — 04/11/2026

Source chuẩn web `27a87f1` + worktree chưa commit. Bàn giao tiếp tục ở
[`mobile-handoff-2026-11-04.md`](../mobile-handoff-2026-11-04.md).
Phạm vi: triển khai + kiểm nhanh; **chưa nghiệm thu tổng thể/staging**.

## Đầu ra

API scoped mobile dùng actual web `readContractApproval` và
`approveIssuedContract`, mobile UUID ledger hiện có. Có màn kiểm tra,
xác nhận, trạng thái/người/ngày duyệt và receipt/recovery.
Policy role thuần dùng chung web/native. Không đổi tiền, phiếu, kho,
trạng thái khi duyệt; không migration/deploy/DB vận hành.

Role + grant đúng web: admin hoặc branch_manager/ownership_manager có
finalize; nhân viên được cấp finalize riêng chưa đủ. Eligibility gồm
ownership/ownership_cd hoặc cơ sở thuê sở hữu/trụ sở theo helper web.
Draft/cancelled/stale revision bị chặn. Receipt tách lần ghi với trạng
thái duyệt hiện tại; web sửa/đổi loại có thể xóa duyệt mà không xóa receipt.

## Kiểm SQL và source

- `node scripts/check-mobile-contract-approval.cjs --pglite-path
  .backups/mobile-sql-qa/node_modules/@electric-sql/pglite`: **4 nhóm đạt**.
  Actual helper web/mobile, scopedConnect/SET LOCAL ROLE/RLS fixture,
  PostgreSQL nhúng; chỉ thay transport DB, không stub approval business.
- Gồm role/grant/scope, daily tại cơ sở sở hữu/trụ sở, actor có tên,
  CAS/stale/draft/cancelled, cùng UUID/fingerprint, web repeat không thêm
  history, resolver khóa mã cũ, rollback business cùng receipt, trạng thái
  bị web sửa lại và đổi loại sau duyệt, giữ nguyên tiền/kho/phiếu/status.
- Run1 lỗi cú pháp test `await` trong arrow chưa async; đã sửa test, giữ
  log thất bại. Run2/3/4 đạt, cuối `.backups/mobile-approval-sql-run4.log`.
- `check-mobile-contracts.cjs`: **8 nhóm regression đạt**, domain stub;
  cảnh báo queue unavailable là ca fault dự kiến của test, terminal exit0.
- Root types handle13220/final83368 và mobile types/lint36529/final62594:
  terminal exit0. Logs `mobile-approval-*-final.log` rỗng.
- Server/web lint đạt. Root lint ban đầu có3warning shared bị ignore;
  đã lint riêng shared bằng `--config mobile/eslint.config.js`, exit0,
  log `.backups/mobile-approval-shared-lint-final.log` rỗng.
- Expo export handle54667 terminal exit0 ba nền tảng, dotenv tắt/API
  placeholder, folder `.backups/mobile-approval-export-20261104-run1`.
  Chỉ bundle JS/Hermes; không signed APK/IPA hoặc native release acceptance.

## Samsung — kết quả terminal

Lệnh `scripts/check-mobile-contract-approval-native.py`, run1 handle54369,
**terminal exit0 lúc02:45:30 ngày04/11 (+07)**. Evidence
`.backups/mobile-approval-native-20261104-run1/results.json`, 5 ảnh và
source-provenance. **447 file nguồn khớp**, 0 app crash/ANR/SystemUI ANR.

Ba nhóm màn hình chỉ đọc:

1. QA7 mở hồ sơ9205 và xem kiểm tra, không có nút duyệt.
2. QA admin xem hợp đồng1.000.000/cọc250.000, mở hộp xác nhận rồi hủy;
   **không bấm gửi duyệt**.
3. Xem9206 đã duyệt bởi `Quản lý QA`, trả QA7 về Tổng quan; work/ledger
   rỗng, admin_tokens rỗng.

Portfolio chỉ đọc lấy projections từ actual SQL; không coi thao tác native
preview là đã nghiệm thu native write/receipt/recovery. Ghi nghiệp vụ đã
kiểm SQL riêng; chưa HTTP writer trên staging hoặc Samsung submit.

## Checkpoint và runtime cuối

- QA checkpoint cũ same8131: trước upgrade64; chỉ thêm
  `contract_approval_workspace` bằng FixtureJournal.control →65;
  mọi field cũ exact. Backup và upgrade-verification ở
  `.backups/mobile-approval-qa-20261104-run3/`.
- Sau login/logout smoke →**generation71**. Mọi field nghiệp vụ cũ và
  portfolio duyệt giữ nguyên. Chỉ sessions/sessionSeq và hai expiry lồng
  vehicle_media/vehicle_transfers đổi đúng login/live parent expiry.
- Toàn bộ26checkpoint cũ giữ SHA. Account2001 soft-delete/5receipt,
  type5receipt và integration3receipt giữ; không reset UUID/app/ledger.
- API mới handle59922/PID16456, same8131/state path; Metro admin7600/
  launcher8384/8081/origin8091/dotenv tắt. Reverse8081→8081,8091→8131 giữ.
- Máy `282a05859f3f7ece`, SM-N960N Android9, `vn.himoto.staff`.
  Nếu handle tool mất, xác minh listener/PID/command trước thao tác.

## Còn thiếu

Full edit native mới đối chiếu source, chưa triển khai. Tiếp ngay full
5phần với overwrite/permissive semantics web, giữ tiền thu/phiếu, kho,
lịch sử và clear approval; không gọi nút duyệt là full edit.

Còn correction, bảo lưu, in/Excel/import/export/action con các vùng,
KTNB/video và hồi quy sâu. Chưa đủ100% web, chưa staging/tất cả vai trò/
cơ sở/nhiều phiên/mạng, signed iPhone thật hoặc release/vận hành.
