# Xóa phiếu sổ quỹ —03/11/2026

Source/API/native đã nối chọn từng phiếu, chọn trang, giữ lựa chọn nhiều
trang, bỏ chọn, xóa đã chọn hoặc toàn bộ loại thu/chi theo bộ lọc lúc mở
rà soát. Hiển thị số lượng/số tiền/ID mẫu; xóa toàn bộ yêu cầu gõ XOA như
web. Không lấy số trang đang xem thay cho toàn bộ bộ lọc.

Gọi trực tiếp `listCashbook(mode=ids,type=...)`, `parseBulkDelete` và
`bulkDelete(transactions)` của web trong scoped transaction; không triển
khai phép tính hoàn tác tiền riêng ở mobile. Batch tối đa500, khóa mọi row,
điều chỉnh tiền đã thu/tổng hợp đồng/tiền pin và xóa liên kết payment ledger
đúng domain web. Phiếu pending không hoàn tác tiền, thu ngoài không trừ
tiền hợp đồng lần nữa. Khoản hoàn thuê trả sớm được đảo đúng dấu theo web.

Quyền đọc `finance.read`, quyền xóa **settings.write** theo backend web
`/bulk-delete/transactions`. Không dùng `finance.write` để tự cấp quyền xóa.
Scope cơ sở/actor giữ nguyên, không owner pool/fleet scope. Không đổi domain
xóa web hoặc thêm migration.

Mỗi batch có UUID/receipt cùng transaction. Riêng operation `cashbook.delete`
không còn business row sau xóa nên `resource_id` trong ledger là **số phiếu
đã xác nhận**, `resource_revision=1` là phiên bản định dạng receipt, không
phải ID/phiên bản của một phiếu. DTO công khai ghi `deletedCount` và
`receiptVersion`; UI không trình bày số lượng như ID phiếu. Fingerprint khóa
đúng tập ID đã gửi (sort trước khi băm), không cho reuse key với danh sách
khác. RLS ledger hiện có là actor-only, resource_id không có FK.

Client chỉ chuyển batch tiếp theo sau khi đọc receipt gốc và đối chiếu đủ
số lượng; lúc đó mới hoàn tất UUID đợt vừa xác nhận. Nếu lỗi mạng/storage/
đối chiếu, dừng các đợt sau và giữ key đang gửi, không retry bằng key mới.
Tài khoản → Đối chiếu → Xem xác nhận xóa phiếu → ack đúng key. Nếu server
chưa ghi, cancellation chặn request muộn. Nếu app bị dừng giữa các đợt,
phải đối chiếu rồi lọc lại các phiếu còn lại; không tự khôi phục selection
bằng ID đoán hoặc gửi lại toàn bộ dữ liệu cũ. Lựa chọn chưa gửi không phải
durable draft; không tuyên bố có chức năng tiếp tục job hàng loạt sau kill.

Pending `cashbook.delete` được khóa theo actor/origin qua đổi cơ sở, có thể
thấy và ack đúng scope gốc; các create khác vẫn giữ ranh giới cơ sở đích.
Receipt sau xóa là actor-owned, chỉ có count, không lộ dữ liệu cơ sở cũ.

Kiểm nhanh:

- `check-mobile-cashbook.cjs`:8nhóm đạt trên PGlite độc lập;3nhóm mới gồm
  selection/filter/quyền/500giới hạn, actual domain hoàn tác thuê/extra/
  renewal/refund/pending/outside/pin/payment proof, replay/cancel/rollback/
  receipt sau xóa và đổi scope. Không dùng DB vận hành hoặc env.
- Pending19nhóm và recovery6nhóm đạt; typecheck root/mobile và lint mobile/
  backend liên quan đạt. Không lấy synthetic checks làm staging RLS/race pass.
- QA8131 chỉ thêm `cashbook_bulk_workspace`, generation18→19 và3phiếu mẫu
  mới15001/15002/15003. Mọi field/10phiếu/4receipt cashbook cũ được giữ.
  `.backups/mobile-cashbook-bulk-qa-upgrade-20261103/results.json`.

Samsung run1 đạt3nhóm happy path lúc17:17:30 (+07),343file source khớp,
0crash/ANR, work/ledger rỗng, máy trả Tổng quan. Xóa1phiếu QA15003 đã chọn
và2phiếu QA15001/15002 theo filter1500 sau gõ XOA;2UUID xác nhận(count1,2)
đã đối chiếu trước khi clear. Mọi field cũ/10phiếu/4receipt cashbook trước đó
và26checkpoint giữ nguyên. Chỉ cashbook_bulk_workspace đổi. Evidence
`.backups/mobile-cashbook-delete-native-20261103-run1/results.json`.

Export bundle web/Android/iOS cuối exit0 tại
`.backups/mobile-cashbook-delete-export-20261103-run2`, API placeholder.invalid/
dotenv tắt; không phải signed APK/IPA. Sau native chỉ sửa2chuỗi UI trong
cashbook-delete-actions, không đổi logic. Mobile typecheck/lint sau sửa chữ
đạt. Không lấy hash native cũ chứng nhận file copy mới hoặc chạy lại các
mutation chỉ để kiểm một sửa chữ.

Chưa kiểm sâu
>500native, lost response giữa các đợt, kill/lifecycle, nhiều phiên/RLS
staging, mọi vai trò/cơ sở, signed iPhone và release. Không lấy bài kiểm
CSV trước đó chứng nhận source vừa thêm bulk.
