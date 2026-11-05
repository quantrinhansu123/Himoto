# CF-05d — bảo toàn ảnh khi rời form, picker và AppState, 03/11/2026

Trạng thái: source/offline gates và Samsung transitions run2 đạt4/4 liên tục,
03/11/2026,10:39:57 (+07), 258 file khớp,0crash/appANR/SystemUIANR mới. Nhánh
form/API regression run3 cùng source đạt4/4 riêng lúc10:51:01; không gộp hai
lượt thành chứng nhận full app.

## Thay đổi theo lỗi đã xác định

Confirm rời form trước đây chỉ flush input/work, nên ảnh RAM chưa được giữ do
import lỗi có thể bị dispose khi unmount. Nay `beforeLeave` đi qua cùng
`prepareTransition`: giữ ảnh → flush input → kiểm phiên/owner → mới cho rời.
Lỗi giữ ảnh đóng prompt, giữ form, hiện lỗi và không repeat navigation. Tác vụ
cũ không được điều hướng sau thay token hoặc unmount.

Hook ảnh dùng một Promise cho các lượt giữ queue đồng thời; ảnh được đưa vào
queue trước import, chỉ chuyển sang durable sau association và đọc lại thành
công. Cache chưa durable không bị cleanup view xóa khi unmount bất ngờ; ảnh
gốc gallery không bị tác động. Nếu association đã commit nhưng đọc lại lỗi,
retry xác minh original slot/dimensions/bytes/SHA ở cả cache và owned file,
nhận lại đúng association, không copy hoặc tạo photo thứ hai. Cache đã đổi
không được nhận thay cho ảnh gốc.

Picker/camera chỉ mở sau khi dữ liệu hiện tại đã qua preflight; lỗi giữ ảnh
cũ chặn mở selector tiếp. `useDraftWorkLifecycle` flush trên inactive/background
bằng helper đó, không reserve UUID hoặc gọi API nghiệp vụ. Field thay đổi trước
debounce vẫn được nhận diện; form rỗng chưa đụng không tạo work. Listener được
remove khi unmount và callback đến muộn không cập nhật màn hình đã đóng.

## Kiểm tra offline

- Transition3 nhóm thực thi helper + actual AppState/useDraftWrite hooks với
  lịch Promise kiểm soát: thứ tự photo/input; lỗi chặn proceed; owner/token
  change; empty form; background/inactive; retry và late navigation/unmount.
- Controller5 nhóm, thêm recovery khi association commit/readback lỗi: cache
  giữ tới khi recovery xác minh, chỉ một import và một photo descriptor.
- Native-files adapter mock4 nhóm, thêm recovery digest/cached bytes đổi bị
  từ chối. Đây không phải native acceptance.
- Bộ `npm run test:mobile`:33script exit0;
  `.backups/mobile-draft-work-transitions-core-20261103-run1.{json,log}`.
  Mobile TypeScript/lint exit0. Không thêm dependency, không đọc env file hoặc
  sửa generated native code; CI path/test command đã nối gate mới, chưa remoteCI.

## Native đã kiểm

`scripts/check-mobile-draft-work-transitions-native.py`, output
`.backups/mobile-draft-work-transitions-native-20261103-run2`, dùng backend
watch8101 đã xác minh fixtureOnly. QA route vẫn development/loopback/user7,
mode transition, work UUID/origin tổng hợp riêng; không liên kết queue nghiệp
vụ thật. Lỗi import được inject trước copy, không làm đầy bộ nhớ của điện thoại.

Dùng hook ảnh và leave thật: chọn đúng ảnh tổng hợp → import lỗi → confirm rời
bị chặn/cache còn → mở picker tiếp cũng bị chặn → cho phép retry/FileSystem thật
→ rời/reopen giữ đúng một ảnh. Sau đó sửa note tổng hợp, HOME tạo background
event, kill/reopen và kiểm marker FileSystem khớp event/note/photo SHA/bytes,
0request attempts. Kết thúc work QA qua UI, giữ checkpoint/ledger nghiệp vụ.
Không mở reader UIAutomator thứ hai hoặc sửa source trong lượt này.

Run1 dừng trước khi có check pass do harness chưa cuộn tới lỗi nằm dưới
picker controls, không phải thông báo bị mất. Giữ nguyên toàn bộ evidence
run1; settlement riêng
`.backups/mobile-draft-work-transitions-native-20261103-run1-settlement/terminal.json`
đã xác nhận lỗi sau cuộn, cache gốc còn đọc được, retry giữ ảnh rồi explicit
discard work QA qua UI. Không restart khi ảnh chưa giữ; 258 source file không
đổi, checkpoint watch và ledger nghiệp vụ không đổi. Sau settlement mới sửa
duy nhất bước tìm lỗi thành `reveal` và chạy run2 ở thư mục riêng. Không ghép
các bước settlement thành kết quả acceptance.

Run2 đạt4/4 liên tục: lỗi import trước copy chặn actual leave, cache còn;
preflight retry rồi chặn external picker; retry thành công giữ owned image
trước leave và reopen đúng một ảnh; real HOME/background marker + kill/reopen
khớp note `MemoBeforeHomeQA`, photo SHA/bytes và0request attempts. Work QA riêng
đã explicit discard qua UI; pending ledger rỗng, checkpoint watch không đổi
bất kỳ key nào, các checkpoint trước giữ SHA, USB8081/8091→8101 giữ nguyên.
Kết quả tại `results.json`, `source-provenance.json`, `runtime-diagnostics.json`
và6ảnh chụp trong thư mục run2. Không dùng run1/settlement bù check thiếu.

## Hồi quy form/API cùng source —10:51:01

`.backups/mobile-draft-work-native-20261103-run3/results.json` đạt4/4 liên tục,
258file khớp chính xác với transitions run2;0crash/appANR/SystemUIANR. Fixture
8128 riêng tại `.backups/mobile-draft-work-fixture-20261103-run3/state.json`:
1nháp/4ảnh/1tombstone/session0, work hoàn tất và ledger rỗng. Khôi phục ảnh/form
trước metadata, metadata lost/kill/Account originalID, GPLX lost/kill/Account
đúng photo, signed drop/tombstone/late409 rồi chỉ gửi phần còn lại. Giữ đúng
2xe303/304, NativeWorkDriverQA,2mũ,1.250.000đ, LocalMemoQA.4JPEG2200×1467,
81.183byte/ảnh, full decode và SHA/size khớp phiếu. Checkpoint trước giữ SHA,
USB8081→8081/8091→8101 được trả đúng; không có operational write.

Checkpoint form đã nghiệm thu lúc09:56 cũng giữ đúng generation18/digest gốc;
proof riêng `.backups/mobile-draft-work-transitions-prior-form-checkpoint-20261103.json`.

## Bundle, browser và máy theo dõi

Export3platform web/Android/iOS exit0 tại
`mobile/.expo/draft-work-transitions-qa-20261103`; log/proof
`.backups/mobile-draft-work-transitions-export-20261103.{log,json}`. Child
process đặt EXPO_NO_DOTENV=1/HTTPS placeholder QA rõ ràng, không đổi Metro
đang chạy. Browser hồi quy4/4 trên bundle này:
`.backups/mobile-draft-work-transitions-browser-20261103-run1/results.json`,
0pageErrors/unexpectedHosts, state riêng. Web vẫn memory preview; export iOS
không thay build/sign hoặc nghiệm thu iPhone thật.

Android trả lại10:52:36 ở hợp đồng QA cũ → Ảnh và hồ sơ nghiệp vụ; runtime
`.backups/mobile-android-watch-draft-work-transitions-20261103-run1/runtime.json`.
258file khớp cả hai native suites, ledger rỗng, USB8081/8091→8101 giữ theo dõi.
Giữ1khách/1nháp/0ảnh/0copy/0delete; chỉ thêm phiên đăng nhập QA (11phiên đang
giữ chủ ý), không ghi nghiệp vụ hoặc reset dataset. Phạm vi/history gốc của
4tài liệu chính giữ nguyên; proof
`.backups/mobile-draft-work-transitions-scope-review-20261103.json`.

## Giới hạn

Lỗi giả lập trước copy không chứng nhận actual disk-full, partial copy/manifest,
permission loss/cache eviction hoặc OS kill ngay khi local write chưa hoàn tất.
Không cam kết fsync/power-loss hay iOS background deadline từ Android. Journal
lỗi/corrupt/missing cần đường phục hồi và cleanup owned files tiếp; native
storage import sâu hơn, expiry/logout với queue chưa giữ, inline customer/docs,
copy/lifecycle/role/scope matrix, nhiều ảnh/performance và signed iPhone vẫn
bắt buộc. CF-05d và mục tiêu100%web chưa done.

Ngày03/11,11:08: native copy hook/stage qua durable controller đã đạt4/4 riêng,
bao phủ metadata → ảnh → copy lost/kill/Account và không ảnh → copy drop/kill/
cancel/late409/resume, original work/UUID/ID, ack→ledger và work finish.
[QA copy work](2026-11-03-mobile-draft-work-copy.md). Product source không đổi;
không dùng copy cũ trước work thay nhánh này. Tiếp theo chốt actor/origin/store/
auth recovery và storage repair/cleanup/performance trước mở rộng phần nhập
hợp đồng và các entry point web còn thiếu.
