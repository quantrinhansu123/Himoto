# Hai nhóm Telegram cho thuê sở hữu

- Hợp đồng sở hữu ký mới, đặt cọc, giao/trả xe và điều chuyển/nhận xe dùng đích `ownership_new`: **HIMOTO - Thuê và Sở hữu xe**.
- Gia hạn và phiếu thu gia hạn sở hữu dùng đích `ownership_renewal`: **Himoto- Báo cáo thuê sở hữu**.
- Nhận diện sở hữu theo cơ sở `lease_to_own`, loại hợp đồng `ownership` / `ownership_cd`, hoặc loại đã lưu trong composer cũ; áp dụng cả hợp đồng sở hữu lập tại cơ sở vật lý.
- Thuê thông thường và đổi pin tiếp tục dùng nhóm cơ sở.
- Điều chuyển/nhận xe liên quan cơ sở sở hữu, hoặc hợp đồng sở hữu đã có trước lượt chuyển, mở xem trước sau khi lưu kho. Chỉ bấm Gửi thông tin Telegram mới xếp gửi. Bên nguồn chỉ gửi lượt chuyển; bên đích chỉ gửi lượt nhận, vẫn cần hai người xác nhận nghiệp vụ. Có thể mở lại từ Xe → Lịch sử luân chuyển hoặc Lịch sử xe; cơ sở đã chuyển đi không cần quyền xem hồ sơ xe hiện thuộc cơ sở đích để mở lại thông báo.
- Mỗi lượt chuyển/nhận có duy nhất một bản ghi gửi; khóa theo sự kiện và dùng chung lease nhóm với hợp đồng để tránh xen tin. Gửi mất phản hồi tiếp tục bị chặn, không tự gửi lại. API máy chủ kiểm tra cơ sở nguồn/đích và quyền chuyển/nhận; tài khoản cơ sở không được truy cập trực tiếp các bản ghi gửi điều chuyển trong DB.
- Hai đích riêng được cấu hình bởi quản trị ở Tích hợp GPS & Telegram. Mỗi đích có Chat ID, chủ đề nếu có và nút bật nhận. Hai nhóm đang bật phải có Chat ID khác nhau; kiểm tra và lưu trong một transaction. Tab cũ không có trường `ownership_groups` vẫn giữ nguyên cấu hình hai nhóm khi lưu nhóm cơ sở.
- Không có nhóm riêng hoặc nhóm bị tắt thì ghi `awaiting_config`, không chuyển sang nhóm cơ sở hay nhóm sở hữu còn lại. Bổ sung cấu hình không tự gửi lại lịch sử chờ/sent/unknown.
- Bước xem trước hiển thị “Nơi nhận” theo giao dịch. Vẫn chỉ gửi khi nhân viên bấm Gửi toàn bộ ở bước cuối; toàn bộ ảnh/video trước, một tin tổng hợp sau. Không thay đổi nội dung/hash nên đổi nhóm không tự mở lại nội dung đã gửi.

Migration: `sql/2026-10-18-ownership-telegram-groups.sql`, `sql/2026-10-18-ownership-transfer-telegram.sql`. Thêm bảng cấu hình riêng của máy chủ và cho phép outbox gắn với sự kiện xe thay vì hợp đồng, có ràng buộc loại chủ thể và chỉ mục duy nhất. Không sửa số hợp đồng, ảnh, phiếu tiền hoặc lịch sử gửi.

Kiểm tra: `npm.cmd run test:gps-contract-integrations` dùng schema rollback, nhóm và bot giả; kiểm tra phân luồng, chủ đề, cấu hình sai, tab cũ, thiếu nhóm và chống gửi trùng. `scripts/check-ownership-telegram-ui.py` dùng API giả, kiểm tra form hai nhóm và xem trước/gửi chủ động ở Chromium/WebKit 390/1440px. Không gửi Telegram thật.

Kết quả trước triển khai: 21 kiểm tra máy chủ đạt; bộ điều chuyển 9 mục và lịch sử luân chuyển 5 mục đạt; typecheck, lint và build đạt. Chromium và WebKit kiểm tra cấu hình, xem trước gia hạn và gửi chủ động điều chuyển ở 390/1440px; ảnh và kết quả ở `qa/ownership-telegram/`.

Người dùng đã xác nhận hai nhóm bằng ảnh hội thoại. Migration và cấu hình hai nhóm đã được áp dụng sau backup `.backups/ownership-telegram/before-config.json`; nhóm cơ sở và số bản ghi kinh doanh/lịch sử gửi được đối chiếu giữ nguyên trong transaction. Bot có quyền gửi tin/ảnh ở cả hai nhóm. Kiểm tra bản triển khai dùng API đọc và API giả, không gửi tin thử thật. Thông tin đối chiếu ở `.backups/ownership-telegram/` (không commit).
