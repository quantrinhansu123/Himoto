# Rà soát app theo 13 ảnh và đối chiếu web — 13/11/2026

Phạm vi: sửa mã nguồn và kiểm tra cục bộ. Không đóng gói/cài APK, không phát hành OTA, không deploy web/API và không ghi dữ liệu vận hành. Giữ các thay đổi từ đợt sửa điều hướng và xử lý video trước đó.

## Đối chiếu yêu cầu

| Ảnh/yêu cầu | Kết quả trên mã nguồn hiện tại |
| --- | --- |
| 1–2: dòng phía trên Thêm khách hàng | Tiêu đề và tổng khách cùng một hàng; số lượng không xuống dòng. Kiểm tra với 23.690 khách ở chiều rộng 320 và 375. |
| 3: số lượng cạnh các tab | Truy vấn thống kê riêng cho hợp đồng, giữ bộ lọc khách/cơ sở/nhóm/ngày. Không dùng tổng của tab Nháp để thay tổng Tất cả. Tab rỗng hiện 0 khi đã tải được thống kê. |
| Quá hạn gồm nợ xấu | Cập nhật cả điều kiện SQL, bộ lọc dùng chung và bộ đếm tab trên web/app. Giữ tab Nợ xấu riêng. Nhóm quá hạn đã có nợ xấu từ trước. |
| 4: ảnh không mở được | Kiểm tra reader hiện tại với PGlite và migration danh bạ khách dùng chung: mở danh sách, gallery và bytes ảnh của khách cùng/khác cơ sở bằng quyền SELECT. Hồ sơ khác cơ sở chỉ được xem; kiểm tra sai ID và revision ảnh. Không tái hiện 404 của ảnh cũ trong fixture này. Không nới quyền hoặc dùng kết nối owner để né RLS. |
| 5: trạng thái lẫn tiếng Anh | Tách bảng nhãn tiếng Việt dùng chung; bộ chọn sửa hợp đồng dùng đủ nhãn cho mọi trạng thái đã phát hành. API vẫn nhận các mã cũ. Đổi tên mục Dashboard thành Tổng quan giao dịch. |
| 6: người làm hợp đồng | Nháp mới đã lấy tên tài khoản từ API. Bỏ bộ chọn/nhập người khác trong form xe. Pin/sạc mới cũng lấy tên tài khoản, kể cả khi sao chép từ hợp đồng xe của nhân viên khác. Hồ sơ đã lưu giữ nguyên người ký cũ; NVKD/TLS/nguồn khách vẫn là các trường riêng. |
| 7: nút bị thanh hệ thống Android che | Thêm safe area cho form pin, thao tác pin, ca/đối soát, quản trị tài khoản/tích hợp, dashboard, hồ sơ khách/nhân sự/cơ sở và danh bạ. Các modal chọn mục, xác nhận, editor và xem ảnh đo safe area trong cửa sổ modal riêng. |
| 8–9: bấm tab dưới | Làm mới dữ liệu đọc của tab đích ở nền, kể cả cache còn mới; giữ dữ liệu đang hiển thị. Tab chưa mount được đánh dấu cần tải mới. Không refetch các bản chuẩn bị giao dịch, ảnh hoặc ghi sổ. |
| 10: tiền bị tách chữ số | Thẻ tiền chiếm toàn hàng. Giá trị và tiền theo cơ sở chỉ một dòng, co chữ khi cần. Không viết tắt hoặc thay đổi số tiền. |
| 11, 13: Nhân sự/Cơ sở | Các đường dẫn đã sửa ở đợt trước; kiểm tra lại bằng bộ test và điều hướng trình duyệt đến danh bạ thật. |
| 12: nhóm bên trái lại chọn Tất cả | Chip đầu hiển thị đúng tên nhóm đang xem: Quá hạn, Hợp đồng nháp, VAT, đến hạn, thuê sở hữu. Giữ nguyên scope; không ép thêm status làm mất nợ xấu hoặc các trạng thái hợp lệ trong nhóm. Xem tất cả bỏ cả scope và status. |

## Lỗi phát hiện thêm

- Tab khách Nợ xấu / Cấm thuê dùng bộ lọc `blacklist`, nhưng web trả bộ đếm `bad_debt`: sửa ánh xạ để không hiện 0 sai.
- Nhãn trạng thái cơ sở dùng Hoạt động/Tạm ngừng theo ngữ cảnh.
- Nhãn tab dưới cho phép hai dòng ở màn hình hẹp để không cắt Danh sách xe/Khách hàng.
- Kiểm tra tĩnh 120 đích điều hướng trong toàn bộ mã nguồn app; tất cả có màn hình tương ứng. Đích động và quyền truy cập vẫn cần kiểm tra bằng dữ liệu thực.

## Kiểm chứng

- `npm.cmd run mobile:typecheck`, `npm.cmd run mobile:lint`.
- `npm.cmd run typecheck`; ESLint các file web/API dùng chung đã thay đổi.
- `npm.cmd run test:mobile`: 39 script, mạng ngoài bị chặn; dữ liệu giả lập.
- `node scripts/check-mobile-review.cjs`: đường dẫn, mã tiếng Việt, quá hạn/nợ xấu, người ký pin mới và làm mới đúng tab.
- `node scripts/check-mobile-customer-media-read.cjs --pglite-path .backups/contract-flow-qa/node_modules/@electric-sql/pglite`: 2 nhóm kiểm tra với PostgreSQL qua PGlite, migration thật, dữ liệu tạo riêng.
- `check-management-table.cjs`, `check-contract-tabs.cjs`, `check-contract-overdue.cjs`, `check-mobile-catalogue-export.cjs`: phân trang/lọc, nghiệp vụ quá hạn và export.
- Expo web export phục vụ QA; Playwright ở 320×740, 375×812 và 812×375, có sáng/tối và giảm chuyển động. Kiểm tra điều hướng, nhãn nhóm, số lượng, tiêu đề khách, tiền không gãy dòng; không lỗi JavaScript và không gọi ghi nghiệp vụ.
- Bằng chứng: `.backups/mobile-app-review-20261113/`, gồm log, `browser-results.json` và ảnh chụp.

## Giới hạn và bàn giao

Đây là kiểm chứng mã nguồn, dữ liệu giả lập và giao diện web của app. Chưa xác nhận lại trên điện thoại bằng mã mới; đặc biệt thanh điều hướng Android, bàn phím, modal, mở ảnh thật và tình trạng mạng cần kiểm tra trên thiết bị khi được phép bàn giao bản cài. Chưa kiểm chứng chính sách RLS đang deploy của tài khoản gặp 404 trong ảnh cũ.

Các sửa đổi trong đợt này không thêm thư viện native. Tuy nhiên toàn bộ thay đổi đang chờ còn có module video Android từ đợt trước: bản bàn giao tổng thể cần APK mới, không phát hành vào runtime 1.0.9. API thống kê/lọc khách và thay đổi bộ lọc web cần deploy đồng bộ khi phát hành. Hiện chỉ lưu mã nguồn để nhận yêu cầu tiếp theo.
