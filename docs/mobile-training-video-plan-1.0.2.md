# Bộ video bàn giao Himoto Android 1.0.2

Trạng thái: phương án sản xuất và kịch bản pilot; chưa quay video hoặc tạo giọng đọc. HeyGen đã được tìm thấy trong danh mục plugin, chưa được kết nối khi kiểm tra. Tài liệu này không chứng nhận bộ video đã hoàn thành.

## Hình thức đề xuất

- Quay trực tiếp giao diện native Android cùng source và luồng của bản 1.0.2, trong môi trường demo tách biệt. Ghi rõ phiên bản và dữ liệu minh họa trong video.
- Giọng AI tiếng Việt, đề xuất giọng nữ rõ chữ, trung tính, tốc độ khoảng 0,9–1 lần tốc độ thông thường. Nghe mẫu thực tế rồi mới khóa voice ID và thiết lập cho cả bộ.
- Mỗi clip 2–5 phút theo một mục tiêu nghiệp vụ; luồng dài có thể tách thành nhiều clip. Không chốt tổng thời lượng trước khi kiểm kê hết thao tác theo vai trò.
- Quay dọc theo điện thoại; có thể đóng khung vào bản ngang 1920×1080 kèm vùng chú giải khi khách cần xem trên máy tính. Giữ chữ đủ lớn, hình không méo.
- Thêm phụ đề tiếng Việt, đánh dấu chạm và phóng vùng thao tác khi cần; đặt chú thích ở vị trí không che trường nhập/nút xác nhận.
- Lời hướng dẫn theo trình tự: mục tiêu → quyền cần có → bấm/nhập → kiểm tra → xác nhận → kết quả → lỗi thường gặp.

## Dữ liệu và môi trường quay

APK đang cài trên Samsung dùng API production. Các video có tạo/sửa hồ sơ, thu/hoàn tiền, giao/trả/đổi xe, xóa hoặc nhập Excel cần môi trường demo riêng trước khi quay.

Bản demo phải dùng cùng source UI/domain của bản bàn giao. Phân biệt rõ với app vận hành; giữ bản cài và phiên production của chủ máy. Không dùng dữ liệu vận hành để minh họa các bước ghi.

Chuẩn bị một bộ dữ liệu xuyên suốt: tài khoản/vai trò/cơ sở, khách mẫu, xe mẫu, giá thuê/cọc/phí, các tài khoản thu tiền, ảnh giấy tờ mẫu, hợp đồng và kỳ gia hạn. Mỗi cảnh có trạng thái bắt đầu và kết quả mong đợi. Lưu trạng thái demo theo từng cảnh để có thể quay lại mà không làm lệch các cảnh sau.

Không gửi ảnh CCCD, tài khoản đăng nhập hoặc nội dung hồ sơ thật sang dịch vụ lồng tiếng/video. Lời đọc dùng văn bản hướng dẫn và tên minh họa.

## Mục lục dự kiến

Sáu nhóm dưới là mục lục cấp một, mỗi nhóm gồm nhiều clip. Danh sách cuối phải đối chiếu các màn/action thực có và quyền của khách hàng.

| Nhóm | Nội dung cần phủ |
| --- | --- |
| Bắt đầu | Đăng nhập, quyền/cơ sở, Tổng quan, điều hướng, thông báo, mở hồ sơ từ thông báo |
| Khách hàng | Tra cứu, tạo/sửa, kiểm trùng, quét QR bằng camera/album, kiểm thông tin, ảnh/giấy tờ |
| Xe | Tra cứu, tìm/lọc, hồ sơ, kho chung, trạng thái, GPS, điều chuyển/nhận xe và lịch sử |
| Hợp đồng và tiền | Soạn/khôi phục nháp, phát hành/giao xe, thu tiền/bill, gia hạn, trả/đổi xe, hoàn/điều chỉnh theo quyền, lịch sử, in/PDF/QR; tách các loại hợp đồng và pin/sạc nếu khách sử dụng |
| Báo cáo và dữ liệu | Sổ quỹ/két, báo cáo, cuối ca/đối soát, Excel: chọn file, rà lỗi, nhập/xuất, xác nhận và sao lưu |
| Quản trị và xử lý sự cố | Tài khoản/quyền/cơ sở, cấu hình liên quan theo quyền, đổi mật khẩu/đăng xuất, mất mạng, hết phiên, bản đang soạn, thao tác chưa rõ kết quả, đối chiếu mã gốc |

Mỗi clip ghi vai trò/phạm vi áp dụng. Nhân viên không được hướng dẫn sử dụng quyền quản trị để vượt điều kiện nghiệp vụ.

## Pilot 60–90 giây: tìm và lọc xe

Mục tiêu: kiểm tra giọng, khả năng đọc trên điện thoại/máy tính, nhịp chỉ dẫn, phụ đề, vùng chạm và mức phóng. Chỉ dùng dữ liệu mẫu; không tạo giao dịch.

| Thời gian dự kiến | Hình và thao tác | Lời đọc mẫu |
| --- | --- | --- |
| 00–07 | Tiêu đề ngắn: Himoto 1.0.2 — Tìm và lọc xe — Dữ liệu minh họa | Trong video này, chúng ta sẽ tìm một xe, kiểm tra tình trạng và mở hồ sơ xe trong Himoto. |
| 07–16 | Chọn tab Đội xe, đánh dấu vị trí chạm | Từ thanh điều hướng bên dưới, chọn Đội xe. Danh sách hiển thị các xe trong phạm vi tài khoản được phép xem. |
| 16–31 | Phóng vùng tìm kiếm; nhập biển số xe mẫu; chờ kết quả thực tế | Chạm vào ô tìm kiếm và nhập biển số cần tra cứu. Chờ danh sách cập nhật, rồi kiểm tra biển số và tên xe trong kết quả. |
| 31–48 | Xóa từ khóa; mở Bộ lọc; chọn Lưu kho; áp dụng | Để tìm xe sẵn sàng, mở Bộ lọc, chọn trạng thái Lưu kho và chọn Áp dụng. Kiểm tra cả cơ sở đang được chọn. |
| 48–64 | Mở hồ sơ một xe mẫu; làm nổi biển số/trạng thái/cơ sở | Chạm vào xe để mở hồ sơ. Đối chiếu biển số, tình trạng và cơ sở trước khi thực hiện các thao tác tiếp theo. |
| 64–78 | Trở lại danh sách; minh họa Đặt lại khi có bộ lọc | Nếu chưa thấy xe cần tìm, kiểm tra từ khóa và bộ lọc. Chọn Đặt lại để xem lại danh sách phù hợp với phạm vi tài khoản. |
| 78–85 | Thẻ kết thúc và tên bài tiếp theo | Bạn đã biết cách tìm, lọc và kiểm tra hồ sơ xe. Video tiếp theo hướng dẫn thao tác nghiệp vụ theo quyền được phân công. |

Thời gian là dự kiến để dựng pilot. Sau khi tạo audio, căn lại từng cảnh theo lời đọc và kết quả tải thực tế; không tăng tốc các bước xác nhận quan trọng.

## Quy trình sản xuất

1. Kiểm kê màn hình/action theo vai trò và chốt dữ liệu demo, trạng thái đầu/cuối từng bài.
2. Chuẩn bị môi trường quay cùng source 1.0.2; kiểm chứng các giao dịch mẫu và kết quả tiền/kho trước khi thu hình.
3. Tạo pilot 60–90 giây với giọng có thể nghe được; duyệt phát âm Himoto, căn cước công dân, gia hạn, tất toán và các từ viết tắt.
4. Khóa giọng/nhịp/phụ đề/phong cách, sau đó quay và dựng theo cùng mẫu.
5. Người nắm nghiệp vụ kiểm tra từng video với app: nhãn nút, quyền, dữ liệu nhập, thời điểm xác nhận và kết quả.
6. Xem lại MP4 trên điện thoại và máy tính; kiểm tra tiếng/phụ đề đồng bộ, chữ rõ, thông tin minh họa và đường dẫn mục lục.

## Bộ bàn giao

- MP4 từng bài, có phụ đề hiển thị.
- Tệp phụ đề SRT riêng; lời đọc và kịch bản để cập nhật khi app thay đổi.
- Mục lục theo vai trò/nghiệp vụ, tên tệp có thứ tự và phiên bản app.
- Danh sách bài đã kiểm tra, người duyệt nghiệp vụ và các trường hợp chưa phủ.
- Bản gốc phục vụ dựng lại theo công cụ được chọn.

## Dịch vụ lồng tiếng đã tra cứu

[HeyGen hỗ trợ text-to-speech tiếng Việt](https://www.heygen.com/text-to-speech/vietnamese). Khả năng hỗ trợ ngôn ngữ chưa thay thế việc nghe thử giọng cụ thể, kiểm tra phát âm và xác nhận chất lượng audio xuất ra. Chưa phát sinh việc tạo âm thanh, upload video hoặc mua gói dịch vụ trong lượt chuẩn bị này.
