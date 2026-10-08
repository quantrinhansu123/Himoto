# Lịch trực cơ sở

Cập nhật 08/10/2026. Menu **Lịch trực cơ sở** mở `/duty-roster`, tuần từ thứ Hai đến Chủ nhật theo giờ Việt Nam. Có Tuần trước/Tuần sau/Tuần này, chọn ngày trong tuần và lọc cơ sở/nhân viên. Máy tính có bảy cột; điện thoại xếp từng ngày để đọc và thao tác.

**Thêm ca trực:** chọn cơ sở đang hoạt động, nhân viên đang làm việc, ngày giờ bắt đầu/kết thúc, tên ca, vai trò và ghi chú. Ca tối đa 24 giờ, được qua đêm và xuất hiện ở cả hai ngày. Nhân viên được phân sang cơ sở khác mà không đổi `staff_profiles.store_id`.

**Sửa/Xóa:** dùng phiên bản `xmin` để chặn ghi đè ca đã đổi. Xóa có hộp xác nhận, lưu `deleted_at`/`updated_by`, không xóa vật lý. Lỗi hoặc mất phản hồi không báo thành công; yêu cầu làm mới lịch để kiểm tra trước khi thao tác tiếp. Mỗi lần tạo có UUID và hash nội dung chống tạo hai lần khi cùng yêu cầu được gửi lại.

API `/api/auth/duty-roster` GET/POST và `/api/auth/duty-roster/[id]` PATCH/DELETE bảo vệ bằng phiên admin hiện hữu; ghi kiểm tra cùng nguồn. Tên/điện thoại nhân viên và người thực hiện lấy ở server. Không nhận tên nhân viên hoặc actor từ trình duyệt. Khóa bảng lịch trong transaction để kiểm tra trùng giờ và ghi cùng lúc; hai ca tiếp giáp được phép. Cùng nhân viên trùng giờ tại bất kỳ cơ sở nào bị chặn. Ca cũ chưa có giờ được giữ nguyên và chặn phân trùng ngày của nhân viên đó.

Migration [2026-10-08-duty-roster.sql](sql/2026-10-08-duty-roster.sql) mở rộng bảng legacy `store_duty_schedules` với giờ bắt đầu/kết thúc, dấu xóa, người sửa, UUID/hash lần tạo; constraint giờ hợp lệ và index. Bật RLS, thu hồi quyền anon/authenticated. Không nhập ca thật hoặc sửa hồ sơ nhân viên/cơ sở khi triển khai.

Kiểm chứng: `npm.cmd run test:duty-roster`, `node scripts/check-duty-roster.cjs --live-temp` có 6 nhóm; `python scripts/check-duty-roster-ui.py --session-cookie-file <cookie-file>` có 6 nhóm UI. TEMP có identity riêng trước INSERT và outer ROLLBACK; mọi `/api/**` của browser được giả lập. Bao gồm ca qua đêm, trùng giờ xuyên cơ sở, đổi tuần/lọc, thêm/sửa/xóa, revision lỗi, mất mạng, GET lỗi và 1440/375px. Ảnh/kết quả [QA lịch trực](qa/duty-roster/results.json) dùng dữ liệu tổng hợp.
