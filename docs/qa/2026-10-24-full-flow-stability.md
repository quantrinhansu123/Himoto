# Kiểm tra vận hành toàn luồng — 24/10/2026

Nền kiểm tra: `main`, commit `206760d`. Bằng chứng chi tiết ở `.backups/full-flow-20261024/` (ignore; có phiên kiểm thử, không đưa lên Git).

## Lỗi đã sửa

- Danh sách đến hạn đóng tiền từng lấy cả hợp đồng thuê thông thường, kỳ chưa tới hạn và kỳ đã thanh toán. Hiện kiểm tra lịch kỳ và tiền còn phải thu trước khi đếm/phân trang; giữ đầy đủ kết quả qua nhiều trang. Chọn gia hạn thông thường loại trừ hợp đồng có lịch đóng tiền riêng.
- Bộ lọc loại hợp đồng và thời hạn thuê sở hữu được áp dụng trước truy vấn tổng/phân trang. Chi tiết danh sách giữ đúng mã loại, tên loại, thời hạn, lịch kỳ và tiền thuê đã thu riêng với tiền cọc.
- Bộ lọc số ngày quá hạn của xe từng bị bỏ qua ở API phân trang. Hiện tổng kết quả và danh sách dùng cùng điều kiện. Cơ sở hưởng doanh thu đi theo hợp đồng đang thuê, kể cả xe luân chuyển khác cơ sở.
- Sắp xếp danh mục được thực hiện trên toàn bộ kết quả trước phân trang, có ID phụ để giữ thứ tự ổn định. Lọc hợp đồng quá hạn giữ đúng thứ tự theo thời gian quá hạn. Tìm tên không dấu và biển số không dấu chấm/gạch hoạt động; danh mục xe có thể tìm theo khách đang giữ xe.
- Tạo/xóa/sửa khách hàng và cập nhật hợp đồng làm mới cache danh sách phân trang dù collection chưa từng tải đầy đủ. Dùng revision riêng với thời gian cache để hai lần cập nhật liên tiếp vẫn được nhận biết. Đã tái hiện bản cũ: tạo khách thành công nhưng ô tổng vẫn giữ 31 thay vì 32.
- Tổng hợp doanh số chỉ đọc các trường cần tính, lọc cơ sở/ngày trước những phép tổng hợp nặng và dùng ngày Việt Nam. Chờ danh mục nhân viên sẵn sàng để tránh gọi tổng hợp thừa. Kết quả tài chính đã đối chiếu với phép chiếu cũ trên cùng dữ liệu.
- Doanh thu thực thu tính thông tin NVKD/phí ban đầu một lần cho mỗi hợp đồng liên quan, giữ nguyên lịch sử thu của hợp đồng qua các cơ sở trước khi phân bổ phí và lọc ngày. Tránh đọc lặp JSON/phân quyền trên từng phiếu.
- Lỗi cơ sở dữ liệu không trả chi tiết dòng, thông tin kết nối hay thông báo nội bộ về trình duyệt. Giữ thông báo nghiệp vụ và nhóm nguyên nhân cần thiết để thử lại.

Không migration, không sửa dữ liệu nghiệp vụ thật để kiểm thử, không gửi Telegram thật, không gọi OCR/lưu trữ có tính phí trong các kiểm thử giả lập.

## Kiểm tra logic và dữ liệu

- 53/53 script logic đạt trong lượt chạy cuối. Gồm đăng nhập, phân quyền, tải nền/mất mạng, hợp đồng nháp/chốt/cọc giữ xe/gia hạn/trả xe/thu tiền, khách hàng/blacklist/import, sổ quỹ, nhân sự/lịch trực, báo cáo doanh thu/cuối ca, GPS, ảnh/OCR/tài liệu/video và hàng đợi Telegram.
- 38/38 script có fixture cơ sở dữ liệu đạt sau khi cập nhật fixture theo schema/phân quyền hiện hành. Chỉ dùng bảng TEMP hoặc schema kiểm thử riêng; rollback và dùng sequence riêng. Không ghi vào bảng nghiệp vụ thật.
- `check-record-totals.cjs`: 11 nhóm đạt, kiểm tra 5 trang cho từng danh mục, số tổng/trạng thái, sắp xếp, lọc ngày quá hạn, tìm không dấu, khách giữ xe, cơ sở hưởng doanh thu và metadata tổng không hợp lệ.
- `check-contract-list-filters.cjs`: 5 nhóm đạt, gồm 3 trang kỳ đóng tiền, kỳ đã thu/chưa đến hạn, loại/thời hạn và tiền cọc/tiền thuê tách riêng.
- `check-sales-summary.cjs`: 2 nhóm đạt, đối chiếu phép tính cũ trên toàn bộ/chọn cơ sở/cơ sở rỗng, ngày sát 00:00 và 23:59 giờ Việt Nam.
- Đo bằng giao dịch chỉ đọc trên cùng 840 hợp đồng: truy vấn tổng hợp quyền kế toán 5.738 ms → 763 ms; quản trị 1.554 ms → 564 ms; số tiền khớp. Đây là thời gian truy vấn tổng hợp, không phải toàn bộ thời gian mở trang hay cam kết tốc độ mọi mạng.
- Doanh thu thực thu: đối chiếu từng dòng trên cùng 1.065 hợp đồng liên quan, 1.762 dòng kết quả: kế toán 8.495 ms → 1.051 ms; quản trị 1.049 ms → 267 ms; nhân viên cơ sở 429 ms → 129 ms (184 hợp đồng, 253 dòng). Kết quả khớp hoàn toàn. Script TEMP `check-rental-revenue.cjs --live-temp` chạy lại sau tối ưu đạt 5 nhóm, gồm hoàn sớm/thu cọc/gia hạn/phí cũ/lịch sử khác cơ sở.

Một số script cũ cần sửa fixture session, cột ảnh, mock provider, thông báo nghiệp vụ hoặc đóng pool sau kiểm tra. Không bỏ qua assertion nghiệp vụ để che lỗi; thêm kiểm tra không lộ dữ liệu khi thử lỗi DB.

## Kiểm tra giao diện và HTTP

- Đã mở 84 lượt trang trên production với 6 vai trò: nhân viên cơ sở, nhân viên thuê sở hữu, quản lý thuê sở hữu, kế toán, nhân sự, quản trị. Không ghi nhận lỗi JavaScript, API lỗi, cảnh báo giao diện hoặc tràn ngang ở lượt kiểm tra mở trang. Bộ lọc vẫn được kiểm thử riêng vì mở trang thành công không chứng minh đúng nghiệp vụ.
- 15 tình huống tab hợp đồng/giữ form khi gián đoạn; 13 tình huống trả xe/hoàn cọc cho mỗi Chromium và WebKit; 5 tình huống chốt hợp đồng trên WebKit với 22 ảnh xe và 3 tài liệu; 6 tình huống báo cáo nợ chậm/thuê sở hữu trên máy tính và điện thoại đã đạt. API ghi trong trình duyệt được giả lập, không phát sinh chứng từ thật.
- Bản build cuối: `npm.cmd run build` đạt, gồm kiểm tra TypeScript; `npm.cmd run lint` đạt, không lỗi/cảnh báo trong mã nguồn. Next.js vẫn báo cấu hình ESLint chưa nhận plugin Next.js như cấu hình có sẵn.
- Bản build cuối: chạy lại 15 tình huống tab hợp đồng; 10 tình huống bộ lọc thực qua Chromium/WebKit; 7 tình huống danh sách phân trang, CSV toàn tập, retry và tổng 31 → 32 → 31 sau tạo/xóa; 6 tình huống báo cáo vận hành. Tất cả đạt, không lỗi JavaScript và không ghi nghiệp vụ thật.
- Kiểm tra 22 lượt trang trên WebKit 390 px với nhân viên cơ sở, nhân viên thuê sở hữu và kế toán, mở trang qua menu điện thoại: không lỗi JavaScript/API, cảnh báo hoặc tràn ngang. Kiểm tra mở trang và kiểm tra bộ lọc/nghiệp vụ được ghi riêng.
- Sau tối ưu doanh thu thực thu: build lại đạt; chạy 3 nhóm giao diện doanh thu/CSV/lọc ngày/lỗi rồi thử lại/hoàn tiền trên WebKit đạt. Đọc thực bằng quyền kế toán không lỗi; trang doanh thu local hoàn tất tải dữ liệu khoảng 4 giây trong lượt đo cuối. Sổ quỹ toàn hệ thống khoảng 7 giây khi mở, vẫn là trang đọc nhiều dữ liệu; chưa coi mọi trang đều tải dưới 1 giây.
- HTTP dữ liệu thật trên bản local cuối với 5 vai trò: danh sách kỳ đóng tiền không lẫn thuê thông thường, loại không tồn tại trả 0, lọc xe quá hạn 99.999 ngày trả 0, tăng/giảm tên khách trả thứ tự khác nhau và cùng tổng. Không ghi dữ liệu.
- Kết quả kiểm tra sau phát hành và SHA được ghi trong `docs/HANDOFF-2026-10-24-full-flow-stability.md` sau khi Git/Vercel hoàn tất; không coi push thành công là đã cập nhật production.

## Phạm vi xác nhận

Các kết quả trên xác nhận những tình huống đã chạy; không bảo đảm tuyệt đối không còn lỗi ở mọi dữ liệu hoặc dịch vụ bên ngoài. Không thử gửi tin thật vào nhóm, thu/hoàn tiền thật hoặc tải tài liệu khách thật lên OCR chỉ để QA. Form chưa lưu offline qua đóng/tải lại trình duyệt; dùng **Lưu nháp** trước khi rời trang.

Giữ nguyên `.env*`, thay đổi riêng có sẵn ở `scripts/check-contract-support-ui.py`, ảnh/video/PDF/DOCX/HTML và SQL riêng chưa commit.
