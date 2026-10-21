# Hà Đông tìm hợp đồng theo biển xe GB

## Tái hiện

Production với tài khoản Hà Đông #154:

- Tìm `VPS-32017` hoặc lọc hợp đồng #57586: có hợp đồng thuộc Hà Đông (#33), trạng thái `completed`, nhưng tên xe và biển số rỗng.
- Tìm `17B5-141.53`, `141.53` hoặc `17B514153`: không có kết quả.
- Quản trị viên đọc cùng hợp đồng thấy `AIRBLADE · 17B5-141.53`, xe #245 ở Giáp Bát (#23).

Nguyên nhân: cả truy vấn tạo danh sách để tìm kiếm và truy vấn chi tiết đều nối trực tiếp bảng xe bị giới hạn theo kho vật lý. Hà Đông có quyền đọc hợp đồng của mình nhưng phần thông tin xe GB bị lọc mất.

## Thay đổi

- Hàm `contract_vehicle_labels()` chỉ trả 7 trường mô tả xe (`id`, `name`, `license`, `brand`, `type`, `year`, `color`) khi xe gắn với một dòng hợp đồng chưa xóa thuộc phạm vi cơ sở của người gọi. Không loại xe đã trả, nên hợp đồng hoàn tất vẫn có biển số để tra cứu.
- `SECURITY DEFINER`, cố định `search_path`, thu hồi quyền PUBLIC và chỉ cấp EXECUTE cho `himoto_scoped`. Hàm yêu cầu actor; không trả thông tin khách, tiền hoặc GPS.
- Dùng nguồn đọc này cho danh sách phân trang, tìm kiếm, xuất dữ liệu, API danh sách cũ và kết quả đọc lại sau lưu nháp. Kết nối quản trị giữ cách đọc hiện có. Không đổi chính sách RLS hoặc cấp quyền sửa xe kho khác.
- Tìm biển chấp nhận bỏ dấu chấm, dấu gạch nối và khoảng trắng. Tìm tên, mã hợp đồng, bộ lọc trạng thái/cơ sở và phân trang giữ nguyên quy tắc hiện có.
- Không thay đổi dữ liệu hợp đồng, trạng thái xe, phiếu tiền hoặc Telegram.

## Kiểm tra

- `node scripts/check-management-table.cjs`: 5 nhóm đạt, thêm 5 cách nhập biển và giữ thứ tự/phân trang/kết quả đúng.
- `node scripts/check-account-scope.cjs`: 20 nhóm đạt trong schema QA rollback. Nhánh nguồn tìm, đọc chi tiết và xuất được biển xe kho khác, trước và sau trả xe; không đọc được hợp đồng cơ sở khác hoặc bảng xe ngoài quyền.
- `node scripts/check-contract-drafts.cjs`: 5 nhóm đạt.
- Typecheck, lint và production build đạt; còn 3 cảnh báo lint có sẵn ở `ManagementPage.tsx` và `StaffOrganizationChart.tsx`.
- Kiểm tra chỉ đọc trên dữ liệu thật, dùng phạm vi Hà Đông: 6 từ khóa (`17B5-141.53`, `141.53`, `17B514153`, `17b5 14153`, `14153`, `VPS-32017`) đều tìm được #57586 và đủ thông tin xe. Tab đang thuê loại hợp đồng đã hoàn tất đúng quy tắc; hợp đồng riêng của Giáp Bát vẫn bị ẩn. Kết quả trong `.backups/contract-search-verification-20261021.json` (Git ignored).

Mở `/contracts?search=17B514153`, dùng tài khoản Hà Đông và tab **Tất cả**. Xe này đã trả và hoàn cọc nên hợp đồng nằm ở **Hoàn thành**.
