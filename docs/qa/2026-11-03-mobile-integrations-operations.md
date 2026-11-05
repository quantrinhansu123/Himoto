# Tích hợp, điều hành và nhập bổ sung lịch sử —03/11/2026

Ưu tiên phủ chức năng/demo. Mục tiêu toàn app vẫn active; không có chứng nhận
100% parity hay nghiệm thu phát hành từ đợt này.

## Đã triển khai

- Tích hợp: đọc trạng thái/lịch sử GPS, tài khoản Protrack/IOPGPS, tạo hoặc cập
  nhật theo nền tảng+tên đăng nhập, bật/tắt đồng bộ; cấu hình bot Telegram,
  nhóm cơ sở/chủ đề/bật nhận và hai nhóm thuê sở hữu riêng, thông báo gần nhất.
  Để trống bot token giữ bot cũ. Không tự phát lại lịch sử hoặc gửi thông báo
  khi lưu. Nhật ký/kênh sự kiện và scheduler là phần đọc đúng màn web hiện tại.
- Điều hành: cơ sở, lập hợp đồng, chọn hợp đồng trả/gia hạn, tìm biển số/SĐT,
  kho xe, nháp/khoản đến hạn, tổng đang thuê/quá hạn và mở đúng hồ sơ gốc.
  Scope active/renewable/overdue áp trước phân trang; renewable giữ điều kiện
  loại trừ installment plan hiện hành. Không sao chép số tổng từ trang đầu.
- Nhập bổ sung lịch sử: dùng composer/writer hợp đồng hiện hành, chọn đang
  thuê hoặc đã trả trước đây, lý do và thời gian thực tế. Shared validation
  giống web; giữ durable work theo chế độ để không mở nhầm hợp đồng mới.
  Giao dịch lịch sử đã trả tiếp tục theo writer web, không tự đổi kho hiện tại.

## Backend và dữ liệu web

`saveIntegrationSettingsOnClient` và `readIntegrationSettings` dùng chung web/
mobile, cùng bảng và server cipher. Web wrapper giữ signature; transaction
bao cấu hình và receipt mobile để không có ghi nửa chừng. Admin gate giống
web, không mở cấu hình cho tài khoản thường có grant settings.write.

Password GPS/token nhập nhất thời, xóa khi ra nền; không lưu vào query cache,
pending ledger, receipt hoặc audit. Fingerprint request dùng HMAC khóa server.
Config version là checksum của cấu hình, loại runtime cursor/session/counter
để job GPS không gây xung đột giả. Receipt giữ checksum tại lần ghi và cấu hình
hiện tại riêng; UUID replay không ghi lần hai.

GPS dùng UUID thật, Telegram dùng singleton `true`; không ép business ID sang
số hoặc tạo ID giả. Ledger dùng `resource_key` nullable đã chuẩn bị ở script
review-only `docs/sql/2026-11-03-mobile-text-receipts.sql`; **chưa áp vào DB vận
hành**. Phải kiểm schema staging trước khi bật ghi/đối chiếu hai module này.
Không deploy/migration/ghi thử production trong đợt này.

Thống kê điều hành dùng actual `readOperationsSummary`, cùng scoped context
và bộ lọc cơ sở web. Tuyến chọn hợp đồng dùng actual `readMobilePage`; không
có DB app hoặc danh sách nghiệp vụ độc lập trên backend.

## Kiểm tra nhanh đã có

- SQL nhúng tích hợp4nhóm: mobile↔web cùng UUID/cipher; cập nhật xóa provider
  session; runtime không ảnh hưởng CAS; stale rollback; Telegram hai nhóm/
  blank token/old-client omission/transaction rollback; không dispatch;
  admin, actor receipt và hủy mã chặn late write.
- SQL nhúng điều hành3nhóm: tổng5active/3overdue, cơ sở23=4/2; legacy line
  fallback, loại nguồn pin/các bản xóa/nháp/hoàn tất; validation thời gian
  lịch sử và shared active/renewable. Đây chưa phải kiểm RLS staging.
- Workspace regression3, draft-form regression4, pending25nhóm đạt.
- Root/mobile typecheck và scoped lint đạt; shared lint bằng Expo config đạt.
  Root lint không áp config cho shared; kết quả shared dựa trên lượt riêng.

Lệnh SQL chỉ chạy PGlite cách ly, không dotenv/network/DB vận hành:

```powershell
node scripts/check-mobile-integrations.cjs --pglite-path .backups/mobile-sql-qa/node_modules/@electric-sql/pglite
node scripts/check-mobile-operations.cjs --pglite-path .backups/mobile-sql-qa/node_modules/@electric-sql/pglite
```

Evidence SQL: `.backups/mobile-integrations-domain-checks-run1.log`,
`.backups/mobile-operations-domain-checks-run3.log`; catalogue public được
sinh bởi actual reader SQL, không chứa credential.

Pure web branch regression2nhóm đạt. Lượt bổ sung SQL của script web cũ
`check-contract-branch-flows.cjs` dừng vì fixture chưa có hàm
`himoto.store_directory()`. Giữ log failure
`.backups/mobile-integrations-web-branch-regression.log`; không tính lượt
này đạt và không lấy nó chứng nhận phát hành lịch sử/tác động kho. Chuyển
cập nhật fixture sâu sang giai đoạn kiểm tổng thể; không đổi writer để né lỗi.

## QA/Samsung và biên dịch

Checkpoint8131 giữ nguyên, chỉ thêm `integrations_workspace` generation52→53;
đã backup và so mọi field gốc bằng nhau. Manifest tham chiếu catalogue SQL
tích hợp run1 và điều hành run2 kèm SHA256. Không reset/replay account5UUID,
loại hợp đồng5UUID hoặc bất kỳ portfolio cũ nào.

Samsung3nhóm kiểm nhanh đạt22:54, handle8125 terminal exit0. Run1–3 dừng
trước write ở hướng cuộn/Telex/trường ngoài viewport; run4 đã xem tổng4/2,
tìm/mở ID29001 và lưu-mở local lịch sử. Run4 dừng vì harness đòi prompt khi
rời bản vừa mở lại chưa sửa; app quay lại đúng, work giữ nguyên. Không reset
work hoặc QA để chạy lại. Run5 dùng `--resume-local-from` run4, kiểm mọi source
khớp trừ chính harness, giữ checksum5ảnh gốc; tiếp tục đúng work `Demo0311`,
bỏ riêng bản mới đó rồi kiểm cấu hình. Evidence gốc/failure được giữ.

Run5 tại `.backups/mobile-integrations-native-20261103-run5`:430file khớp,
3UUID/3receipt/ack: GPS bật→tắt về trạng thái ban đầu, Telegram cơ sở23 đổi
thread12→13; bot/hai nhóm sở hữu/notification/portfolio điều hành giữ nguyên.
Không ghi credential/bot token/gửi tin thật. QA7/Tổng quan, work-ledger rỗng,
0crash/ANR mới trong run5. Mọi businessfield nền/account5receipt cũ và
26checkpoint giữ nguyên; chỉ parent sessions/sessionSeq và2expiry QA con đổi
theo phiên parent sống. Không replay mã cũ. Generation hiện62, server8131
handle94779/PID5116, Metro admin6480/origin8091/dotenv tắt, USB reverse giữ.

Portfolio điều hành là tập chỉ đọc dành riêng cho bài kiểm này, không trộn
với tập CRUD cũ để tránh sửa/reset các hồ sơ đang có. Số tổng dashboard của
portfolio CRUD không dùng làm bằng chứng đối chiếu chéo với portfolio điều
hành; demo dữ liệu liên thông toàn app/staging còn phải chuẩn bị và kiểm riêng.

Export web/Android/iOS handle3893 terminal exit0 tại
`.backups/mobile-integrations-export-20261103-run1`, dotenv tắt/API placeholder.
Chỉ JS/Hermes, không signed APK/IPA. Tổng hợp
`.backups/mobile-integrations-verification-20261103.json` phân biệt kết quả
đạt, native continuation và failure của fixture SQL cũ.

## Chưa nghiệm thu

Native ghi credential GPS/bot token, gửi thật, lịch sử phát hành hợp đồng ghi
server, toàn vai trò/cơ sở/RLS, mạng lỗi/nhiều phiên/race/fault/lifecycle,
Android hồi quy đầy đủ và signed iOS/iPhone thật/release/vận hành. Còn action
nhập/xuất/Excel/in/correction/video và các nhánh chưa phủ trong backlog;
không chờ full matrix đợt này mới tiếp tục phần thiếu.

Riêng nhập bổ sung: đợt này có hợp đồng lịch sử ongoing/returned. Hai nhánh
web `ContractBackfillDialog` là **gia hạn bị quên** và **thu/chi của hợp đồng
đã có** chưa nối vào native; phải tiếp tục đúng ngày thực tế/quyền/trạng thái/
phiếu, không coi nút nhập lịch sử đã hoàn tất toàn công cụ web.
