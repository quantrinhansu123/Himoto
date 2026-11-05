# Telegram hợp đồng/điều chuyển và xuất KTNB — 04/11/2026,19:45+07

Đã nối source/API/UI, chưa nghiệm thu native hoặc staging. Không gửi tin thật.

- Telegram hợp đồng dùng actual reader/writer/outbox/retraction của web:
  xem nội dung, nhóm nhận, ảnh/video, gửi, gửi tiếp phần còn thiếu, xác nhận
  đã kiểm tra chưa có tin trước khi gửi lại kết quả unknown, thu hồi có lý do.
  Giữ message/file IDs đã nhận; không tự gửi khi đọc hoặc mở màn hình.
- Điều chuyển dùng actual owner transaction và quyền actor/cơ sở hai đầu
  của web; digest nội dung/nhóm nhận gắn với bước xác nhận. Không suy quyền
  từ riêng role hoặc mở rộng phạm vi RLS hợp đồng.
- Danh sách chưa gửi dùng actual `readPendingContractTelegram`, lọc cơ sở,
  phân trang30; mở từng giao dịch để kiểm tra. Phiếu UUID và Account recovery
  giữ action gốc riêng với trạng thái gửi hiện tại, ack sau khi đọc phiếu.
- KTNB xem/chép/xuất TXT dùng exact `auditReportText` của web, chỉ bản audit
  đã lưu và revision tương ứng; không lấy nội dung đang nhập chưa lưu.
  Lỗi clipboard vẫn giữ thao tác xuất. Không đọc clipboard.

Kiểm tra nhanh:

- SQL Telegram actual5nhóm đạt: quyền/cơ sở, CAS/hash, replay, unknown,
  resume giữ IDs, thu hồi/thời hạn, rollback, lost commit, cancellation,
  pending RLS, điều chuyển. Tiền/kho/hợp đồng gốc giữ nguyên.
  `.backups/mobile-telegram-sql-run5.log`.
- Route adapter3nhóm đạt: GET không dispatch; lỗi/quyền không dispatch;
  POST explicit action chỉ schedule sau commit và đúng hồ sơ/nhóm nhận.
  `.backups/mobile-telegram-api-run1.log`.
- Browser Telegram2luồng375sáng/430tối/7ảnh đạt,0pageerror/0host lạ/0tin thật:
  review-hủy, player, gửi, mất phản hồi/resolve/ack, retry-confirmed-absent,
  resume, thu hồi và xác nhận điều chuyển.
  `.backups/mobile-telegram-ui-20261104-run2/results.json`.
- SQL ca6nhóm đạt, nhóm mới kiểm formatter exact/bản đã lưu/long text.
  Browser KTNB2luồng/2ảnh đạt: xem/chép/xuất đúng bản, clipboard bị từ chối
  vẫn tải TXT được; clipboard Windows chuẩn hóa CRLF khi so với LF.
  Run1 harness so nguyên newline thất bại; run2 so newline chuẩn hóa đạt.
  `.backups/mobile-shift-export-sql-run1.log`,
  `.backups/mobile-shift-export-ui-20261104-run2/results.json`.
- Root/mobile types, mobile lint, targeted server/shared lint đạt cuối cụm.
  Export Android/iOS/web đạt tại
  `.backups/mobile-telegram-ktnb-build-20261104-run1/`, dotenv tắt/origin giả.
  Pending29/recovery6 đạt ở mốc Telegram; không thay checkpoint/gen80.

Đã thêm `expo-clipboard ~58.0.4` bằng Expo58 installer. Native kiểm module
trước khi gọi và báo lỗi nếu APK cũ chưa có module; cần build binary mới để
nghiệm thu clipboard. Chưa build/cài APK mới, chưa signed iPhone, chưa gửi
Telegram thật, chưa staging/RLS thật/nhiều phiên/mạng lỗi. Browser/SQL ở đây
là QA tổng hợp, không phải bằng chứng app đã đạt100%.
