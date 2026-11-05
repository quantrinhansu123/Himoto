# Giấy tờ khách và OCR trong hợp đồng — 03/11/2026

## Phạm vi đang triển khai

Form giấy tờ → thông tin khách/địa chỉ nhập tay → GPLX → quản lý/người thân.
Chọn/chụp một ảnh hoặc chọn nhiều ảnh, chuẩn bị JPEG bằng codec native đã có;
batch OCR đọc tối đa3 ảnh trong3 MB, toàn bộ ảnh được giữ chờ lưu. Ảnh thêm
cùng mục dùng supplemental slot. AI trả muộn không ghi đè phần sửa tay trong
lúc đọc; bỏ qua AI hủy request và bỏ kết quả đến muộn. Dùng cùng quy tắc merge
web, không điền địa chỉ từ giấy tờ; kết quả/UUID/kind/expectedIdentity được bind.

API OCR bearer theo customers.write như web; key/provider luôn ở server. Chưa
chạy provider thật hoặc xác nhận chất lượng nhận dạng trên giấy tờ thật.

Mở rộng record-media hiện có cho customers/customer/same ID, ba nhóm
id_front/id_back/driver_license và ảnh bổ sung. API dùng scopedConnect/RLS,
readonly gallery; canWrite phản ánh scope thật. Phiếu append-only trên cùng
bảng management_mobile_record_media; migration riêng
`docs/sql/2026-11-03-mobile-customer-documents.sql` chưa áp DB thật.

Sau tạo/sửa hoặc chọn khách trùng có ảnh: giữ form/ảnh và hồ sơ đã chọn, mở
bước rà soát đúng ID/tên/cơ sở, xem ảnh cũ trước thay. Chỉ tiếp tục hợp đồng sau
lưu ảnh hoặc xác nhận bỏ phần ảnh chưa lưu. Tải từng ảnh có UUID/receipt riêng;
lỗi giữ ảnh, khóa gửi mới đến khi đối chiếu; đã commit thì xem phiếu gốc và
chỉ gửi phần còn lại. Mã hủy chặn request đến muộn. Chọn hồ sơ khác cơ sở chỉ
được xem; không bật upload vượt quyền. Account/ledger có media.customer recovery.

## Bằng chứng trước native

- Web/mobile types và mobile lint exit0; backend lint0 lỗi/1 warning cũ ở
  estimated-sales.ts. Không thay file đó.
- Mobile24 script đạt: `.backups/mobile-customer-documents-unit-20261103.log`.
- Customer documents API/client7 nhóm với PGlite/scopedConnect/RLS thật:
  `.backups/mobile-customer-documents-sql-20261103.json`; cùng4 nhóm pure guard/
  OCR merge đối chiếu web chạy không DB. Không gọi provider/DB vận hành.
- SQL hồi quy124 nhóm: `.backups/mobile-customer-documents-sql-regression-20261103.log`.
- Durable journal3 nhóm: lost/restart/replay/exact bytes, tombstone/late409,
  foreign deny; `scripts/check-mobile-customer-documents-fixture.py`. Contract
  model4 và duplicate model4 vẫn đạt, mỗi lần checkpoint UUID mới.
- Browser source cuối giấy tờ8/8, khách trùng7/7, nền/khách35/35:
  `.backups/mobile-customer-documents-source-final-documents-20261103`,
  `.backups/mobile-customer-documents-source-final-duplicates-20261103`,
  `.backups/mobile-customer-documents-source-final-general-20261103`.
  Hợp đồng15/15 ở `.backups/mobile-customer-documents-final-draft-20261103`.
- Media cũ source cuối8/8:
  `.backups/mobile-customer-documents-media-final-run2-20261103/results.json`.
  Run trước failed3 do harness đọc counter ngay sau màn pending trước khi PUT
  trả về; sửa harness chờ phản hồi PUT, product không đổi cho lỗi này.
- Export iOS/Android Hermes + web terminal tại
  `mobile/.expo/customer-documents-final-qa-20261103`; chưa signed iPhone.
- CI đã nối unit/SQL/journal/browser mới, YAML parse đạt; chưa remote CI run.

## Native source cuối — terminal01:42 ngày03/11

Samsung SM-N960N/API28, package có sẵn `vn.himoto.staff`: **3/3 tập trung** trong
một lượt liên tục;199 file source/QA khớp,0 crash/ANR/SystemUI ANR mới.
`.backups/mobile-customer-documents-native-20261103-run4/results.json`.
Fixture8107/checkpoint `.backups/mobile-customer-documents-fixture-20261103-run4/state.json`:
1 khách tạo/2 ảnh/2 nháp/2 OCR QA; đúng ID/xe303/số hợp đồng/1.250.000 VND.
Lost ảnh commit mở đúng phiếu gốc; drop được tombstone, late409, không tải lặp;
OCR lỗi giữ ảnh/nhập tay và dùng đúng khách trùng501. Ledger rỗng/logout,
activeSessions0. USB restore chính xác8081→8081,8091→8101. Checkpoint watch8101
và transfer/recovery/media cũ giữ SHA trong lượt; không reset/replay dataset.

Ảnh native synthetic4200×2800 được downsample/codec thật2200×1467,80474 bytes,
full JPEG decode/hash khớp phiếu. `native-jpeg-proof.json` và
`exact-picker-identity.json` chứng minh filename QA/MediaStore/hash tệp phone/
unique timestamp theo giờ Android. Không chụp hoặc tự chọn ảnh cá nhân.
Không cần APK/dependency mới cho JS thay đổi này.

Ba lượt trước giữ riêng, không ghép kết quả: run1 picker không lộ filename;
run2 user chọn ảnh nhưng preview dưới viewport; run3 tên OCR ở ngoài viewport.
Mỗi lượt0 nhóm/0 khách/0 ảnh/0 nháp/key; run2/3 có1 OCR. Đã logout phiên QA
qua API và giữ checkpoint/proof. Sửa harness cuộn tới preview/tên/status và
mapping timezone đúng; product cuộn đầu form khi quay lại từ bước lưu ảnh.

Đã kiểm lại quyền ảnh với web: authenticated actor qua RLS, độc lập quyền sửa
profile. API/gallery/resolver/recovery và PGlite7 đã sửa/test, gồm actor không
customers.write vẫn lưu/đối chiếu ảnh đúng scope; foreign không được upload.
OCR theo customers.write. Mobile24/types/lint đạt lại; browser permission
cuối8 ảnh/7 duplicate/8 media, sau cuộn form8 ảnh/7 duplicate đạt:
`.backups/mobile-customer-documents-native-final-docs-20261103`,
`.backups/mobile-customer-documents-native-final-dup-20261103`.

199 file vẫn khớp trong
`.backups/mobile-customer-documents-final-source-verified-20261103.json`.
Đã export Hermes iOS/Android+web source cuối terminal vào
`mobile/.expo/customer-documents-native-final-qa-20261103`; chưa signed iPhone.
Fixture watch8101 đã restart với exact full state/digest/generation11 giữ
nguyên,1 khách/1 nháp/2 profile trùng và0 ảnh cũ; không append/reset dữ liệu.
Proof `.backups/mobile-customer-documents-watch-restart-20261103/results.json`.
Runtime theo dõi terminal lúc01:53 ở `.backups/mobile-android-watch-documents-20261103-run4/runtime.json`: app mở hợp đồng mới, ledger rỗng,3 phiên QA active;1 khách/1 nháp/2 profile cũ,0 ảnh và0 write mới. USB8081→8081 và8091→8101 giữ có chủ đích,199 file vẫn khớp. Không cộng vào3 nhóm native. Các lượt mở watch trước thất bại ở harness nhập lại/hint/keyboard, giữ log riêng.
Preservation321 file khác giữ hash/39 path đổi có chủ đích (gồm3 pull merge),
0 unexpected trong `.backups/mobile-customer-documents-preservation-20261103.json`.

## Backend thật

Người dùng đã cung cấp cấu hình và cho phép dùng nếu cần. Đã nạp phía server
với logger im lặng, chỉ chạy READ ONLY catalog preflight/rollback. Không sao
lưu/log giá trị khóa, không business rows, không login/deploy/migration/write.
DB thật có schema session legacy, chỉ2 bảng mobile cũ; chưa có request/receipt/
media mới. Proof `.backups/mobile-real-schema-preflight-20261103.json`;
[kế hoạch chuyển tiếp](../mobile-real-backend-preflight-2026-11-03.md).

## Phần còn thiếu

Camera thực/batch nhiều ảnh trên native, giấy tờ nước ngoài/ảnh mờ/xoay/HEIC/
permission/lifecycle/kill khi đang chọn và khôi phục queue ảnh chưa lưu phải
nghiệm thu thêm. Ảnh hợp đồng/biển số/OCR xe/copy giấy tờ từ khách sang hợp
đồng và xóa ảnh theo web vẫn còn việc riêng. Không lấy media khách thay cho
mọi loại media. Signed iOS/iPhone, staging full roles/nhiều phiên và release
chưa xong. Backend Production chưa có API mobile; env chỉ dùng server theo quyền mới, không deploy/
migration hoặc ghi thử production. Mục tiêu100% web giữ active.

CI journal giấy tờ chạy bằng venv sau cài Pillow; YAML parse đạt, chưa remote CI.
