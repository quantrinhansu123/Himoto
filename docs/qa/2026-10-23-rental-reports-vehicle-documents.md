# Sổ quỹ, báo cáo kế thừa và giấy tờ xe — 23/10/2026

## Phạm vi

Phát triển trên HIMOTO mới tại `E:\Himoto`; không sửa app cũ, chứng từ vận hành hay `.env`. Thư mục Drive người dùng cung cấp có `happyride-1.1.zip` và SQL; đối chiếu mã app cũ đã có tại `E:\duanthuexe\happyride-1.1`.

Nguồn nghiệp vụ đã đọc: `VehicleService::revenueTotalsQuery`, `ReportService::handleDetailReportNew`, `ReportVehicleRevenue.vue`, `ReportCardRental.vue`, `ModalShowVehicleRevenue.vue`, `OrderService::addOnPrice`.

## Hành vi

- `/cashbook` có ba ô: doanh thu = gia hạn + phí thuê + trả muộn − hoàn trả sớm; tổng thu = cọc + gia hạn + phí thuê + trả muộn; tổng chi = cọc đã trả + hoàn tiền trả sớm. Mặc định chỉ hiện tên và số tổng, bấm/Enter mở các khoản con. Nút Hôm nay chọn một ngày tại Việt Nam. Khoản sửa chữa, thu/chi khác và tổng tất cả phiếu nằm riêng ở Đối chiếu; bảng phiếu và tài khoản vẫn giữ toàn bộ dữ liệu theo bộ lọc.
- Tổng chi dùng số thực chi theo chứng từ đã duyệt. Cọc còn giữ/chưa hoàn không tự tính là đã chi. Không dùng snapshot giảm giá hoặc gia hạn chưa thu làm tiền thực thu/hoàn.
- Gia hạn app cũ ghi `name=addon,type=addon,order_id` được nhận diện thống nhất với gia hạn mới và phiếu gia hạn có liên kết. Các addon khác không tự bị coi là gia hạn. Chỉ thay cách đọc/tổng hợp, không sửa các phiếu nguồn.
- `/staff-sales` có ba lựa chọn: thực thu theo ngày/NVKD, doanh thu từng xe, tổng quan thuê xe. Chỉ gọi báo cáo mới khi được chọn. Ngày và cơ sở dùng chung; thao tác lỗi có Thử lại; không trình bày số của bộ lọc trước thành số của bộ lọc mới.
- Doanh thu xe cũ giữ cách tính `handler_price` khác 0 hoặc `total_money + money_out_date`, theo ngày bắt đầu lượt thuê. Web mới phân bổ `total_rental_fees` theo số xe cùng đơn giá với phần dư đồng vào ID đầu, cộng `total_renewal_amount` từng xe và điều chỉnh trả muộn/trả sớm trong payload; tách phí sửa chữa. Không viết lại dòng tiền trên hợp đồng. Vì đây là doanh thu theo lượt thuê, có thể khác thực thu theo ngày; giao diện ghi rõ.
- Báo cáo xe có tìm kiếm, sắp xếp, tổng toàn tập trước phân trang, Trang cuối, chi tiết từng lượt và liên kết hợp đồng; CSV xuất đủ tập khớp bộ lọc. Tổng quan có bảng theo cơ sở/ngày, mở từng cơ sở và CSV. Điện thoại dùng thẻ với số doanh thu nhìn thấy ngay, mở chi tiết khi cần.
- Tổng quan dùng chứng từ thuê xe, loại các neo hợp đồng thuê pin cũ; Sổ quỹ vẫn bao gồm toàn bộ phiếu thu/chi trong bộ lọc (kể cả thuê pin). Phạm vi cơ sở của doanh thu xe là nơi hiện quản lý xe; phạm vi tổng quan là cơ sở ghi phiếu. Mọi truy vấn giữ RLS của tài khoản.
- API/client kiểm tra ngày, số tiền nguyên an toàn, tổng và chi tiết, ID, trang, sắp xếp. Phản hồi thiếu dòng hoặc lệch tổng bị báo lỗi trước khi render/xuất.
- Form xe đọc được biển số, số khung, số máy, màu, năm sản xuất. Giữ số 0 đầu và phân biệt O/0, không đoán năm theo ngày đăng ký. Giữ nhập tay trước/trong lúc đọc; bỏ/đổi ảnh hủy phản hồi cũ; lỗi AI vẫn nhập tay và lưu ảnh được.
- Bốn ảnh hồ sơ: đăng ký trước/sau, giấy mua bán trang 1/2. Lưu giấy tờ và xe cùng transaction bằng upload receipt đã xác minh. Upload lỗi chưa gọi lưu xe; lỗi gắn ảnh rollback cả thao tác xe. Bỏ ảnh đã lưu chờ bấm Lưu xe; đóng form không xóa ảnh nguồn. Chi tiết xe xem lại ảnh bằng API có quyền.

## Kiểm chứng

Các lệnh kiểm tra dữ liệu dưới đây dùng fixture hoặc bảng TEMP/schema riêng trong outer transaction ROLLBACK; không tăng sequence nghiệp vụ:

```powershell
node scripts/check-rental-reports.cjs --live-temp
node scripts/check-vehicle-documents.cjs --live-temp
node scripts/check-cashbook-summary.cjs --live-temp
node scripts/check-cashbook-pagination.cjs --live-temp
node scripts/check-rental-revenue.cjs --live-temp
node scripts/check-staff-sales.cjs
node scripts/check-vehicle-registration-ocr.cjs
node scripts/check-photo-ocr.cjs
node scripts/check-refund-qr.cjs
node scripts/check-cashbook-data.cjs
npm.cmd run build
npm.cmd run typecheck
```

`check-vehicle-documents` kiểm tra migration chạy hai lần và quyền SELECT/INSERT/UPDATE/DELETE của hai cơ sở trong schema tạm, giữ nguyên quy tắc ảnh điều chuyển cũ; chữ ký giả/chủ sở hữu khác bị từ chối; lỗi ảnh thứ hai rollback ảnh thứ nhất và xe mới; không ghi giấy tờ thật.

Trình duyệt production local, Chromium desktop và WebKit điện thoại:

```powershell
python -X utf8 scripts/check-rental-reports-ui.py --url http://127.0.0.1:3021 --cookie-file <private-cookie> --browser chromium
python -X utf8 scripts/check-rental-reports-ui.py --url http://127.0.0.1:3021 --cookie-file <private-cookie> --browser webkit
python -X utf8 scripts/check-vehicle-registration-ocr-ui.py --url http://127.0.0.1:3021 --session-cookie-file <private-cookie> --browser chromium --output .backups/rental-reports-documents-20261023/vehicle-ui
python -X utf8 scripts/check-vehicle-registration-ocr-ui.py --url http://127.0.0.1:3021 --session-cookie-file <private-cookie> --browser webkit --output .backups/rental-reports-documents-20261023/vehicle-ui
```

Toàn bộ API nghiệp vụ/OCR/Cloudinary trong browser bị giả lập. Không gửi giấy tờ thật tới AI, tạo phiếu hoặc gửi Telegram. Bằng chứng chỉ local ở `.backups/rental-reports-documents-20261023/`. Không đưa cookie/secret vào Git.

Kết quả cuối: build, typecheck, ESLint các tệp sửa và `git diff --check` đạt. Build giữ cảnh báo đã có tại `StaffOrganizationChart.tsx` về hook và cấu hình Next ESLint; các tệp sửa không có cảnh báo lint.

- 75 nhóm kiểm tra dữ liệu/API gồm 6 báo cáo mới, 3 giấy tờ/migration, 6 tổng sổ quỹ, 5 phân trang sổ quỹ, 5 thực thu/hoàn tiền, 8 doanh số NVKD/TLS, 4 OCR xe, 4 OCR/Cloudinary cũ, 5 QR hoàn tiền, 6 dữ liệu sổ quỹ, 5 lịch sử điều chuyển, 14 xác thực và 4 tab hợp đồng: đạt.
- 37 tình huống browser trên production build local: 24 báo cáo mới/giấy tờ qua Chromium và WebKit, 7 hồi quy phân trang sổ quỹ trên Chromium, 6 hồi quy thực thu/hoàn tiền qua hai trình duyệt: đạt, không có lỗi JS. Bấm nhanh Trang cuối, tải ảnh đồng thời, lỗi upload trước POST xe, lỗi lưu xe rồi gửi lại, ảnh đã lưu mở lại và bỏ ảnh chờ Lưu đều đã kiểm tra.
- HTTP GET với Supabase thật: hai báo cáo mới trả 200 và tổng hợp lệ ở admin, ownership_staff, ownership_manager; hai quyền cơ sở lọc sang cơ sở khác trả rỗng. Không cookie nhận 401. Admin có 391 xe trong danh mục lịch sử, trang cuối 40 với cỡ 10; tổng không đổi theo trang và CSV đầy đủ khớp tổng. Con số là snapshot lúc QA, không phải số xe đang khai thác. API danh sách ảnh xe trả 200. Không gọi API ghi hoặc gửi Tele.
- Migration và lưu/gỡ giấy tờ mới chỉ kiểm tra trên schema/bảng tạm có rollback, chưa áp dụng hay ghi thử ảnh vào hồ sơ vận hành. OCR và Cloudinary trong lượt này dùng phản hồi giả lập; chưa xác nhận riêng năm trường bằng ảnh đăng ký thật.

## Triển khai

Ngày 24/10/2026, sau yêu cầu đẩy Git, đã áp dụng `docs/sql/2026-10-23-vehicle-documents.sql` lên DB vận hành trước khi push bản phát hành. Sao lưu định nghĩa constraint/policy trước và sau tại `.backups/release-rental-documents-20261024/`. Bốn policy vẫn restrictive, đủ bốn vị trí giấy tờ mới; 4.423 bản ghi ảnh giữ nguyên, không ghi bản ghi nghiệp vụ. Migration chạy trong transaction, giới hạn chờ khóa 5 giây.

Code và báo cáo được đưa vào commit phát hành trên `main`; push kích hoạt Vercel. Cần kiểm tra trạng thái deployment đúng SHA trước khi xác nhận website đã cập nhật. Build và QA local không thay cho xác nhận production.

Lịch sử cũ còn các phiếu quyết toán/thu chi không đủ loại riêng để tách chính xác các khoản; giữ dữ liệu nguồn, đưa khoản chưa nhận diện vào đối chiếu thay vì suy diễn. Báo cáo xe cũ là cách tính theo dòng hợp đồng của app cũ, không phải phân bổ tiền thực thu cho từng xe hoặc lợi nhuận sau chi phí.
