# Báo cáo cuối ca: PGD kiểm kê → KTNB đối soát

Mở `/shift-reports`. Mỗi PGD có một báo cáo mỗi ngày; chọn cơ sở ở thanh trên và lọc ngày / tiến độ trong danh sách.

Video mới hỗ trợ lưu bản chính thức vào CloudFly theo [cấu hình video](cloudfly-videos.md); ảnh và video Cloudinary cũ tiếp tục đọc qua các API hiện có.

## 1. PGD kiểm kê

Nhập ngày, nhân sự, xe thực tế tại PGD, pin / pin đầy, số xe điều chuyển, tiền mặt và số dư tài khoản cá nhân / công ty. Có thể tự điền hoặc nhập số xe thuê ngày / tháng và thống kê hợp đồng / thu chi; nhân sự cần kiểm tra số liệu trước khi chốt. Báo cáo cũ thiếu số liệu vẫn hiển thị chưa ghi nhận.

Xe giữ bên ngoài được ghi từng biển số và lý do; tách khỏi xe có mặt tại PGD. Xe khác (thuê sở hữu, sửa chữa, đang chuyển…) ghi riêng, không cộng trùng. Tổng tài sản = thuê ngày + thuê tháng + tại PGD + giữ bên ngoài + xe khác; ví dụ 16 + 7 + 19 + 1 + 0 = 43.

Mỗi mục cho chọn nhiều ảnh / video. Mỗi phần PGD hoặc KTNB tối đa 60 ảnh và 3 video. Ảnh JPEG/PNG/WebP được xử lý xuống tối đa 2 MB; ảnh gốc tối đa 30 MB. Video MP4/MOV/WebM tối đa 45 MB, 3 phút; tải trực tiếp vào Cloudinary dạng authenticated, xác minh chữ ký, kích thước, định dạng và thời lượng trên máy chủ. Tệp chỉ đọc qua phiên đăng nhập trong phạm vi PGD. Ảnh cũ vẫn giữ nguyên và xem được trong báo cáo.

Lưu nháp giữ dữ liệu và tệp trên hệ thống. Chốt cần xác nhận tắt điện và thông tin báo cáo hợp lệ; ảnh/video minh chứng không bắt buộc. Video là minh chứng bổ sung. Sau chốt, dữ liệu và minh chứng PGD chỉ được xem.

Khi chốt, hệ thống thử lưu ảnh chụp số kho app tại thời điểm đó, độc lập với truy vấn tài chính. Lỗi chụp kho không làm mất / hoàn tác bản kiểm kê và minh chứng đã xác nhận; KTNB sẽ thấy thiếu nguồn kho nếu không có bản chụp. Không lấy tồn kho hiện tại làm số tồn quá khứ.

## 2. KTNB đối soát

Chọn **Đối soát KTNB** trên báo cáo PGD đã chốt. So sánh bốn cột độc lập: PGD, App, Sổ, KTNB kiểm tra. Số PGD được giữ nguyên; số sổ và số KTNB nhập độc lập. Hiển thị số chênh lệch với từng nguồn, không chỉ gắn nhãn “khớp”. Ví dụ PGD 64.300.134đ và KTNB 64.710.134đ hiển thị lệch 410.000đ.

Nguồn app gồm kho đã chụp, doanh thu ngày và lũy kế từ đầu tháng đến ngày báo cáo, số dư sổ quỹ và điều chuyển có biển số / nơi đi / nơi đến. Doanh thu thuê xe = thuê + gia hạn + phí trả muộn − hoàn tiền thuê trả sớm, theo ngày thu / hoàn tiền thực tế ở múi giờ Việt Nam; không gồm cọc, hoàn cọc, sửa chữa hay khoản phí khác. Đọc toàn bộ lịch sử thu của các hợp đồng phát sinh trong kỳ để phân bổ phí cũ đúng, kể cả giao dịch qua cơ sở khác.

Số dư app là số dư đầu kỳ cộng phiếu thu / chi đã duyệt đến hết ngày, chỉ tính tài khoản gắn PGD; tài khoản công ty dùng chung không tự phân bổ. Đây không phải số dư ngân hàng trực tiếp. Nguồn thiếu được hiển thị “Chưa có”, không thay bằng 0. Kho hiện tại chỉ dùng cho ngày hiện tại; báo cáo cũ không có bản chụp kho cần đối chiếu chứng từ và giải trình.

KTNB có thể lưu nháp, thêm minh chứng riêng, rồi xác nhận. Cần đủ số Sổ / KTNB, biển số và lý do cho xe bên ngoài, giải trình từng khoản lệch / thiếu nguồn app và điều chuyển khác app. Giao dịch chưa phân loại cần ghi kết quả kiểm tra. Kết quả phân biệt **Khớp** và **Có giải trình**; không tự đổi khoản lệch thành khớp. Sau xác nhận khóa kết quả và minh chứng KTNB, lưu người / thời điểm xác nhận và bản chụp số app. Có nội dung báo cáo để sao chép gửi / lưu.

Nếu số app hoặc minh chứng thay đổi trong lúc kiểm tra, lần xác nhận cũ bị từ chối. Lấy lại số app hoặc mở lại báo cáo để rà trước khi lưu. Mọi thao tác ghi dùng mã riêng và kết quả xác nhận trong cùng transaction: mất phản hồi có thể thử lại đúng bước, không tạo trùng hay tự bỏ kiểm soát phiên bản. Form giữ dữ liệu/tệp khi chưa xác nhận; chuyển mục qua menu hỏi trước khi bỏ thay đổi và bị chặn khi đang lưu.

## Phân quyền và triển khai

PGD cần quyền xem hợp đồng và lập nháp hoặc thu/chi để lập kiểm kê. KTNB dùng quyền `shift.review` riêng; vai trò **Kiểm toán nội bộ (KTNB)** có quyền đọc hợp đồng / xe / sổ quỹ và đối soát, không có quyền sửa hợp đồng hay thu/chi. Quản trị viên cấp vai trò hoặc quyền này tại Tài khoản & Phân quyền; không tự thay quyền tài khoản đang dùng. Phạm vi cơ sở được áp dụng ở API và PostgreSQL RLS.

Áp dụng migration trước khi triển khai:

```powershell
node scripts/migrate-shift-reports.cjs --apply
# Nếu đã có bảng kiểm kê / ảnh, chỉ bổ sung các bảng xác nhận và KTNB:
node scripts/migrate-shift-reports.cjs --apply --requests-only
```

Script áp dụng `2026-10-22-shift-reports.sql`, `2026-10-22-shift-report-requests.sql`, `2026-10-22-shift-audits.sql`; lặp lại an toàn. Không tự nhập mẫu Hà Đông, ảnh, video hoặc xác nhận bất kỳ báo cáo nào. Tải lại tab cũ để dùng giao diện mới.

## Kiểm tra

`node scripts/check-shift-audits.cjs` kiểm tra công thức, thiếu nguồn, số chênh lệch, số kho và phân quyền. `node scripts/check-shift-report-retries.cjs` chạy transaction / RLS trên PostgreSQL TEMP rồi rollback toàn bộ, không ghi dữ liệu nghiệp vụ. `node scripts/check-rental-revenue.cjs --live-temp` kiểm tra thu / hoàn thực tế và lịch sử khác cơ sở. Hai script `check-shift-audits-ui.py` và `check-shift-report-retries-ui.py` dùng `--url`, `--cookie-file`, `--browser chromium|webkit`; toàn bộ API nghiệp vụ và Cloudinary được mô phỏng.

## Tự điền và điều hướng

Mỗi tab có nút **Tự điền từ DB**, lấy theo PGD và ngày ở tab Thông tin. Nút chỉ điền phần đang chọn, chưa lưu báo cáo; có thể kiểm tra/sửa trước khi lưu. Đã thay nút điền mẫu bằng dữ liệu DB. Thay PGD/ngày của báo cáo đã lưu bằng cách tạo báo cáo mới.

Nguồn tự điền:

- **Thông tin:** tên nhân sự trong lịch trực giao với ngày báo cáo, bao gồm ca qua đêm.
- **Tổng kết xe:** nút riêng chỉ lấy số xe hiện tại của cơ sở chọn trong tab Thông tin: xe thuê ngày/tháng từ hợp đồng đang thuê và các dòng xe chưa trả, xe lưu kho từ danh sách xe có `status=ready`. Phân loại ưu tiên loại hợp đồng (`daily`, `monthly`, `monthly_*`), dòng day/month dùng cho dữ liệu cũ thiếu loại; loại thuê sở hữu không gộp vào thuê tháng. Mỗi xe được đếm một lần theo dòng thuê hiện tại mới nhất. Tổng tự tính = thuê ngày + thuê tháng + lưu kho. Việc chọn ngày báo cáo không chuyển nguồn xe sang bản kiểm kê cũ.
- **Pin và điều chuyển:** có nút tự điền riêng; lỗi hai phần này không chặn nút tổng kết xe. Pin/pin đầy lấy từ số kiểm kê đã lưu đúng PGD/ngày (ngày quá khứ dùng báo cáo đã chốt). Không suy đoán tồn pin hay mức sạc từ hợp đồng thuê pin. Điều chuyển lấy lượt chuyển đi trong ngày.
- **Hợp đồng & thu chi:** đếm hợp đồng xe bắt đầu thuê trong ngày và trạng thái hiện tại; tổng thu/chi từ phiếu approved trong ngày Việt Nam. Thu cọc gồm các tên nghiệp vụ cọc; gia hạn nhận cả phiếu liên kết snapshot gia hạn; hoàn cọc/trả sớm/phạt muộn lấy theo phiếu đã duyệt. Tổng thu/chi còn có thể bao gồm các khoản khác, không ép bằng tổng các ô chi tiết.
- **Tài khoản:** cộng số dư đầu kỳ và biến động đã duyệt đến hết ngày báo cáo (hôm nay tính đến hiện tại) của tài khoản đang hoạt động gắn PGD; không lấy tài khoản Công ty dùng chung không có PGD. Thiếu tài khoản hoặc số dư âm không bị thay bằng 0; giữ nguyên ô và hiển thị thông báo. Tiền mặt lấy từ sổ quỹ để đối chiếu với thực đếm, không xác nhận đã kiểm kê.
- **An toàn:** lấy danh sách thiết bị từ báo cáo đã chốt gần nhất không sau ngày chọn; không tự xác nhận tắt điện, không tự ghi Không cho bất thường, không sao chép ảnh.

API `/api/auth/shift-reports/autofill` chỉ đọc, dùng transaction nhất quán, timeout 15 giây, kiểm tra phân quyền và phạm vi PGD. Mất kết nối giữ nguyên các giá trị trong form. Kết quả ghi rõ nguồn và thời điểm đọc. Không cần migration mới.

Danh sách và chi tiết được tách riêng; kiểm kê xe, pin, điều chuyển có các tab con. Các số tự điền cần được nhân sự kiểm tra; không tự xác nhận kết quả KTNB.
