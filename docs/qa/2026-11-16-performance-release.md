# Hoàn thiện hiệu năng và thông báo — 16/11/2026

## Bản bàn giao

Đã triển khai các hạng mục được duyệt sau [đợt rà soát toàn hệ thống](2026-11-16-performance-audit.md). Source tối ưu web/mobile là `04bc642cdb9971a7aae6b1b8c15b3139fb284081`; backend cuối là `9ea7c93e4f3e6413a32d178d7836f7dc6f996a2f`. Cả hai đã push `main`. Vercel backend cuối Ready: `dpl_7XZPonS2MjBpVvsYiDiLKQs2hfoE`.

Samsung SM-N960N thật đã áp dụng OTA **17:46, 16/11/2026**, native/runtime `1.0.11`, Android code `12`. Không cài lại APK hoặc chạy giả lập. Các nhóm menu có mũi tên mở/thu gọn từ bản trước được giữ trong OTA này.

Đã đọc hướng dẫn repo, tài liệu Expo SDK 58/RN 0.88 và pull trước khi sửa. Không thêm native dependency, thay quyền, chạy migration hoặc đổi nhịp đồng bộ GPS một phút.

## Những phần đã thay đổi

- **Tích hợp:** client mới dùng `?view=config`, đọc cấu hình và checksum mới mà không đếm toàn bộ lịch sử GPS. Thống kê có endpoint riêng, chỉ tải khi mở Nhật ký/Thống kê. Chỉ cache tổng sự kiện không nhạy cảm trong 60 giây, có thời điểm thống kê; quyền, thông tin cấu hình và CAS ghi vẫn kiểm tra mới. Tải thống kê không thay nội dung đang soạn. Reader đầy đủ cũ giữ tương thích với app cũ.
- **Thông báo:** dùng một projection hợp đồng gọn, cùng domain hạn/nợ của web; mở nhóm nào mới đọc nhóm đó. Nhóm duyệt chỉ lấy hợp đồng còn cần xử lý, không quét lại toàn bộ hợp đồng đã kết thúc.
- **Ảnh xe web:** chỉ đọc metadata khi ảnh gần vùng nhìn thấy, chia sẻ request đang chạy giữa các layout. Đổi revision/tài khoản/phạm vi sẽ đọc mới; không giữ signed URL lâu dài.
- **Báo cáo:** sổ thu chi gom phần tổng hai chiều vào một phép đọc; thêm điều kiện ngày trước các phép xử lý JSON/lateral nặng ở một số báo cáo. Tổng, dòng và quy tắc phân bổ phí giữ nguyên. Không thay writer tài chính.
- **GPS web:** tách đọc thiết bị và lịch sử; chỉ đọc lịch sử khi mở phần đó. Không triển khai đồng bộ offline hai chiều hoặc đổi lịch provider.
- **Mobile:** giữ FlatList và cửa sổ tối đa 8 trang/160 dòng hiện hữu; dùng callback ổn định để memo card có tác dụng khi state khác đổi. Polling thông báo, hồ sơ tài khoản và trạng thái báo cáo ca chỉ chạy khi màn được focus và app ở foreground.

### Quy tắc thông báo

Ưu tiên hợp đồng **quá hạn** và **sắp đến hạn trong 24 giờ**, theo giờ Việt Nam và hạn thu/giao dịch của domain. Không xếp hợp đồng đã quá hạn vào nhóm sắp đến hạn. Loại hợp đồng đã hoàn thành, hạn không hợp lệ hoặc lỗi lịch thanh toán khỏi nhắc sắp đến hạn.

Giữ thêm hai nhóm có hành động cụ thể: **xe điều chuyển cần nhận** và **hợp đồng sở hữu cần duyệt**, theo quyền. Giao dịch và hoạt động thông thường vẫn đọc được trong Hoạt động, **không phát push cho từng hoạt động**.

Chỉ nhắc khi có công việc mới; công việc được giải quyết/rời nhóm không tạo push mới. Mỗi nhóm sắp đến hạn/quá hạn trên một thiết bị cách nhau tối thiểu **2 giờ**; nhóm không đổi không bị nhắc lặp. Giữ kiểm tra phiên, lease, chống gửi lại khi kết quả gửi không chắc chắn và cơ chế tắt thông báo hiện hữu. Không gửi push hoặc Telegram thử nghiệm trong đợt này; quy tắc gửi được kiểm tra tự động, không coi là kiểm thử nhận FCM đầu cuối trên Samsung.

## Kết quả production

Mỗi API 3 mẫu nối tiếp trên mạng đang dùng. Đây là mẫu nhỏ để đối chiếu, không phải SLA hoặc benchmark tải đồng thời/4G yếu. Tham số báo cáo theo client mới, gồm `section_pages={}`.

| Luồng | Trước tối ưu | Bản cuối |
|---|---:|---:|
| Tích hợp admin, cấu hình | 5.32–5.81 giây | 222 ms |
| Thông báo admin | 1.89–3.53 giây | 516 ms; lượt trước 291 ms |
| Thông báo quản lý chi nhánh | 2.856 giây | 296 ms |
| Sổ thu chi admin | khoảng 1.35–1.67 giây | 765 ms |
| Sổ thu chi quản lý chi nhánh | 1.421 giây | 808 ms |
| Thực thu admin | khoảng 1.54–2.18 giây | 1.559 giây |
| Thực thu quản lý chi nhánh | 1.876 giây | 1.923 giây |
| Doanh thu xe admin / chi nhánh | khoảng 1.28–1.65 giây | 1.472 / 1.164 giây |

Thống kê lịch sử GPS riêng có mẫu đầu **2.984 giây**, hai mẫu cache **99/98 ms**. Chi phí đếm lịch sử vẫn tồn tại khi cần đọc mới, nhưng không chặn mở cấu hình nữa. GPS mobile bản cuối: thiết bị 333 ms, lịch sử 113 ms; các lượt trước có dao động theo kết nối.

Đã đo lại **88 luồng API** trước bản sửa ranking cuối: 87 luồng trả 200; báo cáo đội xe chủ quản trả 403 đúng allowlist. Sau sửa, kiểm tra lại 7 luồng admin và 5 luồng chi nhánh: các luồng được phép đều 200; health Tích hợp trả 403 đúng quyền chi nhánh. Phiên QA tạm đã xóa, kiểm tra lại 401 và đếm còn **0 phiên QA**.

Web production: **27 trang desktop + 6 lượt viewport mobile**, tất cả 200, không lỗi JavaScript hoặc lỗi tải còn pending trong cửa sổ đo. Chặn request khác GET/HEAD; một lần refresh GPS POST tự động bị runner chặn, không gọi provider bằng runner.

Kiểm tra bổ sung web 1440px/390px: 10 ảnh xe chỉ phát tối đa **10 request metadata sau khi cuộn hết**, không trùng giữa layout; trước là 20. Lúc mở chỉ đọc ảnh gần viewport (7/1 trong lượt kiểm tra). Ảnh thật có sẵn tải được. Trang Tích hợp không gọi health khi mở, gọi một lần khi mở thống kê và hiện thời điểm thống kê. Thời gian ổn định trang Tích hợp trong lượt đo khoảng **1.43–1.46 giây**, trước 5.90–6.95 giây; số này có cả khoảng chờ yên của runner.

### Kiểm tra theo quyền đã loại một hồi quy

Phép thu hẹp khách hàng để xếp thứ tự hợp đồng đầu tiên nhanh hơn cho admin nhưng làm hai báo cáo chậm lên khoảng 3–4 giây dưới RLS của chi nhánh. Đã tái hiện hai lượt API, so reader cũ/mới trong cùng snapshot rồi bỏ riêng phép thu hẹp đó ở `9ea7c93`. Giữ xếp hạng lịch sử gốc và tối ưu gom sổ thu chi. Đã đo lại production như bảng trên; không dùng kết quả admin để kết luận cho mọi quyền.

## Samsung và cuộn

Đã mở **29 màn hợp lệ** trên SM-N960N với OTA mới, gồm hợp đồng và các nhóm con, xe/kho/điều chuyển, khách, chấm công/lịch sử, lịch ca, báo cáo ca/doanh thu, sổ quỹ, nhân sự/cơ sở, nhắc nợ, tài khoản, hướng dẫn, Tích hợp, Thông báo và GPS. Không thấy lỗi route hoặc lỗi đọc còn hiện trong các snapshot quan sát.

Kiểm tra riêng: Nhật ký GPS tải theo yêu cầu và hiện thời điểm thống kê; nhãn sắp đến hạn 24 giờ, mở danh sách quá hạn; màn GPS; Tài khoản xác nhận OTA 17:46. Chỉ điều hướng/đọc, không lưu cấu hình, tạo hợp đồng, thu tiền hoặc chấm công production. App được đưa về màn Thao tác; Wi-Fi, dữ liệu di động và cấu hình giữ màn hình khi cắm sạc giữ nguyên `1/1/7`.

Reset `gfxinfo` trước mỗi màn, 8 lượt vuốt/màn, cùng máy. P90/P99 là thống kê Android, không phải percentile API. Có trace native trước/sau, không phải JS CPU profile.

| Màn | Janky trước | Janky sau | P90 / P99 sau |
|---|---:|---:|---:|
| Xe | 5.70% | 4.21% | 14 / 22 ms |
| Hợp đồng | 8.82% | 6.05% | 16 / 18 ms |
| Khách hàng | 8.24% | 9.93% | 16 / 22 ms |
| Sổ quỹ | 5.15% | 5.23% | 15 / 19 ms |
| Báo cáo doanh thu | 1.15% | 4.28% | 14 / 19 ms |
| Tích hợp | 1.21% | 21.34%; đo lại 1.20% | lượt đầu 19 / 26 ms; đo lại 13 / 18 ms |

Đo lại Khách hàng 9.72%, Báo cáo doanh thu 4.84%. Các mẫu còn dao động và còn khung hình trễ khi vuốt nhanh; **không kết luận toàn app hết giật hoặc luôn 60/120fps**. Việc đổi callback có cơ sở từ luồng render, nhưng các trace này chưa quy kết được mọi khung trễ cho JS/component cụ thể. Không đổi cửa sổ render hoặc thêm thư viện native theo phỏng đoán chỉ để cải thiện một mẫu đo.

## Kiểm tra tự động và dữ liệu

- Web/mobile lint, typecheck: đạt. Build web đầy đủ đạt; Vercel build backend cuối Ready.
- `test:release`: 55 suite; `test:mobile`: toàn bộ lệnh; performance/parity mobile: đạt trong đợt triển khai.
- Sau thay đổi SQL cuối đã chạy lại kiểm tra báo cáo, **124 nhóm SQL tài chính PGlite**, web lint/typecheck: đạt.
- **44 đối chiếu đọc DB thật trong cùng snapshot** sau sửa cuối: admin và phạm vi một chi nhánh, ba bộ ngày/cơ sở; thực thu, hai chiều sổ thu chi, tổng đối ứng, doanh số dự kiến, tổng trang, dashboard và doanh thu xe khớp reader gốc. Danh sách quá hạn projection gọn khớp chính xác ID với reader web gốc: 115/10 tại snapshot kiểm tra.
- Nhóm thông báo, quyền/RLS, chính sách push, CAS/idempotency cấu hình, SQL GPS: đạt. Test mới gồm cửa sổ 24 giờ, loại hạn sai/đã xử lý, không nhắc lại khi giảm công việc, throttle 2 giờ, metadata ảnh chỉ gộp trong lúc tải, config không đếm lịch sử và timestamp health.
- Fixture mobile 390px sáng/430px tối: thống kê tải theo yêu cầu, không mất nội dung cấu hình đang soạn. Fixture thông báo 375px/430px: nhóm, Hoạt động, phân trang và retry đạt. Đây là fixture; phần Samsung thật được ghi riêng ở trên.
- Production public bản cuối: **23 kiểm tra đạt**, không thử đăng nhập bằng mật khẩu hoặc ghi nghiệp vụ.

Không benchmark writer production, upload media thật, mạng mất sóng dài, iOS, tải 50–100 nhân viên hoặc chạy dài nhiều giờ. Những phần này không được suy ra từ fixture/reader hoặc các mẫu cuộn trên Samsung.

## OTA và artifact

- Android production branch/channel; source client `04bc642cdb9971a7aae6b1b8c15b3139fb284081`.
- Runtime `1.0.11`, Android versionCode `12`; `androidPushConfigured=true`.
- Group `2fee7611-f791-41e6-8bd5-409fe115655c`.
- Update ID `01a1e3f7-5605-7e73-93df-52b785fae5be`, tạo `2026-11-16T10:46:39.877Z`.
- Bundle `entry-0c2d068d5385915af80359dd168111a1.hbc`, **8.934.333 bytes**.
- SHA-256 `88016c1e6565edf2f293ca7a79ae4943bf04c354970cf438955a85ab450f964f`.

Export từ source sạch tại `mobile`, dùng `EXPO_NO_DOTENV=1`, API/environment production và Firebase hiện hữu. Đã đọc manifest, tải bundle CDN theo asset headers, đối chiếu bytes/SHA-256. Runtime `1.0.9` vẫn giữ group `71e7a3fd-35c9-45f9-9e2f-f8db5772614f`. Sửa backend cuối chỉ thay SQL server, không cần phát lại bundle client.

Artifact/log/XML/ảnh/trace nằm cục bộ tại `.backups/performance-release-20261116`, ignored. Không đưa env, khóa, token, file export hoặc ảnh thật vào Git. Không gửi Telegram.
