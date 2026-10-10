# Tải dữ liệu theo chức năng — 2026-10-10

Trang quản lý trước đây luôn đọc cả 5 danh mục và xóa dataset trước mỗi lần làm mới. Hiện tại:

| Trang | Dữ liệu tải khi mở |
| --- | --- |
| Xe | Cơ sở, xe |
| Khách hàng | Cơ sở, khách hàng |
| Nhân sự / lịch trực | Cơ sở, nhân sự; lịch trực vẫn đọc theo tuần và cơ sở |
| Hợp đồng / VAT / Log | Cơ sở, hợp đồng |
| Cơ sở | Cơ sở |
| Sổ quỹ | Cơ sở, giao dịch |

`data-loader.ts` giữ cache trong provider của phiên hiện tại, tái sử dụng dữ liệu tối đa 30 giây rồi tải lại khi vào trang hoặc mở chức năng. Nút làm mới luôn bỏ qua cache. Request đang chạy được gộp; bảng được giữ trong lúc tải. Lỗi chỉ ảnh hưởng danh mục liên quan. Thay đổi đã lưu không bị response cũ ghi đè.

Nút làm mới tải riêng danh mục đang xem. Sau trả/đổi xe, danh sách hợp đồng được tải lại; cache xe và khách hàng được đánh dấu cần cập nhật ở lần sử dụng tiếp theo. Nhập Excel cũng chỉ tải lại danh mục vừa thay đổi.

Form và hộp thoại được tách bằng dynamic import. Form hợp đồng chỉ đọc dữ liệu bổ sung khi mở, nhân sự được lọc theo cơ sở trong SQL. Chi tiết hợp đồng dùng thông tin xe, người đại diện và trạng thái khách hàng có sẵn trong bản ghi. Tab hợp đồng và thanh toán của khách hàng gọi API theo `customer_id`, thay vì đọc toàn bộ hợp đồng.

## Kiểm chứng

- `npm.cmd run test:management-loading`: 12 nhóm kiểm tra cache, tải riêng danh mục, lỗi, cập nhật và API lọc có tham số.
- `scripts/check-management-loading-ui.py`: 9 tình huống trình duyệt, gồm số request, giữ bảng khi tải, tab chi tiết, form, chuyển trang nhanh, mobile và trả/đổi xe mô phỏng. API nghiệp vụ được intercept; không ghi dữ liệu thật.
- Kiểm tra API với database thật: đọc hợp đồng, hợp đồng của một khách, nhân sự của một cơ sở và từ chối ID không hợp lệ; chỉ dùng GET.
- Production build và TypeScript qua. Build còn cảnh báo hook `pricingVehicle` có sẵn trong `ContractComposer.tsx`.
- `npm.cmd run test:vehicles`: 6 nhóm qua; fixture đã đủ giá ngày/tháng, kiểm tra giá trống/0/số nguyên an toàn và các cột Excel. Chế độ `node scripts/check-vehicle-import.cjs --live-temp` qua 11 nhóm, dùng bảng PostgreSQL TEMP trong transaction rồi rollback; không ghi dữ liệu nghiệp vụ lâu dài.
- `scripts/check-contract-layout-ui.py`: 7 nhóm qua với selector input/datalist và menu thao tác hiện tại; kiểm tra tiền tự tính, lưu nháp/lỗi xung đột, mở lại dữ liệu, bàn phím/mobile và PDF 1/2 trang A4 ngang. API ghi được mô phỏng, không ghi dữ liệu thật.
- `npm.cmd run test:drafts`: 5 nhóm qua. Form lưu nháp kiểm tra nhân sự bằng danh sách đã tải của cơ sở, không phụ thuộc danh mục nhân sự toàn hệ thống.

Trình duyệt xác nhận lần đầu mở trang xe có 2 request danh mục thay vì 5; làm mới chỉ có 1 request xe. Đây là giảm số request, chưa phải phép đo thời gian tải trên production.

Hai kiểm tra cũ sau lần pull đã được cập nhật và chạy qua. Các kiểm tra dữ liệu, validation và mẫu in được giữ; bổ sung assertion ID nhân sự trong payload lưu nháp và giữ nguyên giá khi file nhập để trống.

Prompt dành cho lượt cải thiện giao diện, giới hạn CSS/JSX trình bày và giữ nguyên phần tối ưu: [UI-REDESIGN-PROMPT.md](UI-REDESIGN-PROMPT.md).
