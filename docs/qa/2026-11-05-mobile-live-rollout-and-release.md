# Himoto Android — production API và bản ký đầu tiên05/11

Chưa đủ nghiệm thu bàn giao Android. Kết quả dưới đây phân biệt backend thật,
binary development trên Samsung, và binary release; không dùng kết quả của một
loại để chứng nhận toàn bộ loại khác.

## Production backend

User điều khiển Supabase/Vercel đồng nghiệp, đã áp SQL01/02 Success, bật
HIMOTO_MOBILE_ENABLED=true Production và deploy ZIPbackendrun3. Ảnh CLI65.11.0
Ready/alias himoto.vercel.app. Deployment ID xác minh từ HTML login:
`dpl_Ea7UPWMffbo7fdvp3wuzTSvHaYEz`.

- Hậu kiểm DB read-only TLS:14bảng/RLS/grants/helper/policy đúng dự kiến tại
  `.backups/mobile-live-postmigration-20261105-run1/verification.json`.
- Smoke public18checks đạt: no bearer/random bearer401SESSION_EXPIRED,
  browserOrigin403NATIVE_CLIENT_REQUIRED,12read gates gồm7listExcel401,
  body/type/size login bị chặn trước consume-login-attempt, web login200.
  Cache-Control private/no-store, VaryAuthorization/nosniff, khôngwildcard CORS.
  `.backups/mobile-live-public-20261105-run1/results.json`.
- Quản lý thật do user cung cấp: adminID202 login/workspace/accounts200,
 2phiên độc lập/logout tách biệt,2phiên thu hồi. Không lưu password/token.
  `.backups/mobile-live-admin-20261105-run1/results.json`.
- User cho phép chọn nhân sự thật từ workbook có33dòng. Bản đầu chọnID167/
  store32, login401LOGIN_FAILED với mật khẩu workbook. Không đoán lại, không
  reset password hoặc thử nhiều lần cùng tài khoản. Phiên admin đã thu hồi.
  `.backups/mobile-live-roles-20261105-run1/results.json` giữ fail evidence.
- Bản2bỏID167, chọn accountactive+enabled+branch+contracts.read từ API,
  đối chiếu login với workbook. Admin202 và branchmanager171/store34 đạt4nhóm:
  login/readsession, workspaceactor/accountsadmin200 vàbranch403, ownstore
  có positive contractsample/foreignstore23denied,4concurrent sessions và
  logout1không làm mất phiên khác/accountkhác.4phiên tạo đều thu hồi.
  `.backups/mobile-live-roles-20261105-run2/results.json`.
- Toàn bộ chỉ authsession/loginlimit metadata và đọc nghiệp vụ.0hợp đồng/khách/
  xe/phiếu tiền bị ghi. Không lưu contentrows/readbody vào báo cáo; chỉ ID,
  quyền, trạng thái HTTP, Boolean. Workbookuser nguyên SHA
 0cb1da469e3d1516346abde6c8fc132812a0d78108ec810841600aafaeea6b7f.
- Runneroffline6scenarios đạt, cleanup kể cả lỗi login/network/scopeleak/header:
  `.backups/mobile-live-qa-runner-offline-20261105-run3.log`.

## Android release

User xác nhận chưa từng phát hành cho khách/chưa có keystore. Đã tạo keyPKCS12
RSA3072 cho bản đầu, ACLchỉ userWindows hiện tại, passwordDPAPICurrentUser,
khôngplaintext/log/argv. Keystore `.backups/mobile-android-signing-20261105/`.
Chưa có portableownerbackup; cần hoàn tất trước bàn giao để không mất quyền nâng cấp.
Public certificateSHA256:
`0c0c26eb9e8bf3495e9cc547059a52392a51b52ec7d2034e997658944f6c40a2`.

Source version1.0.0/versionCode1/packagevn.himoto.staff, pluginExpo chỉ bật
localrelease bởi runner, lấy passwordchildenv, không viết generatednative bằngtay;
debug giữdebugcert, EASdefault không đổi. Nếu localrelease thiếukey, Gradlefail.
Plugin4checks idempotency/default/debug/releaseguards đạt. Root/backend không đổi.

Buildrun1snapshotguard chặn .env.example trước đọcfile; sửa snapshot loại mọi
.env* theo tên, không đọc/log/copy env. Keytool lần đầu PowerShell5 coi stderr
tiến độ là lỗi; giữDPAPIpassword, chưa cókeystore, completeexisting chỉ tạo khi
keystorechưa có, không regeneratekeyđã tồn tại.

Release buildrun2thành công (912tasks), source437file unchanged, ExpoNO_DOTENV1,
originproduction, signature/apksigner/aapt2verified. APK
`.backups/mobile-android-release-20261105-run2/Himoto-1.0.0-android-release.apk`:
SHA256`cf63a8e6b4b278e061b817f6e7135279cc03ed54cb088bdb7778314ebd645d64`,
63.392.667bytes, arm64-v8a+x86_64, minSDK24/target36, debugfalse.
`.backups/mobile-android-release-20261105-run2/results.json`.
Chưa nativeacceptance/signedupgrade/portablekeybackup; chưa gọi appdone.

## Native đang chạy

**Cập nhật sau lượt thực thi:**

- Samsung development binary live API run3 PASS4nhóm/6ảnh: login/overview,
  SecureStore processrestore, accountspermission +liveExcelcolumns, pendingrỗng/
  logout/relaunch.0appcrash/ANR/SystemUIANR. Originbundleproduction; chứng nhận
  đúngdevelopmentbinarya65b.../sourcecuối, chưa đồng nhất binaryrelease.
  `.backups/mobile-live-native-20261105-run3/results.json` và restore.json.
- Samsung run1/2 failharness chờ Lập hợp đồng khi Tổng quan đang giữ scroll
  sâu sau accounts. Sửa revealup theo vị tríthật; không sửa product. Run2lúc
  USB thay transport/mấtreverse, finallyremove8082thiếu có thể failrestore.
  Đã kiểm checkpointSHAgen81nguyên và khôi phục8081→8081/8091→8131 riêng.
- Release run3 đã đi qua login/restore/offline/retry/accounts/columns/pending/
  serverlogout, nhưng mởloginlại có InputDispatchANR và UIAutomator không có
  hierarchy. Không gọi run3pass. `.backups/mobile-release-live-native-20261105-run3/`
  có screenshot hộpthoại/current-after-failure, activity-lastanr, anr-buffer,
  anr-trace và native-blocked-threads. Event03:25:07ngày05/11, PID5431,
  FocusEvent timeout5003ms. Initialtrace mainchỉfutexwaiting và tombstonedfail;
  debuggerdlúc03:27mainnativePollOnce, không có appblockstackhữu dụng.
  HostfreeRAM~0.8GB, system_serverbusy; đây chỉ là bối cảnh, chưa chứng minh
  systemissuehayfixapp. Theo AndroidANRguide cần phân biệt app/system;
  không xóa bằng chứng hoặc tự coiANRresolved.
- Sau dừng Metroproduction8082do mìnhsởhữu, releasecoldstart5lầnPASS,
  quan sát6.14–9.587giây gồmAAT/UIAutomatoroverhead,0ANRmới. Chưa gọi đây là
  benchmarkTTID hoặc chứng minhANRtrướcđược xử lý.
  `.backups/mobile-release-cold-start-20261105-run1/results.json`.
- Dedicatedemulator5556 đượcadbroot chỉ để đọctraceANR; khôngrootSamsung,
  khôngclear/reset/reinstallSamsung. Bảnreleasecài lênAVDQAtrống; AVDread-only.
- Livecustomerwriter: run1tạohồsơQA47453, replay/receipt đúng nhưng assertion
  searchkhông tìm vì webactualsearchbỏunderscore còn tênQA cóunderscore.
  Giữhànhviweb, đổimarkerharnesssanghyphen; hồsơ47453đãreview/xóa/GET404,
  sessionrevoked, không tài chính/xe bịghi. Không gọirun1pass.
- Run2actualAPI PASS3nhóm với QAcustomer47454/store34: cùngUUIDkhôi phục
  receipt/replaychỉ1hồsơ, updateCASthành công/stalerevision409khôngghi đè,
  review/xóađúngID/tênQA rồiGET404. UUIDghi trongjournaltrướcmỗilệnh.
  `customerRowsLeftByRun=0`, logoutsession,0financial/vehiclewrites.
  `.backups/mobile-live-customer-write-20261105-run2/results.json`.
- Backupkey do usertựtạo bằngscript, sau đó yêu cầu mìnhkiểm/lưugiúp.
  Đãdecryptin-memory, đối chiếu keystoreSHA/alias/cert, không xuấtplaintextkey/
  password. FileencryptedSHAce285ff37847fd93c86eb376fdc49e468c20213afaa7aa57c731e6f58110269f
  tại `.backups/Himoto-Android-release-key-20261105.himoto-key` và
  `C:\Users\admin\Documents\Himoto-Android-Keys\` (ACLuseronly).
  Cảhai cùngmáy; chưa có off-machinebackup. Không lưu passphrase trongdocs.
  `.restore-check.json` và `.backups/mobile-signing-backup-locations-20261105.json`.
- Gói Androidreview có APK/source437filematchbuild/SHA/operatorguide:
  `.backups/mobile-android-review-bundle-20261105-run1/`. Manifestghi rõ
  releaseAcceptanceComplete=false/unresolvedReleaseAnr=true, khôngkey/credential.
  Không phát gói này như chứng chỉdone. Focusedreleaseexport/upgradeđangchạy,
  xem output/results trước khi cập nhật kết luận.

Nguồn phân tích ANR: [Android Developers](https://developer.android.com/topic/performance/anrs/diagnose-and-fix-anrs).

Metroproduction riêng8082/PID10416/.backups/mobile-live-runtime-20261105-run1,
giữ8081fixture/8131checkpoint81. EXPO_NO_DOTENV1/OFFLINE1, originhttpsproduction.
Samsungunlock được user xác nhận. Harness đọc login/restore/Account/columns,
khôngdownloadfleet/fullrecords hoặc submitbusiness. Khôngreset/clear/install
đèdebugcert bằngreleasecert. Nativeharnessrun1session11021đangprewarm/đợiinput,
phải đọc outputthật để kết luận và feedcredentials chỉ sau QA_INPUT_READY_NO_ECHO.
Không ghi credential vào sourcefile/screenshot/log.

Binaryrelease dùng dedicatedreadonlyAOSPQAAVDemulator5556, giữSamsungdebugdata;
runtimeđangchuẩn bị tại `.backups/mobile-release-emulator-20261105-run1/`.
Các kết quả native tiếp theo bổ sung sau khi thực hiện, không suy từ build.
