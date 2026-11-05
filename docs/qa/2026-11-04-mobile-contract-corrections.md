# QA correction cọc/khoản thu và gia hạn — 04/11/2026

Phạm vi triển khai/kiểm nhanh; chưa staging/native financial-write acceptance.
Không đọc env hoặc ghi DB vận hành. Goal toàn dự án vẫn active.

## Đầu ra

- API/native sửa cọc và chia các phiếu cọc/thuê thông thường, tối đa10phần
  mỗi phiếu, giữ ngày/loại/cơ sở, cho phép khoản chưa phân bổ tài khoản/két.
  Chuyển chọn phiếu giữ nội dung tất cả phiếu; tổng cọc/thuê/tiền mặt/CK.
- API/native sửa khoản gia hạn: ngày thực hiện, tiền thực thu, routing, kỳ
  gia hạn và phí kỳ theo đúng eligibility actual web. Phân biệt phí hợp đồng
  và số thực thu, khóa ngày/tiền của phiếu hủy, giữ precision khi ngày chưa sửa.
- Actual `readReceiptCorrections`/`updateReceiptCorrections`,
  `readPaymentContext`/`updateRenewalPayment` trong scoped transaction; CAS,
  lý do, audit, UUID/receipt/recovery, hiện kết quả trước ack trong Tài khoản.
- Các grant thay thế đúng web: draft hoặc finance cho phiếu ban đầu; renew
  hoặc finance cho gia hạn; luôn cần contracts.read và scope hiện tại.
- Reader whitelist, không đưa blob nội bộ/audit tài chính thô vào app.

## Kiểm nhanh

`node scripts/check-mobile-finance-sql.cjs --corrections-only --pglite-path
.backups/mobile-sql-qa/node_modules/@electric-sql/pglite`:4nhóm đạt ở run3/4,
cuối `.backups/mobile-corrections-sql-run4.log`.

Actual SQL/domain trên DB PostgreSQL nhúng: chia routing/amount trên phiếu
cũ và thêm phần còn lại, tổng pid/company/deposit/refund, ngày giữ nguyên,
audit before/after một lần; sửa ngày/value thực thu riêng fee/period, line/
total/paid, revision, replay/fingerprint/tombstone/role/scope.

Run1 transport PGlite không nhận nhiều SET trong prepared query; tách SET
trong adapter. Run2 bootstrap test thiếu cột contract_snapshot; bổ sung chỉ
schema DB tổng hợp. Giữ logs lỗi, không sửa business writer để test đạt.

Root/mobile types, server/mobile lint run2 đạt. Full edit5nhóm SQL và
recovery6/form5regression chạy lại đạt. Export ba nền tảng exit0 ở
`.backups/mobile-corrections-export-20261104-run1` với dotenv tắt/API giả.

## Checkpoint/Samsung

Same8131 nâng generation72→73 bằng `FixtureJournal.control`, chỉ thêm
`contract_corrections_workspace`; mọi field cũ exact. Backup/verification:
`.backups/mobile-corrections-qa-20261104-run1/`. Server handle68074/PID15896.
Metro admin7600/8081/origin8091/reverse giữ. Portfolio9405 chỉ đọc lấy
projection actual SQL, không cho submit correction trong smoke.

Samsung run1 terminal exit0 lúc03:23:20 (+07),459file nguồn khớp,
3nhóm/6ảnh,0crash-ANR. Đã xem hai form, chỉnh local/chia khoản/mở-hủy
xác nhận;0submit. QA7/Tổng quan/work-ledger rỗng, generation73;
nghiệp vụ/auth và26checkpoint cũ giữ. Evidence
`.backups/mobile-corrections-native-20261104-run1/results.json`.
Không ghi nhận native financial acceptance từ thao tác preview.

Source tiếp theo sửa ack để tắt usePreventRemove sau khi complete ledger
thành công, trước điều hướng về hồ sơ. Đã kiểm types/lint; chưa native
ack/ghi tài chính trên source sau thay đổi này.

## Còn thiếu

Correction quyết toán trả xe và bảo lưu đã tiếp tục triển khai riêng;
tiền/ngày thuê riêng, lịch sử/in/Excel/action con; toàn role/scope/staging/network/many sessions,
native submit/lifecycle/recovery sâu và signed iPhone/release/vận hành.
