# Tải dữ liệu theo chức năng — 2026-10-10

## Tối ưu bảng và báo cáo — 25/10/2026

Đã đo 15 màn hình bằng Chromium, chặn mọi request ghi và đồng bộ nhà cung cấp trong lúc đo. Điểm nghẽn chính là phần thống kê hợp đồng: mỗi trang 10 dòng vẫn đọc 25.933 hợp đồng, khoảng 18,76 MB từ PostgreSQL, rồi dựng lại bộ định dạng múi giờ nhiều lần.

- Thống kê chỉ đọc các trường cần thiết. PostgreSQL tổng hợp hợp đồng đã đóng; hợp đồng đang mở, trả góp và dữ liệu tiền cũ bất thường vẫn đi qua cùng logic tính tiền/công nợ. Không thay quyền, RLS, cách phân loại nợ xấu hay số liệu nghiệp vụ.
- Bộ định dạng giờ Việt Nam được tái sử dụng. Bộ lọc ngày áp dụng ngay trong SQL, có ngày trên dòng xe cũ và bỏ dòng đã xóa. Nhóm quá hạn đọc ứng viên theo lô tối đa 250, vẫn đếm đủ trước khi phân trang.
- Đổi trang/sắp xếp hợp đồng tái sử dụng thống kê cùng bộ lọc trong tối đa 30 giây tính từ lần đọc thống kê gốc. Dòng của trang mới vẫn gọi API. Tổng bản ghi thay đổi sẽ buộc tải lại thống kê; làm mới, lưu thay đổi và đổi phạm vi/bộ lọc làm mất hiệu lực cache tương ứng. Xuất toàn bộ luôn đọc mới.
- Trang xe/GPS cập nhật trang đang xem, bỏ lượt tải thừa toàn bộ kho xe. Giữ nhịp cập nhật bảng xe 30 giây. GPS dựng tối đa 50 thiết bị mỗi trang; tìm kiếm, số lượng và nhóm dừng lâu vẫn tính trên toàn bộ thiết bị được phép xem.
- Sổ giao dịch và tổng doanh thu tải song song. Các báo cáo bổ sung và danh sách nhân sự chỉ tải khi mở mục đang thu gọn. Truy vấn doanh số giới hạn hợp đồng liên quan trước các bước xử lý nặng; vẫn xếp hạng lịch sử thuê đầy đủ trước khi lọc ngày/cơ sở để giữ đúng ghi nhận TLS.

Phép đo trực tiếp cùng cơ sở dữ liệu, cùng quyền admin, 10 dòng/trang:

| Phép đo | Trước | Sau |
| --- | ---: | ---: |
| Xử lý trang hợp đồng đầu | 10.093 ms | 1.474 ms |
| Dữ liệu PostgreSQL của riêng phần thống kê | 18.760.138 byte | 154.518 byte |
| Đọc trang hợp đồng khi tái sử dụng thống kê | 507 ms | 303 ms |
| Xử lý danh sách quá hạn | 2.032 ms | 659 ms |

Đây là thời gian tầng dữ liệu từ máy kiểm tra, không phải cam kết thời gian tải trình duyệt. Kết quả thô, thông tin phiên và ảnh chứa dữ liệu thật chỉ lưu trong `.backups/product-speed-20261025/`, ngoài Git.

Kiểm chứng: đối chiếu toàn bộ response trước/sau cho 24 trường hợp hợp đồng (admin và nhân viên cơ sở) và 4 kỳ doanh số; tất cả khớp. `node scripts/check-product-speed.cjs --live-temp` kiểm tra cache, múi giờ, tổng tiền không xác định, 1.000 hợp đồng lịch sử và ranh giới ngày bằng PostgreSQL TEMP/rollback. `scripts/check-product-speed-ui.py` kiểm tra 7 nhóm trên Chromium và WebKit: cache hết hạn, thay đổi đồng thời, làm mới, tải riêng từng trang xe, tải song song, mở báo cáo bổ sung và phân trang/tìm GPS. Các API ghi và nhà cung cấp đều giả lập. Các bộ kiểm tra bảng, bộ lọc, số lượng trạng thái, nợ xấu, doanh số, sổ giao dịch và GPS hiện có cũng đã qua. Production build bao gồm TypeScript và ESLint đã qua.

Trang quản lý trước đây luôn đọc cả 5 danh mục và xóa dataset trước mỗi lần làm mới. Hiện tại:

| Trang | Dữ liệu tải khi mở |
| --- | --- |
| Xe | Cơ sở, xe |
| Khách hàng | Cơ sở, khách hàng |
| Nhân sự / lịch trực | Cơ sở, nhân sự; lịch trực vẫn đọc theo tuần và cơ sở |
| Hợp đồng / VAT / Log | Cơ sở, hợp đồng |
| Cơ sở | Cơ sở |
| Sổ quỹ | Cơ sở, tài khoản, từng trang phiếu thu / phiếu chi |

`data-loader.ts` giữ cache trong provider của phiên hiện tại, tái sử dụng dữ liệu tối đa 30 giây rồi tải lại khi vào trang hoặc mở chức năng. Nút làm mới luôn bỏ qua cache. Request đang chạy được gộp; bảng được giữ trong lúc tải. Lỗi chỉ ảnh hưởng danh mục liên quan. Thay đổi đã lưu không bị response cũ ghi đè.

Nút làm mới tải riêng danh mục đang xem. Sau trả/đổi xe, danh sách hợp đồng được tải lại; cache xe và khách hàng được đánh dấu cần cập nhật ở lần sử dụng tiếp theo. Nhập Excel cũng chỉ tải lại danh mục vừa thay đổi.

Form và hộp thoại được tách bằng dynamic import. Form hợp đồng chỉ đọc dữ liệu bổ sung khi mở, nhân sự được lọc theo cơ sở trong SQL. Chi tiết hợp đồng dùng thông tin xe, người đại diện và trạng thái khách hàng có sẵn trong bản ghi. Tab hợp đồng và thanh toán của khách hàng gọi API theo `customer_id`, thay vì đọc toàn bộ hợp đồng.

## Kiểm chứng

### Phân trang sổ quỹ — 15/10/2026

`/cashbook` gọi GET `/api/auth/cashbook/vouchers`; mặc định chỉ nhận 5 phiếu thu và 5 phiếu chi. Một câu SQL trả tổng số phiếu, tổng tiền theo bộ lọc, danh sách người thực hiện theo cơ sở và hai trang, cùng một snapshot. Giới hạn tối đa 50 dòng mỗi bảng; đổi trang và sắp xếp độc lập. Từ khóa chờ 250 ms, hủy request cũ khi bộ lọc đổi. Ngày được lọc theo múi giờ Việt Nam, bao gồm toàn bộ ngày kết thúc.

CSV đọc đầy đủ phiếu khớp bộ lọc khi bấm xuất. “Xóa hết” đọc snapshot ID và số tiền của toàn bộ kết quả trước khi xác nhận; không chỉ xóa trang hiện tại. Chọn từng phiếu giữ ID và thông tin qua các trang. Tổng thu/chi và số dư tài khoản giữ cách tính hiện có. API `/auth/transactions` cũ giữ tương thích cho các chức năng khác.

- `npm.cmd run test:cashbook`: 6 nhóm dữ liệu hiện có.
- `node scripts/check-cashbook-pagination.cjs --live-temp`: 4 nhóm, có PostgreSQL TEMP/rollback; không ghi bảng vận hành hoặc sử dụng sequence thật.
- `scripts/check-cashbook-pagination-ui.py`: 6 nhóm; API giả lập toàn bộ, CSV 12 cột xuất vượt trang đang xem, chọn qua trang, tải/lỗi/thử lại, bộ lọc và mobile; 0 ghi dữ liệu thật.
- `scripts/check-cashbook-layout-ui.py`: giữ kiểm tra 12 cột, nội dung dài, ngày và phân trang trên desktop/mobile, dùng response phân trang mới.

Phép đo trước sửa trên production: GET toàn bộ 76.483 giao dịch, 32.126.705 byte, 8.596 ms; còn chưa gồm thời gian định dạng ngày và lọc trên trình duyệt. Response phân trang với cùng dữ liệu khoảng 5,5 KB cho 10 dòng. Kết quả đo riêng lưu local trong `.backups/cashbook-performance/`; không lưu thông tin phiên đăng nhập trong tài liệu hoặc Git.

- `npm.cmd run test:management-loading`: 12 nhóm kiểm tra cache, tải riêng danh mục, lỗi, cập nhật và API lọc có tham số.
- `scripts/check-management-loading-ui.py`: 9 tình huống trình duyệt, gồm số request, giữ bảng khi tải, tab chi tiết, form, chuyển trang nhanh, mobile và trả/đổi xe mô phỏng. API nghiệp vụ được intercept; không ghi dữ liệu thật.
- Kiểm tra API với database thật: đọc hợp đồng, hợp đồng của một khách, nhân sự của một cơ sở và từ chối ID không hợp lệ; chỉ dùng GET.
- Production build và TypeScript qua. Build còn cảnh báo hook `pricingVehicle` có sẵn trong `ContractComposer.tsx`.
- `npm.cmd run test:vehicles`: 6 nhóm qua; fixture đã đủ giá ngày/tháng, kiểm tra giá trống/0/số nguyên an toàn và các cột Excel. Chế độ `node scripts/check-vehicle-import.cjs --live-temp` qua 11 nhóm, dùng bảng PostgreSQL TEMP trong transaction rồi rollback; không ghi dữ liệu nghiệp vụ lâu dài.
- `scripts/check-contract-layout-ui.py`: 7 nhóm qua với selector input/datalist và menu thao tác hiện tại; kiểm tra tiền tự tính, lưu nháp/lỗi xung đột, mở lại dữ liệu, bàn phím/mobile và PDF 1/2 trang A4 ngang. API ghi được mô phỏng, không ghi dữ liệu thật.
- `npm.cmd run test:drafts`: 5 nhóm qua. Form lưu nháp kiểm tra nhân sự bằng danh sách đã tải của cơ sở, không phụ thuộc danh mục nhân sự toàn hệ thống.

Trình duyệt xác nhận lần đầu mở trang xe có 2 request danh mục thay vì 5; làm mới chỉ có 1 request xe. Đây là giảm số request, chưa phải phép đo thời gian tải trên production.

Hai kiểm tra cũ sau lần pull đã được cập nhật và chạy qua. Các kiểm tra dữ liệu, validation và mẫu in được giữ; bổ sung assertion ID nhân sự trong payload lưu nháp và giữ nguyên giá khi file nhập để trống.

Prompt dành cho lượt cải thiện giao diện, giới hạn CSS/JSX trình bày và giữ nguyên phần tối ưu: [UI-REDESIGN-PROMPT.md](UI-REDESIGN-PROMPT.md).
