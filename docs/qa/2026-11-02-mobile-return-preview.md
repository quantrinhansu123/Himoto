# Preview phí và quyết toán trả xe — 02/11/2026

Đã kiểm chứng SQL của preview phí và thêm preview quyết toán **chỉ đọc**.
Chưa có writer/editor/receipt/recovery mobile trả xe; chưa nghiệm thu native
trả xe. Không coi các endpoint preview là nghiệp vụ ghi đã hoàn tất.

## API và nghiệp vụ

- `POST /api/mobile/v1/contracts/:id/returns/preview`: phí trễ/sửa chữa/giảm
  sớm, tổng phí và số dư sau trả xe; dùng `calculateVehicleReturn` của writer.
- `POST /api/mobile/v1/contracts/:id/returns/settlement-preview`: nhận
  `fee_snapshot`, dòng xe và `settlement` đã nhập. Response phân biệt `fees`,
  tiền thực thu, hoàn thuê, hoàn cọc, tổng tăng do thu vượt và số dư cuối.
- Cả hai cần `contracts.read` + `contracts.return`, transaction
  repeatable-read/read-only theo scope. Không thêm quyền tài chính chung,
  không cấp mã thao tác, tạo phiếu, đổi xe/kho/tiền hoặc gọi DB production.
- Tiền thực thu không bị ép khớp phí gợi ý. Khi còn nợ, thu vượt phần thiếu
  tăng tổng phí bằng phần vượt theo `recordContractPayment`; khi đã hết nợ,
  nhận thêm tiền giữ tổng phí. Preview báo `overpayment` và trạng thái xác
  nhận riêng; writer tương lai phải kiểm tra xác nhận này trước khi ghi.
- Hoàn thuê chỉ trong credit giảm sớm còn hiệu lực và tiền thuê đã thu dư.
  Hoàn cọc chỉ sau đủ xe và hết công nợ; được giữ cọc chờ hoàn, kèm thông tin
  nhận hoàn tùy chọn. Thu/hoàn và xe phải cùng transaction khi triển khai ghi.
- `stopped_at`/`paused_at` không được tự sửa cho test qua. Trả cuối khi làm
  lệch lịch đang bảo lưu bị chặn; domain settlement rollback tương ứng.

## Bằng chứng

- **59 nhóm SQL toàn suite**, gồm 12 nhóm mới so với mốc 47. Chạy PGlite
  in-memory PostgreSQL, scopedConnect/RLS fixture và domain thật, không dùng
  env/DB mạng. Log `.backups/mobile-return-settlement-sql-20261102.log`;
  JSON `.backups/mobile-finance-sql-results.json`.
- SQL so sánh trực tiếp preview với `completeReturnBatch` trong transaction
  rollback: phí, tổng, đã thu, còn thiếu, cọc, hoàn thuê, số xe và trạng thái;
  phiếu thu/chi đối chiếu định danh, loại/tên, tiền, tài khoản và thời gian.
- Có ca 8h/8h+1 phút/24h/24h+1 phút, override/sửa chữa, thiếu giá ngày,
  giảm sớm và lịch hoàn thuê hơn một trang, chọn xe qua trang 25, số dư thuê
  sở hữu base/accrued, dừng kỳ cuối, thu vượt trước/sau hết nợ.
- So sánh toàn bộ dữ liệu/xmin/kho/phiếu/receipt và sequence trước/sau các
  preview. Hash ổn định khi không đổi dữ liệu/thứ tự lựa chọn, đổi khi cashbook
  insert/xmin thay đổi hoặc qua ranh giới kỳ thu dù order xmin không đổi.
- **12 nhóm return DTO/client/parser/calculation**, trong **114 nhóm mobile
  API/form toàn suite**: `.backups/mobile-return-settlement-api-20261102.log`,
  `.backups/mobile-return-settlement-all-api-20261102.log`. Client ràng buộc
  đúng hợp đồng, revision, fee fingerprint, dòng xe, phí, thời gian, phương
  thức/tài khoản, ý định hoàn và xác nhận thu vượt; không lấy response khác
  lựa chọn hiện tại để hiển thị.
- Root/mobile typecheck và lint đạt: logs
  `.backups/mobile-return-settlement-{root,mobile}-{types,lint}-20261102.log`.
  Release hồi quy **44/44** đạt:
  `.backups/mobile-return-settlement-release-20261102.log`.

PGlite chỉ một kết nối; các scoped stock helper là bản fixture tối thiểu.
Chưa chứng minh helper SECURITY DEFINER đã triển khai, tranh chấp nhiều phiên,
RLS production hoặc hiệu năng staging. Các test writer đều rollback; sequence
PostgreSQL có thể tăng trong test writer rollback, không phải trong preview.
Backend build/export/native sau source mới được báo riêng khi thực hiện.

## Bước tiếp theo

1. Writer recompute cả hai snapshot trong transaction sau lock order/items và
   UUID cha; gọi `completeReturnBatch` cùng tiền/kho/receipt bất biến.
2. UUID con sinh server sau lock, giữ exact transaction IDs và dữ liệu gốc khi
   replay/đối chiếu dù cashbook/dòng xe đã được chỉnh về sau.
3. `return.record` vào resolver/tombstone/device ledger/Tài khoản; chưa rõ kết
   quả phải khóa form và giữ key đến khi người dùng xác nhận receipt.
4. Editor, fixture/browser và native đúng source, rồi đổi xe/điều chuyển/media.

## Logo launcher

Ảnh foreground Android trước dùng `icon.png` với logo rộng 800/1024 px, vượt
vùng an toàn adaptive icon. Generator hiện tạo `adaptive-icon.png` riêng:
logo SVG gốc rộng 600 px trên canvas trong suốt 1024; `app.json` trỏ foreground
đến ảnh này. iOS/legacy icon vẫn dùng ảnh nền trắng.

Mô phỏng mask trước/sau ở `.backups/mobile-icon-mask-review-20261102.png`:
đủ chữ với mask tròn/bo góc. Bounds pixels có alpha
`x=216..807, y=455..568` nằm trong đường tròn an toàn 66/108; metadata
`.backups/mobile-icon-safe-area-20261102.json`.
Đây là kiểm tra asset, chưa phải xác nhận launcher trên Samsung. ADB không
thấy thiết bị ở đầu lượt này; không reset fixture, không xóa app/pending keys.

Nguồn cấu hình: [Expo SDK 58 adaptiveIcon](https://docs.expo.dev/versions/v58.0.0/config/app/#adaptiveicon),
[Android safe zone](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive).
