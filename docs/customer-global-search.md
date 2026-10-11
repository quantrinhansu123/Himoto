# Tra cứu khách hàng toàn cơ sở

- Tra SĐT hoặc CCCD/CMND trong form hợp đồng trên toàn hệ thống, cả khi chưa chọn cửa hàng xe. Giữ số 0 đầu và bỏ dấu cách/dấu chấm trong số tra cứu. API `/auth/customers/search` bỏ bộ lọc cơ sở; client cũ còn truyền `store_id` vẫn nhận kết quả toàn hệ thống. Phiên đăng nhập vẫn bắt buộc.
- Một kết quả tự điền hồ sơ, CCCD ngày/nơi cấp, GPLX, địa chỉ và người thân. Trùng SĐT trả đủ hồ sơ để chọn; mỗi lựa chọn có cơ sở quản lý và cơ sở thuê lần đầu. Lỗi kết nối không hiển thị thành “chưa có khách”.
- Hiển thị **Cơ sở nguồn khách (hồ sơ)** từ `customers.store_id` và **Thuê lần đầu tại** từ cơ sở nguồn/doanh thu của hợp đồng thuê sớm nhất. Loại bản nháp, đặt trước, đơn hủy và đơn đã xóa. Sắp xếp theo thời gian thuê của đơn/dòng xe; dữ liệu cũ thiếu cả hai dùng thời điểm tạo đơn, cuối cùng dùng ID để phân định. Chưa có lịch sử thuê thì ghi rõ, không suy ra từ cơ sở nguồn.
- Đổi cơ sở nguồn/doanh thu giữ khách đã chọn. Lưu nháp, phát hành và nhập hợp đồng Excel cho phép dùng khách thuộc cơ sở khác, giữ nguyên ID và `customers.store_id`. Nhân sự gợi ý và tài khoản thu theo cơ sở nguồn/doanh thu; xe chọn toàn hệ thống, kho xe giữ nguyên. Xem `docs/cross-branch-rentals.md`.
- Chức vụ cho gõ mới và chọn gợi ý: PT, TPKD, QL PTKD, QTPGD… Gõ “Nhân viên kinh doanh” gợi ý **NVKD**; lưu thống nhất NVKD. Gõ QL hoặc Quản lý có gợi ý chức vụ quản lý; không tự đoán chức vụ của một giá trị mới.

## Kiểm tra

- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`.
- `npm.cmd run test:contracts`: 13 nhóm, có tra SĐT toàn cơ sở và lỗi API.
- `node scripts/check-customer-global-search.cjs --live-temp`: 4 nhóm; SQL và GET thật chạy trên bảng PostgreSQL TEMP, lưu và phát hành hợp đồng khác cơ sở giữ chủ hồ sơ, rollback toàn bộ. Sequence của bảng TEMP tách khỏi dữ liệu vận hành.
- `npm.cmd run test:contract-import`: 7 nhóm, có khách/xe thuộc cơ sở khác. Bộ nháp, phát hành và dữ liệu quản lý đều qua.
- `python scripts/check-customer-global-search-ui.py --session-cookie-file <file phiên cục bộ>`: 6 nhóm, có tra trước khi chọn cơ sở, hồ sơ trùng, thay cơ sở, lỗi mạng, phản hồi cũ tới trễ, desktop/mobile. Chặn toàn bộ ghi dữ liệu vận hành. Ảnh và kết quả: `docs/qa/customer-global-search/`.
- `python scripts/check-staff-profile-ui.py --session-cookie-file <file phiên cục bộ>`: 6 nhóm, kiểm tra rõ PT, TPKD, QL PTKD, gợi ý tên đầy đủ và lưu NVKD.
- Đọc dữ liệu thật: 2.623 hồ sơ; tra cùng SĐT qua API không truyền cơ sở/đúng cơ sở/cơ sở khác cho cùng kết quả và đúng thông tin quản lý, thuê lần đầu. Truy vấn danh sách chạy một lượt tổng hợp lịch sử; `EXPLAIN ANALYZE` đo thời gian xử lý DB khoảng 19 ms. Các kiểm tra này chỉ đọc.

Typecheck/lint qua; dependency `pricingVehicle` đã sửa.
