# Video chọn từ trình duyệt trong ứng dụng — 30/10/2026

Người dùng báo lỗi tại ô **Video tình trạng xe 1**, thông báo “Chọn video MP4/MOV/WebM, tối đa 45 MB”, và xác nhận mở web trong Zalo/ứng dụng khác. Tệp được cung cấp là MP4/H.264 + AAC, 7.054.986 byte, 26,133 giây, 720 × 1280; cả ffprobe và bộ kiểm tra MP4 của server chấp nhận tệp. Không phải HEVC hoặc video vượt giới hạn.

## Tái hiện và sửa

Trên `himoto.vercel.app` trước sửa, thử cùng nội dung tệp với ba bộ metadata:

| Metadata do bộ chọn trả về | Trước sửa | Sau sửa |
| --- | --- | --- |
| Tên `.mp4`, loại `video/mp4` | Đạt | Đạt |
| Tên `blob`, loại trống | Bị chặn với đúng thông báo người dùng chụp | Đạt |
| Tên `.mp4`, loại do nhà cung cấp khai báo khác chuẩn | Bị chặn với đúng thông báo người dùng chụp | Đạt |

Đây là tái hiện các trường hợp có thể xảy ra ở lớp metadata, chưa đo được tên/loại/dung lượng mà Zalo thực tế trả về trên máy người dùng. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Blob/type) xác nhận `Blob.type` có thể trống và không nên dùng làm cách kiểm tra duy nhất.

Chuẩn hoá video giữ đường nhanh hiện có với MIME/đuôi hợp lệ. Nếu metadata chưa nhận diện được, đọc tối đa 4 KiB đầu để nhận diện container MP4/MOV/WebM. Không coi các brand HEIF/AVIF hoặc audio là video. Giữ nguyên byte, tên, ngày sửa; server vẫn đọc và xác minh nội dung đầy đủ, thời lượng, codec và dung lượng trước khi gắn tệp vào hồ sơ.

Thông báo lỗi được tách thành tệp rỗng/chưa được cấp quyền đọc, vượt dung lượng thực tế, đọc lỗi và không nhận diện được. Nếu ứng dụng không cung cấp được nội dung tệp, thông báo hướng dẫn lưu vào Ảnh/Tệp rồi chọn lại hoặc mở bằng Safari/Chrome. Không tăng giới hạn 45 MB / 60 giây của hợp đồng. Minh chứng PGD/KTNB cũng dùng cùng bước chuẩn hoá metadata; khoá bộ chọn trong lúc đọc để tránh ghi đè lựa chọn đồng thời.

## Kiểm tra

- `scripts/check-record-video-prepare.cjs`: 8 nhóm gồm metadata mất/sai, header MP4/MOV/WebM, ảnh/audio/headers hỏng bị từ chối, giữ byte/ngày sửa, dung lượng, thời lượng và lỗi đọc.
- `scripts/check-mobile-video-selection-ui.py --video-file <tệp cục bộ> ...`: chính tệp người dùng qua WebKit và Chromium mobile 390px, ba bộ metadata mỗi trình duyệt. Sau sửa 6/6 đạt, không lỗi JavaScript. Worker Mediabunny xử lý được cả sáu ca, không gọi Cloudinary dự phòng. API/storage được giả lập và chặn upload ra ngoài; không phát hành hợp đồng hoặc gửi tệp lên dịch vụ bên ngoài.
- `scripts/check-browser-videos.cjs`: 8 nhóm xác minh biên nhận, nội dung/codec, giới hạn, quyền và lưu tệp đạt.
- `scripts/check-record-photo-save.cjs`: 4 nhóm xác nhận lưu/đọc lại ảnh và giữ tệp sau lỗi đạt.
- Build production, typecheck và lint các file thay đổi đạt.

Bằng chứng trước/sau và khung hình kiểm tra ở `.backups/mobile-video-report-20261030/`. Video vận hành, phiên đăng nhập và khung hình không đưa lên Git. WebKit chạy trên Windows, chưa thay thế được việc chọn lại tệp bằng Zalo trên iPhone thật.

Thay đổi này không chuyển kho lưu trữ hoặc xoá dữ liệu cũ. Cloudinary vẫn là luồng dự phòng hiện có cho video không chuyển được tại thiết bị; việc loại bỏ phụ thuộc này là một thay đổi riêng.
