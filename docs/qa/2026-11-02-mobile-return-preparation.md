# Chuẩn bị trả xe — API chỉ đọc

> Cập nhật mới: POST `/returns/preview` và `/returns/settlement-preview`
> **chỉ đọc** đã qua SQL/parity với writer. Suite SQL hiện 59 nhóm; module
> return 12 nhóm API. [QA preview/quyết toán](2026-11-02-mobile-return-preview.md)
> có bằng chứng và giới hạn; writer/editor/recovery/native trả xe vẫn chưa có.
> Chi tiết phần còn dở trong [bàn giao mới nhất](../mobile-handoff-2026-11-02.md).

Đã bắt đầu phần trả/đổi xe bằng endpoint **GET**
`/api/mobile/v1/contracts/:id/returns?page=1` và client typed. **Chưa có POST ghi
trả xe mobile, editor, quyết toán, receipt ghi trả xe hoặc nghiệm thu native trả xe.**
Không đưa bước chuẩn bị chỉ đọc vào danh sách nghiệp vụ đã hoàn tất.

Endpoint yêu cầu `contracts.read` và `contracts.return`; quyền tài chính không
tự cấp quyền trả/đổi xe. Dữ liệu nằm trong transaction repeatable-read/read-only
với scope/RLS hiện tại. Dùng chung `readPaymentContext` và projection trả xe của
web, có count và LIMIT/OFFSET 25 dòng. Xe chưa trả được xếp trước lịch sử trả,
giữ revision của hợp đồng và từng dòng xe.

Response chỉ chiếu trường cần cho UI: mã/trạng thái, số dư/cọc đang giữ/hoàn
thuê hợp lệ, lịch và giá ngày của xe, cờ thuê sở hữu/bảo lưu và tài khoản theo
phương thức. Không gửi raw composer hoặc số giấy tờ khách hàng. Không suy xe
khác khi nhãn xe đã lưu kho/thiếu. Xe đã trả, thiếu hạn trả, trạng thái không
cho ghi và nợ xấu có lý do khóa rõ ràng. Thu hồi nợ xấu sẽ dùng bước nghiệp vụ
riêng theo domain hiện có, không đổi thành trả xe thông thường.

Bằng chứng:

- **4 nhóm client/DTO/preflight**: `.backups/mobile-return-preparation-results.json`,
  log `.backups/mobile-return-preparation-api-20261102.log`. Kiểm tra origin,
  bearer/no cookies/no redirect, hủy request, đúng hợp đồng/trang, revision và
  tiền, gate xe đã trả/thiếu ngày, trùng dòng/tài khoản và quyền/query trước DB.
- **4 nhóm SQL mới, 47 nhóm toàn suite**:
  `.backups/mobile-return-preparation-sql-20261102.log`,
  `.backups/mobile-finance-sql-results.json`. Thực thi projection/domain dưới
  scoped role/RLS trong PGlite. Kiểm tra 26 dòng/2 trang, returned history, tài
  khoản riêng theo phương thức, không lộ số giấy tờ, scope/quyền, trang mất,
  nợ xấu/thiếu ngày/đã trả hết, thuê sở hữu và nhãn kho bị thiếu. Số phiếu thu
  và dữ liệu đơn không thay đổi sau các lượt đọc.
- Fixture thuê sở hữu ban đầu có tổng kỳ đầu 500.000 trong khi kế hoạch yêu
  cầu 1.000.000; gate đã khóa đúng. Lượt cuối giữ cả kiểm tra trường hợp bất
  nhất lẫn sửa fixture về tổng hợp lệ, không nới kiểm tra số dư để làm xanh.
  Log chẩn đoán `.backups/mobile-return-preparation-sql-invalid-ownership-fixture-20261102.log`.
- Root/mobile typecheck/lint, release **44/44** và return-search **4 nhóm** đã
  đạt tại `.backups/mobile-returns-final-checks-20261102.log`.
- Bộ mobile đầy đủ **106 nhóm** đạt:
  `.backups/mobile-returns-all-api-20261102.log`. Backend build đã đạt:
  `.backups/mobile-return-preparation-backend-build-20261102.log`.
- Web/Hermes iOS/Android đã xuất lại `.expo/*returns-preparation-qa`; đây chưa
  chứng minh ghi trả xe/native hay iOS đã ký.

PGlite một kết nối không chứng minh tranh chấp nhiều phiên, RLS production hoặc
hiệu năng staging. Chưa có migration trả xe mobile và không ghi dữ liệu thật.

Bước tiếp theo là preview phí theo `lateReturnFee`/giảm sớm/sửa chữa và clock
server, rồi writer/receipt bất biến/idempotency/tombstone qua
`completeReturnBatch`, quyết toán thu/hoàn và UI. Mọi khoản tiền trong bước trả
xe phải được rà soát và commit cùng transaction; không mở nút ghi trước giao
thức khôi phục. Đổi xe dùng domain `replaceContractVehicle` và còn cần API/UI/
receipt/kiểm tra tồn kho riêng.
