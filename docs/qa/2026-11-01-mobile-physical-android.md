# Android thật — đã cài ARM64, đang kiểm chứng

**00:52 — bill tập trung đạt 4/4 trên Samsung:**
`.backups/mobile-phone-pending-bill-20261102/`, 0 crash/app ANR/SystemUI ANR,
hash source/script trước/sau khớp. Đã chứng minh guard chặn thu khi còn bill
chưa xác nhận; qua force-stop/Tài khoản mở đúng bill/kỳ gốc, ack hết ledger,
không thu thêm hoặc upload lại, rồi giữ/xóa phiên. Lượt cuối đã đăng xuất.

Các ca thu theo kỳ khác có bằng chứng riêng và phần đã đạt được giữ trong
results của lượt dừng: 10.000 VND đúng một phiếu; mất phản hồi/phục hồi đúng
phiếu 5.000 VND qua SecureStore; request chưa ghi được tombstone, giữ form và
chặn late retry. **Chưa có một lượt full liên tục đạt cho toàn thu theo kỳ.**
Không ghép kết quả các lượt failed thành full. Các lỗi cuộn/IME/picker được
giữ nguyên artifact; người dùng đã hai lần tự chọn ảnh QA khi picker không
hiện filename. Bill JPEG thực nhận 2200×1467/160.317 byte đã decode đầy đủ tại
`.backups/mobile-phone-bill-codec-20261102.log`.

Sau đó chỉ dẫn pending bill được đặt sát phần bill và nhãn mở đối chiếu phản
ánh trạng thái chờ. Bản UI nhỏ này qua typecheck/lint/browser 9/9 và xuất lại
bundle; native 4/4 trên là trước đổi vị trí/nhãn. Latest source có thêm GET
preparation trả xe chưa có UI/native; không dùng các mốc trên để chứng nhận
nghiệp vụ trả xe hoặc toàn app.

**00:37 — đang kiểm tra phục hồi thu/bill:** lượt hiện tại exec **70044**,
`.backups/mobile-phone-collection-recovery-20261102/`, mode
`writes-only-recovery`. Fixture vẫn **16441**, không reset sau khoản thu đầu.
Guard yêu cầu đúng một receipt đã ack: hợp đồng 4003/kỳ 2/10.000 VND/còn 60.000.

Các bằng chứng thu theo kỳ trên Samsung đã có nhưng chưa thành lượt full đạt:

- `.backups/mobile-phone-collections-20261102-reviewed/`: chặn thu vượt phí và
  thiếu bill đã đạt; dừng ở picker không hiện tên file. Người dùng đã xác nhận
  chọn ảnh `SYNTHETIC BILL - QA ONLY` qua picker; không tự chọn ảnh cá nhân.
- `.backups/mobile-phone-collections-20261102-selected/`: ảnh native chuẩn bị
  2200×1467/~157 KB, upload vào đúng slot lịch sử và trở lại form giữ số tiền/
  tài khoản/ghi chú; thu một phần tạo đúng một phiếu, không đổi phí/hẹn trả.
  Đây là continuation sau chọn ảnh thủ công, không cộng ngầm thành một lượt full.
- Lượt selected sau đó dừng trước khoản thứ hai vì IME Telex biến `Lost` thành
  `Lót`. Đã đổi marker QA còn lại sang `QA-5000`/`QA-1000`, không sửa app hoặc
  tắt bàn phím cá nhân để né lỗi. Trước đó QA Delete theo batch chưa xóa hết
  note mặc định, nên đã thêm kiểm tra trường rỗng trước khi nhập replacement.
- Cả hai lượt dừng đều 0 crash/app ANR/SystemUI ANR. Cleanup selected xác nhận
  source không đổi, không còn mã chờ và đăng xuất:
  `.backups/mobile-phone-selected-cleanup-20261102/`. Không xóa app/data.

Picker của lượt mới sẽ chờ người dùng chọn đúng ảnh QA nếu không xác định được
tên file; bộ kiểm tra tiếp tục sau khi thấy ảnh chuẩn bị trong chính Himoto.
Chưa chứng nhận camera, ảnh HEIC/xoay, media cá nhân hoặc nghiệp vụ toàn app.

**00:18 ngày 02/11 — nền đạt 7/7 trên Samsung:**
`.backups/mobile-phone-smoke-20261102-reviewed/results.json`. Mở app, validation,
bàn phím/đăng nhập đúng scope, tìm kiếm/rỗng/chi tiết/Back, hủy/áp bộ lọc, giữ
phiên qua force-stop và đăng xuất qua relaunch đều đạt. **0 crash, 0 app ANR,
0 SystemUI ANR**, hash source trước/sau khớp và APK cài khớp ARM64. Đây là nền
trên một thiết bị Android 9 với fixture, không phải chứng nhận toàn app/release.

Hai lượt nhập liệu trước được giữ riêng: Autofill UI làm accessibility tree
không còn node Himoto; sau đó IME bên thứ ba vẫn hiện dù `mInputShown=false`.
Đã kiểm tra trực tiếp Back đóng đúng popup/bàn phím, không đổi cài đặt autofill
hay keyboard. QA nay chỉ đóng popup Autofill UI khi focused app chính là Himoto,
và nhận biết view IME thực qua hai cờ service/window trên Android 9. Offline
keyboard hiện **4 nhóm**. Lượt đạt bao gồm những xử lý này.

**Thu theo kỳ trên điện thoại đang chạy** exec **66742**,
`.backups/mobile-phone-collections-20261102/`, fixture mới **16441**. Đã lưu
snapshot kết quả emulator cũ, xác nhận các mã đã ack và phone smoke đăng xuất
trước reset. Chưa sửa source khi chạy. Android 9 không có shell
`keycombination`; QA thay trường bằng chuỗi Delete trên đúng EditText Himoto đã
focus và kiểm tra lại giá trị, không gửi shortcut ra cửa sổ khác.

**00:09 ngày 02/11:** đã cài thành công trên Samsung, APK cài khớp SHA
`6cd7ccfe840b96ed174d21a48a3fc386edac1ca6ad1f9afb1ffb264b001e8334`,
**96.058.863 byte**, chỉ ARM64. Build **9m57s**, 505 tasks, log
`.backups/mobile-phone-arm64-build-verified-20261101.log`; cài không thay app cũ,
log `.backups/mobile-phone-install-20261102.log`, metadata
`.backups/mobile-phone-arm64-debug-20261101.json`.

Metro Admin đã chuyển sang USB origin, metadata
`.backups/mobile-phone-metro-admin.json`. API fixture cũ vẫn giữ kết quả emulator
đã ack; chưa reset vì smoke không ghi nghiệp vụ. Lệnh gộp reset fixture/khởi
động Metro bị tự động chặn trước khi thực thi; đã dùng cách ít thay đổi hơn là
chỉ khởi động helper Metro riêng, giữ fixture nguyên trạng.

Phone smoke exec **66624**, `.backups/mobile-phone-smoke-20261102-connected/`,
đã dừng sau 2 nhóm do Autofill UI, không chứng nhận đủ lượt.
Lượt setup trước `.backups/mobile-phone-smoke-20261102/` dừng trước mở app do
netcat Samsung Android 9 đóng stdin trước khi đọc phản hồi. Probe giữ stdin mở
ngắn đã nhận HTTP 200 từ cả 8081/8091; bằng chứng
`.backups/mobile-phone-network-held-20261102.log`. Đã sửa chỉ probe vật lý, không
thử lại lệnh ghi. Đây không phải lỗi API/app hoặc bằng chứng crash/ANR bằng 0.

Người dùng đã kết nối Samsung **SM-N960N** qua USB và cấp quyền ADB ngày
01/11/2026. Kiểm tra trực tiếp trả về Android **9/API 28**, ABI
`arm64-v8a,armeabi-v7a,armeabi`. Tại lần kiểm tra trước build chưa có package
`vn.himoto.staff` trên điện thoại. Không ghi serial thiết bị vào tài liệu này.

APK emulator media chỉ chứa `x86_64`; không dùng bản đó cho điện thoại.
Manifest có min SDK 24, target SDK 36. Android 9 đáp ứng min SDK, nhưng phải
kiểm chứng chạy thực tế trước khi kết luận tương thích.

## Cấu hình build đã dùng

Helper `.backups/build-mobile-phone-arm64.ps1` build `:app:assembleDebug` với
`-PreactNativeArchitectures=arm64-v8a`, Gradle một worker, heap 1280 MiB, CMake
3.31.6 và cache/JDK/SDK trên ổ E. Không chỉnh generated native files hoặc
`.env.local`. Khi đạt sẽ sao chép và xác minh ABI/hash:

- `.backups/mobile-phone-arm64-debug-20261101.apk`
- `.backups/mobile-phone-arm64-debug-20261101.json`
- Log `.backups/mobile-phone-arm64-build-verified-20261101.log`, exec **53789**.

Lượt đầu `.backups/mobile-phone-arm64-build-20261101.log` thất bại do PowerShell
tách tham số có dấu chấm (`-Pandroid` thành property string), làm Expo báo
`libraryVariants` trên `String`. Helper đã chuyển sang mảng chuỗi tham số đúng;
chưa sửa dependency để né lỗi lệnh gọi. Lượt trước đó bị guard chặn vì emulator
chưa đóng xong; không build song song với emulator.

## Kết nối QA dự kiến

- Giữ nguyên bản x86_64 tại `.backups/mobile-media-debug-20261101.apk`.
- Kiểm tra lại package/chữ ký hiện có trước cài ARM64. Không tự gỡ app hoặc xóa
  dữ liệu điện thoại khi gặp chữ ký không khớp.
- Helper Admin đã chuẩn bị, chưa chạy:
  `.backups/start-mobile-phone-metro-admin.ps1`. Dùng `npx expo start --dev-client
  --host localhost --port 8081 --max-workers 1`, process-only
  `EXPO_PUBLIC_API_URL=http://127.0.0.1:8091`. Helper xác minh đúng Expo process
  trước khi thay listener; không thay biến môi trường hệ thống.
- ADB reverse 8081 và 8091 qua USB; fixture vẫn chỉ bind loopback máy tính.
  Khởi chạy dev-client với Metro 127.0.0.1 trên điện thoại. Trước đăng nhập, QA
  kiểm tra origin thực đã được Metro biên dịch và health `fixtureOnly:true`.
- Không dùng tài khoản thật, API production hoặc dữ liệu cá nhân để ghi thử.
  Không bypass PIN/màn khóa; người dùng mở khóa điện thoại khi cần.

## Hỗ trợ kiểm thử đã chuẩn bị

`scripts/check-mobile-native.py --physical --serial <USB_SERIAL>` là lựa chọn
rõ ràng, mặc định vẫn chỉ emulator. Bộ kiểm tra không nhận IP/shell làm serial.
`--collections` hỗ trợ ảnh QA tên duy nhất; các suite bill/renewal cũ dùng chọn
thumbnail đầu tiên bị chặn trên điện thoại cho tới khi có selector tương ứng.
Không bấm tự động vào ảnh cá nhân. Không chụp artifact ngoài app Himoto; crash
artifacts điện thoại chỉ giữ marker Himoto/SystemUI trong khoảng thời gian QA.

Đã thêm parser bàn phím cho Android 9 (`mInputShown`) bên cạnh Insets đời mới,
tránh Back nhầm khi bàn phím đã đóng. Probe trên Samsung trả về keyboard hidden;
không lưu nội dung bàn phím/input. Offline keyboard **3 nhóm**, diagnostics
**4 nhóm**, target guards **3 nhóm** đạt và đã đưa vào CI.

Phần dưới mô tả kế hoạch trước khi cài; trạng thái mới nhất ở đầu trang. Ưu tiên
smoke trên điện thoại: mở app, bàn phím/đăng nhập, điều hướng/lọc, giữ/xóa phiên;
sau đó thu theo kỳ và hai ca mất phản hồi. Camera, media, chữ lớn, trợ năng,
release performance và iOS vẫn cần kiểm chứng riêng.

Nguồn hướng dẫn: [Expo local builds/devices](https://docs.expo.dev/guides/local-app-development/).
