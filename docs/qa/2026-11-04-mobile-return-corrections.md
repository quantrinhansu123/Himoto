# QA sửa hồ sơ / quyết toán trả xe — 04/11/2026

Đã có source/API/native, chưa staging/native financial-write acceptance.
Goal toàn dự án active. Không đọc env hoặc ghi DB vận hành.

## Đầu ra

Dùng actual `readReturnCorrection`/`correctReturn`: chọn nhóm xe đã trả,
sửa giờ trả/phí trễ/sửa chữa/giảm thuê/đơn giá tính phí từng xe; xem khoản
thu/hoàn, ngày thực tế, routing/người nhận và cọc hoàn sau. Xác nhận rõ
việc hủy và thay phiếu của lượt trả cũ. Cho lý do trống như web.

Scoped read, role contracts.return, revision/fingerprint, UUID/receipt/
recovery; cùng nhóm pending với trả/đổi/thu hồi để chặn giao dịch chồng.
API whitelist, cấp UUID phiếu thay thế bên trong cùng transaction; không
cho client chèn mã phiếu. Giữ xe đang thuộc lượt thuê sau/cơ sở kho hiện tại.

## Kiểm nhanh

SQL nhúng3nhóm đạt run1/2, log cuối
`.backups/mobile-return-corrections-sql-run2.log`. Actual writer tạo lượt
trả gốc, correction thay đúng phiếu nhóm đó, giữ phiếu hủy/audit và xe đang
thuê ở lượt sau. Chặn overlap/CAS, actor/scope/fingerprint/tombstone và
rollback khi receipt ngoài lưu lỗi.0DB vận hành.

Root/mobile types, lint đạt trước module tiền/ngày thuê tiếp theo.
Hồi quy trả xe gốc15nhóm, form và recovery đạt. Thay đổi ack trên4màn
mới đã kiểm types/lint; native smoke này không submit/ack tài chính.

Samsung run1 terminal exit0 lúc03:57:27 (+07),471file nguồn khớp,
3nhóm/5ảnh,0crash-ANR. Xem nhóm trả/phí/thời gian, routing phiếu hoàn,
nhập lý do/mở-hủy xác nhận;0submit. QA7/Tổng quan/work-ledger/admin_tokens
rỗng, nghiệp vụ/auth và26checkpoint cũ giữ nguyên. Evidence
`.backups/mobile-return-corrections-native-20261104-run1/results.json`.

Same8131 generation74→75 chỉ thêm return_corrections_workspace. Backup
`.backups/mobile-return-corrections-qa-20261104-run1/`; server14652/handle30304.
Lần nâng có assertion so in-memory keyint với JSON keystring thất bại sau
persist; đã kiểm lại toàn bộ checkpoint persisted, không field cũ thay đổi.
Không reset hoặc replay. Metro7600/reverse8081→8081,8091→8131 giữ.

## Còn thiếu

Export chung source mới với tiền/ngày thuê/lịch sử; ma trận native submit/
ack/recovery/quyền/cơ sở/mạng/nhiều phiên, staging, Samsung tổng thể,
signed iPhone thật, release/vận hành. Chưa nghiệm thu toàn dự án.
