# Kịch bản demo QA — 03/11/2026

Mục tiêu: trình diễn đường đi nghiệp vụ đang triển khai. Đây là dữ liệu tổng
hợp, không dùng tài khoản/khách/xe thật và không thay nghiệm thu phát hành.
Phạm vi các đợt: [mobile-implementation-waves](mobile-implementation-waves-2026-11-03.md).

## Chuẩn bị và môi trường

Checkpoint mới nhất04/11 lúc02:45: QA same8131/state file, server
handle59922/PID16456, generation71; Metro admin7600/origin8091, USB giữ.
QA7/Tổng quan/work-ledger rỗng. Thêm demo duyệt: tìm hợp đồng9205, mở
**Kiểm tra và duyệt hợp đồng**; QA7 chỉ xem, QA admin mở xác nhận rồi hủy.
9206 xem người đã duyệt `Quản lý QA`. Portfolio chỉ đọc: **không bấm gửi
duyệt**. SQL writer đạt, native mới kiểm preview. [Bàn giao mới](mobile-handoff-2026-11-04.md),
[QA](qa/2026-11-04-mobile-issued-approval.md).

04/11 chuẩn web mới `27a87f1`. Gia hạn có ngày thực tế trước giờ/ngày/số
kỳ/đơn giá, giờ mặc định20000; phiếu đã thu dùng cùng ngày này đúng web
mới. Hẹn trả tiếp tục cộng từ hạn của xe. Thu/chi có **Thu tiền và gia hạn
một hoặc nhiều xe**, chọn từng xe/tiền, một phiếu thu. Không nhầm với ghi
phiên bản gia hạn chưa thu hoặc thu một phần phiên bản đã có.

QA portfolio9103 (`RENEW9103`,2xe`RENEW29101/RENEW29102`) chỉ để xem form:
chọn giờ2/đơn giá20000 gợi ý40000; chọn hai xe2ngày gợi ý200000+400000=
600000. Chưa gửi tiền trong bài Samsung này; writer/phiếu/replay kiểm
bằng SQL nhúng. QA chỉ thêm field63→64, mọi portfolio cũ giữ. Metro admin
7600/launcher8384/origin8091/dotenv tắt, QA8131 handle69857/PID15336,
USB reverse giữ. Samsung run2 đạt3nhóm màn hình lúc02:27, đã trả QA7/Tổng
quan/work-ledger rỗng/toàn state64/26checkpoint giữ;0gửi phiếu/bill/tiền.
[QA mới](qa/2026-11-04-mobile-renewal-parity-and-pull.md).

Nhập bổ sung mới: **Thao tác nhanh → Nhập bổ sung giao dịch lịch sử → Nội
dung cần bổ sung**, có hợp đồng/gia hạn/thu-chi theo quyền. Gia hạn/thu-chi
tìm `9003`, mở `HISTORY9003`, xe `HISTORY9903` đã trả. Ngày giao dịch trống
để người dùng chọn thực tế, gia hạn trong lượt01–05/10/2026; phí khác/VAT
cộng tiền thuê, thu ngoài không cộng tổng. Thu/chi phải xác nhận tiền đã
phát sinh. QA thêm field62→63, mọi portfolio cũ giữ nguyên.

Samsung run2 đã kiểm3nhóm màn hình lúc23:25, đã trả QA7/Tổng quan/work-ledger
rỗng, toàn state63 giữ nguyên. Không chọn ngày/ghi tiền/upload bill native
trong bài này, chưa claim native financial write. Portfolio
cho phép một gia hạn lịch sử chưa thu100000, sau đó một thu nợ tiền mặt
50000; ghi khác trả lỗi QA rõ ràng. Không thử lại nếu có mã gốc chưa đối
chiếu. Bill/thu ngay/ngoài/hoàn cọc đã kiểm domain bằng SQL nhúng, chưa
nghiệm thu máy thật. Chỉ demo đọc khi chưa có xác nhận write riêng.
[QA và giới hạn](qa/2026-11-03-mobile-backfill-flows.md).

Đợt mới: Tổng quan → **Thao tác nhanh** → lập/chọn trả/gia hạn/kho/nhập
bổ sung lịch sử. QA7 cơ sở23 có4đang thuê/2quá hạn từ portfolio SQL;
tìm `OPSQA29001` mở hồ sơ cùng ID29001. Portfolio vận hành này chỉ đọc,
không demo trả/gia hạn ghi tiền trên các hồ sơ này. Luồng nhập lịch sử
chọn đang thuê/đã trả và lý do; native đợt này chỉ thử local work, chưa
phát hành lịch sử máy chủ. [QA](qa/2026-11-03-mobile-integrations-operations.md).

Quản trị QA riêng `qa-accounts` / `fixture-password` → **Tích hợp GPS và
Telegram**: tài khoản GPS/trạng thái, nhật ký sự kiện, nhóm Telegram và
thông báo gần nhất. Native portfolio chỉ bật/tắt GPS và đổi nhóm không
bí mật; tạo account GPS/ghi token trả lỗi QA rõ ràng, được kiểm domain bằng
SQL nhúng. Không gửi tin/provider thật. Sau demo trở về tài khoản QA7;
không sửa quyền QA7 để mở cấu hình quản trị. Samsung đã bật/tắt GPS và
đổi thread cơ sở23 từ12→13 bằng3mã gốc/ack; bot/hai nhóm sở hữu giữ nguyên.
Run4/5 continuation đạt22:54, đã trả QA7/Tổng quan/work-ledger rỗng; không tự
replay/reset UUID đã ghi. Portfolio điều hành chỉ đọc riêng; dashboard của
tập CRUD cũ không dùng để đối chiếu số tổng của portfolio này. Chưa demo
dataset liên thông toàn app. Gia hạn/thu-chi lịch sử đã nối ở cập nhật mới
phía trên; native financial-write acceptance vẫn chưa có.

- App chính `mobile/`, Samsung SM-N960N `282a05859f3f7ece`, package `vn.himoto.staff`.
- Metro đang giữ API origin `http://127.0.0.1:8091`; không đổi env của Metro.
- QA hiện tại host8131, checkpoint
  `.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json`.
  Server: `scripts/mobile-vehicle-fixture-server.py`; đã bổ sung cơ sở bằng
  cách thêm field QA, giữ nguyên mọi field cũ.8130/watch8101 vẫn giữ riêng.
  Không reset/xóa checkpoint.
- Tài khoản tổng hợp `qa`, mật khẩu tổng hợp `fixture-password`; vai trò QA
  quản lý cơ sở23 có quyền tra cứu/lập hợp đồng, khách, xe/GPS, HR và grant
  settings.write tổng hợp cho demo cơ sở, finance.read/write tổng hợp cho
  sổ quỹ/két. Không sửa tài khoản/quyền DB thật.
  Bộ này không đại diện đầy đủ vai trò hay staging RLS.
- Khi chuyển từ watch8101: kiểm cả bản đang soạn và mã đối chiếu rỗng trên
  Tài khoản, đăng xuất phiên QA cũ rồi mới đổi USB8091→8131. Mọi dataset/phiếu
  cũ giữ nguyên. Nếu còn work/key phải giải quyết tại server gốc trước.

Khởi chạy **lại đúng checkpoint** khi process đã dừng, không chạy server thứ hai
trên cùng file:

```powershell
python scripts/mobile-vehicle-fixture-server.py --port 8131 --state-file .backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json
```

## Luồng khách hàng và hợp đồng

1. Đăng nhập QA → Tổng quan: cơ sở, danh mục, nút **Lập hợp đồng**, **Thêm khách
   hàng**, **Định vị GPS** và các workspace theo quyền.
2. Khách hàng: tìm tên/điện thoại; mở hồ sơ, giấy tờ. Tạo mới dùng dữ liệu QA
   riêng. Nếu trùng, chọn/mở đúng hồ sơ đang có; không tạo lại để né cảnh báo.
3. Lập hợp đồng theo 5 phần: **Hợp đồng & pháp lý → Khách hàng → Phương tiện →
   Chi phí → Ký kết & ghi chú**. Chọn cơ sở, loại/mode theo web; trong phần
   khách có tìm/chọn hoặc thêm khách tại chỗ.
4. Phương tiện: chọn xe trong kho, kiểm lịch, kiểm người lái/mũ/áo mưa và đúng
   dòng xe. Chi phí: rà giá, kỳ, tiền thuê/cọc/phụ phí; không tự suy số dư là0.
5. Ảnh/giấy tờ: chỉ chọn ảnh QA chuẩn bị riêng. OCR phải rà trước khi áp dụng;
   ảnh gắn đúng khách/xe/slot. Khi lưu: metadata → ảnh theo nhóm web → copy
   giấy tờ chỉ điền ô thiếu. Lỗi upload giữ đúng ID đã lưu để thử tiếp.
6. Lưu nháp → mở lại hồ sơ và **Tiếp tục soạn hợp đồng**; đối chiếu số hợp đồng,
   xe/chi phí/ghi chú. Dùng Tài khoản để xem bản đang soạn và yêu cầu chưa rõ
   kết quả, không tạo hồ sơ mới thay yêu cầu cũ.

## Workspace, GPS và lịch trực

- Từ Tổng quan mở Nháp/Đến hạn/Quá hạn/Thuê sở hữu/VAT. Bộ lọc có tìm kiếm,
  trạng thái, ngày bắt đầu thuê, cơ sở ghi nhận hoặc kho xe, phân trang.
  Số tiền theo kỳ/tiền công ty/phí trả trễ lấy từ reader web; phí trễ là tạm tính.
  Dataset demo chưa có phiếu thu theo kỳ hay thu vào TK công ty nên Due/VAT
  rỗng là đúng; không tạo số liệu giả để làm đầy card.
- GPS: xem danh sách/bộ lọc/chi tiết/độ mới/lịch sử; dữ liệu provider là tổng
  hợp. Không mô tả việc mở bản đồ hoặc sync QA là provider thật đã nghiệm thu.
- Nhân sự: tìm/lọc cơ sở/chức vụ/3trạng thái → hồ sơ → thêm/sửa/nghỉ việc/xóa
  có điều kiện. Mặc định Bình thường; mã tự sinh, ngày vào làm chỉ lúc tạo.
  Tài khoản mới hiển thị một lần, che mật khẩu; người demo chủ động lưu/bàn
  giao trước đóng. Đối chiếu rồi ack đúng phiếu. Nghỉ việc khóa login và giữ
  hồ sơ; xóa hồ sơ không tự khóa login. Không xóa dữ liệu cũ để chạy lại demo.
  Native run1 đã giữ4phiếu của nhân sự10001 đã nghỉ/xóa; không tạo lại ID đó.
- Cơ sở: danh sách → hồ sơ đầy đủ → chỉnh sửa; Thêm cơ sở để mã trống sẽ sinh
  mã tự động, mặc định cơ sở cho thuê/Hoạt động/Chưa phân công. Rà soát trước
  lưu, đọc và ack đúng phiếu. Xóa chỉ khi không có dữ liệu liên quan; cơ sở23
  có xe/nhân sự nên phải bị chặn. Không dùng xóa để dọn dữ liệu demo cũ.
- Lịch trực: tuần/ngày/cơ sở → Tạo ca → chọn nhân sự đang hoạt động → ngày giờ
  Việt Nam/tên ca/vai trò/ghi chú → rà soát → lưu → mở xác nhận đúng mã/ID.
  Sửa dùng revision; ca trùng và ca trên24giờ bị chặn. Xóa là xóa mềm; đọc
  xác nhận rồi bấm **Đã kiểm tra xác nhận ca trực** để kết thúc mã trên máy.

## Xe, giấy tờ và điều chuyển

- Đội xe → Thêm xe hoặc tìm `QA-NEW0311` → hồ sơ xe8001 → Sửa hồ sơ. Xe demo
  đã có màu RedQA/km125/cơ sở23; không tạo lại để thay kết quả đã lưu.
- Giấy tờ xe đã lưu có đăng ký trước/sau, mua bán trang1/2 và ảnh bổ sung.
  OCR có rà soát, giữ nhập tay; ảnh dùng để OCR chưa phải ảnh hồ sơ đã lưu.
  Camera/provider thật và codec/lifecycle đầy đủ chưa nghiệm thu.
- Lịch sử xe hiển thị người/cơ sở/giá trị thay đổi. Lịch sử điều chuyển toàn
  hệ thống có sự kiện nhận kho QA-001, lọc Chuyển xe hiện rỗng đúng dữ liệu.
  Chuyển/nhận/từ chối/hủy vẫn dùng phiếu hiện có, không thay ownership bằng
  việc sửa kho tùy ý. Ảnh ngay trước metadata tạo xe/Excel/bulk còn thiếu.

## Phân biệt trạng thái

Sổ quỹ/két: Tổng quan → **Sổ quỹ / Sổ két**. Ba tổng thuê xe tách khỏi tổng
toàn bộ phiếu thu/chi; mở **Chi tiết và đối chiếu thu chi** để rà cọc/thuê/
gia hạn/trả muộn/hoàn/các khoản khác. Bộ lọc ngày/người/cơ sở/tìm kiếm, tab
thu/chi và phân trang độc lập. **Tài khoản ngân hàng và két** → hồ sơ →
**Danh sách thu chi của tài khoản**; số dư hồ sơ luôn tính toàn thời gian.
**Xuất CSV sổ quỹ** lấy toàn bộ phiếu theo bộ lọc hiện tại; Android chọn thư
mục rồi lưu, iOS mở bảng chia sẻ file, web tải xuống. File CSV có BOM UTF-8,
mở trong Excel với đủ cột/ngày/tiền như web. Hủy picker không ghi file.
Samsung đã lưu1file QA thành công vào `Download/HimotoQA/Exports-20261103`,
10phiếu/2204byte. Dùng file sẵn để demo, không xóa rồi chạy lại. Android9
mở mặc định ở bộ nhớ thiết bị để tránh thư mục chỉ đọc của provider Bản tải
xuống. Nếu chọn thư mục không ghi được, app báo chọn thư mục khác.

Thêm tài khoản: chọn tiền mặt/ngân hàng cơ sở/TK công ty, cơ sở và số dư đầu
kỳ nguyên có dấu. Rà soát → Xác nhận → đọc phiếu → **Đã kiểm tra xác nhận tài
khoản sổ quỹ**. Sửa/ngừng dùng cũng có phiếu riêng. Xóa chỉ khi chưa có phiếu
thu/chi ở mọi trạng thái; có lịch sử thì ngừng dùng. Tài khoản ngừng dùng có
thể mở biểu mẫu sửa để kích hoạt lại. Không xóa dữ liệu demo cũ để tạo lại.

Xóa phiếu (chỉ tài khoản có settings.write): chọn từng dòng hoặc **Chọn toàn
bộ phiếu trang này**, rồi **Xóa phiếu đã chọn**. Để xóa theo filter, chọn
tab thu/chi → rà bộ lọc → **Xóa hết phiếu thu/chi theo bộ lọc** → kiểm count/
số tiền → gõ XOA → bấm nút xóa. Dữ liệu chia tối đa500phiếu/đợt; mỗi đợt
phải được đối chiếu trước khi chuyển đợt kế. Lỗi thì giữ mã và mở Tài khoản
để đối chiếu, không gửi lại hoặc tạo key khác. Nếu job bị dừng giữa đợt,
đối chiếu trước rồi lọc lại các phiếu còn lại.

Native đã xóa3phiếu mẫu15001–3 bằng2UUID(count1,2), giữ nguyên10phiếu demo
cũ. **Không chọn các phiếu cũ để thử xóa, không tạo lại mẫu đã xóa để lặp
bài kiểm.** Có thể mở/hủy màn rà soát cho demo thao tác, hoặc chuẩn bị bộ
phiếu QA mới riêng khi cần trình diễn xóa thật. [QA bulk](qa/2026-11-03-mobile-cashbook-delete.md).

## Báo cáo thuê xe/doanh số

Tổng quan → **Báo cáo doanh thu thuê xe**. Mặc định tháng hiện tại đến hôm
nay Việt Nam/cơ sở hiện hành. **Chọn báo cáo** đổi thực thu, sổ thu/chi,
doanh thu xe, theo cơ sở hoặc thống kê hợp đồng; thống kê có5mục con.
Đội xe chủ quản chỉ xuất hiện cho đúng tài khoản được cấp ngoại lệ web.

Xe → **Xem lượt thuê**; cơ sở → **Xem từng ngày**; khách mới → mở nhóm
đã có/chưa ghi nguồn hoặc nguồn cụ thể. Các dòng mở hồ sơ dùng ID nghiệp
vụ thật ở API thật. Theo NVKD/cơ sở có **Chi tiết** và biểu đồ lũy kế ngày.
CSV lấy toàn bộ theo filter, không chỉ trang. **Xuất Excel sổ thu / chi**
lấy cả hai sheet thu/chi theo cùng filter, giữ cột/tổng/dấu/định dạng web.

QA tháng11/cơ sở23: ước tính4000, thực thu1400, sổ thu3020/chi500/doanh thu
1400; xe301 có doanh thu lượt3400. Đây là portfolio SQL báo cáo riêng,
không đối chiếu với10phiếu sổ quỹ demo cũ hoặc mở hồ sơ CRUD101–103 để
chứng minh liên kết cùng dataset. Chỉ dùng bộ lọc QA đã chuẩn bị; ngoài
danh mục sẽ báo rõ thiếu dữ liệu mẫu. [QA/giới hạn](qa/2026-11-03-mobile-reports.md).

Samsung đã có Excel mẫu hai sheet/8dòng tại
`Download/HimotoQA/Reports-20261103/HIMOTO-so-thu-chi-2026-11-01-2026-11-03.xlsx`,
đã đối chiếu byte/tổng tiền. Dùng file sẵn khi demo; không xóa để lặp bài kiểm.
Native tập trung3nhóm đạt18:14, không phải nghiệm thu toàn10panel/CSV/filter.

## Nhắc nợ

Tổng quan → **Gửi nhắc nợ** → **Mục nhắc nợ / Chọn hợp đồng để soạn**.
QA có REMIND-QA-17001/nợ700/số0900000001, context từ SQL nhúng. Chọn dòng/
trang → **Rà soát gửi nhắc nợ hàng loạt** xem số/tiền/nội dung, có thể đóng
không gửi; soạn riêng cho phép sửa nội dung và dùng mẫu. Sau xác nhận xem
trạng thái gốc rồi **Đã kiểm tra lần gửi nhắc nợ**; lỗi giữ mã ở Tài khoản.
Webhook tiếp nhận không đồng nghĩa khách đã nhận/đọc tin.

Samsung đã tạo đúng1tin local giả và ack, lịch sử giữ lại để demo. Không
xóa hoặc gửi lại mẫu để lặp bài kiểm. Fixture không có HTTP client; không
gửi Zalo thật. Hồ sơ17001 chỉ phục vụ link đọc, không demo action tài chính/
kho trên hồ sơ mẫu này. [QA](qa/2026-11-03-mobile-debt-reminders.md).

## Báo cáo cuối ca

Tổng quan → **Báo cáo cuối ca** → lọc cơ sở/ngày/trạng thái → mở hồ sơ.
PGD nhập6phần kiểm kê/số tiền/thu chi/an toàn/thuê sở hữu, lưu nháp trước
để thêm ảnh; chọn/chụp/rà/lưu6nhóm minh chứng. Chốt cần xác nhận đã tắt
thiết bị điện, sau đó PGD khóa sửa. KTNB nhập số sổ/thực tế, kiểm chênh
lệch/giải trình rồi nháp/xác nhận theo quyền shift.review riêng.

QA đã có báo cáo#3/Cơ sở ca QA/ngày01/11 được lưu nháp/chốt bằng2mã gốc và
ack, revision3. Dùng hồ sơ đã chốt để demo đọc và xem KTNB readonly theo
actor7, không reset để lặp mutation. Tự điền/media/KTNB-write/ownership/
Telegram nằm ngoài portfolio native này; API thật dùng reader/domain web,
cần staging hoặc dataset QA riêng để nghiệm thu các bước đó. [QA/phần thiếu](qa/2026-11-03-mobile-shift-reports.md).

## Trạng thái triển khai và kiểm tra

Tài khoản: chỉ admin có **Tài khoản và phân quyền** trên Tổng quan; tạo/
sửa/6nhóm quyền/phạm vi/khóa-mở/xóa mềm. Credentials cấp mới che mặc định,
có chia sẻ/tải text do người dùng chọn, đóng rồi mở receipt/ack. Reveal
mật khẩu chỉ145/160, audit/receipt riêng, tự ẩn60giây/ra nền/rời màn.
Tab Tài khoản có **Đổi mật khẩu của mình**, phiên cũ sẽ hết hiệu lực.
Không có reset admin. QA quản trị riêng đã tạo/đổi tên-khóa/mở/reveal che/
xóa#2001,5mã gốc ack; không reset/replay. Samsung đã về QA7 và Tổng quan,
work/ledger rỗng. Portfolio này không ghi self-password change; form chỉ
được xem, SQL nhúng kiểm actual password/session. [QA](qa/2026-11-03-mobile-managed-accounts.md).

Loại hợp đồng: Tổng quan → **Loại hợp đồng**, tạo/đổi tên/ẩn-hiện cần cả
quyền cấu hình và ghi thu/chi. Danh mục giữ billing/term; hợp đồng cũ giữ
snapshot. Trong màn soạn → **Quản lý loại hợp đồng ngay khi soạn** → tạo →
đọc xác nhận → **Đã kiểm tra xác nhận loại hợp đồng** → loại mới tự chọn.
QA đã có `QAType24Renamed0311` monthly24 và `QAInlineType0311` daily để đọc/
chọn;5mã gốc đã ack, không reset/replay. Bài inline đã bỏ riêng local
draft thử, không lưu hợp đồng máy chủ. Staging cần resource_key schema
được duyệt/áp riêng, chưa làm trong lượt này. [QA](qa/2026-11-03-mobile-contract-types.md).

Pin/sạc: Tổng quan → **Hợp đồng pin / sạc**. Source/API có lập/sửa4phần,
tiền thuê/cọc vào tài khoản riêng, prefill từ hợp đồng xe, gia hạn ghi nợ
hoặc thu ngay/thu một phần/trả/xóa mềm/history/receipt. Trả pin giữ nợ/
cọc. Samsung đã gia hạn chưa thu300→trả→xóa mềm hồ sơ QA#2,3UUID/ack,
list hiện không còn mẫu đó; không reset/replay để demo lại. Tạo/sửa/thu
tài chính/Telegram ngoài portfolio native hiện tại trả lỗi QA rõ ràng;
chuẩn bị dataset hoặc staging được duyệt trước khi demo các action đó.
In/xuất mẫu/lookup/đổi pin xe điện chưa có. [QA](qa/2026-11-03-mobile-battery.md).

- Đã nối source/API: workspace hợp đồng, lọc ngày/kho, lịch trực CRUD + receipt/
  recovery, CRUD nhân sự/đồng bộ login, CRUD cơ sở, hồ sơ xe/giấy tờ/OCR/lịch sử và điều
  chuyển toàn hệ thống, sổ quỹ/tài khoản-két,10nhóm báo cáo/CSV/XLSX,
  lối vào demo trên Tổng quan.
- Kiểm tra nhanh: typecheck web/mobile; lint mobile/backend liên quan;
  workspace3nhóm; lịch trực4nhóm trên PGlite tách biệt; export web/Android/iOS.
- Native tập trung: xem evidence mới trong QA đợt triển khai; không dùng các
  lượt native cũ để chứng nhận toàn source hiện tại.
- Chưa kiểm sâu: tất cả role/scope/session/network/race/fault/lifecycle của
  phần mới; camera/video/HEIC toàn luồng; staging PostgreSQL/RLS; signed
  iOS/iPhone thật; release/vận hành. Các module/Excel/action còn thiếu vẫn
  bắt buộc trong [backlog](mobile-action-backlog.md).
