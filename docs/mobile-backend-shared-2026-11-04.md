# App Android và web dùng chung hệ thống — 04/11/2026

Người dùng xác nhận phát triển app từ repo
`https://github.com/quantrinhansu123/Himoto.git`, web đang được cung cấp tại
`https://himoto.vercel.app/`. Mục tiêu là app Android native cho hệ thống
quản lý hiện có: cùng BE/DB/tài khoản/quyền/cơ sở/nghiệp vụ với web.

Route mobile nằm trong `src/app/api/mobile/v1/` của backend Next hiện tại.
Các adapter mobile xác thực bearer, validate DTO, CAS/UUID/receipt/recovery
và gọi domain/SQL web; bí mật/kết nối database chỉ ở backend. App trỏ tới
origin backend HTTPS khi phát hành. DB không được đóng gói hoặc kết nối
trực tiếp từ app. Web và app cùng nhìn dữ liệu đã lưu qua backend này.

Staging là môi trường kiểm thử của cùng hệ thống web+mobile: cùng source,
schema và quy tắc, có dữ liệu thử tách khỏi dữ liệu khách đang vận hành.
Không phải backend hay database vận hành riêng dành cho app. Không yêu cầu
người dùng tạo Supabase mới cho app; trước hết xác định môi trường web hiện
tại và cách chuẩn bị môi trường thử chung với dev web. Chưa cần mua dịch vụ.

04/11: GET không xác thực `/api/mobile/v1/session` trên URL được cung cấp
trả404. Điều đó chỉ chứng minh endpoint chưa được phục vụ tại URL/đường dẫn
này lúc kiểm; không suy ra DB sai, web ngừng chạy hoặc toàn bộ backend thiếu.
Source mobile local chưa được deploy. Không tự deploy source dirty hoặc
đưa app ghi thử vào URL này khi chưa rõ môi trường và kế hoạch phát hành.

QA hiện tại dùng fixture/PGlite/fork tổng hợp để kiểm source/UI mà không
ảnh hưởng khách. Chúng không thay bằng chứng khớp DB/BE web thật. iPhone đã
được bỏ khỏi điều kiện done theo yêu cầu mới; các gate Android còn giữ tại
[phạm vi Android](mobile-android-done-scope-2026-11-04.md).
