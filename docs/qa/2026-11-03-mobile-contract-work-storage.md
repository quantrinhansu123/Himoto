# CF-05d — lớp lưu trữ bản đang soạn, 03/11/2026

Trạng thái: có implementation lớp lưu trữ và kiểm tra offline. **Chưa nối vào
form hoặc Account**, chưa nghiệm thu tính năng khôi phục hoàn chỉnh. Không
được dùng kết quả này để đóng CF-05d hoặc đánh dấu đủ100%web.

## Thay đổi

- `shared/mobile-contract-work.ts`: schema có version, origin/actor/scope gốc,
  work UUID, đầy đủ input/trang/xe/driver/tiền, photo UUID/slot/owned file ID/
  SHA/bytes/kích thước, metadata/photo/copy attempts và phiếu gốc. Không lưu
  token/session, URI gallery, URL storage hoặc cấu hình server. Chỉ metadata
  receipt bind contractID; photo receipt bind đúng photo/target/slot/SHA/bytes.
  Các trường ngoài projection bị từ chối, kể cả token chèn trong review/phiếu.
- `mobile/src/lib/contract-work-journal.ts`: generation riêng có parent/sequence,
  state checksum và seal; không overwrite/xóa bản hợp lệ cuối. Đọc lại chain,
  seal, schema và ảnh trước khi trả success. Ghi dở, fork, sai checksum, ảnh
  thiếu/đổi hoặc editor head cũ chặn thao tác; không lặng lẽ trả queue rỗng/cũ.
  Mỗi manifest giới hạn4MiB UTF8; vượt giới hạn báo lỗi, không cắt bớt dữ liệu.
- `contract-work-files.ts`: adapter Expo58 FileSystem hiện có; thư mục private
  `Paths.document/himoto-contract-work-v1/<hash-origin-actor>/...`. Hash header
  trước khi list payload, manifest chỉ dùng file UUID tương đối. Copy/ghi/hash
  đều await; chỉ nhận JPEG đã chuẩn bị trong app cache, kiểm SHA/bytes/signature.
  Durable photo không bị view dispose xóa; không chạm ảnh gốc gallery. Chưa có
  cleanup file đã kết thúc hoặc đường phục hồi generation lỗi.
- `contract-work-intent.ts`: planned input/review/UUID phải đọc lại được trước
  reserve; khác mã/action chặn, UUID đã tồn tại yêu cầu đối chiếu kết quả trước
  khi gửi lại. Settlement lưu receipt và acknowledgement trước complete ledger.
  Adapter/helper chưa được import từ các writer/form nghiệp vụ hiện tại.
- Màn hình `contract-work-qa` chỉ chạy development với loopback API/user7 và
  UUID run hợp lệ; không có link trong điều hướng sản phẩm. Dữ liệu tổng hợp
  dùng origin QA riêng mỗi run, không gọi API ghi hoặc pending ledger thật.
  Release execution/actor khác/URL khác bị chặn. Đây là công cụ kiểm FileSystem,
  không phải giao diện khôi phục sản phẩm hoặc cách nối backend vận hành.

## Bằng chứng offline

- `check-mobile-contract-work.cjs`:7 nhóm. Có57 điểm fault injection qua
  read/mkdir/write/hash/seal/readback và264 điểm qua receipt/ack/ledger; giữ
  byte của generation cũ, không xóa UUID sớm, không đổi original contract ID.
  Thử scope/actor/origin, input chưa hoàn tất, thứ tự ảnh web, phiếu sai,
  cancelled retry/discard, metadata/copy linkage, stale editor và fork.
- `check-mobile-contract-work-native-files.cjs`:4 nhóm adapter SDK mocked;
  copy await, owned paths/digest, từ chối gallery/content/network/escaping URI,
  đổi bytes/nonJPEG, actor khác không đọc payload, dispose không xóa durable file.
  Đây không phải bằng chứng chạy native.
- `check-mobile-contract-work-disk.cjs`:3 nhóm trên file thật và tiến trình Node
  độc lập. File input tiếng Việt/money/driver/page/planned UUID và original
  metadata ID/ack khôi phục đúng; generation mới bị ghi dở chặn cold process,
  SHA bản sealed trước không đổi. Kết quả verified:
  `.backups/mobile-contract-work-disk-61761113-3075-4d97-91c2-8aebee241e01/results.json`.
  Không thực thi Expo/native adapter.
- `npm run test:mobile`:31 script exit0;
  `.backups/mobile-contract-work-core-suite-verified2-20261103.log` và
  `mobile-contract-work-core-suite-audit-20261103.json`. GPS dùng format
  checks/results, được audit riêng; stderr có2 thông báo lỗi tổng hợp chủ ý
  (thiếu schema/queue). Lượt wrapper trước parse sai GPS hoặc command quoting
  thất bại được giữ riêng, không cộng vào bằng chứng pass.
- Mobile TypeScript/lint exit0 sau khi sửa rule refs của màn hình QA. Không
  đọc env file, không thêm native dependency hoặc sửa generated native code.
  CI paths/test:mobile đã nối3 offline gates; remote CI chưa chạy.

## Native và phần còn lại

Samsung SM-N960N/Android9/API28 đạt4/4 liên tục, hoàn tất09:12:47 ngày03/11,
`.backups/mobile-contract-work-native-20261103-run1/results.json`.246 file
source khớp trước/sau; APK checksum/bundle SHA/provenance và runtime diagnostics
lưu cùng run,0crash/ANR/SystemUI ANR. FileSystem58 thật thực hiện create/write/
copy/digest/read, giữ full form tiếng Việt/driver/money/step/ảnh và mã metadata
gốc qua process kill; lần kill tiếp theo giữ originalID92001/ack trước fake
ledger completion. Generation ghi dở làm cold load bị chặn, sealed SHA cũ
không đổi. Sau test pending ledger thật rỗng và checkpoint backend watch
không đổi bất kỳ key nào; không có API ghi. File ghi dở tổng hợp được giữ chủ ý
trong scope QA riêng có UUID host, không reset hoặc xóa bằng chứng.

`nativeFileAdapterExecuted:true` chỉ chứng nhận adapter cùng dữ liệu QA tổng
hợp; `formIntegrationEnabled:false`. Đây không phải nghiệm thu DraftEditor/
Account/picker/OCR/business HTTP và không thay các ca full flow hoặc iPhone.

Phải nối và kiểm đầy đủ autosave/flush/resume/discard, ảnh picker/camera/OCR,
metadata/photo/copy planned intent, Account ack, logout/đổi actor/scope/origin,
kill ở từng ranh giới và cleanup owned files. Cần UI xử lý storage full/corrupt/
missing generation có thể phục hồi, không để người dùng mắc kẹt chỉ với lỗi.
Hiện mọi load quét chain/ảnh; chưa tối ưu hoặc đo hiệu năng với autosave nhiều
generation/ảnh nên không bật từng keystroke. Chưa có fsync/power-loss guarantee.
Signed iPhone, toàn bộ staging/roles/nhiều phiên/mạng/release/vận hành còn thiếu.

## Kiểm tra bản xuất và theo dõi Android

Export cả web/Android/iOS exit0 tại
`mobile/.expo/contract-work-storage-qa-20261103`; log
`.backups/mobile-contract-work-storage-export-20261103.log`. Đặt rõ
EXPO_NO_DOTENV=1 và API placeholder QA; không đổi Metro8081 đang kết nối máy.
Đây là kiểm tra bundle, chưa build/sign/release hoặc chứng nhận iPhone.
Workflow YAML parse đạt; remoteCI chưa chạy. Core7 được chạy lại riêng sau
siết fault injection để mỗi scenario đều tạo fault:57+264 lượt, final log
`.backups/mobile-contract-work-core-final-20261103.log`; source native không
thay đổi sau acceptance,246 file khớp. Bộ31script trước đó đã exit0.

Android đã trả về09:13 hợp đồng QA cũ → Ảnh và hồ sơ nghiệp vụ; runtime
`.backups/mobile-android-watch-work-storage-20261103-run1/runtime.json`.
246 file khớp, ledger rỗng, USB8081→8081/8091→8101;1khách/1nháp/0ảnh/0copy/
0delete,9 phiên QA giữ nguyên chủ ý. SHA checkpoint không đổi qua native test
và mở watch, không seed/reset hoặc ghi backend. Form recovery chưa tích hợp.

