# Video hồ sơ mobile — 04/11/2026

Goal vẫn active; đây là bằng chứng một nhánh chức năng, chưa phải nghiệm thu
toàn app hoặc xác nhận tải video lên staging thật.

Mốc sau13:01: nhánh direct MP4 CloudFly và hồ sơ gia hạn/phiếu/đổi pin đã
được triển khai tiếp; trạng thái mới ở [QA cụm](2026-11-04-mobile-direct-video-history.md).
Các câu “chưa nối” phía dưới là mốc của đợt này, không thay bản cập nhật sau.

Đã có API/native xem và thay video lập hợp đồng/giao xe/trả từng xe (3 ô
mỗi nhóm), dùng actual `signPhotoUpload`, `verifyPhotoReceipt` và
`writeCloudinaryPhoto` của web. Giới hạn hợp đồng 45 MiB/60 giây; Cloudinary
chuyển MP4/H.264/AAC, writer theo cấu hình hiện tại lưu Cloudinary hoặc
CloudFly. Thời lượng/dung lượng trên phiếu lấy từ metadata provider đã kiểm;
nhánh CloudFly xác nhận HEAD/ETag sau archive. Không có backend secret trong app.

Native chọn/quay, xem tệp hiện tại/xem trước, xác nhận thay tệp, phiếu lưu,
đối chiếu và xác nhận đã kiểm tra. File chọn được copy vào cache riêng để
upload; chỉ dọn bản copy do app tạo, giữ tệp gốc. Player không tự phát,
không cache video riêng tư, dừng khi rời màn hoặc app xuống nền. Web preview
tải blob có bearer qua API trước khi đưa vào player, vì thẻ video web không
gửi được Authorization giống native. Nút xóa tệp dùng lại action xóa có CAS.

API phát video proxy có xác thực/RLS; không chuyển bearer sang kho bên ngoài.
Pin phiên bản tệp, hỗ trợ full/range/suffix, kiểm MIME/size/ETag/Content-Range
và số byte stream thực nhận, no-store. Read-only transaction kết thúc trước
khi tải nội dung từ provider. Không trả URL object hoặc khóa kho trong DTO.

Mỗi lần lưu giữ UUID trước khi bắt đầu network, operation `video.record:<id>`;
ảnh/copy/xóa tệp/video/xóa nháp cùng nhóm chặn thao tác chưa đối chiếu.
Public ID của upload buộc bằng actor + UUID. PUT giữ parent/reference/photo
revision + snapshot; actual writer và immutable proof commit cùng transaction.
Receipt gốc giữ asset hash/thời lượng/dung lượng, báo độc lập parent/reference/
photo còn hiện hành. Retry UUID đã commit không gọi provider để ghi lại.
Đối chiếu chưa lưu tạo tombstone chặn request đến muộn. Dùng bảng proof hiện
có `management_mobile_record_media`; không thêm/chạy migration.

Kiểm nhanh đã đạt:

- SQL offline run3: 4 nhóm, actual web writer cả 2 provider; fake metadata/S3
  và bytes chỉ trong RAM, socket ngoài bị chặn. CAS/UUID/replay/rollback sau
  proof failure/lost COMMIT/tombstone/actor/cơ sở/archive/range/truncated stream.
  `.backups/mobile-record-video-sql-run3.log`.
- Hồi quy ảnh 8 nhóm, xóa tệp 5, đối chiếu 6, ledger 27. Fixture xóa bổ sung
  object columns đúng schema web; grant media vẫn theo helper web và RLS.
- Root types run3; mobile types run6/lint run5; server lint run2; shared lint
  qua config mobile run1. Root eslint không áp config cho shared nên lần đầu
  chỉ báo ignored; không dùng kết quả đó để khẳng định shared đã lint.
- Export Android/iOS/web run3 exit0, EXPO_NO_DOTENV=1 và origin giả API_URL.
  `.backups/mobile-record-video-build-20261104-run3/`. Run1 có cảnh báo Metro
  cache deserialize và tự full-crawl, vẫn export exit0; không clear app/ledger.
- Browser run4 exit0: 2 luồng 375 sáng/430 tối, 6 ảnh, 0 pageerror/host ngoài.
  Video thật tổng hợp 3 giây, video 61 giây bị chặn trước gửi, signed upload
  giả lập không có Himoto bearer, mất phản hồi PUT/resolve/phiếu/ack không gửi
  lặp; xem hết vẫn phát lại và lưu được.
  `.backups/mobile-record-video-ui-20261104-run4/results.json`.
  Run1 sai expected message (thực tế đã chặn theo duration player); run2 xong
  luồng nhưng fixture chưa nhận read approval phụ. Không gọi hai run đó là đạt.

Samsung đã kiểm phát video thật, frame 0→1.125 giây, mở Google PhotoPicker
`com.google.android.gms.photopicker.ui.PhotoPickerActivity` rồi hủy, không chọn
tệp. Run1/2 gốc đều exit1 vì UIAutomator không xuất hierarchy mới khi player
đổi controls; không gọi hai run này là đạt. Dùng screenshot mới quan sát từng
control rồi tap đúng một lần, không dùng XML cũ hoặc lặp action. Script audit
tạm đầu lỗi encoding nhãn tiếng Việt; audit tiếp2 exit0 lúc12:32:43+07,521file
exact/26checkpoint/generation80 nguyên/0crash-ANR/0submit. Evidence
`.backups/mobile-record-video-native-20261104-continuation1/results.json`.

Qua Samsung phát hiện Expo58 Android chuyển video xem hết sang `idle`, làm
nút phát lại bị khóa và có thể vô hiệu hóa rà soát tệp đã xem hết. Đã dùng
event `playToEnd` + reset khi source đổi để giữ trạng thái hợp lệ; không giữ
hợp lệ nếu player báo error. Bỏ mô tả kỹ thuật “cấu hình web” khỏi form.
Capture mới sau sửa, phát đến hết rồi phát lại thành công (frame1.042 giây).
Audit bản nguồn cuối exit0 lúc12:35:43+07:521file exact,4ảnh,26checkpoint giữ,
generation80/QA7-Tổng quan/ledger rỗng,0crash-ANR/0upload-submit. Evidence
`.backups/mobile-record-video-native-20261104-replay1/results.json` và
`source-provenance.json`. Không lấy bằng chứng trước sửa để đại diện bản cuối.
Native helper đã thêm đúng package picker Google; full harness còn vướng
accessibility player, chưa được gọi là full automated native pass.

Same8131 restart đúng process đã xác minh, không thay checkpoint để thêm
portfolio (video response chỉ đọc, không state mới). Server16552/handle66851,
Metro18372; reverse8081→8081/8091→8131, APK vẫn47d3071c…, không cài/clear lại.

Chưa kiểm sâu: provider staging thật, native chọn tệp/quay/upload/submit/ack,
45 MiB và codec/MOV/HEVC/mạng yếu/phiên hết hạn/nhiều phiên, signed iPhone.
Nhánh CloudFly browser direct MP4 của web chưa nối native (hiện dùng đường
Cloudinary conversion của web kể cả khi kho cuối là CloudFly). Video các lượt
gia hạn/ca và Telegram/action con còn tiếp. Không mở rộng tuyên bố sang 23 khu
vực, release hoặc nghiệm thu tổng thể.
