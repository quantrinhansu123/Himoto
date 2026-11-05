# Đánh giá kết hợp hai bản app Himoto — 02/11/2026

## Mốc triển khai03/11

GPS đã triển khai trên nền mobile hiện tại, tham khảo bố cục card/filter của
bản đồng nghiệp; adapter, trạng thái, lịch sử, quyền và ghép theo web mới.
Không nhập nguyên màn hình/session/client cũ. Samsung run5 đạt4/4 tập trung,
210 file khớp/0 crash/ANR; [QA GPS](qa/2026-11-03-mobile-gps.md).
Transition schema legacy/current đã qua7 nhóm SQL/auth offline, chưa áp thật
và chưa chứng nhận APK đồng nghiệp. Các đề xuất phía dưới là baseline phân
tích02/11, không thay thế trạng thái triển khai mới trong handoff/backlog.

## Kết luận và phạm vi

**Có thể tận dụng cả hai bản. Đề xuất lấy `E:/Himoto/mobile` làm app chính,
chuyển chọn lọc module từ repo đồng nghiệp, giữ web mới nhất làm chuẩn nghiệp vụ.**
Không gộp nguyên thư mục app/backend hoặc hai lockfile. Chưa nhập mã sản phẩm
của đồng nghiệp trong lượt phân tích này; các mục chuyển module dưới đây là
đề xuất triển khai, không phải chức năng đã tích hợp hoặc nghiệm thu.

Phạm vi vẫn là **100% chức năng web theo vai trò**, gồm đọc/tạo/sửa/xóa/duyệt,
cấu hình, nhập/xuất, Excel và các hành động con web cho phép. Giữ trình tự,
điều kiện, mặc định, quyền, số tiền, trạng thái, chứng từ và kết quả. Thiết kế
riêng cho điện thoại; chỉ hoàn thành sau nghiệm thu native Android/iPhone và
các điều kiện phát hành trong [ma trận chức năng](mobile-web-parity.md).

## Baseline đã kiểm tra

| Nguồn | Mốc source | Vai trò trong phương án |
| --- | --- | --- |
| Web chính `quantrinhansu123/Himoto` | Nhánh local `feat/mobile-foundation`, đã pull `ac4b189` → `d1ea473` từ `origin/main` | Chuẩn nghiệp vụ/backend và nền mobile hiện tại |
| Repo đồng nghiệp `quanhoang55/Himoto_MobileApp` | `main`, `c08bfb9`, commit ngày 26/10/2026 | Nguồn module/UI/API cần đánh giá để chuyển |
| Bản clone phục vụ đối chiếu | `E:/Himoto_MobileApp` | Giữ riêng, chưa cài/chạy app hoặc nối backend của bản này |

Hai URL người dùng cung cấp cho app là **một repo và một thư mục trong repo đó**.
Repo đồng nghiệp chứa `Himoto/` là bản web/backend đi kèm và
`Himoto_App/frontend/` là app Expo. `Himoto_App/backend/` chỉ có launcher và
script migration, không phải một backend nghiệp vụ độc lập cần duy trì.

Pull web đã chuẩn bị bản sao source chưa commit, gộp ba file giao nhau bằng
three-way merge có chuẩn hóa xuống dòng, rồi fast-forward. Đối chiếu 360 file
công việc trước pull: 357 file nguyên SHA, ba file đúng kết quả gộp; không có
mismatch. Không commit/stash/push/deploy hoặc áp migration. Không đọc/sao lưu
file môi trường. Bằng chứng:
`.backups/prepull-mobile-review-20261102-223205/{manifest,verification}.json`.

Các thay đổi web vừa nhận ảnh hưởng trực tiếp parity: mở hồ sơ khách từ cảnh
báo trùng; ảnh bill gia hạn hoạt động độc lập quyền Telegram; sửa chứng từ
không có tài khoản phân bổ/số tiền bằng 0; điều hướng trên mobile web. Cần
dùng source sau pull làm chuẩn, không tiếp tục dựa vào snapshot web ngày 26/10.

## Khác biệt nền tảng phải giải quyết trước khi chuyển module

| Hạng mục | Bản hiện tại | Bản đồng nghiệp | Cách xử lý đề xuất |
| --- | --- | --- | --- |
| Runtime | Expo 58, React Native 0.88.1, React 19.3 | Expo 57, React Native 0.86.3, React 19.2.3 | Giữ bộ dependency hiện tại; sửa từng module theo SDK 58, không chép lockfile |
| Session | `/session`, opaque token, hết hạn tuyệt đối 8 giờ, kiểm password version | `/auth/login`, `/auth/refresh`, access 15 phút/refresh 30 ngày | Giữ một session/API client; không trộn chính sách phiên |
| DTO | Typed contract trong `shared/`, list có `rows/pages` | Models riêng, list có `items/hasMore`, user dùng tên trường khác | Viết lại adapter/DTO mỗi module theo contract chính |
| Ghi và phục hồi | UUID bền vững, revision, receipt, đối chiếu/tombstone và khóa thao tác chưa rõ kết quả | Mức bảo vệ khác nhau theo action; nhiều UUID chỉ giữ trong component | Bổ sung vào protocol hiện tại trước khi bật thao tác ghi |
| UI | Theme sáng/tối, component/form/picker chung | Nhiều screen tự định nghĩa style và modal | Chuyển nội dung/logic phù hợp vào component/theme chính |
| App identity | Android `vn.himoto.staff` | Android `com.himoto.mobile` | Giữ identity dự án hiện tại; kiểm cấu hình ký/phân phối iOS riêng |

**Xung đột schema đã thấy trong source:** cả hai migration đều tạo bảng
`himoto.management_mobile_sessions` nhưng cột khác nhau. Bản 25/10 dùng
`access_token_hash`, `refresh_token_hash`, hai mốc hết hạn; bản 31/10 dùng
`token_hash`, `password_version`, `device_name`, `platform`, `expires_at`.
`CREATE TABLE IF NOT EXISTS` không chuyển đổi schema cũ sang mới.

Chưa kiểm database đích nên chưa biết schema nào đang được áp dụng. Trước khi
nối dữ liệu thật phải preflight catalog/schema và route/session thực tế. Nếu
schema cũ tồn tại, cần migration chuyển tiếp đã review và thử trên staging;
không xóa bảng, không giả định chỉ chạy thêm SQL là đủ. App đã phát hành theo
protocol cũ, nếu có, cũng cần kế hoạch thay phiên bản/thu hồi phiên rõ ràng.

## Phần có thể tận dụng và giới hạn đã quan sát

Đây là kết quả đọc source, chưa phải chứng nhận chạy native bản đồng nghiệp.
README/roadmap của bản đó có đoạn còn ghi giai đoạn cũ; trạng thái dưới đây
dựa vào screen và route thực có, không lấy số màn hình làm tiến độ.

| Nhóm | Source đồng nghiệp có | Quyết định đề xuất |
| --- | --- | --- |
| Lịch trực | Xem tuần/cá nhân, chọn nhân sự/cơ sở, tạo/sửa/xóa mềm; API gọi domain lịch trực web | Ứng viên chuyển tốt; đổi auth/DTO, picker và protocol ghi/phục hồi, kiểm lại domain mới nhất |
| GPS | Danh sách/trạng thái/thời gian cập nhật, tìm/lọc, mở bản đồ ngoài; GET scoped | Tận dụng bố cục và trường dữ liệu; xây lại query theo lựa chọn thiết bị/trạng thái/stop evidence dùng chung web, phân trang và lifecycle |
| Đội xe | Form tạo/sửa trường kho xe; lịch sử xe và lịch sử điều chuyển toàn hệ thống | Chuyển từng capability còn thiếu; domain hiện tại giữ chuẩn ownership/kho và quyền |
| Nhắc nợ | Lịch sử, chọn hợp đồng, soạn/gửi Zalo, phân biệt webhook tiếp nhận với khách đã nhận | Tận dụng workflow; bổ sung phục hồi yêu cầu chưa rõ kết quả và quyền/domain mới. Test không gửi tin thật |
| Hợp đồng/xe: lịch sử | Có screen/API lịch sử thay đổi, thu chi và sự kiện xe | Chuyển projection/UI cần thiết; giữ phân trang/quyền và proof hiện tại |
| Tổng hợp tài chính | Tổng thu/chi/doanh thu tháng từ cashbook domain | Tận dụng card/adapter; chưa thay thế sổ quỹ, chứng từ độc lập, sửa/duyệt/đối soát |
| Nhân sự/cơ sở | Danh sách nhân sự; danh bạ cơ sở đọc từ bootstrap | Tận dụng tra cứu; không tính là quản lý hồ sơ/tạo/sửa/xóa/cấu hình đầy đủ |
| Báo cáo ca | Danh sách tối đa 50 báo cáo với ngày/trạng thái/cơ sở | Chỉ tận dụng danh sách; tạo/sửa/nộp/duyệt và chứng từ còn phải làm |
| Nhập hợp đồng/khách | Form trực tiếp trong `RecordWorkspace`, có API nháp/khách; workflow đặt cọc/nhập bổ sung | Không lấy làm luồng chuẩn. Tách action còn thiếu để đối chiếu và xây trên editor hiện tại |
| Trả xe/gia hạn/thu chi | Có route gọi domain và UI ghi ở một số nhánh | Giữ implementation hiện tại; đối chiếu bổ sung tìm kiếm/nhập lịch sử nếu còn thiếu |
| Auth/core/backend snapshot | Có một bộ riêng, cùng namespace mobile nhưng khác contract | Không chép đè core hoặc web snapshot; chuyển API theo domain từng module |

GPS bản đồng nghiệp đọc tất cả thiết bị và tự tính stale ở screen, chưa dùng
`VEHICLE_GPS_JOIN_SQL` để chọn một thiết bị đúng cho mỗi xe như web hiện tại;
screen polling mỗi 15 giây chưa có điều kiện foreground/focus. Không coi có
danh sách và nút mở Google Maps là đủ GPS web (history/dừng lâu/mapping/sync).

Một số mutation khách hàng của bản đồng nghiệp dùng SQL ngay trong route:
`PATCH` tự validation một tập trường; `DELETE` xóa cứng sau kiểm hợp đồng liên
kết và không nhận revision. Không chuyển nguyên các route này rồi coi đã giữ
đúng domain/quyền/audit web hiện tại. Đối chiếu từng action với domain web mới
nhất và protocol ghi/phục hồi chính trước khi đưa vào app.

## Các chênh lệch ở luồng người dùng nêu

### 1. Nhập hợp đồng và chọn khách/xe

Web có năm phần: **Hợp đồng & pháp lý → Khách hàng → Phương tiện → Chi phí →
Ký kết & ghi chú**, sau đó các thao tác lưu nháp/rà soát thanh toán/phát hành
theo mode và quyền. Không nên tự đặt lại trình tự khi làm UI native.

- Bản đồng nghiệp cho nhập trực tiếp tên/điện thoại/CCCD và tên xe/biển số
  trong modal nháp. Hàm cập nhật xe chỉ thao tác phần tử đầu mảng; chưa có
  bộ chọn khách/xe thật tương đương web trong form này.
- Bản hiện tại có tra cứu khách exact/liên cơ sở, chọn xe và kiểm lịch thật,
  nhưng editor đang bốn bước `Thông tin thuê / Khách hàng / Xe / Rà soát`.
  Chưa có đường tạo khách ngay trong editor và quay về chọn đúng khách mới.
- Cần map năm phần web và mọi action con sang native, giữ cơ sở ghi nhận
  doanh thu khác cơ sở xe/nhân sự, khách/người lái, nhiều xe, giá/kỳ và quyền.
  Chia màn native được, nhưng dependency và trình tự nghiệp vụ phải giữ nguyên.
- Lưu nháp vẫn được thiếu dữ liệu theo web. Hồ sơ tạm cho cọc giữ xe và hồ sơ
  thường phải giữ điều kiện riêng; không ép validation phát hành vào lưu nháp.

### 2. Khách mới, khách trùng, mặc định

Web mới nhất hỗ trợ từ cảnh báo trùng mở hồ sơ theo quyền hoặc dùng khách đã
có; giữ ảnh đã chụp cho tới khi người dùng quyết định lưu vào hồ sơ đúng.
App phải quay lại hợp đồng đang soạn, giữ xe/ngày/giá và không tạo khách trùng.

Một lệch mặc định của **bản hiện tại** cũng cần sửa: `emptyCustomer()` đặt
`status: "draft"`, trong khi form web thường mặc định `active`; web chỉ tạo
hồ sơ tạm khi chọn mode tương ứng. Không được lấy bản hiện tại làm chuẩn
nghiệp vụ chỉ vì có nhiều test hơn.

### 3. Ảnh và OCR trong lúc lập hợp đồng

Web có ảnh CCCD/hộ chiếu/GPLX/biển số theo đúng khách/xe, OCR với rà soát trường,
lưu khách/nháp rồi tải ảnh và copy ảnh khách sang hợp đồng theo quyền. Upload
lỗi phải dùng lại hồ sơ vừa lưu, giữ form để thử lại.

Media hiện tại đã làm cho bill và hồ sơ **trả/đổi/chuyển/nhận**. Các target này
không thay thế ảnh lúc **tạo khách/lập hợp đồng**. Repo đồng nghiệp cũng chưa
có luồng ảnh tương đương trong form hợp đồng đã đọc. Phải bổ sung riêng các
target/slot, quyền, retry/proof, OCR và màn native cho giai đoạn nhập hồ sơ.

## Thứ tự triển khai đề xuất

### M0 — Chốt hợp đồng tích hợp và backlog

1. Giữ baseline hiện tại và bản đồng nghiệp riêng; ghi nguồn commit cho mỗi
   phần chuyển. Dùng một app, một backend/domain, một auth và bộ DTO chính.
2. Bóc 23 entrypoint trong ma trận thành từng action. Mỗi dòng có: ID, màn web/
   domain, điều kiện và thứ tự, vai trò/quyền/cơ sở, input/mặc định, ảnh hưởng
   tiền/kho/trạng thái, source tái dùng, phần thiếu, người làm, effort, bằng chứng.
3. Preflight route/feature gate/session/schema đích chỉ đọc; chuẩn bị kế hoạch
   tương thích schema cũ nếu có. Chưa tự áp migration/deploy.
4. Chốt kịch bản mẫu của luồng hợp đồng trực tiếp từ web mới nhất, rồi dùng
   kịch bản đó đối chiếu UI native. Không hoàn thành backlog chỉ bằng đếm page.

### M1 — Sửa luồng nhập hồ sơ/hợp đồng; GPS là ưu tiên chuyển module

Luồng hợp đồng là hạng mục khắc phục parity trước mở rộng các mutation mới.
GPS vẫn là ưu tiên bắt buộc từ bàn giao; chuẩn bị API/query và chuyển GPS trong
cùng mốc khi contract/DTO đã chốt, không dùng luồng cũ làm đường tắt.

| Action ưu tiên | Kết quả cần có | Nguồn triển khai |
| --- | --- | --- |
| CF-01 | Năm phần theo web; đầy đủ loại/mode, defaults, cơ sở, nhân sự, ngày và ký kết | Web mới nhất + editor hiện tại |
| CF-02 | Tìm khách exact/liên cơ sở theo quyền, chọn đúng hồ sơ và xử lý nhiều kết quả | Picker/API hiện tại + web |
| CF-03 | Thêm khách trong hợp đồng, quay lại dùng đúng ID, giữ toàn bộ form | Customer editor/domain hiện tại + web |
| CF-04 | Khách trùng: dùng hồ sơ/mở xem/sửa theo quyền; không mất ảnh và dữ liệu | Web `d1ea473` |
| CF-05 | Chụp/chọn/xem/thay ảnh giấy tờ, OCR có rà soát, lưu lại an toàn khi upload lỗi | Domain ảnh/OCR web + module native phù hợp |
| CF-06 | Chọn nhiều xe thật/kiểm lịch, ảnh biển số từng xe, giấy tờ người lái | Picker hiện tại + web |
| CF-07 | Lưu/mở/sửa/xóa nháp theo quyền/revision, nháp thiếu dữ liệu vẫn đúng luật | Hiện tại + đối chiếu phần xóa nháp đồng nghiệp |
| CF-08 | Phát hành/đặt cọc/giao xe; phân biệt tiền thực nhận, chia khoản/phương thức, phiếu | Domain và recovery hiện tại + đầy đủ parity web |
| CF-09 | Mất phản hồi/đóng app: đối chiếu đúng khách/nháp/ảnh/phiếu, không gửi trùng | Recovery hiện tại mở rộng cho action mới |
| GPS-01 | Danh sách/chi tiết, trạng thái/độ mới/heartbeat/vị trí, map/history/dừng lâu | UI đồng nghiệp + shared GPS web |
| GPS-02 | Refresh/sync/mapping theo đúng quyền, giới hạn và lease web | Web hiện tại; không gọi provider thật trong test thường |

Exit gate M1: các action trên có API/SQL/quyền và native acceptance đúng source.
Cho phép bàn giao từng lát đã kiểm; chưa gọi mốc này là đủ 100% web.

### M2 — Chuyển module có giá trị, hoàn thiện vận hành

Theo thứ tự phụ thuộc: lịch trực và nhân sự tra cứu; tạo/sửa xe và lịch sử/
điều chuyển toàn hệ thống; nhắc nợ; báo cáo ca; tổng hợp tài chính/sổ quỹ.
Tận dụng module nguồn nhưng nối domain hiện tại; mở từng hành động sau kiểm
allowed/denied role, cơ sở, conflict và retry. Chốt hành vi nhận/gửi thông báo
theo web, không suy webhook accepted thành giao tin thành công.

### M3 — Khép kín full web, giữ tất cả module trong phạm vi

Hoàn thiện toàn bộ action còn lại của Tổng quan; đội xe; hợp đồng và các workspace
nháp/đến kỳ/quá hạn/thuê sở hữu/VAT/pin-sạc; loại/mẫu; sổ quỹ/nhắc nợ; doanh số;
báo cáo ca/lịch trực/vận hành; nhân sự/cơ sở/tài khoản/tích hợp. Kèm lịch sử,
correction, chứng từ/in/xuất và nhập Excel theo quyền ở từng module.

Mỗi action chỉ có trạng thái có bằng chứng: chưa làm / đang làm / đã nối API /
đã kiểm staging / đã nghiệm thu Android / đã nghiệm thu iPhone. Không dùng
`có màn hình` hoặc `đã qua test unit` thay cho hoàn thành.

### M4 — Nghiệm thu và phát hành

- Staging PostgreSQL/RLS sát môi trường thật, đủ vai trò/cơ sở; so web và app
  từ cùng trạng thái trước để đối chiếu số tiền, kho, trạng thái và phiếu/audit.
- Retry, mất phản hồi sau commit, hai người cùng sửa, đổi quyền/cơ sở, hết phiên,
  đóng tiến trình; không reset pending hoặc xóa chứng từ để làm test đạt.
- Native Samsung/Android và iPhone có bản ký: bàn phím, Back, safe area, chữ
  lớn/trợ năng, camera/gallery/video/HEIC/xoay, picker bị hệ điều hành đóng,
  bộ nhớ, mạng yếu, release performance. Đặt ngân sách hiệu năng sau baseline đo.
- Build release đã ký, phân phối, giám sát/khôi phục và checklist vận hành.
  Bundle/browser hoặc nhiều lượt native tập trung không thay thế full acceptance.

## Phân công cho hai người và cách bàn giao

| Trách nhiệm | Phụ trách đề xuất | Sản phẩm bàn giao |
| --- | --- | --- |
| Parity web, domain/API/SQL, schema compatibility, permission và recovery | Người phụ trách web/backend | Action spec, typed DTO, adapter gọi domain chung, kiểm quyền/transaction và dữ liệu QA |
| Chuyển module/UI native, điều hướng/form/picker/media, khả dụng và hiệu năng | Dev mobile | Luồng theo action spec, giữ form/phục hồi, bằng chứng native Android/iPhone |
| Review/acceptance | Cả hai | Chạy cùng kịch bản web/native, xác nhận kết quả tiền/kho/phiếu, không chỉ duyệt ảnh màn hình |

Đây là đề xuất phân công, chưa giao việc hoặc liên hệ người khác. Tách thay đổi
theo module/action; không để cả hai sửa auth/core hoặc cùng editor mà thiếu
ownership. Chốt API và ví dụ success/error trước khi làm hai phía. Chỉ ước lượng
effort/lịch sau inventory; hiện chưa có cơ sở công bố phần trăm full web hoặc
ngày hoàn thành đáng tin cậy.

## Kiểm chứng trong lượt phân tích

- Pull web thành công lên `d1ea473`; clone đồng nghiệp sạch tại `c08bfb9`.
- `npm.cmd run test:mobile`: 22 script kiểm tra API/client/form đạt.
- `npm.cmd run test:release`: 44/44 suite đạt, network ngoài bị chặn.
- `npm.cmd run typecheck`, `npm.cmd --prefix mobile run typecheck`: đạt.
- Root/mobile lint: 0 lỗi; root có một warning đã tồn tại ở `estimated-sales.ts`.
- `node --require ./scripts/lib/offline-tests.cjs scripts/check-renewal-photo-context.cjs`: đạt.
- `node scripts/check-mobile-finance-sql.cjs --pglite-path .backups/mobile-sql-qa/node_modules/@electric-sql/pglite`:
  124 nhóm đạt, dữ liệu QA trong bộ nhớ, 0 operational writes. Một kết nối;
  không chứng minh deployed RLS hoặc tranh chấp nhiều phiên staging.

Chưa chạy native mới, chưa build release, chưa chạy bản đồng nghiệp và chưa
preflight backend/schema thật. Các test trên xác nhận baseline sau pull;
không chứng nhận module đồng nghiệp đã tích hợp hoặc app đầy đủ chức năng.

## Source dùng để đối chiếu

- [Bàn giao](mobile-handoff-2026-11-02.md), [ma trận](mobile-web-parity.md),
  [roadmap](mobile-roadmap.md), [kiến trúc](mobile-architecture.md).
- Web: `src/components/contracts/ContractComposer.tsx`,
  `CustomerCreateDialog.tsx`, `ContractSectionTabs.tsx`;
  `src/lib/server/{vehicle-gps-query,selected-vehicle-gps}.ts`.
- App hiện tại: `mobile/src/components/{draft-editor,draft-pickers,customer-editor}.tsx`,
  `mobile/src/lib/{draft-form,customer-form}.ts`, `shared/mobile-contract.ts`.
- Đồng nghiệp: `E:/Himoto_MobileApp/Himoto_App/frontend/src/components/RecordWorkspace.tsx`,
  `app/{gps,debt-reminders,vehicle-transfers}.tsx`, `app/duty-roster/index.tsx`;
  `E:/Himoto_MobileApp/Himoto/src/app/api/mobile/v1/`.
- Schema session: `docs/sql/2026-10-31-mobile-sessions.sql` và
  `E:/Himoto_MobileApp/Himoto/docs/sql/2026-10-25-mobile-sessions.sql`.
