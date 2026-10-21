# Sổ quỹ, doanh thu thuê xe và danh sách hợp đồng gọn

Quy tắc được xác nhận: doanh thu tính theo **ngày thực thu / thực hoàn tiền** tại Việt Nam:

`Phí thuê đã thu + Gia hạn đã thu + Phí trả muộn đã thu − Tiền thuê đã hoàn do trả sớm`.

Không tính cọc, hoàn cọc, sửa chữa, phụ thu và các khoản chưa phân loại vào KPI thuê xe. Không tính bản ghi gia hạn chưa thu tiền; không trừ ngay khi chỉ ghi giảm tiền thuê trả sớm. Không tự đặt tỷ lệ % KPI.

## Giao diện

- `/contracts` và các danh sách hợp đồng dùng bố cục gọn cho mọi tài khoản. Mặc định tám cột chính; nguồn khách, NVKD, cơ sở, phát sinh, loại hợp đồng nằm trong **Bộ lọc nâng cao → Cột**. Nhóm quá hạn giữ tám trường theo dõi sẵn có; nhóm đến hạn giữ ngày hẹn đóng và tiền đến hạn. Thống kê nằm trong mục đóng ở cuối bảng. Cài đặt không phụ thuộc trình duyệt của quản trị viên.
- `/cashbook` có tổng thu, cọc đã thu, thu ngoài cọc, tổng chi và chi tiết đối chiếu. Mỗi bảng Thu / Chi có tổng tiền của toàn bộ bộ lọc trước phân trang. **Thu ngoài cọc** là số thu chi, không dùng thay công thức KPI. Có liên kết sang báo cáo doanh thu.
- `/staff-sales` ưu tiên doanh thu thuê xe thực thu, xem theo ngày / NVKD, dùng chung khoảng ngày và cơ sở, xuất CSV mở trong Excel. Thống kê hợp đồng và báo cáo bổ sung được thu gọn. Tiền chưa phân công NVKD được hiện thành nhóm riêng; phiếu chưa phân loại được cảnh báo để đối chiếu trước chốt KPI.

## Ghi nhận hoàn tiền thuê

Tại **Thanh toán → Nghiệp vụ → Phiếu chi: Hoàn tiền thuê trả sớm**, kế toán/quản trị ghi nhận khoản đã hoàn thực tế. Chức năng ghi sổ, không tự chuyển tiền ngân hàng.

Giới hạn = nhỏ hơn giữa tiền đã thu dư so với tiền hợp đồng sau giảm và tổng giảm trả sớm còn chưa hoàn. Ghi `order:rental_refund`, giảm `orders.pid`, giữ tiền hợp đồng và tiền cọc. Ngày giờ chi xác định ngày trừ doanh thu. Khóa hợp đồng, kiểm tra revision, UUID chống trùng, phiếu và sổ đối chiếu cùng transaction như các khoản thanh toán hiện có. Xóa phiếu hoàn sẽ hoàn nguyên số đã thu; quyền xóa và xác nhận vẫn theo quy trình Sổ quỹ.

## Nguồn và phạm vi

API GET `/api/auth/rental-revenue` yêu cầu `contracts.read`, chạy trong phạm vi RLS của tài khoản. Chỉ dùng giao dịch được duyệt. Gia hạn liên kết được nhận diện qua sổ `management_contract_payments`, không cộng thêm snapshot gia hạn. Phí khác ban đầu được phân bổ theo toàn bộ lịch sử thu trước khi lọc ngày/cơ sở, cùng quy tắc hiện có; chưa suy đoán tên giao dịch cũ không xác định. Báo cáo gắn NVKD được phân công trên hợp đồng, không lấy nhân viên bấm thu thay NVKD.

Không sửa, phân loại lại hoặc bổ sung chứng từ lịch sử trên dữ liệu vận hành. Không có migration. Hai ảnh cũ chưa gắn của hợp đồng `005178` không thuộc thay đổi này.

## Kiểm chứng

```powershell
node scripts/check-rental-revenue.cjs --live-temp
node scripts/check-cashbook-summary.cjs --live-temp
node scripts/check-cashbook-pagination.cjs --live-temp
node scripts/check-cashbook-data.cjs
node scripts/check-contract-payments.cjs --live-temp
node scripts/check-contract-monitoring.cjs
npm.cmd run build
```

TEMP database: riêng bảng và identity, outer ROLLBACK; không ghi dữ liệu hoặc tăng sequence vận hành. Bao gồm thu sau ngày gia hạn, chưa thu chưa tính, hoàn sau ngày ghi giảm, hoàn từng phần, chống chi vượt, gửi lại UUID, hoàn nguyên khi xóa, cọc độc lập, phân bổ phí qua nhiều ngày, cơ sở khác, ranh giới ngày Việt Nam và phiếu chưa duyệt.

Browser: `check-cashbook-pagination-ui.py`, `check-contract-monitoring-ui.py`, `check-rental-revenue-ui.py` hỗ trợ Chromium/WebKit. Mọi API nghiệp vụ được giả lập; kiểm tra tổng tiền vượt trang, lọc, lỗi/tải lại, CSV, bật cột tùy chọn, bố cục gọn và phiếu hoàn tiền. Kết quả/ảnh riêng tại `.backups/cashbook-summary-20261021/` (Git ignore). Lint còn ba cảnh báo hooks có sẵn.

Chỉ đọc nguồn thực: tài khoản cơ sở Láng thấy dữ liệu của mình, lọc sang cơ sở ngoài phạm vi trả rỗng; hai truy vấn báo cáo khoảng 996ms. Sổ quỹ toàn lịch sử trả hai trang năm dòng và chi tiết tổng hợp khoảng 4.6 giây trên kết nối kiểm thử; không tải toàn bộ giao dịch xuống trình duyệt.

Kết quả: 38 nhóm dữ liệu (4 doanh thu/hoàn tiền, 5 tổng Sổ quỹ, 5 phân trang, 6 dữ liệu Sổ quỹ, 14 thanh toán, 4 theo dõi hợp đồng); 30 nhóm trình duyệt (7 Sổ quỹ + 5 danh sách + 3 doanh thu/hoàn tiền trên mỗi Chromium/WebKit). Build thành công. HTTP trên bản production local: chưa đăng nhập 401; nhân viên Láng đọc phạm vi mình 200, chọn cơ sở ngoài phạm vi 200 với tập rỗng. Không ghi chứng từ vận hành và không gửi Telegram.
