# Doanh thu gia hạn / quá hạn và Telegram pin / sạc

Doanh thu thực thu của tất cả cơ sở dùng chung công thức:

`Tiền thuê đã thu + Gia hạn đã thu + Phí quá hạn đã thu − Tiền thuê đã hoàn`.

Lọc theo ngày thu/hoàn trên phiếu đã duyệt, múi giờ Việt Nam; bao gồm hợp đồng bắt đầu trước kỳ báo cáo. Tiền cọc, hoàn cọc, VAT, sửa chữa và phí khác giữ riêng. Gia hạn chưa thu tiền chỉ là công nợ. Gia hạn và phí quá hạn ghi cho Công ty/cơ sở, giữ quy tắc doanh số NVKD/TLS hiện có.

Hai nguyên nhân đã sửa: tổng doanh thu loại phí quá hạn dù đã đọc được phiếu; API báo cáo thực thu lọc thêm ngày bắt đầu hợp đồng nên mất tiền thu trong kỳ từ hợp đồng cũ. Dashboard, báo cáo thực thu web/mobile, sổ giao dịch và file Excel nay cộng phí quá hạn cùng công thức. Phí quá hạn không đồng thời xuất hiện trong thẻ Phí khác để tránh cộng trùng. Không sửa chứng từ lịch sử; các báo cáo đọc lại phiếu sẵn có.

Telegram pin / sạc có nội dung riêng cho thuê mới, gia hạn gói, thu nợ gia hạn và trả pin/sạc. Sau khi lưu mới/gia hạn/trả, web mở bước kiểm tra và gửi; cũng có thể mở lại từ menu hoặc lịch sử. Thuê mới tách tiền thuê/cọc, giữ thời hạn ban đầu; gia hạn hiển thị đúng kỳ, phí, tiền đã thu/còn thiếu và phiếu của giao dịch. Không lấy cọc hoặc khoản thu của kỳ khác làm tiền gia hạn. Ghi chú nội bộ hợp đồng không tự đưa vào tin.

Luồng trả pin giữ nguyên khóa sự kiện cũ để không mở lại quyền gửi tin đã gửi. Mỗi giao dịch còn lại có khóa ổn định; gửi lại yêu cầu không tạo tin thứ hai. Tin chưa rõ kết quả khóa gửi lại. Quyền gửi tương ứng `contracts.draft`, `contracts.renew`, `contracts.return`, có kiểm tra phạm vi cơ sở trên server. Cơ sở thường gửi nhóm cơ sở; thuê sở hữu gửi nhóm thuê mới/trả hoặc nhóm gia hạn theo giao dịch. Không gửi tự động chứng từ lịch sử.

## Migration trước khi phát hành

Chạy `docs/sql/2026-11-11-battery-rental-telegram.sql` sau migration pin Telegram ngày 29/10. Migration chỉ mở rộng CHECK constraint cho `battery_rental`; không tạo giao dịch tiền hoặc gửi thông báo. Chạy trước khi triển khai code mới. Có thể chạy lại.

## Kiểm tra

```powershell
npm.cmd run typecheck
npm.cmd run build
node scripts/check-rental-revenue.cjs
node scripts/check-cashbook-summary.cjs
node scripts/check-revenue-ledger.cjs
node scripts/check-battery-telegram.cjs
node scripts/check-battery-telegram-workflow.cjs --pglite-path .backups/mobile-sql-qa/node_modules/@electric-sql/pglite
node scripts/check-mobile-reports.cjs --pglite-path .backups/mobile-sql-qa/node_modules/@electric-sql/pglite
node scripts/check-mobile-reports.cjs --pglite-path .backups/mobile-sql-qa/node_modules/@electric-sql/pglite --dashboard-only
node scripts/check-mobile-battery.cjs --pglite-path .backups/mobile-sql-qa/node_modules/@electric-sql/pglite
python scripts/check-revenue-battery-telegram-ui.py --url http://127.0.0.1:3021 --cookie-file .backups/revenue-renewal-20261111/local-session
```

PostgreSQL kiểm thử chạy bằng PGlite cô lập, không truy cập DB vận hành. Bao gồm hợp đồng tháng trước, hai cơ sở/tổng toàn hệ thống, phiếu gia hạn liên kết/legacy, phí quá hạn, hoàn tiền, phiếu chưa duyệt, ranh giới 00:00 Việt Nam, sổ/Excel, quyền gửi, đúng nhóm và chống gửi trùng. Kiểm thử migration chạy hai lần trên dữ liệu tổng hợp. Browser chặn toàn bộ API nghiệp vụ và mô phỏng ghi/gửi; không gửi Telegram thật. Ảnh và kết quả browser lưu trong `.backups/revenue-renewal-20261111/ui/` (Git ignore).

Kết quả: 29 nhóm kiểm thử domain/API/SQL và 6 nhóm browser (Chromium 1440px, WebKit 390px) đạt; không có lỗi JavaScript. Có ca gia hạn pin ban đầu chưa thu, thu sau mới mở tin gia hạn: tiền và hình thức lấy đủ phiếu đã duyệt của đúng kỳ. Typecheck, lint các file thay đổi và production build đạt. Chỉ đọc tài khoản hiện có để tạo phiên kiểm thử local; không sửa tài khoản hoặc chứng từ vận hành.

Ngày 11/11/2026, theo yêu cầu đẩy Git và chạy migration: đã áp dụng `2026-11-11-battery-rental-telegram.sql` trên database cấu hình trong `.env.local`. Cả hai CHECK constraint có `battery_rental` và `convalidated=true` sau COMMIT. Định nghĩa trước migration và kết quả lưu tại `.backups/revenue-renewal-20261111/`; không thay đổi dữ liệu thu/chi, không gửi Telegram. Trạng thái này chỉ xác nhận migration, chưa xác nhận phát hành ứng dụng production.
