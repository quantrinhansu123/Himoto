# Giao diện đội xe chủ quản — 24/10/2026

Hai lỗi được sửa trên tab Doanh thu xe theo cơ sở:

- Tên xe trong bảng chi tiết nổi đè lên thanh Đóng. Nguyên nhân là các ô `th` ở thân bảng dùng chung quy tắc sticky và z-index của tiêu đề cột, trong khi footer cuộn chung với nội dung. Hộp đội xe nay có tiêu đề/thanh Đóng riêng và thân cuộn độc lập; ô tên xe không sticky. Khung desktop rộng hơn để đọc các cột doanh thu.
- Dòng tổng số xe nằm sát viền, khó phân biệt từng số. Nay có ba ô: xe chủ quản, xe tại cơ sở gốc, xe ở cơ sở khác; căn cùng lề với báo cáo và các ô doanh thu, xuống dòng đúng trên điện thoại.

Đã tái hiện lỗi cũ bằng kiểm tra phần tử thực tế tại vùng footer: ô xe nhận hit thay vì footer. Bài kiểm tra đó thất bại trước sửa và đạt sau sửa.

Build, typecheck, ESLint component và `git diff --check` đạt. Build còn cảnh báo cấu hình plugin Next ESLint có sẵn. **13 tình huống giao diện đạt** trên Chromium 1440×950, Chromium 1024×600 và WebKit 390×844, gồm cuộn đầu/giữa/cuối, footer không chồng thân bảng, phân trang 10/50 dòng tới đủ 80 xe, giữ tổng 12 triệu qua các trang, lọc/thử lại khi lỗi và ẩn tab cho bốn tài khoản khác. Không lỗi JavaScript.

API trình duyệt dùng fixture; không ghi dữ liệu nghiệp vụ hoặc gửi Telegram. Bằng chứng local trong `.backups/owned-fleet-layout-20261024/` bị Git bỏ qua. Chỉ sửa giao diện và kiểm tra giao diện; số liệu/phân quyền tiếp tục lấy từ luồng hiện hành. Trạng thái production được kiểm tra riêng theo SHA sau push.
