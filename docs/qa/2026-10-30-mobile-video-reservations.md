# Video điện thoại và cọc giữ xe — 30/10/2026

Đối chiếu bản `himoto.vercel.app` tại commit `9ee0745` và kiểm tra bản sửa cục bộ. Không phát hành hợp đồng, ghi giao dịch nghiệp vụ hoặc gửi Telegram thật.

## Lỗi và thay đổi

- Video MOV/MP4/WebM/M4V có MIME trống hoặc MIME chung bị chặn trước khi tải lên. Chuẩn hóa MIME theo phần mở rộng được hỗ trợ, giữ nguyên nội dung/tên/ngày sửa; MIME ảnh khai báo rõ vẫn bị từ chối. Áp dụng cho hợp đồng và minh chứng PGD/KTNB. Bộ chọn video hỗ trợ `video/*` cùng các phần mở rộng. Server tiếp tục kiểm tra nội dung thật, thời lượng và dung lượng. File API cho phép MIME trống khi không xác định được loại: [W3C File API](https://www.w3.org/TR/FileAPI/#dfn-type).
- Phần tử đọc metadata được giải phóng cả khi video quá thời lượng. Hợp đồng vẫn tối đa 45 MB / 60 giây; minh chứng ca vẫn tối đa 45 MB / 180 giây.
- Ô “Số tiền cọc giữ xe” vừa được thêm vào form dùng chung `deposit_amount` với cọc bảo đảm. Khi nhận cọc giữ xe, số này phải chuyển sang khoản trả trước tiền thuê ở bước xác nhận. Tổng thuê/phí không cộng thêm khoản giữ xe. Sau lưu chính thức, số đã nhận nằm trong phiếu `order:rental_fees`, còn cọc bảo đảm trong đơn và snapshot bằng 0. Cọc bảo đảm của hợp đồng thuê thông thường giữ nguyên nghiệp vụ.

## Kiểm chứng

- Trước sửa, kiểm thử MOV thiếu MIME bị từ chối với “Chọn video MP4/MOV/WebM”. Kiểm thử nhập cọc giữ xe 100.000đ phát hiện `deposit_amount` sau phát hành vẫn là 100.000đ thay vì 0.
- Kho đang chạy: tải PUT thật từ Chromium và WebKit, API production xác minh MP4, phát video theo byte range đều đạt. Video HEVC mẫu chuyển qua Cloudinary, chép CloudFly và phát/seek trên Chromium/WebKit desktop/mobile đều đạt. Tất cả object thử được xóa sau kiểm tra.
- Kiểm thử PostgreSQL trong bộ nhớ kiểm tra nhận 100.000đ trước ngày lấy xe ghi doanh thu 100.000đ đúng ngày nhận; thu tiếp 200.000đ thành tổng 300.000đ; giao xe và gửi lại yêu cầu không tạo khoản thu trùng. Đồng thời kiểm tra số dư tiền mặt/ngân hàng và rollback.
- 10 ca dữ liệu cọc/hợp đồng, 5 nhóm nhận tệp, 8 nhóm xác minh video và 4 nhóm xác nhận lưu ảnh đều đạt. Kiểm thử video giao diện đạt 14 kiểm tra trên mỗi trình duyệt (28 tổng), gồm MIME trống/chung, camera/thư viện, lỗi tải và thử lại, worker không hỗ trợ hoặc quá thời gian, giới hạn thời lượng và gắn biên nhận vào hồ sơ. Không có lỗi JavaScript trong hai lượt kiểm tra video.
- Build production, typecheck và lint đạt. Luồng cọc trên production local đạt 4 kiểm tra mỗi trình duyệt (8 tổng), gồm 320/375/1440px và giao xe khi đã trả đủ. Không có lỗi JavaScript hoặc request ngoài fixture. Tiền giữ xe nhập 100.000đ chuyển đúng sang xác nhận và không cộng vào tổng thuê 300.000đ.

Lệnh chạy kiểm thử nhận tệp và dữ liệu:

```powershell
node scripts/check-record-video-prepare.cjs
node scripts/check-browser-videos.cjs --synthetic-file .backups/browser-video-20261025/fixtures/silent.mp4
npm.cmd run test:contract-reservations -- --pglite-path .backups/contract-flow-qa/node_modules/@electric-sql/pglite
```

Kiểm thử giao diện dùng `scripts/check-browser-videos-ui.py` và `scripts/check-contract-reservations-ui.py`, Chromium/WebKit, API nghiệp vụ giả lập. Bằng chứng riêng tại `.backups/mobile-upload-reservation-20261030/`. Đây là kiểm thử trình duyệt trên Windows, chưa phải kiểm chứng bằng iPhone/Android thật và chưa xác định được tệp cụ thể người dùng đã tải lỗi buổi sáng.

Kiểm thử tải lại danh sách mở trang mới trong cùng browser context để tránh lỗi WebKit khi thay document trong lúc phát sinh request cùng origin, đã được ghi nhận tại [Playwright #43120](https://github.com/microsoft/playwright/issues/43120). Vẫn bắt và từ chối mọi `pageerror`, không bỏ qua lỗi theo chuỗi thông báo.

Bản sửa này không thay đổi nơi lưu ảnh. Trạng thái triển khai được xác minh riêng trên Vercel sau khi push.
