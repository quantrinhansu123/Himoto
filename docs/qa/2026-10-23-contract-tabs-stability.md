# Tab hợp đồng và giữ trạng thái — 23/10/2026

## Hành vi

- Danh sách hợp đồng, VAT và thuê sở hữu có năm tab cố định: **Tất cả → Đang thuê → Nháp → Quá hạn → Hoàn thành**. Tab không biến mất khi trang hiện tại không có dòng thuộc trạng thái đó. Các trạng thái nghiệp vụ khác vẫn chọn được trong bộ lọc nâng cao.
- Mở trang chỉ gọi danh sách của tab đang chọn. Tab mới được tải khi bấm; các trang đã tải được tái sử dụng trong 30 giây, theo đúng bộ lọc/cơ sở/phân trang. Không tải số đếm của các tab chưa mở.
- Trạng thái tab được ghi trong `?status=...`; tải lại trang giữ tab đó. Chuyển tab không gọi lại server layout. Phản hồi đã hủy hoặc thuộc bộ lọc trước không được thay dòng của tab hiện tại.
- Khi làm mới cùng tab, giữ các dòng đã tải. Nếu API lỗi, hiện thông báo và nút thử lại, không xóa form đang nhập. Tab mới lỗi chỉ hiện lỗi của chính tab đó.
- Lọc quá hạn/kỳ thanh toán và nhóm tuổi nợ trước khi phân trang, đọc ứng viên theo lô tối đa 50 dòng. Lỗi tải chi tiết được trả về để thử lại, không báo thành công với dữ liệu tải dở.
- Thuê sở hữu luôn có **Ngày bắt đầu thuê** và **Dự kiến trả xe**, gồm thẻ điện thoại và bảng desktop. Ngày lấy từ đầu hợp đồng; nếu trống thì dùng min ngày thuê/max ngày trả đã lưu ở các dòng xe chưa xóa, cùng quy tắc với danh sách chi tiết. Không cập nhật hay suy đoán ngày trong DB.
- Lỗi DB khi xác thực trang không còn bị coi là phiên hết hạn. Phiên thực sự không hợp lệ vẫn về login; DB gián đoạn hiện trang thử lại. Kiểm tra phiên khi quay lại app được gộp và giới hạn mỗi 15 giây. Luồng điều khiển nội bộ của Next.js vẫn được ném lại; trang quản lý luôn render theo request.
- GPS tiếp tục nhịp 5 giây; việc tải toàn bộ kho xe tái sử dụng cache 30 giây thay vì ép tải lại mỗi nhịp GPS.

Các thay đổi không thêm cơ chế lưu form offline. Giữ nội dung khi mất focus/lỗi đọc nền đã được kiểm tra; muốn giữ qua đóng hoặc tải lại trình duyệt vẫn dùng **Lưu nháp** trên hệ thống.

## Kiểm tra đã đạt

- `npm.cmd run build`: đạt; các trang quản lý là dynamic. Còn cảnh báo có sẵn ở `StaffOrganizationChart.tsx`; lint riêng các tệp sửa không có lỗi/cảnh báo.
- `npm.cmd run typecheck`: đạt.
- `node scripts/check-contract-tabs.cjs`: 4 nhóm kiểm tra, gồm truy vấn riêng từng tab, lọc trước phân trang, lỗi tải dở và phân biệt lỗi DB/phiên/luồng điều khiển Next.js.
- Hồi quy: `check-management-table`, `check-contract-monitoring`, `check-management-table-timeouts`, `check-management-login`, `check-management-loading`, `check-account-scope`, `check-contract-drafts`: đạt. Kiểm tra phân quyền DB dùng schema kiểm thử và rollback; không sửa bản ghi/sequence nghiệp vụ.
- `python -X utf8 scripts/check-contract-tabs-ui.py --outage-url http://127.0.0.1:3022 --output .backups/lazy-contract-tabs-20261023/production-ui`: **14 tình huống đạt trên bản production build local**, Chromium desktop và WebKit điện thoại, với quản trị/vận hành, nhân viên thuê sở hữu và quản lý thuê sở hữu.
- Trình duyệt giả lập API, chặn toàn bộ thao tác ghi. Kiểm tra riêng server có DB cố ý không truy cập được: cookie hợp lệ giữ URL và hiện thử lại; không có cookie vẫn bị chặn.
- Đọc thật Supabase: 15 tổ hợp quyền/tab chạy được. Sau khi sửa nguồn ngày, kiểm tra thêm Tất cả/Hoàn thành/Quá hạn theo hai quyền thuê sở hữu: **10/10 dòng mỗi trang đủ hai mốc ngày**, khoảng **211–273 ms** mỗi lượt đọc. Không ghi dữ liệu nghiệp vụ.

Kết quả và ảnh QA nằm trong `.backups/lazy-contract-tabs-20261023/` bị Git bỏ qua; không commit cookie kiểm thử. Chưa triển khai lên `himoto.vercel.app`.
