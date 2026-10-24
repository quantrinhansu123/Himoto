# Điều chuyển xe giữa mọi cơ sở

Theo yêu cầu mở toàn quyền điều xe tại `/vehicles`, mọi tài khoản quản trị đang được phép đăng nhập đều có quyền xem xe, chuyển xe và nhận xe. Áp dụng cả tài khoản có danh sách quyền cũ chưa chứa `vehicles.transfer` / `vehicles.receive`; không cần cấp lại tài khoản hoặc đăng xuất.

- Trang Xe và Lịch sử luân chuyển có lựa chọn Tất cả cơ sở, dùng danh mục mọi cơ sở đang mở. Bộ lọc này lưu riêng với bộ lọc cơ sở của hợp đồng, khách hàng và sổ quỹ.
- Hộp Chuyển xe nhận xe từ mọi cơ sở; đích đến gồm mọi cơ sở đang mở ngoài nơi xe đang ở. Chuyển xong xe Chờ luân chuyển; xác nhận nhận xe đưa về Lưu kho.
- API chỉ mở phạm vi đọc toàn đội xe cho các endpoint danh sách xe / lịch sử. Chuyển và nhận được ghim đúng mã xe trong transaction; không đặt `scope_all=true` cho tài khoản. Sửa hồ sơ, thu/chi, hợp đồng và đăng ký xe giữ quyền cũ.
- Migration `docs/sql/2026-10-24-global-vehicle-transfers.sql` đổi policy và thêm helper phạm vi; không sửa bản ghi xe, hợp đồng hoặc tài khoản. Ảnh bằng chứng chuyển/nhận được lưu theo đúng sự kiện, kể cả khi người điều xe không thuộc hai cơ sở trên tuyến.
- Giữ khóa phiên bản, transaction và lịch sử người thao tác/cơ sở đi/cơ sở đến. Xe phải Lưu kho, không có hợp đồng mở; không chuyển về chính nơi đang giữ. Người nhận phải khác người chuyển và xác nhận đúng sự kiện; bấm lại không tạo lượt nhận thứ hai. Chủ quản xe giữ nguyên.
- Người đã thực hiện lượt chuyển/nhận có thể mở phần Telegram của chính lượt đó sau khi xe chuyển cơ sở. Không tự gửi thông báo khi điều xe.

Đã kiểm tra trước phát hành:

- Build, typecheck, lint tám source, `git diff --check`: đạt. Còn cảnh báo cấu hình plugin Next ESLint có sẵn.
- `node scripts/check-global-vehicle-access.cjs`: **8 nhóm**, đủ 7 vai trò; ghim đúng mã xe và loại thao tác; phiên không hợp lệ, origin khác và thao tác ngoài quyền bị chặn.
- `node scripts/check-global-vehicle-transfers.cjs`: **6 nhóm**, schema riêng rollback, sequence riêng. Chuyển từ cơ sở B đến C bằng tài khoản A, nhận bởi tài khoản ngoài C; bảo toàn chủ quản, audit, ảnh, chặn thuê trùng / nợ xấu chưa thu hồi / phiên bản cũ / nhận lặp. Migration chạy hai lần.
- Hồi quy `check-account-scope.cjs`: **25 nhóm**; `check-vehicle-transfers.cjs`: **10 nhóm**; `check-gps-contract-integrations.cjs`: **36 nhóm**; API Telegram điều chuyển: **4 nhóm**. Không giao dịch thật hoặc gọi Telegram thật.
- `python scripts/check-global-vehicle-transfers-ui.py`: **24 ca** trên Chromium 1440×950 và WebKit 390×844, đủ 6 nhóm tài khoản có tài khoản hoạt động tại thời điểm kiểm tra. Chọn xe ngoài cơ sở, đủ đích chuyển, lỗi vẫn giữ form, nhận đúng lượt và mở ảnh bằng chứng. 0 lỗi JavaScript, không tràn ngang; mọi API ghi là fixture.
- Đối chiếu chỉ đọc bằng bản build local nối DB thật: cả 6 nhóm tài khoản đều thấy **383 xe**, **7 cơ sở đang mở**, đọc được lịch sử luân chuyển. Đây là snapshot kiểm tra, không hardcode số vào app. Anonymous bị từ chối.
- Migration đã áp dụng; so trong transaction xác nhận các bảng nghiệp vụ và tài khoản không đổi. 21 tệp riêng/.env và diff riêng `scripts/check-contract-support-ui.py` (11 thêm/5 bỏ) được giữ nguyên.

Bằng chứng máy chạy và snapshot policy trước sửa: `.backups/global-vehicle-transfers-20261024/` (có session riêng, không commit hoặc in giá trị). Không điều chuyển xe thật, trả xe, tạo hợp đồng, thu/chi hoặc gửi Telegram thật để QA.
