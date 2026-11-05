# Khớp cơ sở khách từ Excel — 04/11/2026

Source/API/native đã có: template Căn cước/Cơ sở, file `.xlsx` tối đa5MB,
đọc trên1.000dòng theo phần, đối chiếu khách/cơ sở cũ→mới, lọc lỗi/phân
trang25, xác nhận cả file và lưu từng phần1.000dòng. Dùng actual
`readCustomerStoreExcel`, `prepareCustomerStoreInputs`, `customerStoreRequest`
và `importCustomerStores` của web. Grant `settings.write`, RLS, revision
hash từng phần; giữ thông tin cá nhân/hợp đồng/xe, bỏ qua dòng lỗi.

Trùng căn cước được đánh dấu **toàn file trước phần đầu**. Server đọc file
một lần, truyền NDJSON từng phần; native dùng streaming fetch SDK58 để
không phải tải lại file cho từng phần. [API Expo58 đã đối chiếu](https://docs.expo.dev/versions/v58.0.0/sdk/expo/).
Chỉ cho lưu sau khi stream đầy đủ và tất cả phần đã được kiểm tra. Có dừng
kiểm tra, giữ file gốc; UI chỉ render trang25 và cập nhật tiến độ khi đọc.

Mỗi phần có UUID/receipt count/actor riêng. Đóng ledger phần trung gian
chỉ sau xác nhận ghi đúng count, theo xác nhận toàn file của người dùng.
Giữ mã của phần không rõ kết quả. Khi lỗi ở phần sau: giữ số đã xác nhận,
đối chiếu mã, kiểm tra lại file; phần đã ghi trở thành đã đúng cơ sở.
Không tự gửi lại. Account mở kết quả theo UUID, không lấy actor làm ID khách.

Operation dùng `import.cstores:<uuid>` để cả `cancelled:` tombstone nằm
trong cột varchar64 hiện có; không migration. SQL fixture đã đổi từ text
sang đúng varchar64/32 để kiểm giới hạn thật. Chưa có mã cstores phát sinh
trên Samsung hoặc backend vận hành.

Đã kiểm:

- PGlite actual parser/writer **3 nhóm đạt**:
  `.backups/mobile-customer-store-sql-run3.log`. File Excel1.002dòng, hai
  phần1000/2, hai căn cước trùng ở hai phần đều bị đánh dấu, streaming và
  DTO phần giống nhau; CAS, chỉ đổi store/updated_at, bỏ qua lỗi, replay/
  immutable count/recovery, RLS/grant, rollback receipt, cancel/late write.
- Stream client **3 nhóm đạt**:
  `.backups/mobile-customer-store-stream-run4.log`. Một upload, UTF8 bị
  chia byte, thứ tự/hash/total/EOF/truncated/cancel/401/MIME. Test run1
  fixture reader không đóng vì offset vượt length, đã dừng đúng node2132;
  run2 bắt thiếu cancel body sai MIME trong client, đã sửa. Không che log lỗi.
- Web matching regression đạt ở
  `.backups/mobile-customer-store-web-regression-run1.log`, gồm file2.005
  dòng/partial/lost-response. Import khách gốc SQL4nhóm sau mở rộng receipt
  đạt `.backups/mobile-customer-import-sql-run2.log`.
- Pending/recovery regression đạt ở
  `.backups/mobile-customer-store-pending-regression-run1.log` và
  `.backups/mobile-customer-store-recovery-regression-run1.log`.
- Root/mobile types, server/shared lint đạt. Mobile lint bắt manual memo
  không bảo toàn bởi React Compiler; đã bỏ manual memo, lint run6 đạt.
  Sau đó thêm refresh mã chờ và sửa progress sau resolve; types/lint run7
  và export3nền tảng run3 **exit0**. API auth/client regression và import
  khách SQL4nhóm trên varchar64 cũng đạt, log api-regression-run1 và
  mobile-customer-import-sql-run3. Goal chưa nghiệm thu tổng thể.
- Expo Android/iOS/web run2 exit0 với dotenv tắt/origin giả. Browser run2
  **6luồng đạt**,0pageerror/request ngoài,375sáng/430tối:
  `.backups/mobile-import-export-ui-20261104-run2/results.json`,10ảnh/2CSV.
  Gồm nhập khách/xuấtCSV và khớp1.002dòng: cả hai phần ghi đúng một lần;
  sáng giả lập mất response phần2, giữ count phần1, resolve UUID phần2,
  ack/recheck hai dòng đã đúng và không submit lại; tối happy path/ack về
  khách. Browser fixture riêng, không sửa Samsung/same8131/ledger cũ.
  Bộ build browser này còn manual memo; thay đổi sau ảnh bỏ memo,
  refresh mã chờ và nhãn progress sau resolve. Browser **run3 cuối exit0**,
 6luồng/10ảnh/0pageerror/request ngoài, dùng đúng build run3 tại
  `.backups/mobile-import-export-ui-20261104-run3/results.json`.
- Audit chỉ đọc cuối:26checkpoint cũ nguyên SHA, same8131 generation77,
  0nativewrite trong lát này. Bằng chứng
  `.backups/mobile-import-export-preservation-20261104-run1.json`.

Chưa native file/stream/partial/ack, file lớn/hiệu năng toàn dải, staging
PostgreSQL nhiều phiên/quyền/mạng, signed iPhone hoặc release. Samsung
USB đang vắng; APK module mới đã build/cùng chữ ký, chưa cài. Không reset/
uninstall/clear/replay mã cũ. Goal vẫn active; import xe/sync/replace/backup,
import hợp đồng, video/Telegram/batch/action thiếu và acceptance còn tiếp.
