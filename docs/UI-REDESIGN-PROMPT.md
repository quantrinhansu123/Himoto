# Prompt cải thiện giao diện HIMOTO

Sao chép nội dung bên dưới cho AI làm việc trong repository HIMOTO:

```text
Bạn là frontend engineer kiêm UI designer. Hãy trực tiếp cải thiện giao diện ứng dụng quản lý cho thuê xe HIMOTO hiện có, để nhìn chuyên nghiệp, nhất quán và dễ dùng khi xử lý nhiều dữ liệu. Chỉ thực hiện thay đổi liên quan đến giao diện.

Trước khi sửa, đọc AGENTS.md, docs/performance-loading.md và kiểm tra các trang/component hiện có. Dự án dùng Next.js App Router, React, TypeScript, CSS và lucide-react. Tiếp tục dùng stack, font và thư viện đang có.

Định hướng thiết kế:
- Phong cách phần mềm quản trị doanh nghiệp: gọn, rõ ràng, mật độ dữ liệu hợp lý. Giữ logo HIMOTO, sử dụng màu vàng thương hiệu có tiết chế trên nền trắng/xám trung tính; chữ đậm màu dễ đọc. Không dùng gradient trang trí, glassmorphism hoặc animation nặng.
- Chuẩn hóa màu sắc, cỡ chữ, khoảng cách, border, radius, shadow và kích thước control bằng CSS variables. Nội dung bảng/form đủ lớn để đọc, không lạm dụng chữ nhỏ. Mỗi màn hình có thứ bậc rõ giữa tiêu đề, thông tin phụ và hành động chính.
- Cải thiện sidebar, topbar, điều hướng đang chọn, tiêu đề trang, thanh tìm kiếm/bộ lọc, nút thao tác, bảng và phân trang. Phân biệt nút chính, phụ, thao tác nguy hiểm; icon nhất quán. Bảng dễ quét, số tiền căn phải, trạng thái có chữ và màu rõ ràng.
- Làm đồng bộ các màn hình xe, khách hàng, hợp đồng/VAT/Log, cơ sở, nhân sự, lịch trực và sổ quỹ. Giữ nguyên thông tin và chức năng đang có, không tạo số liệu hoặc card thống kê giả.
- Cải thiện bố cục form, tabs, dialog và màn hình chi tiết: nhóm thông tin rõ, label dễ đọc, thông báo lỗi tại đúng trường, vùng cuộn và các nút cuối form dễ sử dụng. Giữ thao tác bằng bàn phím, focus trap, Escape, label, role và aria attributes.
- Làm rõ trạng thái đang tải, đang làm mới, rỗng, lỗi và disabled dựa trên state sẵn có. Khi làm mới vẫn giữ dữ liệu đang hiển thị. Hỗ trợ reduced-motion và tương phản dễ đọc.
- Responsive ở desktop 1440px, tablet 768px, mobile 375px. Điều hướng và dialog không tràn màn hình; bảng rộng có vùng cuộn riêng; nút dễ bấm, bộ lọc xuống dòng hợp lý.

Phạm vi được sửa: src/styles/management.css, các stylesheet giao diện liên quan và phần JSX trình bày/className trong src/components/management/ và src/components/contracts/. Có thể chuẩn hóa thành component trình bày nhỏ khi thực sự cần. Giữ nguyên handler, hook, props dữ liệu, routes, tên trường và hành vi nghiệp vụ.

Ràng buộc bắt buộc:
- Không thay đổi API, SQL, schema/migration, xác thực/phân quyền, validation, tính tiền, trạng thái hợp đồng/xe/khách hàng, import/export Excel hoặc dữ liệu thực tế.
- Không sửa ManagementProvider, data-loader, repository, src/lib/management, src/lib/server, src/app/api, .env*, cấu hình triển khai hoặc dependencies. Không xóa/tạo lại ứng dụng.
- Giữ nguyên dynamic import, cache, request deduplication, tải theo trang/tab/cơ sở và làm mới từng danh mục. Không thêm fetch, effect tải dữ liệu, tải toàn bộ danh mục hoặc thư viện làm chậm ứng dụng.
- Không thay đổi ContractPrintDocument, mẫu Vue cũ, stylesheet bản in, nội dung pháp lý hay kích thước A4. Chỉ được cải thiện phần giao diện bao quanh preview nếu không ảnh hưởng tài liệu xuất/in.
- Không đổi nội dung nghiệp vụ hoặc bỏ tính năng để bố cục đẹp hơn. Nếu một thay đổi đòi sửa logic, ghi rõ và để ngoài phạm vi công việc này.
- Không đọc/in/chia sẻ secrets; không tạo dữ liệu nghiệp vụ thật để chụp ảnh kiểm tra. Không commit/push/deploy nếu chưa được yêu cầu.

Hãy triển khai giao diện đồng bộ, không chỉ đưa gợi ý. Sau khi sửa, chạy npm.cmd run lint:management, npm.cmd run typecheck, npm.cmd run build, npm.cmd run test:management-loading và npm.cmd run test:vehicles. Chạy hai script UI check-management-loading-ui.py và check-contract-layout-ui.py theo hướng dẫn QA của repo khi có phiên QA cục bộ; báo rõ nếu chưa chạy được. Chỉ cập nhật selector test nếu cấu trúc trình bày thay đổi, giữ nguyên assertion về hành vi và dữ liệu, không bỏ test để che lỗi.

Bàn giao danh sách file đã sửa, kết quả kiểm tra, ảnh trước/sau của bảng danh sách và form/chi tiết tiêu biểu tại 1440/768/375px; nêu rõ phần chưa kiểm chứng. Không gộp thay đổi ngoài giao diện.
```
