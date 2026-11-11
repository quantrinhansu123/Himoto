# Worker độc lập, đọc hợp đồng có giới hạn và kiểm tra tải — 12/11/2026

## Phạm vi

Giữ Vercel, Supabase và CloudFly. GPS hiện tại, lịch sử và thông báo có execution riêng. Không đổi gói tính phí, ghi giao dịch thử trên production hoặc gửi Telegram thử. Người dùng không yêu cầu môi trường staging mới; toàn bộ thử tải chạy trong QA loopback cách ly, bằng dữ liệu giả.

## Thay đổi

- `/api/cron/integrations` chỉ nhận việc Telegram/push rồi trả response; không chờ GPS. Hai endpoint `/api/cron/gps-live` và `/api/cron/gps-history` có lịch/HTTP status/backoff riêng. Proof HMAC có thời hạn và nonce chống replay được bind theo đúng endpoint. Lịch thông báo 5 giây giữ nguyên.
- Lease dùng chung trong DB giới hạn GPS hiện tại, Telegram và push theo từng lane. Không giữ transaction/kết nối trong lúc chờ provider. Live GPS tối đa hai tài khoản/lượt, một tài khoản mỗi provider; mỗi tài khoản vẫn tối thiểu 60 giây/lượt. Cùng provider đang có lease thì không lấy thêm tài khoản để chờ advisory lock.
- Lịch sử mặc định hai cửa sổ/lượt, ngân sách fetch/body 8 giây, có lease riêng. Request lịch sử của Protrack cách nhau tối thiểu 15 giây theo tài khoản, IOPGPS 5 giây; chia sẻ giữa motion, alarms và các trang pagination. Tránh khoảng thời gian gần lượt live poll tiếp theo.
- `10009` là lỗi tần suất theo [tài liệu Protrack](https://app2.protrack365.com/api.html). Gặp lỗi: giữ nguyên coverage, nghỉ tăng dần 2/4/8/16/30 phút, tài khoản khác vẫn được xử lý. Không đăng nhập lại liên tục vì rate limit. Cửa sổ ít bản tin được tăng dần tới dưới một ngày; phản hồi thiếu/truncated/pagination chưa đủ bị thu nhỏ và thử lại, không tự nhảy checkpoint qua dữ liệu chưa xác minh.
- Danh sách thường chọn ID sau tìm/lọc/phân trang, rồi helper chỉ lấy nhãn/kho của xe trên các hợp đồng đó. Form sửa/in/trả xe/thu tiền/điều khoản và một số luồng mobile truyền ID cụ thể. Xe đã lưu trữ vẫn có nhãn theo hợp đồng; vị trí kho giữ quy tắc loại xe đã xóa giống `vehicle_inventory`.
- Lọc kho và tìm biển số chỉ đọc nhãn/vị trí cần thiết, không tính toàn bộ xe đang bị giữ hoặc lịch sử điều chuyển. Tìm hợp đồng có helper được kiểm tra quyền, gom cơ sở trước khi kiểm tra quyền từng cơ sở; RLS của truy vấn ngoài vẫn hoạt động. Kế hoạch cũ kiểm tra ownership cho nhiều dòng lịch sử khác cơ sở, ngay cả khi chỉ tìm một mã.
- Tổng tiền, bộ đếm, tìm kiếm và số trang vẫn xét đầy đủ dữ liệu phù hợp. Bộ lọc suy diễn như quá hạn vẫn đọc đủ tập ứng viên theo lô tối đa 250 để tính đúng tổng; không cắt thành 10 dòng và làm sai kết quả. Export/all và các nghiệp vụ cần tập rộng giữ luồng phù hợp.

## Kiểm chứng chức năng và quyền

- Typecheck/lint và production build qua. 48 suite release cũ+mới qua; thêm suite giới hạn cửa sổ provider qua riêng (49 suite trong cấu hình release cuối).
- PostgreSQL QA: 25 trường hợp đối chiếu projection nhãn/kho và trường hợp admin, cơ sở, ownership, xe khác kho, xe lưu trữ, hợp đồng/dòng đã xóa, ID lặp/NULL, thiếu actor. Đối chiếu vị trí kho và tìm biển số với projection cũ.
- 24 trường hợp tìm kiếm so ID với SQL RLS cũ: mã, tên không dấu, điện thoại, biển số chuẩn hóa, wildcard theo quy tắc hiện tại và không tìm thấy; ba phạm vi cơ sở/ownership. Không bỏ quyền hoặc bỏ kết quả cũ để làm nhanh hơn.
- Worker QA: tám caller GPS chỉ một lane được chạy; notification/push vẫn hoàn tất khi GPS bị giữ; completion lease cũ không xóa lease mới; lease và scheduler tables không cấp quyền cho scoped clients.
- Scheduler QA dùng HTTP giả trong transaction rollback: độc lập notification/live/history, chặn gọi sai endpoint/proof hết hạn, một request đang chờ, backoff lỗi và disable đúng lane khi 401. Không gửi request scheduler thật trong test.
- Lịch sử QA: Protrack 10009 không đổi coverage, không retry sớm, tăng cooldown; IOPGPS vẫn tiếp tục. Pagination dùng cùng rate gate, kết quả chưa đầy đủ không advance; body treo được deadline giải phóng lease. Provider window lớn hơn một ngày bị chặn trước khi gọi mạng.
- Production đã áp schema/helper trong transaction sau đối chiếu tại năm cơ sở và thiếu actor: projection cũ/mới giống nhau. Kiểm tra fixed `search_path`, SECURITY DEFINER, chỉ EXECUTE cho role phù hợp, worker tables không cấp SELECT cho `himoto_scoped`. Không cập nhật dòng nghiệp vụ trong bước này.

## QA tải hỗn hợp

Schema-only snapshot và grants lấy từ production; không copy dòng khách hàng, credential hoặc ảnh/video thật. Dữ liệu giả gồm 34.000 hợp đồng + 500 hợp đồng trả xe dùng một lần, 6.500 xe, 10.000 khách, 441 GPS, 2 triệu vị trí và 1,5 triệu sự kiện. PostgreSQL 17.11 riêng tại `127.0.0.1:55439`; Next production build tại cổng 3020, pool bốn kết nối như một Vercel instance. HTTP/socket guard chặn toàn bộ mạng ngoài; provider được mô phỏng.

Mỗi phiên làm mười lượt đọc hỗn hợp: danh sách, thống kê, tìm kiếm và form trả xe. Có trả xe fixture và gửi lại đúng request cũ để kiểm tra từ chối revision cũ. Worker live/history/notification chạy đồng thời. Mẫu dưới đây lấy ở lượt cuối chạy riêng, không đồng thời build hoặc release tests:

| Phiên đồng thời | Lượt đọc | p50 đọc | p95 đọc | p95 ghi trả xe |
| ---: | ---: | ---: | ---: | ---: |
| 5 | 50 | 62 ms | 495 ms | 124 ms |
| 10 | 100 | 88 ms | 706 ms | 217 ms |
| 20 | 200 | 202 ms | 1.492 ms | 362 ms |
| 40 | 400 | 344 ms | 2.688 ms | 687 ms |

750 GET và 75 lần trả xe fixture không lỗi ngoài dự kiến. Mỗi request trả xe gửi lại bị từ chối 409; kiểm tra trực tiếp DB phải có đúng 75 lượt hoàn tất và không có notification trùng. GPS giả chậm khoảng 30 giây không giữ response notification; kết quả thời gian chính xác và integrity cuối lưu trong `peak-results.json`.

Các lượt đầu đã phát hiện timeout do RLS/search và được giữ log. Có lượt fixture gửi sai phí trễ bị nghiệp vụ từ chối, và lượt kiểm thử provider chậm dùng timeout client 30 giây quá ngắn; đã sửa fixture/harness, không nới timeout API nhân viên để làm test đạt. Một lượt chạy cùng release tests có p95 cao hơn; không dùng để thay thế bảng đo riêng.

Đây là p95 HTTP QA cục bộ dưới burst, không phải p95 của Supabase Micro hoặc giờ cao điểm vận hành. Mục tiêu p95 đọc dưới một giây chưa đạt ở 20–40 phiên trong bài này. Không chứng nhận năng lực production từ phần cứng local; cần quan sát p95/tải thực tế và quyết định compute theo dữ liệu đó. Không tăng pool vô hạn hoặc tăng tải đọc bù để cố xóa backlog.

## Triển khai và quan sát

1. Áp `docs/sql/2026-11-12-bounded-contract-vehicles.sql`, `2026-11-12-independent-integration-workers.sql`, `2026-11-12-gps-job-schedules.sql` trước ứng dụng. Các dòng schedule mới mặc định disabled.
2. Deploy web/backend, xác nhận Vercel success cho commit. Sau đó `node scripts/configure-cloud-integration-sync.cjs --enable` tạo/bật hai cron GPS độc lập và giữ lịch notification hiện có; không gọi endpoint cron thủ công để thử gửi thông báo.
3. Quan sát account live cadence, lease/last_status của ba lane, lịch sử `covered_until`/lỗi/cooldown và HTTP status của từng scheduler. Backlog sẽ xử lý dần theo ngân sách provider; không coi việc triển khai là bằng chứng backlog đã bằng 0.
4. Đo mẫu production bằng phiên cơ sở, tối thiểu 30 mẫu cho danh sách/thống kê/form trả xe và có cửa sổ quan sát dài hơn một chu kỳ GPS. Không POST trả xe/thu chi hoặc Telegram thật để smoke test.

Bằng chứng riêng tư: `.backups/peak-20261112/`, gồm schema/grants trước sửa, parity, tải ban đầu/lượt cuối, production schema audit và phép đo sau deploy. Không commit secret QA, session cookie, URL có chữ ký hoặc dữ liệu khách hàng.

## Rollback

Quay ứng dụng về `a8d7030` hoặc bản có khả năng đọc ảnh CloudFly. Trước/đồng thời rollback, disable hai row `management_gps_job_schedule` và hai cron `himoto-gps-live-5s`, `himoto-gps-history-5s`; giữ `himoto-integrations-5s` vì bản cũ xử lý GPS qua endpoint đó. Giữ schema, index, checkpoint và nguồn media. Không reset coverage, trạng thái hợp đồng, outbox hoặc lease của tiến trình đang chạy để rollback.
