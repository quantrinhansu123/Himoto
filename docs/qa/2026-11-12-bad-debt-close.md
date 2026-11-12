# Đóng hợp đồng nợ xấu — 12/11/2026

## Phạm vi

Khách xác nhận Trả xe đã hoạt động, chỉ còn nghiệp vụ đóng hợp đồng. Bản sửa tập trung vào đóng nợ xấu trên web, gồm giao diện màn hình nhỏ và các dịch vụ backend dùng chung; giữ nguyên các luồng Trả xe/Gia hạn hiện có. Quyền đóng dựa trên tài khoản admin hiện tại, không gắn cứng tên/email/ID của chị Thủy. Không thay quyền tài khoản, công thức doanh thu thực thu hoặc nghiệp vụ hoàn thành bảo lưu.

## Hành vi

- Nhân sự trả/thu hồi xe hoặc xác nhận tất toán qua các luồng hiện có không tự đóng hợp đồng nợ xấu; admin kiểm soát việc đóng.
- Chỉ admin được `close_bad_debt`, được kiểm tra cả ở lớp HTTP lẫn dịch vụ. Cần trả/thu hồi đủ xe, revision hiện hành, ngày giờ hợp lệ và xác nhận đối chiếu. Không bắt buộc trả hết tiền hoặc hoàn hết cọc mới được đóng.
- Đóng chuyển hợp đồng sang `completed`, lưu `management_composer.lifecycle.bad_debt_closure` và sự kiện gồm actor, ngày thực tế, số tiền đối chiếu, request ID/hash. Giữ nguyên `orders.total`, `pid`, phiếu thu/chi, cọc và mốc dừng tính nợ. Không tạo phiếu tiền hoặc miễn nợ.
- Công nợ còn lại tiếp tục có trong thống kê hợp đồng, KPI doanh số và báo cáo nợ chậm/công nợ. Danh sách phân biệt "Đã đóng · còn công nợ". Thu thêm tiền qua nghiệp vụ hiện có làm giảm nợ thực tế; không đổi sự kiện đóng đã lưu.
- Gửi lại cùng request không đóng lần hai; đổi actor/nội dung với cùng request ID bị từ chối. Hợp đồng nợ xấu đã đóng không được gia hạn lại, kể cả qua nhập lịch sử.
- Form sửa hồ sơ/full edit không được đổi trạng thái hồ sơ nợ xấu để vượt luồng đóng. Hợp đồng đã đóng còn nợ/cọc/thu dư chưa xử lý không được ẩn, kể cả qua API xóa hàng loạt.
- Các lượt admin xác nhận tất toán đủ tiền vẫn giữ khả năng hoàn thành theo luồng hiện có; mọi đường tự đóng dùng chung đều kiểm tra admin. Thao tác đóng còn nợ mới được cung cấp trên web; giao thức native hiện có giữ nguyên tập thao tác.

## Kiểm chứng

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:release
npm.cmd run build
node scripts/check-bad-debt-close-postgres.cjs .backups/peak-20261112/staging/staging.json
python scripts/check-bad-debt-close-ui.py
```

- Release: 50 suite dùng fixture, chặn mạng ngoài; có regression mới cho quyền admin, chống đi vòng qua sửa trạng thái/ẩn, replay và bảo toàn công nợ.
- PostgreSQL: ba nhóm regression trên cluster QA riêng `127.0.0.1:55439`, schema thử và giao dịch rollback. Đối chiếu số tiền/phiếu thu trước-sau, quyền cơ sở, thống kê nhanh, phân trang công nợ, thu tiền sau đóng và mốc dừng lịch sở hữu. Không áp schema hoặc ghi dữ liệu production.
- Browser: Chromium 1440px và WebKit 390px, admin và nhân sự; kiểm tra nút theo quyền, chặn chưa đủ xe, hiển thị nợ/cọc, xác nhận, lỗi/retry, chặn ẩn khi còn nợ và thu hồi xe qua luồng hiện có. HTTP nghiệp vụ trong browser được mô phỏng; ghi chú ngoài phạm vi được trả bằng fixture trong trang để tránh lỗi hủy route của WebKit. Server chỉ kết nối DB QA và chặn mạng ngoài.
- Harness SQL lifecycle cũ dừng ở assertion bảo lưu `hold_can_resume` không khớp hành vi hiện tại. Không đổi nghiệp vụ bảo lưu để làm harness này đạt; các regression nợ xấu dùng suite PostgreSQL riêng nêu trên.

Bằng chứng riêng tư: `.backups/bad-debt-close-20261112/ui/`, gồm ảnh xác nhận admin, ảnh nhân sự trả xe và `results.json`. Không ghi dữ liệu nghiệp vụ production hoặc gửi Telegram thật.

## Đưa lên production

Không cần migration mới: metadata đóng nằm trong JSON nghiệp vụ hiện có. Deploy web/backend cùng nhau. Giữ nguyên metadata đóng và lịch dừng nợ khi rollback; bản ứng dụng cũ chưa đọc `bad_debt_closure` sẽ bỏ sót công nợ đã đóng.

Phát hành qua nhánh `main` của GitHub và deployment Production của Vercel. Xác minh đúng commit, trang đăng nhập và các GET chỉ đọc; không đóng hợp đồng, ghi phiếu tiền hoặc gửi thông báo thật để smoke test.
