# Ô tổng danh mục — 24/10/2026

## Thay đổi

- Dùng chung `RecordTotal` cho hợp đồng xe (kể cả các trang con), pin/sạc, cơ sở, xe, khách hàng, nhân viên, lịch sử luân chuyển và sổ quỹ. Cùng nhãn, số màu đỏ, định dạng hàng nghìn và chú thích phạm vi quyền truy cập; bỏ badge nhỏ cạnh tiêu đề ở các trang này.
- Tổng của danh mục được đếm trước tìm kiếm/trạng thái. Xe, khách hàng, nhân viên và cơ sở trả tổng thật, số trang thật và số lượng từng trạng thái. Bỏ cách lấy số dòng trang hiện tại cộng một để đoán còn trang tiếp theo. Chỉ lấy chi tiết các dòng thuộc trang đang xem.
- Tổng luân chuyển bao gồm toàn lịch sử được phép xem, độc lập khoảng ngày, cơ sở đi/đến và tìm kiếm. Phân trang bên dưới vẫn thể hiện kết quả theo bộ lọc. Bộ lọc cơ sở chung và RLS giới hạn cả tổng lẫn danh sách; lượt chuyển giữa hai cơ sở được phép xem qua một trong hai đầu.
- Sổ quỹ đếm toàn bộ phiếu đã duyệt trong cơ sở đang chọn và quyền của tài khoản. Ngày, tìm kiếm, người thực hiện chỉ ảnh hưởng hai bảng thu/chi và số tiền tương ứng.
- Pin/sạc có truy vấn đếm riêng, không lấy số dòng đã lọc trên giao diện và không bị trần `LIMIT 5000` của API danh sách hiện tại. Yêu cầu `scope_count=1` trả `{ rows, scopeCount }`; các nơi gọi API cũ vẫn nhận mảng như trước.
- Thiếu hoặc lỗi tổng số phải báo lỗi/hiện dấu gạch; không tự coi là tổng bằng 0.
- Không có migration hoặc thay đổi dữ liệu nghiệp vụ.

## Dữ liệu thật đã đối chiếu

Đối chiếu bằng giao dịch chỉ đọc, rồi kiểm tra lại qua HTTP có phiên đăng nhập. Số liệu tại thời điểm kiểm tra, không phải hằng số trong mã nguồn.

| Danh mục | Quản trị | Nhân viên thuê sở hữu | Quản lý thuê sở hữu |
| --- | ---: | ---: | ---: |
| Khách hàng | 23.146 | 192 | 192 |
| Xe | 383 | 126 | 126 |
| Cơ sở | 7 | 1 | 1 |
| Nhân viên | 34 | API từ chối 403 | API từ chối 403 |
| Hợp đồng pin/sạc | 44 | 44 | 44 |
| Lượt luân chuyển toàn lịch sử | 60 | 27 | 27 |

- Quản trị: hợp đồng xe **25.878**, phiếu thu/chi đã duyệt **78.131**.
- Khách hàng quản trị có **2.315 trang**, trang cuối 6 dòng; xe **39 trang**, trang cuối 3 dòng; nhân viên **4 trang**, trang cuối 4 dòng (10 dòng/trang).
- Không có phiên đăng nhập: các API danh mục, pin/sạc, luân chuyển và sổ quỹ đều trả 401.
- Tổng pin/sạc của cơ sở ngoài phạm vi bằng 0. Lượt luân chuyển có thể liên quan một cơ sở khác khi đầu còn lại thuộc phạm vi tài khoản; lọc đầu đi/đến không mở rộng tập dữ liệu được phép xem.

## Kiểm tra

- `npm.cmd run build`: đạt.
- `npm.cmd run typecheck`: đạt.
- `npm.cmd run lint`: 0 lỗi; còn cảnh báo có sẵn tại `StaffOrganizationChart.tsx` về dependency `useMemo`.
- `node scripts/check-record-totals.cjs`: 8 nhóm đạt. Fixture PostgreSQL TEMP có 43 bản ghi mỗi danh mục để kiểm tra đủ 5 trang, không trùng/mất dòng, đổi trạng thái/tìm kiếm, đổi cơ sở, trang vượt giới hạn, kết quả rỗng; pin/sạc 5.003 dòng để kiểm tra tổng vượt 5.000 và loại dòng đã xóa. Tất cả rollback, không dùng sequence dữ liệu thật.
- `node scripts/check-cashbook-pagination.cjs --live-temp`: 5 nhóm đạt, gồm tổng cơ sở độc lập ngày/người thực hiện/tìm kiếm và tổng thu/chi theo bộ lọc.
- `node scripts/check-vehicle-transfer-history.cjs`: 6 nhóm đạt, gồm tổng toàn lịch sử độc lập ngày rỗng và phân trang ngày được chọn.
- `node scripts/check-management-table.cjs`: 10 nhóm đạt.
- `node scripts/check-contract-history.cjs`: 6 nhóm đạt.
- `node scripts/check-contract-tabs.cjs`: 4 nhóm đạt, vẫn chỉ tải tab hợp đồng được chọn.
- `node scripts/check-management-table-timeouts.cjs`: đạt.
- `node scripts/check-battery-contracts.cjs`: 4 nhóm đạt.
- `scripts/check-record-totals-ui.py`: 16 lượt đạt (8 trang × Chromium 1440px và WebKit 375px), số hiển thị khớp API thật; kiểm tra trang cuối/tìm kiếm rỗng cho khách hàng, xe, nhân viên, không tràn ô đếm trên điện thoại. Lượt QA cuối chặn mutation và mock nhịp làm mới GPS nền.
- `scripts/check-battery-contracts-ui.py`: 4 nhóm đạt (form, thanh toán, in PDF A4, mở lại dữ liệu; có kiểm tra 320/375/844px). Mọi mutation của lượt này đều được mock.

Bằng chứng cục bộ (bị Git ignore): `.backups/record-totals-20261024/`, gồm kết quả đối chiếu nguồn/HTTP, ảnh tiêu đề và `ui/result.json`. Cookie kiểm thử chỉ nằm trong thư mục bị ignore; không đưa vào commit.
