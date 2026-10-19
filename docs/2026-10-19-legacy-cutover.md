# Đối chiếu dữ liệu vận hành ngày 19/10/2026

Người dùng xác nhận nhân viên tiếp tục vận hành trên `app.himoto.vn` sau bản sao lưu 15/10 và chọn dữ liệu app cũ khi có xung đột. Đã đối chiếu bằng truy vấn chỉ đọc trên nguồn; mốc chụp bổ sung cuối là **09:58:39 ngày 19/10/2026, giờ Việt Nam**. Đây là đối chiếu tại một thời điểm, không phải đồng bộ hai chiều liên tục.

## Kết quả đã áp dụng

- 296 hợp đồng hiện hành của nguồn được thể hiện trên bản mới, kiểm tra độc lập 304 dòng xe, trạng thái, cơ sở, tổng tiền, số phiếu và tổng thu/chi nguồn. Hồ sơ đã sửa thật trên app mới #56109 được giữ để đối chiếu thay vì ghi đè.
- 207 hợp đồng nguồn từng bị nhập thành nháp được chuyển về trạng thái thực tế. Các nháp hợp lệ khác của app mới được giữ.
- Chỉ cất 5 hợp đồng thử mà người dùng xác nhận: #29138, #29140, #29145, #57498, #57500. Hủy hiệu lực 11 phiếu của chúng, giữ nguyên bản ghi, số tiền và nhật ký.
- 4 xung đột khác khách được xử lý theo nguồn: cất bản mới #57501, #57512, #29135, #57507 và giữ hợp đồng nguồn tương ứng. Không chuyển giấy tờ giữa các khách khác nhau.
- 4 lần thuê trùng giữa hai app được gộp vào ID gốc trên bản mới: nguồn 32096 → #57504; 32110 → #57509; 32073 → #57502; 32107 → #57505. Cùng khách theo ánh xạ CCCD, cùng xe, trùng kỳ thuê và khớp tiền là điều kiện gộp. Giữ số giấy, chữ ký, nhân viên và ảnh của bản gốc; dùng trạng thái, thời gian, phiếu của nguồn. Cất bản nhập nguồn trùng, giữ nguyên trong lịch sử đối chiếu.
- 17 phiếu nhập tại app mới thuộc 8 trường hợp vừa đối chiếu được hủy hiệu lực, không xóa hoặc đổi số tiền. Phiếu nguồn được giữ, không tạo phiếu bù hoặc chuyển tiền thật. 2 phiếu gia hạn phát sinh thêm trên app cũ trước mốc cuối được nhập đúng bản gốc.
- Giữ riêng các hợp đồng thật của cùng khách nhưng khác xe; đặc biệt #57503 và #57506 không bị gộp. Hợp đồng #57506 giữ nguyên số 007180 và trạng thái Telegram chưa chắc chắn.
- Đã sửa 145 vị trí xe trong đợt đầu. Phiếu điều chuyển đang chờ của xe #245 được đánh dấu đã thay thế bởi quyết định đối chiếu theo nguồn, giữ lịch sử, không ghi nhận giả việc cơ sở đến đã nhận xe. Luồng điều chuyển thông thường vẫn bắt buộc bên nhận xác nhận.

Kho vận hành hiện có 361 xe, khớp cơ sở của toàn bộ 361 xe thuộc phạm vi nguồn:

| Cơ sở | App cũ | Bản mới |
| --- | ---: | ---: |
| Giáp Bát | 41 | 41 |
| Láng | 40 | 40 |
| Nguyễn Hoàng | 81 | 81 |
| Hà Đông | 42 | 42 |
| Hàng Bút | 32 | 32 |
| Thuê sở hữu / Thuê pin | 125 | 125 |
| Tổng | 361 | 361 |

9 hồ sơ xe lịch sử/ngoài phạm vi được giữ với cơ sở 0 (ngoài kho vận hành), không xóa hoặc giả là đã bán: 2 xe không có ánh xạ nguồn, 6 xe đang ở cơ sở nguồn ngoài phạm vi, 1 xe đã bị bỏ khỏi danh mục nguồn. Danh sách kho vận hành và kho chung loại các hồ sơ này; lịch sử hợp đồng vẫn giữ liên kết. Xe #781 giữ trạng thái đang thuê do có hợp đồng thật riêng trên bản mới, dù nguồn đang ghi lưu kho. Không tự đóng hợp đồng nguồn khi xe được ghi lưu kho.

## Giới hạn dữ liệu nguồn

229 hồ sơ cần đối chiếu, trong đó **216 đang mở**. Có các lý do chồng lấp: tổng thu ghi trên hợp đồng khác tổng phiếu nguồn, thiếu lịch đóng tiền sở hữu, hợp đồng nguồn trùng xe, xe nguồn bị thiếu, thuê pin, hoặc có sửa đổi thật trên app mới. Sao chép đúng nguồn không xác nhận được công nợ thực tế của các hồ sơ này.

Ứng dụng hiện thông báo lý do và không suy diễn số tiền đã trả; chặn thu/chi, trả hoặc đổi xe khi hồ sơ chưa được xác minh. Không tự tạo lịch đóng tiền sở hữu hoặc phiếu bù. File đối chiếu riêng có từng hợp đồng và nguyên nhân; các ảnh và dữ liệu khách không được đưa vào Git.

Sửa cách xác định giá ngày: `hiring_fee` của app cũ là tiền cả kỳ. Ưu tiên `substitute_unit_price` là giá ngày; chỉ chia tiền cả kỳ khi số ngày nguyên và chưa gia hạn. Kỳ có phần giờ hoặc gia hạn thiếu đơn giá cần xác nhận, không dùng tổng kỳ làm giá ngày. Dòng hợp đồng tạo mới giữ cách tính hiện hành.

## Bằng chứng và khả năng khôi phục

Hai batch riêng trong `himoto.legacy_migration_batches`: `himoto-cutover-20261019` và `himoto-cutover-resolution-20261019`. Mỗi batch lưu SHA-256 nguồn, kế hoạch chính xác, bản trước sửa và kiểm tra; batch sau lưu ánh xạ hợp đồng gốc. Các bản sao riêng và báo cáo nằm tại `.backups/cutover-20261019/` và `.backups/cutover-resolution-20261019/`, được Git bỏ qua.

Chạy kế hoạch trên bảng tạm trước khi áp dụng, không tiêu thụ sequence thật trong QA. Khi áp dụng có khóa, kiểm tra phiên bản trước sửa, namespace chống chạy lại, so sánh hash các hàng ngoài phạm vi, kiểm tra quan hệ và số liệu nguồn độc lập. 138 bản ghi ảnh và 12 thông báo Telegram không thay đổi trong đợt xử lý cuối. Không gửi Telegram thật, tạo giao dịch tiền thật hoặc sửa app nguồn trong kiểm thử.

Kiểm tra mã: typecheck, lint, build; `check-legacy-cutover.cjs --live-temp` và `check-vehicle-transfers.cjs`. Kiểm tra vận hành bổ sung bằng GET trên bản triển khai với tài khoản từng cơ sở, đối chiếu hợp đồng/kho/phiếu và kiểm tra trình duyệt chỉ đọc.
