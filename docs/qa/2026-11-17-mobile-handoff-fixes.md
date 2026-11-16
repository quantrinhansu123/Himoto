# Sửa lỗi app trước bàn giao — 17/11/2026

## Phạm vi sửa

- **Ảnh hợp đồng:** nút giấy tờ trong tab Khách hàng trước đây dùng ID hợp đồng làm ID khách hàng. Mở đúng album `contracts/rental` theo hồ sơ gốc, giống web. Danh sách hiện ảnh đã lưu và hỗ trợ xem lớn/phóng to, giữ đường dẫn ảnh có xác thực và quyền hiện hữu.
- **In:** gửi HTML của mẫu web trực tiếp cho hộp thoại in native theo khổ A4. Tách tạo PDF để chia sẻ; lỗi native được chuyển thành hướng dẫn tiếng Việt có đường khôi phục. Đóng/hủy hộp thoại không hiện lỗi kỹ thuật.
- **Nhóm hợp đồng:** nhóm quá hạn chỉ có tổng quá hạn và lọc nợ xấu; nhóm đang xử lý, nháp và đến hạn không còn các tab trùng nghĩa hoặc trạng thái không thuộc nhóm. Bộ lọc chi tiết dùng cùng tập trạng thái. Luồng từ Thao tác tải và làm mới số đếm độc lập như danh sách chính. Bộ đếm Đang thuê không cộng trùng khoản đến hạn của hợp đồng thuê sở hữu.
- **Xe:** danh sách mặc định, phân trang, tổng, Excel và kho xe trên web/app loại xe đã bán khỏi xe đang quản lý. Giữ tab Đã bán để tra cứu lịch sử; không xóa xe, đổi trạng thái xe hoặc sửa quyền/RLS.

Không có migration DB, thay native dependency, Firebase hoặc runtime. Giữ Android native/runtime `1.0.11`, versionCode `12`, channel `production`; không gửi bundle mới sang runtime `1.0.9`.

## Kiểm tra

- `test:release`: 55 suite; `test:mobile`: toàn bộ lệnh đạt.
- `test:mobile:handoff`: điều hướng, bộ lọc theo nhóm, mở đúng ảnh hợp đồng, xử lý in/hủy/lỗi native trên TSX thật với dữ liệu cô lập.
- `check-vehicle-active-totals.cjs --pglite-path <PGlite>`: 79 trường hợp SQL/projection, bao gồm cơ sở, trạng thái, trang cuối/rỗng, search và kho xe.
- `check-mobile-fleet-inventory.cjs --pglite-path <PGlite>`: SQL kho xe thật trên PGlite, giữ thứ tự cơ sở/biển số, phân trang, availability và loại xe đã bán.
- SQL tài chính: 124 nhóm. Offline/token/worker/biometric, parity web/app, performance và QR in: đạt trên dữ liệu cô lập.
- Đã đối chiếu byte ảnh CCCD trước/sau và GPLX của hợp đồng được báo lỗi với ảnh web production: khớp. Snapshot lúc kiểm tra: 411 xe đang quản lý, 7 xe đã bán.
- Lint/typecheck web/mobile đạt. Giao diện browser dùng build app và dữ liệu GET production, riêng reader xe dùng mã server đang sửa trước triển khai; chặn ghi nghiệp vụ. Đây không phải kiểm tra native Samsung.

## Phát hành và máy thật

Đang hoàn tất kiểm tra giao diện, phát hành và xác minh production. Samsung thật đã được ADB nhận, nhưng đang khóa PIN; đã yêu cầu chủ máy mở khóa, chưa xác nhận bản sửa trên máy thật.

Artifact/log/ảnh và ngữ cảnh xác thực tạm chỉ lưu trong `.backups/handoff-fixes-20261117/` (ignored). Không commit `.env`, token, ảnh giấy tờ hoặc dữ liệu cá nhân. Không ghi nghiệp vụ production, gửi Telegram hay gửi push thử.
