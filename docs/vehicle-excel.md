# Excel và đồng bộ xe

Trang `/vehicles` có cột **Màu sắc**, Tải mẫu Excel, Nhập / Đồng bộ Excel, Làm mới và Xóa hết.

CSDL thật đã có `himoto.vehicles.color varchar(255)`. API trước đây không đọc cột này. Migration [2026-10-07-vehicle-import.sql](sql/2026-10-07-vehicle-import.sql) đảm bảo cột tồn tại và tạo `vehicle_import_backups` có RLS, không cấp quyền cho `anon` / `authenticated`. Kết nối server dùng quyền chủ bảng; truy cập HTTP cần phiên quản trị đang hoạt động và cùng origin cho thao tác ghi.

## Mẫu và đối chiếu

Mẫu có 12 cột: ID xe, Tên xe, Hãng xe, Loại xe, Năm sản xuất, Biển số, Màu sắc, Số khung, Số máy, Cơ sở, Trạng thái, Số km. ID mới có thể để trống; ID xuất từ hệ thống cũ được giữ để không mất lịch sử. Ô biển số / số khung / số máy dùng Text. Sheet Cơ sở chứa danh sách thật và dropdown; không có dữ liệu xe mẫu giả.

Nhận tối đa 1.000 dòng / 5 MB `.xlsx`, request JSON tối đa 2 MB. Cột được khớp theo tiêu đề, chấp nhận đảo thứ tự. Cột thừa được liệt kê rồi bỏ qua. Công thức, tiêu đề cốt lõi trùng, ID xung đột, biển số trùng sau khi chuẩn hóa, năm / km sai hoặc màu dạng số đều bị báo lỗi. Màu chưa xác định có thể để trống và phải xác nhận cảnh báo; đồng bộ không xóa màu / số khung / số máy / số km đang có khi ô tương ứng trống.

File `Kho xe tổng.xlsx` có 11 tiêu đề nhưng 21 cột dữ liệu. Chỉ cấu trúc đã xác minh này được đọc theo vị trí; kiểm tra chữ ký tiêu đề và từng dòng, không tự đoán mọi file lệch:

| Cột gốc | Trường |
| --- | --- |
| A / B / C / D | ID / Tên xe / Hãng / Loại |
| E / F | Năm sản xuất / Mã cơ sở cũ |
| G / H / I / J | Biển số / Số khung / Số máy / Trạng thái |
| Q / U | Màu sắc / Số km |

K–P, R–T không nhập: giá mua/bán/khoảng giá, người tạo, thời gian cũ, loại dịch vụ, giá min/max. Không suy ra giá thuê từ các số chưa xác nhận. Xe đang có giữ các trường giá/dịch vụ hiện tại; xe mới dùng mặc định CSDL cho loại dịch vụ và không tự gán giá thuê.

Mặc định mã cơ sở cũ cần chọn lại trong màn hình đối chiếu. Khi quản trị **chủ động chọn** “Chỉ nhận cơ sở hiện có”, mã cũ được đối chiếu trực tiếp với danh sách hiện tại; dòng ở mã ngoài danh sách được đánh dấu **Bỏ qua**. Chỉ các dòng còn lại tham gia kiểm tra trùng và nhập. Lỗi ở dòng thuộc cơ sở được nhận luôn chặn toàn bộ lần nhập. Tải file đã khớp cột xuất phần được nhận, giữ các ô cần sửa để người dùng đối chiếu.

## Ghi dữ liệu và xóa

- **Đồng bộ** giữ ID theo ID/biển số, cập nhật thông tin mô tả, thêm xe mới. Xe đã có giữ cơ sở gốc/hiện tại, trạng thái, giá, ngày/người tạo và lịch sử. Xe ngoài phần Excel nhập được giữ.
- **Thay toàn bộ** kiểm tra liên kết rồi xóa và nhập trong cùng giao dịch. Có liên kết thì chặn. Không có xe đủ điều kiện hoặc có một dòng lỗi thì không xóa dữ liệu.
- **Xóa hết** áp dụng cả bảng, không chỉ bộ lọc. Kiểm tra liên kết và số xe trước; nếu được phép phải nhập đúng `XÓA HẾT XE`. Không dùng `TRUNCATE CASCADE`, không xóa hợp đồng hoặc reset sequence.

Ghi dữ liệu khóa bảng xe, các bảng tham chiếu và cơ sở, kiểm tra lại revision có cả snapshot CSDL, danh sách cơ sở, file, chế độ và lựa chọn bỏ cơ sở. Kiểm tra tham chiếu gồm cột `vehicle_id` / `*_vehicle_id`, FK khai báo, `orders.vehicle_ids`, xe trong JSON nháp/snapshot. Bao gồm dữ liệu lịch sử và đã xóa mềm. Timeout khi có hoạt động đồng thời sẽ hủy giao dịch.

Mỗi lần nhập/xóa ghi toàn bộ bảng xe **trước thay đổi** vào `himoto.vehicle_import_backups` trong cùng giao dịch. Không lưu được backup thì không ghi/xóa xe. Lỗi ghi hoặc số lượng sau ghi lệch làm rollback cả thao tác và backup. Sequence chỉ tăng, có thể có khoảng trống khi rollback.

Sau thành công, nút Tải bản sao lưu tải JSON qua API quản trị `/api/auth/vehicles/backups/{uuid}`. SHA-256 tính trên JSON với key object sắp xếp theo alphabet, thứ tự array giữ nguyên; JSONB thay thứ tự key vẫn kiểm tra được. Chưa có chức năng khôi phục tự động: dùng bản chụp để khôi phục bằng giao dịch do quản trị kiểm tra, giữ ID và đối chiếu các thay đổi/hợp đồng phát sinh sau thời điểm sao lưu. Không xóa xe mới chỉ vì không có trong snapshot cũ.

## Lần nhập ngày 07/10/2026

Người dùng xác nhận giữ ID/lịch sử và bỏ dòng ở cơ sở ngoài 6 cơ sở hiện có: 23, 31, 32, 33, 34, 35. Theo cột F, file có 38 xe thuộc cơ sở 23; 392 dòng thuộc các mã ngoài danh sách được bỏ qua. Phần được nhận có đầy đủ biển số/màu, không có dòng lỗi: 37 xe đã có và 1 xe mới. Các xe khác trong CSDL được giữ. File nguồn không sửa; file đúng cột và báo cáo đối chiếu nằm trong `excel-import/`, backup/báo cáo ghi thật trong `.backups/vehicles/`; cả hai thư mục đều Git ignored.

Đã COMMIT ngày 07/10/2026: 172 → 173 xe, giữ tất cả 172 ID cũ và 135 xe ngoài phần nhập. Backup trước nhập có 172 xe và đã đối chiếu SHA sau khi đọc lại JSONB. Hash nội dung và số dòng của orders (2.720), order_vehicle_details (3.059), vehicle_images (19), vehicle_location_events (59), vehicle_transfer_items (5) không đổi. Không xóa hợp đồng, cơ sở hoặc dữ liệu liên quan.

Helper mặc định chỉ preview và chụp snapshot cục bộ:

```powershell
node scripts/sync-vehicle-workbook.cjs --skip-unknown-stores
```

Chế độ `--commit` cần ID quản trị hoạt động và số lượng kỳ vọng `--expect-eligible`, `--expect-updated`, `--expect-added`. Không chạy lại lệnh ghi với số lượng cũ sau khi đã nhập thành công. Helper kiểm tra SHA backup, tất cả ID cũ, các trường vận hành/giá và hash của orders, chi tiết hợp đồng, ảnh, vị trí, điều chuyển trước khi COMMIT.

## Kiểm thử

```powershell
npm.cmd run test:vehicles
node scripts/check-vehicle-import.cjs --live-temp
python scripts/check-vehicle-excel-ui.py --url http://127.0.0.1:3006 --session-cookie-file <cookie-file>
```

`--live-temp` chạy SQL thật trên bảng TEMP của một kết nối riêng, thay toàn bộ tên bảng/sequence và không ghi bảng nghiệp vụ. Kiểm tra đồng bộ, backup đúng hash, revision, chặn liên kết, rollback khi backup/insert lỗi, thay toàn bộ, reset và sequence. UI dùng API giả, chặn yêu cầu nghiệp vụ ngoài bộ giả; kiểm tra tải Excel, file lệch, bỏ cơ sở, xung đột, backup, reset, thay toàn bộ và màn hình 375px. Bằng chứng chỉ dùng dữ liệu tổng hợp ở [docs/qa/vehicle-import](qa/vehicle-import).
