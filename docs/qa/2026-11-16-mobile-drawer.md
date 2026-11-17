# Menu quản lý thu gọn — 16/11/2026

Source sản phẩm: `4f48d863f3116d155983dde1a7ed11db509cbd9d`, đã push `main`. Đã đọc `mobile/AGENTS.md`, đối chiếu Expo SDK 58/RN 0.88 và `git pull --ff-only` trước khi sửa.

Năm nhóm Vận hành & quầy, Hợp đồng & khách hàng, Đội xe & định vị, Nhân sự & cơ sở, Tài chính & hệ thống có mũi tên xổ xuống. Bấm cả hàng tiêu đề để mở/thu gọn; chỉ mở một nhóm mỗi lần. Nhóm chứa route hiện tại mở mặc định, còn lựa chọn thủ công được giữ khi đóng/mở menu trên cùng route. Nhóm không có mục nào đủ quyền không hiện. Giữ nguyên route và quyền các mục con.

Tiêu đề có vùng bấm tối thiểu 48, trạng thái expanded cho native và web. Không thêm dependency/native config; version/runtime `1.0.11`, Android code `12`.

## Kiểm tra

- Mobile lint và typecheck đạt sau thay đổi cuối.
- `node scripts/check-mobile-navigation.cjs`: 9 nhóm đạt, gồm mở/thu gọn/đổi nhóm, route hiện tại, route hợp lệ và lọc quyền.
- Expo web fixture: 390px sáng, 430px tối, 320px tài khoản hạn chế và 844×390 ngang. Chuyển nhóm, thu gọn, Enter, điều hướng, không tràn ngang, không lỗi JS hoặc host ngoài fixture; không ghi nghiệp vụ.
- Samsung thật SM-N960N qua USB ADB: Tài khoản hiện bản cập nhật **16:23, 16/11/2026**; cả năm tiêu đề và mũi tên hiện khi thu gọn. Mở Hợp đồng hiện các mục con; mở Nhân sự rồi Vận hành chỉ giữ nhóm tương ứng. Ảnh/XML nằm cục bộ. Đã đóng menu sau kiểm tra, không đăng xuất/cài lại APK, không chạy giả lập.

## Phát hành

- Vercel source `4f48d86`: trạng thái thành công.
- Android production branch/channel, runtime `1.0.11`.
- Update group `4ea282cd-455d-4efb-b4b4-43070d4d5f92`.
- Update ID `01a1e3ab-7bb8-7b58-a3b8-0c033ea9d8e4`, tạo `2026-11-16T09:23:48.792Z`.
- Bundle `entry-274b1035144759643f900ec4ffdbf573.hbc`, 8.938.572 bytes.
- SHA-256 `b61014364e3b8845a062ce56f9d5adcb8df4b797bca117d4e447226d7a10eff9`.

Export từ source sạch với `EXPO_NO_DOTENV=1`, API/environment production và Firebase hiện hữu; `androidPushConfigured=true`. Đã đọc manifest production, tải bundle từ CDN theo asset headers, đối chiếu bytes/SHA-256. Runtime `1.0.9` vẫn ở group cũ `71e7a3fd-35c9-45f9-9e2f-f8db5772614f`.

Log, export và ảnh kiểm tra tại `.backups/mobile-drawer-20261116` (ignored). Không đưa env/khóa/ảnh thật vào Git, không gửi Telegram. Các đề xuất hiệu năng toàn hệ thống sau bản menu là đợt nghiên cứu riêng, chưa được triển khai.
