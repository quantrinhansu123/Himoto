# Sửa lỗi app trước bàn giao — 17/11/2026

## Phạm vi sửa

- **Ảnh hợp đồng:** nút giấy tờ trong tab Khách hàng trước đây dùng ID hợp đồng làm ID khách hàng. Mở đúng album `contracts/rental` theo hồ sơ gốc, giống web. Danh sách hiện ảnh đã lưu và hỗ trợ xem lớn/phóng to, giữ đường dẫn ảnh có xác thực và quyền hiện hữu.
- **In:** gửi HTML của mẫu web trực tiếp cho hộp thoại in native theo khổ A4. Tách tạo PDF để chia sẻ; lỗi native được chuyển thành hướng dẫn tiếng Việt có đường khôi phục. Đóng/hủy hộp thoại không hiện lỗi kỹ thuật.
- **Nhóm hợp đồng:** nhóm quá hạn chỉ có tổng quá hạn và lọc nợ xấu; nhóm đang xử lý, nháp và đến hạn không còn các tab trùng nghĩa hoặc trạng thái không thuộc nhóm. Bộ lọc chi tiết dùng cùng tập trạng thái. Luồng từ Thao tác tải và làm mới số đếm độc lập như danh sách chính. Bộ đếm Đang thuê không cộng trùng khoản đến hạn của hợp đồng thuê sở hữu.
- **Xe:** danh sách mặc định, phân trang, tổng, Excel và kho xe trên web/app loại xe đã bán khỏi xe đang quản lý. Giữ tab Đã bán để tra cứu lịch sử; không xóa xe, đổi trạng thái xe hoặc sửa quyền/RLS.
- **Thông báo cập nhật:** thêm safe area cho banner tải/cài OTA để nội dung không chạm thanh trạng thái Samsung.

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

- Source sản phẩm **`5a7c4bad8eb2c3df68aef5f101398346dd0837cc`**, đã push `main`. Bản này bổ sung safe area cho banner cập nhật trên nền bản sửa nghiệp vụ `f046bd5037a1b667242d5b720defd4ef5cf934f7`; lint/typecheck mobile đã chạy lại và đạt.
- Vercel **Ready**, deployment `dpl_scLYR4pj8qU7XvJHH6VbTT7d7nJx`. API production đã xác nhận Danh sách xe và Kho xe đều 411 xe đang quản lý; 7 xe đã bán vẫn truy cập riêng.
- OTA Android production chốt phát hành **01:17 ngày 17/11/2026** (giờ Việt Nam), thay bản 00:54 cùng ngày.
- Update group `0f0a7de8-4c65-413e-a406-16322ae21ae9`; update ID `01a1e594-3aff-7891-9a5c-15b457f1c49d`.
- Bundle EAS đã xuất để phát hành: **7.130.412 byte**, SHA-256 **`cb08b624f5ca6288e566f9eb5ac04dd5c2ce0faba2209243a1daf1e4f3db70e1`**. Đã tải từ CDN và đối chiếu khớp với chính bundle dùng để phát hành.
- Manifest đúng runtime `1.0.11`, `androidPushConfigured=true`. Runtime `1.0.9` vẫn group `71e7a3fd-35c9-45f9-9e2f-f8db5772614f`.
- 23 kiểm tra public/gate production đạt; không đăng nhập bằng mật khẩu thật.
- **1.137 kiểm tra API sau phát hành trên 35 tài khoản đang hoạt động** (32 nghiệp vụ + 3 admin): trạng thái/response khớp quyền hiện hữu. Bao gồm cả danh sách xe, Đã bán, Kho xe và số đếm hợp đồng/quá hạn. Không đổi vai trò, cơ sở, quyền hoặc trạng thái tài khoản; đã xóa toàn bộ phiên QA tạm.

Chủ máy đã mở khóa Samsung **SM-N960N**. Đã áp dụng OTA chốt trên máy đang cắm USB, xác nhận trong Tài khoản hiển thị **01:17, 17/11/2026**, runtime `1.0.11`, versionCode `12`.

- Mở từ chi tiết hợp đồng → Khách hàng → Giấy tờ và CCCD: đúng album, ảnh trước/sau hiển thị, xem toàn màn hình và phóng to được.
- Nút mở hộp thoại in vào đúng **Android Print Spooler**, mẫu hợp đồng render A4 ngang. Hủy trở về app bình thường. Đã tạo PDF và mở được bộ chọn chia sẻ Android; hủy bình thường. **Không in giấy hoặc gửi PDF cho người nhận** trong lượt kiểm tra.
- Thao tác → nhóm đang thuê **250** và nhóm quá hạn **102**: số đếm khớp trang mở ra; không còn tab Đang thuê trùng nhau. Nhóm quá hạn có Tất cả quá hạn (102), Nợ xấu (15); chọn Nợ xấu thu hẹp về 15. Các số là snapshot dữ liệu thực, có thể thay đổi theo nghiệp vụ.
- Danh sách xe **411**, tab Đã bán **7**; Kho xe **411/411**. Xe đã bán không nằm trong tổng đang quản lý.
- **45 màn/biểu mẫu native** được mở trên Samsung sau OTA chốt: hợp đồng/các nhóm, xe/kho/điều chuyển, khách, tài chính, nhân sự/cơ sở, chấm công/lịch sử/ca/lịch trực, báo cáo, GPS/tích hợp, tài khoản, thông báo, hướng dẫn, nhập file; chi tiết hợp đồng và biểu mẫu sửa/gia hạn/trả/đổi/thu tiền, chi tiết khách/xe/lịch sử xe. Không có lỗi đọc dữ liệu hoặc màn còn kẹt tải trong lượt kiểm tra; không submit nghiệp vụ.
- Chẩn đoán trong cửa sổ kiểm tra: **0 app crash, 0 app ANR, 0 SystemUI ANR**, không lỗi thu thập. Đã đối chiếu lại 35 tài khoản: hồ sơ/quyền/cơ sở không đổi, không còn phiên QA tạm. Máy được trả về màn **Thao tác**.

Artifact/log/ảnh và ngữ cảnh xác thực tạm chỉ lưu trong `.backups/handoff-fixes-20261117/` (ignored); kết quả máy thật và bản phát hành chốt nằm ở thư mục con `samsung-final/`. Kết quả `release-verification.json` ở thư mục gốc ghi nhận thời điểm trước khi mở khóa; bản trong `samsung-final/` là kết luận cuối cùng. Không commit `.env`, token, ảnh giấy tờ hoặc dữ liệu cá nhân. Không ghi nghiệp vụ production, gửi Telegram hay gửi push thử.
