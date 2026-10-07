# Đối chiếu hợp đồng đang thuê từ Excel

Ngày 07/10/2026, đối chiếu 7 file KH trong `excel-import/`: **264 dòng xe → 262 đơn nguồn**. Hai đơn có hai xe; gộp theo ID đơn nguồn và giữ đầy đủ xe, không gộp theo tên khách hoặc cộng tiền đơn lại cho mỗi xe. Mapping cơ sở dùng cùng bản đã chọn khi [nhập khách hàng](customer-source-data.md).

Kết quả vận hành theo lựa chọn lưu nháp của người dùng:

| Nhóm | Số đơn | Xử lý |
| --- | ---: | --- |
| Đã có trong CSDL, khớp đầy đủ | 7 | Giữ ID và toàn bộ lịch sử |
| Mới, khớp khách → biển số → cơ sở | 6 | Đã lưu vào **Log**, trạng thái Lưu nháp |
| Thiếu hoặc xung đột dữ liệu | 249 | Chưa ghi; giữ trong Excel đối chiếu |

Sáu nháp mới có mã `EXCEL-<ID đơn nguồn>`; ID mới do database cấp. CSDL tăng **2.720 → 2.726 đơn**, Log **5 → 11 nháp**. Không thay đổi trạng thái xe hoặc tạo chi tiết thuê vận hành. Đã kiểm tra nội dung toàn bộ 2.720 đơn cũ; khách (2.621), xe (173), cơ sở (6), chi tiết xe hợp đồng (3.059), thu chi (8.844) giữ nguyên số lượng và hash.

## Quy tắc khớp

Khách phải khớp duy nhất cả tên chuẩn hóa và điện thoại đã xác minh. Biển số phải khớp duy nhất trong CSDL. Kiểm tra cơ sở khách và cơ sở hiện tại của xe; nếu cơ sở hiện tại trống thì dùng cơ sở gốc, cùng quy tắc danh sách xe. Cơ sở hiện tại đã có luôn được ưu tiên. Không tự chuyển xe, tạo lại xe đã bị loại khỏi đợt đồng bộ hoặc đóng hợp đồng đang hoạt động.

Một đơn có nhiều xe phải khớp cả nhóm; không nhập riêng những dòng hợp lệ của đơn bị lỗi. Biển số nằm ở nhiều đơn `renting` trong bộ file chặn các nhóm liên quan. ID nguồn không đủ để nhận diện hợp đồng cũ: phải kiểm tra khách, cơ sở, đủ bộ xe, ngày bắt đầu và ngày tạo khi khớp theo ID cũ. Hợp đồng đã đóng/xóa không được mở lại.

Trong 249 đơn chưa nhập, các lý do có thể cùng xuất hiện: 157 đơn thiếu xe/biển số không duy nhất, 82 lệch cơ sở xe, 13 gắn xe với hợp đồng hoạt động khác, 51 có biển số ở nhiều đơn nguồn đang thuê, 21 chưa khớp khách. Các số này không cộng thành 249. Không tự thêm số 0 cho điện thoại Excel lưu dạng số.

## Số tiền và ngày giờ

**Tiêu đề “Đặt cọc” trong file cũ sai nghĩa**: `app/Exports/OrderExport.php` ở app cũ xuất `orders.pid`, là **tổng đã thu**. Tiền cọc riêng là `first_deposit_amount + additional_deposit_amount`; không lấy tổng đã thu làm tiền cọc.

Sáu nháp giữ Tạm tính và Tổng đã thu trong dữ liệu soạn hợp đồng để đối chiếu. Giá thuê từng xe, tiền cọc, hình thức thu, ngày ký và đại diện chưa rõ để trống. Các cột tài chính vận hành của đơn mới vẫn bằng mặc định, cọc riêng `NULL`; không sinh phiếu thu/chi. Metadata ghi rõ chưa đối chiếu tài chính. Mở Log → Sửa để bổ sung; thông tin còn thiếu được lưu nháp nhưng chặn xem bản in khi chưa đủ hồ sơ bắt buộc.

Bảy đơn đã có đều lệch ngày trả; năm đơn còn lệch số tiền. Giữ nguyên CSDL, chờ chứng từ gia hạn/thu tiền. Ngày Excel là giờ Việt Nam, ghi nháp với `+07:00` và giữ giây trong payload. Có dữ liệu cũ lưu giờ cùng thành phần nhưng timezone UTC; chỉ dùng điều này làm bằng chứng khớp khi đã đủ ID/khách/cơ sở/xe/ngày tạo, không sửa múi giờ hàng loạt.

Danh sách hợp đồng lấy ngày bắt đầu/kết thúc từ chi tiết xe nếu ngày trên đơn còn trống; bỏ chi tiết đã xóa. Ngày đã có trên đơn được ưu tiên. API cũng trả tổng đã thu riêng với tiền cọc. Đây là sửa truy vấn đọc, không cập nhật lịch sử CSDL.

## Công cụ và kết quả cục bộ

```powershell
# Chỉ đọc CSDL, tạo Excel đối chiếu và snapshot cục bộ.
node scripts/prepare-contract-workbooks.cjs --branch-map excel-import/customer-branch-map.json
# Mặc định chỉ đọc, kiểm tra file nguồn/revision và backup.
node scripts/import-contract-workbooks.cjs --branch-map excel-import/customer-branch-map.json
# Đã thực hiện ngày 07/10/2026, không chạy lại để thử:
# node scripts/import-contract-workbooks.cjs --branch-map excel-import/customer-branch-map.json --commit --actor-id 143 --expect-added 6
```

Nhập yêu cầu số lượng đúng, quản trị đang hoạt động, SHA-256 của từng file nguồn và revision CSDL khớp bản đối chiếu. Trong transaction khóa các bảng được dùng để khớp, kiểm tra lại, lưu nháp bằng chức năng hiện có, rồi đối chiếu toàn bộ đơn cũ và hash các bảng liên quan trước COMMIT. Một dòng lỗi hủy cả đợt. Nháp đã nhập được nhận diện theo metadata nguồn, khách, cơ sở và đủ xe để tránh nhập lại.

- `excel-import/HIMOTO-hop-dong-dang-thue-doi-chieu.xlsx`: sheet Đối chiếu, Đơn khớp mới, Đã có, **Đã lưu Log**, **Chờ đối chiếu**, Cơ sở và Hướng dẫn. Bản sau nhập có 6 nháp đã lưu, 7 đơn cũ và 249 đơn cần xử lý.
- `excel-import/contract-preview.json`: bản đối chiếu, revision và SHA-256 file nguồn.
- `.backups/contracts/before-import-*.json`: snapshot đầy đủ trước ghi, có SHA-256 kiểm tra lại.
- `.backups/contracts/import-*.json`: báo cáo thực tế ID thêm, số lượng và hash các bảng giữ nguyên.

Các file dữ liệu thật được Git ignored. File nguồn giữ nguyên. Lần ghi đầu bị chặn do cơ sở hiện tại của hai xe trống và đã ROLLBACK toàn bộ; sau khi thống nhất quy tắc dự phòng cơ sở gốc và kiểm thử mới lưu thành công 6 nháp.

## Kiểm thử

```powershell
npm.cmd run test:contract-import
node scripts/check-contract-import.cjs --live-temp
python scripts/check-contract-import-ui.py --url http://127.0.0.1:3009 --session-cookie-file .backups/contracts/qa-cookie.txt
```

8 nhóm kiểm thử gồm PostgreSQL TEMP: schema/điện thoại/ngày/tiền, nhóm nhiều xe, khách/biển số/cơ sở/xung đột, khớp ID cũ, revision, lỗi giữa đợt rollback, nhập nháp không tạo nghiệp vụ, tránh nhập lại và truy vấn ngày fallback. TEMP dùng identity riêng và ROLLBACK, không ghi bảng vận hành hoặc dùng sequence thật. 5 nhóm browser dùng API giả lập: mở đúng liên kết, giữ tiền đã thu riêng với cọc trống, chặn in khi thiếu hồ sơ, sửa/lưu lại đúng nháp, hiển thị 1440/375px. Ảnh và kết quả chỉ dùng dữ liệu QA tổng hợp tại `docs/qa/contract-import/`.
