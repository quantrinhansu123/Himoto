# In/PDF, QR và nhập Excel khách hàng — 04/11/2026

Đây là kiểm tra source và môi trường cô lập, chưa nghiệm thu staging/native.
Goal vẫn active; không deploy/migration/ghi production hoặc đọc `.env.local`.

## Đầu ra

- In hợp đồng hiện tại/theo phiên bản và hợp đồng pin/sạc: dùng mẫu JSX/CSS
  web, xem giấy, hộp thoại in hệ thống và tạo/chia sẻ PDF. Lịch sử dùng
  tiền/hạn của phiên bản với thông tin khách/xe hiện tại như web. Mẫu web
  hiện có watermark nháp; giữ nguyên, không tự đổi thành bản đã phát hành.
- QR chuyển khoản: actual `readContractQr`, ngân hàng cơ sở, chọn tài khoản,
  tiền/công nợ/cap, polling khi ứng dụng active, cảnh báo mode thử. DTO kiểm
  khớp tài khoản/số tiền/nội dung với URL. QR trên giấy được tải phía server
  từ origin cố định, giới hạn 8 giây/512 KB, kiểm MIME/magic, nhúng data URI.
- Nhập khách từ `.xlsx`: actual template/parser ExcelJS và
  `importDatabaseCustomers`, tối đa 5 MB/1.000 dòng. Xem lỗi/trùng, bật hồ sơ
  chưa hoàn tất, chọn dòng hợp lệ, kiểm tra lại và xác nhận đúng số dòng.
  Grant `settings.write` như web; RLS cơ sở, không cập nhật đè khách cũ.
  Commit kiểm lại trùng trong khóa bảng; lỗi hủy toàn bộ batch.
- UUID batch/receipt/đối chiếu dùng ledger hiện có, không migration. Receipt
  giữ actor/count/thời điểm của lần ghi gốc. Tài khoản mở kết quả theo UUID,
  không lấy actor ID làm ID khách. Mất mạng không tự gửi lại file bằng mã mới.

## Đã kiểm

- Root/mobile typecheck đạt. Mobile lint run2 và server lint run2 đạt;
  shared lint run1 đạt. Run1 lint bắt lỗi cleanup ref/control regex, đã sửa.
- SQL nhập Excel **4 nhóm đạt**:
  `.backups/mobile-customer-import-sql-run1.log`. File thật qua ExcelJS:
  Text giữ số 0 đầu, công thức bị báo, trùng/cơ sở khác bị chặn; draft thiếu
  được bật đúng; writer/UUID replay/count gốc, rollback receipt và duplicate,
  hủy mã/gửi đến muộn, grant và admin cơ sở khác đều kiểm trong PGlite.
- SQL QR **2 nhóm đạt**, sau bổ sung kiểm DTO coherence:
  `.backups/mobile-contract-qr-sql-run2.log`. QR image helper **1 nhóm đạt**:
  `.backups/mobile-print-qr-image-run1.log`.
- SQL terms/history/ownership/in **5 nhóm đạt**:
  `.backups/mobile-print-sql-run2.log`. Browser synthetic A4 một trang,
  PDF 145.065 byte, không script/request ngoài tại
  `.backups/mobile-contract-print-render-20261104-run2/`.
- Next15 mirror không có env: static import ReactDOMServer bị build từ chối;
  đã sửa thành dynamic import. Synthetic renderer Next thật200, hai route
  in biên dịch qua và trả feature gate503 mặc định. Evidence
  `.backups/mobile-print-next-render-20261104-run1.json` và
  `.backups/mobile-print-next-routes-20261104-run2.json`.
- Pending/recovery regression đạt:
  `.backups/mobile-customer-import-pending-regression-run1.log`,
  `.backups/mobile-customer-import-recovery-regression-run1.log`.
- Export Android/iOS/web **compile exit0**:
  `.backups/mobile-print-import-export-20261104-run1/` và log cùng tên.
  Lệnh lượt này đặt nhầm EXPO_PUBLIC_API_ORIGIN. Đã xuất lại đúng
  **EXPO_PUBLIC_API_URL=https://mobile-api.example.invalid**, cả ba nền tảng
  exit0 tại `.backups/mobile-catalogue-export-build-20261104-run2/`.
  Expo dotenv tắt. Đây là compile, không phải signed iPhone.
- Browser mới tại `.backups/mobile-import-export-ui-20261104-run1/` đạt
  **4 luồng, 0 pageerror/request ngoài** ở375sáng/430tối: chọn cột/tải53dòng,
  file picker `.xlsx` gửi binary, chỉ commit đúng1dòng đã chọn, giả lập mất
  phản hồi sau ghi rồi đối chiếu UUID/ack về danh sách, không nhập lặp.
  Fixture browser riêng trong bộ nhớ, không nối Samsung/QA same8131.
  SQL parser/writer thật vẫn là bài4nhóm riêng ở trên. Sau ảnh đã đổi nhãn
  trạng thái raw active/draft thành tiếng Việt; chưa chụp lại thay đổi nhãn.

## Samsung và giới hạn

Expo58 print/sharing/document-picker/video/webview đã cài đúng SDK và CNG.
Gradle ARM64 build thành công; checker run3 exit1 vì regex chứng chỉ không
nhận prefix V2 của SDK37. Kiểm nối tiếp **exit0 lúc10:10:21 +07**, chữ ký
APK mới đúng chữ ký APK IME đã quan sát đang cài. Không có mismatch chữ ký.

- APK mới: `.backups/mobile-print-native-build-20261104-run3/himoto-print-arm64-debug.apk`.
- SHA256: `47d3071c118ffba2abd66226d1a9f5f73455f363b46bdd500096d06b29aee6bf`.
- Chứng minh: `.backups/mobile-print-native-build-20261104-run3/verification.json`.
- Mốc10:10 Samsung còn vắng USB. Người dùng sau đó xác nhận nối lại; đã
  kiểm live APK/signature và **install-r lúc11:37:40+07**,342file app giữ
  nguyênSHA, không uninstall/clear. Evidence
  `.backups/mobile-print-native-install-20261104-run1/results.json`.
- Native run3 đủ7ảnh, originalexit1 do missing deepcopy tại audit cuối;
  audit nối tiếp2 **exit0 lúc11:52:17+07**,512file source exact,0crash/ANR,
 26checkpoint giữ/QA7-Tổng quan/ledger rỗng. PDF một trang tạo thật, share
  và print hệ thống mở rồi hủy; pickerExcel mở-hủy/reset referenceblocker.
  QR chỉ trạng thái chưa chọn ngân hàng, không native QR thật/tiền.
  `.backups/mobile-print-import-native-20261104-run3-audit2/results.json`.

Chưa native chọn/uploadfile/submit/ack/import mất mạng, lưu/gửi PDF tới nơi
nhận thật/in ra giấy/AirPrint. Chưa staging đủ vai trò/cơ sở/nhiều phiên/mạng,
signed iPhone/release/vận hành. Import xe/sync/replace/backup, khớp cơ sở
khách, hợp đồng và export danh mục cùng video/action con vẫn còn phải làm.
