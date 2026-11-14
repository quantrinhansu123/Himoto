# Himoto mobile và web — 14/11/2026

## Phạm vi và nguyên nhân

Đối chiếu source web, tích hợp tới `6780dec`, cùng ảnh người dùng gửi. Commit `4c4e8e5` đã gỡ các lối xuất file khỏi 14 tệp mobile và thay màn chọn cột bằng thông báo dùng máy tính, trong khi API và bộ dựng Excel vẫn còn. Nhập bổ sung giao dịch đã có nghiệp vụ nhưng thiếu lối vào tại danh sách hợp đồng. Báo cáo ca giữ một bộ nhãn/trạng thái khác web; form Android chưa tự cuộn ô đang nhập khi bàn phím mở.

Đợt này giữ runtime Android `1.0.11`, version code `12`, project `f928280d-4ea8-4574-b64e-51dd44b94d68`, channel `production`. Không thêm dependency, module native hoặc migration. Hai bảng đăng ký ca đã tồn tại khi kiểm tra chỉ đọc trước triển khai.

## Thay đổi

- Khôi phục chọn cột và xuất XLSX theo bộ lọc cho hợp đồng, khách hàng, xe, nhân sự, cơ sở. Giữ scope, cơ sở, trạng thái, tìm kiếm, ngày, nguồn/kho và ID khách; xuất cả các trang chưa mở.
- Khôi phục XLSX cho pin/sạc, luân chuyển, GPS, tài khoản, báo cáo ca, lịch trực, lịch sử nhắc nợ, sổ quỹ, tổng quan và báo cáo doanh thu/chi tiết. API tổng quan/báo cáo tiếp tục trả CSV cho client cũ khi không yêu cầu XLSX. Mẫu Excel dùng bộ dựng của web.
- Đưa “Nhập bổ sung giao dịch” và Excel ra ngoài ở danh sách hợp đồng. Khôi phục lối vào nhập nháp từ Excel cho đúng quyền quản trị. Xóa nhiều hợp đồng dùng quyền `contracts.delete`, bản rà soát và domain xóa/ẩn của web; hợp đồng đang thuê vẫn bị chặn. Không gửi lệnh xóa thật để kiểm thử.
- Màn nhóm hợp đồng, thao tác quầy và dữ liệu con của cơ sở dùng nút Quay lại, ẩn hamburger. Màn chính giữ menu. Mục Cơ sở dùng quyền đọc hợp đồng, không đòi quyền sửa cấu hình.
- Web, app và export dùng chung `shared/shift-report-workflow.ts`: tên sáu phần báo cáo và năm tiến độ, gồm “Đã xác nhận có giải trình”. Mẫu báo cáo nằm ở Thông tin như web; đồng bộ nhãn kiểm kê, đơn vị, nút lưu/chốt và cơ sở đang chọn. Xuất báo cáo ca đọc toàn bộ kết quả; danh sách trên màn hình vẫn là 100 báo cáo gần nhất như web.
- Thành phần nhập liệu dùng đo vị trí ô đang focus, kích thước vùng cuộn và bàn phím; xử lý cả layout resize của Android cũ khi IME không phát sự kiện. Áp dụng PGD/KTNB, pin, nhân sự, cơ sở, xe, sổ quỹ và các form giao/trả/đổi xe. Hộp chọn giới hạn chiều cao và cuộn được khi xoay ngang; không cuộn form nền khi đang tìm trong modal.
- Bổ sung đăng ký ca của chính nhân viên theo tuần, bảng đăng ký tháng cho HR, ca làm việc và Excel tại cơ sở, lối vào tài khoản đã liên kết ở hồ sơ nhân sự, cài đặt GPS chấm công. Gọi lại domain/handler web, giữ quyền và scope tương ứng. Lịch trực HR được chọn cơ sở/nhân sự toàn hệ thống như web mới.
- Tích hợp thay đổi web vừa phát hành: tìm ca trong hộp chọn, bảy trạng thái xe độc lập không tạo nháp/sửa công nợ, giữ khóa kho khi còn hợp đồng hoặc chờ điều chuyển. Dùng lại writer web, rà soát phiên bản và receipt có chữ ký; vẫn đọc/đối chiếu được yêu cầu tạo nháp từ client cũ. Kho đổi xe dùng dữ liệu mới và hiện cảnh báo giữ xe trong nháp; nháp không chặn xe Lưu kho.
- Đồng bộ trang Đăng ký ca riêng trong menu HR, lọc/ghép khoảng ngày tối đa 93 ngày, tổng công trong khoảng đang xem, ký hiệu/quy định và Excel. Web/app dùng cùng kiểm tra ngày và bảng dữ liệu xuất; API tháng cũ vẫn tương thích. Thu hồi xe dự báo đóng hợp đồng theo đúng quyền tất toán của writer web; đổi quyền sau rà soát làm snapshot cũ bị từ chối và không ghi.
- Theo dõi cập nhật khi đưa app ra trước; tải nền và áp dụng ở lần mở lại. Hiển thị phiên bản/thời điểm cập nhật ở Tài khoản. Không tự reload khi nhân viên đang nhập nghiệp vụ. Khi kiểm tra thủ công, ưu tiên bản đã tải sẵn và không báo “mới nhất” khi cập nhật bị tắt.

## Ma trận đối chiếu source

Đây là đối chiếu màn, lối vào, API, quyền và nghiệp vụ trong mã; không phải chứng nhận mọi tổ hợp thao tác trên điện thoại thật.

| Nhóm web | Mobile / đối chiếu |
|---|---|
| Chấm công | Vào/ra, ảnh, GPS, lịch sử, đăng ký tuần, vị trí cơ sở |
| Báo cáo cuối ca | PGD/KTNB, sáu phần, năm tiến độ, minh chứng, Telegram, Excel đủ kết quả |
| Thao tác nhanh / nhập bổ sung | Hợp đồng, gia hạn, thu chi theo ngày thực tế; lối vào tại danh sách |
| Tổng quan giao dịch | Kỳ/ngày/cơ sở, chỉ số và tổng theo cơ sở, XLSX |
| Báo cáo doanh thu | Các mục/chỉ số, bộ lọc, phân trang, chi tiết, XLSX; canExport từ server |
| Nhân sự | Hồ sơ, trạng thái, cơ sở, sơ đồ, tài khoản liên kết, Excel, xóa theo quyền |
| Đăng ký ca | Trang HR riêng, tuần của chính nhân viên, tháng/khoảng ngày, thêm ngày hiển thị, cơ sở/tìm kiếm, tổng công, quy định và Excel |
| Lịch trực cơ sở | Lịch tuần, nhân sự/cơ sở toàn hệ thống theo HR, đăng ký tháng, Excel |
| Khách hàng | Danh sách/hồ sơ/giấy tờ, nhập/khớp cơ sở, bộ lọc, Excel, xóa theo quyền |
| Danh sách hợp đồng | Bộ lọc/cơ sở, đếm trạng thái, menu từng grant, các nghiệp vụ, nhập bổ sung, Excel |
| Hợp đồng nháp | Tiếp tục hồ sơ, cọc giữ xe, nhập hợp đồng, nhập Excel, xuất theo bộ lọc |
| Hợp đồng VAT | Scope và cột VAT từ bộ dựng web, Excel |
| Hợp đồng quá hạn | Bao gồm nợ xấu; danh sách/đếm/export dùng domain hiện hành |
| Đến hạn đóng tiền | Scope lịch thanh toán, số tiền/ngày đến hạn, Excel |
| Gửi nhắc nợ | Chọn/soạn/gửi theo quyền, lịch sử, Excel |
| Hợp đồng thuê sở hữu | Scope, kỳ, duyệt, báo cáo, bộ lọc và Excel |
| Hợp đồng pin/sạc | Hồ sơ, thuê/gia hạn/thu nợ/trả, minh chứng/Telegram, Excel |
| Loại hợp đồng | Tạo/đổi tên/ẩn-hiện qua domain hiện có; không tạo export nếu web không có |
| Danh sách xe | Hồ sơ, trạng thái, lịch sử, nhập/đồng bộ Excel, xuất, kho và điều chuyển |
| Lịch sử luân chuyển | Ngày/cơ sở/nơi đi-nhận/thao tác/tìm kiếm, Excel đủ trang |
| Định vị GPS | Thiết bị/sự kiện/ghép/đồng bộ theo quyền, Excel thiết bị |
| Cơ sở | Quyền đọc, hồ sơ, dữ liệu con, ca làm việc, Excel |
| Sổ quỹ / ngân hàng / két | Phiếu/tổng/bộ lọc, tài khoản, sửa/xóa theo quyền, Excel |
| Tài khoản / tích hợp / hướng dẫn | Quản trị theo grant, GPS/Telegram, hướng dẫn/hỏi đáp; giữ nghiệp vụ hiện có |

## Kiểm chứng

- Typecheck và lint web/mobile đạt. `test:release` chạy lại đủ 55 bộ; `test:mobile` chạy lại sau tích hợp web mới đạt, cùng offline/đồng bộ và vận chuyển XLSX.
- Kiểm thử mới `test:mobile:parity`: năm trạng thái ca, scope HR/self, GPS cơ sở, workbook ca 151 dòng, ca làm việc, cột/bộ lọc/toàn bộ trang và bảo toàn mã ghi khi xóa nhiều hợp đồng.
- PGlite chạy domain báo cáo ca, doanh thu và xóa nhiều: không ghi dữ liệu vận hành; hợp đồng đang thuê bị chặn, cả lô và receipt được rollback.
- Bộ SQL tài chính đầy đủ đạt 124 nhóm sau cập nhật fixture cho reader và quyền hiện hành: thu tiền/gia hạn/thu kỳ/trả/đổi xe/thu hồi/minh chứng, receipt, mất phản hồi, replay và rollback. Kiểm tra cả thu hồi không có quyền tất toán, đủ quyền và thay đổi quyền giữa rà soát/ghi; không sửa hoặc nới quyền production để kiểm thử.
- Playwright: 375×812 sáng, 430×932 tối, 812×375 ngang; menu con ẩn, nhãn/sáu tab báo cáo, hai file xuất đối chiếu bytes, giải trình, nhập nhân sự, đăng ký tháng/tuần và mất phản hồi sau lưu không gửi lần hai. Thêm hai luồng chọn cột và hai luồng xuất luân chuyển/lỗi-thử lại.
- Android dùng emulator riêng và API fixture chỉ cho đăng nhập/đọc; kiểm bàn phím và cập nhật production phải ghi rõ bản/thiết bị/bằng chứng. Điện thoại Samsung/iPhone thật không kết nối tại lúc bắt đầu đợt này; không dùng kết quả lịch sử thay cho kiểm chứng mới.
- Đã đo IME thật trên Android 15/API35: ô Nhân sự trực ca cuộn từ đáy 1626 px lên 1454 px, bàn phím bắt đầu 1517 px, khoảng trống 63 px; toàn bộ ô và chữ đang nhập hiển thị trong lúc IME mở. Bản QA đóng gói bundle sẵn, dùng API fixture cục bộ, không chạy máy chủ Metro. [Ảnh bàn phím](mobile-parity-20261114/keyboard-android.png).
- Bộ chọn thư mục Android thực tế lưu XLSX ca đủ 151 dòng / 16.152 byte. Đọc lại file từ Downloads cho kết quả giống hoàn toàn file fixture và ứng dụng báo lưu thành công; đúng một GET export, không ghi báo cáo/tiền. [Ảnh Excel đã lưu](mobile-parity-20261114/excel-android.png). Kết quả: `.backups/mobile-parity-keyboard-native-20261114-final-r2/results.json`, `.backups/mobile-parity-excel-native-20261114/results.json`.

## Phát hành và kiểm tra production

- Mã ứng dụng/API cuối: `5fe45c457f7c4099f8cf491a6623d9ca4a55c9d1`, đã push `main`. Vercel production `dpl_EkQQAK4HzboVKGYbJhfP81eJ77ym` Ready; `https://himoto.vercel.app` qua 23 kiểm tra công khai.
- Kiểm tra có đăng nhập trên production lần cuối: XLSX nháp 2 dòng và quá hạn 103 dòng khớp bộ lọc/số đếm trước-sau; workbook ca 2 dòng khớp API web; 7 ca làm việc xuất đúng. API khoảng 13–16/11/2026 trả đúng ngày và Excel 32 nhân viên/8.174 byte. API GPS, đăng ký tuần/tháng trả 200. Phiên QA tạm đã được xóa và token nhận 401. Không ghi nghiệp vụ, gửi Telegram hoặc tải ảnh. Các số đếm là ảnh chụp dữ liệu tại lúc kiểm tra, có thể thay đổi khi nhân viên làm việc.
- OTA Android `production`/runtime `1.0.11` cuối: group `d9b84300-bdff-404d-a2c9-7a653761955e`, update `01a1d92a-7dd9-7ec1-b663-e4ceba28f4cd`, phát hành 15:26 ngày 14/11/2026 (UTC+7). SHA-256 bundle đã tải lại từ CDN: `1ade683741a63825f6a6d22f9ca98b15dfe6319986444df4ea6505c5c9cda02a`, khớp artifact trước phát hành. Cấu hình push vẫn bật. Bản này thay bản cùng đợt lúc 14:39 để bổ sung thay đổi Đăng ký ca vừa được cập nhật trên web.
- Runtime `1.0.9` giữ group `71e7a3fd-35c9-45f9-9e2f-f8db5772614f`. Máy còn bản đó cần cài APK chính thức `1.0.11` một lần; cập nhật mới này tự tải trên app `1.0.11`, áp dụng khi mở lại, hoặc qua nút kiểm tra trong Tài khoản.
- Android 15/API35 emulator x86_64 đã nhận và chạy OTA đầu đợt (`01a1d8ff-789d-7fcb-ae50-fc55ebbb0743`); database Expo ghi `successful_launch_count=1`, `failed_launch_count=0`, màn đăng nhập render. Bản QA dùng nguyên classes/thư viện ARM của APK `1.0.11`, chỉ bật giải nén thư viện và ký QA để máy ảo dịch ARM; APK QA không phát hành. Bản cuối đã xác minh API production và manifest/bundle CDN. Theo yêu cầu người dùng, dừng xác nhận lại trên giả lập; người dùng tự kiểm tra trên Samsung, chưa ghi nhận nghiệm thu điện thoại thật.

Bằng chứng production: `.backups/mobile-parity-production-20261114/{results.json,ota-manifest-verification-final.json,emulator-ota-results.json}`; UI cuối cùng: `.backups/mobile-parity-workflow-ui-range-20261114/results.json`, `.backups/mobile-parity-inventory-ui-20261114/results.json`. [Bộ lọc đăng ký ca](mobile-parity-20261114/registration-range.png).

Bằng chứng máy chạy, bản dựng và phát hành được lưu trong `.backups/mobile-parity-*20261114*`. Chỉ ghi phát hành thành công sau khi deployment Ready, route production hoạt động và OTA đúng runtime/channel đã được xác minh. Runtime `1.0.9` không nhận bundle có yêu cầu native của `1.0.11`.
