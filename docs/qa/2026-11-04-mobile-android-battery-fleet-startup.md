# Android: khởi động, pin/sạc và kho chung — 04/11/2026

Phạm vi hiện hành: hoàn tất Android trước, iPhone không chặn done. App dùng
chung BE/DB/tài khoản/quyền/nghiệp vụ với web. Các bài ở đây dùng dữ liệu tổng
hợp, chưa chứng minh backend đã triển khai hoặc nghiệm thu DB thật.

## Source và hành vi

- Pin/sạc: gợi ý nhân viên active từ cùng nguồn web, vẫn cho sửa tên; tra cứu
  CCCD/SĐT bằng reader khách hiện có, tự điền hồ sơ duy nhất, chọn rõ hồ sơ
  trùng và giữ thông tin đang gõ trong lúc debounce/mạng chậm. Helper ánh xạ
  thông tin bên thuê được chia sẻ với form web. Không đổi writer tài chính.
- Kho chung: `vehicle-inventory.ts` tách nguyên reader của route web để web
  và mobile cùng gọi, giữ rental blockers/draft soft holds. API mobile chỉ
  trả thông tin xe/cơ sở/khả năng điều chuyển, không trả snapshot khách thuê.
  Giữ entitlement fleet cho mọi tài khoản đã xác thực theo web; context vẫn
  chứa actor/cơ sở và `fleet_read`, không tự cấp quyền sửa hồ sơ/tiền.
- Kho chung có tìm tên/cơ sở/biển số bỏ dấu phân cách, lọc cơ sở/khả năng
  điều chuyển, phân trang25, loading/lỗi/thử lại và lối mở hồ sơ/điều chuyển.
  Có lối vào từ Tổng quan và Đội xe. Đây là action thực có trên web.
- Khởi động Samsung: React đã dựng login nhưng native splash giữ cổng
  pre-draw, nên màn trắng. Dismiss splash qua runtime xác nhận login hiện;
  RootLayout nay gọi API `SplashScreen.hide()` trong effect sau mount, khi
  shell đã có UI loading/error. Không chờ API đăng nhập mới bỏ splash.
  [API Expo58](https://docs.expo.dev/versions/v58.0.0/sdk/splash-screen/).

## Bằng chứng đã đạt

- APK debug arm64 build thành công, cùng live signing certificate cũ.
  Cài bằng `adb install -r --no-streaming`, không clear/uninstall.419file
  dữ liệu app nguyên SHA trước/sau nâng cấp, trước khi mở runtime mới.
  `.backups/mobile-android-native-install-20261104-run1/results.json`.
  APK SHA256 `a65b003177e42b99ba681a1d55f20e63ecd64c9c22757f5ce868371ce8b68f12`.
  Có Clipboard native trong dex; chưa gọi đây là nghiệm thu copy/share.
- Samsung native pin/sạc run5 đạt: mở lạnh, chọn nhân viên và xác minh tên
  đã điền, mở phần khách, rời biểu mẫu có xác nhận, pending ledger rỗng,
  logout QA;560file nguồn khớp,0crash/ANR,0submit, nghiệp vụ fork và checkpoint
  gốc giữ nguyên. Auth chỉ đổi trên fork tổng hợp. Kết thúc restore reverse.
  `.backups/mobile-android-read-native-20261104-run5/results.json`.
- Native run3 đã nhìn/kiểm số liệu Tổng quan và sơ đồ cơ sở; harness tổng
  run3 chưa đạt vì điều hướng tìm pin/sạc sai hướng cuộn. Không gọi toàn run3
  pass. Hai ảnh và `failure-observed.json` giữ nguyên làm bằng chứng riêng.
- Pin/sạc SQL6nhóm theo log `.backups/mobile-android-battery-people-sql-run3.log`;
  browser cuối2luồng375sáng/430tối,4ảnh, có giữ nội dung sau response chậm,
  khách trùng/chưa có và nhập tên nhân viên.0pageerror/0businesswrite.
  `.backups/mobile-android-battery-people-ui-20261104-run3/results.json`.
- Kho chung5nhóm reader/filter: cùng reader web, soft holds/blockers,
  narrow DTO, tìm biển số/tiếng Việt, cơ sở/availability/phân trang, entitlement,
  query xấu/trùng và rỗng. Mock SQL pool trong fixture, **không phải deployed
  RLS**. `.backups/mobile-fleet-inventory-check-run3.log`.
- Browser Kho chung2luồng375sáng/430tối,4ảnh: phân trang/tìm biển số/lọc
  khả năng điều chuyển/rỗng/lỗi-thử lại,0pageerror/0host lạ/0businesswrite.
  `.backups/mobile-fleet-inventory-ui-20261104-run1/results.json`.
- Samsung Kho chung run2 đạt lúc23:05+07: mở từ Tổng quan, lọc xe chưa thể
  chuyển, tìm biển số bỏ dấu phân cách, ledger rỗng/logout QA;560file nguồn
  khớp,4ảnh,0crash/ANR/submit, fork nghiệp vụ/gốc giữ nguyên, reverse restored.
  `.backups/mobile-fleet-inventory-native-20261104-run2/results.json`.
- Root types, mobile types/lint và targeted server/shared lint đạt.
  Export Android/web đạt `.backups/mobile-android-fleet-build-20261104-run1/`,
  `EXPO_NO_DOTENV=1`, API origin giả. Không cần ký/export iPhone để chốt cụm.

## Giới hạn và điểm tiếp

- Native Kho chung run1 dùng nhầm reverse8135 nên nhận404 fixture: UI
  lỗi/thử lại hiển thị. Đã sửa harness dùng đúng port được truyền và assert
  reverse ngay sau khi chuyển; run2 đạt. Không phải lỗi deployed API.
- Còn action web Đổi trạng thái xe từ kho. Nhánh “Đang thuê” của web gọi
  actual `applyVehicleAction`, khớp/tạo khách và tạo **hợp đồng nháp**, xe
  vẫn Lưu kho đến khi phát hành. Không thay bằng sửa trực tiếp trạng thái
  xe trong form metadata. Cần receipt/UUID/recovery/CAS/quyền/cơ sở đầy đủ.
- Đã đọc source: web Điều chuyển không có nút CSV/Excel riêng. Gỡ nhận định
  thiếu export khỏi điểm tiếp; không tự thêm action không có trên web.
- `https://himoto.vercel.app/` do người dùng cung cấp. GET chỉ đọc
  `/api/mobile/v1/session` trả404 ở lần kiểm04/11; chưa nối bản Samsung vào
  đó, chưa deploy. Tình trạng bản thử/khách đang dùng thật chưa được xác nhận.
- Còn đầy đủ QA ghi/đọc/recovery/nhiều phiên/mạng/toàn role-cơ sở, DB/BE web
  thực tế trên staging và bản Android release/vận hành/khôi phục. APK trên
  là development build, chưa phải gói bàn giao khách.

Không đọc/sửa/copy/log `.env.local`, không production write/migration/deploy,
không Telegram thật, không commit/push/pull lại. Gốc gen80 SHA256
`6be8545c72e34a96d6f4a05a362923ff4aa3adf5eb8330cce3eaf706e83fd7a8` giữ
đúng đến khi hoàn tất native Kho chung23:05+07. Sau đó GET kiểm profile trên
runtime gốc làm model tự cập nhật2hạn phiên mirror, journal tăng **gen81**,
SHA `5771b6d70cde7f43f0c5388b4935e42b8d268a295c3b23c63dbabac6e8f91077`.
Đối chiếu đầy đủ với fork đã chứng minh giữ nghiệp vụ gốc80: chỉ khác
sessionSeq do fork login và2expiresAt mirror, mọi dữ liệu nghiệp vụ nguyên.
Đã backup gen81/đọc lại SHA và lưu audit tại
`.backups/mobile-original-checkpoint-auth-refresh-20261104-run1/audit.json`,
pointer `.backups/mobile-android-current.json`. Không reset về80 để giấu thay
đổi. Đây là metadata phiên QA tổng hợp, không phải ghi DB nghiệp vụ thật.
Metro được restart admin có kiểm ownership, offline/cache bundler mới,
dotenv tắt. Không xóa app data hoặc reset ledger/checkpoint để sửa splash.
