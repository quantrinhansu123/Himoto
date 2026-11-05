# Hợp đồng pin / sạc —03/11/2026

## Source/API đã nối

Danh sách theo cơ sở/trạng thái/hợp đồng xe, tìm kiếm bỏ dấu đúng web,
số lượng/phân trang20dòng và hồ sơ. Lập/sửa đủ trường bên thuê, sản phẩm,
xe, thời hạn/giá, tiền thuê/cọc và tài khoản nhận riêng từng khoản. Preset
pin/sạc, mặc định/tháng neo ngày cuối tháng dùng cùng hàm web. Có điền từ
hợp đồng xe đã phát hành, giữ ràng buộc khách/cơ sở/hợp đồng nguồn.

Gia hạn tạo công nợ hoặc thu ngay theo lựa chọn rõ ràng; thu từng khoản
gia hạn, cho phép thu một phần. Nhận lại pin/sạc ghi lịch sử, giữ công nợ
chưa thu và tiền cọc; xóa mềm giữ phiếu thu. Có lịch sử, số còn phải thu,
UUID/revision/receipt gốc và đối chiếu trong Tài khoản. Sửa/xóa/gia hạn/
thu/trả cùng hồ sơ dùng chung một intent trước khi ghi tiếp.

Gọi actual `saveBatteryContract`, `deleteBatteryContract`,
`readBatteryWorkflow`, `applyBatteryAction`, reader/list/count và prefill
web. Cùng bảng/phiếu với web, không có DB app riêng hoặc cơ chế chép dữ
liệu sang web. Các module thuần battery-contracts/workflow/validation và
rental-calendar chuyển shared, web re-export/import nguyên hàm. Writer
và phép tính tiền web không bị thay bằng bản mobile khác.

Bearer routes `/api/mobile/v1/battery-contracts`, options/ID/actions/
from-contract/requests/telegram. `contracts.read` để đọc; `contracts.draft`
để lập/sửa/xóa, `contracts.renew` để gia hạn/thu và `contracts.return` để
nhận lại đúng backend web. Không tự thêm finance.write vào workflow pin.
Transaction thường giữ RLS/scope hiện tại. Chỉ Telegram dùng owner pool
theo helper web vốn tự kiểm actor/cơ sở/quyền, không trả secret cho app.
Preview/trạng thái/gửi có xác nhận riêng; không tự gửi lại trạng thái chưa
rõ và không gửi thật trong phát triển.

## Kiểm tra nhanh

SQL nhúng5nhóm đạt, `.backups/mobile-battery-domain-checks-run2.log`.
Tạo mobile→web đọc cùng ID/code/khách/hợp đồng xe,300thuê+1000cọc vào két/
ngân hàng công ty được chọn; replay không thu trùng. Web sửa→mobile đọc;
CAS/quyền/actor và giảm tiền/đổi tài khoản không hợp lệ đều bị chặn. Gia
hạn500chưa thu, thu200còn300; không thu quá nợ. Trả pin giữ nợ300/cọc1000/
3phiếu, xóa mềm vẫn đọc được receipt gốc. Ngày31/01→28/02 hoặc29/02 và neo
tháng giữ đúng web. Chỉ PGlite cô lập,0DB vận hành/0tin thật.

Pending22nhóm đạt, thêm khóa chung update/delete/renew/collect/return qua
restart và đổi cơ sở; actor khác không được xác nhận mã gốc. Root/mobile
typecheck và mobile lint đã terminal exit0; root scoped lint exit0.
Shared lint qua Expo config ban đầu báo duplicate import, đã sửa và chạy
lại exit0 không warning. Không lấy các check này thay nghiệm thu staging.

## QA Samsung

Chỉ thêm `battery_workspace` generation27→28 vào checkpoint8131 đang
dùng, backup `.backups/mobile-battery-qa-upgrade-20261103`. Mọi field cũ
giữ nguyên. Catalogue từ actual SQL nhúng: hồ sơ pin#2, không phải hồ sơ
pin/phiếu tài chính của bài SQL đầu tiên. Portfolio native chỉ gia hạn
chưa thu/nhận lại/xóa mềm; tạo/sửa/thu tài chính ngoài portfolio trả lỗi
QA rõ ràng. Không có outbound client/gửi Telegram thật.

Run1 dừng trước write vì harness chờ action dưới viewport. Run2 đã cuộn
đúng, xác định QA actor thiếu renew/return nên app ẩn nút đúng quyền;
cả hai lượt generation28/0request. Đã bổ sung hai quyền vào fixture USER
quản lý cơ sở, không đổi permission app/backend hoặc reset dữ liệu.

Run3 handle90514 terminal exit0 lúc20:18:15 (+07),392file nguồn khớp:
list/profile→gia hạn300chưa thu→receipt/ack→nhận lại→receipt/ack→xóa mềm→
receipt/ack.3UUID riêng, revision769→772, history2dòng và nợ300giữ lại.
Generation31; mọi field ngoài battery_workspace và26checkpoint cũ giữ
nguyên.0crash/ANR, local work/ledger rỗng, trả Tổng quan. Không reset/replay
ba mã đã ghi. Evidence `.backups/mobile-battery-native-20261103-run3`.
Đây là3nhóm happy path tập trung, không phải native tạo/sửa/thu tài chính.
JS/Hermes export web/Android/iOS handle89852 đã terminal exit0 tại
`.backups/mobile-battery-export-20261103-run1`, dotenv tắt/APIplaceholder,
chưa signed APK/IPA. Tổng hợp `.backups/mobile-battery-verification-20261103.json`.

## Còn thiếu / chưa nghiệm thu

- In/preview/xuất mẫu hợp đồng pin đúng bản web; picker tra CCCD/điện thoại
  và gợi ý nhân viên. Hiện nhập trực tiếp hoặc prefill từ hợp đồng xe.
- Đổi pin trên từng xe điện, phần trăm pin/phí100.000khi dưới20%, phiếu thu
  và thông báo theo batch: domain web riêng, chưa có luồng mobile tương ứng.
- Native tạo/sửa/thu tiền/chọn tài khoản, gửi Telegram thật, đủ role/cơ sở,
  staging/RLS, nhiều phiên/mạng lỗi/lifecycle và signed iOS/iPhone thật.
- Toàn app, release/vận hành chưa nghiệm thu; mục tiêu100%web vẫn active.
