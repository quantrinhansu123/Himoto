# QA tiền/ngày thuê, lịch sử, thời hạn sở hữu và xóa nháp — 04/11/2026

Đã triển khai source/API/native; đây là kiểm nhanh, chưa nghiệm thu tổng thể.
Goal vẫn active. Không đọc env hoặc ghi DB vận hành.

## Đầu ra

- Sửa tiền/ngày thuê thường dùng actual readRentalTerms/updateRentalTerms,
  riêng từng dòng xe và tổng hợp đồng; tổng không tự tính từ số ngày, đơn
  giá trống giữ cũ,0là sửa về0. Giữ phiếu/tiền/kho/giờ trả thực tế. CAS cả
  order và line; actual helper chặn lịch chồng và Telegram chưa rõ kết quả;
  sửa metadata gia hạn liên quan, audit/UUID/recovery.
- Thời hạn/mức đóng sở hữu dùng actual readOwnershipTerms/updateOwnershipTerms;
  role sở hữu/admin + draft grant, branch role chỉ xem. Chưa xác định là null;
  một dòng xe đang mở đồng bộ rate, nhiều xe giữ tổng; không dựng lại lịch
  đóng, không thay tổng/phiếu/tiền. CAS/UUID/receipt/recovery.
- Lịch sử/phiếu dùng actual readContractHistory, DTO whitelist, phân trang25,
  tìm theo title/detail/actor hoặc phiếu/routing/trạng thái; tổng toàn hợp
  đồng giữ khi lọc. Hiện phiếu hủy nhưng loại khỏi tổng. Sửa thông báo web
  cũ đang luôn nói giữ nguyên tiền dù collected_amount/paid_at đã đổi.
- Xóa nháp máy chủ dùng actual deleteContractDraft: chỉ nháp chưa cấp số/
  phát hành, chưa có bất kỳ phiếu hoặc dòng xe (kể cả đã xóa mềm). CAS, xóa
  mềm/audit/reference gốc, không thay tiền/kho. Receipt và generic resolve
  vẫn kiểm RLS cả sau xóa. Chặn pending sửa/phát hành/ảnh trước khi xóa;
  không xóa bản đang soạn trên thiết bị.
- Các action điều chỉnh chuyển xuống nhóm riêng dưới thao tác chính.

## Kiểm nhanh

SQL actual domain/scopedConnect/PGlite:4nhóm tiền/ngày thuê + lịch sử +
sở hữu,2nhóm xóa nháp đạt. Logs cuối:
`.backups/mobile-terms-history-sql-run4.log`,
`.backups/mobile-draft-delete-sql-run1.log`. Bao gồm cross-branch conflict,
CAS, tiền/phiếu/kho giữ, nullable rate, role, actor UUID, original receipt,
fingerprint/tombstone và rollback ngoài receipt.

Root/mobile types và server/mobile lint run3 đạt trước nhánh in. Run1/2
mobile types/lint bắt lỗi props StateView/FlatList và import/unused View;
đã sửa. Expo export3nền tảng exit0
`.backups/mobile-terms-actions-export-20261104-run1`, dotenv tắt/API giả.

## Samsung và giới hạn bằng chứng

Run1 dừng tại chọn loại lịch sử vì portfolio giữ count3 trước khi seed
thêm30phiếu, script tìm count33. Làm mới projection actual SQL, chỉ đổi
terms_actions_workspace.terms bằng journal76→77; không reset/replay.

Run2 đi hết6ảnh: lịch sử và tổng, phiếu hủy, sửa tiền/ngày/mở-hủy xác nhận,
sở hữu chỉ xem cho branch role, mở-hủy xác nhận xóa nháp, QA7/Tổng quan.
Script terminal exit1 vì thiếu import deepcopy ở bước audit cuối. Giữ lỗi.

Audit nối tiếp **exit0 lúc04:28:17 (+07)**, source485file khớp chính xác
provenance trước run2; xác nhận lại Account/work-ledger rỗng và Overview.
0crash/ANR,0submit tài chính,0xóa, business/auth giữ,26checkpoint cũ giữ.
Evidence:
`.backups/mobile-terms-actions-native-20261104-run2-audit/results.json` và
6ảnh ở thư mục run2. Không ghi run2 là terminal exit0; import đã sửa sau
audit. Không coi xem/hủy xác nhận là native write acceptance.

Same8131 generation77, server14472/handle50923; Metro7600/8081/origin8091.
Reverse trước khi Samsung mất USB:8081→8081 và8091→8131. Chưa cài APK mới.

## Còn thiếu

Native submit/ack/recovery/quyền/cơ sở/mạng/nhiều phiên cho nhánh mới,
staging và hồi quy Samsung tổng thể, signed iPhone thật, release/vận hành.
Nhánh in/PDF và dependency/native build đang tiếp ở source; chưa nghiệm thu.
