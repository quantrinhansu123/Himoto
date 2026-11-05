# Nhập tài khoản trên Samsung với Telex

Khoảng trống đã tái hiện trong native điều chuyển: Laban Key đổi qa-receiver
thành qa-rêciver khi gõ bằng các phím thật. Alias qa8 chỉ phục vụ kiểm nghiệp
vụ; không được coi là sửa UX đăng nhập.

## Thay đổi và kiểm chứng

- Expo58/RN0.88 đã đọc tài liệu trước sửa. inputMode=email + spellCheck=false
  tạo đúng native inputType0x80021, nhưng native IME run1 failed0 trước auth:
  Laban vẫn ghép dấu. Giữ artifact .backups/mobile-login-ime-native-20261102-run1/.
- Bản mới dùng keyboardType visible-password riêng Android cho tài khoản;
  iOS/web dùng email-address. Username vẫn hiển thị, autofill username, mật
  khẩu secure/current-password và việc gửi credentials không đổi. Không
  strip dấu, không tắt/đổi keyboard/autofill trên thiết bị.
- Types/lint đạt; Hermes Android/iOS và web export có bridge:
  mobile/.expo/native-login-ime-bridge-qa. Log:
  .backups/mobile-login-ime-bridge-{types,lint,export}-20261102.log.
- Browser điều chuyển source có bridge **10/10**, gồm đăng nhập/đổi actor:
  .backups/mobile-login-ime-bridge-transfer-ui-20261102/summary.json.
- Native run2 **failed0** trước auth: RN0.88 nhận0x80090 thiếu lớp text; Laban
  vẫn ghép dấu và keyboard hiển thị lỗi. Không biến verdict này thành pass.
- Đã thêm config plugin Expo withMainActivity, chỉ sửa inputType của nativeID
  himoto-account-input nếu variation visible-password/class0. Giữ nguyên text,
  selection, IME/autofill; ô mật khẩu không bị đụng. Setter ReactEditText đồng
  bộ staged flags để lần render sau không hoàn nguyên lỗi. Test plugin đạt
  idempotence/update/lifecycle/unknown-template; CNG prebuild đã áp dụng.
  ARM64 đã build/cài install-r (không clear data), cert khớp bản cũ, chỉ
  arm64-v8a và 15 launcher image payloads không đổi. APK:
  .backups/mobile-login-ime-arm64-debug-20261102.apk, SHA
  f28d864c55f6a1ba9eebb2ebb5e7bb4368bdb6b494140d74624c5b8bef6747c0.
- Native run3 failed0 trước UI do Metro/status không trả HTTP trên host và
  USB; startedEpoch null, crash/ANR unknown. Fixture8097 vẫn200. Đã restart
  đúng Himoto Expo CLI bằng quyền Admin cho phép, xác nhận lại host/USB.
- Native run4 **4/4 tập trung IME**, 0 crash/ANR/SystemUI ANR; **153 file
  source/QA khớp**. Tên qa-receiver giữ nguyên trước/sau Next, đăng nhập đúng
  actor8 không alias; username thường vẫn đăng nhập, ledger rỗng, phiên sống
  qua force-stop, logout được xác nhận qua relaunch. Default IME không đổi;
  toàn bộ stock/events/requests/delayed/receipt/tombstone trước/sau giống nhau.
  Verdict .backups/mobile-login-ime-native-20261102-run4/results.json,
  mode focused-login-ime. Generic finish logger in mode full trước wrapper;
  không dùng log đó để tuyên bố full app pass.
- Probe riêng xác nhận cờ **0x80091**, text class hợp lệ và tên gốc đúng:
  .backups/mobile-login-ime-native-input-flags-20261102/input-flags-after-fix.json,
  ảnh cùng thư mục. accountInputTypes trong result run4 rỗng do format dumpsys
  không khớp regex đầu, nên cờ được kiểm/ghi riêng, không bịa ghi nhận trong
  lượt gốc. Một probe bằng PowerShell encoding sai label trước đó đã thêm
  failure.png/XML vào thư mục run4 sau verdict; đây là lỗi probe host, giữ
  artifact gốc và không thay verdict hay dùng ảnh lỗi đó làm bằng chứng UI.
  App cuối vẫn logout; USB8091 trả8091, fixture17 receipt/1 tombstone giữ nguyên.

Samsung SM-N960N Android9 ARM64 dùng APK development mới với bridge và source
qua Metro. Không phải signed iOS hoặc full app acceptance. Native điều chuyển
9/9 trước đây thuộc source trước sửa login; native IME4/4 thuộc source153 file
trước API readonly thu hồi mới. Không gán các kết quả này cho source mới hơn.

API inputMode/keyboardType/autofill:
[React Native TextInput](https://reactnative.dev/docs/textinput),
[Expo SDK58](https://docs.expo.dev/versions/v58.0.0/).
