# Bàn giao triển khai app Himoto — 01/11/2026

> **Bàn giao mới nhất03/11:** đọc [mobile-handoff-2026-11-03.md](mobile-handoff-2026-11-03.md)
> và [đoạn copy sang chat mới](mobile-next-chat-prompt-2026-11-03.md). Toàn dự án
> chưa done. Source access/quyền/cơ sở đang sửa có types/lint và offline checks
> đạt, chưa native/browser/export/full-suite; không dùng các mốc native cũ
> chứng nhận source mới. Các mục bên dưới giữ nguyên làm lịch sử/baseline.


> **Bàn giao mới nhất ngày 02/11:** đọc
> [mobile-handoff-2026-11-02.md](mobile-handoff-2026-11-02.md) trước. Đã bắt đầu
> POST preview phí chỉ đọc, chưa nghiệm thu SQL/ghi trả xe. Các trạng thái
> “đang chạy” bên dưới là lịch sử; không khởi động lại test dựa vào chúng.

> **01:09 ngày 02/11 — mốc mới nhất, chưa hoàn thành app:** người dùng hỏi tỷ
> lệ và yêu cầu tiếp tục. Đã trả lời **ước 50–60% khối lượng theo roadmap**, chưa
> phải mức sẵn sàng phát hành. [Trạng thái từng phạm vi](mobile-status-2026-11-02.md).
>
> Samsung SM-N960N đã cài APK ARM64 đúng hash, nền **7/7**; bill tập trung
> **4/4** tại `.backups/mobile-phone-pending-bill-20261102/`, 0 crash/app ANR/
> SystemUI ANR và source trước/sau khớp. Các ca thu theo kỳ khác có bằng chứng
> riêng (chặn phí/bill, giữ form, thu 10.000, mất phản hồi/phục hồi đúng phiếu
> 5.000, tombstone giữ form/chặn late retry). **Không ghép các lượt bị lỗi QA
> thành full đạt.** Hai lần chọn ảnh QA do người dùng thực hiện. Bill nhận từ
> Samsung là JPEG 2200×1467, 160.317 byte, decode toàn ảnh đạt.
> Lượt cuối đã ack hết mã và đăng xuất/relaunch. Fixture **16441** vẫn giữ kết
> quả: 2 khoản thu/2 lần lưu bill/1 tombstone; không reset khi chưa cần.
>
> Đã đưa hướng dẫn bill chưa xác nhận về sát phần bill và đổi nhãn CTA đối
> chiếu theo trạng thái. Typecheck/lint, browser thu theo kỳ **9/9** và export
> đã đạt sau thay đổi UI. Native 4/4 là trước thay đổi vị trí/nhãn nhỏ này.
>
> **Đã triển khai tiếp GET chuẩn bị trả xe** `/contracts/:id/returns?page=1`
> và client typed; dùng `readPaymentContext` + `loadContractReturnablePage` mới
> trong domain web (export additive, không đổi loader web cũ). Scope/read-only
> transaction, 25 dòng/trang, revision, cọc/số dư, gate trạng thái/ngày trả/nợ
> xấu, giữ dòng xe thiếu nhãn và không gửi giấy tờ/raw composer. **4 nhóm API +
> 4 SQL mới đạt**, bộ mobile **106**, SQL **47**, release **44/44**, return-search
> **4 nhóm**. Root/mobile typecheck/lint đạt. Backend build đã đạt:
> `.backups/mobile-return-preparation-backend-build-20261102.log`.
> Chưa POST trả xe/quyết toán/editor/đổi xe, chưa nghiệm thu native trả xe.
> [QA preparation](qa/2026-11-02-mobile-return-preparation.md).
>
> Latest web/Hermes: `.expo/{web,native}-returns-preparation-qa`, Android
> `entry-0e5170d1311b1e190dfeec78a3fc0508.hbc`, iOS
> `entry-75b9db9940f1ff86ad57f2299b7cfc07.hbc`. Export exec **18730** đã kết thúc.
> Browser trên artifact cuối **9/9 đạt** tại
> `.backups/mobile-returns-preparation-ui-20261102/`, QA **97881** đã kết thúc,
> 0 page errors/unexpected hosts/ghi thật. Preview **8088**, server **70573**;
> các preview cũ vẫn tồn tại 8085–8087.
> Metro phone Admin **8081** qua npx giữ origin USB 127.0.0.1:8091; không sửa env.
> APK generated output hiện là ARM64; x86_64 còn bản backup verified, đừng cài
> nhầm bản x86 lên Samsung. Chưa áp migration production, commit/push/deploy.
>
> Bước tiếp: preview phí/clock/balance snapshot rồi ghi trả xe qua
> `completeReturnBatch`, quyết toán thu/hoàn cùng transaction, receipt bất biến
> và generic tombstone/ledger trước khi mở nút ghi. Không chỉ gọi
> `recordVehicleReturn` rồi để tiền/receipt tách rời. Đổi xe dùng
> `replaceContractVehicle`; nợ xấu dùng recovery riêng. Đọc cả quy tắc media
> trả xe, hoàn cọc/thuê và thuê sở hữu trước khi nối UI. Sau đó điều chuyển/
> nhận xe, media và ký/thiết bị iOS theo roadmap. Mục tiêu vẫn active.

> **00:37 — thu theo kỳ trên Samsung có bằng chứng từng phần, phục hồi đang
> chạy:** fixture **16441** giữ đúng 1 receipt đã ack (4003/kỳ 2/10.000 VND).
> `...mobile-phone-collections-20261102-reviewed/` qua chặn vượt phí/thiếu bill,
> dừng tại picker không hiện filename. Người dùng đã chọn ảnh QA theo câu hỏi
> và xác nhận. `...mobile-phone-collections-20261102-selected/` qua upload/
> giữ form/thu một phần, sau đó dừng trước ghi thứ hai vì Telex đổi `Lost` thành
> `Lót`. Marker thử đã đổi số, không tắt keyboard/autofill của máy cá nhân.
> Cleanup selected đã xác nhận source khớp, không mã chờ và đăng xuất, 0 crash/
> ANR. Không ghép các lượt thất bại thành full đạt.
> Lượt còn lại **70044** đang chạy `--collections --writes-only
> --collections-recovery`, artifact `.backups/mobile-phone-collection-recovery-20261102/`.
> Guard đúng một receipt đã ack trước khi tiếp tục, không reset fixture hoặc
> ghi lại khoản đầu. Không sửa mobile/shared/QA khi còn chạy. Picker có chờ
> người dùng chọn đúng ảnh QA, không chụp gallery hay chọn thumbnail cá nhân.

> **00:20 ngày 02/11 — Samsung nền đạt 7/7:** artifact
> `.backups/mobile-phone-smoke-20261102-reviewed/`, 0 crash/app ANR/SystemUI ANR,
> hash source trước/sau khớp, APK ARM64 đúng hash. Đã kiểm tra đăng nhập, bàn
> phím, tìm kiếm/Back, bộ lọc, giữ phiên qua đóng tiến trình và đăng xuất/relaunch.
> Những lượt Autofill/IME trước thất bại được giữ, không tính thành nghiệm thu.
> QA đã xử lý đúng Autofill UI chỉ trên Himoto và Laban/Android 9 IME visibility.
> Thu theo kỳ full trên Samsung đang chạy **66742**,
> `.backups/mobile-phone-collections-20261102/`, fixture mới **16441**. Đã lưu
> snapshot fixture cũ trước reset sau khi toàn bộ mã đã ack và app đăng xuất.
> Không sửa mobile/shared/QA trong lượt này. Metro phone Admin giữ nguyên
> origin USB, không sửa `.env.local`. Chưa có kết quả thu/mất phản hồi native.

> **00:09 ngày 02/11 — đã cài và mở app trên Samsung:** ARM64 build đạt
> **9m57s/505 tasks**, APK 96.058.863 byte, SHA
> `6cd7ccfe840b96ed174d21a48a3fc386edac1ca6ad1f9afb1ffb264b001e8334` khớp trên
> điện thoại, không thay app cũ. Metro Admin qua npx đã chuyển origin
> `http://127.0.0.1:8091`; metadata `.backups/mobile-phone-metro-admin.json`.
> Phone smoke **66624** tại `.backups/mobile-phone-smoke-20261102-connected/`
> đang chạy, đã mở login và qua validation trống. Không sửa source/QA script
> trong lượt. Probe Android 9 đã sửa giữ stdin mở để đọc HTTP qua USB; lượt
> setup trước chưa mở app, không tính vào nghiệm thu.
> Fixture **95974** vẫn giữ 1 khoản thu emulator đã ack; chưa reset khi smoke
> không ghi nghiệp vụ. Người dùng được hướng dẫn giữ máy mở khóa trong QA.
> [Trạng thái Android thật](qa/2026-11-01-mobile-physical-android.md).

> **00:01 ngày 02/11 — đã có Samsung thật, đang build ARM64:** SM-N960N qua
> USB đã được cấp ADB, Android 9/API 28, ARM64; chưa có `vn.himoto.staff` lúc kiểm
> tra. APK emulator min SDK 24 nhưng chỉ x86_64, không cài bản đó lên điện thoại.
> Build đúng ARM64 đang chạy exec **53789**, log
> `.backups/mobile-phone-arm64-build-verified-20261101.log`. Lượt đầu tách sai
> tham số PowerShell làm Gradle/Expo lỗi; đã sửa mảng tham số, giữ log thất bại.
> Khi build đạt mới chạy `.backups/install-phone-apk.py`, kiểm tra hash/ABI/package
> trước và sau cài, không dùng `-r`/không gỡ app khác.
> [Chuẩn bị Android thật](qa/2026-11-01-mobile-physical-android.md).
>
> Native emulator thu theo kỳ lượt hai vẫn dừng sau 8 nhóm, 0 crash/ANR, do
> tìm CTA Thu/chi nằm phía trên vùng cuộn. Đã xác minh source không đổi, không
> còn mã chờ và đăng xuất tại `.backups/mobile-collection-native-reviewed-cleanup/`.
> Emulator đã dừng; không tiếp tục lặp QA emulator khi điện thoại thật đã có.
> QA mới tìm hai hướng; có `--physical`, API fixture USB 127.0.0.1:8091, parser
> bàn phím Android 9, guard ảnh cá nhân/screenshot và log chỉ Himoto/SystemUI.
> Offline guards/keyboard/diagnostics đạt **3/3/4 nhóm**. Chưa có app chạy thật
> trên Samsung tại mốc này, chưa nghiệm thu thu theo kỳ/mất phản hồi native.
> Fixture **95974** vẫn giữ 1 khoản thu của lượt cuối đã được ack; reset chỉ sau
> kiểm tra cleanup proof. Metro cũ vẫn 8081/emulator origin. Helper phone Admin
> `.backups/start-mobile-phone-metro-admin.ps1` đã chuẩn bị, chưa chạy; phải đổi
> Metro sang origin USB và kiểm tra transformed bundle trước nhập tài khoản QA.
> Không chạy test/build nặng khác cùng Gradle trên host 8 GB.

> **23:22 — thu theo kỳ đã nối UI/API, đang kiểm chứng native:** có danh sách
> kỳ thực đã lưu (25/trang), thu một phần, bill quyền tài chính, đối chiếu
> `payment.renewal`/`payment.bill` và kết quả bất biến. Mobile **102 nhóm**, SQL
> **43 nhóm**, root/mobile typecheck/lint và backend build đạt. Browser bản cuối
> **9/9**, web/Hermes đã xuất lại `.expo/*collection-final-qa`.
> [QA thu theo kỳ](qa/2026-11-01-mobile-renewal-collections.md).
> Chưa dùng native gia hạn 11/11 cũ để chứng nhận phần thu mới.
> Browser hồi quy đã đạt **12/12 + 10/10 + 11/11 + 8/8 + 35/35**. Emulator AOSP
> PID **12260** đã boot. Native thu theo kỳ lượt đầu dừng sau **8 nhóm**, không
> crash/ANR; giữ tại `.backups/mobile-collection-native-20261101/`. Đã kiểm tra
> source không đổi, không còn mã chờ và đăng xuất, artifact
> `.backups/mobile-collection-native-cleanup/`, trước khi reset fixture. QA đã
> thêm chờ Tài chính tải xong trước khi cuộn. Lượt full mới exec **73117** tại
> `.backups/mobile-collection-native-20261101-reviewed/` đang chạy; fixture
> **95974** trên 8091. Không sửa mobile/shared/script QA khi lượt còn chạy.
> Metro Admin qua npx đã khởi động lại
> lúc 23:08, metadata `.backups/mobile-metro-admin.json`, listener PID **792**.
> Mọi lượt API/SQL/browser đều dùng QA; `.env.local` không sửa/đọc ra.
> Migration mới vẫn chưa áp production. Chi tiết bên dưới là mốc lịch sử.
>
> Người dùng hỏi thay emulator bằng Android/iPhone thật. Đã trả lời Android
> qua USB debugging dùng được trên Windows nhưng APK hiện chỉ x86_64, phải build
> đúng ABI và đổi API/Metro phù hợp; iPhone cần ký/cài development build. ADB lúc
> 23:38 mới thấy emulator, chưa có điện thoại thật. Chưa cài hoặc thay app trên
> thiết bị cá nhân; khi nhận thiết bị phải kiểm tra app đang có trước khi cài,
> không tự gỡ app/xóa dữ liệu để vượt lỗi chữ ký.

> **19:45 — đã pull theo yêu cầu:** `git pull --ff-only origin main` đưa
> `feat/mobile-foundation` từ `6467b6a` lên **`1d17b67`**, nhận 3 commit mới.
> Chỉ `src/lib/server/management-table.ts` trùng thay đổi local; đã stash riêng,
> pull rồi apply lại sạch, vẫn giữ export `vehicleHydrateSql`. Backup có checksum
> 206 file tại `.backups/prepull-mobile-20261101-194530/`, không gồm `.env.local`.
> Đã kiểm tra không mất file; 205 file giữ nguyên byte, file trùng có cả thay đổi
> remote và local. Stash thuộc lượt này vẫn giữ ở
> `85ddeb4bb71a03b726c21d2ee02aef447dad7b8b` để phục hồi; không đụng stash cũ.
> Chưa commit/push và chưa áp migration remote hoặc mobile vào production.
>
> Trước pull, thu theo kỳ gia hạn đã có GET preparation/client typed và service
> ghi/receipt đang triển khai; mobile **95 nhóm**, SQL **40 nhóm**, typecheck/lint
> đạt. Chưa mở POST/bill tài chính hoặc UI thu theo kỳ; không coi prototype ghi
> là luồng native đã nghiệm thu. Migration mới
> `docs/sql/2026-11-01-mobile-renewal-collections.sql` chỉ áp trong PGlite.
> Log SQL cuối: `.backups/mobile-renewal-collection-write-sql-verified-20261101.log`.
> Hồi quy sau pull đã kết thúc đạt: root/mobile typecheck/lint, release **44/44**,
> mobile **95 nhóm**, SQL **40 nhóm**, log `.backups/mobile-postpull-*-20261101.log`.
> Không chạy Next build cùng root tsc.

> **Mốc đang triển khai — bill và ghi gia hạn:** APK có ImagePicker,
> ImageManipulator, FileSystem đã build thành công (96.667.760 byte; log
> `.backups/mobile-media-native-build-20261101-verified.log`). Bill Android đạt
> **6/6 writes-only** lúc 16:41:58 và **11/11 full** lúc 16:52:52, không có
> crash/ANR mới. Artifact full: `.backups/mobile-bills-native-20261101-final/`.
> Bản sửa viewport ảnh phóng to đạt **3/3 tập trung** lúc 17:41:15, không có
> crash/ANR mới. Artifact `.backups/mobile-bill-viewer-native-20261101-checked/`.
> Các lượt thất bại được giữ
> riêng (mạng emulator chưa sẵn sàng, hai Back liên tiếp, Fast Refresh do sửa
> source khi đang QA, JSX lỗi bị chặn trước mở app); không tính thành nghiệm thu.
> Source đã được cố định sau mobile typecheck/lint ở lượt đạt. Emulator được dừng
> để build/xuất rồi mở lại cho lượt gia hạn bên dưới; không chạy lại lượt đã đạt
> nếu không có thay đổi cần kiểm tra.
> [QA bill](qa/2026-11-01-mobile-bills.md).
>
> Đã có POST gia hạn + tra cứu receipt, ghi nguyên tử qua domain chung, đối
> chiếu/hủy mã chưa ghi và metadata bất biến giữ số phiên bản giữa các nhân viên.
> SQL **30 nhóm**, domain **44/44**; bộ mobile **91 nhóm** đã đạt sau khi thêm
> tính toán/preparation thu theo kỳ (phần thu liên kết chưa có UI/write).
> Màn gia hạn đã nối chọn xe/ngày/phí, trạng thái thu, bill đúng phiên bản và
> phục hồi qua Tài khoản; browser gia hạn **8/8**, hồi quy source mới
> **35/35 + 12/12 + 10/10 + 11/11**. Android gia hạn **6/6 tập trung** và
> **11/11 full** đã đạt; chưa nghiệm thu thiết bị thật/iOS. Không dùng
> kết quả native bill để chứng nhận ghi gia hạn. [QA gia hạn](qa/2026-11-01-mobile-renewals.md).
> Hai migration bill/renewal chỉ áp PGlite, **chưa áp production**. Backend build
> gia hạn đã đạt: `.backups/mobile-renewal-write-backend-build-20261101.log`.
> Build đó trước bản sửa đối chiếu kỳ có hẹn trả cũ null; SQL bản sửa đã đạt,
> build backend cuối đã đạt, log
> `.backups/mobile-renewal-write-backend-final-build-20261101.log`, sau khi dừng emulator.
> Web/Hermes source mới đã xuất vào `.expo/*renewal-editor-qa`; log
> `.backups/mobile-renewal-media-*-export-20261101.log`. Preview source mới ở
> **8084**, exec `42358` (8083 vẫn là artifact cũ). Android `--renewals` full đã
> **thất bại sau 4 nhóm nền** vì ANR ở bước bộ lọc, trước mọi lệnh ghi. Exec
> `50967` đã kết thúc; output `.backups/mobile-renewal-native-20261101/` giữ đầy
> đủ ANR/dropbox/ảnh/XML và provenance. Host chỉ còn khoảng 178 MB RAM trống;
> CPU guest 99%, nhiều dịch vụ Google cũng ANR. Stack main ở Binder/accessibility.
> Chưa khẳng định nguyên nhân chỉ do host; cần kiểm tra tiếp. Emulator đã dừng;
> dự kiến thử GPU hardware/auto sau build để giảm chi phí software renderer.
> Lượt full `-gpu host` (Intel UHD) cũng **thất bại trước đăng nhập** với hộp
> System UI ANR; exec `40405` đã kết thúc, output
> `.backups/mobile-renewal-native-20261101-hardware/`. Emulator đã dừng an toàn;
> fixture vẫn 0 gia hạn/0 khoản thu/0 bill, không có mã đã gửi cần reset.
> Image regular AOSP Android 35 x86_64 r2 đã cài qua SDK Manager (source.properties
> và system.img đã kiểm tra). Đang tạo AVD **Himoto_AOSP_QA_20261101**, riêng
> trong `.backups/android-avd/`; AVD Google APIs cũ được giữ nguyên. Log cài/tạo
> `.backups/mobile-aosp-{image-install,avd-create}-20261101.log`. Không dùng ATD
> vì cần giữ SystemUI/bàn phím/camera/picker để kiểm tra thật.
> AVD AOSP đã tạo, 1280 MiB/2 cores/GPU host, 720×1600/280 dpi. Lượt đầu
> `...-aosp/` dừng trước mở app vì chưa nối AndroidWifi; đã nối qua `cmd wifi`.
> Lượt `...-aosp-connected/` dừng trước ghi vì QA gửi Back sau khi bàn phím đã
> đóng, Activity về Home (không có app crash). Harness đã sửa hide-keyboard có
> kiểm tra insets và thay/kiểm tra phí mặc định. Không sửa app để né ca lỗi.
> Lượt `...-aosp-input/` qua 1 nhóm gia hạn chưa thu rồi lỗi QA chỉ cuộn xuống
> khi ghi chú ở phía trên. Đã xác nhận form được giữ và 0 crash/ANR mới qua
> `.backups/mobile-renewal-aosp-input-cleanup/`. Mọi mã bill/gia hạn đã được kiểm
> tra/ack trên app; Tài khoản không còn mã chờ, form chưa gửi đã bỏ và QA đăng
> xuất trước reset fixture. Harness đã thêm hướng cuộn và hash cả script/fixture.
> `--renewals --writes-only` **đạt 6/6 lúc 18:47:15**, 0 app crash/ANR/System UI
> ANR và hash source/script trước/sau khớp. Artifact
> `.backups/mobile-renewal-native-20261101-aosp-reviewed/`; APK cài khớp SHA media.
> Mọi mã đã được ack/hủy trước reset fixture. **Full đạt 11/11 lúc 19:00:16**:
> `.backups/mobile-renewal-native-20261101-aosp-full/`, 0 crash/app ANR/System UI
> ANR và hash 104 source/script/config khớp. Exec `82866` đã kết thúc.
> Emulator đã dừng; app đăng xuất, fixture **92580** giữ kết quả QA cuối.
> Đã thêm helper/preparation chỉ đọc cho thu một phần theo phiên bản, 6 nhóm
> tính toán và 3 nhóm SQL mới đạt (91 mobile, 30 SQL), root typecheck/lint đạt.
> Chưa có endpoint/write/editor thu liên kết; log
> `.backups/mobile-renewal-collection-prep-{api,sql,checks}-20261101.log`.
> Harness mới lưu SHA APK đã cài, hash entry và snapshot source; sửa mobile/shared
> khi đang chạy sẽ làm lượt thất bại. Chỉ một UI Automator reader.
> Còn thu liên kết sau gia hạn, trả/đổi xe, điều chuyển và media khác.
>
> Metro Admin qua **npx** đang giữ 8081, metadata `.backups/mobile-metro-admin.json`
> (khởi động lại 17:34:37); fixture 8091 đã restart khi không có lệnh chưa
> rõ kết quả, exec `92580`; preview cũ 8083 chưa phải source mới. Không reset
> fixture khi còn mã chưa đối chiếu. `.env.local` không sửa; chưa commit/push.

> **Mốc đã đạt — tài chính sau phát hành:** đã thêm 5 nghiệp vụ thu/chi qua
> `recordContractPayment`, quyền tài chính riêng, lịch sử phân trang, kiểm tra
> revision + số dư đã rà soát và clock server cho kỳ thuê sở hữu. Bộ mobile
> đạt 62 nhóm tại mốc tài chính, tài chính API/client 8 nhóm,
> SQL PostgreSQL tách biệt 11 nhóm (9 tài chính + 2 chuẩn bị gia hạn),
> browser 11/11; hồi quy browser
> 35/35 + 12/12 + 10/10; domain release 44/44; backend build và Hermes hai
> nền tảng đạt. Hai lượt native tài chính đã dừng sau 8 nhóm vì nút cuộn/nhãn
> trợ năng `busy`; đã sửa và phục hồi #9006 qua app trước mỗi lần reset fixture.
> Lượt cuối `--finance` đạt **12/12, full**, lúc 15:22:42; 0 crash/ANR mới.
> Artifact: `.backups/mobile-finance-native-20261101-accessible/`. Chi tiết hai
> lần lỗi được giữ riêng; không đếm lượt phục hồi 3 nhóm thành lượt đầy đủ.
> Ca đổi scope với SecureStore đạt **3/3, writes-only**, lúc 15:28:07,
> 0 crash/ANR mới: `.backups/mobile-finance-scope-native-20261101/`.
> [QA tài chính](qa/2026-11-01-mobile-finance.md) là nguồn bằng chứng mốc này.
> JS/Hermes mới có nhãn trợ năng: `mobile/.expo/native-finance-accessible-qa/`;
> fixture 8091 đã được restart
> với mã tài chính mới; Metro Admin giữ 8081. Không chạy root typecheck đồng
> thời `next build` vì build sinh lại `.next/types`; chạy tuần tự.
> Sau tài chính: gia hạn/thu cho phiên bản gia hạn, trả/đổi xe, điều chuyển và
> media. Goal vẫn `active`, toàn bộ mục tiêu chưa hoàn thành; chưa commit/push.
> APK tài chính giữ riêng tại
> `.backups/mobile-finance-debug-before-media-20261101.apk`. Không dùng artifact
> tài chính để chứng nhận module ảnh hoặc ghi gia hạn mới. Các mốc service/GET
> preparation, ảnh và build APK trước đó đã được thay bằng trạng thái ở đầu tài liệu.

> **Cập nhật lượt tiếp tục:** mục tiêu đầy đủ đã được đặt lại ở trạng thái
> `active`; chưa hoàn thành. Browser tải lại/đối chiếu đạt 7/7, suite mở rộng đạt
> 10/10; API/client/form mobile hiện 49 nhóm; hồi quy browser 35/35 + 12/12;
> domain release 44/44 và build production backend đạt. Đã thêm giao thức
> server đối chiếu/hủy mã chưa ghi và màn Tài khoản; xem
> [QA đối chiếu](qa/2026-11-01-mobile-write-recovery.md) cho bằng chứng hiện tại,
> bundle/native mới và giới hạn. Các mục bên dưới là ảnh chụp **trước lượt tiếp tục**.
> Android `--contracts` mới đạt 12/12, full, lúc 11:04:07; 0 crash mới trong lượt
> này qua audit riêng. Crash debug inspector lúc 10:50:32 vẫn chưa rõ nguyên nhân.
> Native/Hermes cuối: `mobile/.expo/native-write-recovery-qa-final/`; chưa phải
> APK/IPA release mới. Emulator QA đã dừng sau kiểm thử để giải phóng RAM;
> Metro Admin 8081, browser preview 8083 và fixture 8091 được giữ cho phát triển.
> User đã xác nhận lại được chạy Metro bằng quyền Admin. Do ổ C đầy, các lệnh QA
> và helper Admin dùng TEMP/TMP riêng tại `.backups/mobile-tmp` trên E; không sửa
> thiết lập hệ thống hoặc `.env.local`.

Tài liệu để tiếp tục trong chat mới, dựa trên mã nguồn và artifact đã kiểm tra
tại `E:\Himoto` sáng 01/11/2026, múi giờ Asia/Saigon. Đây là ảnh chụp trạng thái;
chat mới cần kiểm tra lại Git, tiến trình và thời điểm artifact trước khi chạy tiếp.

## 1. Mục tiêu đầy đủ và yêu cầu đã thống nhất

> Hoàn thiện app quản lý Himoto cho nhân viên/quản lý trên iOS và Android từ nền React Native + Expo hiện có: giao diện dễ nhìn, thao tác rõ ràng và nhanh; triển khai các luồng nghiệp vụ cần thiết dùng chung backend và phân quyền; xử lý lỗi mạng, phiên đăng nhập và dữ liệu an toàn; có kiểm thử hồi quy, build native và kiểm chứng trên thiết bị trước khi đánh dấu hoàn thành. Tiếp tục tham khảo xtool đúng phạm vi Swift/SwiftPM và các nguồn mở phù hợp; không coi bản chỉ tra cứu hoặc chỉ xuất bundle JavaScript là app đã hoàn thiện.

- Người dùng yêu cầu làm đến hoàn thiện, có chế độ mục tiêu; toàn quyền lựa chọn
  kỹ thuật trong phạm vi dự án, tiếp tục chủ động khi đã đủ thông tin.
- Đối tượng giai đoạn đầu là **nhân viên/quản lý Himoto**.
- Ưu tiên dễ thao tác, dễ nhìn, rõ ràng, mượt và ổn định. Thiết kế cho công việc
  trên điện thoại, thao tác chính rõ, không bê nguyên bảng desktop sang app.
- Mỗi màn có tải/rỗng/lỗi/thử lại; giữ nội dung khi lỗi mạng; tìm kiếm và bộ lọc
  dễ truy cập; xác nhận trước thao tác tài chính/rời biểu mẫu có thay đổi.
- Vùng bấm tối thiểu 48, safe area, bàn phím, sáng/tối, giảm chuyển động và chữ
  lớn cần được xử lý. VoiceOver/TalkBack và hiệu năng bản release còn phải đo.
- Người dùng **đã có iPhone, chưa cấu hình Apple Developer/Expo**. Không hỏi lại
  thông tin này; không yêu cầu mật khẩu hoặc khóa bí mật qua chat.

**Mục tiêu chưa hoàn thành.** Goal cũ từng trả về `usageLimited`; lượt tiếp tục
đã đặt lại đầy đủ mục tiêu ở trạng thái `active`. Chưa đánh dấu hoàn thành.
Chat tiếp theo cần đọc trạng thái goal hiện tại rồi tiếp tục mục tiêu đầy đủ,
không thu hẹp thành chỉ hoàn thiện màn bản nháp hoặc phát hành hợp đồng.

## 2. Git, môi trường và tiến trình lúc bàn giao

- Workspace: `E:\Himoto`, Windows PowerShell, máy 8 GB RAM.
- Remote: `https://github.com/quantrinhansu123/Himoto.git`.
- Branch: **`feat/mobile-foundation`**, HEAD **`6467b6a`**, chưa có upstream.
- Phần triển khai mobile/backend/QA hiện có rất nhiều file sửa và chưa được Git
  theo dõi; **chưa commit/push**. Các thay đổi web dùng chung cũng cần giữ lại.
- Lượt bàn giao này không pull, reset, stash hoặc đổi branch. Nếu cần đồng bộ
  remote, kiểm tra và bảo toàn toàn bộ worktree trước; không pull vào cây sửa dở
  mà chưa biết thay đổi nào sẽ bị ảnh hưởng.
- Không đọc/in bí mật hoặc chép `.env.local` sang mobile. Agent không sửa file này.
- Migration và cấu hình triển khai production chưa được áp dụng; chưa phát hành
  app hoặc thay đổi dữ liệu nghiệp vụ thật trong phần QA đã báo cáo.
- **Tại mốc bàn giao ban đầu** không có listener ở 8081, 8083, 8091 hoặc emulator.
  Trạng thái này đã được thay thế bằng cập nhật mới nhất đầu tài liệu; luôn
  kiểm tra listener/tiến trình thật trước khi khởi động hoặc dừng dịch vụ.
  `.backups/mobile-metro-admin.json` là dấu vết cũ, không chứng minh tiến trình sống.
- `.backups/`, `.expo/`, APK và native directories sinh tự động là artifact local,
  không mặc nhiên đi theo Git. Sang máy khác phải mang mã chưa commit và bằng
  chứng cần thiết, hoặc tạo commit có kiểm soát trước.

## 3. Kiến trúc và nguyên tắc phải giữ

- Web/backend Next.js 15.5.28 + TypeScript + PostgreSQL; app nằm riêng tại
  `mobile/`: Expo 58.0.22, React Native 0.88.1, React 19.3, TypeScript 6.0.3,
  Expo Router, TanStack Query, SecureStore, DateTimePicker 9.2.1.
- Hai package/lockfile riêng. Dùng nghiệp vụ server hiện có, không dựng một hệ
  thống hợp đồng/tiền/kho riêng cho app. API: `src/app/api/mobile/v1/`.
- DTO/validation chung: `shared/mobile-contract.ts`,
  `shared/mobile-draft-validation.ts`, `shared/mobile-contract-validation.ts`.
- Bearer opaque `hm1_`, chỉ lưu hash ở DB, hết hạn 8 giờ; kiểm tra lại người dùng,
  mật khẩu/quyền/cơ sở mỗi request. Native lưu phiên qua SecureStore; production HTTPS.
- Tiếp tục actor/store RLS trong transaction qua context/pool hiện có. Quyền
  đọc kho chung không được biến thành quyền ghi hoặc đọc toàn hệ thống.
- Ghi dữ liệu dùng UUID yêu cầu + fingerprint + receipt cùng transaction với
  nghiệp vụ, kiểm tra revision; replay cũng phải kiểm tra quyền xem hiện tại.
- Migration chuẩn bị sẵn, **chưa apply**:
  `docs/sql/2026-10-31-mobile-sessions.sql`,
  `docs/sql/2026-10-31-mobile-writes.sql`.
- Ledger phục hồi v2: `mobile/src/lib/pending-writes.ts`, tối đa **8 yêu cầu chưa
  rõ kết quả trên thiết bị, xuyên các tài khoản**. Chỉ giữ UUID/phạm vi/loại thao
  tác; không lưu nội dung biểu mẫu hay token trong ledger. Hết phiên/đăng xuất
  giữ mã để tài khoản đúng đối chiếu sau; metadata hỏng thì chặn ghi mới.
- Chưa có cơ chế hủy/đối chiếu an toàn để giải phóng ý định chưa được server ghi
  nhận. **Không xóa mã local hoặc dùng TTL tùy tiện**: request đến muộn có thể ghi
  trùng. Cần giao thức server xác nhận/tombstone cùng khóa transaction; đây là
  việc cần thiết kế/triển khai tiếp, chưa phải chức năng đã có.

## 4. Những phần đã triển khai

### Nền app và khách hàng

Đăng nhập/giữ phiên/đăng xuất, tổng quan, danh sách có phân quyền cơ sở, tìm kiếm,
lọc có Áp dụng/Hủy, phân trang, chi tiết hồ sơ, tài khoản, sáng/tối, giảm chuyển
động. Thêm/sửa khách hàng có ngày native, liên hệ nước ngoài, giấy tờ/người thân,
kiểm tra trùng/phiên bản, giữ biểu mẫu khi lỗi và phục hồi lần ghi mất phản hồi.

Server: `mobile-session.ts`, `mobile-context.ts`, `mobile-catalogue.ts`,
`mobile-customers.ts`, `mobile-writes.ts`, `customer-writes.ts` trong
`src/lib/server/`. Customer service được dùng lại từ web, không bỏ kiểm tra trùng.

### Soạn và tiếp tục bản nháp hợp đồng

- Editor bốn bước: thông tin thuê, khách hàng, xe, rà soát; chọn ngày/giờ, nhân sự,
  khách/xe, kiểm tra lịch, phí/kỳ đóng tiền, lưu/mở lại theo revision.
- API options/staff/inventory/availability/customer lookup và GET/POST/PATCH bản
  nháp. Tra cứu chính xác thông tin khách dùng POST body, không đưa PII vào URL.
- Quyền từng tác vụ, dữ liệu trả về tối thiểu; trường legacy không hiểu phải báo
  cần rà soát thay vì âm thầm xóa. Lịch khả dụng phân biệt thuê/cọc/bản nháp;
  thao tác kiểm tra hoặc lưu nháp tự nó không giữ kho.
- File chính: `mobile/src/components/draft-editor.tsx`,
  `mobile/src/hooks/use-draft-write.ts`; server `mobile-drafts.ts`,
  `mobile-draft-shape.ts`, `mobile-draft-lookups.ts`.
- **Đã đối chiếu nghiệp vụ:** tính giá, in và phát hành đều dùng **lịch chung hợp
  đồng**. Dòng xe có lịch legacy khác phải hiển thị và xác nhận đồng bộ rồi lưu
  trước khi phát hành. Hủy đồng bộ giữ nguyên; server chỉ thay đổi khi lưu.
  Không triển khai lịch vận hành riêng từng xe trái nghiệp vụ hiện có.

### Rà soát, phát hành, nhận cọc giữ xe và giao xe

- Màn review cho thấy đúng cơ sở doanh thu, khách/xe/lịch, tiền đã nhận/còn thu,
  tài khoản nhận hợp lệ và lỗi cần bổ sung. Có phát hành giao ngay hoặc nhận cọc
  giữ xe; giao xe từ giữ chỗ không thu lại khoản đã nhận.
- Các khoản thực nhận nhập rõ ràng, tối đa 100 dòng theo giới hạn domain. Phân
  biệt cọc thế chấp/tiền thuê và cash/personal-bank/company-bank dù trùng số ID;
  chặn thu vượt/future time, yêu cầu chấp nhận cảnh báo chồng lịch khi áp dụng.
- Bốn route: GET `/contracts/:id/preparation`, POST `/contracts/:id/finalize`,
  POST `/contracts/:id/handover`, GET `/contracts/requests/:key` dưới API v1.
- Yêu cầu `contracts.read` + `contracts.finalize`; không ép người chỉ phát hành
  phải có quyền sửa bản nháp hoặc quyền tài chính tổng quát. Thu tiền về sau
  là luồng riêng cần áp dụng quyền nghiệp vụ phù hợp.
- Dùng `finalizeContractDraft`/`handoverReservation` hiện có trong transaction;
  kiểm tra revision, chủ thể khách đã lưu, loại hợp đồng legacy/quyền duyệt,
  trường dữ liệu không hiểu và lịch chung. Receipt gắn với tiền/trạng thái/kho.
- Server: `src/lib/server/mobile-contracts.ts`;
  app: `mobile/src/hooks/use-contract-action.ts`,
  `mobile/src/components/contract-preparation.tsx`,
  `mobile/src/app/contract/[id].tsx` và CTA ở chi tiết hồ sơ.
- Receipt được ưu tiên phục hồi ngay cả khi tải preparation thất bại. Lỗi mạng
  không thay form đang mở; mã xác nhận giữ được qua đóng tiến trình/đăng nhập lại.
- Next `after` chỉ xếp sự kiện vào outbox thông báo thủ công sau commit. Không
  tự gửi Telegram; lỗi queue không rollback tiền. Chưa cam kết eventual delivery.

## 5. Điểm dở dang gần nhất — xử lý trước khi mở rộng

Lần sửa mã gần nhất lúc **07:10:26 ngày 01/11**:

1. `use-contract-action.ts`: `findPrevious` phân biệt đã có receipt, có mã chưa
   xác nhận, và không có mã; kiểm tra token/mounted trước khi cập nhật trạng thái.
2. `contract-preparation.tsx`: hàm `refresh()` refetch rồi `action.checkPrevious()`
   ở các đường tải lại; tránh tình huống server đã commit nhưng tải lại chỉ thấy
   hợp đồng đổi trạng thái, mã pending chưa được đối chiếu.
3. `scripts/lib/mobile_contract_ui.py`: thêm trường hợp seed **3004**, commit mất
   phản hồi rồi bấm **Tải lại thông tin hợp đồng**, mong đợi banner kết quả cũ,
   mở hợp đồng đã lưu và không phát sinh thao tác lần hai.

**Chưa chạy lại browser suite mới này.** Artifact financial browser 6/6 kết thúc
lúc 07:00:04, trước sửa mã; bây giờ suite dự kiến **7/7**, chưa được phép ghi là đạt.
Native 10/10 kết thúc 07:22:04 sau sửa mã, nhưng không có case bấm tải lại này.
Mobile lint/typecheck và JS/Hermes export cũng cần chạy lại cho bản sửa cuối;
thư mục native export đang có được sinh lúc 06:54:36, trước sửa mã.

## 6. Bằng chứng đã có và giới hạn

Các đường dẫn dưới tính từ root repo. Không cộng các lượt chọn lọc thành một
lượt nghiệm thu toàn app; xem `results.json` và thời điểm mã/artifact tương ứng.

| Kiểm tra | Kết quả đã xác nhận | Bằng chứng / phạm vi |
| --- | --- | --- |
| API/client/form/palette mobile | 43 nhóm | `npm run test:mobile`; trước bản sửa refresh cuối |
| Wrapper phát hành/giao xe | 8 nhóm | `.backups/mobile-contract-actions-results.json`; DB/domain synthetic, có guard customer identity |
| Domain release hiện có | 44/44 | `npm run test:release`; external networking disabled |
| Browser nền/khách hàng | 35/35 | `.backups/mobile-contract-base-regression-20261101/results.json` |
| Browser bản nháp | 12/12 | `.backups/mobile-contract-draft-regression-20261101/results.json` |
| Browser phát hành/giữ chỗ/giao xe | 6/6 | `.backups/mobile-contract-ui-20261101/results.json`; case thứ 7 mới chưa chạy |
| Android native với `--contracts` | **10/10, mode full** | `.backups/mobile-contract-native-20261101/results.json`, 07:22:04; bộ chọn luồng contracts, không bao trọn mọi module |
| Android native khách hàng, lượt trước | 10/10 | `.backups/mobile-customers-native-20261101-fresh/results.json` |
| Android native bản nháp tập trung | 5/5, writes-only | `.backups/mobile-draft-native-final-20261101/results.json`; không phải full 13 nhóm |
| Draft SQL planning | 6/6 | `.backups/mobile-draft-sql-results.json`; EXPLAIN chỉ đọc, không ANALYZE/đo runtime |
| Backend production build | Đạt | Đã chạy sau guard customer identity; không phải deploy |
| Android/iOS JS/Hermes export | Đạt bản trước sửa refresh | `mobile/.expo/native-contract-actions-qa/`; không phải signed IPA/APK |
| Lint/typecheck root và mobile; Expo Doctor | Đã đạt lượt trước | Doctor 20/20; cần kiểm tra lại mobile sau sửa refresh |

Native contracts 10 nhóm gồm login/validation/bàn phím; tìm kiếm/chi tiết/Back;
lọc Hủy/Áp dụng; xác nhận đồng bộ lịch và phát hành với tài khoản/khoản thực nhận;
reservation commit mất phản hồi phục hồi từ SecureStore sau kill process; giao
xe giữ nguyên advance; khôi phục phiên và đăng xuất qua relaunch. Dữ liệu fixture,
`operationalWrites: 0`, `physicalDeviceCertified: false`.

Browser đã đạt không có page error, unexpected host, đăng nhập thật hoặc ghi
nghiệp vụ thật. Chưa chứng nhận iPhone, thiết bị thật, chữ lớn native, screen
reader, thời gian mở app hay hiệu năng release. Build/bundle/emulator không thay
thế các bước này.

## 7. Lệnh tiếp tục và môi trường QA

Từ `E:\Himoto`, chạy các kiểm tra phù hợp với bản sửa cuối:

```powershell
npm.cmd run mobile:typecheck
npm.cmd run mobile:lint
npm.cmd run test:mobile
```

Build lại browser từ CWD `E:\Himoto\mobile` với API giả được harness intercept:

```powershell
$env:EXPO_PUBLIC_API_URL='https://mobile-api.example.invalid'
$env:EXPO_NO_TELEMETRY='1'
npx.cmd expo export --platform web --output-dir .expo/web-preview --max-workers 1
```

Sau đó từ root, dùng Python đã cài `scripts/requirements-mobile-qa.txt`, chạy
static server riêng và suite riêng, không để lệnh server chặn việc chạy suite:

```powershell
python -m http.server 8083 --bind 127.0.0.1 --directory mobile/.expo/web-preview
```

```powershell
python scripts/check-mobile-draft-ui.py --contracts-only --output .backups/mobile-contract-ui-refresh-20261101
```

Khi case thứ 7 đạt, xuất lại native bundle từ CWD `mobile/` với origin QA phù hợp
và output mới; root build/typecheck/lint/release tests theo phạm vi thay đổi.
Tham khảo quy trình CI `.github/workflows/mobile-checks.yml`; workflow đã có
nhưng chưa có bằng chứng GitHub Actions chạy trên remote cho worktree chưa push.

Android QA local:

- SDK `E:\Android\Sdk`; JDK `C:\Program Files\Android\Android Studio\jbr`.
- AVD riêng `Himoto_QA_20261031`, `ANDROID_AVD_HOME=E:\Himoto\.backups\android-avd`;
  Android 35 Google APIs x86_64, Pixel 7. Không dùng AVD của dự án khác.
- APK có sẵn: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`,
  96,424,300 bytes, debug x86_64. Màn tài chính không thêm native dependency;
  có thể dùng APK này với Metro mới, không cần build Gradle chỉ vì đổi JS.
- Máy 8 GB: dừng emulator trong lúc build native. AVD read-only trắng cần cài
  lại APK sau mỗi lần khởi động AVD mới; force-stop app vẫn giữ SecureStore trong
  cùng lượt emulator. Chạy một UI Automator reader tại một thời điểm.
- Fixture riêng: `python scripts/mobile-fixture-server.py --port 8091`; chỉ bind
  localhost, `/health` phải báo fixture. Login **chỉ QA**: `qa`/`fixture-password`.
- Metro dùng `EXPO_PUBLIC_API_URL=http://10.0.2.2:8091`, localhost port 8081.
  Helper Admin sẵn có, người dùng đã cho phép dùng quyền Admin:

```powershell
Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File E:\Himoto\.backups\start-mobile-metro-admin.ps1'
```

Sau khởi động phải kiểm tra thực tế `/status` trả HTTP 200,
`packager-status:running`; không lấy marker cũ làm kết quả. Chỉ dừng tiến trình
đã xác minh thuộc app này. Chạy native sau khi fixture/Metro/AVD sẵn sàng:

```powershell
python scripts/check-mobile-native.py --adb E:/Android/Sdk/platform-tools/adb.exe --serial emulator-5554 --contracts --output .backups/mobile-contract-native-next
```

Xác minh serial trước khi dùng; harness từ chối thiết bị thật/production origin.
Không chạy lại kiểm thử chỉ để tạo thêm kết quả nếu chưa có thay đổi liên quan.
Các lệnh `10.0.2.2`, fixture và debug x86_64 **không dùng cho iPhone thật**.
Hướng dẫn build/AVD chi tiết: [mobile-native-testing.md](mobile-native-testing.md).

## 8. Thứ tự công việc tiếp theo

1. Kiểm tra worktree/goal/tiến trình; hoàn tất kiểm chứng bản sửa refresh ở mục 5,
   format/lint/typecheck, browser case mới và native export mới; cập nhật bằng chứng.
2. Thiết kế và triển khai đối chiếu/hủy ý định ghi có xác nhận server để ledger
   không kẹt ở giới hạn 8. Kiểm thử cạnh tranh, request tới muộn, đã commit và
   chuyển tài khoản/cơ sở; không mất khả năng phục hồi giao dịch chưa rõ kết quả.
3. Chi tiết/lịch sử tài chính và nhận tiền sau phát hành; dùng lại service hiện có,
   quyền tài chính đúng, receipt/revision, xử lý retry/mất phản hồi như các luồng trước.
4. Gia hạn, trả/đổi xe và hoàn tiền theo nghiệp vụ server; đối chiếu giá/kho/công nợ.
5. Điều chuyển/nhận xe; camera, giấy tờ, ảnh/video gắn đúng nghiệp vụ. Rà soát UX
   tính giá với logic chung, không nhân bản công thức backend.
6. Kiểm thử vai trò/cơ sở và lỗi mạng xuyên các luồng; accessibility, chữ lớn,
   bàn phím, thiết bị thật và đo hiệu năng bản release; signed build/test distribution.
7. Chỉ đánh dấu toàn mục tiêu hoàn thành khi đủ nghiệp vụ và các điều kiện nghiệm
   thu; nêu rõ phần cần tài khoản/hạ tầng ngoài máy, tiếp tục phần độc lập trước.

## 9. iOS, xtool và quy tắc cho chat mới

- Đã tham khảo `https://github.com/xtool-org/xtool.git`: công cụ Swift/SwiftPM;
  không thay bộ build Expo/React Native trên Windows. Tiếp tục Expo/RN;
  iOS ký/phân phối qua EAS với tài khoản dự án hoặc Xcode trên Mac.
- `mobile/eas.json` có trong mã; tài khoản/cấu hình dự án Apple/Expo chưa hoàn tất.
  Bundle ID dự kiến `vn.himoto.staff` chưa được xác minh quyền sở hữu/khả dụng.
- Đọc `mobile/AGENTS.md` trước khi sửa app. SDK 58 có breaking changes: đọc tài
  liệu **đúng phiên bản** trước khi dùng API, thêm package qua `npx.cmd expo install`.
- Điểm đã xác minh của SDK đang dùng: `usePreventRemove` từ `expo-router`, callback
  `{ repeat }`; instance RN 0.88 là `TextInputInstance`/`ScrollViewInstance`;
  DateTimePicker 9.2.1 dùng `onValueChange`. Kiểm tra lại docs nếu thay API/version.
- Routes ở `mobile/src/app/`; component/hook ngoài đó. Không sửa tay thư mục native
  sinh tự động; cấu hình qua Expo/config plugin. Giữ thiết kế hiện có; skill
  `ui-ux-pro-max` đã được áp dụng, đọc skill khi chat mới làm UI.
- Browser header Back là link có accessible label kết thúc `, back`; dùng control
  thật giữa các màn, không đổi nghiệp vụ navigation để chữa giả định của test.
- Font `System` trên RN Web đã được đối chiếu là system stack. Các adapter tạm đã
  bỏ; không tự thêm lại vì cảm giác từ ảnh chụp.
- Không spawn agent chỉ vì người dùng nói làm cùng một dev mobile. Không gửi
  Telegram khi chưa được yêu cầu. Nếu có yêu cầu báo Telegram: đọc
  `../teleport/rules/telegram-guide.md`, gửi bằng script trung tâm và **ngay lập
  tức** nghe phản hồi theo guide.

Đọc tiếp: [roadmap](mobile-roadmap.md), [architecture](mobile-architecture.md),
[QA tài chính](qa/2026-11-01-mobile-contract-actions.md),
[QA bản nháp](qa/2026-11-01-mobile-drafts.md),
[QA khách hàng](qa/2026-10-31-mobile-customers.md), `mobile/README.md`.
