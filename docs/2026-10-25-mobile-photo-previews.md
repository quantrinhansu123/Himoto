# Hiển thị ảnh hồ sơ trên điện thoại

Kiểm tra trên Chromium và WebKit ở màn hình 390px tái hiện phần xem trước ảnh đã chọn/đã lưu trong bộ tải nhanh mặc định bị thu lại: có 2 ảnh trong DOM nhưng 0 ảnh đang hiển thị. Khi mở mục đó, ảnh giải mã và hiển thị bình thường. Ảnh trong thư viện hợp đồng, hồ sơ khách và giấy tờ xe cũng tải được trong dữ liệu QA.

Thay đổi:

- Mở sẵn thư viện ảnh đã chọn/đã lưu; người dùng vẫn có thể chủ động thu gọn. Điện thoại hiển thị ảnh theo một cột.
- Thành phần `RecordPhotoImage` dùng chung cho ảnh hồ sơ, thư viện ảnh hợp đồng/Telegram và giấy tờ khách. Khi ảnh lỗi, hiển thị tên ảnh và nút **Tải lại ảnh** ngay tại vị trí đó.
- Tải lại chỉ đọc cùng ảnh qua URL có tham số thử lại; không thay đổi ảnh, hợp đồng, trạng thái xe hoặc phiếu tiền. Bản xem trước ảnh mới chọn vẫn dùng URL blob và không mất tệp khi tải ảnh lỗi.
- CSS riêng giữ kích thước ảnh trong khung điện thoại; nút tải lại có chiều cao tối thiểu 44px.

Kiểm chứng dùng API và ảnh QA, chặn upload/ghi dữ liệu thật:

```text
python scripts/check-mobile-photos-ui.py --url http://127.0.0.1:3029 --session-cookie-file <local-session>
python scripts/check-return-photo-separation-ui.py --url http://127.0.0.1:3029 --session-cookie-file <local-session>
python scripts/check-return-compact-ui.py --url http://127.0.0.1:3029 --cookie-file <local-session> --browser webkit --photos-only
```

Kiểm tra ảnh điện thoại đạt 14 tình huống trên Chromium/WebKit: ảnh hợp đồng, ảnh đã lưu mở sẵn, CCCD/GPLX, giấy tờ xe, ảnh mới chọn từ thư viện, ảnh tải lỗi và thử lại. Kiểm tra kích thước thực, `complete`/`naturalWidth` và ảnh trong viewport, không chỉ đếm thẻ `img`. Kiểm tra lưu ảnh tách khỏi trả xe đạt 6 tình huống trên desktop/mobile: bấm lưu ảnh không tự trả xe, xe đã trả vẫn bổ sung được ảnh mà không quyết toán lần hai.

Ảnh và báo cáo local: `.backups/mobile-photos-20261025/`. Đây là kiểm chứng giao diện với ảnh QA, không kiểm kê từng ảnh trong dữ liệu thật.

Build production gồm lint/typecheck đạt trên `53fd37f` cộng đúng 6 file ứng dụng của bản sửa. Kiểm tra luồng ảnh/trả xe WebKit với `--photos-only` đạt 12 tình huống, gồm giữ ảnh sau lưu lỗi, ảnh QR hoàn tiền, bổ sung 17 ảnh và không trả xe lại. Phần kiểm thử điều chuyển xe cũ dùng giả định quyền của chi nhánh không còn khớp tài khoản QA admin; không sửa quyền ứng dụng trong bản này.
