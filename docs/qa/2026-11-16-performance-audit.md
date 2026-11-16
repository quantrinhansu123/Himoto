# Rà soát hiệu năng web và mobile — 16/11/2026

Các hạng mục được duyệt sau đợt audit này đã triển khai. Xem [biên bản bản phát hành và kết quả đo lại](2026-11-16-performance-release.md); các số liệu dưới đây là baseline trước triển khai.

## Kết luận và trạng thái

Còn các điểm cần tối ưu ngoài GPS. Ưu tiên màn Tích hợp, thông báo, request ảnh xe web và truy vấn báo cáo. Samsung có khung hình trễ khi cuộn danh sách; cần profile riêng trước khi thay cấu hình render. Chưa có cơ sở tuyên bố toàn app luôn 60fps hoặc mọi màn đều mở tức thì.

Đây là **đợt đo và đề xuất, chưa triển khai tối ưu mới**. Source khảo sát là `4f48d863f3116d155983dde1a7ed11db509cbd9d`. Thay đổi menu thu gọn đã được người dùng yêu cầu riêng và đã phát, xem [biên bản menu](2026-11-16-mobile-drawer.md). Các tối ưu GPS/cache trước đó vẫn giữ nguyên.

## Phạm vi và phương pháp

- Lập danh mục 133 tệp route mobile, gồm màn chính, màn phụ và kết quả; 27 trang quản lý web. Quét cấu trúc 512 tệp UI/hooks mobile và web, lập danh sách query, polling và loại danh sách, sau đó đọc các đường tải có dấu hiệu nặng. Đây không phải chứng nhận mọi trạng thái của từng màn.
- Đọc 87 luồng API/biến thể bộ lọc, 3 mẫu/lượt, với quyền admin của phiên Samsung. Kiểm tra lại tham số thực tế khi cần và 12 luồng với tài khoản `branch_manager`, gồm báo cáo, hợp đồng, khách, xe, chấm công và thông báo. Không đổi quyền tài khoản.
- Web production: 27 trang desktop, 6 lượt viewport mobile và 6 lượt kiểm tra lại, tổng 39 lượt. Browser có xác thực, chặn mọi request khác GET/HEAD. Lưu TTFB, FCP, long tasks, waterfall API, dung lượng và số request; không lưu response nghiệp vụ vào báo cáo.
- Samsung SM-N960N thật, USB ADB, native `1.0.11`/code `12`, OTA menu **16:23, 16/11/2026**: mở 40 route hợp lệ, gồm nhóm chính và đọc hồ sơ/chuẩn bị nghiệp vụ. Đo thêm 8 lượt vuốt/màn cho 6 màn, reset `gfxinfo` trước từng màn. Không chạy giả lập.
- DB: gọi reader hiện hữu trong transaction đọc; ghi lại thời gian các query và `EXPLAIN (FORMAT JSON)` không ANALYZE cho truy vấn đáng ngờ. Thời gian DB từ máy phát triển bao gồm mạng và hàng đợi trên một connection; không coi là thời gian CPU SQL thuần.
- Đọc 6 file Excel production với đúng format/header client, không mở form ghi. Phiên audit mobile ngắn hạn đã xóa và kiểm tra lại 401. Cookie web dùng thời hạn ngắn, chỉ nằm trong bộ nhớ trình đo.

Đây là mẫu nhỏ trên mạng đang sử dụng, không mô phỏng 4G yếu, không kiểm thử tải hàng chục người đồng thời và không đủ tính p95/p99 API ổn định. Các thống kê percentile `gfxinfo` dưới đây là thống kê khung hình của Android, không phải percentile API. Một số runner có chạy đồng thời trong pha đối chiếu; số liệu dùng tìm điểm nghẽn, không làm SLA.

## Các điểm phát hiện

| Mức | Khu vực | Bằng chứng | Đề xuất cụ thể |
|---|---|---|---|
| Ưu tiên 1 | Tích hợp GPS/Telegram, web và app | API trung vị 5.32–5.81 giây qua hai lượt; web chờ ổn định 5.90–6.95 giây. SQL health chiếm khoảng 4.60 giây trong reader 4.96 giây | Tách health/thống kê khỏi cấu hình và checksum ghi; không đếm lại toàn lịch sử khi mở trang. Dùng số tổng hợp/checkpoint hoặc cache ngắn hạn có thời điểm cập nhật cho health; cấu hình/quyền/CAS vẫn đọc và kiểm tra mới |
| Ưu tiên 1 | Thông báo mobile | API admin trung vị 1.89 và 3.53 giây qua hai lượt; `branch_manager` 2.86 giây. Reader riêng 2.61 giây | Tạo phép đọc số lượng đúng domain cho due/overdue, tránh dựng toàn bộ dòng hợp đồng hai lần để lấy count. Mở nhóm nào mới đọc danh sách nhóm đó; giữ nguyên cách tính hạn/nợ và quyền |
| Ưu tiên 1 | Ảnh ở danh sách xe web | Trang 10 xe gửi **20 request metadata ảnh tới 10 URL**, lặp ở cả desktop và viewport mobile, kiểm tra lại vẫn lặp; tổng khoảng 25–26 request API lúc mở | Chia sẻ/deduplicate metadata giữa hai layout hoặc trả projection ảnh cần thiết cùng trang xe, lazy-load phần ảnh theo vùng nhìn thấy. Invalidation theo revision và phạm vi tài khoản, không cache quyền/signed URL vô thời hạn |
| Ưu tiên 2 | Báo cáo doanh thu/thu chi/dashboard | Thực thu khoảng 1.54–2.18 giây; sổ thu chi 1.35–1.67 giây; doanh thu xe 1.28–1.65 giây trong các mẫu admin/branch. Payload phần lớn nhỏ | Profile từng phép tổng hợp dùng chung rồi gom phần tính lặp trong cùng snapshot. Tách summary/detail khi thích hợp, kiểm tra index theo plan thực tế. Đối chiếu tổng, lọc và scope trước/sau; giữ nguyên writer tài chính |
| Ưu tiên 2 | Cuộn danh sách native | `gfxinfo` ghi nhận 7.83% khung janky ở xe, 7.71% hợp đồng, 4.94% khách; xem bảng chi tiết | Trace JS/UI/render để định vị card/ảnh và cập nhật state, kiểm tra callback props làm mất lợi ích memo; thay từng điểm rồi đo lại. Chưa kết luận phải đổi FlatList sang thư viện khác |
| Ưu tiên 3 | GPS web | GET `/api/auth/gps` trả khoảng 310.5 KB JSON giải nén/31.6 KB nén, khoảng 329 ms; web tải cả fleet và lịch sử rồi mới lọc/phân trang trên máy | Có thể áp dụng phân tách thiết bị/lịch sử và phân trang server tương tự mobile khi cần mở rộng. Hiện chưa phải điểm chậm nhất; giữ nhịp provider một phút |
| Ưu tiên 3 | Polling màn phụ mobile | Notifications dùng interval 60 giây không có screen-focus gate; managed-account dùng foreground 15 giây nhưng chưa kiểm tra focus; status báo cáo ca còn polling theo trạng thái | Rà soát các màn còn mounted phía sau, thêm focus gate phù hợp và phục hồi khi quay lại. Đây là kết quả đọc code, chưa đo số request thừa thực tế trên Samsung. Không cắt cơ chế đối chiếu giao dịch chưa rõ kết quả |

### Căn cứ điểm nghẽn Tích hợp

[integration-settings.ts](../../src/lib/server/integration-settings.ts) lấy health bằng hai `COUNT(*)` trên `management_gps_status_events` cho source history/webhook trong cùng lượt tải cấu hình. Plan production có hai Seq Scan; thống kê bảng khoảng **1.97 triệu dòng** (ước tính, không phải COUNT chính xác). Index lấy top 100 lịch sử đã phát trước đó phục vụ kiểu truy vấn khác, không giải quyết việc đếm toàn bảng này.

[mobile-integrations.ts](../../src/lib/server/mobile-integrations.ts) đợi health xong rồi mới trả DTO cấu hình. Các câu query trong `Promise.all` dùng cùng một connection vẫn xếp hàng; chỉ thêm `Promise.all` không loại được phần quét lớn. Cần tách dữ liệu health, không làm cũ checksum cấu hình dùng để chống ghi đè.

### Căn cứ thông báo và ảnh

[mobile-notifications.ts](../../src/lib/server/mobile-notifications.ts:32) gọi `readManagementTable(... all: '1')` cho cả due và overdue để dựng fingerprint rồi mới trả số lượng. Domain hợp đồng đầy đủ giúp đúng nghiệp vụ nhưng chi phí lớn so với payload phản hồi chỉ 168 bytes. Khi tối ưu phải giữ đúng các trường hợp nợ xấu, lịch trả góp, trả xe, grace period và RLS; không dùng count đơn giản theo status thay thế.

[DataTable.tsx](../../src/components/management/DataTable.tsx:57) và [ManagementMobileList.tsx](../../src/components/management/ManagementMobileList.tsx:118) cùng dựng `VehicleThumbnail`. [VehicleThumbnail.tsx](../../src/components/management/VehicleThumbnail.tsx:8) fetch metadata `cache: no-store` theo từng instance; CSS ẩn layout không ngăn effect của instance đó chạy. Waterfall xác nhận URL bị đọc hai lần, không chỉ suy luận từ code.

## Những phần chưa thấy là điểm nghẽn lớn trong mẫu hiện tại

Sau dùng đúng tham số và pagination mà app thực sự gửi: 86/87 luồng API trả 200; luồng còn lại là báo cáo đội xe chủ quản trả 403 **đúng allowlist** của tài khoản audit. Trong 86 luồng thành công, 70 luồng có trung vị dưới 300 ms; trung vị của các trung vị khoảng 129 ms. Không dùng số này cho tất cả tài khoản hoặc mạng di động.

Danh sách xe/khách/hợp đồng thường, kho xe, lịch trực, đăng ký ca, hồ sơ nhân sự/cơ sở, đọc ngữ cảnh thu tiền/gia hạn/trả xe, loại hợp đồng, quyền tài khoản, hướng dẫn và GPS đều đã có mẫu đọc. GPS mobile khoảng 108–128 ms trong lượt này; không đổi nhịp đồng bộ một phút.

Các trường hợp sau được kiểm tra lại để tránh báo nhầm lỗi sản phẩm:

- Báo cáo ca/nhắc nợ ban đầu dùng sai bộ lọc do runner, tài khoản dùng sai đường API: đã sửa runner theo client thật, trả 200. Route giả định `vehicle-history` không có ID và `cashbook/accounts` không tồn tại; loại hai lần dò khỏi thống kê màn hợp lệ, kiểm lại đúng route.
- JSON khách mới 108 KB là nhánh legacy không gửi `section_pages`; app hiện gửi `section_pages={}`, còn khoảng **13.65 KB**. Không đề xuất làm lại pagination đã có.
- `/operations` có một mẫu FCP 7.87 giây khi bắt đầu phiên browser; ba lượt kiểm tra lại FCP 0.37–0.63 giây, chờ ổn định 1.46–1.76 giây. Chưa tái hiện được nên không coi là lỗi mở Thao tác nhanh cố định.
- Báo cáo thực thu không cung cấp nút xuất file theo domain hiện hành; runner dò endpoint export nhận 400 đúng kiểm tra. Đã đo file hợp lệ ở báo cáo sổ thu chi.
- Không dùng việc có `ScrollView` làm bằng chứng tự động rằng màn chậm: form và các section báo cáo đã giới hạn số dòng vẫn có thể dùng nó hợp lý.

Web: 27 trang desktop đều trả 200, không lỗi JS trong các lượt đo; trung vị thời gian ổn định khoảng 1.86 giây. Chỉ số ổn định bao gồm khoảng chờ yên request của runner, không phải thời gian đầu tiên người dùng thấy dữ liệu. Request bị hủy do effect đổi bộ lọc được tách khỏi lỗi HTTP; không có chứng cứ từ đó để kết luận ghi nghiệp vụ lỗi.

## Samsung: cuộn và đọc màn hình

| Màn | Khung được ghi | Janky do Android báo | P90 | P99 |
|---|---:|---:|---:|---:|
| Xe | 549 | 7.83% | 15 ms | 22 ms |
| Hợp đồng | 428 | 7.71% | 15 ms | 20 ms |
| Khách hàng | 547 | 4.94% | 15 ms | 20 ms |
| Sổ quỹ | 537 | 4.28% | 14 ms | 21 ms |
| Báo cáo doanh thu | 517 | 2.13% | 13 ms | 18 ms |
| Tích hợp | 467 | 1.07% | 13 ms | 18 ms |

Mỗi mẫu 8 lượt vuốt sau khi hết loader, cùng SM-N960N; đây là mẫu chẩn đoán, không phải bảo đảm FPS. Thời gian dump/ADB không nằm trong cửa sổ vuốt, nhưng hành vi thử nghiệm và hệ thống vẫn ảnh hưởng thống kê. Chưa có trace JS/UI để quy kết jank cho một component cụ thể.

Phép đo mở màn dùng intent + UIAutomator có overhead khoảng vài giây: đa số hết loader ở lần dump đầu, Tích hợp cần 3 lần (quan sát khoảng 7.56 giây), Báo cáo doanh thu/Thông báo cần 2 lần. Không gọi những số này là API latency, TTID/TTFD chính xác hoặc so sánh phần trăm tăng tốc. Không thấy crash trong các lần điều hướng quan sát, không suy rộng sang mọi nghiệp vụ.

## Excel production

| File và bộ lọc | Dòng theo header export | Bytes | Thời gian một mẫu |
|---|---:|---:|---:|
| Xe, toàn cơ sở | 418 | 32.222 | 1.12 giây |
| Khách hàng, toàn cơ sở | 23.829 | 1.445.591 | 5.45 giây |
| Hợp đồng quá hạn, toàn cơ sở | 114 | 17.121 | 1.27 giây |
| Sổ quỹ, 01–16/11 | 2.071 | 132.814 | 0.89 giây |
| Báo cáo sổ thu chi, 01–16/11 | 2.065 | 176.502 | 2.76 giây |
| Chấm công, 01–16/11 | 4 | 7.070 | 0.15 giây |

Tất cả 200, MIME XLSX và ZIP bytes đúng. Số dòng ở đây lấy từ header, không phải một đợt đối chiếu lại nội dung từng workbook. CSV JSON compatibility và endpoint không có chức năng export bị loại khỏi kết luận hiệu năng tải XLSX. File khách toàn bộ lớn hơn nhiều so với một trang danh sách; chưa có căn cứ coi 5.45 giây/23.829 dòng là lỗi treo app. Cân nhắc job xuất ngầm khi nhu cầu/dữ liệu tăng, không triển khai hàng đợi toàn hệ thống ngay chỉ từ mẫu này.

## Kiểm tra và giới hạn

Đã chạy lại `test:mobile:performance`, `test:mobile:navigation`, `test:management-loading`: đạt. Menu đã đạt mobile lint/typecheck, 4 cấu hình browser và Samsung thật. Không thay mã tối ưu, index, RLS, cấu hình DB hay nhịp collector trong đợt audit này.

Không chủ động tạo/sửa hợp đồng, thu tiền, trừ kho, chấm công, upload media hoặc gửi Telegram/push thử nghiệm. App và collector production hiện hữu vẫn hoạt động bình thường. Thời gian lưu giao dịch có tranh chấp, upload ảnh/video thật, 4G yếu/mất sóng dài, thiết bị iOS, 50–100 người đồng thời và load dài nhiều giờ **chưa được benchmark**. Không biến kiểm tra reader/fixture thành kết luận đã nghiệm thu writer trên máy thật.

Các kết quả automated trước đó về idempotency/CAS, offline, full export và SQL tài chính vẫn có trong [biên bản GPS](2026-11-16-mobile-gps-performance.md); không chạy lại ghi production để lấy thời gian cho audit này.

## Phạm vi đề nghị duyệt

1. Tách health Tích hợp khỏi cấu hình; tối ưu count thông báo theo domain. Không cache quyết định quyền/ghi hoặc sửa cách tính tiền.
2. Loại request metadata ảnh xe web trùng; đảm bảo đổi ảnh/phạm vi tài khoản làm mới đúng.
3. Tối ưu phép tổng hợp báo cáo được đo là nặng và đo trace cuộn native; chỉ sửa điểm có bằng chứng. Bổ sung focus gate cho polling màn phụ khi xác nhận được vòng đời cần thiết.

Tiêu chí nghiệm thu: cùng bộ lọc/scope cho kết quả và tổng tài chính không đổi, ảnh không cũ sau sửa, không tải lặp, đọc lại khi focus đúng, refresh không vượt cửa sổ 8 trang, không ảnh hưởng đối chiếu ghi. So sánh lại API và cuộn trên cùng Samsung; báo số thực đo, không hứa trước “0 ms” hoặc 120fps. Không cần chuyển monorepo/thêm MMKV/PowerSync, Realtime hay tăng gói từ kết quả hiện tại.

Artifact chỉ lưu cục bộ trong `.backups/performance-audit-20261116`: inventory/source scan, API admin/branch/paged, web waterfall, SQL plans, native XML/screenshot/gfx và export timings. Không đưa token, env, response nghiệp vụ, ảnh thật vào Git. Script QA riêng bị loại/điều chỉnh tiêu chí đều được giữ để truy vết; không tính mẫu sai làm lỗi sản phẩm.

Tài liệu đối chiếu: [PostgreSQL 17 EXPLAIN](https://www.postgresql.org/docs/17/using-explain.html), [TanStack Query v5 và vòng đời React Native](https://tanstack.com/query/latest/docs/framework/react/react-native), [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/).
