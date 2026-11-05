# CF-05d — copy giấy tờ qua durable draft work,03/11/2026

Trạng thái: Samsung run1 đạt4/4 liên tục lúc11:08:51 (+07),259 file khớp
trước/sau,0crash/appANR/SystemUIANR. Product source giữ nguyên sau lượt
transitions/form regression10:39/10:51; chỉ thêm native suite/provenance và CI
path. Lượt copy cũ trước khi nối work controller không thay bằng chứng mới.

## Phạm vi kiểm mới

`scripts/check-mobile-draft-work-copy-native.py` dùng Samsung thật, một reader
UIAutomator, backend loopback8129 fixtureOnly mới. Chọn đúng ảnh QA tổng hợp
qua MediaStore/timestamp, không chọn thumbnail cá nhân. Manifest bao gồm script
mới và source trợ giúp; giữ source/fixture scripts cố định trong lượt chạy.

1. Form gắn khách và note tổng hợp → giữ owned photo → lưu metadata → upload
   ảnh ký → tự copy4giấy tờ. Mất phản hồi copy sau commit; vẫn1hợp đồng/1ảnh/
   1copy và event copy sau ảnh, đúng customer/contract.
2. Tắt tiến trình → Account resolve copy → mở original work → khôi phục đúng
   note và saved photo → mở đúng phiếu copy gốc → ack/finish. Không tạo thêm
   metadata/photo/copy, work và ledger rỗng.
3. Hợp đồng thứ hai không chọn ảnh → metadata rồi copy trực tiếp; drop trước
   commit → tắt app → Account settle cancellation vào work trước xóa key →
   gửi muộn trả409, không thêm ảnh.
4. Mở work thứ hai theo số giấy gốc, giữ customer/note và originalID; retry chỉ
   copy → finish. Cuối2nháp/1ảnh chọn/2copy/8bản giấy tờ/1tombstone/session0,
   work/ledger rỗng; slot và bytes bản sao khớp nguồn, JPEG native full decode/
   SHA/size, các checkpoint QA cũ giữ SHA, USB trở về watch8101.

Evidence riêng tại
`.backups/mobile-draft-work-copy-native-20261103-run1`; checkpoint
`.backups/mobile-draft-work-copy-fixture-20261103-run1/state.json`.
Không reset queue/fixture hoặc ghi dữ liệu vận hành.

## Kết quả native đã xác minh

- `results.json`4/4 và `source-provenance.json`:259file khớp, bundle/APK SHA.
- Nhánh có ảnh: mất phản hồi copy sau commit, kill/Account mở đúng work/ID2001,
  giữ LocalMemoQA và ảnh đã savedTo; hiển thị phiếu gốc copied4/present0, ack
  xong work+ledger rỗng, vẫn1metadata/1ảnh/1copy.
- Nhánh không ảnh: ID2002 đi thẳng copy, drop/kill/Account cancellation được
  ghi vào work trước xóa key; late409. Resume work96032 chỉ retry copy vào
  ID2002, giữ customer1/note gốc và không tạo thêm metadata/ảnh.
- Cuối2nháp/1ảnh/2copy/8bản giấy tờ/1tombstone/session0; đúng4slot mỗi hợp đồng,
  bytes bản sao khớp từng nguồn. Native JPEG2200×1467/81.073byte từ4200×2800,
  full decode, SHA/size khớp phiếu trong `native-codec-proof.json`.
- `runtime-diagnostics.json` không có lỗi thu thập hoặc crash/ANR mới;6ảnh
  chụp UI.24checkpoint QA cũ giữ SHA so với `preserved-checkpoints-before.json`.
  USB8081→8081/8091→8101 được trả đúng trong `usb-route.json`.

Workflow YAML parse đạt; script mới được đưa vào native source provenance và
CI change-paths, chưa chạy remoteCI. Mobile TypeScript/lint chạy sau native đều
exit0 với EXPO_NO_DOTENV=1; logs/proof
`.backups/mobile-draft-work-copy-{typecheck,lint,types-lint}-20261103.{log,json}`.
Không thêm dependency hoặc đổi domain/API/migration.194file product source
khớp nguyên bản đã đạt transitions/form/browser/export trước đó, proof
`.backups/mobile-draft-work-copy-source-review-20261103.json`. Không export/
rerun core/browser khi product không đổi; không suy thêm số lượt test.

Android trả lại11:10:48 ở hợp đồng QA cũ → Ảnh và hồ sơ nghiệp vụ; runtime
`.backups/mobile-android-watch-draft-work-copy-20261103-run1/runtime.json`.
259file khớp accepted copy, ledger rỗng, USB8081→8081/8091→8101 giữ theo dõi.
Giữ1khách/1nháp/0ảnh/0copy/0delete; chỉ thêm phiên QA (12phiên giữ chủ ý), không
ghi nghiệp vụ hoặc reset dataset. Đây vẫn fixture QA, chưa backend vận hành.

## Giới hạn còn mở

Đây là hai nhánh copy sau metadata, chưa full actor/origin/store/auth recovery,
revoked grants/expiry/logout, storage-full/partial journal repair/cleanup,
hiệu năng nhiều ảnh/generation, inline customer/document queue, full staging/
multiple-session matrix hoặc signed iPhone. Giữ mục tiêu100%web và CF-05d
đang triển khai. Không gộp các lượt cũ hoặc checklist riêng thành full app pass.
