# QA tập trung — workspace hợp đồng, lịch trực và danh bạ

Mốc cuối:03/11/2026,12:56 (+07). Web `d1ea473`, nguồn tham khảo đồng nghiệp
`c08bfb9`, giữ nguyên worktree chưa commit. Không là nghiệm thu toàn app.

## Đã triển khai

- Nhóm hợp đồng toàn bộ/nháp/đến hạn/quá hạn/thuê sở hữu/VAT; tìm kiếm, trạng
  thái, ngày bắt đầu thuê, cơ sở hợp đồng/kho xe và phân trang. Dùng reader/
  billing/monitoring web; trả projection tường minh, không đưa draft payload/
  giấy tờ hay cột tùy ý vào danh sách. Phí trả trễ luôn ghi tạm tính.
- Sửa reader web dùng chung: scope quá hạn lọc hồ sơ thực quá hạn/nợ xấu trước
  đếm và phân trang; hồ sơ đang thuê nhưng chưa đến hạn không chiếm trang.
- Lịch trực tuần/ngày/cơ sở; tạo/sửa/xóa mềm gọi `saveDuty`/`deleteDuty` web,
  giữ revision, snapshot nhân sự, giờ Việt Nam, kiểm trùng ca. UUID bền vững,
  replay/tombstone/receipt, Account recovery và màn xác nhận đúng yêu cầu.
- Nhân sự/cơ sở: chỉ đọc danh bạ, tìm/lọc/phân trang/hồ sơ/liên hệ theo quyền
  web. CRUD hai nhóm này vẫn thiếu.
- Tổng quan có Lập hợp đồng/Thêm khách/GPS và lối vào workspace/module thật.
  Chọn lọc cấu trúc tuần và mặc định08–17giờ từ module đồng nghiệp; không
  chuyển auth/backend/lockfile. Khi xem tất cả cơ sở, tạo ca phải chọn cơ sở
  như web. UI chặn ca quá24giờ trước gửi; máy chủ vẫn kiểm độc lập.

## Kiểm tra nhanh

| Kiểm tra | Kết quả và giới hạn |
| --- | --- |
| Web typecheck | exit0; không build/deploy backend thật |
| Mobile typecheck/lint | exit0, kiểm lại sau chỉnh UI cuối |
| Lint backend liên quan |0error;3warning do shared files không có matching root ESLint config; không gọi là full root lint |
| `check-mobile-workspaces.cjs` |3nhóm; bounded scope/ngày/kho, projection và membership domain, reader SQL loại hồ sơ chưa đến hạn trước paging |
| `check-mobile-duty-roster.cjs --pglite-path ...` |4nhóm trên PostgreSQL nhúng riêng: create/replay/week; trùng ca/grants/key; revision/update/soft-delete; cancel/late delivery/originalID recovery. Không deployed RLS/multiple connections |
| Mobile API/pending-scope/write-recovery |8/13/6nhóm đạt |
| Web duty / draft-work-access |2/4nhóm offline đạt; access native matrix vẫn chưa kiểm |
| Management table offline |11nhóm đạt |
| Expo export web/Android/iOS |exit0, dùng `EXPO_NO_DOTENV=1` và API placeholder.invalid; trước hai chỉnh UI cuối. Bundle Android hiện tại được biên dịch lại qua Metro và mở trên Samsung. Không là signed iOS hoặc release build |

Root mobile suite/CI đã nối access/workspace checks; lịch trực PGlite vào bước
SQL QA có sẵn. Không chạy lại full mobile/full release/race/fault matrix trong
lượt này; không lấy số nhóm test làm tiến độ chức năng.

Một invocation cũ `check-contract-list-filters.cjs` đã nạp cấu hình env rồi
bị offline network guard chặn trước khi kết nối DB. **Không đạt**, không có
kết nối/ghi DB hay giá trị khóa trong log. Không tiếp tục dùng invocation này.
Các kiểm tra mới/PGlite/fixture không nạp env hoặc kết nối DB vận hành.

## Samsung và lỗi QA harness được giữ nguyên

Thiết bị Samsung SM-N960N Android9, serial `282a05859f3f7ece`, package
`vn.himoto.staff`, APK debug đã có. Metro8081/API origin8091 giữ nguyên.

Lượt `.backups/mobile-demo-native-20261103-run1/` thực hiện4nhóm thao tác:

1. Account xác nhận không có work/key tại QA watch8101 → đăng xuất → chuyển
   USB8091→QA demo8130 có checkpoint riêng. Không đổi env/real backend.
2. Nhập5phần hợp đồng, chọn khách QA có sẵn → lưu1nháp → mở lại đúng ghi chú;
   GPS mở từ tổng quan. Không kiểm lại camera/OCR/media trong lượt này.
3. Due rỗng đúng dataset chưa có khoản kỳ, mở nhân sự và cơ sở qua danh bạ.
4. Tạo/sửa/xóa mềm ca trực cùngID6001,3UUID/phiếu riêng, đọc và ack từng phiếu.
   Cuối work/key rỗng; giữ1nháp và1ca đã xóa mềm.

**Status tổng của run1 là failed**, do cuối script gọi thiếu tham số `package`
cho helper thu log. Không sửa kết quả thành pass hoặc ghi lại các thao tác để
làm đẹp evidence. Script đã sửa lời gọi; failed result/screenshots giữ nguyên.

Lượt review riêng `.backups/mobile-demo-native-review-20261103-run1/` đạt lúc
12:56:15 (+07):

- Source280file khớp; đúng3file khác run1: helper native; layout title;
  mặc định tất cả cơ sở và validation24giờ trong form lịch trực.
- Biên dịch bundle Android hiện tại, cold-open; xem Due/form lịch trực, đóng
  form chưa gửi qua xác nhận; Account work/key rỗng; về Tổng quan.
-26checkpoint giữ nguyên SHA qua lượt review, dataset demo không thay đổi;
  không thêm metadata/ảnh/ca/phiếu hoặc reset dữ liệu.
-0app crash/ANR/SystemUI ANR trong log đã lọc đúng package. Khoảng log lấy
  capture UTC run1 + offset đồng hồ thiết bị quan sát ở review -5giây; là
  khoảng bao phủ bảo thủ, không giả làm exact startedEpoch chưa lưu của run1.

Review này chỉ đọc/kiểm cuối, **không biến run1 thành full pass** và không
chứng nhận CRUD/all-role trên toàn source sau chỉnh cuối.

## Bản đang để theo dõi

- Samsung ở Tổng quan QA demo, USB8081→8081 và8091→8130 giữ chủ ý.
- Host fixture8130 PID11820; Metro8081 PID13376. PID là mốc quan sát, phải
  kiểm lại trước thao tác. Watch8101 PID10548 và mọi dataset cũ vẫn giữ.
- Checkpoint `.backups/mobile-demo-workspace-fixture-20261103-run1/state.json`;
  server `scripts/mobile-demo-fixture-server.py`. Không khởi động trắng/xóa
  ledger/reset checkpoint. Có1nháp2001, số giấy96103, noteDemoQA0311; ca6001
  đã xóa mềm,3yêu cầu ca được giữ. Tạo ca tiếp sẽ cóIDmới.
- App cần USB/Metro; đây chưa phải APK release độc lập hoặc dữ liệu vận hành.

## Chưa kiểm sâu / còn thiếu

Toàn vai trò/cơ sở/RLS staging; nhiều phiên, request mất phản hồi, race/fault,
session/lifecycle/native accessibility/hiệu năng; các trường hợp ca đêm/legacy
trên thiết bị; camera/HEIC/video/OCR toàn luồng; signed iOS/iPhone thật;
release/vận hành. Workspace mới chưa thay thế đủ action con/thống kê/Excel/
correction/chứng từ web. Các module còn lại vẫn trong phạm vi bắt buộc.

Tiếp tục [các đợt](../mobile-implementation-waves-2026-11-03.md) và
[backlog](../mobile-action-backlog.md), ưu tiên phủ chức năng; không giữ dự án
ở các vòng kiểm sâu cho lát này trước module tiếp theo.
