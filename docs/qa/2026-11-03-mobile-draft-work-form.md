# CF-05d — nối khôi phục vào form và Account, 03/11/2026

Trạng thái: đã nối và bật source native; Samsung run2 đạt4/4 liên tục cho
luồng form/ảnh/Account (09:56 ngày03/11). Đây là nghiệm thu tập trung có giới hạn
bên dưới; CF-05d và mục tiêu100%web vẫn mở, không dùng lượt này thay iPhone,
role/scope/copy/lifecycle/storage-error/performance hoặc staging acceptance.

## Source đã nối

- `draft-work-controller.ts` điều phối một head/owner/queue; input nhỏ được
  coalesce450ms với trạng thái chưa lưu/đã giữ trên thiết bị, flush trước intent,
  bước và rời form. Chưa thay việc xác nhận server bằng kết quả autosave.
- `DraftWorkGate` kiểm actor/origin trước hydrate, cho chọn bản cũ hoặc soạn
  mới, giữ scope gốc, chặn bỏ bản còn intent chưa rõ. `DraftEditor` dùng input/
  trang/ảnh từ đúng work UUID; empty untouched form chưa tạo local work item.
- `useContractPhotos` copy ảnh đã chuẩn bị vào file owned, await commit slot/
  bind/OCR/manual/remove trước success; restore đúng ảnh và savedTo từ phiếu
  của từng photo ID. Ảnh chưa giữ thành công không được dùng để lưu metadata.
- `useDraftWrite`, `ContractPhotoSave`, customer-copy hook dùng planned key
  bền vững trước reserve/HTTP, giữ full input/review/phiếu gốc. Metadata receipt
  chỉ bind original contract ID; photo receipt mark đúng ảnh. Order vẫn theo
  shared helper đã nghiệm thu (plate/GPLX/transaction trước copy).
- Account có danh sách bản đang soạn riêng và route `/draft-work/[id]`.
  Pending resolver mở đúng work, giữ UUID cho form/phiếu gốc acknowledge;
  cancelled phải ghi kết quả vào work trước complete ledger.
- Session startup cài work guard cho cả hai reserve variants và complete của
  pending ledger. Writer/editor generic khác không được lấy mã/action của work
  chưa rõ hoặc xóa UUID trước khi file receipt/ack đã đọc lại được. Create
  vẫn tách destination scope; resource intents giữ đúng actor/ID khi đổi scope.
- Resume hydrate chặn hiệu ứng autosave ghi đè input đã giữ; token/session cũ
  không được gửi HTTP tiếp. Controller đọc lại head sau lỗi settlement để giữ
  originalID/proof nếu file đã commit nhưng complete SecureStore thất bại.

## Bằng chứng trước native

- `check-mobile-draft-work-controller.cjs`:4 nhóm thực thi controller/journal và
  actual work-link/guard logic trên fixture local. Có coalesce/flush/no-empty,
  private image association trước metadata, process-factory restart/key cũ,
  lỗi ledger removal sau file ack, nhận diện exact photo, cancel/discard/finish,
  ordered concurrent edits, actor khác, generic guard/key/action và storage lỗi.
- `check-mobile-pending-scope.cjs`:12 nhóm; thêm bằng chứng callback work guard
  chạy trước reserve ghi key và trước complete xóa key, lỗi guard giữ ledger.
- `npm run test:mobile`:32 script exit0;
  `.backups/mobile-contract-work-form-core-20261103-run1.{json,log}`.
  Lúc chạy bộ này feature flag vẫn off; native chạy riêng sau khi bật.
- Mobile TypeScript/lint exit0 sau nối source. Route declarations được sinh lại
  bằng chính `setupTypedRoutes` của Expo58 CLI đã cài, không sửa generated
  native code, không thêm package, không đọc env file.

## Lượt Samsung đã đạt sau khi giữ riêng run1 lỗi harness

`scripts/check-mobile-draft-work-native.py`, fixture8126/checkpoint riêng
`.backups/mobile-draft-work-fixture-20261103-run1/state.json`, output
`.backups/mobile-draft-work-native-20261103-run1`. Case chọn signed trước GPLX,
kill trước metadata, mất phản hồi metadata/kill → Account → original work,
mất phản hồi GPLX/kill → Account → đúng photo, drop transaction/tombstone/
late409, gửi phần còn lại, exact money/xe/driver/note và terminal ledger/work.
Không reset fixture cũ, không ghi dữ liệu vận hành hoặc gọi provider ảnh thật.
Không chạy reader UIAutomator thứ hai hoặc sửa source trong lượt native.

## Giới hạn vẫn mở

Chưa nghiệm thu copy-customer/lifecycle đầy đủ sau nối controller, store/actor/
origin change trên UI thật, mọi vai trò và đường phục hồi khi draft quyền bị
thu hồi nhưng quyền record-photo vẫn còn. Storage full/corrupt generation/mất
ảnh hiện giữ state và chặn ghi, chưa có UI sửa lỗi/generation recovery/cleanup
owned files hoàn chỉnh. Cache import lỗi giữ ảnh đang chọn trong RAM và chặn
metadata; cần fault acceptance đầy đủ khi unmount/logout/storage không ghi
được, không được suy zero-loss từ happy path. Chưa đo hiệu năng autosave với
nhiều generation/ảnh; journal vẫn quét chain/hash ảnh khi load. Signed iPhone,
staging/nhiều phiên/network matrix và release/vận hành còn thiếu.

## Lượt1 lỗi harness và kết thúc đúng bản gốc

Run1 dừng trước metadata vì bộ gõ tiếng Việt đổi chuỗi ghi chú tổng hợp
DurableWorkQA thành chuỗi có dấu nhìn thấy trong failure.png. Readback assertion
không khớp; không suy lỗi data loss của form từ việc đó.0draft/0photo HTTP writes,
1plateOCR. Giữ nguyên results.json/failure.png/source manifest.

Đã kết thúc qua UI trên đúng fixture8126: mở gate bản đang soạn90003 → xác nhận
bỏ bản trên thiết bị; không xóa owned files/history hoặc reset checkpoint.
`.backups/mobile-draft-work-native-20261103-run1-settlement/terminal.json`:
0draft/0photo/session0, ledger/openWork rỗng,253 file không đổi. Chỉ sau đó đổi
synthetic note thành LocalMemoQA và thêm SHA-preserve checkpoint run1 vào harness.

Run2 sau đó đạt4/4 liên tục trên fixture8127/checkpoint
`.backups/mobile-draft-work-fixture-20261103-run2/state.json`, output
`.backups/mobile-draft-work-native-20261103-run2`; hoàn tất09:56:19. Chỉ harness đổi,
product source giữ nguyên. Không gộp run1 hoặc lượt settlement thành pass.

## Kết quả native run2 —09:56:19 ngày03/11

`.backups/mobile-draft-work-native-20261103-run2/results.json`:4/4,
formIntegrationEnabled:true;253 file source khớp trước/sau,0 app crash/ANR/
SystemUI ANR. Source provenance, APK/bundle SHA và diagnostics lưu cùng run.
Lượt liên tục chọn ký trướcGPLX, khôi phục trước metadata sau kill, mất phản
hồi metadata/kill/Account mở đúng work và phiếu gốc, mất phản hồiGPLX/kill/
Account mark đúng ảnh, drop signed/tombstone/late409 rồi chỉ gửi ảnh còn lại.

Cuối1draft/4ảnh/1tombstone/session0, local openWork và pending ledger rỗng;
đúng2xe303/304, driver NativeWorkDriverQA,2mũ,1.250.000đ và note LocalMemoQA.
Thứ tự phiếu: plate303 → GPLX → GPLX-extra2 → signed. Mỗi JPEG native đầy đủ
2200×1467/80.493byte từ ảnh4200×2800; SHA/size khớp phiếu và codec decode đủ.
Checkpoint QA cũ, kể cả run1 lỗi đã settle, không đổi; USB trả đúng8081→8081,
8091→8101. Không có write production, reset queue hoặc xóa bằng chứng.

Android đã mở lại09:58 tại HĐ QA cũ → Ảnh và hồ sơ nghiệp vụ; runtime
`.backups/mobile-android-watch-draft-work-form-20261103-run1/runtime.json`:
253 file khớp, ledger rỗng, giữ1khách/1nháp/0ảnh/0copy/0delete cũ; chỉ sessionSeq/
sessions đổi (10 phiên QA đang giữ chủ ý). Đây là QA, chưa backend vận hành.

Inline customer editor/document queue cũng cần work và fault/lifecycle riêng;
không suy form khách mới hoặc customer-document OCR đã durable từ lượt contract
photos này. Các giới hạn ở trên vẫn là việc cần làm, không phải waiver.

## Bundle và hồi quy web sau bật native integration

Export web/Android/iOS exit0 ở `mobile/.expo/draft-work-form-qa-20261103`;
log `.backups/mobile-draft-work-form-export-20261103.log`. Đặt rõ
EXPO_NO_DOTENV=1 và HTTPS placeholder QA, không đổi Metro/URL máy thật. Chưa
build/sign/release hoặc nghiệm thu iPhone. Browser regression4/4 tại
`.backups/mobile-draft-work-form-browser-20261103-run1/results.json`,0pageErrors/
unexpectedHosts. Đây là hồi quy luồng ảnh cũ với memory preview; web không bật
native filesystem persistence. Source253 file vẫn khớp accepted native sau
export/browser; workflow YAML parse đạt, remoteCI chưa chạy.

## Review09:56 — nhánh đã sửa trong lượt transitions sau đó

Các phát hiện bên dưới mô tả source tại mốc09:56. Đã sửa leave/pre-picker/
AppState và recovery association commit/readback lỗi; Samsung transitions
run2 đạt4/4 riêng trên258 file,10:39:57,0crash/ANR. [QA và giới hạn mới](2026-11-03-mobile-draft-work-transitions.md).
Hồi quy form/API trên source mới run3 đạt4/4 riêng lúc10:51:01;258file khớp
transitions run2,0crash/appANR/SystemUIANR. Fixture8128 riêng kết thúc
1nháp/4ảnh/1tombstone/session0, work+ledger rỗng; khôi phục metadata/GPLX
original UUID và ID, drop/tombstone/late409, đúng xe/driver/mũ/tiền/LocalMemoQA.
4JPEG native2200×1467/81.183byte mỗi ảnh, full decode/SHA/size khớp phiếu.
Output `.backups/mobile-draft-work-native-20261103-run3`; checkpoint cũ giữ SHA,
USB trả8091→8101. Không gộp các lượt hoặc dùng run2 cũ thay kết quả source mới.
Export3platform và browser hồi quy4/4 source mới đạt; Android trả lại10:52:36
tại hợp đồng QA cũ → ảnh/hồ sơ,258file khớp, ledger rỗng. Chi tiết runtime/bundle
và giới hạn ở QA transitions, không lấy web memory preview chứng nhận filesystem.

Trước mở rộng copy/lifecycle: cần flush khi AppState rời active và trước mở
picker, và giữ owner/input reader gốc trong queued writes. Trạng thái hiện tại
flush khi import ảnh trả về, chuyển bước, gửi hoặc xác nhận rời form; không
suy timer450ms thành guarantee khi JS bị pause/kill trước flush.

Có nhánh cần sửa: import durable ảnh lỗi giữ ảnh cache trong RAM, metadata
submit có ensurePersistent, nhưng confirm rời form hiện chỉ flush input/work,
chưa ensurePersistent toàn bộ ảnh RAM. Nếu rời ở nhánh lỗi này, unmount có thể
dispose cache ảnh chưa được association; bản gốc gallery vẫn giữ, nhưng queue
chưa được bảo đảm phục hồi. Phải chặn rời/hiện lỗi nếu ảnh chưa giữ được, rồi
native fault-test disk-full/partial-import/logout trước chứng nhận CF-05d.
Mốc4/4 bên trên không thực thi nhánh lỗi này hoặc AppState/picker interruption.
