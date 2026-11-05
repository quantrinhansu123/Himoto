# Himoto Android — hướng dẫn vận hành

Bản release1.0.0, package `vn.himoto.staff`, backend `https://himoto.vercel.app`.
Tài liệu đi cùng hồ sơ nghiệm thu; APK build thành công chưa thay cho nghiệm thu.

## Cài đặt và đăng nhập

Nhận APK và SHA256 từ người bàn giao. Trên Android cho phép cài từ ứng dụng
đang mở file theo yêu cầu hệ điều hành, cài APK rồi mở Himoto. App không cần
Expo Go, máy tính hoặc Metro khi dùng bản release. Yêu cầu Android7.0 trở lên;
Gói Samsung mới nhắm arm64-v8a; chưa chứng nhận máy chỉ có CPU32bit.

Dùng tên đăng nhập/mật khẩu đang được cấp trên web. Quyền, cơ sở và dữ liệu
dùng chung với web; không tạo tài khoản riêng cho app. Trong Tài khoản kiểm
vai trò/phạm vi trước khi làm việc. Khi đổi thiết bị hoặc kết thúc ca, Đăng xuất.
Không chuyển file danh sách mật khẩu hoặc ảnh chứa thông tin khách qua nhóm chat.

## Các thao tác chính

- Tổng quan mở Đội xe, Hợp đồng, Khách hàng và các mục vận hành theo quyền.
  Lọc cơ sở/tìm kiếm trước khi mở hồ sơ; kiểm mã và trạng thái hiện tại.
- Tạo/sửa nháp: chọn đúng khách, xe và cơ sở; rà soát trước khi xác nhận.
  Tạo nháp từ kho chưa phát hành hợp đồng, chưa thu tiền và chưa đổi tồn kho.
- Thu/chi, gia hạn, trả/đổi/thu hồi xe: kiểm hợp đồng, kỳ, số tiền, tài khoản,
  ngày giờ và ảnh bill ở màn rà soát. Chỉ xác nhận một lần.
- Điều chuyển: kiểm cơ sở đi/đến và trạng thái chờ nhận. Dùng đúng action
  nhận/từ chối/hủy; tránh sửa tay trạng thái/kho để bỏ qua lượt chuyển.
- Ảnh/video: chọn đúng hồ sơ/slot, xem ảnh xem trước trước khi lưu. Các quyền
  camera/thư viện chỉ cấp theo tác vụ; không cần quyền đọc mọi dữ liệu điện thoại.
- Xuất Excel: áp bộ lọc trước, chọn cột nếu màn có hỗ trợ rồi chọn thư mục
  đích trong Bộ nhớ trong. File gồm cả trang chưa tải, theo dữ liệu lúc tạo file.
  Báo cáo cuối ca giữ giới hạn100bản mới nhất như web; lọc cơ sở/ngày để thu hẹp.

## Khi mất mạng hoặc chưa rõ đã lưu

App có thể báo chưa nhận được xác nhận dù máy chủ đã ghi. Mở Tài khoản → mục
đối chiếu, giữ nguyên mã yêu cầu và dùng chức năng kiểm kết quả. Nếu máy chủ đã
ghi, mở kết quả gốc rồi xác nhận đã đối chiếu. Nếu máy chủ xác nhận chưa ghi,
thực hiện hủy mã theo luồng có sẵn rồi mới làm lại.

Không bấm tạo mới nhiều lần, không xóa dữ liệu app/gỡ app, không xóa UUID hoặc
bảng receipt để xử lý thao tác đang chờ. Đăng nhập lại cùng tài khoản và đúng
backend khi cần tiếp tục đối chiếu. Khi báo lỗi, gửi mã yêu cầu, mã hồ sơ, thời
điểm và thông báo; không gửi mật khẩu, bearer hoặc connection string.

## Thông báo công việc

Mở biểu tượng chuông ở Tổng quan → Bật thông báo trên thiết bị. Nếu điện thoại
chặn quyền, dùng Mở cài đặt thông báo để bật lại cho Himoto. Danh sách gồm điều
chuyển còn cần nhận, kỳ đóng tiền đến hạn/quá hạn và hợp đồng sở hữu chờ duyệt,
theo đúng quyền và cơ sở hiện tại. Chạm thông báo để mở danh sách và đọc lại dữ liệu.

Thông báo trên màn hình khóa chỉ hiện nhắc việc chung. Hệ thống kiểm tra định kỳ,
có thể chậm do mạng hoặc tiết kiệm pin; không cam kết đến ngay khi phát sinh.
Vuốt đóng app khác với Buộc dừng trong Cài đặt: sau Buộc dừng cần mở app lại.
Đăng xuất kết thúc đăng ký theo phiên; tài khoản đăng nhập sau tự chọn bật thông báo.
Push đã được kiểm trên Samsung Note9 với APK release: nhận lúc app mở, nhận sau
khi tiến trình app đã đóng, và chạm để mở đúng trung tâm công việc sau xác thực.

## Quản trị backend và nâng cấp

Production API được bật bằng `HIMOTO_MOBILE_ENABLED=true` trên Vercel project
`congs-projects-f25af77d/himoto`. SQL đã áp dùng chung Supabase với web.
Không chạy lại toàn bộ SQL lịch sử. Giữ các bảng mobile và lịch sử phiên/receipt
để các thiết bị còn yêu cầu chưa đối chiếu có thể khôi phục đúng kết quả.

Sau mỗi deployment kiểm web login, API no-bearer401SESSION_EXPIRED, đăng nhập
quản trị/cơ sở, phạm vi và một thao tác QA có bằng chứng. No-bearer401 chỉ chứng
minh route/gate hoạt động. Nếu cần rollback, quay về deployment đã ghi; không
DROP bảng session/receipt hoặc sửa hồ sơ khách để né lỗi source.

Source web và API mobile được tích hợp qua PR#1 của repository
`quantrinhansu123/Himoto`; chỉ công bố tích hợp hoàn tất sau khi merge và kiểm
production. Cập nhật từ `main` mới nhất, giữ `src/app/api/mobile`, `shared`, `mobile`
và các helper đang được dùng. Không deploy ZIP cũ đè source chung. Xem
`docs/mobile-repository-deployment.md`. Bản nâng cấp Android phải dùng cùng khóa ký
và tăng versionCode; đối chiếu mã yêu cầu còn chờ trước khi phát hành.

## Khóa ký và khôi phục

Khóa phát hành mới do chủ dự án xác nhận chưa có bản đã phát hành. Public
certificate SHA256:
`0c0c26eb9e8bf3495e9cc547059a52392a51b52ec7d2034e997658944f6c40a2`.

Mật khẩu local được bảo vệ bằng Windows DPAPI user hiện tại. Bản portable được
tạo bằng `scripts/export-mobile-signing-backup.ps1`, AES256-GCM + PBKDF2-SHA256,
passphrase do chủ dự án nhập, tối thiểu16ký tự. Lưu file `.himoto-key` ở hai nơi
an toàn; passphrase giữ riêng trong kho mật khẩu. Không gửi key/passphrase vào
chat hoặc commit repository. Phải xác nhận backup/khôi phục trước bàn giao.

Samsung QA đã chuyển sang APK release sau khi chủ dự án cho phép. Trước khi gỡ
bản debug đã xác nhận không có yêu cầu ghi chờ/phiên đăng nhập và sao lưu mã hóa
332 file bản soạn. Bản soạn cũ không tự chuyển sang release; bản DPAPI cần đúng
người dùng Windows để khôi phục. Cài đè cùng khóa ký đã giữ được phiên đăng nhập.
Không gỡ/xóa dữ liệu app khi còn yêu cầu cần đối chiếu.

Bản sao khóa ký `.himoto-key` đã tạo và kiểm tra giải mã; hai bản hiện cùng máy
Windows. Chủ dự án cần giữ thêm một bản ngoài máy này và giữ passphrase riêng.
