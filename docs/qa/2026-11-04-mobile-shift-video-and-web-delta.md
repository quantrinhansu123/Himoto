# Video ca180s và delta web — 04/11/2026,18:40+07

Ưu tiên phủ chức năng theo cụm, kiểm nhanh rồi tiếp module. Goal tổng thể của
chat hiện tại đã tạo thành công và còn active; không lấy usageLimited ở chat cũ
làm trạng thái hiện tại. Chưa nghiệm thu toàn dự án.

## Source/API/UI

- Video ca có editor/route/Stack, chọn/quay tối đa180giây, player đã lưu và
  preview local, dung lượng/thời lượng, nhóm PGD/KTNB/category/revision,
  giới hạn3video tính chung các mục của mỗi phần. Review trước gửi; dùng
  hook direct MP4/conversion, khóa UUID chung media/update/audit, receipt và
  đối chiếu hiện có. Giữ file khi lỗi hoặc resolve chưa lưu; dispose khi rời.
- Mobile writer buộc receipt tải lên đúng UUID lần lưu và actor; web vẫn
  dùng handler chung. Lỗi range từ proxy giữ416 qua mobileFailure thay vì500.
  Không redirect bearer sang storage.
- Xe tạo/sửa/xem có giá mua/giá thuê; DTO/API whitelist hai trường, actual
  web writer giữ giá khi bỏ field;0/null là chủ đích. Form bảo toàn field
  thiếu ở DTO cũ nếu người dùng không sửa. Thumbnail dùng slot vehicle-photo
  và authenticated reader, không cache ảnh xuống đĩa. Lỗi ảnh giữ placeholder.
- Hợp đồng của xe có API/route/UI phân trang25, quyền vehicles.read+
  contracts.read, cùng điều kiện dòng mở/trạng thái/customer snapshot như
  web và actual readDraftVehicleRentals. Orders giữ RLS riêng; không suy quyền
  xem hợp đồng từ việc nhìn thấy xe toàn hệ thống.
- Nguồn khách dùng chung staffCustomerSourceLabel với web, nhãn Tên _Phòng;
  TLS giữTLS, doanh số/người làm độc lập, NVKD theo cơ sở/TPKD-TLS toàn hệ
  thống, giữ nội dung đang gõ và tín dụng đã chọn thủ công.

## Kiểm đã đạt

- SQL video ca run2:5nhóm, actual scoped pool/RLS + writer + mediabunny với
  MP4 tổng hợp180/181giây. Direct180 đạt không Cloudinary,181bị chặn;
  UUID/fingerprint/actor/cơ sở/quyền/CAS, rollback receipt/lost commit/replay/
  cancellation,3video theo stage,conversion180/181,khóa PGD/KTNB,range exact/
  no redirect/foreign/stale/416. Storage S3/Cloudinary giả trong bộ nhớ;
  không upload thật, không staging. Run1 test kỳ vọng sai mã lỗi181đã sửa;
  không đổi writer để làm test đạt. Log `.backups/mobile-shift-video-sql-run2.log`.
- SQL xe run1:8nhóm, gồm giá cũ khi bỏ field,0/null,invalid/unsafe amount,
  hợp đồng mở/cọc/đã hoàn tất và quyền/filter. Scope trong suite xe là adapter
  context; không gọi là deployed RLS acceptance.
  `.backups/mobile-delta-vehicle-sql-run1.log`.
- SQL ca cũ5nhóm hồi quy đạt, `.backups/mobile-shift-regression-run1.log`.
- Root/mobile types đạt; mobile lint0error có2warning import trùng API đã
  sửa và lint lại API sạch. Server/web lint riêng đạt. Kiểm cuối sau phần
  nguồn khách và import sẽ ghi bổ sung, không suy từ lượt trước.
- Export Android/iOS/web run1 exit0, dotenv tắt/origin giả,
  `.backups/mobile-shift-delta-build-20261104-run1/`.
- Browser video run2 exit0:375sáng/430tối,2luồng/5ảnh/0pageerror/0host ngoài
  fixture; chặn181,preview/review/direct hoặcconversion, mất phản hồi commit/
  resolve/ack và giữ blob sau resolve cancelled không chọn lại. Run1 fail
  assertion đếm mọi video trong stack (có màn nền), sửa harness kiểm blob
  local; không thay app để làm test đạt. Evidence
  `.backups/mobile-shift-video-ui-20261104-run2/results.json`.

Chưa native source mới/ghi180s/submit/digest thực tế, staging/role matrix/
nhiều phiên/mạng/iPhone signed/release. Không đổi checkpoint Samsung,
install/clear/login/replay. Migration vehicle-photo vẫn chưa áp DB.

Điểm tiếp: import hợp đồng từ pure/server helper, giữ backup đọc lại xác minh,
prepared revision/expected count/branch-map/source hashes/namespace/duplicate/
metadata; chỉ nháp chưa đối soát tài chính, không kho/phiếu/thu tiền.
