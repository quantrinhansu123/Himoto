Đọc [bàn giao05/11](mobile-handoff-2026-11-05.md) trước: pull đã hoàn tất,
action trạng thái/nháp đã triển khai; không làm lại theo các mục cũ bên dưới.

Tiếp tục Himoto tại E:\Himoto để hoàn tất app Android và bàn giao khách.
Chủ động triển khai theo cụm; kiểm nhanh types/lint/build/thao tác chính,
gom deep QA tổng thể sau. UI chuyên nghiệp, rõ, dễ thao tác, mượt; nghiệp vụ
chính xác. Đọc bản này trước mốc cũ, không làm lại phần đã có source.

PHẠM VI HIỆN HÀNH
- Người dùng bỏ iOS/iPhone khỏi điều kiện done; anh sẽ trao đổi khách sau.
  Không tiếp Expo Go/iPhone/Apple signing/TestFlight. Giữ source đa nền tảng.
- App phát triển từ repo https://github.com/quantrinhansu123/Himoto.git,
  dùng CHUNG BE/DB/tài khoản/quyền/nghiệp vụ với web, web vẫn hoạt động.
  Không yêu cầu tạo Supabase/DB vận hành riêng cho app.
- User cung cấp https://himoto.vercel.app/. GET không xác thực
  /api/mobile/v1/session trả404 khi kiểm04/11. Chưa deploy API mobile/source
  local lên đó, chưa nối Samsung ghi thử vào đó. Chưa rõ web đang có khách
  dùng thật hay bản thử. Staging là môi trường thử chung của hệ thống web,
  chưa được xác nhận/cung cấp; fixture/PGlite không phải staging.
- Done Android vẫn cần đủ23khu vực/action web, đúng vai trò/cơ sở/default/
  trình tự/tiền/kho/trạng thái/phiếu/audit/receipt/recovery, QA Samsung đủ
  ghi-đọc/nhiều phiên/mạng/lifecycle, DB-BE web thật và release/vận hành.
  Bản hiện tại chưa đủ bàn giao vận hành thật, không gọi done100%.
- Goal chưa đạt. Theo yêu cầu tiếp tục công việc ở chat mới, goal chat cũ
  được tạm dừng khi chốt bàn giao để tránh hai chat sửa cùng workspace.
  Objective cũ còn chữ iPhone bị quyết định Android này thay thế. Không
  complete chỉ để đổi chat/goal. Kiểm goal thực tế; nếu chat mới chưa có
  goal thì đặt theo phạm vi này và chủ động tiếp tục công việc.

ĐỌC KỸ
1. docs/mobile-handoff-2026-11-04.md: phần đầu sau23:05+07 và “Điểm code
   bắt đầu ở chat mới”, rồi các mục0,1,3.1,4,5 theo thứ tự ưu tiên mới.
2. docs/mobile-android-done-scope-2026-11-04.md.
3. docs/mobile-backend-shared-2026-11-04.md.
4. docs/qa/2026-11-04-mobile-android-battery-fleet-startup.md.
5. docs/mobile-action-backlog.md, docs/mobile-web-parity.md,
   docs/mobile-implementation-waves-2026-11-03.md. Bảng cũ là baseline,
   phải đối chiếu cập nhật/source hiện tại trước khi kết luận thiếu.
6. QA sau pull d3ce3c6, shift-video-and-web-delta, contract-import,
   telegram-and-ktnb-export, directory-bulk-dashboard, direct-video-history
   ngày04/11 trong docs/qa; mobile/AGENTS.md.

GIT/SOURCE
- HEAD d3ce3c6, branch feat/mobile-foundation không upstream. Pull đã làm
  từ27a87f1:7commit/33file, bảo toàn1.065file local theo backup/SHA/patch/
  verification .backups/prepull-mobile-20261104-180255/ và pointer
  .backups/mobile-pull-current.json. Không pull lại chỉ vì đổi chat.
- Lần kiểm bàn giao:80tracked modified/1.085untracked,0staged/0unmerged.
  Giữ toàn bộ source/local/untracked/QA, không reset/clean/stash/commit/push.
  Lấy mobile/ làm nền, tham khảo chọn lọc
  E:\Himoto_MobileApp\Himoto_App\frontend.

ĐÃ CÓ, KHÔNG LÀM LẠI
- Full edit5phần actual permissive web, correction cọc/gia hạn/trả xe,
  lifecycle6action, tiền-ngày thuê/lịch sử/phiếu/sở hữu/xóa nháp, in/PDF/QR.
- Nhập khách/CSV/khớp cơ sở batch-stream/Excel xe; video60s/directMP4,
  lịch sử gia hạn/phiếu/đổi pin; video ca180s editor/route/Stack/player/
  chọn-quay-preview-review/stage-category-revision/3video/UUID/recovery.
- Delta xe: giá trị/giá thuê không gửi phải giữ cũ, thumbnail authenticated,
  hợp đồng liên quan; nguồn khách Tên _Phòng/TLS và giữ nội dung đang gõ.
- Import nháp hợp đồng admin-only đã có API/UI/backup đọc lại-SHA/prepared
  revision/count/branch-map/namespace/duplicate/metadata/UUID/recovery;
  chỉ nháp chưa đối soát, không kho/phiếu/thu tiền. Không chạy CLI import
  scripts/import-contract-workbooks.cjs vì loadEnvConfig.
- Telegram hợp đồng/điều chuyển/pending30/recovery, KTNB xem-copy-TXT;
  sơ đồ nhân sự/TLS/kiêm nhiệm/nghỉ việc, hợp đồng cơ sở, bulk4danh mục,
  credentials một lần, Dashboard7KPI/kỳ/ngày/cơ sở/CSV đã nối actual web.
- Pin/sạc: gợi ý nhân viên active, CCCD-SĐT/khách duy nhất-chọn trùng, giữ
  thông tin đang gõ. SQL6/browser2luồng4ảnh/native pin run5 riêng đã đạt.
- Kho xe toàn hệ thống: cùng reader vehicle-inventory.ts cho web/mobile,
  DTO hẹp, entitlement fleet đúng web, tìm/lọc/phân trang25/link hồ sơ-
  điều chuyển. Reader5/browser2luồng4ảnh/native kho run2 riêng đã đạt.
- Sửa native splash kẹt che login: RootLayout.hide sau mount. Cold-start
  sau sửa qua. Root/mobile types, mobile/targeted lint, export Android-web
  cuối .backups/mobile-android-fleet-build-20261104-run1/ đạt, origin giả.
- Web Điều chuyển KHÔNG có nút CSV/Excel riêng. In pin/sạc đã có. Không làm
  lại hai mục này theo backlog cũ; số màn/green tests không chứng nhận100%.

BẮT ĐẦU PHẦN CÒN THIẾU
- Action Đổi trạng thái/tạo nháp từ kho CHƯA có module/API/UI native;
  chat này mới đọc source, chưa bắt đầu code action đó.
- Nền actual: src/lib/server/vehicle-actions.ts parseVehicleAction/
  applyVehicleAction; UI web VehicleActionDialog.tsx. Default giữ ready/
  using hiện tại; trạng thái khác trống; cơ sở kho vật lý, khách/note trống.
- status=using: khớp/tạo khách theo SĐT+CCCD, chặn blacklist/trùng sai hồ sơ,
  gọi actual saveDatabaseDraft; tạo NHÁP, xe vẫn ready đến khi phát hành,
  không phát sinh thu tiền/phiếu. status=ready theo actual writer. Giữ
  scope cơ sở/HQ, open-contract guard, CAS và audit/actor thật của web.
- Cần review/xác nhận, UUID/original receipt/replay/lost commit/resolve/ack
  và Account recovery. Tham khảo use-vehicle-profile-write/transfer-write.
  Nếu thêm operation stock, sửa cả regex shared/mobile-write-recovery và
  mobile pending-writes, vehicleProfileOperations, Account routing, xung
  đột bulk. Generic numeric receipt đang buộc ID khớp ID cuối operation;
  không dùng event_id thay vehicle_id âm thầm. Ý tưởng lưu original proof
  vào audit_snapshot trong cùng transaction mới là đề xuất, chưa code/test.
- Sau đó audit action con còn thiếu23khu vực theo source thực; gom deep QA
  tổng thể/DB-BE web/release. Không quay lại full edit/import/video đã có.

ANDROID/RUNTIME/CHECKPOINT HIỆN HÀNH
- Samsung282a05859f3f7ece (SM-N960N), adb E:\Android\Sdk\platform-tools\adb.exe.
  Reverse8081→8081,8091→8131; đã logout QA, ledger rỗng sau native run2.
- Metro8081 PID11656/admin9920, loopback/offline/dotenv tắt, health200.
  Script .backups/start-mobile-phone-metro-android-20261104.ps1.
  QA8131 đúng scripts/mobile-vehicle-fixture-server.py,
  PID7428/handle60089; health200. Fork8135 PID15580/handle90326 và8136
  PID21276/handle1277 health200, chỉ fixture, không dùng làm DB thật.
  Kiểm PID/port thực tế, không restart chỉ vì đổi chat. iPhone8082/8133/8134
  đã dừng, không khởi động lại luồng đó.
- APK debug mới .backups/mobile-android-native-build-20261104-run1/
  himoto-android-arm64-debug.apk, SHA256
  a65b003177e42b99ba681a1d55f20e63ecd64c9c22757f5ce868371ce8b68f12.
  Đã install-r22:23:58+07 cùng live cert;419file app data exact ngay sau
  nâng cấp/trước mở runtime. Có Clipboard native, chưa kiểm copy/share thật.
  Đây là DEV build cần Metro, chưa APK release bàn giao.
- Native pin .backups/mobile-android-read-native-20261104-run5/results.json
  và kho .backups/mobile-fleet-inventory-native-20261104-run2/results.json
  đạt riêng560source/0submit/0crash-ANR/nghiệp vụ fork giữ, reverse restored.
  Dashboard/sơ đồ native run3 chỉ hai subcheck đạt, toàn run3 fail automation
  cuộn; không gọi full harness run3 pass. Chưa native tài chính/full QA.
- Gốc .backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json
  giữ gen80/SHA6BE8545C… đến native23:05. GET kiểm runtime sau đó tự refresh
  hai expiresAt mirror phiên QA, journal tăng GEN81/SHA256
  5771b6d70cde7f43f0c5388b4935e42b8d268a295c3b23c63dbabac6e8f91077.
  So full state với fork đã giữ nghiệp vụ80: chỉ sessionSeq do fork login và
  hai hạn phiên mirror khác; nghiệp vụ nguyên. Đã backup81/đọc lại SHA/audit
  .backups/mobile-original-checkpoint-auth-refresh-20261104-run1/.
  Pointer .backups/mobile-android-current.json. KHÔNG reset về80 để giấu
  thay đổi; không replay UUID cũ. GET profile ở fixture gốc có thể refresh
  mirror nên ưu tiên fork riêng; health endpoint không đổi checkpoint.

RÀNG BUỘC
- Không đọc/sửa/log/copy .env.local, kể cả IDE đang mở file.
- Expo luôn EXPO_NO_DOTENV=1; export kiểm dùng
  EXPO_PUBLIC_API_URL=https://mobile-api.example.invalid.
- Không bí mật backend trong app; không tự production deploy/migration/
  ghi thử, không Telegram thật, không tự commit/push. SQL slot ảnh xe và
  mobile schema chưa tự áp production. Không script loadEnvConfig khi QA.
- Không clear/uninstall/reset app/ledger/checkpoint để vượt lỗi. Native
  update phải cùng cert, backup/SHA kiểm dữ liệu như lần419file đã làm.
- Chủ động làm tiếp, báo cáo ngắn phần đã làm/còn thiếu/chưa kiểm sâu;
  chỉ done khi đủ bằng chứng Android bàn giao, không vì đổi chat.
