# Himoto Android — điểm tiếp05/11/2026

Đọc bản này trước04/11. Mục tiêu chưa đạt; tiếp đến bàn giao Android,
iPhone không chặn. Chung BE/DB/tài khoản/quyền/nghiệp vụ web.

## Trạng thái mới nhất

**Cập nhật 11:29 ngày 05/11:** user đã deploy gói backend run4 thành công tối qua,
deployment `dpl_EVbKnVKcLqKsxJyXP8jCwiDBWUBp`. Public smoke run2 đạt 21 mục,
web login 200, API mobile trả JSON 401 đúng. Không nói user chưa deploy.
Hiện domain production đổi sang `dpl_ELvk3PUir3NHmomFA8kMbuyktJAG`:
web/login 200 nhưng session/notifications/device đều 404 HTML. Chưa xác định ai
đổi deployment; user bảo chờ để kiểm tra. Không chạy lại SQL, không thử thêm mật khẩu.
Bằng chứng `.backups/mobile-live-deployment-drift-20261105-run1.json` và
`.backups/mobile-live-notifications-20261105-run2/results.json`; lượt QA này
không tạo được session, không ghi nghiệp vụ hay đăng ký push.

Build APK run4 bị ngắt trước khi tạo artifact, không còn Gradle/runner cũ chạy.
Run5 tiếp tục native project sau khi xác minh 443 file nguồn và hash Firebase
giữ nguyên; không chạy lại prebuild/xóa cache. Output
`.backups/mobile-android-release-20261105-run5`, chỉ arm64 cho Samsung, cùng khóa.
Chưa cài/gỡ/clear app Samsung. Cần chờ build và kiểm tra APK thực trước bước chuyển
debug sang release. Bộ kiểm tra live đã sửa phân biệt 404 HTML và bảo đảm thu hồi
session kể cả khi response đăng nhập sai header; 7 tình huống giả lập đều đạt.

**Ưu tiên cập nhật sau04:15 ngày05/11:** yêu cầu mới là hoàn thiện UI đăng nhập,
thông báo công việc và kiểm tra trên Samsung; không dùng emulator nữa. Đọc
[QA thông báo/login](qa/2026-11-05-mobile-notifications-and-login.md) trước phần lịch sử bên dưới.
Login đã bỏ marketing hero/đoạn theo dõi đội xe, logo giữa, CTA Đăng nhập;
Samsung run1 PASS layout/keyboard/validation/password toggle,0submit/0crash/ANR.
Thông báo source đã có feed/list theo quyền, FCM keyless, opt-in/out, session gate,
lease/dedupe/unknown receipt; offline4nhóm PASS và browser375/430 sáng/tối8ảnh PASS.
Thêm bell Tổng quan; cập nhật159selector của68QA Python theo CTA mới, chỉ thay đúng chữ.

Firebase `himoto-70f21`, projectNumber **1074135885293**, package `vn.himoto.staff`,
publicconfig E:\google-services.json SHA bb8e6fa7747a7f2d1f7aae5ce5e801c93db1ac02303170b33efd5cdf61e107ff.
Google chặn tạo privatekey, đã chuyển Vercel OIDC → Google WIF; không cần key.
User chạy setup-mobile-fcm-wif.sh thành công HIMOTO_FCM_WIF_READY: pool
himoto-vercel-fcm/provider vercel-production/SA himoto-fcm@himoto-70f21.iam.gserviceaccount.com,
chỉ trust sub owner:congs-projects-f25af77d:project:himoto:environment:production.
User chạy docs/sql/2026-11-05-mobile-push.sql Success; hậu kiểm live catalog17bảng
(16current+legacyattempts),2bảngpush RLS/0clientpolicy/chỉownergrants,0businessread/write.

User thêm6biến Vercel và redeploy source cũ Ready dpl_GcQ8cWCwoFKACuukyTvdiMxP9UX9.
Probe04:13 session401 đúng, notification/device404: cấu hình sẵn, **chưa có push source mới**.
Không rollback/chạy lại SQL. Backend build notification run1 fail lint escape đã sửa;
run2 đang chạy handle70525, nguồn938file/no env/offline. Chờ pass rồi dùng
package-mobile-backend.py tạo gói run4 cho user deploy. Chưa tự commit/push/deploy.

APK run3 đã dừng có chủ đích sau khi khép type validator/header và bỏ build ABI máyảo;
không có artifact được nghiệm thu từ run3. Build runner mặc định arm64-v8a cho Samsung,
cùng khóa release đã backup; cần chạy run4 -GoogleServicesFile E:/google-services.json
sau khi types sạch, giữ source mobile/shared ổn định đến hết build. Run2 APK cũ chưa
có UI mới/notifications. Samsung hiện vẫn debug, chưa uninstall/clear/cài release.
Khác certificate nên cần xử lý chuyển bản có kiểm tra ledger/nháp và đồng ý cụ thể
trước khi gỡ debug; không được coi adb install-r có thể đổi certificate.
Native push foreground/background/closed app và release tổng thể vẫn CHƯA nghiệm thu.

**Ưu tiên cập nhật sau03:30ngày05/11:** xem
[QA production/release](qa/2026-11-05-mobile-live-rollout-and-release.md).
Backend đã deploy `dpl_Ea7UPWMffbo7fdvp3wuzTSvHaYEz`,18publicchecks PASS,
liveadmin202/branch171-store34 PASS4nhóm/4sessionsrevoked; customerQAactualwrite
PASS3nhóm/cleanup0rowsleft. Userủyquyền chọn accountthật từworkbookuser, chỉ
đọctrongmemory, khônglog/copycredential. Không cần hỏi lại accountquyền.

APKrelease1.0.0/code1 mới, khôngdebug, RSA3072ownkey, APIproduction,
arm64+x86_64, SHA cf63a8e6b4b278e061b817f6e7135279cc03ed54cb088bdb7778314ebd645d64,
ở `.backups/mobile-android-release-20261105-run2/Himoto-1.0.0-android-release.apk`.
Source437fileunchanged/buildpassed. Userxác nhận chưa từngpháthành/chưa cókey.
Encryptedkeybackup đãverifydecrypt/đối chiếu trongmemory,2vịtrílocalE.backups và
C.DocumentsHimoto-Android-Keys; chưaoff-machine. Không chép key/passphrase vào
source/log/chat hoặc góiAPKhandoff.

SamsungdevelopmentliveAPI run3PASS4nhóm/6ảnh/0crashANR/checkpointgen81nguyên.
ReleaseAVD5556run3 gặpANR saulogout/relaunch; giữtraceảnh. Coldstart5lần sau
đóPASS0ANRmới, chưa xácđịnhnguyênnhân/chưacoiANRresolved. Focusedrelease
upgrade/XLSXrun1đangchạyhandle57463, credentialsđãfeedquaNoEcho; tiếpđọcoutput,
không khởi độngharnessUI thứhai trênemulator đó. Samsungkhôngcònharnessđangchạy.
Metroproduction8082/PID10416đãstopowned; gốc8081/8131vẫngiữ vàreverseSamsung
đãkhôi phục8081/8091. Không cầnreset/replay/copygen81.

Gói reviewAndroid `.backups/mobile-android-review-bundle-20261105-run1/` có APK/
source/operatorguide/checksum, manifest ghi chưađủacceptance/ANRchưagiảiquyết.
Chưa doneAndroid; cần chốtANR/nativeXLSX/realcorewrites và hướngdẫnbàn giao.
Phần dưới giữ lịch sử cácmốc trước, không dùng câu "chưadeploy" làm điểmbắtđầu.

- Người dùng cho toàn quyền triển khai, cho thử QA trên dữ liệu đang vận hành,
  cho riêng preflight đọc DATABASE_URL từ .env.local vào bộ nhớ. User đã trực tiếp
  chạy01/02 SQL trên Supabase và báo Success; chưa deploy/QA ghi nghiệp vụ thật.
  Không đọc/sửa/log/copy env hoặc secret khác; Expo vẫn
  EXPO_NO_DOTENV1. Khóa đã lộ trong chat cần thay an toàn trước rollout.
- Đồng nghiệp quản lý Vercel; nay user được điều khiển cả máy/Supabase/Vercel.
  Ảnh xác nhận Project himoto/Scope congs-projects-f25af77d. Backup20giờ;
  đã qua preflight/áp01+02, hậu kiểm catalog trực tiếp đủ14bảng/RLS.
  Không tạo Vercel/Supabase mới. Không tự gửi tin cho đồng nghiệp.
- User yêu cầu pull: HEADf74c5a0 từd3ce3c6,3commit/14file; backup1.179file,
 1.176exact/3merge/0mất/0staged/0unmerged. Giữ toàn dirty/untracked, không tự
  commit/push. `.backups/mobile-pull-current.json` trỏ bản05/11.
- Đổi trạng thái/tạo nháp từ kho ĐÃ triển khai module/API/native/UI/review/
  confirm/UUID/proof gốc/HMAC/recovery/Account/CAS/actor/scope. SQL5nhóm và
  browser2luồng4ảnh đạt. Không làm lại action này theo prompt04/11 cũ.
- Excel mới sau pull: đã nối5danh mục/Sổ quỹ và cả7màn Điều chuyển/GPS/pin-sạc/
  tài khoản/báo cáo ca/lịch trực/nhắc nợ. Cùng actual web cột/cell/workbook,
  scope/bộ lọc/toàn trang snapshot, cap100báo cáo ca như web được ghi rõ.
  Adapter3nhóm và7hồi quy domain đạt; browser375sáng/430tối4ảnh, lỗi/thử lại/
 53dòng bytes exact đạt. Chưa chứng nhận native lưu/chia sẻ XLSX toàn bộ.
- Ngày bắt đầu gia hạn app đã theo writer mới, không tự chặn sau hẹn trả mới;
  giữ ngày thuê/thực trả/tương lai. Form5/web2nhóm đạt.
- Root/mobile types/lint đạt; backend mirror931file/no env/offline build đạt;
  exportAndroid-web dotenv tắt/origin giả đạt. Chưa whole-app acceptance/release.

## Backend thật và phối hợp ngay

Trước migration: legacy session/thiếu13bảng/API404. Sau user chạy01/02 Success:
`.backups/mobile-live-postmigration-20261105-run1/schema.json` read-only TLS
xác nhận đủ14bảng mobile/RLS, credential2họ/legacyattempts giữ, resource_key160,
3scopeguards/photo4policy đúng;3scopehelper SECURITY DEFINER/searchpath cố định.
Credential/GPS receipt không scoped CRUD. Nhãn mixed_requires_review của SQL
cũ là schema2họ dự kiến của transition đã kiểm offline; không tự DROP token cũ.
Chưa deploy source/đăng nhập/ghi nghiệp vụ thật.

[Hướng dẫn thao tác máy đồng nghiệp](mobile-remote-rollout-2026-11-05.md),
[nội dung phối hợp dev web](mobile-web-dev-request-2026-11-05.md).
Gói mới `.backups/himoto-rollout-20261105-run3.zip` SHA256
`c5498fa0a2f8afb60a8b96128e84164b566ff8cc93d1bfb8777349030db12315`.
Source dùng trực tiếp `.backups/mobile-web-dev-handoff-20261105-run3/himoto-backend-source.zip`,
1.613file/SHA8d2b6d4b5e31ac19c29068d133cf421b1e1e86e34fe40aa0116816b08ece2378.
Manifest/SHA/basef74+dirty/no env,2transaction SQL và DB-POSTFLIGHT kèm gói.
16mobile migrations offline legacy/current/rerun/rollback đạt; user đã áp01/02.
Ảnh mới xác nhận Vercel CLI65.11.0 login và Linked đúng
congs-projects-f25af77d/himoto tại C:\Users\Admin\Desktop\himoto-backend-source.
CLI tự tải fresh VERCEL_OIDC_TOKEN vào .env.local và thêm gitignore, không hỏi
download; không hướng dẫn user mở/gửi file hoặc token, không đọc file này.
Không hỏi lại Project/Team/login/link hoặc chạy lại SQL. Chưa nhận deploy.
Lệnh tiếp: đặt HIMOTO_MOBILE_ENABLED=true cho Production bằng vercel env add
--value true --no-sensitive --force --yes, scope đã chốt; khi Success mới
deploy --prod cùng scope. Đã đối chiếu official CLI docs env/deploy. Đọc remote
main bằng ls-remote vẫn f74c5a0, khớp base source archive trước bước deploy.
Sau Ready kiểm GET401 rồi QA auth/write và Android release.
Source local chưa push; devweb phải merge source sau để Git deploy không xóa API.

## Samsung/runtime/checkpoint

Gốc81/SHA5771b6d70cde7f43f0c5388b4935e42b8d268a295c3b23c63dbabac6e8f91077
nguyên, pointer`.backups/mobile-android-current.json` vẫn giữ business/checkpoint.
Không reset/replay UUID. Runtime cũ đã chết mới phục hồi: Metro8081PID6552,
QA8131PID12552 cùngdurablecheckpoint81; forkstatus8137PID12444 chỉ synthetic.
Health200; env tắt/offline. Meta mới`.backups/mobile-runtime-20261105.json`.
Pointer đã cập nhật runtime, giữ bản trước và SHA/gen81. MetroCI khôngwatch/
hotreload; source sửa sau native status nên phải phục hồi watch/restart đúng PID
trước native kế tiếp. Không gọi bundle Metro hiện tại là source cuối đã kiểm.
Samsung282a05859f3f7ece, adbE:/Android/Sdk/platform-tools/adb.exe. Reversegốc8081→8081/
8091→8131, native tạm8137/finallyrestore. Không install/reset/clear app data.

Native status preview: run1/run2 harness fail (spaceguard/IMEreadback), giữ ảnh.
Run3 đạt: 4ảnh, 566source exact, review/hủy giữ input, ledger rỗng, 0crash/ANR;
fork business và checkpoint gốc nguyên, reverse được phục hồi (restore.json).
Chỉ review/hủy confirm,0submit; không thay SQL/business acceptance bằng native.
Source pin/kho560file cũ không chứng nhận source05/11.

[Chi tiết QA/giới hạn](qa/2026-11-05-mobile-status-pull-live-preflight.md).
Tiếp: đợi kết quả link của user; feature gate/production deploy, auth/QA thật;
gom QA Samsung/DB thật toàn quyền/cơ sở/nhiều phiên/mạng, native XLSX;
bản ký Android và tài liệu vận hành/nâng cấp/khôi phục. Chưa có signed release.
`get_goal` lượt cuối trả usageLimited (nền tảng), không tự complete/paused.
Điểm triển khai hiện tại vẫn chưa đạt điều kiện bàn giao Android.
