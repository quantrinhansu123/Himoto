# Excel xe: đồng bộ/thay/reset/backup — 04/11/2026

Source/API/native đã có template, đọc `.xlsx`5MB/1.000xe, file cũ21cột và
file chuẩn14cột, bỏ cột thừa, khớp cơ sở theo lựa chọn, skip cơ sở ngoài
danh sách, lọc lỗi/cảnh báo/phân trang25, tải file đã khớp cột/cơ sở. Dùng
actual `readVehicleExcel`, `vehicleImportRequest`, `importDatabaseVehicles`,
`previewVehicleReset`/`resetDatabaseVehicles`; giữ reference blocker/CAS/
backup cùng giao dịch như web. Grant settings.write và scoped data hiện có.

Màn reset yêu cầu đúng `XÓA HẾT XE` và xác nhận lần hai; chỉ mở khi không
còn liên kết. Tất cả thao tác writer trong QA hiện tại đều là PGlite hoặc
fixture browser riêng; chưa nhập/xóa trên Samsung/backend vận hành.

Writer thực tế cập nhật giá/số km có dữ liệu khi sync, giữ giá trị cũ nếu
trống. Mô tả web trước đó nói giữ giá đã sai; đã sửa warning/template/help
web cho khớp writer, không đổi nghiệp vụ để làm test đạt. ID/cơ sở/trạng
thái/history vẫn giữ; màu/khung/máy để trống cũng giữ theo writer.

Receipt dùng resource_id=actor, resource_key=backup UUID thật và counter
version trong resource_revision varchar32 hiện có. Cả tombstone operation
nằm trong varchar64. Dùng cột resource_key từ migration **review-only đã
có cho loại HĐ**, không áp migration. Staging phải có schema trước nghiệm
thu; thiếu cột trả MOBILE_SCHEMA_REQUIRED. Đối chiếu riêng kiểu vehicle-
import, không lấy actor ID làm IDxe. Count/backup gốc không phụ thuộc xe
còn tồn tại sau replace/reset. JSON download kiểm canonical SHA trước xuất.

Đã kiểm:

- SQL actual writer **4nhóm đạt**, cuối có portfolio tại
  `.backups/mobile-vehicle-import-sql-run5.log`. Template/parser/normalized;
  sync giá/km/blankcolor/stock/history/retained/new; UUID/replay/immutable
  count/backup, reference FK/replace/reset blocker, rollback cả backup và
  thay đổi khi ghi receipt lỗi; scope/grant, cancellation/late write;
  replace/reset cho phép trên DB cô lập và backup hỏng bị từ chối.
- Web regression **6nhóm đạt**:
  `.backups/mobile-vehicle-import-web-regression-run1.log`.
- Root/mobile types, server/mobile/shared lint đạt; pending/recovery
  regression đạt log `.backups/mobile-vehicle-import-*-regression-run1.log`.
- Expo Android/iOS/web **exit0**, dotenvoff/API_URL origin giả tại
  `.backups/mobile-vehicle-import-build-20261104-run1/`.
- Browser375sáng/430tối **4luồng,0pageerror/request ngoài**,8ảnh/2JSON:
  `.backups/mobile-vehicle-import-ui-20261104-run1/results.json`. File cũ
  khớp cơ sở, replace có liên kết bị chặn, warning phải xác nhận, gửi sync
  đúng rows/revision, lost response/UUID recovery/backup download/ack; reset
  fixture yêu cầu đúng phrase/xác nhận, count/backup/ack không gửi lặp.

Samsung đã nối lại sau restart ADB server, install-r APK module mới lúc
**11:37:40 +07**. Live APK cũ khớp SHA đã quan sát, cùng chứng chỉ; APK mới
SHA47d3071c…,342file files/shared_prefs **nguyên SHA qua install**, không
uninstall/clear. Bằng chứng
`.backups/mobile-print-native-install-20261104-run1/results.json`.

QA same8131 đổi generation77→78 bằng journal chỉ thêm
print_import_workspace read-only; mọi field persisted cũ exact, backup tại
`.backups/mobile-print-import-qa-20261104-run1/`. Server mới19692/handle1709,
reverse8081→8081/8091→8131 đã phục hồi. Metro7600 cũ có module graph trước
đợt update package và /status timeout. Smoke run1 dừng ở prewarm trước
capture/launch,0submit; giữ evidence aborted-prewarm.json. Restart đúng
Metro Himoto bằng launcher admin đã được phép, dotenvoff, không clear cache/
app/ledger. Metro mới18372/launcher15700, log114600. Run2 fixture smoke gọi
trước Metro ready nên connection-refused; không UI/submit. Sau health200/
packager-running đã chạy run3 handle14873. Run3 hoàn tất7ảnh/UI nhưng
exit1 ở audit do thiếu import deepcopy trong harness. Audit nối tiếp lần1
cũng thiếu import re, dừng trước kiểm kết quả; đây là lỗi harness.
Audit nối tiếp **lần2 exit0 lúc11:52:17+07**, source512file exact với
original provenance,0crash/ANR/SystemUI-ANR,26checkpoint nguyênSHA,
QA7/Tổng quan/work-ledger rỗng; generation78→80 chỉ đổi auth fields/nested
expiry được helper cho phép. Evidence
`.backups/mobile-print-import-native-20261104-run3-audit2/results.json`.
Giấy web/WebView đã xem, PDF một trang đã tạo thật, chia sẻ và in hệ thống
đã mở rồi hủy; QR chưa chọn ngân hàng không fallback, Excel options/picker
mở-hủy và reset reference-blocker. **Không upload/import/replace/reset**.
Sau audit đã sửa missing import và tên key diagnostics trong harness;
không đổi mobile/shared app source sau evidence, không replay UI/UUID cũ.

Chưa native upload/import/replace/reset/UUID/backup SAF; browser fixture
không thay bằng chứng staging. Chưa full PostgreSQL/RLS role/scope/concurrent/
network/volume, iPhone ký thật, release/vận hành. Goal active.
