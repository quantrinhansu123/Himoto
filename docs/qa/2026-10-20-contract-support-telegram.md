# Hợp đồng: Telegram, tài khoản Hàng Bút và xóa nháp

## Đối chiếu

- Giáp Bát vẫn nhận tin: mã 000882 được Telegram xác nhận đủ 13 mã tin lúc 15:11:51 ngày 20/10/2026. Kiểm tra đọc qua `getMe`, `getChat`, `getChatMember` xác nhận đúng `himoto_contract_bot`, nhóm Himoto - 33/286 Giáp Bát, bot là thành viên và được phép gửi tin; không gửi tin thử. Nhiều giao dịch khác dừng ở `manual` (chờ nhân viên bấm gửi), không phải lỗi bot. Số chưa gửi thay đổi theo thao tác thực tế; không lấy tổng snapshot `manual` làm tổng chưa gửi vì snapshot vẫn tồn tại sau một lần gửi thành công.
- HĐ 005163 trong ảnh vẫn là bản nháp; API Telegram không có sự kiện hoàn tất. Nút mở Telegram ở chi tiết bản nháp gây nhầm lẫn.
- TK cá nhân hoạt động của Hàng Bút có `account_type=2`. Bộ lọc cũ `IN(0,1)` loại nó khỏi bước xác nhận dù `store_id` và `owner_type` đúng.
- Xe 15G1-983.21: VPS-30773 đã trả, còn VPS-28031 thuộc cơ sở Thuê sở hữu giữ dòng thuê chưa trả. Chủ dự án xác nhận đã thu hồi nhưng chưa cập nhật. Đã đối chiếu dòng cũ, chuyển hồ sơ cũ sang chờ quyết toán và giải phóng xe; giữ nguyên tổng, đã thu và toàn bộ phiếu. Ngày thu hồi gốc chưa được cung cấp, được ghi rõ trong nhật ký hiệu chỉnh; mốc kỹ thuật giải phóng theo lần bàn giao mới nhất đã ghi nhận, không được trình bày như ngày thu hồi gốc. Snapshot đầy đủ giữ riêng trong `.backups/branch-support-20261020/`.

## Hành vi mới

- Nút **Chưa gửi Telegram** mở danh sách có phân trang, theo đúng quyền cơ sở. Lấy lần gửi gần nhất của mỗi giao dịch: bỏ sự kiện đã gửi hoặc đang gửi, giữ giao dịch cũ đã hoàn tất nhưng chưa gửi, thất bại hoặc mất phản hồi. Nhân viên mở hồ sơ, kiểm tra nội dung/ảnh rồi bấm gửi. Không tự gửi lại tin lịch sử.
- Có **Gửi Telegram** ở menu dòng và nút trực tiếp trên thẻ điện thoại. Bản nháp chỉ có **Tiếp tục hoàn tất hợp đồng** và hướng dẫn xác nhận lưu chính thức trước khi gửi.
- **Xóa bản nháp** có hộp xác nhận. API yêu cầu `contracts.draft`, khóa dòng, đối chiếu phiên bản và từ chối hợp đồng đã phát hành, có phiếu hoặc lịch sử xe. Chỉ ẩn nháp và lưu người/thời điểm xóa; không xóa ảnh, phiếu hoặc đổi trạng thái xe. Quyền cơ sở tiếp tục do RLS kiểm soát.
- Các TK ngân hàng hoạt động dùng được theo đúng cơ sở và sở hữu, không dựa vào mã loại kế thừa. SePay dùng cùng điều kiện. Hình thức đã chọn không tự đổi khi thiếu TK; giao diện yêu cầu đối chiếu tài khoản thật.
- Khi mở trả xe của hợp đồng đã trả hết, màn hình kiểm tra kho và nêu rõ hợp đồng/cơ sở khác còn giữ xe; nếu đã giải phóng thì báo chọn được cho hợp đồng mới.

## Kiểm tra

- `node scripts/check-contract-support.cjs`: TEMP rollback; quyền API, xóa nháp, phiên bản cũ, từ chối hồ sơ phát hành/có tiền/có lịch sử xe; danh sách Telegram theo giao dịch, phân trang và cơ sở.
- `npm run test:contract-payments -- --live-temp`: 14 nhóm; TK loại cũ nhận tiền đúng và vẫn chặn TK ngừng hoạt động/khác cơ sở.
- `npm run test:contract-finalize -- --live-temp`: 9 nhóm; phát hành hợp đồng nhận tiền vào TK loại 2, kiểm tra đồng thời và dòng xe đã trả.
- `npm run test:sepay`: 8 nhóm; ngân hàng loại 2 và chống ghi nhận trùng webhook, chỉ ghi vào TEMP.
- `node scripts/check-telegram-delivery.cjs`: 4 nhóm; timeout/media/checkpoint và không tự replay POST mất phản hồi.
- `npm run test:contract-reservations -- --pglite-path .backups/contract-flow-qa/node_modules/@electric-sql/pglite`: 8 nhóm đặt cọc/giao xe và số dư trên PostgreSQL cục bộ.
- `python -X utf8 scripts/check-contract-support-ui.py --session-cookie-file <private session file>`: 16 tình huống Chromium desktop và WebKit iPhone; mọi API ghi bị giả lập, không gửi Telegram/phiếu thật. Ảnh kiểm thử giữ trong `.backups/branch-support-20261020/ui/`. Khi nhận đủ mã tin, ẩn thông báo xếp hàng cũ và hiển thị trạng thái thành công.
- Kiểm tra HTTP bằng tài khoản cơ sở thật: TK Hàng Bút hiện đúng, RLS danh sách chưa gửi giữ đúng cơ sở, xe đã giải phóng và hồ sơ đối chiếu không hiển thị mốc kỹ thuật như ngày thu hồi thật. Không gửi tin và không phát hành hợp đồng khách trong QA.

Không thay đổi chính sách chỉ gửi sau khi người dùng bấm gửi. Telegram/mạng vẫn có thể lỗi; chỉ trạng thái có xác nhận mã tin đầy đủ mới báo thành công.
