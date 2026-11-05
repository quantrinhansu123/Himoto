# Ảnh hợp đồng và biển số —03/11/2026

Phạm vi lát này: ảnh trước/sau khi lưu nháp, các trang hợp đồng đã ký độc lập,
ảnh biển số theo từng xe, OCR/đối chiếu biển số và phục hồi từng ảnh. Không
thay thế nghiệm thu toàn bộ media/web hoặc tuyên bố CF-05/CF-06 hoàn tất.

## Hành vi đã có source

- Chọn/chụp ảnh vào hàng đợi trong form, xem lớn và bỏ ảnh có xác nhận. Ảnh
  giữ qua đổi bước/chọn thêm xe; ảnh biển số phải gắn đúng xe trước khi lưu.
- OCR dùng đúng entitlement `customers.write` như web photo-ocr. Đối chiếu
  chuẩn hóa biển số chính xác trên kho toàn đội xe; không chọn tùy tiện khi
  trùng hoặc không tìm thấy. Chỉ tự điền dòng trống chưa đổi trong lúc AI đọc;
  lái xe/đồ mượn đang nhập tay được giữ. AI lỗi/bỏ qua không bỏ ảnh.
- Dùng chung domain ô ảnh, nhóm bổ sung và trang ký của web trong `shared/`.
  Trang ký đầu giữ rental-document-1, trang tiếp theo rental-signed-N. Bill
  vẫn ở ô riêng. Ảnh thuê/giao, giấy tờ và biển số có target riêng rõ ID.
- Lưu metadata trước; giữ UUID gốc của nháp trong lúc hoàn tất ảnh, khóa tạo
  thêm nháp. Mỗi ảnh dùng đúng parent/reference revision, snapshot, photo
  revision, SHA256 và UUID riêng. Lỗi ảnh không lặp lại POST tạo nháp.
- Mất phản hồi mở đúng phiếu gốc; chỉ đánh dấu ảnh đó đã ghi sau khi kiểm tra.
  Drop được đối chiếu/tombstone trước gửi mới, chặn yêu cầu muộn. Tải lại ô
  ảnh giữ file đang chọn nhưng buộc ảnh cũ/mới được tải và rà soát lại.
- Quyền record-photo hợp đồng theo đăng nhập + RLS giống web, độc lập quyền
  chỉnh profile. Gỡ điều kiện contracts.read thừa ở gallery/receipt/resolver;
  vẫn chặn hồ sơ khác phạm vi và giữ bản phiếu theo đúng actor.
- Gallery phân trang, đầy đủ ảnh đã có, có thêm ô trang ký/nhóm vượt15 khi
  cần. Video hiện chỉ là metadata có lý do chưa hỗ trợ xem/lưu trong mobile.

Không đổi tiền/kho/trạng thái giao dịch khi tải ảnh. Không gọi OCR/provider
thật, không áp migration, không deploy hoặc ghi thử DB vận hành.

## Bằng chứng hiện có

- API/PGlite5 nhóm: ranh giới target/slot, quyền OCR, snapshot lựa chọn xe,
  kho khác cơ sở, dữ liệu riêng, rollback/lost commit/tombstone/replay và
  kết quả lookup/request bị tráo đều được kiểm bằng dữ liệu giả.
- Browser bản cuối `verified` (221 file) đạt4 nhóm: hai xe/bốn ảnh, nhiều trang ký; lost ảnh chỉ ghi
  một nháp; AI lỗi/manual binding; mất phản hồi nháp và ảnh đến muộn409.
  Các lượt lịch sử: run1 lỗi selector thiếu hậu tố ID, giữ checkpoint4 ảnh; run2 đạt3 nhóm; run3/final đạt4 nhóm.
  Không ghép các lượt thành một lần pass. Các phiên QA đã logout.
- Journal3 nhóm: restart exact state/receipt, replay một ảnh, tombstone và
  phiên terminal0. Core mobile26 script và web release44 suite đã đạt.
- Typecheck/lint web/mobile đạt; bundle Hermes iOS/Android và web đã xuất.
  Sau polish, typecheck/lint và export3 nền tảng đã đạt; browser `verified`4/4
  trên221 file. Hồi quy ảnh khách8/8 và nháp15/15 thuộc mốc trước polish220 file.
  Samsung run2 đạt3/3 liên tục lúc04:00 ngày03/11 trên checkpoint8121 riêng,
  221 file khớp trước/sau,0 app crash/ANR và0 SystemUI ANR.1 nháp/2 ảnh,
  lost response về đúng phiếu, drop được tombstone/late409, chỉ tải phần còn
  thiếu; ledger rỗng/logout0 phiên và USB restored. JPEG thật4200×2800 được
  chuẩn hóa2200×1467,80336 bytes, full decode/SHA256 khớp cho cả hai ảnh.
  Đây là nghiệm thu tập trung Android, không phải full app/provider/iPhone.

Proof native: `.backups/mobile-contract-photos-native-20261103-run2/results.json`,
`source-provenance.json`, `native-codec-proof.json`, `usb-route.json` trong cùng
thư mục. Checkpoint8121: `.backups/mobile-contract-photos-fixture-20261103-run2/state.json`.

Proof chính: `.backups/mobile-contract-photos-api-results-20261103.json`,
`.backups/mobile-contract-photos-ui-20261103-verified/results.json`,
`.backups/mobile-contract-photos-verified-source-20261103.json`,
`.backups/mobile-contract-photos-verified-export-20261103.log`,
`.backups/mobile-contract-photos-core-final-20261103.log`,
`.backups/mobile-contract-photos-release-20261103.log`.

## Còn phải triển khai/nghiệm thu

Tự sao chép giấy tờ khách vào hợp đồng đúng thứ tự web, xóa ảnh theo quyền và
phiếu đối chiếu; batch ảnh, toàn bộ video, camera thật, HEIC/rotation, khôi
phục toàn bộ hàng đợi chưa gửi sau kill/đổi phiên, đầy đủ role/staging/iPhone.
Chưa dùng bằng chứng JPEG/OCR giả này để chứng nhận provider thật hoặc toàn
bộ chức năng ảnh hợp đồng. Goal100% web và signed iPhone vẫn active.

Samsung run1 xác định đúng ảnh QA qua MediaStore filename/SHA/unique second
và timezone hệ thống, không chọn thumbnail cá nhân. Run1 FAILED sau một nhóm:
harness gửi late delivery ngay sau tap resolver, chưa chờ tombstone durable;
ảnh muộn commit hợp lệ trước resolver. Giữ nguyên checkpoint/failed result,
đối chiếu hai phiếu gốc trên đúng fixture8120, ledger rỗng/logout0 phiên; proof
`.backups/mobile-contract-photos-native-20261103-run1-settlement/terminal.json`.
Không ghép nhóm đạt của run1 vào lượt nghiệm thu khác.

Đã sửa harness chờ đúng UUID xuất hiện trong tombstone trước late delivery.
UI dùng tên nghiệp vụ/biển số/thứ tự ảnh thay raw slot/UUID trong tên điều
khiển; xóa cảnh báo OCR cũ khi manual bind/bỏ ảnh. Phiếu hiển thị thêm đối
tượng ảnh để đối chiếu đúng xe. Run2 trên checkpoint8121 mới/source221 file
đã có terminal PASSED3/3; không đổi kết quả FAILED của run1.

## Android theo dõi sau nghiệm thu

Android watch đã mở lại lúc04:03 ngày03/11 tại form nháp chưa lưu/Bước3/ảnh
biển số, USB8081→8081 và8091→8101. Runtime
`.backups/mobile-android-watch-contract-photos-20261103-run1/runtime.json`:
221 file khớp native, ledger rỗng, giữ1 khách/1 nháp/0 ảnh khách/0 ảnh HĐ cũ,
5 phiên QA active chủ ý. Restart giữ exact SHA/generation/digest; sau đó chỉ đổi
flag kho biển số QA và phiên đăng nhập, không có business write/reset. Đã kết
thúc native runner/reader; giữ cáp USB để theo dõi. Đây là watch, không cộng
thêm nghiệm thu và không nối dữ liệu vận hành thật.

## Bảo vệ dữ liệu hợp đồng cũ sau nghiệm thu UI

Chỉ đổi truy vấn backend: payload draft null/thiếu key/danh sách xe là object
hoặc scalar được xem là không có dòng nháp; các xe đã phát hành vẫn lấy từ
order_vehicle_details. Không suy xe từ payload sai dạng hoặc mở quyền xem xe
khác. API/PGlite5 đã chạy lại và kiểm các dạng này, quyền/RLS/receipt/replay/
lost/tombstone/lookup vẫn đạt; hồi quy record-media, root typecheck và lint đạt.
Proof `.backups/mobile-contract-photos-api-verified-sql-20261103.log`,
`.backups/mobile-contract-photos-media-regression-20261103.log`.
Không đổi221 file client/native fixture hoặc export/watch đã nghiệm thu;
không áp SQL/schema/production. Backend watch là mô hình giả nên không dùng
lượt mở watch để xác nhận guard SQL này.
