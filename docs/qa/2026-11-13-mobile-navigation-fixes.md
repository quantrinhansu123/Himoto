# Sửa điều hướng và thao tác mobile — 13/11/2026

## Kết quả

Đã sửa sáu lỗi chức năng và lỗi đánh dấu menu được người dùng duyệt sau đợt
rà soát giao diện. Chỉ thay đổi mã nguồn và kiểm tra cục bộ: chưa đóng gói APK,
chưa cài đè điện thoại, chưa đẩy OTA và chưa deploy backend. Không ghi dữ liệu
nghiệp vụ hoặc gửi Telegram thật. Các thay đổi nén video của lượt trước được
giữ nguyên, cấu hình runtime chuẩn bị vẫn là 1.0.10.

## Thay đổi đã kiểm tra

1. **Nhân sự / Cơ sở:** drawer chuyển tới `/directory/staff` và
   `/directory/stores`. Kiểm tra mọi đích trong drawer với các route hiện có.
   Route dùng kiểu Href, không ép `any` để bỏ qua kiểm tra.
2. **Đóng hợp đồng nợ xấu:** chuyển tới contract lifecycle với preset
   `close_bad_debt`, không mở màn thu hồi xe. Menu chỉ hiện khi có grant
   `contracts.settle` do máy chủ chiếu ra; không suy ra quyền từ nhãn admin.
   Preset chỉ được chọn nếu context máy chủ có thao tác tương ứng. Điều kiện
   đủ xe/số tiền, nhập ngày/ghi chú, xác nhận rà soát và xác nhận cuối được giữ.
   Không tự động ghi thao tác khi mở màn hình; công nợ tiếp tục được theo dõi.
3. **Số lượng tab:** đọc thống kê riêng sau khi danh sách tải thành công.
   Query thống kê giữ cơ sở, nhóm hợp đồng, ngày, tìm kiếm và ID khách nhưng
   không đổi theo tab trạng thái; chuyển tab dùng chung cache 30 giây. Kéo
   làm mới hoặc invalidation sau ghi làm mới cả bộ đếm. Tab Tất cả dùng
   `tabCount` trước lọc trạng thái, không dùng tổng của tab hiện tại. Nếu chưa
   có bộ đếm hợp lệ thì không hiển thị số 0 thay thế sai; lỗi có nút thử lại.
4. **Hợp đồng của khách:** truyền `customer_id` thay vì tìm theo tên. Mở tất
   cả trạng thái, hiện nhãn khách đang lọc; ID nằm trong key cache, query và
   bộ lọc xuất. Tham số sai bị từ chối, không chuyển thành danh sách chung.
   Tìm kiếm thông thường trên route cũng được đọc đúng. Mở danh sách bình
   thường vẫn mặc định Nháp theo yêu cầu đã triển khai trước đó.
5. **Menu ba chấm:** trả/đổi xe, gia hạn, thu tiền, sửa nháp, đổi trạng thái
   và điều chuyển xe dùng grant tương ứng. Nhắc nợ còn kiểm tra eligibility
   và quyền lập hợp đồng/thu chi. Lịch sử hợp đồng khách cần contracts.read.
   QR, in và xem trạng thái Telegram giữ quyền đọc; nhãn Telegram thể hiện
   đúng đây là màn xem trạng thái và thao tác theo quyền của từng sự kiện.
   Backend và màn nghiệp vụ tiếp tục kiểm tra điều kiện mới nhất.
6. **Cơ sở hợp đồng mới:** nút Làm hợp đồng trên trang Thao tác truyền cơ sở
   đang chọn. Người giới hạn chi nhánh luôn dùng cơ sở được phân công;
   quản lý toàn hệ thống dùng lựa chọn hiện tại. Form vẫn kiểm tra lựa chọn
   có trong danh mục hợp lệ và backend vẫn kiểm tra quyền ghi.
7. **Đánh dấu drawer:** chuẩn hóa group `/(tabs)` trước khi so pathname;
   nút có role và trạng thái selected cho công cụ hỗ trợ truy cập.

## API đọc và tương thích

`mobileTableParams` chỉ thêm hai tham số của danh mục hợp đồng:

- `customer_id`: ID số dương chuẩn, không lặp; chuyển thành predicate chính
  xác `filter_customer_id` của reader hiện có, trước count/LIMIT. Không sửa
  RLS hoặc mở rộng `scope_all`; khách trùng tên vẫn là hai danh tính riêng.
- `statistics=1`: dùng reader `statistics_only` hiện có, trả rows rỗng và
  tổng `tabCount`/statusCounts. Không hydrate trang danh sách để đếm tab.

Không cho client truyền trực tiếp filter SQL hoặc các cờ reader nội bộ.
Đầu xuất giữ ID khách nhưng từ chối chế độ statistics. `tabCount` là trường
tùy chọn có kiểm tra số nguyên không âm, nên phản hồi cũ vẫn đọc được.

Lần phát hành sau cần **deploy backend tương thích trước bản app**. Backend
cũ sẽ từ chối tham số mới; app không được coi lỗi này là kết quả tìm toàn bộ
khách hoặc hiển thị tổng trạng thái giả. Không có migration DB trong thay đổi.

## Kiểm chứng

- Mobile typecheck và lint: qua. Web typecheck và lint hai adapter sửa: qua.
- `npm run test:mobile`: **38 suite qua**, gồm hai suite mới navigation và
  catalogue filters, cùng các suite video/ảnh và nghiệp vụ hiện có.
- `node scripts/check-mobile-catalogue-export.cjs`: 6 nhóm qua, gồm giữ ID
  khách khi xuất và chặn statistics-only. Đồng bộ expectation test cũ với
  chính sách đọc khách dùng chung đã có; không sửa chính sách cấp quyền.
- `npm run test:mobile:performance`: cache và export transport qua.
- Fixture render production TSX: 6 nhóm, kiểm tra grant riêng lẻ, route mọi
  mục drawer, preset lifecycle, khách trùng tên, branch form và số tab độc lập.
- Adapter/SQL fixture: 4 nhóm, tham số sai bị chặn trước DB, context cơ sở giữ
  nguyên, danh tính khách áp trước count/LIMIT, phản hồi cũ vẫn hợp lệ. RLS
  trong fixture được mô phỏng; không coi là nghiệm thu DB production.
- Expo Web export thành công với API `.invalid`. Playwright ở 375×812 sáng
  và 812×375 tối, reduced motion: 5 nhóm qua, 0 pageerror, 24 request fixture,
  0 ghi nghiệp vụ. Kiểm tra drawer mở danh bạ, tab Nháp rỗng vẫn Tất cả=10,
  ID khách ở request/đích, không hiện thu tiền khi thiếu finance.write và
  đóng nợ mở đúng contract lifecycle.

Bằng chứng cục bộ: `.backups/mobile-navigation-20261113/`, gồm log kiểm tra,
preview QA, browser-check.py, browser-results.json và ảnh màn hình. Các lượt
đầu của harness sửa selector nhãn menu/heading bị trùng; không thay đổi code
sản phẩm để làm các selector cũ đạt.

Chưa nghiệm thu mã mới trên Android/iOS thật, FPS, mọi vai trò hoặc thao tác
ghi có xác nhận cuối. Việc này cần thực hiện sau khi người dùng cho phép
đóng gói và triển khai. Không dùng kiểm tra trên trình duyệt để chứng nhận
toàn bộ trải nghiệm native.
