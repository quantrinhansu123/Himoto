# Giao diện HIMOTO — 2026-10-10

Giao diện quản lý và đăng nhập dùng màu vàng thương hiệu trên nền trắng/xám, hệ token CSS thống nhất, bảng và bộ lọc gọn hơn, sidebar/topbar rõ trạng thái đang chọn, form/dialog thích ứng với màn hình nhỏ.

Thay đổi ứng dụng chỉ nằm trong `src/styles/management.css` và `src/styles/login.css`. Giữ nguyên API, logic nghiệp vụ, cache, tải dữ liệu theo trang/tab/cơ sở và mẫu in hợp đồng.

## Các lỗi đã sửa sau review

- Ẩn nút mở menu mobile ở desktop; menu vẫn hoạt động ở tablet/mobile.
- Giữ chữ tối trên nút vàng khi hover; tăng độ tương phản của placeholder và một số nhãn phụ. Hai cặp màu chính đã sửa là `#1e293b` trên `#d97706`, và `#64748b` trên nền trắng.
- Khai báo token `--mg-shadow-dialog` để shadow của dialog hiển thị đúng.

## Kiểm chứng

- `npm.cmd run lint:management`: qua, còn cảnh báo hook `pricingVehicle` có sẵn trong `ContractComposer.tsx`.
- `npm.cmd run typecheck` và `npm.cmd run build`: qua.
- `npm.cmd run test:management-loading`: 12 nhóm qua.
- `npm.cmd run test:vehicles`: 6 nhóm qua.
- `scripts/check-management-loading-ui.py`: 9 nhóm qua, gồm tải riêng danh mục, giữ bảng khi refresh và cache theo tab.
- `scripts/check-contract-layout-ui.py`: 7 nhóm qua, gồm bàn phím, validation, lưu/mở nháp mô phỏng và PDF A4 ngang 1/2 trang.
- Kiểm tra 9 trang quản lý ở 1440/768/375px: 27 màn hình không tràn ngang toàn trang, không có lỗi JavaScript. Kiểm tra thêm menu mobile, màu nút khi hover, shadow dialog và đăng nhập ở ba kích thước.

QA chạy trên production build cục bộ, Chromium, với API nghiệp vụ được mô phỏng; không tạo hoặc sửa dữ liệu nghiệp vụ thật. Chưa kiểm tra Safari/Firefox hay đo thời gian tải trên Vercel.

## Ảnh giao diện sau sửa

Ảnh dùng dữ liệu QA mô phỏng, tên tài khoản đã ẩn.

| Màn hình | 1440px | 768px | 375px |
| --- | --- | --- | --- |
| Danh sách xe | [Ảnh](qa/redesign/vehicles-1440.png) | [Ảnh](qa/redesign/vehicles-768.png) | [Ảnh](qa/redesign/vehicles-375.png) |
| Form hợp đồng, tab khách hàng | [Ảnh](qa/redesign/form-customer-1440.png) | [Ảnh](qa/redesign/form-customer-768.png) | [Ảnh](qa/redesign/form-customer-375.png) |
| Đăng nhập | [Ảnh](qa/redesign/login-1440.png) | [Ảnh](qa/redesign/login-768.png) | [Ảnh](qa/redesign/login-375.png) |
