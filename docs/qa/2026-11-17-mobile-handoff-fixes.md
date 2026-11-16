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
- Lint/typecheck web/mobile và build web đầy đủ đạt.
- **52 màn/biểu mẫu app qua browser**, 93 lượt đọc API, không có lỗi JavaScript/route/đọc hiển thị trong lượt kiểm tra. Bao gồm các nhóm hợp đồng, xe/kho/điều chuyển, khách, tài chính, nhân sự/cơ sở, chấm công, ca/lịch trực, báo cáo, GPS/Tích hợp, tài khoản, thông báo, nhập file và các biểu mẫu lập/sửa/gia hạn/trả/đổi/thu tiền. Không submit nghiệp vụ. Riêng reader xe dùng source server hiện tại trước triển khai; các endpoint còn lại dùng GET production. Đây **không phải kiểm tra native Samsung**.
- **Hai trạng thái danh sách xe trên web production**: xe đang quản lý và đã bán, đúng số đếm, không lỗi JS. Chặn lần refresh GPS tự động trong browser QA để không gọi provider; các GET vẫn dùng production.

## Phát hành và máy thật

- Source sản phẩm **`f046bd5037a1b667242d5b720defd4ef5cf934f7`**, đã push `main`.
- Vercel **Ready**, deployment `dpl_6iWrSfkNAe9LTkiqDJtiKZyfCKoC`. API production đã xác nhận Danh sách xe và Kho xe đều 411 xe đang quản lý; 7 xe đã bán vẫn truy cập riêng.
- OTA Android production phát hành **00:54 ngày 17/11/2026** (giờ Việt Nam).
- Update group `1740303c-b11d-4371-b905-7c8affa7a4a8`; update ID `01a1e57e-d804-7391-b575-f625838d3e6b`.
- Bundle EAS đã xuất để phát hành: **7.123.048 byte**, SHA-256 **`d7e9500e0745d1d9aeed2024859b03d0b0cbf1f9569c1145e6e99a96ffc25efb`**. Đã tải từ CDN và đối chiếu khớp với chính bundle dùng để phát hành.
- Manifest đúng runtime `1.0.11`, `androidPushConfigured=true`. Runtime `1.0.9` vẫn group `71e7a3fd-35c9-45f9-9e2f-f8db5772614f`.
- 23 kiểm tra public/gate production đạt; không đăng nhập bằng mật khẩu thật.
- **1.137 kiểm tra API sau phát hành trên 35 tài khoản đang hoạt động** (32 nghiệp vụ + 3 admin): trạng thái/response khớp quyền hiện hữu. Bao gồm cả danh sách xe, Đã bán, Kho xe và số đếm hợp đồng/quá hạn. Không đổi vai trò, cơ sở, quyền hoặc trạng thái tài khoản; đã xóa toàn bộ phiên QA tạm.

Samsung thật đã được ADB nhận nhưng đang khóa PIN. Đã yêu cầu chủ máy mở khóa; **chưa xác nhận bản OTA mới đã áp dụng, ảnh hoặc hộp thoại in trên Samsung**. Không kết luận máy thật từ browser/fixture. Có thể lấy bản mới tại **Tài khoản → Kiểm tra bản cập nhật mới** sau khi mở khóa; vẫn cần nghiệm thu native để chốt bàn giao.

Artifact/log/ảnh và ngữ cảnh xác thực tạm chỉ lưu trong `.backups/handoff-fixes-20261117/` (ignored). Không commit `.env`, token, ảnh giấy tờ hoặc dữ liệu cá nhân. Không ghi nghiệp vụ production, gửi Telegram hay gửi push thử.
