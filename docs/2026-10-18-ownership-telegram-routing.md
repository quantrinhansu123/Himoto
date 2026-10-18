# Hai nhóm Telegram cho thuê sở hữu

- Hợp đồng sở hữu ký mới, đặt cọc và giao xe dùng đích `ownership_new`.
- Gia hạn và phiếu thu gia hạn sở hữu dùng đích `ownership_renewal`.
- Nhận diện sở hữu theo cơ sở `lease_to_own`, loại hợp đồng `ownership` / `ownership_cd`, hoặc loại đã lưu trong composer cũ; áp dụng cả hợp đồng sở hữu lập tại cơ sở vật lý.
- Thuê thông thường tiếp tục dùng nhóm cơ sở. Trả xe và đổi pin giữ nhóm cơ sở như trước.
- Hai đích riêng được cấu hình bởi quản trị ở Tích hợp GPS & Telegram. Mỗi đích có Chat ID, chủ đề nếu có và nút bật nhận. Hai nhóm đang bật phải có Chat ID khác nhau; kiểm tra và lưu trong một transaction. Tab cũ không có trường `ownership_groups` vẫn giữ nguyên cấu hình hai nhóm khi lưu nhóm cơ sở.
- Không có nhóm riêng hoặc nhóm bị tắt thì ghi `awaiting_config`, không chuyển sang nhóm cơ sở hay nhóm sở hữu còn lại. Bổ sung cấu hình không tự gửi lại lịch sử chờ/sent/unknown.
- Bước xem trước hiển thị “Nơi nhận” theo giao dịch. Vẫn chỉ gửi khi nhân viên bấm Gửi toàn bộ ở bước cuối; toàn bộ ảnh/video trước, một tin tổng hợp sau. Không thay đổi nội dung/hash nên đổi nhóm không tự mở lại nội dung đã gửi.

Migration: `sql/2026-10-18-ownership-telegram-groups.sql`, chỉ thêm bảng cấu hình riêng của máy chủ; không cấp quyền đọc cho tài khoản cơ sở. Không sửa số hợp đồng, ảnh, phiếu tiền hoặc lịch sử gửi.

Kiểm tra: `npm.cmd run test:gps-contract-integrations` dùng schema rollback, nhóm và bot giả; kiểm tra phân luồng, chủ đề, cấu hình sai, tab cũ, thiếu nhóm và chống gửi trùng. `scripts/check-ownership-telegram-ui.py` dùng API giả, kiểm tra form hai nhóm và xem trước/gửi chủ động ở Chromium/WebKit 390/1440px. Không gửi Telegram thật.

Kết quả trước triển khai: 20 kiểm tra máy chủ đạt; typecheck, lint và build đạt. Chromium và WebKit đạt hai kịch bản ở 390/1440px; ảnh và kết quả ở `qa/ownership-telegram/`.

Trạng thái triển khai: mã chuẩn bị trên nhánh `feat/ownership-telegram-routing`, chờ người dùng xác nhận nhóm nào nhận ký mới, nhóm nào nhận gia hạn. Chưa áp dụng migration/cấu hình hoặc đưa thay đổi này vào `main`/website chính. Sau xác nhận cần backup cấu hình nhóm, áp dụng migration, lưu hai đích đã xác nhận, gộp vào main và kiểm tra bản triển khai chỉ bằng API đọc/API giả. Tên bot và quyền thành viên đã được kiểm tra bằng API chỉ đọc; thông tin đối chiếu ở `.backups/ownership-telegram/discovered-groups.json` (không commit).
