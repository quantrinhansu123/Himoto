# Trả xe và quyết toán mobile — đang nghiệm thu

Ngày 02/11/2026: đã có writer/receipt/recovery/editor; Samsung đạt **6/6 nhóm
trả xe tập trung**, chưa triển khai migration production. Toàn app vẫn chưa hoàn
thành. Không suy browser hoặc SQL một kết nối thành nghiệm thu vận hành.

## Triển khai

- POST /contracts/:id/returns cần contracts.read + contracts.return, UUID cha,
  fee_snapshot và settlement_snapshot. Khóa parent request, hợp đồng, dòng xe
  theo thứ tự; tính lại hai preview trước khi ghi.
- Thu vượt cần xác nhận riêng. UUID con sinh server sau lock/kiểm tra; gọi
  completeReturnBatch cùng transaction nhận xe/kho/thu/hoàn và receipt.
- docs/sql/2026-11-02-mobile-returns.sql thêm proof JSON bất biến: scope chỉ
  SELECT/INSERT, actor RLS, khóa ngoại đến parent request. Chưa áp production.
- GET /returns/requests/:key trả đúng proof gốc: xe/giờ/fee, phiếu và UUID con/
  loại/tiền/phương thức/tài khoản/ngày. Kiểm tra scope và báo itemsCurrent,
  paymentsCurrent, contractCurrent. Chỉnh sửa về sau không làm mất proof gốc.
- return.record:<id> đã nối resolver/tombstone, ledger SecureStore và Tài khoản.
  Chỉ bỏ key khi server xác nhận chưa ghi và khóa mã cũ, hoặc sau khi người
  dùng đã xem/xác nhận receipt gốc.
- Editor bốn bước: chọn 1–50 xe qua trang 25 dòng; giờ/phí từng xe; tiền thực
  thu/hoàn; rà soát snapshot. Thuê sở hữu giữ gate bảo lưu. Hoàn cọc chỉ sau đủ
  xe/hết nợ. UUID chưa rõ kết quả khóa form; đối chiếu chưa ghi giữ nội dung.

## Bằng chứng

- **64 nhóm SQL**: .backups/mobile-return-write-sql-20261102.log. PGlite chạy
  SQL helper SECURITY DEFINER nguyên bản; không nhả kho khi còn một hợp đồng
  mở bị ẩn ở cơ sở khác. Có commit/replay, actor/scope, rollback giữa business/
  proof và parent ack, mất phản hồi sau commit, sửa receipt về sau, stale
  snapshots, thu vượt chưa xác nhận và tombstone.
- **15 nhóm return API/client/DTO** và **3 nhóm form** nằm trong lượt mobile
  cuối **120 nhóm/18 module**: .backups/mobile-return-final-all-api-20261102.log.
  SQL cuối **64 nhóm**, .backups/mobile-return-final-sql-20261102.log; release
  **44/44**, .backups/mobile-return-final-release-20261102.log.
- Root/mobile types đạt; mobile editor lint đạt:
  .backups/mobile-return-final-{root,mobile}-{types,lint}-20261102.log.
  Type routes sinh bằng Expo
  customize, không sửa file generated để ép kiểm tra qua.
- Browser **9/9** source cuối:
  .backups/mobile-return-browser-20261102-final/results.json. Có trả đủ/thu/hoàn
  cọc, trả một phần/hoàn thuê, chọn qua trang, mất phản hồi và Account, hủy mã
  chưa ghi/late retry, stale fingerprint, thu vượt cần rà soát lại. Receipt
  đã xem 375/430/812/1024 px, sáng/tối, giảm chuyển động.
- Hai lượt browser trước failed do script chờ điều hướng chưa đủ; giữ nguyên
  artifact, không ghép thành kết quả đạt.
- Web source: mobile/.expo/web-return-write-qa, server 8089/session 75432,
  log .backups/mobile-return-write-web-export-20261102.log.
- Backend source writer build thành công từ bản sao QA không chứa .env.local,
  DB cấu hình giả và chặn external network; cpus=1 chỉ trong bản sao để vừa
  host 8 GB. Log .backups/mobile-return-final-backend-build-20261102.log.
  Output có cả bốn route preparation/write, fee/settlement preview và receipt.
- Hermes source cuối iOS/Android xuất thành công:
  mobile/.expo/native-return-write-qa, log
  .backups/mobile-return-final-native-export-20261102.log. Android
  entry-254739102b263ee82ff844c4eb1b8a3c.hbc; iOS
  entry-f8f5a432481fd0843d7dc813f8177eff.hbc. Đây không phải signed iOS build.

SQL một kết nối chưa chứng minh tranh chấp nhiều phiên/RLS đã deploy/hiệu
năng staging. Browser dùng response tổng hợp, không chứng minh native picker/
bàn phím/Keystore. Nợ xấu/đổi xe/media trả xe/điều chuyển còn luồng riêng.

## Native Samsung và giới hạn

.backups/mobile-return-native-20261102-run2/results.json đạt **6/6**,
mode focused-return, 0 crash/app ANR/SystemUI ANR. Source trước/sau khớp:
source-provenance.json. Có native date/time picker, bàn phím nhập phí/sửa chữa,
thu 430.000 + hoàn cọc 100.000 cùng lượt nhận xe; hủy confirmation giữ review.
Mất phản hồi cho khoản thu 10.000 được phục hồi qua force-stop/Tài khoản đúng
UUID/phiếu, không thu lại. Yêu cầu chưa ghi sau force-stop được khóa bằng
tombstone, late retry 409. Cuối lượt ledger rỗng/đăng xuất và USB route trả lại
fixture 8091; fixture cũ giữ nguyên.

Sau lượt này phát hiện nhánh UI mở lại editor có pending key nhưng không có
form: sau cancel phải quay về chọn xe, thay vì bước phí rỗng. Đã sửa một dòng
và browser cuối đạt 9/9 có ca này. Native hồi quy riêng **4/4 đạt**:
.backups/mobile-return-native-reopen-20261102/results.json, mode
focused-return-reopen; 0 crash/ANR/SystemUI ANR, source trước/sau khớp. Đã
kiểm tra nhánh sửa sau force-stop, không ghi thêm vào fixture 8093 đang có
2 receipt; ledger rỗng và đã đăng xuất, USB route trả lại 8091. Không gộp hai
lượt native thành một full pass toàn app hoặc nghiệm thu iOS.

Lượt đầu .backups/mobile-return-native-20261102/ failed 0 nhóm trước prewarm:
Metro config request timeout sau 180s, hai lần /status không phản hồi, chưa
startedEpoch, chưa đổi USB route/đăng nhập/ghi fixture.

Đã yêu cầu khởi động lại đúng Metro qua helper Admin được cho phép, wrapper
.backups/start-mobile-return-metro-admin-20261102.ps1 (EXPO_NO_DOTENV=1).
Metadata mới .backups/mobile-phone-metro-admin.json là nguồn PID/log hiện tại.

Fixture riêng 8093/PID 15756/session 59947, seed 5101/5104/5105, giữ fixture cũ
8091/PID 15412. Script scripts/check-mobile-return-native.py xác minh origin
QA rồi tạm reverse điện thoại 8091 → host 8093. Nếu có pending key mới thì giữ
fixture/tuyến cho đến đối chiếu. Chỉ trả 8091 → host 8091 khi ledger rỗng và đã
đăng xuất. usb-fixture-route.json ghi tuyến khi test đi qua prewarm.
Không sửa source/QA khi native chạy; chỉ một UIAutomator reader.

## Icon đã xác minh trên Samsung

Đã build/cài ARM64 bằng adb install -r, giữ dữ liệu app. APK
.backups/mobile-icon-arm64-debug-20261102.apk, 96.046.955 byte, SHA-256
61e9a55e72642b77a7e7b75bb29de3ee83a7270640e810eaf75dc0a2771c4da4 khớp
base.apk trên Samsung SM-N960N.

Icon đủ chữ Himoto: .backups/mobile-icon-samsung-launcher-20261102.png.
Cả 5 mật độ foreground trong APK khớp resource Expo và nằm trong safe circle.
Hash SecureStore trước/sau cài không đổi; fixture cũ vẫn 2 khoản thu, 2 bill,
1 tombstone. Build này chứng minh icon; JS trả xe được phát triển sau đó cần
native QA đúng source, không gán kết quả icon cho nghiệp vụ trả xe.
