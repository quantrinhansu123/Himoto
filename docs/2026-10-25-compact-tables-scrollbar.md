# Bảng gọn và thanh cuộn ngang theo màn hình

- Dùng chung cho bảng quản lý xe, khách hàng, nhân sự, hợp đồng, cơ sở, sổ quỹ, doanh thu, GPS và các bảng cùng cấu trúc. Khoảng cách ô nhỏ hơn; cột loại xe, màu, năm, số km và số ngày quá hạn có độ rộng phù hợp. Số tiền giữ đầy đủ nội dung.
- Thông tin GPS phụ ở bảng xe còn hai dòng gọn; rê chuột xem đủ thời điểm đọc, tín hiệu và vị trí. Tên/nội dung dài có tooltip sẵn; dữ liệu và tùy chọn cột được giữ nguyên.
- `TableScrollDock` nằm trong shell, tự nhận diện bảng đang hiển thị và cần kéo ngang. Dùng thanh cuộn native của trình duyệt, đồng bộ hai chiều với bảng; hỗ trợ kéo chuột, phím trái/phải/Home/End, đổi kích thước, sidebar và ẩn/hiện cột.
- Khi có nhiều bảng, ưu tiên bảng người dùng đang tương tác. Thanh nằm ở mép dưới phần bảng nhìn thấy, không cần xuống cuối danh sách. Bảng trong dialog dùng portal vào dialog để hoạt động trong top layer; thanh tránh footer dialog và thanh điều hướng điện thoại.
- Thanh tự ẩn khi bảng vừa chiều rộng, bị ẩn, cuộn ra khỏi vùng nhìn thấy, đổi trang hoặc gỡ khỏi DOM. Thẻ trên điện thoại và trang in giữ bố cục riêng.

Trong mẫu xe 25 bản ghi ở viewport 1440px: chiều rộng bảng khoảng **1745 → 1459px**, chiều cao hàng **128 → 68px**; không bỏ cột. Ảnh trước/sau và kết quả tại `.backups/table-density-20261025/`.

Kiểm tra giao diện dùng API giả lập, chặn mọi ghi dữ liệu và truy cập nhà cung cấp:

```text
python scripts/check-table-density-ui.py --url http://127.0.0.1:3026 --session-cookie-file <local-session-file>
```

Đã kiểm tra Chrome và WebKit ở desktop 1440/1024px, mobile 390px: năm danh sách chính, cuộn hai chiều, kéo thumb thật trên Chrome, bàn phím, sidebar, ẩn/hiện cột, nhiều bảng, bảng ca, modal, tháo DOM và in. Không có lỗi JavaScript hoặc yêu cầu ghi dữ liệu thật.

Build production gồm lint/typecheck đạt trên worktree từ `f694874` cộng đúng thay đổi của tính năng này. UI kiểm tra lại trên bản production đạt **12 nhóm**; ảnh và JSON ở `.backups/table-density-20261025/release-ui/`. Các phần báo cáo đang sửa dở trong workspace không đi vào gói cập nhật.
