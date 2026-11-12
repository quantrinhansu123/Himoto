# Bàn giao phát hành Himoto Android — 13/11/2026

Tài liệu giao việc cho AI tiếp nhận. Chưa có hành động build APK, cài máy, phát hành OTA hoặc deploy trong đợt sửa này. Phần mã nguồn đã kiểm tra cục bộ; chưa nghiệm thu trên binary mới và backend production.

## Nội dung có thể sao chép giao AI khác

Bạn tiếp nhận dự án Himoto tại `E:\Himoto`, Windows PowerShell. Hãy hoàn tất phát hành các thay đổi đang có: deploy web/API tương thích, build APK release mới, kiểm tra bản đã ký và nghiệm thu trên thiết bị được chỉ định. Chỉ phát hành OTA khi cần, đúng runtime của binary mới. Không dừng ở việc đưa kế hoạch; thực hiện phần có đủ quyền và báo rõ bằng chứng, việc chưa kiểm chứng hoặc thiếu quyền truy cập.

### 1. Đọc tài liệu và giữ nguyên nguồn đang làm

- Đọc AGENTS.md áp dụng, `mobile/AGENTS.md` và ba báo cáo:
  - `docs/qa/2026-11-13-mobile-video-preparation.md`
  - `docs/qa/2026-11-13-mobile-navigation-fixes.md`
  - `docs/qa/2026-11-13-mobile-app-review.md`
- Đọc thêm `docs/mobile-repository-deployment.md`, `mobile/app.json`, `mobile/app.config.cjs`, `mobile/eas.json` và các script release trước khi chạy.
- Tại thời điểm bàn giao: nhánh `main`, HEAD `9b92445`; nhiều thay đổi CHƯA COMMIT và nhiều file mới CHƯA TRACK. HEAD riêng lẻ không chứa đủ bản cần phát hành. Kiểm tra lại trạng thái thực tế khi bắt đầu.
- Không reset/checkout đè/stash bỏ thay đổi của người khác. Nếu cập nhật từ remote, giữ và tích hợp toàn bộ công việc hiện có; không đưa bản web cũ đè lên web mới hơn.
- `scripts/build-mobile-android-release.ps1` và `app.json` ở ROOT đã có thay đổi từ trước lượt sửa; không tự hoàn nguyên. Expo phải chạy trong `E:\Himoto\mobile`, tránh dùng nhầm app.json ở root.
- Thư mục `mobile/modules/himoto-video/` và các file mới phải có trong commit/source snapshot/build context. Không chỉ copy các file đã tracked. Không đưa các thư mục build/cache vào commit.
- `.backups/`, `release/`, native generated `mobile/android`, `.env*`, keystore và thông tin đăng nhập không phải source để commit/phát tán.

### 2. Chốt APK, runtime và OTA

Cấu hình LOCAL đang chuẩn bị:

- Expo SDK `58`, package Android `vn.himoto.staff`.
- `expo.version = 1.0.10`; `android.versionCode = 11`.
- `runtimeVersion.policy = appVersion`, nên runtime dự kiến `1.0.10`.
- EAS owner `huybitvvt`; project ID `f928280d-4ea8-4574-b64e-51dd44b94d68`.
- Updates URL `https://u.expo.dev/f928280d-4ea8-4574-b64e-51dd44b94d68`.
- Channel production được cấu hình trong app.json.
- API production `https://himoto.vercel.app`; backend mobile nằm tại `/api/mobile/v1`.

Bản tổng thể BẮT BUỘC cần APK mới vì có module native `HimotoVideo`; OTA không bổ sung được native code vào bản cũ. Không đổi runtime về `1.0.9` để phát hành toàn bộ mã mới cho APK 1.0.9.

Kiểm tra phiên bản/code đã phát hành thực tế và EAS remote trước khi chốt. `eas.json` hiện dùng remote appVersionSource và production autoIncrement; không mặc định EAS sẽ lấy code 11 ở local. Nếu đã có binary/native khác dùng 1.0.10 hoặc code mới hơn, chọn version/runtime/code mới phù hợp, cập nhật tài liệu và toàn bộ kiểm tra tương ứng. Không tăng riêng versionCode rồi cho rằng runtime đã đổi.

APK đã chứa toàn bộ sửa đổi thì không cần đẩy thêm OTA giống hệt chỉ để có một lần OTA. Nếu cần OTA, chỉ Android, đúng project/channel/runtime của APK đã nghiệm thu; ghi update/group ID và source tương ứng. Không phát hành iOS trong nhiệm vụ này.

### 3. Những thay đổi phải có trong bản phát hành

1. Tiêu đề Khách hàng và tổng khách ở một hàng, phía trên nút Thêm khách hàng; đã kiểm tra với tổng 23.690 ở chiều rộng 320/375.
2. Bộ đếm cạnh Tất cả/Đang thuê/Quá hạn/các trạng thái khác. Hợp đồng dùng thống kê riêng; giữ cơ sở, nhóm, ngày, tìm kiếm, ID khách. Không dùng tổng của tab Nháp để làm tổng Tất cả; không biến lỗi/chưa tải thống kê thành 0 giả.
3. Quá hạn bao gồm nợ xấu, thống nhất SQL, bộ lọc và bộ đếm trên cả web/app. Vẫn giữ tab Nợ xấu riêng và không đưa hợp đồng đã hoàn thành vào quá hạn một cách tùy tiện.
4. Ảnh hồ sơ: reader hiện tại đã qua fixture PostgreSQL/PGlite với policy danh bạ dùng chung, đọc được danh sách/gallery/bytes của khách cùng hoặc khác cơ sở; quyền sửa khác cơ sở không được mở rộng. Lỗi 404 ở ảnh cũ CHƯA tái hiện trên tài khoản/backend thật. Đây là hạng mục còn phải nghiệm thu, không ghi là đã sửa dứt điểm trên production.
5. Trạng thái hợp đồng hiển thị tiếng Việt, giữ nguyên mã API. Bảng nhãn tại `mobile/src/lib/status-labels.ts`; đổi tên mục Dashboard thành Tổng quan giao dịch.
6. Hợp đồng mới lấy người làm/người ký từ tài khoản đăng nhập; pin mới không lấy nhầm người ký của hợp đồng xe nguồn. Hồ sơ đã lưu giữ nguyên tác giả/người ký cũ, không ghi đè hàng loạt theo người đang đăng nhập. NVKD, TLS và nguồn khách là các trường nghiệp vụ riêng.
7. Safe area ở form pin, thao tác pin, báo cáo/đối soát ca, quản trị, dashboard, hồ sơ/danh bạ và các modal; nút cuối phải nằm trên thanh điều hướng Android và dùng được khi mở bàn phím. Tab dưới cho phép hai dòng và có chiều cao đủ chứa nhãn.
8. Bấm tab dưới làm mới dữ liệu đọc của tab đích ở nền, giữ nội dung đang hiển thị; không tự gửi giao dịch hoặc refetch các bản chuẩn bị ghi tiền/kho/ảnh. Không làm mất bộ lọc/bản soạn.
9. Dashboard hiển thị số tiền đủ chữ số trên một dòng; thẻ tiền chiếm toàn hàng, co chữ khi cần; không làm tròn, rút gọn sai tiền hoặc cắt chữ số.
10. Nhân sự/Cơ sở mở `/directory/staff` và `/directory/stores`, không vào Unmatched Route. Đã kiểm tra tĩnh 120 đích điều hướng.
11. Mở nhóm Quá hạn/Nháp/VAT/Đến hạn/Thuê sở hữu từ drawer hiển thị đúng tên nhóm đang chọn, không hiển thị Tất cả gây nhầm. Giữ scope và không ép thêm status làm mất dữ liệu hợp lệ. Xem tất cả bỏ scope/status, tiêu đề màn hình đồng bộ.
12. Tab khách Nợ xấu/Cấm thuê ánh xạ đúng bộ đếm `bad_debt` cho bộ lọc `blacklist`.
13. Menu ba chấm dùng từng grant do máy chủ cấp. Đóng hợp đồng nợ xấu mở lifecycle `close_bad_debt`, không mở thu hồi xe; không tự ghi khi mở màn hình. Lịch sử hợp đồng khách lọc đúng `customer_id`, không dùng tên dễ trùng. Hợp đồng mới nhận đúng cơ sở đang chọn/phân công.

Các file phía server/web cần deploy cùng:

- `src/lib/server/mobile-catalogue.ts`
- `src/lib/server/mobile-catalogue-export.ts`
- `src/lib/server/management-table.ts`
- `src/lib/management/table-utils.ts`
- `src/lib/management/contract-tabs.ts`
- `src/components/management/ManagementPage.tsx`
- `shared/mobile-contract.ts` và các phụ thuộc source hiện hành.

API mới: danh mục hợp đồng nhận `customer_id` hợp lệ và `statistics=1`; thống kê trả `tabCount` trước lọc trạng thái, danh sách rows rỗng và statusCounts. Tham số nội bộ/SQL từ client vẫn bị chặn; export giữ ID khách và từ chối statistics-only. App vẫn đọc được response cũ nhưng backend cũ có thể từ chối hai tham số mới, nên phải deploy backend trước khi phát hành app.

### 4. Module video native phải được đưa vào binary

- Nguồn: `mobile/modules/himoto-video/`, native class `vn.himoto.video.HimotoVideoModule`, tên Expo module `HimotoVideo`.
- JS bridge: `mobile/src/lib/prepare-android-video.ts`.
- Luồng sử dụng: `record-video.ts`, `record-video-editor.tsx`, `shift-video-editor.tsx`.
- Media3 Transformer/effect `1.9.1`, đồng bộ expo-video SDK 58.
- Android xuất MP4/H.264, mục tiêu tối đa 1280×720 hoặc 720×1280, giữ tỷ lệ/hướng; không phóng video nhỏ. Mục tiêu bitrate khoảng 1.200.000 bit/s và 30fps.
- Video hợp đồng: tối đa 60 giây, 18 MiB sau chuẩn bị. Video ca: tối đa 180 giây, 45 MiB. Nguồn tối đa 512 MiB.
- Có tiến trình/hủy, timeout và kiểm tra output; không ghi đè hoặc xóa video nguồn. Đầu ra nằm trong cache riêng theo UUID.
- Đã compile Kotlin và xác nhận autolinking ở đợt trước, chưa build APK release chứa module này. Không coi compile debug Kotlin là đã nghiệm thu R8/release/encoder trên điện thoại.
- Ảnh đã dùng 1600px và các mức JPEG 0.78/0.65/0.52; giữ việc kiểm tra dung lượng/kích thước và chất lượng chứng từ.

### 5. Kiểm tra lại trước khi build/deploy

Chạy tại root, dùng `npm.cmd` trên PowerShell:

    Set-Location E:\Himoto
    $env:EXPO_NO_DOTENV = '1'
    $env:NODE_OPTIONS = '--max-old-space-size=2048'
    npm.cmd run mobile:typecheck
    npm.cmd run mobile:lint
    npm.cmd run typecheck

Chặn mạng ngoài cho các test fixture; phải kiểm tra exit code từng lệnh:

    $env:NODE_OPTIONS = '--max-old-space-size=1024 --require ./scripts/lib/offline-tests.cjs'
    npm.cmd run test:mobile
    npm.cmd run test:mobile:performance
    node scripts/check-mobile-direct-video.cjs
    node scripts/check-management-table.cjs
    node scripts/check-contract-tabs.cjs
    node scripts/check-contract-overdue.cjs
    node scripts/check-mobile-catalogue-export.cjs
    node scripts/check-mobile-customer-media-read.cjs --pglite-path .backups/contract-flow-qa/node_modules/@electric-sql/pglite

Chạy ESLint các file web/API đã sửa và production build web phù hợp môi trường. Không chạy bừa các test có thể đọc/ghi DB vận hành; dùng fixture/cơ sở dữ liệu cô lập.

Khi chuyển sang build/deploy hoặc public smoke, bỏ NODE_OPTIONS `--require offline-tests.cjs` trong phiên chuyên dùng, vì nó cố ý chặn mạng. Các lệnh Expo/EAS phải chạy trong mobile, dùng đúng env production; không dùng `EXPO_PUBLIC_APP_ENV` thay cho `EXPO_PUBLIC_ENVIRONMENT`.

Kết quả đã có: 39 script mobile qua; web/mobile typecheck, lint phần sửa qua; media PGlite 2 nhóm; 16 tình huống Playwright ở 320×740, 375×812, 812×375, 0 pageerror, 58 request fixture, 0 ghi nghiệp vụ. Đây không phải chứng nhận toàn bộ production/native.

Bằng chứng:

- `.backups/mobile-app-review-20261113/verification-summary.json`
- `.backups/mobile-app-review-20261113/browser-results.json`, log và screenshot.
- `.backups/mobile-navigation-20261113/`
- `.backups/mobile-video-20261113/`

Những số liệu này là kết quả đợt sửa trước. Nếu source đã đổi, chạy lại phần liên quan; không đổi cờ nghiệm thu thành true chỉ dựa vào báo cáo cũ.

### 6. Deploy web/API trước

- Repo được tài liệu chỉ định: `https://github.com/quantrinhansu123/Himoto`, branch `main`, Vercel project `congs-projects-f25af77d/himoto`, domain `https://himoto.vercel.app`. Xác minh lại liên kết/quyền/deployment thực tế trước khi thao tác.
- Root Next.js tại `E:\Himoto`, không phải thư mục mobile. Giữ web/API/shared cùng source mới; kiểm tra CI và deployment Ready/alias/source commit.
- Dùng cấu hình Production hiện có. Không chép secret server vào biến EXPO_PUBLIC, APK, source ZIP hoặc log. Giữ cấu hình Firebase/WIF/OIDC hiện có.
- Đợt sửa catalogue/filter này không thêm migration DB. Không chạy lại toàn bộ SQL lịch sử. Nếu ảnh thật còn lỗi, kiểm tra ID hồ sơ, scope tài khoản, chính sách đang deploy và các route đọc trước khi quyết định cần migration; không nới RLS để chữa tạm.
- Sau deploy, dùng một thư mục output mới:

    node scripts/check-mobile-live-public.cjs --output .backups/mobile-live-public-RELEASE-ID

- Public smoke chỉ kiểm tra route/gate. Phải kiểm tra thêm bằng phiên QA hợp lệ: statistics/customer_id, số tab, nợ xấu trong quá hạn, lọc nhóm, phân trang/export và xem ảnh theo quyền. API không bearer phải trả lỗi JSON đúng, không phải HTML 404.
- Không tạo/sửa/xóa hợp đồng, thu tiền, đổi kho hay gửi Telegram thật để thử nếu chưa được chỉ định dữ liệu kiểm thử.

### 7. Build APK bằng đúng khóa ký hiện hữu

Runner hiện có: `scripts/build-mobile-android-release.ps1`.

Các đường dẫn đã kiểm tra tồn tại lúc bàn giao:

- Java: `E:\Java\temurin-21\jdk-21.0.12.1+1`
- Android SDK: `E:\Android\Sdk`
- Gradle home: `E:\Android\Gradle`
- Signing: `.backups/mobile-android-signing-20261105/manifest.json`, keystore và `password.dpapi`.
- Firebase build config: `.backups/mobile-offline-20261106-run1/google-services.json`.

Không in mật khẩu/DPAPI, không tạo khóa ký mới. Script giải mã trong môi trường Windows đã có quyền. Nếu chuyển máy/tài khoản, dùng cơ chế backup khóa đã được chủ sở hữu cung cấp; không coi file DPAPI là mật khẩu portable.

SHA256 certificate phải giữ nguyên:

    0c0c26eb9e8bf3495e9cc547059a52392a51b52ec7d2034e997658944f6c40a2

Ví dụ gọi runner từ root trong một tiến trình PowerShell riêng; thay RELEASE-ID bằng tên thư mục chưa tồn tại:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-mobile-android-release.ps1 -Output .backups/mobile-android-RELEASE-ID -GoogleServicesFile .backups/mobile-offline-20261106-run1/google-services.json -Architectures arm64-v8a

Runner sinh native project, tạo source manifest, build/ký APK, kiểm certificate/version/API/Firebase và xác nhận source không đổi khi build. Không sửa trực tiếp native generated rồi bỏ quên config plugin/source. Không dùng ResumePreparedBuild từ nguồn cũ khi chưa xác minh đủ source/native/module/config.

Build tuần tự và kiểm tra tài nguyên máy; đừng chạy đồng thời nhiều Gradle/Metro/typecheck nặng. Không thay APK 1.0.9 hiện có bằng artifact chưa nghiệm thu.

Nếu dùng EAS thay local: giữ đúng project/khóa ký/env/module source. Profile production hiện chưa khai báo APK buildType; đừng giao AAB dưới tên APK. Profile preview cũng phải được cấu hình/xác minh channel phù hợp. Không tự tạo EAS project/keystore khác.

### 8. Xác minh APK release và cài đè

- APK phải là file mới, đúng package/version/versionCode/runtime/channel, production API, đúng chứng thư, không debuggable, đúng ABI thiết bị.
- Xác minh module HimotoVideo có trong autolinking và DEX/registration của APK đã ký; chạy được bridge/prepare trên bản release. Script `scripts/lib/mobile_release_bundle.py` hiện kiểm SQLite/SQLCipher/biometric/location/background/WorkDatabase/Firebase nhưng CHƯA kiểm riêng HimotoVideo: phải bổ sung kiểm tra tương ứng hoặc lưu bằng chứng bổ sung, không chỉ tin script cũ báo pass.
- Giữ kiểm tra constructor `androidx.work.impl.WorkDatabase_Impl` sau R8. Không chỉ tìm chuỗi tên class rồi kết luận module chạy được.
- APK không được chứa API QA `.invalid`, localhost, khóa ký/private key, `.env` hoặc secret server. Firebase Android config công khai cần thiết được xử lý theo config build; không nhầm với service-account private key.
- Lưu SHA256 APK, certificate, source manifest và bundle/native verification. Runtime/channel phải đối chiếu trong artifact thực, không chỉ nhìn app.json.
- Thiết bị kiểm thử cũ được tài liệu ghi là Samsung SM-N960N/Android 9; kiểm tra lại serial/model và thiết bị được chỉ định trước khi cài.
- Cài đè cùng chữ ký bằng `adb -s <serial> install -r --no-streaming <APK>`. Không uninstall hoặc clear dữ liệu. Kiểm tra UID, phiên đăng nhập, offline cache, bản soạn và các mã ghi đang chờ vẫn được giữ.
- Các script native QA cũ có selector Đội xe/Lập hợp đồng từ giao diện cũ; rà lại selector với Thao tác/Danh sách xe hiện tại. Không sửa sản phẩm chỉ để làm selector cũ đạt.
- Kiểm tra cold start/crash/ANR, chuyển tab, xoay ngang, tăng cỡ chữ, bàn phím, safe area Android ba nút/gesture; nút cuối bấm được.
- Kiểm tra đầy đủ 13 yêu cầu mục 3, đặc biệt ảnh thật và số liệu đối chiếu cùng tài khoản/cơ sở/bộ lọc trên web.
- Video: quay/chọn, ngang/dọc, có/không âm thanh, HEVC/HDR, 60/180 giây, tiến trình/hủy, rời/mở lại màn, lỗi codec/quá lớn, chất lượng chi tiết, dung lượng thực và upload nếu có dữ liệu QA được chỉ định. Chỉ xem ảnh/chọn/hủy nếu chưa có quyền ghi/upload dữ liệu kiểm thử.
- Không cam kết nhanh hơn web 3–5 lần hay hoàn tất Telegram trong vài giây nếu chưa đo.

### 9. OTA nếu cần

- Chỉ thực hiện sau khi binary mới có HimotoVideo và backend tương thích đã được kiểm chứng.
- Kiểm tra EAS login, project, env, channel→branch mapping, runtime đang phục vụ và quyền publish. Tạo export native production từ source đã chốt; tránh bundle QA/fixture.
- Chạy tại `E:\Himoto\mobile`, đặt `EXPO_NO_DOTENV=1`, `EXPO_PUBLIC_API_URL=https://himoto.vercel.app`, `EXPO_PUBLIC_ENVIRONMENT=production`; kiểm tra cả environment trên EAS có khớp.
- Lệnh tham khảo sau khi kiểm tra CLI/config hiện hành:

    npx.cmd eas-cli@latest update --channel production --platform android --environment production --message "Himoto Android: release fixes"

- Không chọn platform all, không phát hành mã native mới vào runtime 1.0.9, không sửa runtime/channel để né kiểm tra tương thích.
- Ghi update group/ID, runtime, channel/branch, source commit/hash và rollout. Mở lại app mới để xác nhận update thực được tải/chạy; bản 1.0.9 không nhận nhầm update này. Giữ bằng chứng rollback thích hợp cho từng runtime.
- Nếu APK mới đã chứa đầy đủ cùng bundle và không có hotfix tiếp theo, báo rõ không cần OTA bổ sung; không giả ghi đã phát hành OTA.

Tài liệu Expo: https://docs.expo.dev/versions/v58.0.0/ ; https://docs.expo.dev/eas-update/runtime-versions/ ; https://docs.expo.dev/eas-update/deployment/ .

### 10. Gói bàn giao và báo cáo cuối

- APK đã xác minh, tên đúng phiên bản; SHA256SUMS; certificate SHA256; package/version/code/runtime/channel; source commit và manifest/hash bao gồm các file mới.
- Ghi deployment URL/ID/source backend và kết quả smoke/authenticated checks. Nếu có OTA, ghi group/runtime/channel/branch; nếu không cần thì nêu rõ.
- Source ZIP dùng đúng nguồn đã build, không có credentials, `.env`, signing private key, workbook, ảnh/video khách hoặc cache vận hành.
- Rà `scripts/package-mobile-android-handoff.py` trước khi dùng: hiện còn tên source ZIP hardcode 1.0.0, guide cũ và các cờ nghiệm thu/ANR lịch sử. Cập nhật theo bản thật và bằng chứng mới; không sao chép các cờ cũ thành kết luận mới, không tự đặt nghiệm thu hoàn tất khi chưa kiểm tra.
- Có hướng dẫn cài đè/giữ dữ liệu và bảng kiểm đạt/chưa đạt cho từng hạng mục. Phân biệt fixture/browser, thiết bị thật và production. Những phần không có tài khoản/thiết bị/quyền để kiểm phải ghi chưa xác nhận.
- Nếu build/deploy/auth bị lỗi, báo đúng lệnh/bước/thông báo đã lọc secret, điều đã làm và dữ liệu đang giữ; không tuyên bố phát hành thành công khi chỉ mới build xong hoặc deploy chưa Ready.

Không gửi báo cáo Telegram hoặc thông báo ra ngoài trong nhiệm vụ này trừ khi chủ sở hữu yêu cầu riêng. Không cần hỏi lại những bước build/deploy đã được giao; chỉ hỏi khi thiếu thông tin/quyền thật sự chặn công việc.
