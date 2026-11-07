# Himoto Android — phần nên làm tiếp sau thông báo

Rà soát ngày 06/11/2026, dựa trên source hiện tại, kết quả QA và tài liệu chính thức Android/Expo. Đây là đề xuất ưu tiên, chưa phải các tính năng đã triển khai.

## Những phần đã có

App đã có hợp đồng/gia hạn/trả xe/thu tiền/điều chuyển, QR căn cước, GPS, ảnh/video, in/PDF, Excel, lịch sử hợp đồng/xe, phân quyền theo cơ sở, báo cáo và lịch trực. `DraftWorkList` và journal lưu bản đang soạn trên thiết bị; `PendingWriteRecovery` giữ mã giao dịch và đối chiếu kết quả khi mất phản hồi. Màn Thao tác nhanh đã hỗ trợ tìm hợp đồng để trả xe bằng biển số/số điện thoại. Vì vậy không đề xuất làm lại các phần này.

## Thứ tự đề xuất

| Ưu tiên | Phần việc | Hiện trạng xác minh | Kết quả cần có |
| --- | --- | --- | --- |
| P0-1 | Nghiệm thu nhiều phiên và phát hành thử theo cơ sở | Đã có test tự động/SQL cô lập và các lượt Samsung; chưa có bằng chứng nghiệm thu tổng thể nhiều thiết bị/vai trò trên môi trường triển khai riêng | Hai thiết bị cùng thao tác một xe/hợp đồng; mất mạng sau commit; tắt app giữa lưu; đổi quyền/khóa tài khoản; thu–hoàn tiền và tồn kho khớp web/DB; triển khai thử một cơ sở trước |
| P0-2 | Giám sát lỗi production và hỗ trợ chẩn đoán | Có ErrorBoundary và log ADB trong QA; không thấy Sentry/Crashlytics hoặc tích hợp báo lỗi tập trung trong mobile source/dependencies | Nhận lỗi JavaScript/native theo phiên bản, máy, màn hình và mã lỗi/request; theo dõi crash/ANR/độ trễ; người dùng có mã báo lỗi; loại token, CCCD, số điện thoại và ảnh khỏi telemetry |
| P0-3 | Quản lý phiên bản và cập nhật an toàn | Bản ký/nâng cấp giữ dữ liệu đã có quy trình; không thấy màn kiểm tra bản mới, chính sách phiên bản tối thiểu hay cấu hình Expo Update | Hiển thị phiên bản; báo có bản mới; chỉ chặn bản cũ khi API thực sự không tương thích; giữ bản nháp/giao dịch chờ; phát hành từng nhóm và có cách quay lại phiên bản ổn định |
| P1-1 | Hoàn thiện trải nghiệm mạng yếu và tra cứu offline có kiểm soát | Draft/journal và đối chiếu UUID đã có; QueryClient hiện giữ cache trong RAM, chưa thấy cache tra cứu bền vững hoặc bộ theo dõi kết nối | Hiển thị mất mạng/thời điểm dữ liệu; có thể xem dữ liệu đã tải trong phạm vi quyền, thời hạn và chính sách lưu phù hợp; soạn nháp tiếp; tải lại/đối chiếu khi có mạng; không dùng cache cũ để xác nhận thu tiền, giao/trả xe |
| P1-2 | Quản lý các thiết bị/phiên đăng nhập | Màn Tài khoản có phạm vi, hạn phiên, đổi mật khẩu, đăng xuất; chưa thấy danh sách thiết bị và thu hồi riêng từng phiên | Xem các phiên của mình, thời điểm hoạt động, đăng xuất thiết bị mất/bàn giao; thu hồi token ngay trên server; chỉ chủ tài khoản hoặc quản trị được phép mới thao tác |
| P2 | Tìm kiếm chung và hồ sơ gần đây | Có tìm kiếm từng danh mục và tìm hợp đồng theo luồng; chưa thấy màn/API tìm kiếm chung | Một ô tìm theo biển số, mã hợp đồng, số điện thoại; kết quả phân loại xe/hợp đồng/khách trong đúng phạm vi; mở thẳng hồ sơ, không phải lần qua nhiều menu |

P0 là phần vận hành/phát hành nên hoàn tất trước khi mở rộng nhiều cơ sở. P1 tăng độ bền và tốc độ xử lý thực tế. P2 cần kiểm chứng nhu cầu với nhân viên tại quầy trước khi đầu tư. Thứ tự trên là đánh giá của đợt rà soát, không phải danh sách tính năng do Android bắt buộc.

## Lưu ý thiết kế

- **Không đồng nhất giữ bản nháp với offline toàn bộ.** Source đã có lưu nháp bền vững; mở rộng offline cần cache riêng, thời điểm dữ liệu, giới hạn quyền và xử lý xung đột. Giao dịch tiền/kho vẫn phải được máy chủ kiểm tra và xác nhận. [Android: offline-first và xử lý xung đột](https://developer.android.com/topic/architecture/data-layer/offline-first).
- **Không đồng nhất không thấy crash trên một máy với giám sát production.** Android khuyến nghị kiểm tra các tính năng chính và theo dõi crash/ANR sau triển khai; Expo có hướng dẫn tích hợp Sentry. Lựa chọn dịch vụ cụ thể cần phù hợp nơi triển khai và chính sách dữ liệu. [Android core quality](https://developer.android.com/docs/quality-guidelines/core-app-quality), [Expo Sentry](https://docs.expo.dev/guides/using-sentry/).
- **Chọn cập nhật theo kênh phân phối thực tế.** Samsung hiện nhận APK cài trực tiếp. Play In-App Updates phụ thuộc Google Play và điều kiện tài khoản/chữ ký; không thể coi việc thêm SDK là tự cập nhật được APK hiện tại. Nếu dùng Expo Update, chỉ phát bản cập nhật tương thích native runtime; đổi native cần binary mới. [Google Play: kiểm thử và điều kiện cập nhật](https://developer.android.com/guide/playcore/in-app-updates/test), [Expo runtime versions](https://docs.expo.dev/eas-update/runtime-versions/).
- Phát hành từng nhóm giúp phát hiện vấn đề trước khi mở rộng; Expo hỗ trợ tăng tỷ lệ và quay lại bản kiểm soát. Đây là một lựa chọn triển khai, chưa phải cấu hình hiện có của Himoto. [Expo rollouts](https://docs.expo.dev/eas-update/rollouts/).

## Căn cứ trong repo

- `mobile/package.json`: chưa có dependencies giám sát lỗi tập trung, `expo-updates`, NetInfo hay LocalAuthentication.
- `mobile/app.json`, `mobile/app.config.cjs`: phiên bản/Firebase/cấu hình native hiện hành; chưa thấy cấu hình Update/runtime policy.
- `mobile/src/providers/session.tsx`: QueryClient RAM, kiểm tra lại phiên, xóa cache khi actor/quyền thay đổi.
- `mobile/src/app/(tabs)/account.tsx`: đổi mật khẩu, bản đang soạn, đối chiếu giao dịch, đăng xuất.
- `mobile/src/components/draft-work-list.tsx`, `mobile/src/lib/draft-work-feature.ts`: lưu/khôi phục bản đang soạn đã bật.
- `mobile/src/app/operations.tsx`: tìm hợp đồng theo biển số/SĐT trong luồng trả xe đã có.
- `docs/qa/2026-11-06-mobile-product-polish.md`: kết quả và giới hạn kiểm tra hiện tại.

Không có môi trường staging và tài khoản dịch vụ giám sát được xác nhận trong lượt rà soát này; không tự tạo dịch vụ, đổi hạ tầng hoặc gửi dữ liệu vận hành ra ngoài.
