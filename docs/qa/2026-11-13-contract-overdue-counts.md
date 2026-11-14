# Bộ đếm và bộ lọc hợp đồng quá hạn — 13/11/2026

## Lỗi tái hiện

- Với `nv0011`, `/contracts?status=overdue` tại Giáp Bát trả 10 dòng, nhưng yêu cầu thống kê trả 11 (10 quá hạn + 1 nợ xấu). Toàn cơ sở là 93 so với 109 (thêm 16 nợ xấu).
- Hook kiểm tra tính nhất quán giữa trang và thống kê nên giữ trạng thái chờ và hiện `—`/`…`. Cả hai yêu cầu đều HTTP 200; đây là lỗi điều kiện truy vấn, không phải quyền hay mất kết nối DB.
- Tab Nháp trả 0 ở cả hai yêu cầu nên vẫn hiện các bộ đếm. Nháp không thuộc tập quá hạn; 0 kết quả tại `/contracts/overdue?status=draft` là đúng.
- Cửa sổ mặc định 3 ngày loại cả hợp đồng đang mở cũ. Hai lựa chọn cơ sở độc lập còn có thể hiển thị Tất cả ở thanh trên nhưng tiếp tục lọc Giáp Bát bên dưới.

## Thay đổi

1. Truy vấn trang và export dùng chung tập trạng thái ứng viên, có nợ xấu. Ngày trả từng xe và số dư sau hydrate quyết định kết quả quá hạn, bao gồm hợp đồng cũ thiếu ngày trả ở đầu hợp đồng.
2. Tổng của các phạm vi tính theo nghiệp vụ (`overdue`, `collection`, `due`) lấy từ tập đã tính ngày/số dư; không đếm nhầm mọi hợp đồng mở thành quá hạn. Tổng phạm vi giữ nguyên khi đổi tab, tìm kiếm hoặc bộ lọc phụ.
3. Cửa sổ 3 ngày chỉ giới hạn lịch sử đã đóng; mọi hợp đồng đang mở vẫn có thể xem. Thông báo và nút Xem toàn bộ lịch sử hiển thị ngoài phần thống kê thu gọn; nhãn tổng nói rõ phạm vi.
4. Bộ lọc nguồn khách ở danh sách hợp đồng và lựa chọn cơ sở trên thanh đầu dùng cùng một trạng thái. Chọn Tất cả trên thanh đầu bỏ luôn lọc cơ sở bên dưới. Ràng buộc phạm vi tài khoản vẫn do provider và API áp dụng.

Không sửa tài khoản, hợp đồng, giao dịch hoặc cấu hình nghiệp vụ. Chưa triển khai gói chọn nhiều ảnh/Telegram của app trong thay đổi này.

## Kiểm tra trước phát hành

- TypeScript và ESLint hai file sản phẩm: đạt.
- `npm run build`: đạt, gồm kiểm tra kiểu và lint production.
- `check-contract-tabs.cjs`: 4 nhóm đạt.
- `check-management-table.cjs`: 11 nhóm đạt.
- `check-contract-monitoring.cjs`: 5 nhóm đạt.
- `check-contract-tab-counts.cjs`: 4 nhóm đạt trên PostgreSQL với bảng/hàm tạm và rollback. Đối chiếu yêu cầu trang, thống kê riêng, export ở 10 tổ hợp phạm vi/trạng thái; kiểm tra nợ xấu, ngày trả ở từng xe, phạm vi cơ sở, tìm kiếm, lịch sử cũ và cửa sổ gần đây. Guard từ chối mọi tham chiếu dữ liệu nghiệp vụ ngoài fixture; không dùng sequence thật.
- `check-contract-list-filters.cjs`: 5 nhóm đạt, gồm phân trang khoản đến hạn và loại hợp đồng.
- `check-mobile-review.cjs`: 5 nhóm đạt; `check-mobile-workspaces.cjs`: 3 nhóm đạt với reader dùng chung.
- Trình duyệt Chromium với phiên thật `nv0011` và DB thật: 6 nhóm đạt. Hai trang hợp đồng/quá hạn, các tab Quá hạn/Nháp, đồng bộ cơ sở, xem lịch sử, tổng và export; giao diện 1440px/390px. Giáp Bát trả 11 quá hạn và 26 đang thuê; toàn cơ sở trả 109 quá hạn. Không lỗi JavaScript hoặc yêu cầu ghi.
- Suite phụ `check-record-totals.cjs` dừng tại guard fixture ở dòng 31. Đã chạy lại với nguyên module `management-table.ts` của HEAD `54d2ced` và gặp cùng lỗi; không ghi nhận suite này là đạt, không nới guard để truy cập dữ liệu thật.

Artifact có dữ liệu thực lưu tại `.backups/overdue-counts-20261113/`, không đưa vào Git. Token kiểm tra chỉ giữ trong bộ nhớ tiến trình.
