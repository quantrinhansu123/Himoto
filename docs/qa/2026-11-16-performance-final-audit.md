# Rà soát bổ sung trước bàn giao — 16/11/2026

## Kết luận

Đợt tối ưu trước đã phát hành, nhưng **còn điểm nghẽn cần xử lý trước khi chốt hoàn thiện hiệu năng**: truy vấn tổng hợp dưới quyền quản lý thuê sở hữu và danh sách Khách hàng khi chọn tất cả cơ sở. Không kết luận hết lag từ kết quả của admin hoặc chỉ từ việc mở đủ các màn.

Đợt này chỉ kiểm tra/đo và thử query trong transaction đọc; **chưa sửa code sản phẩm, policy, schema hoặc phát OTA mới**. Source được kiểm tra: backend `9ea7c93e4f3e6413a32d178d7836f7dc6f996a2f`, HEAD tài liệu `fdc9932`, client OTA `04bc642cdb9971a7aae6b1b8c15b3139fb284081`. Vercel HEAD tài liệu đã thành công; client vẫn là OTA 17:46, runtime `1.0.11`/code `12`. Manifest/CDN/SHA-256 và runtime `1.0.9` đã kiểm tra lại, giữ đúng bản đã phát.

## Phạm vi bổ sung

Nối tiếp [27 trang web, 88 luồng API và 29 màn Samsung](2026-11-16-performance-release.md) của đợt trước, lần này kiểm tra:

- 56 GET với 8 nhóm quyền thật: branch_staff, ownership_manager, accounting, branch_manager, headquarters_debt, headquarters_sales, hr, ownership_staff. Workspace, xe, khách, hợp đồng, thông báo, health Tích hợp và thực thu; trạng thái 200/403 khớp policy quyền hiện hữu. Có đối chiếu store của hợp đồng trả về với tài khoản giới hạn cơ sở; không đổi quyền người dùng.
- Đo lại riêng 3 API chậm, mỗi API 3 mẫu, bằng ownership_manager: cả bộ lọc tất cả cơ sở và bộ lọc cơ sở mặc định của client.
- Web đúng ownership_manager: Khách hàng, Hợp đồng, Báo cáo doanh thu ở desktop và viewport mobile, 6 lượt đọc thực. Cookie ngắn hạn chỉ giữ trong bộ nhớ; chặn request khác GET/HEAD.
- Profile reader DB dưới đúng actor/role; EXPLAIN ANALYZE SELECT trong transaction REPEATABLE READ READ ONLY, có timeout. Không chạy phân tích writer, migration hoặc thay cấu hình toàn DB.
- Samsung SM-N960N thật: 3 vòng đổi thứ tự Khách hàng/Báo cáo/Xe, mỗi màn 8 lượt vuốt, đợi hai snapshot hết loader, gồm cả nhãn “Đang tính báo cáo”. Thu histogram, framestats, trace native và PSS. Không đổi tài khoản trên điện thoại.
- Web 390px mô phỏng mạng 1,6 Mbps/150 ms và CPU chậm 4 lần, ở Khách hàng, Hợp đồng, Báo cáo, Tích hợp. Kiểm tra thêm phân trang, search không có kết quả, xóa search khôi phục dữ liệu từ cache. Đây là browser mô phỏng, **không phải đo Samsung trên 4G thật**.

## Các điểm chậm đã tái hiện

| Vai trò và bộ lọc | API Khách hàng | API Hợp đồng | API thực thu |
|---|---:|---:|---:|
| Quản lý thuê sở hữu, cơ sở mặc định | 144 ms | 192 ms | **5.453 giây** |
| Quản lý thuê sở hữu, tất cả cơ sở được quyền đọc | **5.449 giây** | **5.304 giây** | **14.959 giây** |

Đây là trung vị 3 mẫu/lượt, không phải p95/SLA. Bộ lọc “tất cả” vẫn chịu RLS, không đồng nghĩa được đọc toàn bộ doanh nghiệp. Một mẫu branch_staff ở danh sách Khách hàng với bộ lọc tất cả mất 4.947 giây. Không gán thời gian của bộ lọc tất cả cho màn mặc định.

Web với quyền quản lý thuê sở hữu và bộ lọc mặc định: Khách hàng/Hợp đồng ổn định khoảng 1,66–1,89 giây; Báo cáo khoảng **6,82 giây desktop / 7,47 giây viewport mobile**. Các lượt đều 200, không lỗi JS. Thời gian ổn định gồm khoảng chờ yên của runner, không phải thời gian thấy dữ liệu đầu tiên.

### 1. Khách hàng tính số hợp đồng trước khi phân trang

EXPLAIN cho query yêu cầu 5 khách cho thấy phép đếm hợp đồng qua lateral/index thực hiện **23.832 vòng** trước LIMIT; một execution 5.361 giây. Có index `orders_customer_id_idx`, nên không thể kết luận chỉ thiếu index. Cần giới hạn tập khách theo sort/filter trước khi hydrate số hợp đồng khi sort/filter cho phép, giữ fallback đúng cho trường hợp phụ thuộc cột tổng hợp.

Prototype chỉ trong transaction đọc, cùng snapshot, giữ RLS và so toàn bộ dòng/cột/số hợp đồng:

| Vai trò, trang | Query hiện tại | Prototype phân trang trước | Dữ liệu |
|---|---:|---:|---|
| ownership_manager, trang 1 | 6.865 giây | 96 ms | Khớp |
| ownership_manager, trang 2 | 5.774 giây | 74 ms | Khớp |
| branch_staff, trang 1 | 5.280 giây | 69 ms | Khớp |
| branch_staff, trang 2 | 4.832 giây | 75 ms | Khớp |

Đây là **prototype mặc định sort ID, chưa có search/status/store filter**, chưa phải implementation hoàn chỉnh. Trước phát hành cần mở rộng kiểm tra filter, sort, tổng số dòng, trang cuối và export. Không coi số query prototype là thời gian API production sau sửa.

### 2. Tổng hợp lặp kiểm tra quyền qua hàng chục nghìn hợp đồng

Plan thống kê hợp đồng quét và loại **29.145 dòng** theo điều kiện quyền; phần scan mất khoảng 4.738 giây. Plan phân bổ thực thu quét toàn bộ lịch sử cần thiết, loại **29.280 dòng**; scan khoảng 4.977 giây. Dưới role này, reader thực thu gồm các query phân bổ, dự kiến và tổng trang có thể cộng dồn gần 15 giây khi chọn tất cả.

RLS gọi `access_order_store(store_id)`; nhánh `ownership_may_use_headquarters_customer_source(store_id)` thực hiện kiểm tra actor/cơ sở. Cần đánh giá tập cơ sở được phép một lần trong mỗi statement thay vì lặp helper kiểm tra cho nhiều dòng, giữ policy RLS làm rào quyền. Hướng này phải kiểm chứng bằng plan và so dữ liệu trước/sau trên các role; chưa hứa thời gian sau sửa.

**Phải giữ nguồn khách trụ sở chính mà nghiệp vụ thuê sở hữu cho phép.** Không thay đơn giản thành `store_id = user.store_id` hoặc bỏ RLS để làm nhanh. Không cache quyền xuyên phiên/người dùng. Không thay writer tài chính hoặc rules phân bổ hợp đồng đầu tiên theo kỳ.

Đã kiểm tra giả thuyết JIT: cấu hình đầu transaction là `off`; bật/tắt chỉ trong transaction đọc cho ba query không tạo cải thiện rõ. Transaction đã rollback. Không đề xuất tắt JIT toàn hệ thống hoặc thêm index hàng loạt từ giả thuyết này. [PostgreSQL giải thích chi phí JIT](https://www.postgresql.org/docs/17/jit-decision.html).

## Samsung và độ mượt

9 lượt đo có **4.237 frame sample hợp lệ** (loại flag khác 0, lấy mẫu/deduplicate trong khi vuốt), frame dài nhất **39,07 ms**, không sample trên 50/100/700 ms. Histogram vẫn báo jank: Khách hàng 27,71% ở vòng đầu, 6,91%/8,25% ở hai vòng sau; Báo cáo 2,37%/1,17%/4,01%; Xe 6,15%/6,38%, vòng có trace 19,81%. Không chọn một mẫu đẹp để kết luận hết giật.

Không phát hiện crash ứng dụng, ANR ứng dụng hoặc ANR SystemUI mới trong cửa sổ đo. Chỉ lưu marker thuộc đúng app/SystemUI và mốc thời gian của lần chạy; không dùng lỗi cũ hoặc log app khác trên điện thoại. PSS dao động 250.636–267.335 KB, không tăng liên tục qua ba vòng; mẫu này không đủ chứng minh không có memory leak khi chạy dài.

Trace native có các frame `Choreographer#doFrame` chậm ngắn; không phải JS CPU profile và chưa xác định được một component JS cụ thể chịu toàn bộ jank. Có thể tối ưu thêm phần cuộn sau khi profile đúng chỗ; ưu tiên thấp hơn lỗi chờ báo cáo 5–15 giây. Không kết luận cache dữ liệu hoặc thay thư viện danh sách sẽ tự giải quyết chi phí render.

Theo [hướng dẫn Android về slow rendering](https://developer.android.com/topic/performance/issues/render), cần phân biệt frame trễ, frozen frame và ANR; mốc 700 ms dùng cho frozen frame. Mẫu vuốt này không đo mọi lần mở app/chuyển màn hoặc tất cả nghiệp vụ. [React Native cũng phân biệt luồng JS/UI](https://reactnative.dev/docs/performance).

## Web khi mô phỏng máy/mạng chậm

4 trang đều đọc được, không JS error hoặc API đọc lỗi trong lượt đo. FCP khoảng 1,73–1,97 giây; ổn định 3,43–5,91 giây. Long task lớn nhất từng trang 288–355 ms dưới CPU x4. Search/phân trang Khách hàng, trạng thái rỗng và khôi phục trang 1 đạt; xóa search có thể dùng cache nên không bắt buộc phát GET mới. Không dùng mô phỏng này làm cam kết cho mọi mạng di động.

## Hành động đề nghị

1. **Ưu tiên trước bàn giao:** hoàn thiện phân trang Khách hàng trước phần đếm/hydrate và tối ưu kiểm tra quyền trong các phép tổng hợp/read policy. Giữ đầy đủ các quyền đọc nguồn khách trụ sở chính. Đây chủ yếu là bản backend/DB, chưa có căn cứ cần APK/native mới.
2. Nghiệm thu bản sửa bằng các bộ lọc thực của admin, quản lý chi nhánh, nhân viên và thuê sở hữu; đối chiếu số tiền, tổng, phân trang/export; đo lại HTTPS và web đúng role. Không dùng chỉ tiêu admin thay cho role giới hạn cơ sở.
3. Tiếp tục tối ưu cuộn theo trace khi cần; hiện chưa thấy freeze/ANR trong mẫu Samsung, vẫn có micro-jank.

Không cần quét lại toàn bộ màn theo cùng cách trước khi xử lý hai điểm đã xác định. Sau sửa nên kiểm tra hồi quy tập trung, đồng thời nghiệm thu các luồng hợp đồng/thu tiền/gia hạn/trả xe trên dữ liệu thử được chọn riêng. Đợt này không tạo nghiệp vụ production; kiểm tra reader/native navigation không thay thế nghiệm thu writer hoặc upload media trên máy thật. Kiểm thử nhiều người đồng thời, mất sóng dài và iOS vẫn ngoài phạm vi đo.

Tất cả phiên QA tạm được xóa và kiểm tra token cũ trả 401. Artifact, SQL/plan, XML/ảnh thật chỉ ở `.backups/performance-final-audit-20261116` (ignored); không đưa token/env/ảnh vào Git. Không gửi Telegram. App được đưa về màn Thao tác, không đổi Wi-Fi/dữ liệu di động/cấu hình giữ màn hình.
