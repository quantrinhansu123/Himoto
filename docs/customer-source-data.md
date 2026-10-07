# Đối chiếu dữ liệu KH từ file khách cung cấp

7 file KH trong `excel-import/` là **xuất đơn thuê**, có 12 cột: ID, Ngày tạo, Tên khách hàng, SĐT khách hàng, Tên xe, Biển số, Thời gian mượn, Thời gian trả, Ghi chú, Đặt cọc, Tạm tính, Trạng thái. Tiêu đề không lệch như file Kho xe tổng, nhưng đây không phải dữ liệu hồ sơ khách hàng với 8 cột của mẫu nhập.

Không dùng ID đơn làm ID khách; không đưa trạng thái thuê, cọc hoặc ghi chú đơn vào trạng thái/cảnh báo của khách. Không lấy cơ sở hiện tại của xe để suy ra cơ sở của khách. Không khớp theo tên đơn lẻ để lấy CCCD/địa chỉ của người khác.

Kiểm tra ngày 07/10/2026: 264 dòng → 238 nhóm khách theo tên + số điện thoại; 26 dòng thuê trùng được gộp nhưng giữ toàn bộ nguồn đối chiếu. 17 khách khớp duy nhất cả tên và điện thoại với CSDL, giữ nguyên hồ sơ/ID. 221 nhóm chưa có khách tương ứng. Trước nhập CSDL có 2.418 khách.

18 ô điện thoại dạng số thuộc 16 nhóm khách, không có định dạng giữ số 0 đầu và không khớp số điện thoại đã xác minh trong CSDL. Bản mẫu để trống điện thoại các nhóm này, giữ giá trị gốc ở sheet Đối chiếu. Một nhóm khác có điện thoại văn bản dài 14 chữ số. Tổng 17 nhóm cần sửa/xác nhận điện thoại. Không tự thêm số 0.

Các file không có CCCD, địa chỉ, email hoặc cơ sở theo mã hiện tại. Bản đối chiếu chỉ lấy giấy tờ/địa chỉ/email đang có cho những khách đã khớp chính xác và duy nhất với CSDL. CCCD không hợp lệ không được sao chép vào mẫu. Người dùng đã chọn nhập khách mới thiếu giấy tờ/địa chỉ dưới trạng thái **Chưa hoàn tất** và giao lựa chọn mapping cơ sở theo danh sách/địa chỉ cung cấp.

| File nguồn | Cơ sở chọn | ID | Căn cứ |
| --- | --- | --- | --- |
| KH Giáp Bát.xlsx | CH Giáp Bát | 23 | Tên cơ sở |
| KH Láng.xlsx | CS láng | 31 | Đường Láng |
| KH Nguyễn Hoàng.xlsx | CS 2 | 32 | Địa chỉ ngõ 66 Nguyễn Hoàng |
| KH Hà Đông.xlsx | CS 5 | 33 | Quang Trung, Hà Đông |
| KH Thuốc Bắc.xlsx | CS 3 | 34 | Suy luận theo khu vực Hoàn Kiếm, cơ sở hiện tại ở Hàng Bút |
| KH Thuê sở hữu.xlsx | Kho sở hữu | 35 | Tên file |
| KH thuê pin.xlsx | Kho sở hữu | 35 | Suy luận: 22/23 khách trùng file Thuê sở hữu |

Một nhóm mới xuất hiện ở cả Nguyễn Hoàng và Thuốc Bắc, tương ứng hai cơ sở khác nhau; chưa gán cơ sở và chưa nhập nhóm này. Cùng 17 nhóm điện thoại lỗi, tổng **18 khách chờ đối chiếu**.

Đã nhập **203 khách mới** ngày 07/10/2026, toàn bộ `status = 0`, CCCD/địa chỉ `NULL` chờ bổ sung. Phân bố khách mới: CH Giáp Bát 15, CS láng 10, CS 2 35, CS 5 16, CS 3 9, Kho sở hữu 118. CSDL sau nhập **2.621 khách**. Toàn bộ 2.418 hồ sơ cũ được đối chiếu nội dung và giữ nguyên. Hợp đồng (2.720 dòng), chi tiết xe hợp đồng (3.059), xe (173) và cơ sở (6) không đổi nội dung/hash trong transaction nhập.

Helper **chỉ đọc CSDL**, tạo snapshot cục bộ và Excel đối chiếu; không ghi khách hoặc hợp đồng:

```powershell
node scripts/prepare-customer-workbooks.cjs
# Truyền mapping đã được lựa chọn: { "tên file KH.xlsx": ID cơ sở }.
# Giá trị null loại file; thiếu mapping hoặc nhiều cơ sở cho một khách sẽ chặn dòng.
node scripts/prepare-customer-workbooks.cjs --branch-map excel-import/customer-branch-map.json
npm.cmd run test:customer-source
```

Kết quả cục bộ:

- `excel-import/HIMOTO-khach-hang-da-khop-cot.xlsx`: 203 hồ sơ mới đã chuẩn hóa, 8 cột, Text giữ số 0 và dropdown cơ sở thật; đã nhập vào CSDL.
- `excel-import/HIMOTO-khach-hang-can-doi-chieu.xlsx`: 18 hồ sơ chưa nhập, có sheet lỗi/nguồn để bổ sung điện thoại hoặc cơ sở.
- `excel-import/HIMOTO-khach-hang-doi-chieu.xlsx`: toàn bộ 238 nhóm, 8 cột chính, sheet cơ sở thật, hướng dẫn và Đối chiếu từng dòng gốc.
- `excel-import/customer-preview.json`: báo cáo tổng hợp và lỗi theo từng dòng trong mẫu.
- `.backups/customers/before-prepare-*.json`: bản chụp toàn bộ bảng customers trước chuẩn hóa.
- `.backups/customers/before-import-*.json`: snapshot đầy đủ khách trước nhập, có SHA-256 kiểm tra lại sau khi ghi file.
- `.backups/customers/import-*.json`: báo cáo số lượng, ID được thêm và hash các bảng liên quan; dữ liệu này chỉ ở máy cục bộ.

Helper nhập vận hành mặc định chỉ preview, không ghi. Chỉ commit file gồm toàn bộ dòng hợp lệ, yêu cầu số lượng chính xác và tài khoản quản trị đang hoạt động. Bản snapshot phải khớp lại toàn bộ hồ sơ trước ghi; nếu khách đã thay đổi sẽ hủy. Sequence chỉ được tăng nếu cần, không giảm. Trước COMMIT phải xác nhận mọi hồ sơ cũ và bảng liên quan không bị sửa. Không dùng helper này để QA trên dữ liệu thật.

```powershell
node scripts/import-customer-workbook.cjs --allow-incomplete
# Lệnh đã thực hiện một lần ngày 07/10/2026; không chạy lại để thử.
# node scripts/import-customer-workbook.cjs --allow-incomplete --commit --actor-id 143 --expect-added 203
node scripts/check-customer-import.cjs --live-temp
```

Các file dữ liệu thật đều Git ignored. File nguồn được giữ nguyên và có SHA-256 trong báo cáo. Chức năng nhập Excel không cập nhật đè khách cũ; nhập lại file 203 khách sẽ báo trùng. Việc thêm khách không tạo/sửa hợp đồng, và lịch sử thuê trong 12 cột nguồn được giữ ở bản gốc để xử lý nghiệp vụ riêng. Kiểm thử: 10 nhóm import gồm PostgreSQL TEMP, 5 nhóm parser nguồn, 7 nhóm browser ở 1440/375px; không ghi bảng vận hành khi QA.
