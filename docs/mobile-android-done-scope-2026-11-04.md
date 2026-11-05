# Phạm vi done Android — quyết định người dùng04/11/2026,22:04+07

Người dùng yêu cầu: bỏ qua iOS/iPhone, không để ảnh hưởng điều kiện done;
anh sẽ trao đổi với khách sau. Tập trung hoàn tất Android trước.

Quyết định này thay thế mọi yêu cầu signed iPhone/iOS trong goal description,
bàn giao, backlog, parity và QA cũ. Không tiếp tục login/ký/build/cloud/TestFlight/
thử iPhone nếu chưa có yêu cầu mới. Giữ source đa nền tảng hiện có và bằng chứng
cũ, không xóa checkpoint hoặc bí mật đăng nhập đã lưu bởi công cụ chính thức.

Goal chưa đạt. Người dùng yêu cầu lưu bàn giao và tiếp triển khai ở chat
mới; goal chat cũ được tạm dừng khi chốt để tránh hai chat sửa cùng workspace.
Không complete chỉ để đổi chữ hoặc chuyển chat. Chat mới kiểm goal thực tế,
nếu chưa có thì đặt theo phạm vi này. Objective chữ cũ nhắc iPhone phải được
đọc cùng quyết định Android này.

Điều kiện done còn giữ:

- Android phủ đầy đủ chức năng/action thực có của web trong23khu vực, đúng
  vai trò/cơ sở/trình tự/điều kiện/mặc định/tiền/kho/trạng thái/phiếu/audit.
- Kiểm types/lint/build và thao tác chính khi triển khai; sau đó QA tổng thể
  trên Samsung thật với ghi/đọc/recovery/mạng/lifecycle/tệp/media và dữ liệu
  có kiểm soát. Không coi browser/PGlite/export là native acceptance.
- Khớp DB/BE web trên staging riêng, đủ vai trò/cơ sở/nhiều phiên và mạng;
  staging chưa được cung cấp/xác nhận. Không chuyển sang ghi thử production.
- Bản Android ký/bảo toàn dữ liệu/nâng cấp, checklist phát hành/bàn giao/
  vận hành/khôi phục và giới hạn còn lại rõ ràng.

Picker pin/sạc đã nối và kiểm nhanh/native; APK Android mới có Clipboard đã
cài cùng chữ ký,419file app data nguyên SHA lúc nâng cấp. Sửa native splash
kẹt; Kho xe toàn hệ thống đã nối cùng reader web và browser/types/lint/export
đạt, native560file/0submit/0crash-ANR đã đạt riêng. Tiếp action Đổi trạng thái/tạo nháp từ kho và audit
action con23khu vực, rồi QA Samsung tổng thể. Web Điều chuyển không có nút
CSV/Excel riêng, không tự thêm. Không làm lại các cụm source đã khép.
[QA mới](qa/2026-11-04-mobile-android-battery-fleet-startup.md).
[Kiến trúc chung với web](mobile-backend-shared-2026-11-04.md).

Ràng buộc không đổi: giữ source dirty/untracked, không pull/reset/clean/
stash/commit/push; không đọc/sửa/log/copy `.env.local`; Expo luôn dotenv tắt;
không production deploy/migration/write hoặc gửi Telegram thật khi phát triển.
