# Sổ quỹ và tài khoản/két —03/11/2026

Đã triển khai source/API/native trên nền `mobile/`. Chưa nghiệm thu toàn
module hoặc toàn app. Ưu tiên phủ chức năng/demo, kiểm thử sâu sau.

- Sổ quỹ độc lập: phiếu thu/chi, tìm kiếm, người thực hiện, cơ sở, ngày Việt
  Nam, phân trang/sắp xếp riêng, tổng và chi tiết đối chiếu theo bộ lọc.
- Tài khoản ngân hàng/két: danh sách, hồ sơ, số dư toàn thời gian, phiếu của
  tài khoản, tạo/sửa, ngừng sử dụng/kích hoạt qua biểu mẫu, xóa có điều kiện.
  Có ngân hàng cơ sở/công ty/két, số dư đầu kỳ nguyên có dấu, mặc định UI
  tiền mặt/đang sử dụng/0, tài khoản công ty dùng chung có thể không chọn cơ sở.
- UUID, revision `xmin`, xác nhận yêu cầu gốc tách thông tin/số dư hiện tại,
  khóa pending chung sửa/trạng thái/xóa và Account recovery. Bank và cash
  cùng ID số vẫn là hai tài nguyên độc lập. Giữ receipt sau xóa thật.
- Liên kết từ Tổng quan và hồ sơ cơ sở; phiếu có hợp đồng mở đúng hồ sơ khi
  có `contracts.read`. Thu tiền hợp đồng dùng luồng thanh toán đã có; không
  tự tạo action phiếu thủ công độc lập khi trang web không có action đó.
- Xuất CSV toàn bộ phiếu theo bộ lọc, ngoài trang đang xem, dùng trực tiếp
  `cashbookCsv` của web: cùng12cột, định dạng tiền/ngày, escape công thức và
  BOM UTF-8 cho Excel. Android chọn thư mục lưu bằng SAF; iOS chia sẻ file
  CSV tạm; web tải file. Hủy chọn thư mục không ghi file; không giữ nội dung
  xuất trong query cache hoặc ledger.

Nguồn web: `CashbookPage.tsx`, `cashbook-list.ts`, `cashbook-repository.ts`,
`cashbook-accounts.ts`, `access-request.ts`. Dùng trực tiếp reader phân trang
web và domain tài khoản mới tách ra `cashbook-account-domain.ts`; web cũng
gọi domain này, không có DB riêng hoặc cơ chế chép dữ liệu sau. Shared input
ở `cashbook-account.ts`, công thức tổng ở `cashbook-summary.ts`. Quyền đọc
`finance.read`, ghi `finance.write`; giữ scope actor/cơ sở, không dùng owner
pool hoặc fleet scope. Account/delete giữ nguyên điều kiện web.

Doanh thu thuê = tiền thuê + gia hạn + trả muộn − hoàn tiền thuê. Tổng thu
thực tế = cọc + tiền thuê + gia hạn + trả muộn. Tổng chi thực tế = hoàn cọc
+ hoàn tiền thuê. Sửa chữa/thu thêm/khác đối chiếu riêng. Tổng toàn bộ phiếu
thu/chi khác ba chỉ số thuê trên. Số dư tài khoản = đầu kỳ + thu − chi toàn
thời gian, chỉ phiếu approved; nếu phiếu có cả cash_id và bank_id thì tổng
tài khoản ưu tiên cash như web. Lịch sử tài khoản giữ giới hạn nguồn web
2.000 phiếu và hiển thị rõ tổng chỉ tính trên phiếu đã tải. Điều kiện xóa
đếm mọi trạng thái phiếu, kể cả pending.

Kiểm nhanh đã đạt:

- `check-mobile-cashbook.cjs --pglite-path ...`:5nhóm PostgreSQL nhúng,
  actual shared domain + reader SQL. Mobile tạo két → web đọc cùng ID/số dư;
  web tạo ngân hàng công ty → mobile đọc đúng dữ liệu. Phân loại/tổng, ngày
  Việt Nam, sort/page/search/actor/store, default/validation, CAS/replay,
  trạng thái, chặn xóa phiếu pending, receipt sau xóa và cancel chặn ghi muộn.
  CSV byte-for-byte khớp formatter web trên toàn bộ phiếu được lọc, gồm ngày
  Việt Nam; từ chối thiếu quyền hoặc tham số xuất lạ.
- Pending18nhóm, recovery6nhóm; root/mobile typecheck và lint liên quan đạt.
- QA8131 bổ sung duy nhất `cashbook_workspace` vào checkpoint đang dùng,
  generation13→14; mọi field cũ giữ nguyên. Bằng chứng tại
  `.backups/mobile-cashbook-qa-upgrade-20261103/results.json`.

Samsung CRUD run2 có ảnh từ xem sổ/tài khoản/lịch sử đến tạo két12001, sửa
số dư-500, ngừng dùng/xóa,4receipt và quay về Tổng quan/work+ledger rỗng.
Run bị ngắt trong lúc thu diagnostics, **không có verdict native cuối**;
crash/ANR chưa kết luận. Không chạy lại write hoặc xóa phiếu gốc.
Đối chiếu sau ngắt xác nhận333file đúng source thời điểm đó, mọi field QA
trước cashbook giữ nguyên và4phiếu còn đủ. Evidence
`.backups/mobile-cashbook-native-20261103-run2/interrupted-audit.json`.
Run1 vướng Laban IME đổi chuỗi ASCII CashDemo thành CáhDemo, không có write;
giữ evidence lỗi. Run2 dùng KetDemo0311 để nhập dữ liệu QA.

Metro khôi phục theo quyền admin người dùng cho phép, giữ API8091 và tắt
dotenv; bằng chứng `.backups/mobile-metro-admin-20261103-run1/launch.json`.
Lần gọi `.ps1` đầu kết thúc trước khi chạy; gọi admin qua `-Command` chạy
được, không thay ExecutionPolicy. Không đọc hoặc sửa `.env.local`.

Samsung xuất CSV run2 đạt16:57:33 (+07), tạo đúng1file/10phiếu trong
`/sdcard/Download/HimotoQA/Exports-20261103`, bytes khớp2204byte/BOM/CRLF
và SHA256 `05bd3047556b9fff72243765082206fab59c56b6ff2f0dcf648032d53c3e5539`.
Checkpoint QA nguyên vẹn, work/ledger rỗng,0crash/ANR trong lượt xuất file,
Samsung trả Tổng quan.337file app/shared/config/QA khác khớp source mở đầu;
chỉ QA helper đổi để hỗ trợ nhãn hệ thống tiếng Việt và đọc raw adb, có
bằng chứng hash riêng. Không thay source app trong lúc picker đang mở.
Evidence `.backups/mobile-cashbook-export-native-20261103-run2/results.json`.

Run1 tìm ra Android9 Downloads-provider raw tree không ghi được; đã sửa
initial URI sang device-storage Download rồi run2 lưu thành công. Lỗi kỹ
thuật/URI nội bộ không còn đưa vào UI khi xuất lỗi. QA helper cần nhãn
“Hiển thị gốc”/“Bản tải xuống”/“CHỌN”. Lần đầu đọc qua `adb shell cat` bị
transport đổi CRLF thành CRCRLF; không phải file CSV sai. Đã đọc lại bằng
`exec-out cat`, so sánh đúng bytes. Artifact `actual-exported-qa.csv` là
**bản đọc bị đổi dòng** giữ lại để truy nguyên; file đúng là `exported-qa.csv`.

Export bundle web/Android/iOS cuối exit0 tại
`.backups/mobile-cashbook-export-20261103-run1`, dotenv tắt/API placeholder.
Đây là JS/Hermes bundle, không phải signed APK/IPA. Native CSV tập trung
không thay thế nghiệm thu đầy đủ CRUD tài khoản hoặc toàn app.

Cập nhật tiếp: xóa hàng loạt/chọn toàn bộ theo filter đã nối actual domain
web, batch500/UUID/receipt/recovery và đúng settings.write; SQL nay8nhóm,
Samsung bulk run1 đạt3nhóm trên343file lúc17:17. Chi tiết và giới hạn ở
[QA xóa phiếu](2026-11-03-mobile-cashbook-delete.md); không lấy kết quả này
thay nghiệm thu toàn bộ phần tài khoản hoặc mọi vai trò/cơ sở.

Còn thiếu: nhập/xuất khác khi web thực có và các action con còn lại qua audit.
CSV đã nối source;
lưu/chia sẻ iOS thật và toàn ma trận file chưa nghiệm thu. Chưa kiểm sâu
toàn quyền/cơ sở, RLS thật, nhiều phiên/race, lỗi mạng/lifecycle, staging và
signed iOS/iPhone thật. Các lượt kiểm trên không ghi DB vận hành, nạp env,
deploy hoặc áp migration. Schema `management_mobile_requests` đã có trong
source vẫn là dependency staging phải xác nhận.
