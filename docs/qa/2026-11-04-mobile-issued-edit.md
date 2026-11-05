# QA sửa đầy đủ hợp đồng đã phát hành — 04/11/2026

Chuẩn web `27a87f1` + worktree; phạm vi triển khai/kiểm nhanh, chưa nghiệm thu
toàn sản phẩm. Không đọc env, deploy, áp migration hoặc ghi DB vận hành.

## Source/API/native

- Màn `contract-edit/[id]` dùng lại các phần hồ sơ/pháp lý, khách/người thân,
  phương tiện/người lái/thiết bị, chi phí/lịch đóng tiền, ký/ghi chú từ composer.
  Các component/helper dùng generic input để giữ trạng thái phát hành thật.
- DTO/reader issued riêng, whitelist; production `CONTRACT_LIST_SQL` →
  `mapApiRow` → `createContractDraft`. Không dùng strict parser nháp hoặc
  `draftErrors` làm điều kiện sửa. Không đưa vào durable draft journal.
- Writer gọi trực tiếp `updateIssuedContract`: overwrite latest locked row,
  allowIncomplete đúng web, không thêm CAS. Có cảnh báo/xác nhận lưu đè.
- Tiền thực nhận/collections giữ từ dữ liệu đã khóa; phiếu không lấy tiền từ
  form. Thêm/bỏ xe, dòng đã trả, kho, audit, metadata gia hạn và clear approval
  theo actual writer web. Không tự copy giấy tờ khách khi sửa.
- `contract.edit:<id>` có UUID ledger, receipt theo actor, fingerprint,
  resolver/tombstone, xác nhận kết quả riêng và lối phục hồi trong Tài khoản.

## Kiểm nhanh

`node scripts/check-mobile-contract-edit.cjs --pglite-path
.backups/mobile-sql-qa/node_modules/@electric-sql/pglite`: 5 nhóm đạt, log
`.backups/mobile-edit-sql-run1.log`. Actual web/mobile reader/writer, scoped
transport/RLS và các hàm lock/mark/release từ migration web được chạy trên
PostgreSQL nhúng tổng hợp. Không phải staging backend thật.

Bao gồm stale overwrite, incomplete identity/relative, zero/blank fields,
remove all/reopen, tiền/phiếu/collections giữ, audit/approval/renewal metadata,
thay xe/kho liên cơ sở, completed_at lịch sử, actor/grant/scope, replay,
fingerprint, resolver/cancellation/late request và rollback receipt.

Regression form nháp5/API9/recovery6/durable-work7 nhóm đạt. Mobile/root
types và mobile/server lint đạt ở lượt đầu. Export web/Android/iOS run1 exit0
trước sửa nhãn UTF-8; cần export source cuối, không signed APK/IPA.

## Samsung và checkpoint

Read-only portfolio9305 lấy projection actual SQL. Checkpoint same8131 đã
nâng bằng `FixtureJournal.control` generation71→72, chỉ thêm
`contract_edit_workspace`, mọi field cũ exact. Backup/verification:
`.backups/mobile-edit-qa-20261104-run1/`. Server mới handle83442/PID8924.
Metro admin7600/8081/origin8091, reverse8081→8081/8091→8131 giữ.

Run1 bắt nhãn nút mới mất dấu do Python qua PowerShell default encoding.
Đã sửa bằng apply_patch UTF-8; giữ log/evidence thất bại, chưa submit và
không tạo UUID. Run2 terminal exit0 lúc03:12:54 (+07): 453file nguồn khớp,
3nhóm màn hình/6ảnh,0crash/ANR, QA7/Tổng quan/work-ledger rỗng. Không đổi
business field hoặc auth; generation72 và26checkpoint cũ giữ nguyên.
Đã mở5phần, nhập note local, mở/hủy xác nhận, xác nhận rời mà không gửi.
Evidence `.backups/mobile-edit-native-20261104-run2/results.json`.

Sau mốc smoke đã bổ sung hình thức dự kiến nhiều lựa chọn, màu dòng xe,
mode lịch sử đang thuê/đã trả và câu hướng dẫn lịch riêng cho issued. Những
phần thêm sau smoke có kiểm types/lint/export trong đợt correction tiếp;
không gán453file cho source mới. Run1/export trước sửa nhãn không chứng
nhận source cuối. Chưa native submit full edit/recovery.

## Còn thiếu

Native submit/recovery sau process kill, ma trận đầy đủ role/scope/network/
many sessions và backend staging thật; signed iPhone/release/vận hành.
Correction cọc/chia khoản thu, gia hạn/ngày/tiền thực thu và trả xe vẫn đang
triển khai tiếp; bảo lưu/mở lại/đổi hạn, in/Excel/action con còn trong mục tiêu.
