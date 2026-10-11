# Giao diện mobile — 11/10/2026

Tài liệu này ghi đợt sửa ngày 11/10. Giao diện hiện tại ngày 12/10 đã chuyển danh sách, Sổ quỹ, các tab liên quan và đối chiếu Excel sang thẻ mobile; mẫu in có xoay/phóng to. Xem [bản cập nhật và kết quả kiểm tra](ui-redesign.md).

Tối ưu màn hình đăng nhập và toàn bộ trang quản lý: xe, khách hàng, hợp đồng/VAT/Log, cơ sở, nhân sự, lịch trực và sổ quỹ. Chỉ sửa phần trình bày; giữ nguyên API, nghiệp vụ, cache, dynamic import và mẫu in hợp đồng.

## Thay đổi

- Vùng bấm chính tối thiểu 44px; ô nhập liệu và select dùng chữ 16px trên mobile/thiết bị cảm ứng.
- Thanh điều hướng cố định trên điện thoại, chọn cơ sở đọc được đầy đủ hơn, menu điều hướng có vùng cuộn để vẫn tới được mục cuối khi xoay ngang.
- Nút đầu trang, bộ lọc, ngày và phân trang xuống dòng theo màn hình. Menu chọn cột/tài khoản và menu thao tác có giới hạn vùng cuộn.
- Bảng giữ đủ cột, có hướng dẫn vuốt và vùng cuộn riêng. Cột mã bản ghi/ID sổ quỹ được giữ khi cuộn trên điện thoại; cột thao tác vẫn truy cập được.
- Dialog dùng bề ngang màn hình điện thoại, chừa safe area, footer dễ bấm; tabs hợp đồng nằm trên một hàng cuộn ngang và giữ điều hướng bằng bàn phím.
- Form tra cứu, nhập Excel, thanh toán/QR và lịch trực dùng bố cục phù hợp với màn hình nhỏ. Sơ đồ nhân sự xếp dọc theo nhóm trên điện thoại.
- Đăng nhập dùng ô nhập liệu và nút lớn hơn, giữ nguyên logo, hình ảnh và chức năng hiện có.

## Phạm vi

- `src/styles/management.css`, `src/styles/login.css`.
- `src/components/management/DataTable.tsx`: hướng dẫn cuộn trên điện thoại và class cột mã; ẩn cột mã không ghim nhầm cột khác.
- `src/components/management/RowActionsMenu.tsx`: chiều cao menu theo vị trí và khoảng trống viewport; mục được chọn bằng bàn phím tự cuộn vào vùng nhìn thấy.
- `scripts/check-management-mobile-ui.py`: kiểm tra bố cục, vùng bấm, chữ trong ô nhập liệu, menu, tabs và dialog bằng API mô phỏng.

## Kiểm chứng

- `npm.cmd run lint:management`: qua, 0 lỗi (1 cảnh báo hook có sẵn trong `ContractComposer.tsx`).
- `npm.cmd run typecheck`: qua, 0 lỗi.
- `npm.cmd run build`: qua, biên dịch tối ưu 24 static pages.
- `npm.cmd run test:management-loading`: 12/12 nhóm qua.
- `npm.cmd run test:vehicles`: 6/6 nhóm qua.
- `npm.cmd run test:cashbook`: 6/6 nhóm qua.
- `scripts/check-management-mobile-ui.py`: 15/15 nhóm qua, kiểm tra 54 lượt màn hình trên 9 route ở 6 kích thước (320px, 375px, 390px, 430px, 768px và 812x375 xoay ngang):
  - 100% không tràn ngang toàn trang (`pageOverflow = false`).
  - Vùng bấm chính đạt chuẩn tối thiểu 44px, ô nhập liệu 16px tránh tự động zoom trên iOS Safari.
  - Menu thao tác, bộ chọn cột, 5 tabs hợp đồng, dialog footer và thanh điều hướng đều hoạt động mượt mà bằng phím lẫn cảm ứng.
  - Form chi tiết xe/khách/cơ sở/nhân sự hiển thị vừa vặn trong màn hình.
  - 0 lỗi JavaScript, 0 ghi dữ liệu nghiệp vụ thật.

## Ảnh đối chiếu trước và sau khi tối ưu

| Màn hình | Trước tối ưu (375px) | Sau tối ưu (375px) | Sau tối ưu (Tablet 768px) |
| :--- | :--- | :--- | :--- |
| **Danh sách xe** | [Trước](qa/mobile/before-vehicles-375.png) | [Sau](qa/mobile/vehicles-375.png) | [Tablet](qa/mobile/vehicles-768.png) |
| **Khách hàng** | — | [Sau](qa/mobile/customers-375.png) | [Tablet](qa/mobile/customers-768.png) |
| **Form hợp đồng (Tab KH)** | [Trước](qa/mobile/before-composer-customer-375.png) | [Sau](qa/mobile/composer-customer-375.png) | [Tablet](qa/mobile/composer-customer-768.png) |
| **Nhân sự & Cơ cấu** | [Trước](qa/mobile/before-staff-375.png) | [Sau](qa/mobile/staff-375.png) | [Tablet](qa/mobile/staff-768.png) |
| **Lịch trực cơ sở** | [Trước](qa/mobile/before-duty-roster-375.png) | [Sau](qa/mobile/duty-roster-375.png) | [Tablet](qa/mobile/duty-roster-768.png) |
| **Sổ quỹ** | — | [Sau](qa/mobile/cashbook-375.png) | [Tablet](qa/mobile/cashbook-768.png) |
