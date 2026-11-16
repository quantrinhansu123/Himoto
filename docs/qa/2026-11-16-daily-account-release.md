# Bản chốt web/app theo tài khoản nghiệp vụ — 16/11/2026

## Trạng thái

Đã triển khai các điểm nghẽn tìm thấy trong [đợt rà soát sâu](2026-11-16-performance-final-audit.md), kiểm tra các tài khoản nghiệp vụ thật và phát hành. Source cuối: **`13cfa7d0268a6e40693ae660b6c8fe838a0e5301`**, đã push `main`. Vercel Ready: `dpl_C5Mbw2tnrGXxTRGNRAJEX8fr5UuC`.

Samsung SM-N960N thật đã áp dụng OTA **19:18, 16/11/2026**, native/runtime `1.0.11`, Android code `12`. Giữ Android push được cấu hình và nhịp đồng bộ GPS một phút. Không cài lại APK, đổi tài khoản trên Samsung hoặc chạy giả lập.

## Các sửa đổi

1. **Khách hàng:** giới hạn trang theo filter/sort trước khi tính số hợp đồng của từng khách. Sort theo số hợp đồng vẫn dùng projection đầy đủ, tránh thay đổi kết quả. Giữ search có dấu/không dấu, escape ký tự tìm kiếm, store/status, thứ tự và tổng số dòng.
2. **Quyền đọc DB:** thêm `ownership_customer_source_store_ids()` và sửa đúng hai predicate SELECT của `orders`/`transactions`. Tập cơ sở nguồn khách trụ sở được tính một lần trong statement qua initPlan, dùng lại helper nghiệp vụ gốc. Không cache quyền giữa người dùng/request; giữ quyền đọc nguồn khách trụ sở của thuê sở hữu. Các policy INSERT/UPDATE/DELETE và helper quyền cũ giữ nguyên.
3. **Doanh thu xe:** materialize phần tổng theo xe để plan không tính lại cùng aggregate cho mỗi xe. Plan cũ có aggregate lặp 89 lần, một query trên 23 giây. Không thay cách phân bổ tiền, phí hoặc writer tài chính.
4. **Menu:** Tích hợp GPS/Telegram chỉ hiện cho admin trên web/app theo đúng API; Báo cáo cuối ca trên app cần quyền đọc hợp đồng.
5. **Quyền app:** chuyển đúng dạng `MobileUser` camelCase sang helper quyền dùng dạng `SessionUser` snake_case. Quản lý thuê sở hữu mở được quản lý tài khoản trong cơ sở của mình. Biểu mẫu giữ cơ sở được giao, không có lựa chọn toàn hệ thống/admin/vai trò trụ sở; đổi vai trò không làm bật scope toàn bộ. Nhập hợp đồng từ file nguồn vẫn chỉ dành cho admin, tách khỏi quyền quản lý tài khoản theo cơ sở.

Migration: [2026-11-16-scoped-read-initplan.sql](../sql/2026-11-16-scoped-read-initplan.sql). Đã áp dụng và xác minh production; không cần chạy lại khi bàn giao. Migration có guard policy, lock timeout 2 giây, giữ nguyên roles/chế độ restrictive/command và có thể chạy lại. Bản predicate cũ/rollback lưu riêng trong artifact cục bộ.

## Phạm vi tài khoản và kết quả

Đối chiếu **35 tài khoản đang dùng**, gồm **32 nghiệp vụ + 3 admin**:

| Vai trò | Số tài khoản |
|---|---:|
| Nhân viên cơ sở | 19 |
| Quản lý cơ sở | 5 |
| Kinh doanh/Telesale trụ sở | 3 |
| Quản lý công nợ trụ sở | 1 |
| Nhân viên thuê sở hữu | 1 |
| Quản lý thuê sở hữu | 1 |
| Kế toán | 1 |
| HCNS | 1 |
| Admin | 3 |

- **1.137 kiểm tra API:** đợt đầy đủ 997 kiểm tra trên 35 tài khoản và 140 kiểm tra lại báo cáo/quản lý tài khoản sau sửa aggregate. Gồm phiên/workspace, xe/khách/hợp đồng, mặc định/tất cả/quá hạn, thông báo/hoạt động, vận hành/dashboard, báo cáo, danh bạ, sổ quỹ, ca/lịch trực/chấm công, GPS, Tích hợp và tài khoản. Các kết quả 200/403/404 khớp quyền hiện hữu; có chặn đọc hợp đồng ngoài tập cơ sở được phép.
- **70 lượt trang web production**, hai trang cho mỗi tài khoản, có xác thực riêng; kiểm tra menu theo quyền và đọc Khách hàng + Báo cáo hoặc Chấm công cá nhân. Chặn mọi request ngoài GET/HEAD. Không lỗi JS trong các lượt kiểm tra.
- **104 màn chính của app qua browser preview**, dùng dữ liệu GET production với phiên ngắn hạn riêng của từng tài khoản. Kiểm tra tab/menu, xe/khách/hợp đồng, quyền nhìn thấy chức năng; riêng quản lý thuê sở hữu mở danh sách và biểu mẫu tài khoản, kiểm tra scope/role bị giới hạn. Không gọi đăng nhập production bằng mật khẩu hoặc submit form. Preview source `3a09756`; thay đổi cuối `13cfa7d` chỉ siết guard nhập file admin, đã kiểm tra render route riêng và lint/typecheck. Đây là kiểm tra giao diện app trên browser, **không phải chạy 35 tài khoản trên Samsung**.
- **29 màn trên Samsung thật**, OTA cuối 19:18, tài khoản đang đăng nhập trên máy: các nhóm hợp đồng, xe/kho/điều chuyển, khách, chấm công, ca, nhân sự/cơ sở, báo cáo, sổ quỹ, nhắc nợ, Tích hợp, tài khoản, thông báo, hướng dẫn và GPS. Không thấy lỗi route hoặc lỗi đọc còn hiện trong snapshot; không có marker crash/ANR mới của app/SystemUI trong cửa sổ đo. Không nhập/ghi nghiệp vụ production.
- Reader xác thực từ DB loại đúng **140 tài khoản không đủ điều kiện** (bị khóa/ngừng hoạt động/đã xóa). Đây là kiểm tra trạng thái xác thực, không phải thử 140 mật khẩu.

Đã đối chiếu lại toàn bộ 35 hồ sơ xác thực sau QA: **vai trò, quyền, cơ sở, scope và trạng thái không đổi**. Phiên QA tạm đã xóa, token cũ trả 401; kiểm tra cuối còn **0 phiên QA**. Không cấp thêm quyền cho nhân viên để làm kiểm tra đạt.

## Hiệu năng sau sửa

Quản lý thuê sở hữu, bộ lọc “Tất cả cơ sở” trong phạm vi được phép; trung vị 3 mẫu HTTPS nối tiếp:

| API | Trước | Sau |
|---|---:|---:|
| Khách hàng | 5.449 giây | **276 ms** |
| Hợp đồng | 5.304 giây | **224 ms** |
| Báo cáo thực thu | 14.959 giây | **679 ms** |
| Sổ thu chi | — | **752 ms** |
| Doanh thu xe | — | **285 ms** |

Query doanh thu xe ở cơ sở 32 trong cùng snapshot: **22.921 ms → 669 ms**, tổng và các dòng khớp. Đối chiếu 29 trường hợp trên 9 phạm vi DB khác nhau, gồm admin/scoped/all-store, sort, phân trang, export `mode=all`, search rỗng và kết quả không khớp; không thay số liệu.

Lượt kiểm tra lại toàn bộ tài khoản, mỗi luồng một mẫu/tài khoản được phép: thực thu trung vị 1.682 ms, sổ thu chi 767 ms, doanh thu xe 1.148 ms. Một số mẫu thực thu ban đầu 2,7–4,2 giây; đo lặp ba mẫu cho bốn tài khoản đó cho trung vị khoảng **1,83–2,31 giây**, cao nhất 2,95 giây. Không tuyên bố mọi báo cáo dưới một giây hoặc mọi máy/mạng có cùng thời gian. Các lượt có thể trùng với kiểm tra giao diện, không phải benchmark tải đồng thời hoặc SLA p95.

Số liệu DB thuần có tính cả mạng từ máy phát triển; thời gian browser ổn định có cả khoảng chờ yên của runner. Không dùng chúng thay thế thời gian ghi giao dịch hoặc nghiệm thu mạng 4G thực tế.

## Kiểm tra dữ liệu và quyền

- **70 đối chiếu reader Khách hàng cùng snapshot**, hai biến thể cho từng tài khoản trong 35 tài khoản, khớp toàn bộ kết quả/tổng với reader trước sửa.
- **576 trường hợp PostgreSQL cục bộ** cho phân trang Khách hàng: tám sort, hai chiều, filter store/status/search, tên có dấu, null/tie, ký tự escape, trang rỗng/quá cuối và số hợp đồng dưới RLS.
- **84 trường hợp PostgreSQL cục bộ** cho policy: visibility và phân trang giữ nguyên; nhiều trụ sở, null/fractional IDs, caller search_path, thiếu setting, đổi scope trong cùng transaction và chạy migration lặp. INSERT/UPDATE/DELETE ngoài cơ sở bị chặn; đọc nguồn trụ sở không cấp quyền ghi trụ sở.
- Production: truth table của **35 tài khoản × 10 store target**, tập ID hợp đồng/phiếu tiền đọc được ở ba scope đại diện khớp trước/sau. So metadata xác nhận ngoài hai SELECT predicate thì policy khác và helper/ACL cũ không đổi. Helper mới chỉ cấp EXECUTE cho `himoto_scoped`, không cấp `anon`/`authenticated`.
- **960 biến thể quyền** đối chiếu user mobile/server cho quản lý tài khoản, quản lý thuê sở hữu, chốt hợp đồng và quyền khôi phục mật khẩu riêng từng admin; hai kịch bản biểu mẫu và guard route nhập file. Chỉ thêm grant vào DTO không làm nhân viên thành quản trị.
- **124 nhóm SQL tài chính PGlite**, kiểm tra báo cáo, quản lý tài khoản/mật khẩu, nhập file/backup: đạt. Writer production không được gọi để thử quyền; các phép ghi, rollback, CAS/idempotency và chặn ngoài scope được kiểm tra trên PostgreSQL/dữ liệu cô lập.
- `test:release`: **55 suite**; `test:mobile`: toàn bộ lệnh; mobile parity/performance/navigation: đạt. Web/mobile lint và typecheck đạt. Build web đầy đủ đạt; các source sản phẩm đã Vercel build thành công.
- Production public bản cuối: **23 kiểm tra đạt**, không đăng nhập bằng mật khẩu hoặc ghi nghiệp vụ.

Các test mới được lưu trong repo: `check-scoped-read-performance-postgres.cjs`, `check-customer-pagination-postgres.cjs`, `check-mobile-permission-projection.cjs`. Hai test PostgreSQL dùng cluster QA loopback riêng, không dùng URL DB production.

## Phát hành và giới hạn nghiệm thu

- Android production branch/channel; source `13cfa7d0268a6e40693ae660b6c8fe838a0e5301`.
- Runtime `1.0.11`, code `12`, `androidPushConfigured=true`.
- Group `40009b18-4379-439a-b5dc-f98d912c5f14`.
- Update ID `01a1e44b-3ced-78d1-aa48-13a47e67bc35`, tạo `2026-11-16T12:18:18.477Z`.
- Bundle `entry-1666f7c6eb915640f950f6e066e6e19f.hbc`, **8.936.179 bytes**.
- SHA-256 `6ce71a940549e9dabd4f1aa29306d04cc64cf3e2161c0fb3a924f8543e8dfdd7`.

Export Android từ source sạch với `EXPO_NO_DOTENV=1`, API/environment production, cấu hình Firebase hiện hữu. Đã đọc manifest production, tải bundle CDN và đối chiếu bytes/SHA-256. Runtime `1.0.9` vẫn ở group `71e7a3fd-35c9-45f9-9e2f-f8db5772614f`, không nhận bundle mới.

Thông báo tiếp tục ưu tiên quá hạn/sắp đến hạn 24 giờ và việc cần nhận/duyệt; không phát push hoạt động thường xuyên. Không gửi Telegram/push thử. Samsung được đưa về Thao tác; Wi-Fi/dữ liệu di động/giữ màn hình khi cắm sạc giữ nguyên `1/1/7`.

Các điểm nghẽn 5–23 giây đã xác định được xử lý. Không có bản sửa bắt buộc nào khác được xác định từ phạm vi kiểm tra này. Vẫn có micro-jank khi cuộn nhanh; không chứng nhận 60/120fps hoặc không có lỗi trong mọi tình huống. Kiểm thử tải nhiều người, chạy dài nhiều giờ, mất sóng dài, iOS, upload thật và ghi nghiệp vụ production chưa nằm trong đợt nghiệm thu này.

Artifact, token tạm trong bộ nhớ, snapshot/plan/log/XML/ảnh thật chỉ ở `.backups/scoped-release-20261116` (ignored); không đưa env, khóa hoặc dữ liệu thật vào Git. Tham khảo phương pháp initPlan: [Supabase RLS performance](https://supabase.com/docs/guides/database/postgres/row-level-security), [PostgreSQL row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).
