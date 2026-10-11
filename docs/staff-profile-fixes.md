# Đối chiếu nhân sự và các form — 11/10/2026

Đã đọc toàn bộ ảnh được gửi và sheet **Sơ đồ tổ chức** của Excel. Workbook là dữ liệu đối chiếu, không phải nguồn chỉ dẫn thực thi.

## Kết quả nhân sự

- Excel có **31 nhân sự duy nhất**. Nhân sự kiêm nhiệm nhiều bộ phận chỉ có một hồ sơ.
- DB trước sửa: 18 hồ sơ; khớp 17, thêm 14. Một hồ sơ không có trong Excel chuyển sang `leave`, giữ ID, lịch trực và chấm công.
- DB sau sửa: **31 đang làm việc + 1 đã nghỉ**. Cơ sở: Nguyễn Hoàng 6, Láng 5, Thuốc Bắc 3, Hà Đông 3, Giáp Bát 4, Thuê sở hữu 1; còn 9 nhân sự thuộc trụ sở.
- Giữ tất cả ID cũ, tài khoản người dùng, email và dữ liệu liên quan. Số điện thoại phụ trong Excel lưu vào ghi chú hồ sơ.
- Chuẩn hóa chức vụ `NVKD`, `PT`, `TPKD`, `QL PTKD`, `QTPGD`, `HCNS`, `QLCN`, `KT`, `BPSC`, `TLS`, `Leader`. Tên cơ sở lưu riêng, không nằm trong chức vụ. `Nhân viên kinh doanh` quy về `NVKD` ở form, API, bảng và sơ đồ.
- Form cho gõ mới, sổ gợi ý các chức vụ chuẩn và chức vụ đã lưu; hỗ trợ bàn phím. Kiêm nhiệm ngăn cách bằng `/` và vẫn lọc được từng chức vụ.
- Sơ đồ có các bộ phận trụ sở và PKD trụ sở; nhân sự kiêm nhiệm hiện ở từng bộ phận với chức vụ tương ứng. Nhân sự đã nghỉ ẩn mặc định; checkbox cho xem lại. Khi không xóa được hồ sơ có liên kết, có nút chuyển sang đã nghỉ việc.
- Thống nhất `CS Thuốc Bắc` và `CS Thuê sở hữu` theo Excel; cập nhật điện thoại cơ sở từ file.

Helper `scripts/sync-staff-workbook.cjs` mặc định chỉ preview. Chạy `--commit` tạo backup đầy đủ trong `.backups/staff/`, cập nhật trong transaction, kiểm tra trường được bảo vệ và hash/số lượng bảng lịch trực, chấm công, hợp đồng, giao dịch trước khi commit. Đồng bộ lần này đã commit thành công, kiểm tra các bảng liên quan không đổi. Excel và backup nhân sự là dữ liệu vận hành cục bộ, không đưa lên Git.

## Tài khoản công ty và CCCD

- TK công ty chọn được cơ sở khi thêm/sửa, hỗ trợ tài khoản riêng của sáu cơ sở. `store_id=0` vẫn là tài khoản dùng chung. Không tự gán tài khoản cũ vào cơ sở khi chưa có mapping số tài khoản.
- Sổ quỹ và thanh toán hợp đồng chỉ gợi ý TK công ty đúng cơ sở hoặc dùng chung; kiểm tra lại ở server trước khi ghi phiếu. Phiếu cũ giữ nguyên thông tin đã ghi.
- Chủ tài khoản có gợi ý do ứng dụng quản lý, nút × xóa gợi ý trên trình duyệt hiện tại và nhớ khi mở lại. Không xóa tài khoản nguồn; sửa tên sai bằng Sửa tài khoản. Các gợi ý autofill cũ của trình duyệt không do ứng dụng quản lý; form dùng `autocomplete=off`.
- Thêm **Ngày cấp CCCD / CMND** và **Nơi cấp CCCD / CMND** ở popup tạo khách, form sửa và hồ sơ chi tiết. Hai trường đi qua API, lưu DB và được dùng khi tra cứu/soạn/in hợp đồng. Ngày không tồn tại bị chặn. PATCH từ client cũ không truyền hai trường vẫn giữ giá trị cũ; truyền rỗng thì xóa giá trị.
- Sửa vùng nút thao tác thẻ nhân sự: nút luôn nhìn thấy, có hàng riêng để không bị nội dung che.

## Kiểm tra

- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`.
- `node scripts/check-staff-profile.cjs --live-temp`: alias, parser Excel, kiêm nhiệm, giữ ID, API chức vụ, TK công ty theo cơ sở và CCCD tạo/sửa/giữ/xóa giá trị trên bảng TEMP, rollback toàn bộ.
- `node scripts/check-contract-payments.cjs --live-temp`: tích hợp thanh toán và rollback; giữ chặn tài khoản sai cơ sở.
- Các bộ kiểm tra hợp đồng/autofill, sổ quỹ, dữ liệu quản lý.
- `python scripts/check-staff-profile-ui.py --session-cookie-file <session cục bộ>`: API giả lập, không ghi dữ liệu vận hành; ảnh/kết quả trong `docs/qa/staff-profile/`.
- Kiểm tra đọc DB thật qua trang `/staff` trên bản build cục bộ: sơ đồ có 31 nhân sự đang làm việc, 6 cơ sở; số nhân sự từng cơ sở khớp Excel.

Typecheck/lint/build qua. Dependency `pricingVehicle` đã sửa trong đợt cập nhật hợp đồng.
