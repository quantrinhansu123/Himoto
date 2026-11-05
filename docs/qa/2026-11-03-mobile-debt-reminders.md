# Nhắc nợ Zalo —03/11/2026

Đã nối source/API/UI: lịch sử theo cơ sở20dòng/trang, nội dung/người gửi/
trạng thái; tìm hợp đồng bằng scope remindable của reader web trước phân
trang; soạn riêng/nội dung mẫu; chọn từng dòng/trang/nhiều trang, rà từng
hợp đồng và gửi tuần tự; kết quả gốc/Account recovery và mở hợp đồng.
Điểm vào Tổng quan và hồ sơ có khoản đến hạn theo `isRemindableContract`.

Domain dùng chung `readDebtReminderContext`, `sendDebtReminder`,
`listDebtReminders`. DTO/status/phone/message chuyển sang shared, web vẫn
re-export cùng hàm. Không có DB app riêng hoặc bước chép dữ liệu để đồng bộ
sau; backend thật chưa deploy. Không trả webhook/khóa/cấu hình bí mật về app.

Giữ quyền đọc contracts.read; soạn/gửi/đối chiếu cần thêm contracts.draft
hoặc finance.write. Tiền đến hạn từ payment context web, thuê sở hữu loại
kỳ tương lai; điện thoại chuẩn hóa từ hồ sơ khách, ngân hàng mặc định đúng
cơ sở nguồn. Server kiểm lại revision/amount/phone trước reservation.

Web writer chỉ thêm optional adapter ở reservation transaction; caller cũ
được kiểm lại và giữ đường thực thi. Mobile ledger và lịch sử gốc commit
cùng transaction trước provider I/O. Replayed UUID không gọi provider lần
nữa; cancellation tombstone chặn request tới muộn. Receipt là ID hợp đồng/
revision lúc gửi, không chứng nhận khách nhận/đọc tin. Giữ cooldown60giây.

Single chỉ đóng mã sau xem kết quả/ack. Bulk dùng UUID riêng từng hợp đồng,
đọc đúng proof trước đóng key accepted/failed; unknown/pending/lỗi giữ key
để đối chiếu và tiếp tục các hợp đồng độc lập như web, không tự retry tin.
Giới hạn8pending intent của ledger vẫn giữ nguyên; nếu đầy thì dừng trước
reservation mới, không xóa mã chưa rõ để tiếp tục.

## Kiểm tra nhanh

SQL nhúng5nhóm đạt,4fake provider calls/0tin thật:
`.backups/mobile-reminders-domain-checks-final.log`. Actual context nợ700,
số0900000001, ngân hàng cơ sở; mobile/web đọc cùng UUID/nội dung/trạng thái.
Kiểm replay/mismatch/quyền/current debt/phone/revision/extra fields,60giây,
rollback và cancellation trước late send; failed/unknown không gửi lại;
caller web cũ hoạt động. Tiền/phiếu/kho không đổi; actual installment reader
chặn kỳ tương lai và chỉ nhắc khoản đã đến hạn. Pending20/recovery6nhóm đạt.
Root/mobile typecheck và lint phần liên quan đạt, log final/final2.

Samsung run2 đạt3nhóm lúc19:18 (+07),357file nguồn khớp; harness bổ sung
resume khi máy khóa có audit. Run1 dừng preflight do USB reverse rỗng,
không mở/ghi app. Run2 `am start -W` timeout khi Keyguard=true nhưng
MainActivity/PID20737 vẫn live, không coi timeout là app dừng. Sau user
mở khóa, kiểm source/checkpoint không đổi rồi tiếp tục phiên đó, không
restart/reset/replay mutation. `harness-unlock-resume.json` giữ bằng chứng.

Ba nhóm native: chọn hợp đồng đến hạn/rà bulk rồi đóng không gửi; soạn
riêng→xác nhận→kết quả gốc→ack; lịch sử/hồ sơ liên kết và work/ledger rỗng.
Chỉ1lần gửi local giả, UUID `6cdb7c51-0be2-40df-adb0-897dbc27bbad`,700đồng,
không có HTTP client trong fixture,0tin Zalo thật.0crash/ANR mới; trả Tổng
quan, USB mapping giữ8081→8081/8091→8131.
`.backups/mobile-reminders-native-20261103-run2/results.json`.

QA chỉ thêm reminders_workspace, generation22→23, source context17001 tạo
từ actual SQL nhúng. Native chỉ thêm1row/1request trong workspace mới,
generation24; mọi field cũ/26checkpoint giữ nguyên. Không reset hoặc gửi
lại UUID để lặp bài kiểm. Linked-record17001 hỗ trợ kiểm liên kết chỉ đọc,
không có dữ liệu cho mọi action tài chính/kho trên hợp đồng đó.

## Chưa nghiệm thu

Export web/Android/iOS terminal exit0 tại
`.backups/mobile-reminders-export-20261103-run1`, dotenv tắt, API
placeholder.invalid; chỉ JS/Hermes bundles, không signed APK/IPA.
Tổng hợp `.backups/mobile-reminders-verification-20261103.json`.

Staging PostgreSQL/RLS/quyền mọi cơ sở, nhiều phiên/race/lỗi mạng/lifecycle,
bulk nhiều hợp đồng/giới hạn pending8, nguyên nhân provider thất bại trên
thiết bị, gửi Zalo thật và xác nhận khách nhận tin, signed iPhone và release.
Không coi3happy path hoặc SQL nhúng là full module/app acceptance.
