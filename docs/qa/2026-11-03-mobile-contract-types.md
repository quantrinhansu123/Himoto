# Loại hợp đồng —03/11/2026

## Source/API đã nối

Danh mục có tìm kiếm/lọc đang dùng-đã ẩn, tạo loại daily/monthly/ownership,
thời hạn gợi ý1–120tháng hoặc để trống; mặc định daily, active=true như
web. Đổi tên và ẩn/hiện có CAS; cách tính tiền/thời hạn của loại đã lưu
giữ cố định. Không có action xóa vì web không có DELETE. Phần mẫu/in chứng
từ thuộc luồng hợp đồng, chưa được coi đã hoàn thành bởi danh mục này.

Màn soạn hợp đồng mở quản lý loại ngay tại chỗ. Sau tạo/đọc receipt/ack,
loại mới active được chọn bằng actual `chooseDraftType`; cập nhật danh
mục và draft-options, giữ thông tin/ảnh durable work của hợp đồng đang
soạn. Khi đổi tên/ẩn, hợp đồng cũ giữ snapshot tên/thời hạn. Loại đã ẩn
không hiện trong lựa chọn mới, nhưng loại đang dùng của hồ sơ cũ vẫn đọc.

Web/mobile dùng chung `saveContractTypeRecord`; hàm web `saveContractType`
giữ signature và kết quả list cũ. Validation/error/type/billing chuyển
shared, không đưa config hoặc kết nối web vào bundle. Bearer routes
`/api/mobile/v1/contract-types` GET/POST/PATCH và requests/key/resolve.
Đọc cần contracts.read, ghi cần thêm cả settings.write và finance.write
như hai lớp gate web. Không nâng operation/scope/role hoặc dùng owner pool
riêng cho module này. RLS catalogue hiện cho scoped role đọc, chặn ghi;
admin đi qua nhánh pool admin sẵn có như web. SQL adapter nhúng kiểm gate
ứng dụng, chưa chứng nhận ma trận RLS/custom role trên staging.

## Xác nhận ID chữ và schema cần duyệt

ID thật varchar80, thường custom_UUID. Thêm cột nullable `resource_key`
varchar160 vào ledger mobile qua script review-only
`docs/sql/2026-11-03-mobile-text-receipts.sql`. Không ép ID số hoặc tạo ID
nghiệp vụ giả. resource_id vẫn NULL cho loại hợp đồng; resource_revision
giữ xmin gốc. Receipt số của tiền/khách/xe không đổi.

**Chưa áp migration/deploy/ghi DB vận hành.** Backend staging cần cột này
trước khi dùng ghi/đối chiếu loại hợp đồng. Không suy QA fixture đã có
cột là staging đã sẵn sàng. Script chỉ chạy trong PGlite cô lập ở bài SQL.

Create/update/ẩn/hiện chia sẻ một intent danh mục toàn tài khoản qua đổi
cơ sở/restart. UUID/fingerprint/row lock cùng transaction writer; request
gốc tách khỏi danh mục hiện tại. Endpoint đối chiếu chuyên biệt dùng
resource_key và actor sở hữu; cancellation chặn gửi muộn. Tài khoản mở
kết quả typed riêng trước khi ack; không dùng numeric resolver cho ID chữ.

## Kiểm tra nhanh

SQL nhúng4nhóm đạt `.backups/mobile-types-domain-checks-run1.log`: tạo
mobile→web cùng ID/label/billing/term, replay không nhân đôi; web đổi tên/
ẩn→mobile đọc đúng và receipt giữ revision gốc; resolveDraftContractType
giữ snapshot cũ/chặn chọn loại ẩn/khôi phục lựa chọn khi hiện lại; quyền
đọc+hai quyền ghi, CAS/unique/validation/immutable billing-term; cancel/
late write/khác actor/ID80 và receipt số hiện hành vẫn đúng.

Pending23nhóm đạt, thêm khóa danh mục global giữa create/update/ẩn/hiện
qua scope/restart. Root types/scoped lint/shared lint handle10171 và
mobile types/lint5180 đã terminal exit0.0DB vận hành. Nghiệm thu nhiều
phiên/fault/network/RLS được giữ ở giai đoạn kiểm sâu.

Web `check-contract-types.cjs`3nhóm tương thích đạt qua offline hook và
tắt loadEnvConfig trước khi nạp script; không đọc .env.local. Các nhóm giữ
snapshot/loại ẩn/gói thuê và kỳ24tháng leap-day. Generic recovery6nhóm
hiện hành đạt lại sau bổ sung nhánh typed chuyên biệt.

## Samsung QA

Catalogue9loại nền từ actual web reader trên PGlite; `types_workspace`
riêng được thêm generation31→32 vào checkpoint8131 đang dùng, backup
`.backups/mobile-types-qa-upgrade-20261103`, giữ mọi field cũ. Native fixture
chỉ là mô hình UI cục bộ, không DB vận hành. Draft-options đọc cùng danh
mục fixture để kiểm inline chọn loại; không sửa hồ sơ hợp đồng cũ.

Run1 chủ động dừng trước write để bổ sung key remount theo session/token/
scope/quyền ở entry point,0request/generation32. Mobile types/lint sau sửa
đạt. Run2 handle16570 terminal exit0 lúc20:48:14 (+07),400file nguồn khớp:
tạo monthly24→đổi tên→ẩn→hiện, mỗi bước có receipt/ack; inline tạo daily
trong actual composer→receipt/ack→đúng loại mới tự chọn.5UUID/2IDtext mới;
9loại nền và mọi field ngoài types_workspace/26checkpoint giữ nguyên.
Generation37. Chỉ bỏ bản nháp local vừa tạo trong bài, không ghi hợp đồng
lên máy chủ;0crash/ANR, work/ledger rỗng, trả Tổng quan. Không reset/replay
5mã đã ghi. Evidence `.backups/mobile-types-native-20261103-run2`.

Danh mục QA còn2loại active `QAType24Renamed0311`/`QAInlineType0311` để
demo đọc/chọn. Chưa coi native happy path là schema/RLS staging hoặc kiểm
sâu. Export web/Android/iOS handle90224 terminal exit0 tại
`.backups/mobile-types-export-20261103-run1`, dotenv tắt/APIplaceholder,
chỉ JS/Hermes chưa signed APK/IPA. Tổng hợp
`.backups/mobile-types-verification-20261103.json`.

## Chưa nghiệm thu

- Schema staging/cột resource_key, quyền DB và toàn role/cơ sở thực tế.
- Nhiều phiên cùng sửa danh mục/lỗi mạng/late write/lifecycle/native recovery
  và tài khoản đổi session khi đang ghi; SQL happy path không thay full matrix.
- Inline đang có xe/ảnh/giấy tờ cần native mở rộng; lượt này tạo loại trong
  composer mới và bỏ riêng local draft đó, không kiểm upload/metadata hợp đồng.
- Signed iOS/iPhone thật, release/vận hành; mẫu/in hợp đồng còn ở backlog riêng.
- Mục tiêu100%web và nghiệm thu tổng thể vẫn active.
