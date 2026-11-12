# Thanh toán, đóng hợp đồng và quyền Quản lý Thuê sở hữu — 12/11/2026

## Phạm vi và xác nhận

Thay đổi phần Thanh toán và Phân quyền trên web/backend. Không thêm ba lựa chọn này vào Gia hạn hoặc đổi cách tính tiền/ngày gia hạn. Báo cáo này thay thế điều kiện quyền/thu hồi đủ xe trong báo cáo đóng nợ xấu trước đó đối với giao diện đóng mới.

Người dùng xác nhận tài khoản chị Thủy là `quanlyvanhanhhimoto`; đối chiếu chỉ đọc xác định user ID `202`. Quyền đặc biệt dựa trên ID và vai trò admin được đọc lại từ DB mỗi request, không dựa vào tên hiển thị, mật khẩu hoặc quyền do client gửi lên. Admin khác không kế thừa quyền này.

Người dùng chọn cho đóng cả khi chưa trả/thu hồi đủ xe, với bước xác nhận trạng thái xe.

## Hành vi

- **Thanh toán một phần:** số tiền lớn hơn 0, nhỏ hơn công nợ còn lại theo hợp đồng; tạo phiếu thực thu và giữ hợp đồng mở. Nếu đang thu hồi nợ của hợp đồng đã đóng, giữ trạng thái đóng.
- **Thanh toán toàn bộ:** thu đúng số tiền còn lại, ghi phiếu thực thu và đóng hợp đồng. Hợp đồng theo lịch sở hữu tính đủ giá trị lịch đã thỏa thuận; số tiền chốt được giữ ổn định trong chi tiết, danh sách và thống kê.
- **Không thanh toán nhưng đóng:** số tiền 0, không cần tài khoản nhận và không tạo phiếu thu. Giữ tiền hợp đồng, tiền đã thu, cọc, công nợ và lịch sử. Công nợ đã chốt tiếp tục xuất hiện trong báo cáo thu hồi và có thể thu dần sau đóng.
- Khi đóng, phải xác nhận từng dòng xe đang mở cùng phiên bản: **còn ở khách** hoặc **đã trả/thu hồi** với ngày thực tế. Không tự coi đóng hợp đồng là trả xe. Lựa chọn xe đã thu hồi được ghi cùng transaction với thanh toán/đóng; lỗi bất kỳ bước nào hủy toàn bộ.
- Xe còn ở khách tiếp tục có dòng thuê chưa hoàn thành. Kho xe, kiểm tra trùng lịch, điều chuyển và giải phóng xe đều giữ xe này đến khi thu hồi thực tế. Có nút ghi nhận thu hồi sau đóng; không đổi số tiền chốt hoặc ngày đóng cũ.
- Có request ID, khóa giao dịch, kiểm tra revision hợp đồng/dòng xe và dấu vân tay nội dung/người thực hiện. Mất phản hồi giữ request trong session storage để thử lại cùng mã. Không ghi trùng phiếu hoặc sự kiện đóng.
- Không cho ẩn hợp đồng đã đóng khi còn xe, nợ, cọc hoặc thu dư. Không sửa toàn bộ xe/tiền của hợp đồng đã chốt qua form sửa thông thường để vượt bước xác nhận xe.

## Phân quyền

Chỉ ID `202` với vai trò admin và Quản lý được xác minh tại cơ sở `kind='lease_to_own'` được dùng ba thao tác. Kiểm tra nằm ở UI, HTTP và dịch vụ dùng chung; thu công nợ qua endpoint cũ cũng kiểm tra quyền. Phiếu gia hạn, cọc, hoàn tiền và thu khác giữ luồng riêng hiện có.

Chọn Quản lý cơ sở tại Thuê sở hữu được tự chuẩn hóa thành `ownership_manager`. Cả tài khoản mới và hiện có nhận đầy đủ quyền thao tác tại cơ sở đó, kể cả tài chính, sửa/xóa và quản lý tài khoản tại cơ sở. Các tài khoản quản lý sở hữu cũ có `scope_all=true` được đưa về cơ sở sở hữu xác định; nếu không xác định duy nhất, hệ thống từ chối thay vì cấp phạm vi rộng.

Quản lý sở hữu vẫn là tài khoản dùng RLS, không thành global admin và không sử dụng kết nối owner cho nghiệp vụ thường. Các API quản lý tài khoản dùng kết nối owner có kiểm tra riêng cả tài khoản đích và giá trị mới, chặn admin toàn hệ thống, tài khoản khác cơ sở và nâng `scope_all`. Các quyền cá nhân như xem mật khẩu hoặc báo cáo riêng không được kế thừa.

Lookup khách/kho dùng chung giữ khả năng đọc hiện có. Quyền quản trị mới không cho sửa dữ liệu HQ/cơ sở khác thông qua các quy tắc nguồn khách sở hữu cũ.

## Kiểm chứng

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:release
node scripts/check-contract-settlement-postgres.cjs .backups/peak-20261112/staging/staging.json
npm.cmd run build
python scripts/check-contract-settlement-ui.py
```

- 52 suite release chạy fixture, chặn mạng ngoài; có suite mới cho quyền cá nhân/quản lý sở hữu, ba mode, ngày giờ, xác nhận xe và dữ liệu giả mạo.
- PostgreSQL: 8 nhóm trên cluster riêng `127.0.0.1:55439`, schema QA và rollback. Sao chép cả CHECK constraints và tái tạo ràng buộc admin-only cũ trước khi áp migration mới. Gồm thu 100.000/1.000.000, thu nốt và đóng, đóng 0, replay, giữ công nợ trong thống kê, thu sau đóng, giữ xe kể cả status xe sai là ready, thu hồi sau đóng, chốt lịch sở hữu, rollback phiếu khi thu hồi lỗi, revision, quyền khác cơ sở/HQ và quản lý tài khoản trong phạm vi; DB tiếp tục chặn cấp `accounts.manage` cho nhân viên khác.
- Browser: Chromium 1440px, WebKit 390px; tài khoản được chỉ định và admin khác. Kiểm tra ba lựa chọn, phiếu thu một phần, số tiền còn lại chính xác, bắt buộc chọn trạng thái xe, đóng 0 không có tài khoản nhận, nút thu hồi sau đóng và hiển thị quyền. API nghiệp vụ được mô phỏng; không có lỗi JavaScript ở lượt nghiệm thu.
- Bằng chứng UI riêng tư: `.backups/contract-settlement-20261112/ui/`, ảnh và `results.json`. Build log: `.backups/contract-settlement-20261112-build.log`.
- Không thanh toán/đóng hợp đồng thật, không ghi dữ liệu nghiệp vụ production hoặc gửi Telegram thật trong QA.

## Triển khai

Hai migration đã áp lên production lúc 21:50 ngày 12/11/2026 (giờ Việt Nam), trong cùng transaction sau khi sao lưu. Đối chiếu đủ 13 định nghĩa helper với baseline đã kiểm thử; giữ nguyên owner/ACL. Hai tài khoản quản lý sở hữu được cập nhật về cơ sở 35, không thay tài khoản khác. Đối chiếu 430 xe trước/sau không thay đổi kho hoặc tính sẵn sàng; bốn kiểm tra phiên/quyền đạt. Không ghi hợp đồng, phiếu tiền hoặc gửi thông báo để kiểm tra.

Bằng chứng riêng tư: `.backups/contract-settlement-20261112/deploy/`, gồm backup quyền/constraint/policy/helper trước sửa và kết quả migration. Web/backend phát hành qua nhánh `main` và kiểm tra deployment Production đúng SHA bằng trạng thái GitHub/Vercel; kết quả GET sau phát hành lưu cùng thư mục này.

1. Sao lưu quyền tài khoản và định nghĩa các helper kho/thu hồi hiện tại để đối chiếu.
2. Áp `docs/sql/2026-11-12-payment-closure-vehicle-holds.sql` và `docs/sql/2026-11-12-ownership-manager-permissions.sql` trước ứng dụng. Migration quyền áp cả tài khoản quản lý sở hữu hiện có và có trigger ràng buộc các lần lưu sau.
3. Deploy web/backend cùng nhau. Kiểm tra phiên mới của tài khoản được chỉ định/quản lý sở hữu và GET chỉ đọc; không tạo giao dịch hay đóng hợp đồng thật để smoke test.
4. Không rollback về ứng dụng bỏ qua `lifecycle.payment_closure` khi đã có hợp đồng đóng còn xe/công nợ. Giữ metadata đóng, lịch dừng, phiếu tiền và các helper giữ xe; cần bản rollback có khả năng đọc metadata tương thích.
