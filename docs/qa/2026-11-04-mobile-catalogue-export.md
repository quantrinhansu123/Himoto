# Xuất danh mục theo bộ lọc — 04/11/2026

Source/API/UI xuất CSV có cho khách, xe, hợp đồng, nhân sự và cơ sở. Mở
từ danh sách, giữ bộ lọc/cơ sở/phạm vi/ngày/chức vụ, chọn cột/mặc định/tất
cả, xuất toàn bộ kết quả. Dùng cùng `buildManagementCsv` với web để giữ
nhãn, BOM, tiền/ngày/thời gian thuê, dấu nháy và chống công thức CSV.

Server dùng actual `readManagementTable`, scoped transaction read-only
repeatable read. Contracts/customers dùng full reader web; xe/nhân sự/cơ
sở đọc hết các trang50 trong cùng snapshot vì full reader không có plan
cho3loại này. Kiểm số dòng/tổng/trùng ID, không trả file bị cắt. File trên
12MB yêu cầu thu hẹp bộ lọc. Hợp đồng có cột theo tab web và ghi chú xử lý
khách bằng actual `readCollectionFollowups`. Không đưa raw payload/cột bí
mật ra file hoặc dùng ledger ghi cho thao tác chỉ đọc.

Đã kiểm:

- Adapter/serializer **4 nhóm đạt** tại
  `.backups/mobile-catalogue-export-adapter-run3.log`. Các grant và chính
  sách fleet_read, toàn bộ filter, đủ53dòng qua2trang, nhãn/quotes/formula,
  các tab hợp đồng/chức vụ, incomplete/duplicate rollback. Đây là fixture
  adapter, **không phải SQL acceptance**. Hai lượt đầu lỗi thiết lập pool
  fixture và giả định vehicles.read bị từ chối; đã sửa test theo web cho
  mọi tài khoản authenticated đọc xe, không đổi chính sách để làm test đạt.
- Root/mobile typecheck, server/mobile/shared lint đạt; nhãn trạng thái
  tiếng Việt đã vào build/browser run3 cùng lượt khớp cơ sở.
- Expo Android/iOS/web exit0, dotenv off, origin giả đúng biến API_URL:
  `.backups/mobile-catalogue-export-build-20261104-run2/`.
- Browser375sáng/430tối **4 luồng đạt**,0pageerror/request ngoài tại
  `.backups/mobile-import-export-ui-20261104-run1/results.json`,6ảnh và
  2CSV được đọc lại54dòng kể cả header. Chỉ mount1dòng catalogue nhưng
  download53dòng. Gồm cả nhập Excel/mất response/recovery/ack. Môi trường
  hoàn toàn riêng trong bộ nhớ; không đổi Samsung/QA/ledger cũ.
  Browser run3 cuối kiểm lại6luồng/10ảnh exit0,0pageerror/request ngoài tại
  `.backups/mobile-import-export-ui-20261104-run3/`.

Chưa đối chiếu SQL/export thật mọi bộ lọc/tab/volume, Samsung SAF/iOS Share
cho CSV này, staging/mạng/nhiều phiên, iPhone ký thật hoặc release. Samsung
vẫn mấtUSB; APK module mới đã build/cùng chữ ký nhưng chưa cài.
