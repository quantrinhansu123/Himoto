# Import nháp hợp đồng — 04/11/2026,19:06+07

Source/API/UI đã nối từ pure/server helper của CLI. Không chạy
scripts/import-contract-workbooks.cjs, không load env, không dữ liệu vận hành.
Goal tổng thể còn active; chưa nghiệm thu native/staging/release.

## Hành vi

- Chỉ admin theo isAdminAccount, kể cả đọc nguồn, kết quả và resolve sau khi
  bị hạ quyền. Có mẫu Excel12cột dùng ORDER_CUSTOMER_HEADERS, giữ SĐT dạng
  text/ngày giờ Việt Nam đủ giây. Giải thích rõ cột tên cũ “Đặt cọc” là tổng
  đã thu theo nguồn; không tự thu tiền hoặc tạo khoản cọc.
- Chọn tối đa20file/5MB mỗi file, tổng1000dòng, mỗi file chọn rõ cơ sở nguồn;
  xem trước toàn lô, phân trang25/lọc mới-đã có-bị chặn. Bỏ/thay nguồn phải
  xem trước và sao lưu lại. Dùng actual parseContractOrderWorkbook và
  previewDatabaseContracts/planContractImport, không làm parser/plan giản lược.
- Workbook đã đọc có SHA256/signature HMAC buộc actor/filename/branch-map/
  source rows; prepared proof buộc batch/revision/count/manifest/backup hash.
  Secret chỉ ở server, yêu cầu MANAGEMENT_SESSION_SECRET đủ32ký tự; app chỉ
  nhận chữ ký. Namespace cố định himoto-customer-workbooks-v1 như CLI.
- Backup snapshot đầy đủ trong Documents của app (native), IndexedDB (web),
  phân scope origin/actor/batch. Bắt buộc lưu, đọc lại đủ nội dung và SHA256;
  kiểm lại ngay trước gửi. Native ghi tệp tạm/xác minh rồi move, giữ backup
  gốc và chỉ dọn tệp tạm mình vừa tạo khi lỗi. Không coi mở download/share là
  đã xác minh backup. Có xuất backup JSON ở màn chuẩn bị và receipt trên
  chính thiết bị giữ bản gốc; không tự xóa backup khi ack/rời app.
- Mutation dùng actual importDatabaseContractDrafts/saveDatabaseDraft và
  ledger có sẵn, import.contracts:<batch>. Không thêm bảng/migration mới.
  Cùng transaction khóa bản ghi/tables, kiểm prepared revision/expected count,
  align sequence legacy như CLI và đối chiếu toàn bộ bản gốc/related tables/
  số lượng/nhận diện trùng sau nhập. Metadata giữ nguồn và thêm batch/request/
  backup hash/source hashes. Gap sequence khi rollback có thể có như CLI.
- Chỉ tạo nháp chưa đối soát tài chính: pid/total0, cọcNULL, signed_on và
  unit_price rỗng; sourcePaid/sourceTotal nằm metadata, paid_amount theo domain
  thực thu. Không đổi orders cũ/customers/vehicles/stores/details/transactions.
- Pending giữ UUID trước I/O, chung nhóm import; lỗi giữ file/form/backup,
  resolve committed đọc receipt gốc, chưa ghi thì khóa mã cũ trước rà lại.
  Account recovery và import-result nhận đúng loại contracts/count/ack, về
  danh sách hợp đồng. Không auto-submit hoặc auto-ack.

## Kiểm nhanh

- SQL run3:3nhóm tổng hợp dùng disposable PGlite, actual writer/parser/pool;
  workbook và mẫu thật, signed source/proof/actor/branch-map/count/backup,
  revision cũ, rollback cả hai nháp khi lỗi receipt, lost commit/replay/
  tombstone, metadata/giây, stock-money-originals unchanged và chống trùng.
  Đã kiểm demoted actor không đọc/resolve được receipt admin. Log
  `.backups/mobile-contract-import-sql-run3.log`.
- Web pure regression7nhóm; SQL nhập khách4nhóm hồi quy đạt. Pending thêm
  nhóm contract/customer/store-match qua restart/scope, recovery6nhóm đạt.
  Đây không phải PostgreSQL thật nhiều kết nối hoặc staging acceptance.
- Root types và server/shared lint đạt. Mobile types/lint final3 đạt sạch;
  lượt cuối đầu thiếu type-only import MobileWorkbookExport đã sửa. Không
  lấy export thành công để thay types.
- Export Android/iOS/web run2 exit0, dotenv tắt/API_URL origin giả:
  `.backups/mobile-contract-import-build-20261104-run2/`.
  Native export run3 exit0 sau sửa cleanup backup File.move; output
  `.backups/mobile-contract-import-native-20261104-run3/`. Web run2 trước
  sửa native-only này vẫn đúng source thực thi web.
- Browser run1 exit0:375sáng/430tối/2luồng/6ảnh/0pageerror/0host ngoài
  fixture. Preview/write gate, IndexedDB backup đọc lại + download exact,
  retry lỗi storage trước ghi và lost commit/resolve/ack không nhập lặp.
  Run2 có thêm tải mẫu cũng exit0/2luồng/6ảnh/0pageerror. Fixture từ actual SQL run3,
  không dùng hoặc reset checkpoint Samsung.
- Native backup adapter3nhóm với real disposable filesystem đạt: kiểm
  File.move đổiURI vẫn giữ final file, không ghi đè backup cũ, lỗi ghi dở/
  full disk/hash mismatch chỉ dọn tệp tạm và retry được, scope actor/origin.
  Đây là adapter test, chưa phải Expo FileSystem trên máy thật.
  `.backups/mobile-contract-import-backup-files-run2.log`. CI source thêm
  adapter và SQL import; chưa chạy pipeline từ xa.

Chưa native picker/backup/digest/submit/kill/recovery trên Android/iPhone thật,
staging/admin session/schema thực tế, nhiều phiên/lỗi mạng toàn ma trận,
Next API build trong mirror không env và signed release/vận hành. Gộp vào QA
tổng thể sau khi phủ chức năng; không tuyên bố100% từ các smoke trên.

Điểm tiếp: Telegram hợp đồng/điều chuyển và action con/Excel-batch còn thiếu;
video ca/correction/full edit/import hợp đồng source đã có, không làm lại.
