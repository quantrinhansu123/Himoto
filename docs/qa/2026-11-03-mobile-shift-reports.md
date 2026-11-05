# Báo cáo cuối ca PGD / KTNB —03/11/2026

## Source/API đã nối

Danh sách100báo cáo mới nhất theo cơ sở/ngày, lọc nháp/chốt/KTNB xác nhận,
hồ sơ hiện tại. Lập/sửa nháp/chốt PGD gồm nhân sự/ngày/cơ sở, xe ngày/
tháng/khác/giữ ngoài, pin/pin đầy/pin thuê/điều chuyển,12chỉ số hợp đồng và
thu chi, tiền mặt/cá nhân/công ty, thiết bị điện/an toàn/ghi chú, báo cáo
thuê sở hữu với trường nhập thực tế riêng. Tự điền từng phần từ reader
web; summary/ownership tự tải khi mở bản mới đúng web.

Ảnh minh chứng PGD/KTNB có6nhóm, chọn/chụp/xem lớn/rà/lưu/xóa có điều kiện;
đọc ảnh legacy và media web đã có, JPEG qua bộ chuẩn bị ảnh hiện hành,
UUID/revision/receipt. Giữ60ảnh/3video mỗi stage như backend web. Trình tải/
phát video native còn thiếu; UI không có nút giả thay thế hành vi video.

KTNB đọc số PGD/app, nhập số sổ/thực tế độc lập, chênh lệch/giải trình,
danh sách xe bên ngoài/điều chuyển/kết luận; lưu nháp/xác nhận với revision
báo cáo, revision audit và fingerprint snapshot. PGD sau chốt và KTNB sau
xác nhận được khóa. Telegram thuê sở hữu dùng outbox web sau commit,
trạng thái/kiểm tra/thử gửi có điều kiện; unknown/sending không gửi lại.
Không gửi tin thật trong phát triển hoặc bài kiểm.

Đã tách logic web hiện hữu sang `shift-report-domain.ts`,
`shift-audit-domain.ts`, `shift-media-handler.ts`, `shift-photo-handler.ts`,
`shift-telegram-domain.ts`; web routes gọi lại cùng hàm, không có writer
mobile độc lập khác kết quả nghiệp vụ.4module thuần shift-reports/audits/
autofill/ownership-report chuyển sang shared, web re-export nguyên hàm.
Metro chỉ xem mobile/shared như cũ, không mở thư mục web/env cho app.

Bearer routes `/api/mobile/v1/shift-reports`, options/autofill/ID/audit/
media/photos/telegram/requests. Scoped transaction không nâng scope_all
hoặc operation. contracts.read để đọc, contracts.draft hoặc finance.write
để lập/chốt, shift.review riêng để KTNB. Cùng bảng/hồ sơ web; không có DB
app riêng hoặc bước chép dữ liệu đồng bộ. Không migration/deploy.

Metadata/KTNB dùng mobile ledger và shift request receipt trong cùng
transaction. Media bổ sung ledger trước shared handler reservation; bản
web không thể bật adapter bằng header. Account recovery/cancel chặn gửi
muộn; edit/chốt/media/audit cùng hồ sơ giữ một intent pending. Create giữ
scope cơ sở gốc. Receipt gốc tách khỏi hồ sơ hiện tại, không dùng revision
hiện tại để xác nhận thay cho lần ghi cũ.

## Kiểm tra nhanh

SQL nhúng5nhóm đạt tại `.backups/mobile-shifts-domain-checks-shared.log`:
mobile tạo→web đọc/sửa→mobile đọc cùng ID; CAS/quyền/cơ sở/cancel; actual
shared media handler lưu/replay1ảnh không tăng revision hai lần; chốt cần
tắt điện, không phụ thuộc có ảnh và giữ kết quả khi snapshot analytics lỗi;
KTNB kiểm revision/fingerprint/khóa xác nhận; ownership giữ số thực tế,
lấy lại app và queue outbox trong transaction.0tin thật/0DB vận hành.

Snapshot/ownership source trong bài SQL là adapter QA cố định, không chứng
nhận SQL analytics thực/staging/RLS. Reader tài chính có bài riêng; không
lấy domain checks để chứng nhận mọi số liệu cuối ca. Kiểm web cũ
check-shift-reports và check-shift-audits qua offline hook đạt. Pending21
nhóm có khóa edit/media/audit qua restart/đổi scope. Typecheck/lint log
cuối và kết quả native/bundle cần đối chiếu đúng source tại thời điểm chạy.

## QA Samsung và phần chưa nghiệm thu

QA chỉ thêm shifts_workspace generation24→25, mọi field cũ giữ nguyên;
backup `.backups/mobile-shifts-qa-upgrade-20261103`. Bản nháp#3 ngày01/11
từ domain SQL nhúng, không kèm ownership/Telegram. Fixture PGD writer riêng
cho demo; tự điền staging/media/KTNB write ngoài portfolio được từ chối rõ,
không giả số0 hoặc phát tin. Actor7 không được tự thêm quyền shift.review.

Native run1 dừng trước thao tác vì Metro không resolve module ngoài
watch roots. Đã sửa phần thuần sang shared, SQL qua lại; run2 đạt3happy
path lúc19:42:43 (+07) trên376file nguồn khớp: lưu nháp và ack mã gốc,
tắt điện/rà/chốt/ack và khóa sửa PGD, xem KTNB readonly theo quyền actor7.
Chỉ2request mới trên báo cáo#3, revision1→2→3/statussubmitted, generation
25→26→27; mọi field cũ gồm nhắc nợ/cashbook/reports và26checkpoint giữ
nguyên.0crash/ANR mới, work/ledger rỗng, trả Tổng quan; USB giữ nguyên.
`.backups/mobile-shifts-native-20261103-run2/results.json`.
Không lặp2UUID đã ghi hoặc reset fixture để chạy lại; mở hồ sơ đã chốt
cho demo đọc. Native này không kiểm ảnh/camera/autofill/KTNB write hoặc
gửi Telegram/ownership. Không có tin thật phát ra.

Root/mobile typecheck và mobile lint final2 terminal exit0; root scoped
lint exit0 (config root bỏ qua shared), shared lint dùng Expo config riêng
exit0. Root types cuối handle11437 exit0 sau check quyền web trước parse/DB.
Các lượt types/lint trước có lỗi refs/type, đã sửa và chạy lại.

Export web/Android/iOS terminal exit0 tại
`.backups/mobile-shifts-export-20261103-run1`, EXPO_NO_DOTENV=1,
APIplaceholder.invalid; chỉ JS/Hermes, không signed APK/IPA. Tổng hợp hashes/
native/source/QA preservation tại `.backups/mobile-shifts-verification-20261103.json`.

Còn thiếu tải/phát video native, copy/export báo cáo KTNB theo action web;
nghiệm thu native ảnh/camera/KTNB write/ownership/Telegram thật, mọi tổ hợp
autofill/ngày cũ/tài khoản thiếu dữ liệu, staging/RLS/toàn quyền-cơ sở,
nhiều phiên/mạng lỗi/race/lifecycle, signed iPhone và release. Không gọi
done toàn module/app; tiếp tục phủ pin/loại hợp đồng/quản trị/action thiếu.
