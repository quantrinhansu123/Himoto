# Giao diện HIMOTO

Giao diện quản lý và đăng nhập dùng màu vàng thương hiệu trên nền trắng/xám, hệ token CSS thống nhất, bảng và bộ lọc gọn hơn, sidebar/topbar rõ trạng thái đang chọn, form/dialog thích ứng với màn hình nhỏ.

Đợt chỉnh giao diện ngày 2026-10-10 chỉ thay đổi `src/styles/management.css` và `src/styles/login.css`. Các cập nhật mobile ngày 2026-10-12 được ghi riêng bên dưới.

## Các lỗi đã sửa sau review

- Ẩn nút mở menu mobile ở desktop; menu vẫn hoạt động ở tablet/mobile.
- Giữ chữ tối trên nút vàng khi hover; tăng độ tương phản của placeholder và một số nhãn phụ. Hai cặp màu chính đã sửa là `#1e293b` trên `#d97706`, và `#64748b` trên nền trắng.
- Khai báo token `--mg-shadow-dialog` để shadow của dialog hiển thị đúng.
- Khai báo độ rộng đủ 12 cột cho bảng sổ quỹ (`.mg-cashbook-table`), đặt `min-width: 1905px` và vùng cuộn ngang độc lập để các cột cuối (hình thức thanh toán, tài khoản, cơ sở, lý do, nội dung) không bị ép hẹp hay rớt dòng từng ký tự.

## Kiểm chứng

- `npm.cmd run lint:management`: qua, còn cảnh báo hook `pricingVehicle` có sẵn trong `ContractComposer.tsx`.
- `npm.cmd run typecheck` và `npm.cmd run build`: qua.
- `npm.cmd run test:management-loading`: 12 nhóm qua.
- `npm.cmd run test:vehicles`: 6 nhóm qua.
- `scripts/check-management-loading-ui.py`: 9 nhóm qua, gồm tải riêng danh mục, giữ bảng khi refresh và cache theo tab.
- `scripts/check-contract-layout-ui.py`: 7 nhóm qua, gồm bàn phím, validation, lưu/mở nháp mô phỏng và PDF A4 ngang 1/2 trang.
- `scripts/check-cashbook-layout-ui.py`: 10 nhóm qua ở 5 kích thước (1440/1270/1024/768/375px), các cột cuối đạt độ rộng ≥ 140px, chiều cao dòng tối đa < 180px, cuộn ngang bằng phím mũi tên và không tràn ngang trang.
- Kiểm tra 9 trang quản lý ở 1440/768/375px: 27 màn hình không tràn ngang toàn trang, không có lỗi JavaScript. Kiểm tra thêm menu mobile, màu nút khi hover, shadow dialog và đăng nhập ở ba kích thước.

QA chạy trên production build cục bộ, Chromium, với API nghiệp vụ được mô phỏng; không tạo hoặc sửa dữ liệu nghiệp vụ thật. Chưa kiểm tra Safari/Firefox hay đo thời gian tải trên Vercel.

## Ảnh giao diện sau sửa

Ảnh dùng dữ liệu QA mô phỏng, tên tài khoản đã ẩn.

| Màn hình | 1440px | 768px | 375px |
| --- | --- | --- | --- |
| Danh sách xe | [Ảnh](qa/redesign/vehicles-1440.png) | [Ảnh](qa/redesign/vehicles-768.png) | [Ảnh](qa/redesign/vehicles-375.png) |
| Form hợp đồng, tab khách hàng | [Ảnh](qa/redesign/form-customer-1440.png) | [Ảnh](qa/redesign/form-customer-768.png) | [Ảnh](qa/redesign/form-customer-375.png) |
| Sổ quỹ / Sổ két | [Ảnh](qa/redesign/cashbook-1440.png) | [Ảnh](qa/redesign/cashbook-768.png) | [Ảnh](qa/redesign/cashbook-375.png) |
| Đăng nhập | [Ảnh](qa/redesign/login-1440.png) | [Ảnh](qa/redesign/login-768.png) | [Ảnh](qa/redesign/login-375.png) |

## Thẻ mobile và xem mẫu in — 2026-10-12

Ở màn hình rộng tối đa 900px, danh sách xe, khách hàng, hợp đồng (gồm nháp/VAT), nhân sự và cơ sở dùng thẻ chữ nhật ngắn. Mỗi thẻ có tên, thông tin nhận diện/liên hệ cơ bản và trạng thái. Chạm phần nội dung mở chi tiết; nút ba chấm chứa các thao tác theo quyền hiện có, gồm chuyển xe/đổi trạng thái. Checkbox chọn nhiều đứng riêng để không mở nhầm chi tiết. Sắp xếp, bộ lọc và phân trang vẫn dùng chung dữ liệu với desktop.

Theo yêu cầu cập nhật ngày 2026-10-12, mẫu xem trước giữ trang A4 ngang và tự vừa chiều rộng màn hình ở cả hai hướng cầm điện thoại, như ảnh mẫu đã chốt. Bỏ nút xoay trang và cơ chế tự xoay tờ giấy; giữ phóng to/thu nhỏ và vừa màn hình để đối chiếu thông tin với khách. Ở điện thoại nằm ngang, thanh công cụ gọn hơn và vùng đọc hợp đồng có cuộn riêng. Hợp đồng nhiều trang được xếp liên tiếp; phóng to chỉ áp dụng cho bản xem trước. Khi in/PDF vẫn dùng nội dung, kiểu chữ và khổ A4 ngang ban đầu.

Kiểm chứng trên production build cục bộ với API nghiệp vụ mô phỏng, không ghi dữ liệu thật:

- `npm.cmd run lint:management`, `npm.cmd run typecheck`, `npm.cmd run build`: qua.
- `npm.cmd run test:management-loading`: 12 nhóm kiểm tra tải/cache dữ liệu.
- `scripts/check-mobile-cards-ui.py`: 8 nhóm qua; năm danh mục ở 320/375/768/844/1440px; mở chi tiết, menu, chọn nhiều, phân trang, sắp xếp, lọc, danh sách trống và thử lại khi lỗi.
- `scripts/check-contract-layout-ui.py`: 9 nhóm qua; mẫu xem trước ở 320/375/667/844px giữ A4 ngang, không có nút xoay trang, phóng to/vừa màn hình, vùng đọc nằm ngang, các trang phụ lục và PDF A4 ngang một/hai trang từ desktop/mobile.
- `scripts/check-management-mobile-ui.py`: 15 nhóm qua, 54 màn hình trên chín trang ở 320/375/390/430/768/812px, gồm điều hướng, menu, form, chi tiết và đăng nhập; không có lỗi JavaScript.

Ảnh dùng dữ liệu QA mô phỏng: [xe](qa/mobile-cards/vehicles-375.png), [hợp đồng](qa/mobile-cards/contracts-375.png), [khách hàng](qa/mobile-cards/customers-375.png), [nhân sự](qa/mobile-cards/staff-375.png), [cơ sở](qa/mobile-cards/stores-375.png), [mẫu in khi cầm máy dọc](qa/mobile-print/print-preview-375.png), [mẫu in khi cầm máy ngang](qa/mobile-print/print-preview-667.png).

Kiểm tra bằng Chromium; chưa kiểm tra trực tiếp trên Safari/iPhone hoặc trình duyệt bên trong ứng dụng nhắn tin.

## Thanh toán hợp đồng trên mobile — 2026-10-12

Hộp thoại thanh toán trước đó vẫn xếp sáu số liệu thành một cột dài. Ở màn hình tối đa 600px, phần tổng tiền nay có hai cột, ba hàng: tiền thuê/tổng đã thu/còn thiếu bên trái, tiền cọc đã thu/đã trả/đang giữ bên phải. Giữ đầy đủ số liệu và chú thích công nợ không trừ cọc. Thu gọn khoảng cách ở tiêu đề và form; checkbox gia hạn đứng cùng dòng với tên xe, nhóm thao tác lịch sử xuống dòng theo chiều rộng màn hình.

Kiểm chứng bằng Chromium trên production build cục bộ: chín nhóm kiểm tra ở 320/375/430/667/768/1440px, gồm chuyển nghiệp vụ thu công nợ/thu thêm/trả cọc/gia hạn, mở/quay lại mã QR, số tiền lớn và số liệu chưa đối chiếu. Không tràn ngang hộp thoại, nút cuối form nằm trong màn hình; ô nhập tối thiểu 44px, cỡ chữ 16px. Khối tổng tiền ở 375px cao khoảng 176px. `npm.cmd run build` qua; không có lỗi JavaScript và không ghi dữ liệu nghiệp vụ thật.

Ảnh dữ liệu QA mô phỏng: [thanh toán mobile](qa/mobile-payment/payment-375.png), [desktop](qa/mobile-payment/payment-1440.png), [kết quả kiểm tra](qa/mobile-payment/results.json). Chưa kiểm tra Safari/iPhone thật.

## Rà soát toàn sản phẩm trước khi push — 2026-10-12

Bổ sung thẻ mobile cho các màn còn dùng bảng: Sổ quỹ (tài khoản, phiếu thu/chi), phiếu của từng tài khoản, danh sách liên quan trong chi tiết cơ sở, lịch sử xe, thời gian thuê từng xe và ba phần đối chiếu Excel (khách hàng, cơ sở theo căn cước, xe). Thẻ có thông tin ngắn, chạm để xem đầy đủ và menu ba chấm. Tài khoản mở hộp thoại chi tiết/sửa/xóa hiện có; phiếu giữ đủ 12 trường, chọn nhiều, sắp xếp và phân trang. Menu nằm trong hộp thoại đang mở để vẫn bấm được trên mobile. Bộ lọc ngày Sổ quỹ và các khối tổng tiền được xếp gọn hơn.

Kiểm tra trên production build cuối với dữ liệu QA mô phỏng:

- `npm.cmd run lint:management`, `npm.cmd run typecheck`, `npm.cmd run build`: qua.
- Tải/cache dữ liệu: 12 nhóm; dữ liệu Sổ quỹ: sáu nhóm.
- `scripts/check-management-mobile-ui.py`: 15 nhóm, 54 lượt trên chín trang ở 320/375/390/430/768/812px; không có bảng hiển thị trên mobile, không tràn ngang trang; gồm điều hướng, đăng nhập, form và chi tiết.
- `scripts/check-mobile-cards-ui.py`: tám nhóm cho năm danh mục, thao tác, chọn nhiều, sắp xếp/phân trang/lọc và thử lại khi lỗi; desktop vẫn dùng bảng.
- `scripts/check-mobile-product-ui.py`: 81 trường hợp ở 320/375/812px, gồm danh sách phụ, menu trong hộp thoại, đủ bảy tab chi tiết hợp đồng, trả xe/gia hạn/đổi xe, lịch sử xe và ba phần đối chiếu Excel. Ba yêu cầu đối chiếu Excel được mô phỏng, không gửi lệnh lưu thật.
- `scripts/check-cashbook-layout-ui.py`: 10 trường hợp ở 1440/1270/1024/768/375px; desktop giữ 12 cột và cuộn bằng bàn phím; mobile mở thẻ để đọc đủ thông tin dài.
- Thanh toán: chín nhóm qua; mẫu in/PDF: chín nhóm qua, giữ A4 ngang một/hai trang.

Không có lỗi JavaScript hay ghi dữ liệu nghiệp vụ thật trong các kiểm tra giao diện. Phạm vi trình duyệt đã kiểm tra là Chromium; chưa xác nhận Safari/iPhone thật hoặc trình duyệt trong ứng dụng nhắn tin.

Ảnh mới: [Sổ quỹ](qa/mobile-product/cashbook-375.png), [phiếu của tài khoản](qa/mobile-product/account-vouchers-375.png), [lịch sử xe](qa/mobile-product/vehicle-history-375.png), [Excel khách hàng](qa/mobile-product/excel-customer-375.png), [Excel cơ sở](qa/mobile-product/excel-store-375.png), [Excel xe](qa/mobile-product/excel-vehicle-375.png). Kết quả: [chi tiết/form](qa/mobile-product/results.json), [54 lượt màn hình](qa/mobile-cards/mobile-regression-results.json), [Sổ quỹ desktop/mobile](qa/mobile-product/cashbook-layout-results.json).

## Bộ lọc ngày và phân trang mobile — 2026-10-12

Sửa bộ lọc Ngày phát sinh trong Sổ quỹ: mỗi nhãn Từ ngày/Đến ngày nằm trên ô nhập, hai ô có chiều rộng bằng nhau và nằm trong khung lọc. Trước đó, mỗi ô còn kế thừa hai cột gồm nhãn rộng 88px và ô nhập, khiến ô ngày bị ép hẹp. Phân trang trên các danh sách mobile được gom giữa hàng, giữ số trang hiện tại và tổng trang sát nhau, gồm trường hợp danh sách trống `1 / 1`.

Kiểm tra production build: Sổ quỹ có 16 trường hợp trên Chromium và 16 trên WebKit ở 1440/1270/1024/768/320/375/430/812px. Kiểm tra thêm ngày đã chọn, lọc ngày, khoảng ngày sai, xóa bộ lọc và phân trang khi trống. Rà lại 54 lượt trên chín trang quản lý bằng Chromium, gồm khoảng cách số trang ở các danh sách dùng chung. Build, kiểm tra kiểu dữ liệu và lint trong build đều qua; không có lỗi JavaScript hoặc ghi dữ liệu nghiệp vụ thật. WebKit chạy trên Windows; chưa thử Safari/iPhone thật.

Ảnh WebKit: [ô ngày và phân trang ở 375px](qa/mobile-spacing/cashbook-webkit-375.png), [phân trang khi trống](qa/mobile-spacing/empty-pagination-webkit-375.png). Kết quả: [Chromium](qa/mobile-spacing/chromium-results.json), [WebKit](qa/mobile-spacing/webkit-results.json).

## Cửa hàng xe, hình thức thanh toán và tìm trả xe — 2026-10-12

Đổi tên “Cơ sở thụ hưởng” thành “Cơ sở sử dụng xe” trong form đổi trạng thái, thông báo kiểm tra và lịch sử xe.

Form hợp đồng trên desktop/mobile dùng “Cửa hàng xe” để chọn xe và tải gợi ý nhân viên làm hợp đồng. Hai vị trí chọn ở tab Khách hàng/Phương tiện dùng chung lựa chọn, được lưu và khôi phục khi mở lại. Tra cứu khách thuộc cơ sở khác hoặc đổi cơ sở doanh thu giữ nguyên cửa hàng xe/nhân viên đã chọn. Phần nguồn khách và doanh thu vẫn theo hồ sơ khách, có thể sửa tại Liên kết nguồn khách. Hợp đồng cũ chưa có cửa hàng xe riêng tiếp tục dùng cơ sở đã lưu cho đến khi người dùng chọn lại.

Sửa lỗi WebKit chuyển focus về hộp thoại khi bấm checkbox, làm menu hình thức thanh toán đóng trước khi click hoàn tất. Giữ lựa chọn Tiền mặt/chuyển khoản qua đổi tab, lưu và mở lại; hợp đồng cũ khôi phục hình thức đã lưu. Khi lưu chính thức, khoản chưa thu vẫn giữ hình thức dự kiến; các khoản đã thu dùng hình thức thực tế. Lựa chọn dự kiến không tự tạo phiếu thu.

Form Trả xe tìm bằng mã hợp đồng, CCCD, biển số hoặc SĐT khách. Biển số chấp nhận chữ thường, có/không dấu phân cách và một phần biển số; SĐT/CCCD so khớp đủ số, giữ số 0 đầu. Truy vấn dùng tham số và xử lý ký tự wildcard.

Lựa chọn cửa hàng xe nằm trong JSON hợp đồng hiện có; không thêm bảng/cột hoặc chạy migration. QA dùng API mô phỏng và PostgreSQL trong bộ nhớ (PGlite), không ghi dữ liệu Supabase thật. WebKit chạy trên Windows; chưa kiểm tra Safari/iPhone thật.

Lệnh kiểm tra SQL độc lập, không dùng kết nối cơ sở dữ liệu thật:

```powershell
npm.cmd install --prefix .backups/contract-flow-qa --no-package-lock --no-save @electric-sql/pglite
npm.cmd run test:contract-branch-flows -- --pglite-path .backups/contract-flow-qa/node_modules/@electric-sql/pglite
```

Kiểm tra giao diện bằng `scripts/check-contract-branch-flows-ui.py` với `--browser chromium` hoặc `--browser webkit`, `--session-cookie-file` trỏ đến cookie QA cục bộ. Luồng kiểm tra gồm chọn xe ở cơ sở khác nguồn khách, tick checkbox/nhãn, Escape/bấm ngoài, lưu/mở nháp, gợi ý khoản thu chính thức và bốn cách tìm trả xe. Không gửi lệnh thu tiền hoặc trả xe thật.

Kết quả trên production build cục bộ:

- `lint:management`, lint năm module server đã sửa, `typecheck` và `build`: qua.
- Kiểm tra cửa hàng xe/thanh toán/tìm trả xe: sáu nhóm trên Chromium và sáu trên WebKit ở 320/375/1440px; không có lỗi JavaScript hoặc yêu cầu nghiệp vụ ngoài mô phỏng.
- Kiểm tra logic và SQL PostgreSQL trong bộ nhớ: bốn nhóm qua, gồm lưu/cập nhật/đọc lại nháp và truy vấn tìm trả xe thực tế.
- Kiểm tra lại form/mẫu in/PDF: chín nhóm qua; nhập Excel, sao chép, tổng hợp và parser lưu chính thức đều qua kiểm tra logic.

Ảnh dữ liệu QA: [cửa hàng xe/nhân viên mobile](qa/contract-branch-flows/customer-branch-webkit-375.png), [desktop](qa/contract-branch-flows/customer-branch-chromium-1440.png), [hình thức nhận cọc đã giữ](qa/contract-branch-flows/payment-methods-webkit-375.png), [kết quả tìm trả xe](qa/contract-branch-flows/return-search-webkit-375.png). Kết quả: [Chromium](qa/contract-branch-flows/chromium-results.json), [WebKit](qa/contract-branch-flows/webkit-results.json), [logic/SQL](qa/contract-branch-flows/unit-results.json), [form/mẫu in/PDF](qa/contract-branch-flows/layout-results.json).

## Cọc giữ xe trừ tiền thuê — 2026-10-12

Thêm **Hợp đồng → Nhận cọc giữ xe** để ghi khoản 100–200k đã nhận trước ngày thuê. Khoản trả trước tạo phiếu Thu liên kết ngay với hợp đồng và tăng số dư tài khoản nhận; đơn ở trạng thái **Đã cọc, chờ nhận xe**. Ngày nhận mặc định là ngày mai. Tiền này được trừ vào tiền thuê, tách khỏi cọc bảo đảm hoàn trả. Địa chỉ/người thân có thể bổ sung trước khi in; lưu nháp chưa tạo phiếu Thu.

Menu ba chấm có **Giao xe** cho đơn chờ nhận. Xác nhận giao xe chuyển đơn/xe sang Đang thuê, giữ mã đơn và khoản đã thu; nếu còn thiếu tiền thuê thì mở form thu phần còn lại trong Sổ quỹ. Đã trả đủ thì không mở form thu thêm. Chọn xe đầu tiên đồng bộ cửa hàng/gợi ý nhân viên theo cơ sở đang giữ xe, độc lập cơ sở nguồn khách/doanh thu.

Hướng dẫn nhập và kiểm thử: [Nhận cọc giữ xe trước ngày thuê](contract-reservations.md). Không thêm schema hay ghi dữ liệu Supabase thật khi kiểm thử.

Kiểm chứng trên production build cục bộ:

- Luồng nhận cọc/giao xe/thu phần còn lại: bốn nhóm Chromium và bốn nhóm WebKit ở 320/375/1440px; gồm trường hợp đã trả đủ không mở form thu thêm.
- SQL PostgreSQL trong bộ nhớ: tám nhóm, có tiền mặt/chuyển khoản, đối chiếu số dư, thu thêm trước khi giao, chống ghi trùng/xung đột xe và rollback.
- Rà lại cửa hàng xe, hình thức thanh toán và tìm trả xe: sáu nhóm Chromium và sáu nhóm WebKit. Form/mẫu in/PDF: chín nhóm Chromium.
- Kiểm tra nháp, autofill, tổng hợp hợp đồng, Sổ quỹ, thanh toán và phát hành; lint phần quản lý/server, typecheck, build và `git diff --check`: qua.

Kết quả: [luồng mới trên Chromium](qa/contract-reservations/chromium-results.json), [WebKit](qa/contract-reservations/webkit-results.json), [SQL](qa/contract-reservations/sql-results.json), [luồng hiện có trên Chromium](qa/contract-reservations/branch-chromium-results.json), [WebKit](qa/contract-reservations/branch-webkit-results.json), [mẫu in/PDF](qa/contract-reservations/layout-results.json). Chưa kiểm tra Safari/iPhone thật.

## Thao tác điện thoại, doanh số và hồ sơ tạm — 2026-10-14

Điện thoại đăng nhập vào **Thao tác nhanh**: làm hợp đồng, trả xe, gia hạn, đổi trạng thái xe. Thanh điều hướng dưới dẫn đến thao tác, hợp đồng, xe và sổ quỹ. CSV/Excel/xóa trên danh sách thu gọn trong **Quản lý dữ liệu**; desktop giữ các nút hiện có.

Trong hợp đồng chọn riêng **NVKD ghi nhận doanh số** và **Nhân viên TLS giới thiệu khách**, bên cạnh nguồn khách/cơ sở ghi nhận doanh thu. Báo cáo **Doanh số nhân viên** lọc ngày, cơ sở, bộ phận và xuất CSV:

- **NVKD:** tiền thuê thực thu theo ngày phiếu thu đã duyệt, gồm gia hạn, mọi khách; loại cọc và phí khác có phân loại.
- **TLS:** tiền thuê gốc trên hợp đồng mở mới đầu tiên, ghi nhận trong kỳ bắt đầu thuê; không phụ thuộc đã thu, không tính khách quay lại/gia hạn. Thuê sở hữu dùng toàn bộ lịch đã ký: 12 kỳ × 3 triệu = 36 triệu, không thay đổi khoản thu lúc ký (cọc + kỳ đầu).
- Lần thuê đầu xét toàn hệ thống trước khi lọc ngày/cơ sở; bỏ nháp, giữ xe và hủy. Phí ban đầu có trong snapshot được trừ khỏi các phiếu thu thuê/phí theo thứ tự thu, không trừ lặp khi đổi tháng báo cáo. Hợp đồng cũ thiếu phân công nhân viên cần gán lại; không suy đoán từ tên nguồn khách.

**Lưu chính thức** dùng thông tin vận hành: khách/điện thoại, cửa hàng, xe, thời gian và tiền. Người thân, CCCD, địa chỉ, đại diện có thể bổ sung sau. **Yêu cầu hồ sơ khi in hợp đồng** cho chọn các trường cần hoàn tất và số người thân 0/1/2; lựa chọn lưu riêng theo từng hợp đồng. Không hạ kiểm tra tiền, tài khoản hoặc xe khi thiếu hồ sơ.

**Lưu hồ sơ hợp đồng** bổ sung thông tin và phân công nhân viên cho hợp đồng đã phát hành. API chỉ nhận các trường hồ sơ cho phép, kiểm tra phiên bản, vai trò nhân viên; giữ khách liên kết, ngày thuê/trả, công nợ, kho xe và phiếu thu đã ghi.

Kiểm tra logic/doanh số/hồ sơ trên bảng PostgreSQL TEMP, rollback và không ghi dữ liệu vận hành thật:

```powershell
npm.cmd run test:staff-sales
node scripts/check-contract-billing-db.cjs
```

Kiểm tra giao diện bằng `scripts/check-operations-ui.py` với `--browser chromium` hoặc `webkit`, cookie QA cục bộ và toàn bộ API nghiệp vụ được mô phỏng. Cookie/ảnh QA nằm trong `.backups/operations`, không đưa token lên Git.

Kết quả: sáu nhóm nghiệp vụ/doanh số/hồ sơ trên PostgreSQL TEMP; năm nhóm phát hành/thu kỳ sở hữu; sáu nhóm UI Chromium và sáu WebKit; mười nhóm form/mẫu in/PDF. Autofill/nháp, lint, typecheck và production build qua. Không ghi tiền hoặc đổi xe trong dữ liệu thật; chưa kiểm tra iPhone/Safari thật.
