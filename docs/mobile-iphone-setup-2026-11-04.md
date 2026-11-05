# Chuẩn bị iPhone kiểm Himoto — 04/11/2026

**HOÃN22:04+07 theo yêu cầu người dùng. iOS/iPhone không ảnh hưởng done
Android; không tiếp luồng thử/ký/đăng nhập.** CLI OAuth đã thành công cùng
tài khoản và Metro iPhone đã restart sau login, chưa native acceptance.
Giữ snapshot/checkpoint/log; phiên thử riêng được dừng, Samsung giữ nguyên.
Xem [scope Android mới](mobile-android-done-scope-2026-11-04.md).

## Trạng thái thực21:02+07 — Expo Go đã tới Metro, đang đăng nhập CLI qua GitHub

- Anh đã cho phép chạy admin. Bản nguồn riêng441file đã copy theo allowlist/
  kiểm SHA, không copy môi trường hoặc backend; fork checkpoint giữ gen80
  ban đầu từ SHA6BE8545C… và chỉ probe auth ở bản fork lên gen82.
- Expo Go SDK58 chạy admin tại `exp://192.168.100.104:8082`; proxy QA private
  `http://192.168.100.104:8133` → backend loopback8134. QR và manifest tại
  `.backups/mobile-iphone-go-20261104-run1/`, pointer
  `.backups/mobile-iphone-go-current.json`. PC Wi-Fi phải giữ IP này.
- iOS export source riêng đạt; manifest58.0.0/bundle14.128.024bytes đúng API
  riêng/login-workspace/control403 đạt. Không có ghi nghiệp vụ; chưa gọi là
  iPhone chạy được Himoto. App QA đăng nhập `qa`/`fixture-password`.
- Runtime: Metro8082 PID20452, supervisor admin7664, proxy8133 PID16880,
  backend8134 PID19280/handle69001. Samsung Metro8081 PID18372/QA8131 PID7944
  giữ nguyên, checkpoint gốc80/SHA exact. Không stop/reset/replay/cài lại.
- iPhone đã chạm Metro nhưng Expo Go báo account đang login trên điện thoại
  còn CLI chưa login. Người dùng dùng GitHub OAuth; không nhập password Expo
  giả định, không yêu cầu mật khẩu/OTP qua chat. Dùng CLI58 `login --browser`
  với `BROWSER=none` để giữ callback chờ; người dùng mở link OAuth trên chính
  PC rồi chọn Continue with GitHub. Không đọc/log/copy auth token store.
- Browser CLI hiện chờ ở handle13847. URL callback64870 là tạm thời, không
  dùng lại nếu tiến trình kết thúc. Kiểm kết quả bằng `expo whoami` rồi đọc
  manifest mới/cho người dùng Try again; chỉ restart Metro iPhone khi cần,
  xác minh owned PID và giữ backend/checkpoint. Không cần restart Samsung.
- Cửa sổ password login cũ PID15020 có thể đóng; helper
  `login-expo-admin.ps1` không redirect/transcribe credentials. Browser login
  dùng được cho GitHub; `login-result.json` cũ không chứng minh OAuth mới xong.
- Hai lệnh Metro ban đầu bị auto approval chặn; sau user cho phép admin đã
  chạy được bằng helper riêng. Python Windows alias đã đổi sang executable
  thực; bỏ cặp `--offline`+`--host` không được CLI58 chấp nhận. Log lỗi cũ
  giữ lại, ưu tiên runtime/health/verification mới. Mở browser tự động vẫn
  bị approval chặn, người dùng đã được đưa link để tự bấm.

Chưa cloud upload/Apple signing/staging/native acceptance. Go là bản source
snapshot, không tự nhận code root sau snapshot; cần đồng bộ có kiểm SHA nếu
muốn thử phần source mới hơn. Không dùng Expo Go thay bằng chứng bản ký.

Người dùng xác nhận có iPhone12ProMax/iOS18.7.8; Apple Developer Program
chưa có/chưa rõ, chưa xác nhận staging. Hỏi có thể phát triển/cài miễn phí
hay cần Mac/trả phí. Không coi đây là đã có tài khoản ký hoặc cài bản iOS.

## Ba cách thử trên iPhone

| Cách | Máy Mac | Phí và giới hạn |
| --- | --- | --- |
| Expo Go từ App Store | Không cần; Windows chạy Metro | App Go miễn phí; chạy phần tương thích SDK trong Go, không phải binary Himoto độc lập hoặc nghiệm thu đủ native config |
| Xcode + Apple Account/Personal Team | Cần Mac chạy Xcode | Không cần Apple Developer Program trả phí để thử máy cá nhân; profile hết hạn7ngày, cần build/cài lại; hạn chế capabilities |
| EAS cloud tạo bản iPhone ký/đưa TestFlight | Không cần Mac tại máy Windows này | Cần tài khoản Apple Developer Program của bên phát hành99USD/năm (giá vùng có thể khác); EAS có free plan với hạn mức riêng |

Expo Go App Store hiện58.0.5 có SDK58 và yêu cầu iOS>=16.4; iOS18.7.8 của
anh đáp ứng mức OS này. Vẫn cần kiểm runtime/module của app trước khi gọi
toàn bộ chức năng đạt trên Go. Chưa phát QR hoặc kết nối iPhone trong đợt này.

Bước miễn phí trước mắt: cài Expo Go trên iPhone, cho phép Mạng cục bộ khi
được hỏi, để cùng Wi-Fi với PC; chuẩn bị Metro/API thử truy cập được từ máy.
Không thay server/port/checkpoint Samsung đang dùng. TestFlight là bước sau
khi bên phát hành có tài khoản ký và đã upload beta; tester cài TestFlight
không tự phải mua membership Apple.

## Việc người dùng làm trước

1. Cài TestFlight từ App Store. Khi có lời mời và bản ký, mở lời mời để cài
   Himoto. Chưa có bản ký/lời mời của dự án để gửi ở mốc này.
2. Kiểm tra anh hoặc phía khách có Apple Developer Program trả phí chưa.
   Apple Account/Apple ID thông thường chưa phải membership này. Apple niêm
   yết99USD/năm, giá thanh toán tùy khu vực. Chưa cần mua dịch vụ khác.
3. Xem mẫu máy và phiên bản iOS tại Cài đặt → Cài đặt chung → Giới thiệu.
4. Đăng nhập Apple/Expo trực tiếp trên máy của mình khi cần; không gửi mật
   khẩu, OTP hoặc private key qua chat. Chọn tài khoản sở hữu app trước khi
   tạo bundle ID/certificate/App Store Connect record.

## Phần triển khai tiếp

- Repo có `mobile/app.json` bundle ID dự kiến `vn.himoto.staff`, Expo58,
  `expo-dev-client`; `mobile/eas.json` có development/preview internal và
  production. Đây là cấu hình source, chưa chứng minh quyền sở hữu bundle
  ID, liên kết Expo project, signing credentials hoặc IPA đã ký.
- EAS có thể build trên cloud; không buộc máy Windows này có Xcode để dùng
  luồng cloud. Build internal iOS cần thiết bị đã đăng ký UDID và provisioning
  tương ứng; TestFlight dùng App Store Connect rồi mời tester, không dùng
  danh sách UDID của ad hoc. Hai cách này có bước cài khác nhau.
- Chuẩn bị gói source chỉ gồm mobile/shared và phụ thuộc pure thực sự cần;
  xác minh manifest trước upload. Không upload cả worktree hiện tại, backend,
  backups, dữ liệu QA, khóa ký hoặc bất kỳ `.env.local` nào. Không đọc/copy
  file môi trường để đóng gói. Expo luôn `EXPO_NO_DOTENV=1`.
- Chuẩn bị backend+DB thử riêng và API HTTPS truy cập được từ iPhone. API
  `127.0.0.1:8091` trong Samsung là adb reverse của Android, không thể chép
  nguyên sang iPhone. Không lấy production để ghi thử thay staging.
- Chỉ build/upload/cấp quyền external sau khi cấu hình đích/tài khoản/gói
  source đã rõ. Chưa chạy EAS upload, tạo certificate, đăng ký thiết bị,
  submit App Store hoặc gửi lời mời trong đợt này.

## Nghiệm thu iPhone

Kiểm bản ký thật: đăng nhập/quyền/cơ sở, bàn phím và biểu mẫu, camera/picker/
ảnh/video180s, file/clipboard/in/PDF/QR, kill-background/mất mạng/recovery/
UUID, các luồng tiền-kho-phiếu và logout/đổi tài khoản. Đối chiếu cùng DB/BE
staging qua đủ vai trò/nhiều phiên; ghi bằng chứng và phiên bản binary.
Export iOS/Hermes hoặc duyệt Safari chỉ là kiểm source/giao diện, chưa thay
nghiệm thu native đã ký.

Nguồn chính thức đã kiểm04/11:

- [Apple TestFlight](https://developer.apple.com/testflight/).
- [Apple Developer Program/enrollment](https://developer.apple.com/programs/enroll/).
- [Expo tạo build](https://docs.expo.dev/build/setup/).
- [Expo internal distribution/thiết bị](https://docs.expo.dev/build/internal-distribution/).
- [Expo Go trên App Store](https://apps.apple.com/app/expo-go/id982107779).
- [Apple Personal Team và thời hạn7ngày](https://developer.apple.com/help/account/basics/about-your-developer-account).
- [Expo development build/local/cloud](https://docs.expo.dev/develop/development-builds/introduction/).
