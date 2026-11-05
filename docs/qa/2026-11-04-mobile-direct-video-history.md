# Direct video và hồ sơ gia hạn/phiếu/đổi pin — 04/11/2026

Ưu tiên bàn giao mới: triển khai theo cụm, kiểm nhanh rồi tiếp module;
nghiệm thu sâu tổng thể sau. Goal100% vẫn active. Không ghi production,
không migration, không đọc env local, không thay dữ liệu Samsung.

Đã triển khai source/API/native:

- MP4 trực tiếp CloudFly dùng actual `signBrowserVideo`, `completeBrowserVideo`,
  parser mediabunny và receipt HMAC/attestation của web. Không cần Cloudinary
  nếu MP4 tương thích. File không tương thích codec/kích thước được chuyển
  qua actual Cloudinary path; lỗi mạng/quyền/phiên không tự đổi đường ghi.
- Tách `writeBrowserVideoPhoto` dùng chung bởi actual web route và mobile;
  giữ cùng khóa hồ sơ, provider, metadata, actor và SQL overwrite. Server
  ép actor/UUID/60 giây; header/URL/ticket/bytes/hash được kiểm. App hash file
  native bằng Expo58 File.digest, gửi đúng4header private bằng URL ngắn hạn,
  không đưa Himoto bearer/cookie sang storage và không nhận redirect.
- UUID/parent/reference/photo/snapshot/receipt/recovery như nhánh video trước;
  direct upload chưa gắn hồ sơ không được coi là lưu thành công. PUT412 chỉ
  được chuyển sang bước verify; byte/codec/audio/duration do backend kiểm.
  Dùng bảng proof hiện có, không lưu signed URL/ticket vào ledger thiết bị.
- Ảnh/video cho kỳ gia hạn, phiếu gia hạn theo transaction ID, lượt đổi pin;
  mở từ “Ảnh/video gia hạn, phiếu và đổi pin”. Có ảnh bổ sung, chọn đúng video
  slot, xem/thay/xóa qua domain hiện có, phiếu gốc và cờ stale độc lập.
  Kỳ gia hạn lấy từ JSON cũ + notice/root_event_key/payment/mobile ledger;
  giữ **cả hai next-version permissive** được actual web helper cho phép.
  Không trộn ID phiếu với số kỳ. Đổi pin chỉ có video1 đúng web.
- Trang hồ sơ mới25dòng, RLS/cơ sở; payment/swap reference revision riêng;
  thay/xóa phiếu hoặc lượt đổi pin sau lưu vẫn đọc được proof gốc và báo stale.
  Shared reference reader được dùng cho image/video receipt; xóa tệp nhận
  đúng object-video metadata. Không đổi tiền, kho hay trạng thái hợp đồng.

Kiểm nhanh đã đạt:

- SQL8nhóm actual writer/parser, PGlite/socket ngoài bị chặn:
  `.backups/mobile-direct-video-history-sql-run1.log`. Có MP4 tổng hợp thật,
  không Cloudinary config, direct verify/commit/replay/rollback/tombstone,
  wrong ticket/actor/UUID/header/URL, history34target/2trang và proof stale.
- Adapter direct2nhóm; hồi quy ảnh8/xóa5nhóm. CI command riêng `--history`
  cũng chạy local đạt6nhóm không phụ thuộc file fixture video ngoài repo.
  CI đã thêm adapter/history; chưa chạy pipeline từ xa. Direct parser suite
  đầy đủ cần `--synthetic-file` trong `.backups`, không nạp env.
- Root types `mobile-media-history-root-types-run1`, mobile types/lint run2,
  server lint run1, shared lint run1 đều đạt. `git diff --check` không có lỗi;
  Git chỉ báo LF→CRLF ở browser-videos khi lần sau Git chạm file.
- Export Android/iOS/web run2 exit0, EXPO_NO_DOTENV=1/API_URL origin giả:
  `.backups/mobile-direct-video-history-build-20261104-run2/`.
- Browser run1 exit0:375sáng/430tối,2luồng/8ảnh/0pageerror/host ngoài fixture.
  Có danh sách3nhóm hồ sơ mới, xem hết/phát lại, chặn61giây, upload direct
  không bearer, codec-fallback, mất phản hồi commit/resolve/ack không lặp.
  `.backups/mobile-direct-video-history-ui-20261104-run1/results.json`.

Samsung duy trì kết nối lúc13:01+07, APK không cài lại, Metro18372 và QA16552/
handle66851 còn listen8081/8131, generation80; kiểm SHA26checkpoint vẫn đúng.
Không chạy lại native matrix cho từng lát: bằng chứng native cuối12:35:43
521file **là trước cụm source này**. Chưa native direct upload/digest/submit/
history UI mới; không dùng bằng chứng cũ để gọi native bản mới đã nghiệm thu.

Việc tiếp đã đọc source để đi nhanh: video ca dùng actual
`shift-media-handler.ts` vốn đã nhận JSON Cloudinary/CloudFly, giới hạn180s,
3video/60ảnh mỗi PGD/KTNB; role/stage/report revision/UUID/ledger đã có.
`ShiftEvidence` mới có ảnh và metadata video. Cần native chọn/quay/player/
upload180s, scoped sign/direct endpoint; GET mobile hiện redirect object URL
phải proxy có bearer ở API trước khi bật player. Tiếp import hợp đồng từ
helper CLI với verified backup/CAS/namespace, Telegram/action con và23khu vực.
Staging/đa vai trò-cơ sở/nhiều phiên/mạng/iPhone signed/release còn nguyên gate.
