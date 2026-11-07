# CF-05a — thứ tự lưu ảnh hợp đồng theo web, 03/11/2026

## Phạm vi và nguồn đối chiếu

Web `src/components/contracts/ContractComposer.tsx:836` lưu ảnh khách, biển số
của xe được chọn, GPLX, transaction media rồi copy giấy tờ khách. Native trước
đây duyệt theo lượt chọn, nên chọn ảnh ký trước GPLX làm đổi thứ tự ghi khi lỗi.

`shared/mobile-contract-photo-order.ts` tính nhóm từ slot đã validate, không
tin phase do client lưu. Giữ thứ tự trong mỗi nhóm, bỏ qua ảnh đã có phiếu trên
đúng hợp đồng; không gửi lại hoặc rollback ảnh cũ để thay lịch sử. Ảnh chưa gắn
xe/xe không còn chọn, slot sai, video chưa hỗ trợ hoặc savedTo khác hợp đồng
chặn toàn bộ queue trước khi gửi ảnh. Metadata vẫn được lưu một lần; copy vẫn
ở sau ảnh. Không đổi API/domain web/migration hay thêm dependency.

`ContractPhotoSave` dùng cùng thứ tự khi tải ô ảnh, hiển thị và gửi; review lỗi
không để nút lưu dùng lại dữ liệu đã tải cũ. CF-05d lưu bền vững chưa triển khai.

## Bằng chứng đã có

- Mobile `npm run typecheck`, `npm run lint`: exit0; `EXPO_NO_DOTENV=1`.
- `node scripts/check-mobile-contract-photos.cjs --pglite-path
  .backups/mobile-sql-qa/node_modules/@electric-sql/pglite`: 6 nhóm đạt; gồm
  thứ tự customer/plate/GPLX/transaction, giữ thứ tự nội bộ, phase giả, receipt
  cũ, xe bị bỏ, slot sai, OCR/auth/RLS/CAS/rollback/legacy draft.
- `python scripts/check-mobile-contract-photos-fixture.py`: 3 nhóm journal đạt.
- Export web/Android/iOS thành công ở
  `mobile/.expo/contract-photo-order-verified-qa-20261103`; URL được đặt rõ
  `EXPO_PUBLIC_API_URL=https://mobile-api.example.invalid`, không đọc env file.
- Browser `.backups/mobile-contract-photo-order-ui-20261103-run3/results.json`:
  4/4, 0 page errors/unexpected hosts. Chọn signed1/signed2 trước GPLX/GPLX2;
  ghi plate303 → plate304 → GPLX (mất phản hồi) → đối chiếu phiếu → GPLX2 →
  signed1 (drop/tombstone/late409) → chỉ gửi signed1/signed2 còn lại. Hợp đồng
  đầu chỉ có một metadata ID, giữ nguyên hai xe/driver/mũ/tiền. Ca thứ hai kiểm
  OCR lỗi/manual bind/mất phản hồi metadata/ảnh drop. Tổng2nháp/7ảnh/2tombstone,
  cuối0session; chỉ dữ liệu mô hình QA.

Lượt browser1 dừng ở cấu hình chưa có API URL, trước login/ghi. Lượt browser2
dừng do assertion đọc count khi lượt gửi còn chạy; giữ nguyên kết quả fail,
không gộp vào pass. `terminal-observation.json` của run2 chứng minh3phiếu đã
commit đúng plate303/304/GPLX, không delayed request,0session và checkpoint
SHA không đổi. Context browser đó đã đóng; không có ledger native bị xóa.

## Android và giới hạn

Samsung SM-N960N/API28 đạt3/3 liên tục, hoàn tất08:25:24 ngày03/11:
`.backups/mobile-contract-photo-order-native-20261103-run1/results.json`;
fixture8125 giữ checkpoint riêng
`.backups/mobile-contract-photo-order-fixture-20261103-run1/state.json`.
237 file source khớp trước/sau; APK SHA/provenance và diagnostics lưu cùng run;
0 app crash/ANR/SystemUI ANR. Chọn signed trước GPLX/GPLX2, server commit đúng
plate303 → GPLX → GPLX2 → signed; lost GPLX đối chiếu phiếu, signed drop được
tombstone trước late409 rồi gửi phần còn thiếu. Cuối1nháp/4ảnh/1tombstone,
0session/ledger rỗng; giữ đúng2xe/driver/mũ/1.250.000đ. Cả4 JPEG native decode
2200×1467/80.971byte từ ảnh4200×2800, SHA khớp phiếu. Baseline checkpoint cũ
không đổi và USB8081→8081/8091→8101 được restore; không có reset hoặc ghi thử
vận hành. Screenshot03 bắt lúc resolver còn render loading; terminal được
kiểm bằng ledger/session/count/source proof, không suy từ screenshot đó.

Chưa chứng nhận durable draft/queue, camera/HEIC/video, toàn bộ quyền và
staging/nhiều phiên, signed iPhone/release/vận hành hoặc100%web. Export iOS
không thay nghiệm thu iPhone thật.

## Bản Android để theo dõi sau nghiệm thu

Android đã mở lại08:27 tại HĐ QA cũ → Ảnh và hồ sơ nghiệp vụ; runtime
`.backups/mobile-android-watch-photo-order-20261103-run1/runtime.json`.
237 file khớp, ledger rỗng, USB8081/8091→8101 giữ để theo dõi. Restart giữ exact
SHA/generation/digest; sau mở chỉ sessions/sessionSeq đổi (9 phiên QA đang lưu
chủ ý), giữ1khách/1nháp/0ảnh/0copy/0delete. Không seed/reset hoặc ghi nghiệp vụ;
đây là QA, chưa kết nối dữ liệu vận hành. Native runner/reader đã kết thúc.

