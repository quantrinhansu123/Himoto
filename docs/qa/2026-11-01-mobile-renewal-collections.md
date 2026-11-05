# Thu tiền cho kỳ gia hạn đã lưu

Đã có API, danh sách kỳ, màn rà soát khoản thu, bill theo kỳ và phục hồi kết quả.
Android đang chuẩn bị kiểm chứng; **chưa nghiệm thu phần thu theo kỳ trên native**.
Không dùng kết quả Android gia hạn trước đó để chứng nhận phần mới này.

## Hành vi

- Từ **Thu/chi hợp đồng → Các kỳ gia hạn và tiền còn thu**, xem các kỳ thực sự
  được lưu trong composer, mới nhất trước, 25 kỳ/trang. Hiển thị phí, đã thu và
  còn thiếu theo đúng định danh kỳ; lỗi tải thêm giữ các kỳ đã tải.
- Quyền xem: `contracts.read` và `finance.read` hoặc `finance.write`. Quyền ghi:
  `contracts.read` và `finance.write`; không suy quyền này từ `contracts.renew`.
- Thu một phần hoặc đủ phần phí còn thiếu của kỳ đã chọn. Không cộng lại phí,
  không đổi hẹn trả và không ghi nhận thu ngoài trong màn này. Khi khoản thực
  nhận vượt số còn thiếu toàn hợp đồng, có xác nhận rõ nhưng tổng hợp đồng giữ
  nguyên theo domain thu liên kết.
- Bill chính phải được lưu và rà soát đúng kỳ/phiên bản ảnh. Dùng lại picker,
  chuẩn bị JPEG tối đa 2 MiB và màn xem ảnh của luồng bill. Còn mã lưu bill chưa
  được xác nhận thì chưa được rà soát khoản thu mới. Lưu ảnh chưa ghi tiền.
- UUID `payment.renewal:<id>` hoặc `payment.bill:<id>` được giữ trong ledger theo
  người dùng/phạm vi cho tới khi kết quả gốc được xem và xác nhận. Mã chưa ghi
  được khóa bằng tombstone trước khi mở lại biểu mẫu. Tài khoản mở đúng màn
  khoản thu hoặc bill chuyên biệt, kể cả URL phục hồi không chứa phiên bản.
- Snapshot kỳ/số đã thu, revision hợp đồng, số dư toàn hợp đồng và revision bill
  được kiểm tra trong transaction. Metadata bất biến lưu kỳ, số tiền, tài khoản,
  thời gian và transaction gốc. Đối chiếu sau khi web sửa/hủy phiếu hoặc thay ảnh
  vẫn trả kết quả gốc với `current`/`billCurrent` độc lập; không tạo thu lần nữa.

API:

- `GET /api/mobile/v1/contracts/:id/renewals/periods?page=1`
- `GET|POST /api/mobile/v1/contracts/:id/renewals/:version/collection`
- `GET|PUT /api/mobile/v1/contracts/:id/renewals/:version/collection/bill`
- `GET /api/mobile/v1/renewal-collections/requests/:key`
- `GET /api/mobile/v1/renewal-collection-bills/requests/:key`

Migration `docs/sql/2026-11-01-mobile-renewal-collections.sql` mới chỉ áp trong
PGlite. Không áp migration, thay đổi dữ liệu hoặc triển khai production.

## Bằng chứng hiện có

- Sau pull `1d17b67`, toàn bộ bộ mobile đạt **102 nhóm**, gồm **11 nhóm** client,
  DTO, preflight và form thu theo kỳ. Log
  `.backups/mobile-collection-all-api-20261101.log` và
  `.backups/mobile-renewal-collection-results.json`.
- SQL thật qua domain/RLS/transaction trong PGlite đạt **43 nhóm**. Bao gồm thu
  liên kết một phần, replay, mất phản hồi sau commit, rollback, bill cũ/thiếu,
  số đã thu đổi mà order xmin không đổi, khóa mã chưa ghi, scope/actor, phiếu
  bị sửa/hủy sau ghi, phân trang 26 kỳ và kỳ trùng/hỏng. Log
  `.backups/mobile-renewal-collection-discovery-sql-20261101.log`.
- Browser bản cuối đạt **9/9**: `.backups/mobile-collection-ui-final-20261101/`.
  Zero page errors/unexpected hosts/đăng nhập thật/ghi nghiệp vụ. Kiểm tra thu
  một phần, thiếu bill, giữ form khi quay lại, phục hồi đúng transaction qua
  Tài khoản, tombstone chặn request đến muộn và 375/390/768 sáng/tối.
- Những lượt browser chưa đạt được giữ tại `...mobile-collection-ui-20261101/`
  và `...-reviewed/`: kịch bản ban đầu luôn đòi tải thêm dù cache đã có trang
  cuối; lượt sau tải lại đường dẫn SPA bằng Python static server nhận 404.
  Browser QA của app native dùng memory ledger; khả năng sống qua đóng tiến
  trình phải được chứng minh bằng SecureStore trên Android/iOS.
- Root/mobile typecheck/lint đạt; backend build đạt:
  `.backups/mobile-collection-backend-build-20261101.log`.
  Mobile kiểm tra cuối: `.backups/mobile-collection-final-mobile-checks-20261101.log`.
- Đã xuất lại web `.expo/web-collection-final-qa`, Hermes
  `.expo/native-collection-final-qa`; Android
  `entry-2a8839578570dc65ea86665585d49c01.hbc`, iOS
  `entry-6902fcac23a5d4e719a66bfc86760032.hbc`. Log
  `.backups/mobile-collection-final-{web,native}-export-20261101.log`.
  Đây là kiểm tra đóng gói, chưa phải app iOS đã ký hoặc nghiệm thu native.

## Việc còn phải kiểm chứng

Lượt Android đầu `.backups/mobile-collection-native-20261101/` dừng sau **8
nhóm**, gồm 5 nền và 3 thu theo kỳ: chặn phí/bill, picker/lưu bill/giữ form,
và khoản thu một phần giữ nguyên phí/hẹn trả. Chưa tới ca mất phản hồi. Có
**0 crash/app ANR/System UI ANR** theo diagnostics; đây vẫn là lượt thất bại.
Timeout xảy ra khi mở lại Tài chính và tìm CTA kỳ gia hạn; ảnh/XML giữ lại cho
thấy trang Tài chính ở đầu danh sách. Kiểm tra chỉ cuộn sau khi lượt đã kết thúc
hiển thị CTA ổn định, tại `.backups/mobile-collection-native-scroll-check/`.
Chưa khẳng định nguyên nhân chỉ do máy thiếu RAM hoặc automation. Đang kiểm tra
ledger, đăng xuất và sẽ đồng bộ QA với trạng thái trang tải xong trước khi cuộn.

Android `scripts/check-mobile-native.py --collections` đang được chuẩn bị trên
AVD AOSP `Himoto_AOSP_QA_20261101`, cùng APK media đã build/cài trước đó. Phải
ghi lại hash source/script và APK cài, chọn ảnh qua picker thật, giữ form khi
quay lại, đóng tiến trình trong hai ca mất phản hồi (thu/bill), đối chiếu và
xác nhận mọi mã trước khi reset fixture. Không sửa source trong lượt QA.

PGlite một kết nối chưa chứng minh tranh chấp nhiều phiên, RLS đã triển khai
hoặc hiệu năng staging. Camera thực, HEIC/xoay ảnh, TalkBack/VoiceOver, chữ lớn,
thiết bị thật, bản release và ký/phân phối iOS vẫn mở. Tiếp tục trả/đổi xe,
điều chuyển và media theo roadmap; chưa đánh dấu hoàn thành app.
