# Tiền thuê khi chọn nhiều xe

## Nguyên nhân

Form đã hỗ trợ nhiều dòng xe nhưng công thức tự tính chỉ dùng đơn giá × số kỳ thuê. Số xe đã chọn không nằm trong công thức hoặc điều kiện cập nhật, nên thêm xe không tăng tiền thuê. Bước phát hành tin vào tổng tiền đã lưu trong nháp, trong khi `hiring_fee` vẫn là đơn giá mỗi xe.

## Thay đổi

- Công thức dùng chung: **đơn giá mỗi xe × số kỳ thuê × số xe đã chọn + phí khác**. Tiền cọc tính riêng theo hợp đồng. Dòng xe còn trống không tăng số lượng.
- Áp dụng kỳ ngày, tuần và tháng theo quy tắc làm tròn/neo lịch hiện có. Thêm, bỏ, chọn hoặc xóa lựa chọn xe cập nhật lại tổng; thay đơn giá, thời gian và phí khác cũng cập nhật.
- Hiển thị rõ đơn giá cho mỗi xe và phép tính tiền thuê tại phần Chi phí.
- Không xóa đơn giá nhân viên đã nhập khi kho chung chỉ trả metadata và không có bảng giá. Lưu nháp rồi tải lại giữ giá đã nhập.
- Bước phát hành đối chiếu lại tổng cho hợp đồng nhiều xe có đơn giá dương và gói thuê chuẩn. Nháp cũ mang tiền của một xe bị trả 409, yêu cầu mở lại/lưu lại; chưa tạo dòng thuê, phiếu tiền hoặc chuyển trạng thái xe.
- Mở hợp đồng đã phát hành giữ tổng tiền đã ghi; không cập nhật hồi tố dữ liệu kinh doanh hoặc phiếu tiền. Gói giá tùy chọn và cách lưu tổng tiền hợp đồng trên dòng đầu vẫn giữ quy tắc hiện có.

## Kiểm tra

- `node scripts/check-multi-vehicle-pricing.cjs`: 5 nhóm đạt, gồm số xe thực chọn, dòng trống, ngày/tuần/tháng và năm nhuận, phí một lần, dữ liệu không hợp lệ và tràn số.
- `node scripts/check-contract-finalize.cjs --live-temp`: 11 nhóm đạt trong TEMP rollback. Nháp hai xe mang tiền một xe bị chặn trước phát hành; hai xe × hai ngày × 250.000đ = 1.000.000đ; thêm ship 50.000đ tạo phiếu thuê 1.050.000đ, cọc 1.000.000đ chỉ thu một lần.
- `node scripts/check-split-collections.cjs --live-temp`: 6 nhóm đạt; tiền thu thực nhận, nhiều tài khoản, thanh toán một phần và khoản đã thu trước được giữ đúng.
- `node scripts/check-account-scope.cjs`: 20 nhóm đạt trong schema QA rollback; không ghi dữ liệu kinh doanh hoặc sequence production.
- `python scripts/check-multi-vehicle-pricing-ui.py --session-cookie-file <temporary-session>`: 6 kiểm thử Chrome desktop/WebKit iPhone đạt, không lỗi JavaScript. Bản nháp cũ hai xe tự tính lại; bỏ xe/thêm dòng trống/chọn xe/đổi ngày/giá/phí cập nhật đúng; lưu rồi tải lại giữ đơn giá và tổng; hộp thanh toán nhận cùng số tiền. Tất cả API ghi được mô phỏng, không phát hành hoặc thu tiền thật.
- Typecheck, lint và production build đạt; 3 cảnh báo lint cũ ở `ManagementPage.tsx` và `StaffOrganizationChart.tsx`.

## Thao tác với form đang mở

**Lưu nháp → tải lại trang → Hợp đồng nháp → Tiếp tục sửa bản nháp → Chi phí**. Kiểm tra số xe và phép tính trước khi mở thanh toán.

Đối chiếu chỉ đọc biển `98B2-476.42` chưa tìm thấy bản nháp đã lưu khớp giao dịch trong ảnh; không sửa số tiền của một hợp đồng khác để giả lập đã khắc phục dữ liệu khách.
