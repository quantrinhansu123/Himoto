# Báo cáo cuối ca

Tổng kết xe cuối ngày = xe cho thuê ngày + xe cho thuê tháng + xe lưu kho thực tế. Ví dụ 16 + 7 + 20 = 43 xe. Hai trường xe cho thuê được nhập và lưu cùng báo cáo, tổng tự tính; báo cáo cũ thiếu số liệu không hiển thị tổng giả định. Không cộng lại số xe điều chuyển vào tổng.

Phần Pin cửa hàng gồm ba cột: tổng số pin tại cửa hàng, trong đó pin đầy, pin đã cho thuê. Pin đã cho thuê được lưu riêng, không bị giới hạn bởi số pin tại cửa hàng; nút tự điền lấy số hợp đồng thuê pin đang thuê của cơ sở được chọn, mỗi hợp đồng tương ứng một pin. Báo cáo cũ chưa có trường này vẫn mở được.

Tab **Báo cáo cuối ca** tại `/shift-reports` dành cho người có quyền xem hợp đồng. Người có quyền lập hợp đồng nháp hoặc thu/chi được tạo và chốt báo cáo trong PGD được phân công.

Trang mở vào **Danh sách báo cáo** gồm bản nháp và báo cáo đã chốt, theo cơ sở đang chọn trên thanh điều hướng. Bấm **Mở báo cáo** để xem/sửa, bấm **Danh sách báo cáo** để quay lại. Sau khi chốt thành công, tự quay về danh sách và tải lại dữ liệu. Báo cáo đang soạn được giữ trong bộ nhớ khi chuyển giữa danh sách và chi tiết.

Áp dụng bảng dữ liệu trước khi sử dụng:

```powershell
node scripts/migrate-shift-reports.cjs --apply
```

Mỗi PGD có một báo cáo mỗi ngày. Chọn PGD, ngày, nhập nhân sự, số xe lưu kho, tổng pin/pin đầy, xe điều chuyển, tiền mặt và số dư hai loại tài khoản. Số tiền tính bằng đồng; số lượng và số tiền là số nguyên không âm.

Lưu nháp giữ dữ liệu và ảnh trên hệ thống. Ảnh đính kèm (xe, pin, tiền mặt, tài khoản cá nhân, tài khoản Công ty, khóa cửa) không bắt buộc khi chốt. Chốt chỉ yêu cầu xác nhận tắt điện và thông tin báo cáo hợp lệ. Báo cáo đã chốt chỉ được xem. Kiểm soát phiên bản ngăn ghi đè khi nhiều người cùng sửa. Ảnh được lưu riêng từng mục, tối đa 2 MB sau xử lý, chỉ truy cập qua phiên đăng nhập trong phạm vi PGD.

Migration trên cũng áp dụng `2026-10-22-shift-report-requests.sql`. Mỗi thao tác lưu nháp, tải ảnh và chốt có mã riêng; kết quả xác nhận được lưu trong cùng transaction với dữ liệu. Nếu mất phản hồi, nút **Thử lại thao tác lưu** gửi lại đúng thao tác và tiếp tục từ phần chưa xác nhận, không tạo trùng hay tự bỏ kiểm soát phiên bản. Trong lúc chưa xác nhận, giữ nguyên dữ liệu/ảnh và tạm khóa sửa form. Báo cáo đang lưu không chuyển trang qua menu; khi còn thay đổi chưa lưu, chuyển mục qua menu hoặc đóng/tải lại trang sẽ yêu cầu xác nhận.

Với hệ thống đã có bảng báo cáo/ảnh, chỉ thêm bảng xác nhận bằng `node scripts/migrate-shift-reports.cjs --apply --requests-only` trước khi triển khai phiên bản này. Tab trình duyệt cũ vẫn dùng được API cũ, nhưng cần tải lại trang để có cơ chế thử lại mới.

Kiểm tra phục hồi và phân quyền bằng `node scripts/check-shift-report-retries.cjs` (PostgreSQL TEMP, rollback toàn bộ, không ghi dữ liệu nghiệp vụ) và `python scripts/check-shift-report-retries-ui.py --cookie-file <session-file>` (API mô phỏng).

Thống kê theo PGD và ngày báo cáo gồm tổng số hợp đồng, hoàn thành, đang thuê, quá hạn; tổng thu thực tế, thu cọc, thu gia hạn, thu phí thuê; tổng chi thực tế, tiền cọc phải trả, hoàn lại do trả sớm, tiền phạt muộn. Người trực ca nhập các số liệu và tổng thực tế riêng để đối chiếu. Hệ thống không tự cộng tiền phạt vào chi hoặc cộng các trạng thái hợp đồng có thể trùng nhau. Số liệu được lưu cùng báo cáo; báo cáo cũ đã chốt chưa có phần này hiển thị chưa ghi nhận, không tự thêm số 0. Không cần migration bổ sung.

Mỗi tab có nút **Tự điền từ DB**, lấy theo PGD và ngày ở tab Thông tin. Nút chỉ điền phần đang chọn, chưa lưu báo cáo; có thể kiểm tra/sửa trước khi lưu. Đã thay nút điền mẫu bằng dữ liệu DB. Thay PGD/ngày của báo cáo đã lưu bằng cách tạo báo cáo mới.

Nguồn tự điền:

- **Thông tin:** tên nhân sự trong lịch trực giao với ngày báo cáo, bao gồm ca qua đêm.
- **Tổng kết xe:** nút riêng chỉ lấy số xe hiện tại của cơ sở chọn trong tab Thông tin: xe thuê ngày/tháng từ hợp đồng đang thuê và các dòng xe chưa trả, xe lưu kho từ danh sách xe có `status=ready`. Phân loại ưu tiên loại hợp đồng (`daily`, `monthly`, `monthly_*`), dòng day/month dùng cho dữ liệu cũ thiếu loại; loại thuê sở hữu không gộp vào thuê tháng. Mỗi xe được đếm một lần theo dòng thuê hiện tại mới nhất. Tổng tự tính = thuê ngày + thuê tháng + lưu kho. Việc chọn ngày báo cáo không chuyển nguồn xe sang bản kiểm kê cũ.
- **Pin và điều chuyển:** có nút tự điền riêng; lỗi hai phần này không chặn nút tổng kết xe. Pin/pin đầy lấy từ số kiểm kê đã lưu đúng PGD/ngày (ngày quá khứ dùng báo cáo đã chốt). Không suy đoán tồn pin hay mức sạc từ hợp đồng thuê pin. Điều chuyển lấy lượt chuyển đi trong ngày.
- **Hợp đồng & thu chi:** đếm hợp đồng xe bắt đầu thuê trong ngày và trạng thái hiện tại; tổng thu/chi từ phiếu approved trong ngày Việt Nam. Thu cọc gồm các tên nghiệp vụ cọc; gia hạn nhận cả phiếu liên kết snapshot gia hạn; hoàn cọc/trả sớm/phạt muộn lấy theo phiếu đã duyệt. Tổng thu/chi còn có thể bao gồm các khoản khác, không ép bằng tổng các ô chi tiết.
- **Tài khoản:** cộng số dư đầu kỳ và biến động đã duyệt đến hết ngày báo cáo (hôm nay tính đến hiện tại) của tài khoản đang hoạt động gắn PGD; không lấy tài khoản Công ty dùng chung không có PGD. Thiếu tài khoản hoặc số dư âm không bị thay bằng 0; giữ nguyên ô và hiển thị thông báo. Tiền mặt lấy từ sổ quỹ để đối chiếu với thực đếm, không xác nhận đã kiểm kê.
- **An toàn:** lấy danh sách thiết bị từ báo cáo đã chốt gần nhất không sau ngày chọn; không tự xác nhận tắt điện, không tự ghi Không cho bất thường, không sao chép ảnh.

API `/api/auth/shift-reports/autofill` chỉ đọc, dùng transaction nhất quán, timeout 15 giây, kiểm tra phân quyền và phạm vi PGD. Mất kết nối giữ nguyên các giá trị trong form. Kết quả ghi rõ nguồn và thời điểm đọc. Không cần migration mới.
