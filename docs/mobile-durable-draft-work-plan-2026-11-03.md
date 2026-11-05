> **Bàn giao mới nhất03/11:** đọc [mobile-handoff-2026-11-03.md](mobile-handoff-2026-11-03.md)
> và [đoạn copy sang chat mới](mobile-next-chat-prompt-2026-11-03.md). Toàn dự án
> chưa done. Source access/quyền/cơ sở đang sửa có types/lint và offline checks
> đạt, chưa native/browser/export/full-suite; không dùng các mốc native cũ
> chứng nhận source mới. Các mục bên dưới giữ nguyên làm lịch sử/baseline.

> Cập nhật03/11: source form/ảnh/metadata/copy/Account/guard đã nối; core33
> script và mobile types/lint đạt. Leave/picker/AppState đã sửa; Samsung
> transitions run2 đạt4/4 lúc10:39, form/API regression run3 đạt4/4 lúc10:51,
> cùng258file khớp/0crash/ANR. [Trạng thái và giới hạn mới](qa/2026-11-03-mobile-draft-work-transitions.md).
> Native copy qua work sau đó đạt4/4 riêng lúc11:08,259file/0crash/ANR,
> 2nháp/1ảnh/2copy/8giấy tờ/1tombstone/session0/work+ledger rỗng; product source
> giữ nguyên. [QA copy work](qa/2026-11-03-mobile-draft-work-copy.md).
> Các đoạn “chưa nối” bên dưới mô tả mốc thiết kế/storage trước đó, không thay
> bằng chứng nghiệm thu mới; giới hạn role/lifecycle/storage/performance/iPhone
> vẫn bắt buộc và CF-05d chưa done.

# CF-05d — khôi phục bản đang soạn và ảnh chưa gửi

Đã có implementation lớp schema/journal/native-files/intent và offline gates;
chưa nối form/Account/autosave/resume sản phẩm. Native adapter Samsung đã đạt4/4
riêng trên246 file,0crash/ANR ngày03/11,09:12. [Bằng chứng và giới hạn](qa/2026-11-03-mobile-contract-work-storage.md).
Giữ đủ phạm vi web và Android/iPhone; CF-05d vẫn đang triển khai, chưa done.

## Vấn đề trong source hiện tại

`useContractPhotos` giữ danh sách ảnh và savedTo/attempt trong RAM; unmount gọi
dispose của PreparedPhoto và xóa bản JPEG cache do app tạo. Draft input và liên
kết ảnh→xe/slot cũng trong RAM. SecureStore chỉ giữ actor/origin/scope/action/UUID
của yêu cầu đã gửi. Do đó key/phiếu phục hồi được nhưng không đủ để dựng lại
form và ảnh chưa gửi sau kill. Không thể giải quyết chỉ bằng giữ file cache.

## Dữ liệu bền vững cần có

- Work item riêng của origin + actor, scope gốc và local draft ID. Lưu toàn bộ
  input đang soạn, customer snapshot, các dòng xe/driver/accessories/ngày/tiền,
  loại/mode/trang đang nhập; không lưu bearer token hoặc cấu hình server.
- Ảnh: stable local ID, slot/thứ tự/vehicle association, owned file ID, MIME/
  dimensions/byte count + digest để phát hiện file đổi/mất. Chỉ sao chép JPEG
  đã chuẩn bị vào private app documents, không giữ một URI gallery phụ thuộc
  quyền tạm. Không xóa/chuyển file gốc của người dùng.
- Liên kết metadata request UUID và original receipt/contract ID. Ảnh có attempt
  UUID và target/revision/snapshot đã gửi, saved receipt acknowledgement. Mất
  phản hồi/kill không được đổi draft ID hoặc chuyển ảnh sang HĐ mới.
- Version/checksum/schema và journal cho index. Commit file trước index; index
  thay nguyên tử qua temporary file. Recovery phân biệt commit dở dang và file
  thiếu/corrupt; không tự xóa state lỗi hoặc lặng lẽ dựng queue trống.

## Trình tự và phục hồi

Autosave metadata nhỏ có thứ tự; flush trước thao tác lưu/chuyển ảnh/đổi phiên.
Copy vào private durable storage thành công trước khi xóa cache app tạo. Không
đưa base64 ảnh vào SecureStore hoặc JSON input mỗi lần gõ. File thuộc work item,
không bị dispose của view xóa khi unmount; cleanup chỉ sau server proof + index
ack hoặc user xác nhận bỏ bản đang soạn. Cleanup chỉ trong owned work directory.

Resume hiển thị bản đang soạn đúng tài khoản/môi trường. Actor khác không được
thấy tên khách/ảnh/queue hoặc tiêu thụ UUID; logout giữ work item của actor gốc.
Đổi cơ sở cùng actor phải giữ store/target gốc và rà soát quyền/UUID, không tự
đổi cơ sở hợp đồng. Khi UUID đã gửi, resolver/phiếu gốc quyết định trạng thái
trước khi cho gửi tiếp; không suy từ client stage hoặc số đếm.

Lưu metadata → ảnh khách/xe/GPLX/giao dịch → copy giấy tờ theo web. Khi metadata
đã có, chỉ hoàn tất phần còn thiếu trên original ID. Account acknowledgement
phải cập nhật work item gắn với đúng attempt, kể cả sau khi form gốc đã bị kill.
Ảnh chưa bind hoặc xe bị bỏ chọn phải được user xử lý, không tự gắn sang xe mới.

## Các ca phải kiểm trước nghiệm thu

- Kill trước metadata, sau reserve UUID/trước request, sau commit/mất phản hồi,
  giữa các ảnh, sau image proof/trước local ack, và trong copy customer papers.
- Hết phiên/đổi actor/đổi scope/đổi origin, sửa cùng HĐ trên phiên khác, tombstone
  và yêu cầu đến muộn; giữ đúng fields/money/slot/xe và không thêm metadata/ảnh.
- Cache bị OS dọn, file/manifest corrupt, disk full, atomic write bị lỗi, thiếu
  permission sau picker, camera/HEIC/rotation; giữ đường xử lý không mất dữ liệu.
- Discard có xác nhận và cleanup owned files; không chạm gallery/file khác hoặc
  queue của actor khác. Kiểm real native Android/Samsung và signed iPhone.
- QA switching: không reset queue/ledger của lượt fail. Đối chiếu original fixture
  và kết thúc work item qua UI trước khi sang checkpoint mới; localhost origin
  và actorID giống nhau giữa fixture không phải quyền nhận nhầm queue cũ.

Phải đọc docs Expo58 FileSystem theo mobile/AGENTS trước khi viết persistence;
ưu tiên module đã cài, không tự thêm native dependency hoặc sửa generated code.

## Thứ tự intent phải chốt khi viết store

Đã đối chiếu SDK58 docs và source `expo-file-system`58.0.13 đang cài: File.copy,
move,write,digest trả Promise; delete sync. Có digest('SHA-256') nên không cần
thêm module crypto native chỉ để kiểm ảnh. Phải await thao tác ghi/copy/move và
xác minh file trước khi phát hành manifest. Đây là khảo sát API, chưa là source
persistence hoặc chứng nhận atomic rename/fsync trên Android/iPhone.

Tên thư mục/work/photo dùng UUID đã validate, không dùng khách/tên file/URI
picker hoặc URL backend làm path. File trong private documents thuộc work item;
manifest scope/header tách dữ liệu input/ảnh để actor khác không được load PII.
Manifest lưu file ID tương đối, không tin raw file URI để đọc/xóa khi resume.
Giữ generation/checksum và bản hợp lệ trước; corruption/incomplete commit phải
hiển thị đường phục hồi, không tự giả định không có work item.

Planned UUID + normalized input/review + work item association phải bền vững
TRƯỚC reserve SecureStore và trước HTTP. Sau đó reserveExclusive phải trả đúng
planned key/action; nếu là intent của work khác thì chặn, không chép key đó vào
work hiện tại. Crash giữa file commit và SecureStore reserve có thể reserve lại
planned UUID; crash sau reserve/HTTP thì đối chiếu đúng UUID trước khi đổi input
hoặc cấp key mới. Không suy chưa gửi chỉ vì client stage chưa kịp cập nhật.

Account mở receipt/ack phải ghi association vào work store trước khi complete
pending key: metadata chỉ bind original contract ID, không đánh dấu ảnh đã gửi;
ảnh bind đúng photo ID/slot/attempt và chỉ mark saved khi đã xem/ack phiếu gốc.
Nếu file/manifest write lỗi, giữ key và báo thử lại, không mở nút tạo HĐ mới.
Discard cũng phải đối chiếu mọi intent có thể đã gửi trước khi cleanup owned
files; nguồn ảnh gallery không thuộc cleanup. Cần fault injection từng ranh
giới này trước khi nối UI/native, không dùng count hoặc local phase thay proof.

## Thứ tự upload đã chốt trước work item —03/11,08:25

Đã triển khai `shared/mobile-contract-photo-order.ts` và dùng trong
ContractPhotoSave: ảnh khách → selected plates → GPLX → transaction → copy.
Phase tính từ slot, giữ thứ tự nội bộ và phiếu cũ; chặn ảnh chưa gắn đúng xe,
slot sai hoặc savedTo khác HĐ. API/logic6, journal3, browser4/4, Samsung3/3
(237 file khớp/0crash/ANR), gồm chọn signed trước GPLX/GPLX2 rồi lost/drop giữa
nhóm,1metadata ID/không gửi lại ảnh đã có phiếu. [QA](qa/2026-11-03-mobile-contract-photo-order.md).

Đây là tiền đề đã sửa, chưa là work store/persistence. Khi nối store phải dùng
lại helper tính phase từ slot; không tin phase lưu trong manifest, không gửi
lại ảnh cũ để đổi lịch sử. Các ca kill/ack/linkage ở trên vẫn bắt buộc.

## Không giả định overwrite là atomic — khảo sát source SDK58 ngày03/11

Đã đọc source module đang cài, không sửa native/generated code:
`expo-file-system/ios/FileSystemFile.swift` write string dùng atomically:false;
`FileSystemPath.swift` move với overwrite xóa destination rồi mới moveItem.
Android FileSystemPath.move ủy quyền qua UnifiedFile copy/move strategy; chưa
có bằng chứng tất cả private-file paths dùng atomic replacement hoặc fsync.
Vì vậy temp→move(overwrite:true) một manifest duy nhất không đủ bảo đảm bản
hợp lệ cũ còn nguyên khi kill/lỗi giữa remove và move, nhất là iPhone.

Work store phải giữ generation trước và tạo generation/commit record mới ở
path owned riêng; không overwrite/xóa bản hợp lệ cuối để publish index. Verify
checksum và đọc lại trước khi trả success/cho reserve hoặc gửi HTTP. Recovery
cần nhận diện candidate/commit không hoàn tất và đối chiếu pending ledger; nếu
không chứng minh được attempt mới nhất thì chặn gửi, không âm thầm trả queue
cũ/trống và cấp UUID mới. Giữ nguyên yêu cầu native fault injection, disk full,
corrupt/missing file và signed iPhone. Đây là phát hiện triển khai, chưa là
chứng nhận crash/power-loss durability hoặc source persistence đã có.

## Nối form và Account sau kiểm adapter — chưa triển khai

Không dùng savedTo hoặc metadata receipt trong RAM để đánh dấu cả queue xong.
Controller phải có một head/generation và owner bất biến, update có thứ tự;
file import commit xong mới dispose cache. Hydration hoàn tất trước khi mở form,
không dùng effect autosave viết đè dữ liệu vừa tải. Empty untouched draft không
tạo work item. Bản input đang sửa được giữ riêng với bản input/review đã gửi.

DraftEditor/DraftForm cần chọn resume đúng work UUID; work có originalID thì
mở phần ảnh/copy trên ID đó, không tái tạo metadata. useContractPhotos cần giữ
owned photo khi unmount, await commit bind/remove/OCR/manual association; chỉ
cập nhật UI thành công sau commit và không đổi ảnh của session đã hết hạn.
useDraftWrite/ContractPhotoSave/useCustomerPhotoCopy phải dùng planned intent
trước reserve và đồng nhất lifecycle/phiếu với work; không tạo mã mới khi đang
có planned hoặc chưa ack, không nhận UUID của work khác. Thực thi đúng thứ tự
helper shared/mobile-contract-photo-order.ts đã nghiệm thu.

Account list/resolve/open/ack phải tìm work của đúng actor/origin + exact UUID,
settle file trước xóa pending key. Không tìm thấy/corrupt work thì giữ mã, hiện
đường sửa lỗi, không âm thầm đi theo nhánh writer cũ và complete ledger. Nếu
scope đã đổi, giữ store/target gốc; tránh list theo scope mới làm ẩn work cũ,
chỉ đọc kết quả thuộc actor khi API hiện tại còn quyền. Không cần đọc payload
của actor khác để xác định work của actor đang đăng nhập.

Phải đo chi phí quét chain và hash ảnh trước bật autosave: phiên bản đầu load
mọi generation và hash ảnh còn lại, chưa hợp lý nếu gọi sau mỗi phím. Cần
controller debounce metadata có indicator chưa lưu/lưu rồi, flush trước điều
hướng/lưu/server intent và ranh giới picker/background; crash-before-flush cần
chứng minh trạng thái đúng và thông báo phần chưa được xác nhận lưu. Thiết kế
index/compaction không được xóa bản hợp lệ cuối hoặc giấu generation chưa rõ.
Chưa có lối xử lý generation lỗi/disk full trong UI; đây là việc bắt buộc trước
nghiệm thu người dùng, không chỉ hiện một lỗi storage rồi để mắc kẹt.

Sau nối cần lượt native liên tục độc lập trên fixture mới: form/photos chưa
metadata, kill sau planned/reserve/commit-before-local-ack, giữaGPLX/transaction,
copy và Account riêng; verify no duplicate, exact slot/xe/money/actor/scope.
Lượt native adapter không thay các ca này hoặc signed iPhone.
