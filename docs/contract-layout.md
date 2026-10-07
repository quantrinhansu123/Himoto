# Bố cục hợp đồng theo app cũ

Đối chiếu source [duanthuexe, commit 8fc737e](https://github.com/huybitvvt/duanthuexe/tree/8fc737e550b057e2318d06061848b62d5cee9b1e): `OrderUpdate.vue`, `ItemsOrder.vue`, `OrderShow.vue` và `ContractPrintDocument.vue`.

Form nhập/sửa chia thành năm tab: **Hợp đồng & pháp lý**, **Khách hàng**, **Phương tiện**, **Chi phí**, **Ký kết & ghi chú**. Đổi tên và vị trí các trường hiện có theo app cũ. Cửa hàng/tên/SĐT nằm đầu phần khách hàng; CCCD hiển thị riêng với ô tra cứu. Thông tin ngày cấp, nơi cấp, địa chỉ, người lái, GPLX, mũ và áo mưa nằm đúng nhóm. Tiền cọc và phí thuê tách riêng; tài sản thế chấp, người ký và ghi chú nằm ở phần cuối.

Các tab giữ dữ liệu khi chuyển phần. Bàn phím hỗ trợ mũi tên, Home/End, Tab và Escape. Kiểm tra lỗi trước khi in tự mở tab có trường cần sửa. Màn hình xem hiển thị từng xe riêng và chỉ dùng khoản tiền đã có trên hợp đồng; dữ liệu thiếu hiển thị `—`.

Bản in giữ nguyên template và nội dung app cũ, dùng Times New Roman, A4 ngang hai cột. CSS giao diện không tăng cỡ chữ/độ đậm trong mẫu in. Xem trước và iframe in dùng cùng định dạng; nhiều xe có trang phụ lục.

Phạm vi là bố cục các trường hiện có và mẫu in. Loại hợp đồng, điều kiện lưu nháp và thời gian thuê chung cho các xe giữ theo dữ liệu hiện tại. Không bổ sung luồng thu tiền, phát hành, upload ảnh bàn giao hay nghiệp vụ giám hộ/50cc của app cũ.

Kiểm tra: `npm.cmd run test:contracts`, `npm.cmd run test:drafts`, `npm.cmd run test:management`, typecheck, lint và build. Browser QA: `python scripts/check-contract-layout-ui.py --url http://127.0.0.1:3005 --session-cookie-file <file-session-cục-bộ>`; mọi API nghiệp vụ được giả lập. Kết quả, ảnh và PDF tại `docs/qa/contract-layout/`. Không ghi dữ liệu vận hành thật.
