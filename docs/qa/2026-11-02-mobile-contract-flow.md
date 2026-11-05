# Native nhập hợp đồng và thêm khách tại chỗ — 02/11/2026

## Thay đổi

- Soạn hợp đồng chia năm phần theo web: Hợp đồng & pháp lý, Khách hàng,
  Phương tiện, Chi phí, Ký kết & ghi chú. Ngày/giờ thuê nằm trong Phương tiện;
  chi phí, yêu cầu khi in và ghi chú được tách đúng khu vực. Lỗi mở đúng phần.
- Thêm khách ngay trong hợp đồng bằng CustomerForm dùng chung. Hủy có xác nhận;
  dùng đúng hồ sơ đã tạo và giữ số hợp đồng, xe/người lái, lịch và giá đã nhập.
- Khách thường mặc định `active`, hồ sơ tạm `draft` phải chọn rõ. Không đổi
  validation hoặc điều kiện phát hành trên backend để cho phép lưu thiếu.
- Khi tạo khách thành công nhưng mất phản hồi hoặc tải lại hồ sơ lỗi: giữ UUID/
  receipt và khóa tạo lại; dùng kết quả đã lưu trước khi trở về hợp đồng.
- Bản QA/staging có nhãn môi trường; dev build chưa có khai báo môi trường hiển
  thị “Bản phát triển · Chưa xác nhận dữ liệu thật”. Bản release mặc định không
  có nhãn dev. Không fallback sang fixture khi API thật lỗi.

Đây là lát triển khai CF-01/CF-03, chưa đủ parity toàn bộ hợp đồng. Khách trùng,
ảnh/OCR khi nhập khách/hợp đồng, full fields/defaults/modes, xóa nháp và những
action còn lại vẫn nằm trong backlog. Chưa chuyển module GPS/lịch trực từ repo
đồng nghiệp trong mốc này.

## Kiểm tra đã terminal

| Kiểm tra | Kết quả | Bằng chứng |
| --- | --- | --- |
| Mobile typecheck/lint | Đạt, 0 lỗi | Các lệnh đã chạy trực tiếp sau sửa source |
| API/client/form | 22 script đạt; không ghi dữ liệu vận hành | `.backups/mobile-contract-flow-unit-20261102.log` |
| Browser hợp đồng | 15/15; 0 page error/host ngoài; bốn viewport sáng/tối | `.backups/mobile-contract-flow-browser-20261102-run1/results.json` |
| Browser source cuối | Hợp đồng15/15; hồi quy nền/khách hàng35/35; 0 page error/host ngoài | `.backups/mobile-contract-flow-browser-final-20261102/results.json`, `.backups/mobile-contract-flow-regression-20261102-run2/results.json` |
| QA journal | 4 nhóm: mất phản hồi/restart/replay/exact customer/tombstone | `scripts/check-mobile-contract-flow-fixture.py` và checkpoint UUID riêng |
| Samsung native | 4/4 tập trung; 185 file khớp; 0 crash/ANR/SystemUI ANR | `.backups/mobile-contract-flow-native-20261102-run3/` |
| Restart HTTP fixture | Toàn bộ state/UUID/phiếu/session/digest giữ nguyên | `.backups/mobile-contract-flow-http-restart-verified-20261102.json` |
| Export source cuối | iOS/Android Hermes và web đạt;185 file vẫn khớp native | `mobile/.expo/contract-flow-final-qa-20261102`, `.backups/mobile-contract-flow-final-source-verified-20261102.json` |
| SQL preflight | Bốn schema QA missing/legacy/current/mixed được phân biệt đúng | `.backups/mobile-schema-preflight-qa-20261102.json` |

Browser run1 có trước bổ sung nhãn dev mặc định và khóa khi đang đối chiếu;
native4/4 và browser source cuối ở hai artifact riêng đã kiểm các bổ sung này.
Hồi quy35 run1 dừng do script toggle đóng phần Giấy tờ vốn đã tự mở sau validation
active. Sửa script chỉ mở nếu chưa expanded; run2 terminal35/35, không đổi product
source hoặc ghép failed run. Export chỉ chứng minh đóng gói, chưa phải signed iOS.

Samsung SM-N960N, Android9/API28, package có sẵn `vn.himoto.staff`. Không cài lại,
clear data, đổi IME/autofill hoặc sửa dữ liệu thật. JS mới phục vụ qua Metro
hiện có port8081; USB API8091 tạm tới fixture8101 trong lượt native. Runner đã
logout, ledger rỗng và restore mapping USB về rỗng khi kết thúc lúc23:30:05.

Hai lượt failed giữ riêng:

- Run1: 0 nhóm, 0 write; script chưa cuộn tới nút chọn xe sau bố cục mới.
- Run2: 1 nhóm, 0 write; tên QA chứa “Customer” bị IME Telex ghép dấu. Sửa tên
  synthetic trong script sang chuỗi không kích hoạt Telex; không tắt/bẻ bộ gõ
  của người dùng. Đồng thời thêm kiểm heading đúng phần sau từng lần điều hướng.

Run3 đạt một lượt liên tục 4 nhóm; không ghép các nhóm của lượt fail vào kết quả.
Một khách/nháp QA đã lưu, đúng cùng ID/UUID/xe/tiền. Chỉ checkpoint mới được tạo
cho luồng này; checkpoint điều chuyển/thu hồi/media cũ giữ SHA. Không chạy lại
run3 trên dataset đã ghi; nếu test mới cần ghi phải dùng fixture/dataset mới và
giữ nguyên pending/phiếu cũ.

## Backend thật và trạng thái Android theo dõi

Địa chỉ tìm được từ repo đồng nghiệp là `https://himoto.vercel.app`.
Probe chỉ đọc: `/login`200; `/api/mobile/v1/session`404 và `/api/mobile/v1/me`404.
Chưa xác nhận đó là deployment đang vận hành của người dùng; chưa kiểm schema
DB, đăng nhập thật, deploy hoặc áp migration. Proof:
`.backups/mobile-public-backend-preflight-20261102.json`.

Đã chuẩn bị SQL đọc catalog
`docs/sql/2026-11-02-mobile-schema-preflight.sql` để phân biệt bảng session cũ/
mới/mixed và xem column/RLS/grants. Script không đọc dữ liệu nghiệp vụ và không
chuyển schema. Chưa chạy với database thật.

Android xem bản đang phát triển sẽ dùng **QA riêng có nhãn**, Metro8081 và
fixture8101/checkpoint `.backups/mobile-contract-flow-fixture-20261102/state.json`.
Đã mở lại Android ở màn nhập hợp đồng sau native, qua một phiên QA riêng:
`.backups/mobile-android-watch-20261102/runtime.json`. USB8081→8081 và8091→8101
giữ có chủ đích để theo dõi;1 session QA active,1 khách/1 nháp QA giữ nguyên.
Không cộng thao tác mở app theo dõi này vào4/4 native. Giữ cáp và backend local
đang chạy để tiếp tục theo dõi; dữ liệu này không phải hợp đồng thực tế.

## Chưa nghiệm thu

Full vai trò/cơ sở trên staging, nhiều phiên, native lifecycle/force-stop riêng
luồng inline mới, trợ năng/chữ lớn/landscape đầy đủ, ảnh/camera/OCR, GPS, signed
iOS/iPhone và release/vận hành còn tiếp tục. Không gọi 4/4 là full app pass.
