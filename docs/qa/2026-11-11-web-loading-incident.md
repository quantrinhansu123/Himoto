# Kiểm tra web tải chậm — 11/11/2026

## Kết luận

Xác nhận hai vấn đề độc lập: truy vấn thông tin xe quá rộng trong luồng nhân viên cơ sở và tài khoản Cloudinary vượt hạn mức Free. Sau khi người dùng yêu cầu triển khai, đã bổ sung bốn covering index và schema kho ảnh trên production. Không thay đổi dòng nghiệp vụ hoặc phạm vi RLS.

Ảnh Infrastructure do người dùng cung cấp cho thấy compute Micro, CPU khoảng 93%, RAM khoảng 80%, Disk IO Balance 0%, trong khi dung lượng đĩa mới dùng 23%. Supabase giải thích hết Disk IO Budget sẽ làm instance bị giới hạn tốc độ: https://supabase.com/kb/troubleshooting/exhaust-disk-io. Đây là tài nguyên compute/I/O, không phải đầy đĩa hay bằng chứng project còn ở gói Free.

## Kết quả sau bổ sung index

Đo lại bằng cùng script/phạm vi cơ sở, cùng giới hạn 12 giây cho mỗi câu SQL:

| Luồng nhân viên | Trước | Sau |
| --- | ---: | ---: |
| Danh sách 10 hợp đồng | timeout 13.420 ms | 716 ms |
| Xe trả hợp đồng thứ nhất | timeout 12.586 ms | 576 ms |
| Xe trả hợp đồng thứ hai | timeout 12.543 ms | 340 ms |
| Nội dung Telegram thứ nhất | timeout 13.194 ms | 1.025 ms |
| Nội dung Telegram thứ hai | timeout 23.746 ms tổng nhiều câu SQL | 1.172 ms |

Tất cả bốn index đã được xác nhận `indisvalid=true`. Chỉ mục giữ nguyên SQL nghiệp vụ và kiểm tra quyền; cung cấp đường đọc thông tin xe/inventory mà không phải đọc heap JSON của toàn bộ lịch sử. Các phép đo là tầng dữ liệu, không phải p95 trang web hay bảo đảm tài nguyên Micro sẽ luôn đủ tải.

## Bản sửa ứng dụng và kiểm tra

- Ảnh mới lưu CloudFly; dữ liệu cũ được giải quyết bằng ánh xạ bất biến, không sửa revision/payload/hash Telegram. Công cụ đã chạy đợt thử 25/25 tệp, sau đó chuyển lịch sử với kiểm tra toàn bộ byte/SHA-256 và checkpoint.
- Web dùng ảnh xem trước private cố định 384 px, lazy loading và đường mở ảnh gốc. Đã kiểm tra Chromium desktop và WebKit 390 px: lưu ảnh qua CloudFly không tự trả xe, Enter không tạo giao dịch, nút xác nhận tạo đúng một lần trả mô phỏng, 0 lỗi JavaScript và không tràn ngang.
- Request trả xe/Telegram có deadline bao gồm cả đọc body; timeout thao tác ghi nói rõ cần kiểm tra trạng thái trước khi gửi lại. API trả xe đặt giới hạn câu SQL/khóa ngay từ đầu transaction.
- Đã qua: TypeScript/lint web và mobile; production build; 46 suite release; bộ mobile; 124 nhóm SQL trong PGlite; test CloudFly upload/biên nhận/rollback/lost commit với RLS thật trong PGlite; kiểm tra schema lặp lại; PostgreSQL 17.11 cục bộ với 9 nhóm ghi cạnh tranh và 4 nhóm xóa ảnh cạnh tranh.
- Đã kiểm tra CloudFly thật bằng ảnh tổng hợp: upload, đọc lại đúng byte, URL có chữ ký và truy cập ẩn danh bị từ chối; tệp thử đã dọn. Không dùng giao dịch vận hành để thử nghiệm hoặc gửi Telegram thật.

Xem cấu hình, lệnh chuyển và giới hạn video tại [cloudfly-media](../cloudfly-media.md). Kết quả triển khai và tổng số tệp cuối cùng được ghi sau khi đối chiếu production và hàng đợi chuyển hoàn tất.

## Bằng chứng

- GitHub deployment Production báo `success` cho commit `142dfb4`, tạo lúc 15:41:59 giờ Việt Nam.
- GET trang đăng nhập: HTTP 200, 479 ms. GET phiên chưa đăng nhập: HTTP 401, 111 ms. Đây chỉ là hai mẫu, không phải đánh giá tải toàn hệ thống.
- Đọc đúng hai hợp đồng được phản ánh bằng quyền nhân viên cơ sở Nguyễn Hoàng, dùng cùng phạm vi và vai trò `himoto_scoped` như ứng dụng. Mỗi phép đo trong transaction READ ONLY, đặt `statement_timeout=12s`, rồi rollback.

| Luồng dữ liệu | Quyền quản trị | Nhân viên cơ sở |
| --- | ---: | --- |
| Danh sách 10 hợp đồng | 465 ms | 13.420 ms, SQLSTATE 57014 tại bước lấy chi tiết xe |
| Xe trả của hợp đồng thứ nhất | 821 ms | 12.586 ms, SQLSTATE 57014 |
| Nội dung Telegram hợp đồng thứ nhất | 3.332 ms | 13.194 ms, SQLSTATE 57014 tại truy vấn dựng nội dung |
| Xe trả của hợp đồng thứ hai | 545 ms | 12.543 ms, SQLSTATE 57014 |
| Nội dung Telegram hợp đồng thứ hai | 1.034 ms | 23.746 ms, SQLSTATE 57014 khi dựng sự kiện tiếp theo |

Thời gian trên gồm nhiều câu SQL và thời gian truyền từ máy kiểm tra; không phải thời gian một câu SQL hay cam kết tốc độ giao diện. Không thực hiện POST trả xe hoặc gửi Telegram thật.

### Truy vấn và phạm vi quyền

- `contract_vehicle_labels()` đang dựng danh sách xe từ toàn bộ lịch sử hợp đồng được phép xem, dù người dùng chỉ mở một hợp đồng. EXPLAIN cho thấy đọc tuần tự bảng `orders`, nối bằng `IS NOT DISTINCT FROM`, rồi nối lịch sử dòng xe. Thống kê planner: khoảng 29.280 hợp đồng, 33.908 dòng xe.
- Gọi riêng hàm lấy nhãn xe dưới quyền cơ sở cũng vượt giới hạn 8 giây. Hàm đã có bản tối ưu ngày 08/11; sự hiện diện của migration đó chưa đủ để kết luận luồng hiện tại nhanh.
- Bước lấy chi tiết danh sách còn materialize `vehicle_inventory()`, gồm tính xe đang bị giữ, trong khi phần hiển thị chỉ cần nhãn và vị trí xe. Gọi riêng inventory đo được 7.128 ms.
- Snapshot hoạt động DB cho thấy chờ `DataFileRead`/`DataFilePrefetch`; không thấy truy vấn bị khóa tại thời điểm quan sát. Không suy rộng thành không có khóa ở thời điểm nhân viên gặp lỗi.
- Thử SELECT lấy nhãn và vị trí xe, giới hạn vào đúng hai hợp đồng trước khi nối, giữ kiểm tra actor/phạm vi: 311 ms, trả 2 xe. Đây là truy vấn ứng viên chạy bằng owner với predicate quyền tương đương, chưa phải bản sửa ứng dụng đã triển khai hoặc kiểm thử phân quyền đầy đủ.
- `returnRequest()` hiện dùng fetch không có deadline riêng. `contractTelegramRequest()` có abort sau 60 giây nhưng chưa race toàn bộ fetch và JSON với deadline như danh sách. Những điểm này có thể giữ giao diện ở trạng thái chờ khi transport không kết thúc; chưa có trace trình duyệt để khẳng định chính xác chuỗi chờ 15 phút trong ảnh.

### Cloudinary

Admin API của đúng cloud cấu hình trong ứng dụng trả:

- Plan: Free; credits usage 122,18 / 25, tương đương 488,72%.
- Credits: băng thông 82,17; transformations 28,04; storage 11,97.
- Khoảng 12,85 GB storage và 88,23 GB băng thông theo số byte API trả; usage có độ trễ cập nhật, `last_updated=2026-11-10`.
- Một HEAD của ảnh đã lưu trên hợp đồng phản ánh trả HTTP 200 trong 1.068 ms, không có `X-Cld-Error`. Không thử upload mới.
- Hai hợp đồng đang có 25 và 10 tệp; tất cả là tham chiếu storage, không chứa byte ảnh inline trong PostgreSQL. Dựng preview Telegram chỉ đọc metadata, không gọi Cloudinary để tải ảnh.

Cloudinary mô tả quota là soft limit: vượt hạn mức không đồng nghĩa bị ngắt ngay; tài khoản có thể bị vô hiệu hóa sau các cảnh báo và khi đó upload/transformation/delivery có thể bị chặn. Nguồn: https://cloudinary.com/documentation/programmable_media_asset_usage_data và https://cloudinary.com/documentation/billing_and_plans.

## Hướng xử lý

1. Giới hạn helper thông tin xe vào ID hợp đồng/xe thực sự cần đọc, giữ nguyên kiểm tra phạm vi; tránh gọi toàn bộ lịch sử và inventory đầy đủ trong chi tiết/phân trang.
2. Kiểm tra lại admin, nhân viên cơ sở, hợp đồng khác cơ sở, xe đã chuyển kho, xe đã lưu trữ và toàn bộ loại hợp đồng; so sánh dữ liệu trước/sau.
3. Bổ sung deadline cho toàn bộ request/đọc response. Với thao tác ghi, timeout phải hướng dẫn kiểm tra trạng thái trước khi gửi lại, không coi timeout là bằng chứng giao dịch chưa lưu.
4. Xử lý hạn mức Cloudinary theo nhu cầu vận hành; kiểm tra cache, kích thước và số lần đọc ảnh/video để giảm băng thông. Không xóa hồ sơ hoặc chuyển kho ảnh để thử nghiệm trên production.
5. Xác minh sau triển khai bằng quyền nhân viên và đo p50/p95 của API thực tế; không dùng kết quả đăng nhập/admin để thay cho các luồng này.

## Phạm vi kiểm tra

Giai đoạn điều tra chỉ GET/HEAD và truy vấn đọc dữ liệu nghiệp vụ. Sau khi được yêu cầu triển khai: thêm index/schema và ánh xạ bản sao lưu trữ, không trả xe, ghi thu chi, gửi Telegram, đổi gói tính phí hoặc thay function nghiệp vụ production. Script và kết quả chi tiết lưu ngoài Git tại `.backups/incident-20261111/`; báo cáo không chứa khóa truy cập, ảnh hay thông tin cá nhân của khách hàng.
