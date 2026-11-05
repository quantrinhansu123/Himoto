# QA tình trạng xe, nợ và bảo lưu — 04/11/2026

Phạm vi triển khai/kiểm nhanh, chưa nghiệm thu staging/native financial write.
Goal toàn dự án active. Không đọc env hoặc ghi DB vận hành.

## Đầu ra

API/native dùng actual `readContractLifecycle`/`applyContractLifecycle`:
bảo lưu, cập nhật hạn, mở lại, kết thúc bảo lưu, đánh dấu nợ xấu và tất toán.
Đúng role/scope, CAS, UUID/recovery; tất toán còn cần finance.write.
Xem trước lịch/hạn mở lại dùng pure helper web; chọn xe sẵn sàng qua scoped
inventory riêng, không ép thêm quyền lập nháp. Giữ cọc/nợ và quy tắc tiền
thực tế của web; kết thúc bảo lưu không tự tạo khoản thu.

## Kiểm nhanh

Actual SQL PostgreSQL nhúng:4nhóm đạt, log cuối
`.backups/mobile-lifecycle-sql-run4.log`. Bao phủ6action, helper kho khác
cơ sở, expiry vẫn giữ bảo lưu, cọc/nợ, receipt gốc sau lần lifecycle khác,
quyền/CAS/cancel/rollback. Không phải chứng cứ ghi staging.

Root/mobile types, server/mobile lint đạt. Pending exclusivity và recovery
regression đạt. Expo export3nền tảng exit0:
`.backups/mobile-lifecycle-export-20261104-run1`, dotenv tắt/API giả.

Samsung run1 terminal exit0 lúc03:38:03 (+07),465file nguồn khớp,
3nhóm/6ảnh,0crash-ANR. Xem form bảo lưu, chọn xe rảnh/xem lịch mở lại,
mở-hủy xác nhận kết thúc/xử lý nợ;0submit. Evidence:
`.backups/mobile-lifecycle-native-20261104-run1/results.json`.

Same8131 generation73→74 chỉ thêm contract_lifecycle_workspace qua journal;
backup `.backups/mobile-lifecycle-qa-20261104-run1`. Sau smoke QA7/Tổng quan,
work-ledger/admin_tokens rỗng, nghiệp vụ/auth và26checkpoint cũ giữ.

Source sau smoke có sửa tắt usePreventRemove khi ack hoàn tất ledger để
điều hướng về hồ sơ. Types/lint đạt; chưa native ack/submit trên bản đó.

## Còn thiếu

Ma trận native submit/recovery/quyền/cơ sở/mạng/nhiều phiên, staging,
Samsung hồi quy tổng thể, signed iPhone thật và release/vận hành.
Chưa gọi lifecycle hoặc toàn dự án là nghiệm thu hoàn tất.
