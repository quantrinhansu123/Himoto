# Đồng bộ mobile với web — 16/11/2026

## Mốc mã và phạm vi

`git pull --ff-only` trên `main` sạch: đã ở `b7c6699`. Đối chiếu các thay đổi web từ lần phát trước, gồm lịch sử/công theo ca, GPS, gia hạn nợ xấu sau thu hồi, ngày thu gia hạn và sửa thu khi trả xe. Mã sản phẩm đã đẩy: `ee8739e`, `d7e4169` (source OTA).

Các sửa lỗi giao dịch bổ sung, Excel theo bộ lọc, menu màn con, nhãn báo cáo ca và cuộn tránh bàn phím của đợt 14/11 tiếp tục nằm trong bản này; xem [biên bản trước](2026-11-14-mobile-web-parity.md). Đợt này không thay native dependency/config, runtime vẫn `1.0.11`, Android version code `12`.

## Thay đổi

- Tách trang Chấm công và Lịch sử chấm công. Trang vào/ra chỉ đọc summary nhẹ; lịch sử tải theo trang và bộ lọc. Bổ sung công chuẩn/công thực tế, phút về sớm, gộp cùng ca, khoảng cách GPS và cơ sở làm mốc theo domain web.
- Cho quản trị sửa giờ/xóa lượt từ lịch sử, dùng writer web và điều kiện phiên bản gốc. Giữ ảnh/GPS khi sửa giờ; không sửa được bản đã thay đổi. Nếu phản hồi thất bại, khóa gửi tiếp và yêu cầu tải lại đối chiếu. Không đổi quy trình ảnh/UUID và khôi phục chấm công offline.
- Excel chấm công cho quản trị dùng cùng handler, nhãn cột và định dạng thời gian web; snapshot đầy đủ theo bộ lọc, không giới hạn ở trang đang mở. Trên 50.000 lượt trả lỗi rõ ràng thay vì cắt kết quả.
- GPS hiện riêng Trạng thái xe. Ước tính quá hạn hiện ghi chú giá ngày tham chiếu; trường hợp đến hạn thanh toán dùng đúng số đến hạn, nợ xấu chỉ hiện phần nợ tương ứng.
- Bỏ chặn thu dư ở form hoàn tất hợp đồng để khớp writer web hiện tại. Hiển thị số thu dư và xác nhận số tiền thực thu; không tăng giá hợp đồng. Các thay đổi ngày thu, sửa giao dịch trả xe và gia hạn nợ xấu dùng chung domain web đã pull.

## Kiểm tra trước phát hành

- Web/mobile typecheck và lint: đạt. Mobile được chạy lại sau sửa nhãn quá hạn cuối cùng.
- `npm run test:release`: 55 suite đạt; `npm run test:mobile`: toàn bộ lệnh đạt.
- `check-mobile-finance-sql.cjs` với PGlite: 124 nhóm đạt. `check-attendance.cjs`: đạt (fixture/TEMP).
- `check-mobile-support.cjs`: kiểm tra writer vào/ra/UUID, công theo ca/GPS, quyền quản trị và CAS sửa/xóa, workbook đủ dòng/đúng nhãn, dữ liệu DTO sai bị từ chối.
- `check-mobile-sync-ui.py`: hai luồng 390px sáng, 430px tối trên Expo web export. Lịch sử hiện công/về sớm; tải đúng bytes workbook; lỗi phản hồi sửa chỉ gửi một PATCH rồi khóa và yêu cầu đối chiếu. Dùng fixture, không ghi nghiệp vụ production.
- Không chạy giả lập Android theo yêu cầu người dùng. Kiểm tra Samsung thực tế do người dùng thực hiện; kiểm tra trình duyệt không thay thế nghiệm thu bàn phím/native trên máy thật.

Log và artifact cục bộ nằm trong `.backups/mobile-sync-*20261116*` (không đưa dữ liệu/phiên QA vào Git).

## Production

Vercel source `d7e4169`: Ready, deployment `dpl_CBb952DrqTBqnjXr6NwLK3Gthm5g`. Kiểm tra public: 23 gate đạt. Kiểm tra xác thực bằng phiên QA ngắn hạn rồi xóa và xác nhận 401; không ghi nghiệp vụ, không tải ảnh, không gửi Telegram:

| Kiểm tra | Kết quả tại thời điểm đọc |
|---|---|
| Summary/lịch sử chấm công | 200; DTO có các chỉ số mới; 4 lượt |
| Excel chấm công với tài khoản không phải quản trị | 403 đúng quyền; nhánh quản trị được kiểm tra bằng fixture SQL |
| Excel hợp đồng nháp | 2/2 dòng |
| Excel hợp đồng quá hạn | 112/112 dòng |
| Excel báo cáo ca | 2/2 dòng, đối chiếu API web |
| Vị trí chấm công, đăng ký tuần, đăng ký HR | 200 |
| Excel ca làm việc | 7 dòng |
| Excel đăng ký 13–16/11 | 32 dòng, khớp bảng dữ liệu |

Đã đọc định nghĩa function production và xác nhận gia hạn nợ xấu sau thu hồi đã được cài, không mở lại kho. Không chạy migration.

## OTA đã phát

- Channel/branch: `production`; Android runtime: `1.0.11`.
- Source: `d7e4169c884d198beba1a134d16ecefe8722620a`.
- Update group: `eedac6ec-459d-4479-8d18-29ad173c744c`.
- Update ID: `01a1e305-6ee3-773f-8f9f-fc07f30dc8e8`, phát `2026-11-16T06:22:26.531Z`.
- Bundle: `entry-e7217d5725288595b6c55baa9cb82a49.hbc`, 8.914.265 bytes.
- SHA-256: `097192565baac5011d404b2de48db8ef70947af0451d21cd73463022f03bb721`.

Export từ source sạch, `EXPO_NO_DOTENV=1`, API production và cấu hình push Android hiện hữu. Đã kiểm tra URL API, loại endpoint fixture, đọc manifest kênh production, tải launch asset và đối chiếu bytes/SHA-256 với export. Runtime `1.0.9` vẫn nhận group cũ `71e7a3fd-35c9-45f9-9e2f-f8db5772614f`; không phát bundle cần native 1.0.11 cho máy cũ.

Máy đang dùng 1.0.11: Tài khoản → Kiểm tra bản cập nhật mới, hoặc để app tải nền rồi mở lại. Không tự reload form nhân viên đang nhập. Máy còn native 1.0.9 cần cài APK 1.0.11 trước khi nhận bản OTA này.
