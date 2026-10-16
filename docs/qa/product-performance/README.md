# Kiểm tra tốc độ HIMOTO — 16/10/2026

Đã đo trực tiếp trên https://himoto.vercel.app trước và sau thay đổi. Bản code được kiểm tra: `e87c349` (Vercel báo triển khai thành công). Bản trước: `f71aede`.

## Kết quả chính

Lượt đo desktop sau tối ưu lấy trung vị của 3 lần mở mới mỗi màn hình, so với lượt đo trước khi tài nguyên đã được phục vụ trước đó. Thời gian dưới đây là thời gian màn hình ổn định trong phép đo, gồm chờ mạng yên 500 ms.

| Màn hình | Trước | Sau, trung vị 3 lượt | Giảm thời gian | Dữ liệu API trước → sau |
| --- | ---: | ---: | ---: | ---: |
| Thao tác nhanh | 6,78 s | 1,47 s | 78,3% | 45,70 MB → 2,03 KB |
| Hợp đồng | 5,99 s | 2,88 s | 52,0% | 45,70 MB → 37,07 KB |
| Khách hàng | 2,30 s | 1,55 s | 32,7% | 12,50 MB → 7,52 KB |
| Doanh số | 7,98 s | 2,83 s | 64,6% | 45,71 MB → 12,75 KB |

Dữ liệu API trong bảng là kích thước **sau giải nén**, cộng các API của màn hình; MB/KB dùng đơn vị thập phân. Bốn màn hình giảm hơn 99,9% lượng dữ liệu API được xử lý trong trình duyệt. Đây không phải kích thước truyền thực tế qua mạng: ví dụ trang hợp đồng trước đây truyền khoảng 2,96 MB dữ liệu API nén, rồi giải nén thành khoảng 45,70 MB.

Trong lượt đo chính, phần thời gian tác vụ JavaScript vượt 50 ms giảm tương ứng: Thao tác nhanh 223 → 59 ms, Hợp đồng 357 → 39 ms, Khách hàng 148 → 38 ms, Doanh số 304 → 69 ms.

## Đã thay đổi

- Danh sách hợp đồng và khách hàng trả 10–50 dòng mỗi trang. Server tính số lượng, trạng thái, tổng tiền và công nợ trên toàn bộ kết quả lọc trước khi cắt trang. Tìm kiếm, cơ sở, ngày, trạng thái và thứ tự sắp xếp cùng đi qua API.
- Khi cần quét toàn bộ danh sách, truy vấn chỉ lấy các trường phục vụ lọc/tính tổng; chi tiết giấy tờ, người thân và xe chỉ nạp cho trang đang xem. Các danh sách đã giới hạn bằng SQL như Nháp/VAT/Quá hạn dùng một lượt đọc. Xuất CSV vẫn lấy đủ kết quả lọc.
- Thao tác nhanh lấy số lượng tổng hợp. Doanh số lấy báo cáo đã tổng hợp theo khoảng ngày/cơ sở. Hai màn hình này không tải toàn bộ hợp đồng vào trình duyệt.
- Truy vấn hợp đồng gom khoản cọc, người phụ trách và thông tin xe theo nhóm. Báo cáo doanh số dùng chung một lần tính CTE cho doanh thu đã phân công/chưa phân công.
- Form hợp đồng lấy khách hàng qua tìm kiếm toàn hệ thống, không tải trước toàn bộ hồ sơ khách hàng. Trang đã xem được giữ tối đa 30 giây trong phiên; cập nhật dữ liệu làm mất hiệu lực cache tương ứng. Tìm kiếm chờ 250 ms và hủy yêu cầu cũ ở phía trình duyệt.
- Giữ Roboto cho Latin và tiếng Việt, bỏ các bộ ký tự không dùng; CSS production giảm từ 146.500 xuống 127.752 byte, khoảng 12,8%. Tái sử dụng bộ định dạng ngày/số cho các bảng.

Phân trang hiện vẫn đọc tập trường gọn để lọc và tính tổng tại server; đây chưa phải truy vấn SQL `LIMIT`/cursor hoàn toàn. Vì vậy thời gian API vẫn phụ thuộc số lượng bản ghi và thời gian phản hồi cơ sở dữ liệu.

## Toàn bộ 16 màn hình

Một lượt mở mới từng màn hình, cùng thứ tự trước/sau. Giữ cả các lượt chậm; không dùng bảng này để khẳng định mọi màn hình đều nhanh hơn.

| Đường dẫn | Trước, giây | Sau, giây | API trước, byte | API sau, byte |
| --- | ---: | ---: | ---: | ---: |
| `/operations` | 15.31 | 3.80 | 45,702,768 | 2,026 |
| `/vehicles` | 1.83 | 1.92 | 182,488 | 182,488 |
| `/customers` | 2.22 | 5.44 | 12,502,309 | 7,516 |
| `/contracts` | 8.12 | 3.89 | 45,703,874 | 37,069 |
| `/contracts/drafts` | 1.64 | 1.58 | 443,557 | 36,884 |
| `/contracts/overdue` | 1.55 | 1.95 | 56,937 | 23,194 |
| `/contracts/vat` | 1.50 | 1.86 | 18,509 | 20,794 |
| `/contracts/ownership` | 1.55 | 1.72 | 418,613 | 23,151 |
| `/contracts/due` | 6.52 | 1.50 | 45,703,874 | 3,087 |
| `/contracts/battery` | 1.69 | 2.33 | 10,865 | 10,865 |
| `/contracts/types` | 1.45 | 1.45 | 2,842 | 2,842 |
| `/cashbook` | 1.95 | 2.48 | 19,597 | 19,597 |
| `/staff` | 1.55 | 1.55 | 9,732 | 9,732 |
| `/duty-roster` | 1.64 | 1.45 | 9,796 | 9,796 |
| `/stores` | 1.56 | 1.56 | 1,736 | 1,736 |
| `/staff-sales` | 10.50 | 2.83 | 45,711,112 | 12,745 |

Trang khách hàng có một lượt chậm 5,44 s, trong đó chờ phản hồi API khoảng 4,10 s; ba lượt tiếp theo là 1,52 / 1,55 / 1,69 s. Chưa cô lập nguyên nhân cụ thể của lượt chậm đó. Lần đầu sau triển khai cũng có độ trễ tải tài nguyên lớn hơn các lượt sau. Những số liệu này được giữ trong JSON, cùng kết quả đo lại.

## Màn hình nhỏ

Chromium, viewport 390×844; một lượt mỗi màn hình. Đây là kiểm tra ở kích thước điện thoại, không mô phỏng CPU/mạng của thiết bị thật. Lượt đầu của chuỗi trước/sau có điều kiện cache khác nhau nên không suy ra phần trăm cải thiện cho lần mở đầu.

| Đường dẫn | Trước, giây | Sau, giây |
| --- | ---: | ---: |
| `/operations` | 20.38 | 1.34 |
| `/contracts` | 6.14 | 2.75 |
| `/customers` | 3.34 | 1.50 |
| `/staff-sales` | 9.33 | 2.86 |

## Kiểm chứng chức năng

- Build, lint và typecheck qua. Các kiểm tra quản lý dữ liệu, hợp đồng, công nợ, doanh số và bản nháp qua; chi tiết số lượng trong `verification.json`.
- Truy vấn chỉ đọc đối chiếu 25.570 hợp đồng và 22.850 khách hàng: chi tiết dòng, phân trang, lọc, sắp xếp, tổng tiền và công nợ khớp cách đọc cũ. Sáu phạm vi danh sách, thống kê thao tác nhanh và báo cáo doanh số theo tháng/khoảng dài đều khớp.
- So sánh báo cáo doanh số SQL cũ/mới: kết quả bằng nhau ở hai khoảng ngày; thời gian đo 2.141 → 932 ms và 1.749 → 970 ms. Không đổi quy tắc ghi nhận thu/cọc/hoàn tiền.
- Chrome và WebKit qua 5 kiểm tra mỗi trình duyệt: tổng toàn bộ danh sách, cache trang trước, tìm kiếm, thử lại sau lỗi, chọn dòng qua nhiều trang, xuất đủ CSV và mở form không tải hết khách hàng.
- WebKit qua 8 kiểm tra CCCD/biển số, giữ dữ liệu khi hủy chọn ảnh. Chrome qua 3 kiểm tra tách khoản cọc, tự tính số còn lại và payload thanh toán. API nghiệp vụ/AI của các kiểm tra thao tác đều được giả lập.
- 6 kiểm tra GET trực tiếp trên Vercel qua: phân trang khách hàng, sắp xếp VAT/thuê sở hữu, từ chối kích thước trang vượt giới hạn và từ chối yêu cầu không đăng nhập.
- Cả 16 màn hình desktop và 4 màn hình nhỏ đều HTTP 200, không có lỗi JavaScript hoặc API thất bại trong các lượt đo cuối. Các phép đo/đối chiếu dữ liệu thật không ghi dữ liệu nghiệp vụ.

## Phương pháp và tái chạy

Playwright Chromium, desktop 1440×1000 hoặc viewport nhỏ 390×844, múi giờ Việt Nam, phiên đăng nhập có quyền quản lý. Mỗi lượt tạo browser context mới. Không giới hạn mạng/CPU. Mốc ổn định chờ API bắt đầu, bảng hết trạng thái tải, mạng yên 500 ms và hai khung hình. Các tài nguyên Next.js được prefetch cũng có thể làm tăng mốc này.

Các trường `blockingMs` là tổng phần thời gian vượt 50 ms của long task trong cửa sổ đo, không phải chỉ số TBT Lighthouse chuẩn. Đây là đo thử từ máy kiểm tra, không phải Core Web Vitals thu thập từ người dùng. Lượt baseline 16 màn hình đầu chưa thu long task đúng nên hai trường tương ứng được đặt `null`; dùng `before-observed.json` cho so sánh này.

```powershell
python scripts/measure-product-performance.py --session-cookie-file <private-cookie-file> --output .backups/product-performance/recheck.json
python scripts/measure-product-performance.py --session-cookie-file <private-cookie-file> --routes /operations,/contracts,/customers,/staff-sales --runs 3 --output .backups/product-performance/recheck-main.json
node scripts/check-management-table.cjs --live-read
python scripts/check-management-table-ui.py --session-cookie-file <private-cookie-file> --url http://127.0.0.1:3102
```

Các JSON kèm theo chỉ chứa số liệu tổng hợp, trạng thái HTTP và đường dẫn tài nguyên; không chứa cookie, khóa API, nội dung hồ sơ hoặc ảnh khách hàng. Cookie kiểm tra được giữ trong thư mục bỏ qua bởi Git và đã xóa sau khi hoàn tất.
