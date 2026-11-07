# Himoto Android — rà soát sản phẩm 06/11/2026

## Thay đổi

- Màn Đội xe, Khách hàng và Hợp đồng giữ nút thêm hồ sơ chính nổi bật; các thao tác Excel, kho xe, lịch sử và xóa nhiều được gom vào **Thao tác khác**, đóng mặc định. Ô tìm kiếm và hồ sơ xuất hiện sớm hơn khi mở màn.
- Menu công bố trạng thái mở/đóng cho công cụ hỗ trợ tiếp cận; các nút giữ điều kiện phân quyền, trạng thái tải và bộ lọc hiện hành. Đóng menu không thay dữ liệu hoặc bộ lọc.
- `npm --prefix mobile run typecheck` tạo lại route bằng Expo CLI trước khi kiểm tra, kể cả checkout mới hoặc cache cũ; không đọc `.env.local`.
- Bộ nạp TypeScript của kiểm thử truyền đúng tên tệp để phân biệt `.ts` với `.tsx`. Đồng bộ các fixture SQL/browser liên quan với gói source release bàn giao đã kiểm tra; giữ bản gốc tại `.backups/mobile-product-review-20261106-run1/original-tests/`.

## Kiểm tra đã đạt

- Mobile typecheck và lint.
- `npm run test:mobile`: 35 bộ kiểm tra, 224 mục kiểm tra.
- PostgreSQL cô lập PGlite 0.5.14: 124 ca, gồm tính tiền, giao dịch nguyên tử, chống gửi trùng, khôi phục sau mất phản hồi, phạm vi cơ sở và hồ sơ ảnh.
- Browser UI: 39 ca trên 375×812, 430×932, 812×375 và 1024×768; sáng/tối, giảm chuyển động, tìm kiếm, lọc, phân quyền, lỗi mạng và quay lại.
- Nhập/xuất Excel khách hàng: 6 nhóm; Excel xe: 4 nhóm. Bao gồm mất phản hồi sau lưu, đối chiếu UUID gốc, xác nhận xóa và sao lưu trong fixture.
- Không phát sinh lỗi JavaScript trong các bộ UI đã đạt; không tạo giao dịch thử trên production.

## Samsung

Máy SM-N960N, release cũ 1.0.1 được đối chiếu đúng phiên bản và 449 tệp mobile/shared khớp gói bàn giao trước sửa.

Đo trước sửa, mỗi danh sách gồm 6 lần cuộn trên release:

| Danh sách | Khung hình | p95 | Khung hình khựng |
| --- | ---: | ---: | ---: |
| Đội xe | 491 | 15 ms | 2,65% |
| Khách hàng | 461 | 15 ms | 3,90% |
| Hợp đồng | 467 | 14 ms | 2,14% |

Không ghi nhận crash/ANR của Himoto trong lượt đo trước sửa.

Bản 1.0.2/versionCode 3 đã build thành công, đối chiếu đủ 450 tệp nguồn mobile/shared; chữ ký khớp bản trước, không debug, API production/Firebase đúng. APK SHA256 `e835a1ed9d1cf216ccc8910d51924eb54b72e4d622ed219d2e0c86a87e3bb7ff`.

Đã nâng cấp bằng `adb install -r --no-streaming`, không uninstall/clear hay đọc dữ liệu riêng; phiên đăng nhập vẫn hoạt động. Mở/đóng menu phụ và bộ lọc đạt ở cả ba danh sách; tìm kiếm với bàn phím, kết quả rỗng và xóa tìm kiếm khôi phục danh sách xe đạt. Điều hướng dưới vẫn dùng được; cuối lượt app trở về Tổng quan.

| Danh sách 1.0.2 | Thẻ thấy lúc mở | Thẻ thấy khi cuộn | Khung hình | p95 | Khung hình khựng |
| --- | ---: | ---: | ---: | ---: | ---: |
| Đội xe | 3 | 5 | 464 | 16 ms | 4,74% |
| Khách hàng | 3 | 5 | 459 | 17 ms | 5,88% |
| Hợp đồng | 2 | 5 | 462 | 15 ms | 2,81% |

Không ghi nhận crash/ANR của Himoto trong lượt nghiệm thu 1.0.2. Số đo trước/sau là hai lượt thao tác trên máy thật, không phải benchmark kiểm soát; không kết luận rằng thay menu làm tốc độ render tăng. Thay đổi UI giúp tìm kiếm và các hồ sơ xuất hiện sớm hơn.

Gói bàn giao: `.backups/mobile-product-polish-handoff-20261106/`. Không dùng lại kết quả quét thẻ/thông báo của 1.0.1 để gọi là đã quét/gửi lại trên 1.0.2; các phần đó giữ source và module native, lượt này tập trung thay đổi UI.

## Giới hạn

Các ca ghi nghiệp vụ chạy bằng dữ liệu tổng hợp trong PostgreSQL cô lập và browser fixture. Không thay thế nghiệm thu tải đồng thời nhiều phiên, khóa dòng/RLS trên DB triển khai hoặc xác minh toàn bộ nghiệp vụ thật trên máy Samsung. Các số đo cuộn phản ánh lượt đo trên máy này, không phải cam kết mọi thiết bị/mạng đều giống nhau.

Bằng chứng: `.backups/mobile-product-review-20261106-run1/` và `.backups/mobile-product-review-20261106-final/`.
