# Bàn giao Himoto mobile — 04/11/2026

**Ưu tiên bản [05/11](mobile-handoff-2026-11-05.md):** đã pull web theo yêu cầu,
action trạng thái/nháp đã có, Excel có delta mới. Các mốc dưới đây là lịch sử.

**Chốt chuyển chat theo yêu cầu người dùng:** tiếp triển khai ở chat mới;
goal chat cũ được tạm dừng khi chốt để tránh hai chat sửa cùng workspace.
Mục tiêu chưa đạt, không complete. Chat mới đọc prompt hiện hành và tiếp
action kho chưa triển khai. Trạng thái active trong snapshot dưới là lần
kiểm trước khi chốt chuyển chat.

**Cập nhật mới nhất04/11 sau23:05+07 — tiếp Android, dùng chung BE/DB web.**

- Người dùng yêu cầu tiếp tục triển khai để bàn giao Android, xác nhận app
  phát triển từ repo Himoto, cùng backend/database/tài khoản/quyền với web.
  URL được cung cấp `https://himoto.vercel.app/`; GET session mobile trả404,
  chưa deploy/kết nối app vào đó. Không yêu cầu tạo DB mới riêng cho app.
  [Kiến trúc chung](mobile-backend-shared-2026-11-04.md).
- Picker nhân viên active/CCCD-SĐT pin-sạc đã nối web/native, giữ nội dung
  đang gõ; SQL6/browser2luồng4ảnh đạt. Samsung pin-sạc run5 đạt riêng560file/
  0submit/0crash-ANR. Native run3 đọc Tổng quan/sơ đồ đã kiểm riêng, toàn
  harness run3 lỗi hướng cuộn nên không gọi pass toàn lượt.
- Kho xe toàn hệ thống đã nối cùng reader web, DTO hẹp, tìm/lọc/phân trang25/
  link hồ sơ-điều chuyển. Reader5/browser2luồng4ảnh/types/lint/export Android-
  web đạt; Samsung run2 đạt4ảnh/560file/0submit/0crash-ANR lúc23:05.
- APK mới `a65b003177e42b99ba681a1d55f20e63ecd64c9c22757f5ce868371ce8b68f12`
  đã cài22:23:58+07, cùng live certificate,419file data exact lúc nâng cấp.
  Có Clipboard native; chưa copy/share acceptance. Đã sửa splash native kẹt
  che login, cold-start sau sửa đã qua. Đây là debug/dev build, chưa release.
- Gốc80/SHA6BE8545C… nguyên đến23:05. GET kiểm runtime sau đó làm mới2hạn
  phiên mirror QA, tăng **gen81/SHA5771b6d70cde7f43f0c5388b4935e42b8d268a295c3b23c63dbabac6e8f91077**.
  Đối chiếu full state với fork đã giữ nghiệp vụ80 xác nhận chỉ metadata
  phiên khác; đã backup gen81/SHA/audit, không reset. Pointer hiện hành
  `.backups/mobile-android-current.json`; đọc QA mới trước mọi mốc80 cũ.
- Runtime mới: Metro8081 PID11656/admin9920 offline, dotenv tắt; QA8131
  restart bằng đúng `scripts/mobile-vehicle-fixture-server.py` và checkpoint
  hiện có, không reset: PID7428/handle60089, health200. Fork8135 PID15580/
  handle90326 và8136 PID21276/handle1277 chỉ QA tổng hợp, health200. Samsung reverse đã
  trả8081→8081/8091→8131, QA logout/ledger rỗng. Kiểm PID/port khi tiếp quản.
- [QA và bằng chứng](qa/2026-11-04-mobile-android-battery-fleet-startup.md).
  Tiếp Đổi trạng thái/tạo nháp từ kho bằng actual web writer/UUID/receipt,
  audit action con23khu vực, rồi QA tổng thể/staging/release. Web Điều chuyển
  không có export CSV/Excel riêng; không thêm action dựa trên backlog cũ.
  iPhone bỏ khỏi done. Goal vừa đọc lại đã **active/chưa đạt**; không
  complete/tạo goal khác chỉ để chuyển chat hoặc bỏ chữ iPhone cũ.

**Điểm code bắt đầu ở chat mới: Đổi trạng thái/tạo nháp từ kho — CHƯA triển khai.**

- Đã đọc source, chưa tạo module/API/UI cho action này. Dùng
  `src/lib/server/vehicle-actions.ts`: `parseVehicleAction`/`applyVehicleAction`,
  đối chiếu `src/components/management/VehicleActionDialog.tsx`. Default web
  giữ trạng thái hiện tại nếu ready/using, trạng thái khác mặc định trống;
  cơ sở mặc định là kho vật lý, khách/ghi chú trống. Không tự chọn trạng thái
  đối diện. Scope cơ sở/HQ, hợp đồng mở, blacklist/trùng SĐT-CCCD và revision
  phải theo actual writer. Không tự siết web permissive hoặc đổi kho trực tiếp.
- Nhánh status=using của writer khớp/tạo khách rồi gọi actual
  `saveDatabaseDraft`, tạo nháp và audit; xe vẫn ready, không thu tiền/phiếu.
  Nhánh ready theo actual writer, không thay bằng metadata editor. Có nháp
  phải mở đúng ID/code đã tạo, giữ original receipt qua mất response/replay.
- Nối review/xác nhận, actor thật, UUID/CAS/receipt/recovery/Account; tham khảo
  `use-vehicle-profile-write.ts` và `use-vehicle-transfer-write.ts`.
  Nếu thêm operation stock, cập nhật cả regex shared/mobile-write-recovery,
  mobile pending-writes, `vehicleProfileOperations`, Account routing và
  xung đột bulk. Numeric receipt generic hiện buộc resource_id khớp ID cuối
  operation, không dùng event_id thay vehicle_id một cách âm thầm.
- Có thể lưu snapshot kết quả mobile có actor/UUID vào audit_snapshot của
  event trong cùng transaction, nhưng đây mới là ý tưởng, CHƯA code/test;
  phải kiểm RLS và proof/replay thật trước khi chọn. Không tự migration DB.
- Kiểm nhanh actual writer/tiền-kho-audit/180giây đã có không làm lại;
  SQL kiểm action mới phải fixture/PGlite và offline. Không chạy script web
  có loadEnvConfig (ví dụ check-cross-branch-rentals) hoặc CLI import để QA.

**Quyết định mới22:04+07: DONE ANDROID TRƯỚC; iOS/iPhone bỏ khỏi điều kiện done.**

Anh sẽ trao đổi iOS với khách sau. Dừng luồng thử iPhone; không chờ tài khoản
Apple/ký iOS/TestFlight. Giữ đủ chức năng web/quyền/cơ sở, staging DB/BE,
Samsung thật, bản Android ký và bàn giao/vận hành. Goal vẫn active/chưa đạt;
description goal chữ cũ nhắc iPhone được thay phạm vi bởi yêu cầu mới này.
[Tiêu chí Android hiện hành](mobile-android-done-scope-2026-11-04.md).
Điểm tiếp đã cập nhật ở mốc sau23:05 phía trên; các mốc dưới là lịch sử.

Đọc bản này trước các checkpoint cũ. Tiếp tục tại `E:\Himoto`, lấy `mobile/`
làm nền; tham khảo chọn lọc `E:\Himoto_MobileApp\Himoto_App\frontend`.
Đây là bàn giao công việc đang tiếp tục, chưa phải nghiệm thu sản phẩm.

**Cập nhật21:02+07 — iPhone Expo Go riêng đang chờ login CLI qua GitHub.**

- Anh có12ProMax/iOS18.7.8 và đã cho phép admin. Metro Go8082 PID20452,
  admin supervisor7664, proxy private8133 PID16880 → backend8134 PID19280/
  handle69001. Snapshot441file/allowlist/SHA, fork checkpoint gen82 auth-only;
  checkpoint Samsung80/SHA6BE8545C… nguyên, Metro18372/QA7944 không đổi.
- iOS export riêng/manifest58.0.0/bundle đúngAPI/login-workspace/control403
  đạt; QR `exp://192.168.100.104:8082`. iPhone đã tớiMetro nhưng Go yêu cầu
  CLI login cùng tài khoản. Anh dùng GitHub; browser login CLI58 với
  BROWSER=none đang chờ handle13847/callback64870, anh bấm OAuth link trên PC.
  Chưa gọi iPhone chạy được app/acceptance. Không hỏi password/OTP qua chat.
- [Điểm tiếp và lệnh/hạn chế](mobile-iphone-setup-2026-11-04.md), pointer
  `.backups/mobile-iphone-go-current.json`. Kiểm `expo whoami`, manifest rồi
  cho Try again; không đọc token store hoặc reset app/ledger/checkpoint.

**Cập nhật20:30+07 — nhân sự/cơ sở/bulk/Tổng quan đã nối source/API/UI.**

- Shared sơ đồ web/native (TLS/kiêm nhiệm/nghỉ việc/RLS), hợp đồng cơ sở
  actual web reader/summary/tìm/phân trang25; xóa nhiều4danh mục bằng actual
  web domain/permission/CAS/review/UUID/receipt/recovery; credentials nhân sự
  chép/tải TXT cấp một lần. Không thêm Excel riêng khi web chỉ có CSV.
- Tổng quan7chỉ số/kỳ7preset/ngày/cơ sở/CSV, actual web SQL/scoped pool và
  pure helper chung. SQL directory3/bulk4/dashboard3, reports5/duty4,
  pending30/recovery6, browser4luồng10ảnh/types/lint/export3 cuối đạt.
- [QA mới](qa/2026-11-04-mobile-directory-bulk-dashboard.md). Chưa native/
  staging/acceptance tổng thể; checkpoint gen80/Metro18372/QA7944 giữ.
- Anh có iPhone12ProMax/iOS18.7.8, Apple Developer Program chưa có/chưa rõ.
  Đã giải thích Expo Go miễn phí/Personal Team Mac7ngày/cloud signing trả
  phí; chưa cài/ký/upload. [Hướng dẫn iPhone](mobile-iphone-setup-2026-11-04.md).
- Tiếp action con thực còn thiếu23khu vực (picker pin/sạc, xuất danh sách
  điều chuyển và kiểm inventory source hiện tại), rồi deep QA tổng thể và
  staging/Samsung/iPhone ký. Không làm lại các cụm source đã khép.

**Cập nhật19:45+07 — Telegram và KTNB copy/export đã nối source/API/UI.**

- Hợp đồng: xem nhóm/nội dung/ảnh-video, send/resume/retry-confirmed-absent/
  retract; điều chuyển: preview/digest/xác nhận/gửi theo actual web domain.
  Pending30/trang, UUID/receipt/Account recovery; mở màn hình không gửi tin.
- KTNB dùng exact formatter web của bản đã lưu để xem/chép/xuất TXT.
  SQL Telegram5/route3/ca6, browser Telegram2luồng7ảnh/KTNB2luồng2ảnh đạt;
  types/lint/export3nền tảng cuối cụm đạt.0tin thật/0ghi production.
- Thêm expo-clipboard58 cần binary mới; chưa build/cài native mới. Không
  dùng native12:35 chứng nhận cụm source mới. Checkpoint gen80 giữ nguyên.
- [QA Telegram/KTNB](qa/2026-11-04-mobile-telegram-and-ktnb-export.md).
  Tiếp drilldown hợp đồng cơ sở/sơ đồ nhân sự/Excel-batch/action con23khu vực;
  import hợp đồng/video/full edit đã có source, không làm lại.

**Cập nhật19:10+07 — import hợp đồng đã nối source/API/UI.**

- Admin-only chọn nhiều file/mapping cơ sở/mẫu12cột/xem trước25dòng, actual
  pure/server parser/plan/writer của CLI. Không chạy CLI/loadEnvConfig.
- Backup Documents native/IndexedDB web bắt buộc đọc lại/SHA256 trước gửi;
  prepared revision/count/manifest/actor-signature/namespace/duplicate/
  metadata, generic UUID/receipt/Account recovery. Chỉ nháp chưa đối soát,
  không tiền/phiếu/kho, đối chiếu tables/bản gốc trước commit.
- SQL actual3nhóm + web pure7/nhập khách4/pending28/recovery6/backup adapter3
  đạt. Root/mobile types/lint/shared sạch; export3nền tảng và native final
  run3 đạt. Browser final2luồng375sáng/430tối/6ảnh/0pageerror đạt, có lỗi
  storage và lost commit/backup download exact. Chưa native/staging/iPhone.
- [QA import](qa/2026-11-04-mobile-contract-import.md). Tiếp Telegram hợp
  đồng/điều chuyển/action con23khu vực; không làm lại import/video/full edit.
  Checkpoint gen80/SHA6be8545c… vẫn nguyên, runtime18372/7944 giữ.

**Tiếp tục chat mới04/11 lúc18:40+07 — sau mốc pull18:10 bên dưới.**

- Goal thực tế chat mới đã tạo thành công, đang active; mục tiêu100%web và
  staging/Samsung/iPhone signed/release giữ nguyên, chưa done.
- Đã khép source/API/UI video ca180s: editor/router/Stack/player PGD-KTNB,
  chọn/quay/preview/review/revision/3video mỗi phần, UUID chung ca,
  direct/conversion/proof/resolve/ack; giữ file khi lỗi/resolve chưa lưu,
  cleanup khi rời. Mobile writer buộc receipt đúng UUID, proxy giữ416.
- SQL video5nhóm actual parser/writer/RLS với MP4 tổng hợp180/181giây đạt;
  SQL ca cũ5/xe8nhóm đạt. Browser video2luồng375sáng/430tối/5ảnh/0pageerror
  đạt, có lost commit và giữ blob sau cancelled. Types/lint/export3nền tảng
  đạt trước tinh chỉnh cuối nguồn khách/thumbnail; kiểm cuối ghi QA bổ sung.
- Delta web đã có source xe giá mua/giá thuê (bỏ field giữ cũ,0/null rõ),
  thumbnail vehicle-photo authenticated, API/UI hợp đồng liên quan của xe;
  nguồn khách Tên _Phòng dùng chung formatter web/TLS/logic nhân sự và giữ
  nội dung đang gõ. Chưa native/staging các cụm mới, không dùng native12:35
  làm bằng chứng. SQL slot ảnh xe vẫn chưa áp DB.
- [QA cụm mới](qa/2026-11-04-mobile-shift-video-and-web-delta.md).
  Điểm tiếp: import hợp đồng/Telegram/action con, không làm lại video ca UI
  hoặc full edit. CLI import tuyệt đối không chạy vì loadEnvConfig.

**Sau pull04/11 lúc18:10+07 — đọc mốc này trước các mốc cũ.**

- Theo yêu cầu mới đã `git pull --ff-only --no-rebase origin main`: HEAD
  `d3ce3c6`, thêm7commit/33file từ27a87f1. Giữ1.065file sửa/untracked:
  1.060nguyên byte/5gộp3chiều sạch; không staged/unmerged/commit/push.
  Backup/SHA/patch/verification `.backups/prepull-mobile-20261104-180255/`,
  pointer `.backups/mobile-pull-current.json`. Không pull lại chỉ vì đổi chat.
- Đã nối slot mới `vehicle-photo`/ảnh bổ sung vào shared mobile để tránh lỗi
  DTO toàn màn giấy tờ xe; SQL đọc workspace/lưu/xóa/phiếu đạt. Ngày gia hạn
  thực tế mặc định trống, buộc chọn như web mới. Sửa ngoặc thừa/import trùng
  của video ca đang dở, giữ toàn bộ phần nền, **chưa có UI ca hoàn chỉnh**.
- Kiểm cuối: root/mobile types đạt; mobile lint sạch; root lint0error/
  1warning cũ; shared thay đổi lint đạt. SQL xe6/ca5/video-history8/form gia
  hạn4nhóm đạt; export Android/iOS/web đạt, dotenv tắt/origin giả. SQL ca5
  chỉ kiểm ảnh/ca cũ, chưa video ca mới. Chưa native bản sau pull/staging.
  [QA sau pull](qa/2026-11-04-mobile-pull-d3ce3c6.md).
- **Code tiếp ở mục3.1**: khép video ca180s; khớp delta web giá xe/thumbnail/
  hợp đồng xe/nguồn khách; import hợp đồng/Telegram/action con trong23khu vực.
  Không quay lại full edit đã có, không lặp deep QA mỗi lát.
- Runtime18:10: Samsung282a05859f3f7ece đã nhận lại; reverse8081→8081,
  8091→8131. Metro18372 health200. QA8131 cũ đã dừng; restart cùng checkpoint
  PID7944/handle50355, generation80/SHA nguyên, không reset/install/clear/
  login/replay. Native cuối12:35 là521file bản cũ. Kiểm PID khi đổi chat.
- Goal tool lần kiểm này trả `usageLimited`; mục tiêu tổng thể **chưa hoàn
  tất**, không complete để đặt lại goal. Ưu tiên bàn giao/tiêu chí done giữ
  nguyên; chat mới tiếp source và kiểm trạng thái goal thực tế.

Mốc mới13:01+07, ưu tiên đẩy nhanh bàn giao: direct MP4 CloudFly và ảnh/video
gia hạn/phiếu gia hạn/đổi pin đã có source/API/native, actual web helper/writer/
parser, giữ permissive next versions/ID phiếu/CAS/UUID/recovery. SQL8/adapter2,
ảnh8/xóa5, types/lint/export3nền tảng/browser2luồng8ảnh đạt. Xem
[QA cụm mới](qa/2026-11-04-mobile-direct-video-history.md). Chưa native ghi
cụm mới; Samsung health/device/26checkpoint/gen80 giữ, Metro18372/QA16552.
Native521file12:35 là trước cụm này. Tiếp video ca (writer JSON180s có sẵn,
thiếu native/presign và cần proxy GET object), import hợp đồng/Telegram/action
con. Không lặp deep QA từng lát; gom nghiệm thu đầy đủ sau khi phủ chức năng.

## Tiếp tục04/11 — goal active, full edit/correction/nhánh hồ sơ đã mở rộng

Người dùng yêu cầu bật **goal đến khi done** ở chat mới; đã tạo goal active
với đầy đủ phạm vi100%web và các điều kiện cuối. Không complete vì đã có UI.
Chỉ pull khi có yêu cầu mới (đã pull thêm lúc18:10); không reset/clear/replay. Các mục chốt02:45 bên dưới là mốc
tiếp quản; phần mới ghi tại đây và QA tương ứng.

- Full edit source/API/native5phần đã có, dùng actual web writer với
  overwrite/permissive semantics; giữ phiếu/tiền đã thu, thay xe/kho/audit/
  clear approval, UUID/receipt/recovery riêng; không lifecycle nháp/copy tự động.
  SQL5nhóm đạt. Samsung run2 exit0 lúc03:12:54/453file/0crash-ANR, chỉ xem/
  nhập local/mở-hủy xác nhận,0submit. QA7/Tổng quan/work-ledger rỗng,
  generation72/26checkpoint giữ. [QA full edit](qa/2026-11-04-mobile-issued-edit.md).
- Correction cọc/chia khoản thu và ngày-tiền thực thu/phí/kỳ gia hạn đã có
  source/API/native, actual domain web, CAS/quyền/UUID/recovery. SQL4nhóm,
  root/mobile types và lint đạt. Samsung run1 exit0 lúc03:23:20/459file,
  0crash-ANR/0submit; export3nền tảng exit0. QA7/Tổng quan/ledger rỗng.
  [QA correction](qa/2026-11-04-mobile-contract-corrections.md).
- Lifecycle6action đã có API/native/preview/inventory, actual writer web,
  CAS/quyền/UUID/recovery;4nhóm SQL đạt. Samsung exit0 lúc03:38:03/465file,
  0crash-ANR/0submit; export3nền tảng exit0.
  [QA lifecycle](qa/2026-11-04-mobile-contract-lifecycle.md).
- Correction quyết toán trả xe đã có API/native, chọn nhóm trả, thời gian/
  phí từng xe, phiếu thu/hoàn và người nhận, review thay thế phiếu; actual
  writer giữ lịch sử/xe đang cho lượt sau thuê. SQL3nhóm đạt; Samsung run1
  exit0 lúc03:57:27/471file/0crash-ANR/0submit, QA7/ledger rỗng, giữ26checkpoint.
  [QA correction trả xe](qa/2026-11-04-mobile-return-corrections.md).
- Tiền/ngày thuê riêng, lịch sử/phiếu (có phiếu hủy), thời hạn/mức đóng sở
  hữu và xóa nháp máy chủ đã có source/API/native; SQL4+2nhóm đạt,
  types/lint/export3nền tảng đạt trước nhánh in. Samsung485file đi hết6ảnh;
  run2 exit1 do thiếu import deepcopy ở audit cuối, audit nối tiếp exit0
  lúc04:28:17/0crash-ANR/0submit-xóa/QA7/ledger rỗng/giữ26checkpoint.
  Không gọi run2 gốc là exit0. [QA hồ sơ](qa/2026-11-04-mobile-terms-history-draft-delete.md).
- QA same8131 hiện generation77; thêm terms_actions_workspace rồi làm mới
  projection history count bằng journal, không reset/replay. Các portfolio mới
  còn lại đã bổ sung trước đó qua journal,
  mọi field cũ exact trên checkpoint persisted mỗi lần. Backup mới
  `.backups/mobile-terms-actions-qa-20261104-run2/`, server14472/handle50923.
- Đã sửa guard ack trên4màn mới: hoàn tất ledger rồi tắt preventRemove trước
  điều hướng. Source/types/lint đạt; chưa kiểm native submit/ack bản mới.
- In source/API/native dùng lại mẫu web, hiện tại/theo phiên bản, pin/sạc,
  xem giấy/in hệ thống/PDF, tùy chọn QR nhúng. SQL/render5nhóm + browser
  PDF tổng hợp đạt. Next static import react-dom/server lỗi; đã dùng dynamic
  import của API React và kiểm Next thật200 tại mirror tách biệt không env,
  hai route in biên dịch qua/default feature gate503 đúng. Chưa signed release.
- QR chuyển khoản source/API/native dùng actual readContractQr, ngân hàng
  cơ sở/công nợ/cap/mode/phiếu thực tế, DTO không config bí mật; SQL2nhóm đạt.
  Types/lint cuối đạt; QR coherence SQL run2 đạt. QR image helper1nhóm đạt.
- Đã cài module Expo58 print/sharing/document-picker/video/webview qua Expo
  với dotenv tắt; prebuild CNG xong. Build ARM64 Gradle thành công; checker
  run3 false-fail vì prefix V2 của SDK37, verification nối tiếp exit0 lúc
  10:10:21+07, cùng chữ ký APK IME đang cài. APK mới SHA47d3071c…,
  `.backups/mobile-print-native-build-20261104-run3/verification.json`; **chưa cài**.
  APK cũ đã giữ và SHA kiểm đúng bản IME đang cài trước khi mất USB. Samsung
  hiện ADB mất kết nối, đã hỏi nối lại; không uninstall/clear. Metro7600 giữ.
- Nhập Excel khách đã có actual template/parser/writer, chọn dòng/review,
  settings.write/RLS/UUID/count gốc/recovery từ Tài khoản. SQL4nhóm,
  types/lint/pending-recovery regression/export3nền tảng đạt; chưa native
  chọn file/submit/ack. [QA in/QR/import](qa/2026-11-04-mobile-print-qr-import.md).
- Xuất CSV5danh mục theo filter/cơ sở/chọn cột đã có source/API/native,
  shared serializer web, actual table reader và followup notes. Adapter4nhóm,
  types/lint/export3nền tảng run2 đạt với đúng biến API_URL origin giả.
  Browser nhập/xuất375sáng/430tối4luồng đạt,0pageerror; mất phản hồi commit
  nhập được resolve/ack không nhập lặp. QA browser riêng, không đổi Samsung.
  [QA xuất](qa/2026-11-04-mobile-catalogue-export.md). Nhãn trạng thái tiếng
  Việt đã vào ảnh browser run2 mới.
- Khớp cơ sở Excel source/API/native đã có: actual parser/matcher/writer,
  hơn1.000dòng/duplicate toàn file/revision từng phần/partial-save. Upload
  một lần qua stream, UUID cstores/receipt/recovery, không migration. SQL3,
  stream3/web regression/import gốc/pending/recovery đạt. Browser run2
  6luồng/10ảnh,0pageerror, có lost-response phần2/ack/recheck không lặp.
  Root/mobile types/lint đạt, run7/export3nền tảng run3 exit0 sau đổi
  progress/refresh cuối. Browser run3 cuối exit0,6luồng/10ảnh/0pageerror;
  audit chỉ đọc giữ26checkpoint/generation77,0nativewrite. Metro7600/
  QA14472 vẫn giữ. [QA khớp cơ sở](qa/2026-11-04-mobile-customer-store-import.md).
- Excel xe source/API/native đã có sync/replace/reset/backupJSON/normalized,
  file cũ21cột, mapping/skip/cảnh báo/CAS/referenceblocker/UUID/recovery.
  Actual writer cập nhật giá/km có dữ liệu; sửa mô tả web sai nói giữ giá.
  SQL4/web6/types/lint/pending-recovery/export3nền tảng đạt; browser4luồng/
  8ảnh/0pageerror đạt. [QA xe](qa/2026-11-04-mobile-vehicle-import.md).
- Người dùng đã nối lại Samsung. Restart ADB nhận máy; install-r APK mới
  lúc11:37:40+07, cùng live cert,342file ứng dụng giữ nguyênSHA qua install,
  không uninstall/clear. Evidence `.backups/mobile-print-native-install-20261104-run1/`.
  Phục hồi reverse cũ. QA journal77→78 chỉ thêm print_import_workspace
  read-only, field cũ exact. Server8131 hiện19692/handle1709, Metro7600 giữ.
  Metro cũ7600 graph trước update package và /status timeout; đã restart
  đúng Himoto admin/dotenvoff, không clear. Metro mới18372/launcher15700,
  log114600, health200/packager-running. Smoke run1 dừng prewarm/run2 chưa
  Metroready,0UI-submit; run3 in/PDF/picker/guard đang chạy handle14873,
  run3 đủ7ảnh nhưng exit1 do harness missing deepcopy ở audit. Audit nối
  tiếp2 exit0 lúc11:52:17+07,512file source exact/0crash-ANR/26checkpoint
  nguyên/QA7-Tổng quan/work-ledger rỗng. Generation78→80 chỉ auth/expiry.
  Samsung tạo PDF1trang, mở-hủy share/in thật, xem QR chưa chọn ngân hàng,
  mở-hủy pickerExcel/resetblocker.0upload/import/xóa/tiền. Sau audit sửa
  harness import/diagnostics key; app source không đổi. Evidence
  `.backups/mobile-print-import-native-20261104-run3-audit2/results.json`.
- Việc tiếp: import hợp đồng, video/
  Telegram/action con và phần thiếu23khu vực; không quay lại full edit.
  Đã đọc contract-import: hiện chỉ có CLI `scripts/import-contract-workbooks.cjs`
  và pure/server helper, chưa có web UI/API. CLI bắt buộc prepared revision,
  branch-map, expected count và backup local đọc lại xác minh; chỉ tạo
  nháp tài chính chưa đối soát, không kho/phiếu/thu tiền. Khi nối native
  giữ đủ backup/CAS/namespace/duplicate/metadata đó, không gọi script CLI
  vì script loadEnvConfig. Video record-media nay có authenticated range reader,
  native player/picker/quay/review/upload/receipt/recovery cho lập/giao/trả xe,
  actual writer Cloudinary→Cloudinary/CloudFly,45MiB/60s/CAS/UUID. SQL4,
  types/lint/export3nền tảng/browser2luồng6ảnh bản cuối đạt. Samsung run1/2
  gốc fail UIAutomator fresh hierarchy, không gọi đạt; continuation audit
  tiếp2 exit0 lúc12:32:43/521file/26checkpoint/gen80 nguyên/0crash-ANR,
  xem video và mở-hủy Google PhotoPicker,0upload-submit. Sửa bug SDK58
  Android ended→idle khóa phát lại/rà soát; capture mới và audit bản cuối
  exit0 lúc12:35:43/521file exact/4ảnh, phát hết rồi phát lại/QA7-Tổng quan/
  ledger rỗng/26checkpoint/gen80 nguyên/0crash-ANR/0submit. Evidence
  `.backups/mobile-record-video-native-20261104-replay1/results.json`.
  Same8131 server16552/handle66851, Metro18372, reverse như cũ; không
  install/clear/reset. Chưa native upload/submit. Direct CloudFly MP4/gia hạn/ca/Telegram
  còn tiếp. [QA video](qa/2026-11-04-mobile-record-video.md).
- Tiếp Excel/import/export/video/batch/action con và
  mọi phần thiếu23khu vực. Chưa staging/tất cả vai trò/iPhone/release.

## 0. Ưu tiên và phạm vi được giao

Cập nhật yêu cầu bàn giao04/11: người dùng yêu cầu đẩy nhanh vì sắp giao app
cho khách. Ưu tiên khép chức năng/luồng demo và UI theo cụm, chỉ kiểm nhanh
types/lint/build/thao tác chính trong triển khai; gom QA sâu/nghiệm thu sau,
rồi đối chiếu toàn bộ DB/BE web trên staging. Tiếp source hiện có, không lặp
nghiệm thu sâu từng lát. Mục tiêu100% và các điều kiện done bên dưới giữ đủ.
Người dùng yêu cầu đặt lại goal; create_goal từ chối vì goal tổng thể còn
unfinished. Goal hiện tại vẫn active, áp dụng ưu tiên bàn giao mới này;
không thay success bằng một phạm vi demo nhỏ hơn.

**Phủ chức năng và hoàn thiện demo trước; kiểm thử sâu/nghiệm thu tổng thể sau.**
Mục tiêu vẫn đủ 100% chức năng web trong 23 khu vực và mọi action con, theo
đúng vai trò/cơ sở, trình tự, điều kiện, mặc định, tiền, kho, trạng thái,
phiếu, audit và kết quả nghiệp vụ. Không công bố phần trăm từ số màn hình.

Chủ động code và chạy typecheck/lint/biên dịch/thao tác chính; sửa ngay lỗi
chặn chạy/demo hoặc sai nghiệp vụ nghiêm trọng. Tiếp tục module tiếp theo
sau kiểm tra nhanh; gom ma trận quyền, mạng, nhiều phiên, race, fault và hồi
quy native vào giai đoạn sau. UI phải chuyên nghiệp, rõ và dễ thao tác.

Mốc bàn giao02:45 đã đóng chat cũ; người dùng hiện đã yêu cầu tiếp tục ở chat
mới và đặt goal active. Tiếp tục triển khai, không đánh dấu hoàn tất chỉ vì
chuyển chat hoặc đạt một lượt smoke.

Đọc tiếp: `mobile-action-backlog.md`, `mobile-web-parity.md`,
`mobile-implementation-waves-2026-11-03.md`,
`mobile-next-chat-prompt-2026-11-04.md`; lịch sử ở handoff03/11 và các QA.

## 1. Git và bảo toàn source

- Branch `feat/mobile-foundation`, không có upstream; HEAD
  `d3ce3c6068c44f5d99a0cf22d34c4b60fd5556ba`.
- Pull mới04/11:7commit/33file từ27a87f1, backup1.065file ở
  `.backups/prepull-mobile-20261104-180255/`,1.060exact/5merge sạch.
  File gộp: ContractRenewalDialog, ManagementPage, VehicleExcelActions,
  management/config, server/management-table. Lượt đầu Git dừng do CRLF;
  đã phục hồi originals rồi dùng Git filters để pull thành công. Verification
  là mốc ngay sau pull; sau đó có sửa tương thích5file source/tài liệu có chủ đích.
- Lịch sử lượt trước: fetch/pull explicit `origin main`, fast-forward11commit/55file từ
  `d1ea473` tới `27a87f1`. Không cần pull lại chỉ để tiếp tục chat.
- Trước pull đã lưu 846 file sửa/untracked, SHA và patch tại
  `.backups/prepull-mobile-20261104-021022/`; pointer
  pointer cũ đã được thay bằng backup mới ở trên. Ngay sau pull cũ:840file nguyên byte,
  6 file gộp 3 chiều, không mất/mismatch. Các đợt triển khai sau đó có sửa
  source tiếp, vì vậy không đòi current worktree còn nguyên SHA trước pull.
- Sáu file gộp: `BatteryContractsPage.tsx`, `ContractRenewalDialog.tsx`,
  `contract-payments.ts`, `contract-renewals.ts`, server `management-table.ts`,
  `tsconfig.json`. Backup có merge-plan/verification và nội dung gốc.
- Hiện không staged/unmerged. Nhiều thay đổi chưa commit là source dự án:
  giữ hết; không reset/clean/stash/checkout đè, commit/push tự động.

## 2. Phần vừa triển khai

### Gia hạn theo web mới sau pull

Native có ngày thực tế, giờ/ngày, số kỳ, đơn giá, hẹn trả, VAT/phí khác/thu
ngoài. Ngày gia hạn đã thu cũng là ngày phiếu theo web mới; `recorded_at`
server riêng. Quy tắc tách ngày phiếu cũ trong tài liệu03/11 đã bị thay.

Thu tiền + gia hạn nhiều xe trong một phiếu: tối đa50 dòng, phân trang25
giữ lựa chọn, hẹn/tiền riêng từng xe, cùng actual web writer và UUID/recovery.
SQL4/pure3/regression/types/lint/export đạt. Samsung run2 đạt lúc02:27,
3 nhóm màn hình/441 file nguồn khớp/0 crash-ANR; không gửi tiền/bill native.
Xem `qa/2026-11-04-mobile-renewal-parity-and-pull.md`.

### Duyệt thuê sở hữu sau phát hành — source/API/UI đã có

- Dùng trực tiếp `readContractApproval` / `approveIssuedContract` của web,
  trong scoped transaction và mobile UUID ledger hiện có; không migration.
- Đủ điều kiện: loại ownership/ownership_cd **hoặc cơ sở áp dụng thuê sở
  hữu/trụ sở theo helper web**, kể cả hợp đồng loại daily tại cơ sở đó.
- Đúng grant + role quản lý/admin; nhân viên có finalize riêng chưa đủ.
  Chặn draft/cancelled và revision cũ. Web cho lặp hợp đồng đã duyệt mà
  không thêm lịch sử; native thêm đối chiếu cùng UUID và khóa mã đã hủy.
- Màn hồ sơ hiển thị trạng thái duyệt. Màn kiểm tra có khách/cơ sở/tiền/cọc,
  hộp xác nhận, người duyệt/ngày duyệt, kết quả và đối chiếu lần gửi trước.
- Receipt giữ revision lần ghi; trạng thái duyệt hiển thị là **hiện tại**.
  Nếu web sửa/đổi loại làm mất điều kiện duyệt, vẫn đọc được receipt gốc;
  không khẳng định hợp đồng hiện vẫn được duyệt.
- Không sửa tiền, phiếu thu chi, trạng thái hoặc kho khi duyệt.

Source chính:

- `shared/contract-approval.ts`, `shared/mobile-contract-approval.ts`.
- `src/lib/server/mobile-contract-approval.ts`, các route
  `api/mobile/v1/contracts/[id]/approval` và
  `api/mobile/v1/contract-approvals/requests/[key]`.
- `mobile/src/app/contract-approval/[id].tsx`,
  `mobile/src/components/contract-approval-summary.tsx`.
- API client, regex pending/recovery và màn recovery đã nhận
  `contract.approve:<id>`. Policy thuần được dùng chung web/native.

SQL PGlite actual helper: **4 nhóm đạt**, gồm role/scope, CAS, actor,
replay/fingerprint, receipt/cancellation/rollback, approval bị web sửa lại;
tiền/kho/phiếu/trạng thái giữ nguyên. Log cuối
`.backups/mobile-approval-sql-run4.log`. Run1 lỗi cú pháp test, đã sửa;
giữ log thất bại, không thay business writer để làm test đạt.

Regression phát hành/giao xe `check-mobile-contracts.cjs` đạt; đây là test
adapter/stub domain, không gọi đó là SQL acceptance. Root/mobile typecheck,
mobile lint, lint server/web và shared đều đạt. Root lint ban đầu bỏ qua
shared (3 warning), đã lint shared riêng bằng config Expo, exit0.
Export ba nền tảng exit0 ở `.backups/mobile-approval-export-20261104-run1`;
chỉ JS/Hermes, chưa signed APK/IPA.

Samsung run1 handle54369 **terminal exit0 lúc02:45:30 (+07)**, 3 nhóm màn
hình/447 file nguồn khớp/0 crash-ANR. Chỉ xem quyền, mở rồi hủy xác nhận,
xem người duyệt; **0 native submit**. Đã trả QA7/Tổng quan, work-ledger và
admin_tokens rỗng. Mọi field nghiệp vụ và26checkpoint cũ giữ; sau auth
generation71, chỉ parent sessions/sessionSeq và hai expiry lồng đổi đúng
login. Chi tiết `qa/2026-11-04-mobile-issued-approval.md`, evidence
`.backups/mobile-approval-native-20261104-run1/results.json`.

## 3. Quy tắc full edit đã triển khai trong chat mới

Mốc tiếp quản02:45 mới đọc web; **hiện đã triển khai full edit native** như
cập nhật đầu file/QA. Giữ các quy tắc dưới khi hoàn thiện và hồi quy; tiếp
correction/bảo lưu/action theo phần mới, không quay lại làm từ đầu.

- Web chuẩn: `src/lib/server/contract-edit.ts` (`parseContractEdit`,
  `updateIssuedContract`), `contract-profile.ts`,
  `src/lib/management/contract-profile.ts`, route auth `[id]/edit`.
- Web full editor cố ý **overwrite bản mới nhất đã khóa**, không CAS như
  approval. `updateContractProfile(...,{allowIncomplete:true,overwrite:true})`.
  Không tự thêm chặn CAS rồi gọi là đúng web; cũng không hứa chống ghi đè
  mà source web chưa có. Cho người dùng kiểm tra rõ trước khi xác nhận.
- Web cho sửa hồ sơ chưa đủ trường; không dùng `draftErrors`/điều kiện phát
  hành để chặn full edit. Giữ whitelist DTO, điều kiện server thực tế.
- Writer thay/bỏ/thêm xe theo web, giữ audit, loại/thời gian/tổng/cọc,
  installment plan, versions/full_contract_edits, xóa approval khi sửa.
  **Không ghi đè tiền đã thu/collections từ nội dung form.** Phiếu là nguồn
  tiền thực nhận. Cần kiểm đúng kho và completed-line với hồ sơ lịch sử.
- Tận dụng `mobile/src/components/draft-editor.tsx` (5 phần) thay vì dựng
  form sửa vài trường. `DraftForm` đang private; `MobileDraftInput.status`
  chỉ `'draft'`. Thiết kế issued mode/DTO riêng, giữ status phát hành thật.
- `readMobileDraft` từ chối non-draft, `parseMobileDraft` strict; cần reader
  issued whitelist/permissive riêng dựa actual web projection, không nới
  validation nháp hiện hữu tùy tiện.
- `use-draft-write.ts` có auto-clear receipt khi id cũ và auto-copy giấy tờ
  khách; không áp nguyên cho full edit. Full edit cần receipt/ack/recovery
  riêng và **không tự copy giấy tờ khách mỗi lần sửa**.
- Không đưa issued edit vào durable draft journal hiện tại chỉ vì tái dùng
  form; tránh làm lẫn lifecycle nháp/đã phát hành. Giữ nguyên hồi quy các
  draft work và photos đang có.

Sau đó tiếp tục correction/ngày-tiền thực thu, bảo lưu/mở lại/đổi hạn,
lịch sử, in, Excel/import/export mọi vùng, KTNB/video/copy và các action pin.
Backlog/waves là nguồn phạm vi chi tiết; chưa đủ100% web.

### 3.1. Điểm code tiếp sau pull d3ce3c6

1. **Video ca180s đã khép source/API/UI lúc18:40+07**; các dòng dưới mô tả
   checkpoint18:10 cũ. Editor/route/Stack/player/hook đã nối và SQL video mới
   5nhóm/browser2luồng đã kiểm theo QA cụm mới; không triển khai lại:
   - `src/lib/server/mobile-shift-video.ts` và route mobile
     `shift-reports/[id]/video-upload` có config/sign/verify/conversion,
     actual browser-video helper ép180s/actor/UUID, kiểm quyền/cơ sở/stage/
     report revision/3video mỗi PGD hoặc KTNB, chặn UUID đã xử lý.
   - `mobile-video-read.ts` tách `streamMobileVideo`; mobile GET của
     `shift-media-handler.ts` proxy MP4/range, không redirect bearer sang
     storage. Web GET giữ semantics cũ; lưu dùng actual handler/ledger ca.
   - Shared có `MOBILE_SHIFT_VIDEO_SECONDS=180`; `record-video.ts` nhận
     maxDuration/MIME; `direct-record-video.ts` tránh MOV/WebM giả đuôi MP4.
   - `mobile/src/lib/api.ts` có shiftVideoSource/config/sign/verify/save;
     `mobile/src/hooks/use-shift-video-write.ts` có reserve nhóm media/update/
     audit, direct/fallback/proof/recovery/result. **Hook chưa UI gọi**.
   - Làm `shift-video-editor.tsx`, route `shift-video/[id].tsx`/Stack; chọn/
     quay180s/preview/duration/size/review rõ stage/category/revision, nối nút
     và `RecordVideoPlayer` vào `shift-evidence.tsx`. Tái dùng
     `/shift-result/[key]` đọc/ack proof; giữ file khi lỗi/resolve cancelled,
     cleanup khi rời. Không auto-submit.
   - Kiểm nhanh actual video writer180vs181/3video/CAS/quyền/replay/lost
     commit/proxy range. SQL ca5nhóm hiện chỉ chứng minh ảnh/ca cũ, không
     chứng minh nhánh video180s mới. Types/export qua không thay cho kiểm này.
2. **Delta web mới đã nối source/API/UI lúc18:40+07, chưa native/staging**:
   giá trị/giá thuê trong tạo-sửa-xem xe (không gửi
   field phải giữ giá cũ), thumbnail danh sách, hợp đồng của xe; nguồn khách
   `Tên _Phòng` nhưng TLS giữ TLS/logic nhân sự/không đổi nội dung đang gõ.
   Slot ảnh xe và thumbnail list đã nối source; SQL giá xe đạt. Ngày gia hạn mặc định
   trống đã sửa source, chưa native. Telegram đã pull actual send time footer.
   `docs/sql/2026-11-04-vehicle-photo-slot.sql` mới có source, **chưa áp DB**;
   kiểm constraint/RLS trên staging được cho phép, không migration production.
3. **Import hợp đồng chưa có UI/API native**: dùng pure/server helper của
   CLI, không chạy `scripts/import-contract-workbooks.cjs` vì loadEnvConfig.
   Giữ backup đọc lại xác minh/prepared revision/expected count/branch-map/
   source namespace/duplicate/metadata. Chỉ nháp tài chính chưa đối soát,
   không kho/phiếu/thu tiền.
4. Tiếp Telegram/video/action con/Excel-batch còn thiếu23khu vực, rồi khớp
   toàn bộ DB/BE thật staging và nghiệm thu tổng thể. Triển khai theo cụm,
   không lặp deep QA từng lát. Fixture/PGlite không phải staging; export iOS
   không phải signed iPhone thật. Không đánh dấu done khi còn các điều kiện này.

## 4. Runtime, QA và an toàn dữ liệu

- **Không đọc/log/sửa/copy `.env.local`.** Không nhét bí mật backend vào app.
- Không deploy, áp migration/SQL vận hành hoặc ghi thử production. PGlite
  và Python QA là dữ liệu tổng hợp, không phải staging/backend thật.
- `EXPO_NO_DOTENV=1` cho mọi lệnh Expo. Export đặt public API placeholder
  `https://mobile-api.example.invalid`, không lấy API từ env thật.
- Metro admin loopback8081: node PID18372, health200 lúc18:10; origin app
  `http://127.0.0.1:8091`, dotenv tắt. Startup/evidence:
  `.backups/mobile-phone-metro-admin-20261104-114600.log`. Người dùng đã cho phép admin;
  không hỏi lại hoặc đổi origin khi chưa cần. Tool hiện không nhận
  `sandbox_permissions`.
- QA API same8131 và checkpoint
  `.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json`.
  Runtime cũ16552 đã dừng khi tiếp quản18:00. Đã restart cùng file bằng
  `python -u scripts/mobile-vehicle-fixture-server.py --port 8131 --state-file
  .backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json`.
  Runtime18:10 PID7944/toolhandle50355; generation80/SHA6be8545c… nguyên
  qua restart, không reseed. Evidence before/after
  `.backups/mobile-postpull-20261104-checkpoint-{before,after}.json`.
  26checkpoint giữ theo audit cuối riêng; không native write/login. Kiểm
  listener/PID thực tế ở chat mới, không tin toolhandle cũ còn sống.
- Nếu toolhandle mất: kiểm listener PID/commandline trước stop/start;
  không suy timeout là process đã chết. Khi nâng checkpoint dùng
  `FixtureJournal.control`, không reset/replay portfolio cũ.
- USB Samsung `282a05859f3f7ece`, SM-N960N Android9, package `vn.himoto.staff`.
  ADB `E:/Android/Sdk/platform-tools/adb.exe`. Giữ reverse8081→8081 và
  8091→8131. Không bypass khóa màn hình; chỉ một UIAutomator reader.
- Portfolio duyệt9205 xem chưa duyệt;9206 xem đã duyệt bởi người có tên.
  Đây là **read-only QA**: có thể mở hộp xác nhận rồi hủy, không bấm gửi.
  Ghi thật ở QA này chưa được kiểm native; writer đã kiểm SQL nhúng.
- Không nâng role QA7 để thử admin. Synthetic account `qa-accounts` dành
  cho admin, `qa` là actor7; thông tin đăng nhập giả trong harness fixture.
  Đổi login sẽ đổi parent sessions/sessionSeq và hai expiry lồng
  vehicle_media/vehicle_transfers; dùng `verify_preserved_business` trong
  `check-mobile-managed-accounts-native.py` để đối chiếu đúng phạm vi.
- Giữ account2001 đã soft-delete/5receipt, type5receipt, integration3receipt
  và toàn bộ portfolio cũ. Không clear SecureStore/app data để test lại.
- Laban Telex đổi chữ ASCII; tìm bằng số ID, tránh mã viết HOA có dấu biến
  đổi. Placeholder không phải nội dung text để xóa. Helper login đã xử lý
  chờ focus; tận dụng, không nhập khi chưa xác nhận field nhận focus.

## 5. Điều kiện hoàn tất cuối dự án

Sau khi phủ chức năng mới kiểm thử và sửa tổng thể: staging backend thật,
tất cả vai trò/cơ sở, nhiều phiên/lỗi mạng/race, Android/Samsung,
**signed iOS trên iPhone thật**, cùng release/vận hành/khôi phục.
Chưa có các bằng chứng này; không tuyên bố done hoặc production ready.
