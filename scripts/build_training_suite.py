# -*- coding: utf-8 -*-
"""
Himoto Android 1.0.4 - Full 8-Clip Training Video Generation Pipeline.
Automates Vietnamese AI Voiceover, Subtitles (.srt), ADB Phone Actions,
Screen Recording, and FFmpeg Assembly into crisp MP4 handover videos.
"""

import os
import re
import sys
import time
import shutil
import subprocess
from gtts import gTTS

ROOT_DIR = r"E:\Himoto"
VIDEOS_DIR = os.path.join(ROOT_DIR, "videos", "training-1.0.4")
SCRIPTS_DIR = os.path.join(VIDEOS_DIR, "scripts")
AUDIO_DIR = os.path.join(VIDEOS_DIR, "audio")
REC_DIR = os.path.join(VIDEOS_DIR, "recordings")
DIST_DIR = os.path.join(VIDEOS_DIR, "dist")
TEMP_DIR = os.path.join(VIDEOS_DIR, "temp")

ADB = r"E:\Android\Sdk\platform-tools\adb.exe"
DEVICE = "282a05859f3f7ece"
FFMPEG = r"E:\backup\daotaonhansukama\node_modules\ffmpeg-static\ffmpeg.exe"

os.makedirs(SCRIPTS_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(REC_DIR, exist_ok=True)
os.makedirs(DIST_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)

CLIPS_DATA = [
    {
        "id": 1,
        "filename": "Clip_01_Dang_Nhap_Va_Bao_Mat",
        "title": "Clip 01: Đăng nhập & Bảo mật sinh trắc học",
        "sentences": [
            "Chào mừng quý khách đến với video hướng dẫn sử dụng ứng dụng Himoto phiên bản một chấm không chấm bốn.",
            "Trong video này, chúng ta sẽ tìm hiểu quy trình đăng nhập và thiết lập bảo mật cho tài khoản nhân viên cơ sở.",
            "Đầu tiên, mở ứng dụng Himoto trên điện thoại, đăng nhập tài khoản nhân viên được cấp để vào hệ thống.",
            "Hệ thống sẽ tự động xác thực và nhận diện cơ sở làm việc, ví dụ như Cơ sở Hàng Bút hoặc Nguyễn Hoàng.",
            "Tại thanh điều hướng bên dưới, chạm vào tab Tài khoản để kiểm tra thông tin cá nhân và vai trò được phân quyền.",
            "Mục Duy trì đăng nhập cho phép lưu phiên làm việc an toàn đến ba mươi ngày, không bị đăng xuất bất ngờ.",
            "Anh chị có thể bấm Đổi mật khẩu của mình để cập nhật mật khẩu mới định kỳ, đảm bảo an toàn thông tin.",
            "Ngoài ra, anh chị có thể kích hoạt tính năng Đăng nhập bằng sinh trắc học vân tay hoặc khuôn mặt.",
            "Trong các lần mở ứng dụng tiếp theo, chỉ cần chạm nhẹ vân tay là có thể vào ngay màn hình làm việc.",
            "Như vậy, anh chị đã nắm rõ cách đăng nhập và thiết lập bảo mật an toàn cho tài khoản Himoto."
        ],
        "adb_actions": [
            {"delay": 2, "action": "tap", "x": 108, "y": 2109, "desc": "Tap Overview"},
            {"delay": 4, "action": "swipe", "x1": 540, "y1": 600, "x2": 540, "y2": 1600, "duration": 400, "desc": "Pull to refresh"},
            {"delay": 5, "action": "tap", "x": 972, "y": 2109, "desc": "Tap Account tab"},
            {"delay": 6, "action": "swipe", "x1": 540, "y1": 1700, "x2": 540, "y2": 900, "duration": 500, "desc": "Scroll down Account"},
            {"delay": 5, "action": "swipe", "x1": 540, "y1": 900, "x2": 540, "y2": 1700, "duration": 500, "desc": "Scroll up Account"},
            {"delay": 4, "action": "tap", "x": 108, "y": 2109, "desc": "Back to Overview"}
        ]
    },
    {
        "id": 2,
        "filename": "Clip_02_Cham_Cong_GPS_Va_Khuon_Mat",
        "title": "Clip 02: Chấm công vào ra ca theo GPS",
        "sentences": [
            "Video thứ hai hướng dẫn nghiệp vụ Chấm công vào ca và ra ca theo định vị GPS trên phiên bản một chấm không chấm bốn.",
            "Đầu ca trực, nhân viên cần thực hiện chấm công đúng giờ để hệ thống ghi nhận lịch trực và tính công minh bạch.",
            "Từ màn hình chính, chạm vào tab Tài khoản ở góc phải bên dưới, sau đó chọn Chấm công vào ra ca.",
            "Màn hình Chấm công tích hợp ba lớp kiểm tra bảo mật: kết nối mạng, định vị GPS chuẩn cơ sở và chụp ảnh chân dung.",
            "Anh chị bấm chọn Ca làm việc phù hợp, theo danh mục bảy ca chuẩn như Ca sáng, Ca chiều, Ca tối hoặc Ca hành chính.",
            "Tiếp theo, bấm Chụp ảnh xác thực để camera ghi nhận khuôn mặt nhân viên trực tiếp tại quầy cơ sở.",
            "Sau khi kiểm tra thông tin ca và tọa độ GPS chuẩn xác, bấm nút Vào ca để bắt đầu ca làm việc.",
            "Hệ thống tự động đồng bộ giờ vào ca theo máy chủ thời gian thực, có cơ chế chống gian lận và chống ghi đè.",
            "Phía dưới màn hình là Lịch sử chấm công, anh chị có thể tra cứu lại các ca làm việc của mình theo từng khoảng ngày.",
            "Hết ca làm việc, anh chị vào lại màn hình này và bấm Kết thúc ca để hoàn thành việc giao ca."
        ],
        "adb_actions": [
            {"delay": 2, "action": "tap", "x": 972, "y": 2109, "desc": "Tap Account tab"},
            {"delay": 4, "action": "tap", "x": 540, "y": 1600, "desc": "Tap Cham cong"},
            {"delay": 6, "action": "swipe", "x1": 540, "y1": 1600, "x2": 540, "y2": 900, "duration": 500, "desc": "Scroll down Cham cong"},
            {"delay": 5, "action": "swipe", "x1": 540, "y1": 900, "x2": 540, "y2": 1600, "duration": 500, "desc": "Scroll up Cham cong"},
            {"delay": 4, "action": "key", "code": 4, "desc": "Back to Account"},
            {"delay": 2, "action": "tap", "x": 108, "y": 2109, "desc": "Back to Overview"}
        ]
    },
    {
        "id": 3,
        "filename": "Clip_03_Quan_Ly_Khach_Hang_Quet_QR",
        "title": "Clip 03: Quản lý khách hàng & Quét QR Căn cước",
        "sentences": [
            "Video thứ ba hướng dẫn quản lý hồ sơ khách hàng và tính năng Quét mã QR thẻ Căn cước công dân cực kỳ tiện lợi.",
            "Tại thanh điều hướng bên dưới, chạm vào tab Khách hàng để mở danh bạ khách thuê xe của cơ sở.",
            "Phía trên danh sách là ô tìm kiếm nhanh, anh chị có thể gõ tên hoặc số điện thoại để tìm lại hồ sơ cũ trong tích tắc.",
            "Các nút bộ lọc phân loại khách hàng gồm: Tất cả, Bình thường, Cần lưu ý, và Danh sách cảnh báo nợ xấu.",
            "Chạm vào một khách hàng bất kỳ để xem lịch sử thuê xe, số điện thoại liên hệ và giấy tờ tùy thân đã lưu.",
            "Khi có khách mới đến thuê xe, anh chị chạm vào biểu tượng Quét mã QR trên màn hình.",
            "Đưa camera quét mã QR trên thẻ Căn cước công dân, hệ thống sẽ tự động trích xuất họ tên, số căn cước và địa chỉ thường trú.",
            "Anh chị chỉ cần điền thêm số điện thoại liên hệ, chụp ảnh mặt trước mặt sau thẻ căn cước và bấm Lưu hồ sơ.",
            "Hồ sơ khách hàng mới đã sẵn sàng để lập hợp đồng thuê xe chỉ trong chưa đầy một phút."
        ],
        "adb_actions": [
            {"delay": 2, "action": "tap", "x": 756, "y": 2109, "desc": "Tap Khach hang tab"},
            {"delay": 4, "action": "tap", "x": 420, "y": 420, "desc": "Tap filter Binh thuong"},
            {"delay": 3, "action": "tap", "x": 620, "y": 420, "desc": "Tap filter Can luu y"},
            {"delay": 3, "action": "tap", "x": 840, "y": 420, "desc": "Tap filter Canh bao"},
            {"delay": 3, "action": "tap", "x": 160, "y": 420, "desc": "Tap filter Tat ca"},
            {"delay": 4, "action": "swipe", "x1": 540, "y1": 1500, "x2": 540, "y2": 700, "duration": 500, "desc": "Scroll down Customers"},
            {"delay": 4, "action": "swipe", "x1": 540, "y1": 700, "x2": 540, "y2": 1500, "duration": 500, "desc": "Scroll up Customers"},
            {"delay": 3, "action": "tap", "x": 108, "y": 2109, "desc": "Back to Overview"}
        ]
    },
    {
        "id": 4,
        "filename": "Clip_04_Quan_Ly_Doi_Xe_Va_Dieu_Chuyen",
        "title": "Clip 04: Quản lý Đội xe, Định vị & Điều chuyển",
        "sentences": [
            "Video thứ tư hướng dẫn cách quản lý Đội xe, kiểm tra định vị GPS và thực hiện Điều chuyển xe giữa các cơ sở.",
            "Chạm vào tab Đội xe trên thanh điều hướng để xem toàn bộ danh sách phương tiện thuộc cơ sở quản lý.",
            "Mỗi xe đều hiển thị đầy đủ thông tin: biển số, dòng xe, trạng thái Lưu kho, Đang thuê hoặc Chờ luân chuyển.",
            "Để tìm nhanh các xe sẵn sàng cho thuê ngay, anh chị bấm vào bộ lọc Lưu kho ở hàng trên cùng.",
            "Chạm vào một xe bất kỳ để xem chi tiết: số khung số máy, tình trạng pin, bình ắc quy và định vị GPS thực tế trên bản đồ.",
            "Khi cần điều chuyển xe sang cơ sở khác hoặc chuyển về Trụ sở chính, bấm nút Chuyển xe.",
            "Chọn cơ sở nhận, điền ghi chú tình trạng và chụp ảnh kiểm tra xe trước khi xuất phát, sau đó bấm Xác nhận chuyển xe.",
            "Lệnh điều chuyển sẽ lập tức cập nhật trạng thái xe và tự động gửi thông báo chi tiết vào nhóm Telegram của hai cơ sở.",
            "Khi xe đến nơi, nhân viên cơ sở nhận chỉ cần bấm Nhận xe để xe về kho sẵn sàng phục vụ khách hàng."
        ],
        "adb_actions": [
            {"delay": 2, "action": "tap", "x": 324, "y": 2109, "desc": "Tap Doi xe tab"},
            {"delay": 4, "action": "tap", "x": 280, "y": 420, "desc": "Tap filter Luu kho"},
            {"delay": 4, "action": "tap", "x": 500, "y": 420, "desc": "Tap filter Dang thue"},
            {"delay": 3, "action": "tap", "x": 800, "y": 420, "desc": "Tap filter Cho luan chuyen"},
            {"delay": 3, "action": "tap", "x": 120, "y": 420, "desc": "Tap filter Tat ca"},
            {"delay": 4, "action": "swipe", "x1": 540, "y1": 1500, "x2": 540, "y2": 700, "duration": 500, "desc": "Scroll down Vehicles"},
            {"delay": 4, "action": "swipe", "x1": 540, "y1": 700, "x2": 540, "y2": 1500, "duration": 500, "desc": "Scroll up Vehicles"},
            {"delay": 3, "action": "tap", "x": 108, "y": 2109, "desc": "Back to Overview"}
        ]
    },
    {
        "id": 5,
        "filename": "Clip_05_Lap_Hop_Dong_Giao_Xe_Thu_Tien",
        "title": "Clip 05: Lập hợp đồng, Bàn giao xe & Thu tiền",
        "sentences": [
            "Video thứ năm hướng dẫn quy trình cốt lõi tại cửa hàng: Lập hợp đồng thuê xe mới, bàn giao xe và thu tiền thanh toán.",
            "Từ thanh điều hướng bên dưới, chạm vào tab Hợp đồng để xem danh sách các hợp đồng đang thực hiện.",
            "Các bộ lọc nhanh cho phép phân loại hợp đồng Đang thuê, Quá hạn và Bản nháp đang soạn dở.",
            "Để tạo hợp đồng mới, bấm Tạo hợp đồng. Bước một: chọn loại hình thuê theo ngày, theo tuần, thuê tháng hoặc thuê sở hữu.",
            "Bước hai: chọn khách hàng từ danh bạ đã lưu hoặc quét nhanh thẻ căn cước công dân của khách.",
            "Bước ba: chọn xe bàn giao từ danh sách xe sẵn sàng trong kho của cơ sở.",
            "Bước bốn: thiết lập thời gian thuê, tiền đặt cọc và đơn giá thuê. Hệ thống sẽ tự động tính tổng tiền cần thanh toán.",
            "Bước năm: chụp bộ ảnh biên bản bàn giao xe gồm bốn góc xe, đồng hồ công-tơ-mét, mức pin và phụ kiện đi kèm.",
            "Cuối cùng, chọn hình thức thanh toán Tiền mặt hoặc Chuyển khoản qua mã VietQR thông minh.",
            "Sau khi xác nhận thu tiền, hợp đồng được phát hành thành công và đồng bộ dữ liệu tới toàn hệ thống."
        ],
        "adb_actions": [
            {"delay": 2, "action": "tap", "x": 540, "y": 2109, "desc": "Tap Hop dong tab"},
            {"delay": 4, "action": "tap", "x": 300, "y": 420, "desc": "Tap filter Dang thue"},
            {"delay": 4, "action": "tap", "x": 560, "y": 420, "desc": "Tap filter Qua han"},
            {"delay": 3, "action": "tap", "x": 800, "y": 420, "desc": "Tap filter Ban nhap"},
            {"delay": 3, "action": "tap", "x": 120, "y": 420, "desc": "Tap filter Tat ca"},
            {"delay": 4, "action": "swipe", "x1": 540, "y1": 1500, "x2": 540, "y2": 700, "duration": 500, "desc": "Scroll down Contracts"},
            {"delay": 4, "action": "swipe", "x1": 540, "y1": 700, "x2": 540, "y2": 1500, "duration": 500, "desc": "Scroll up Contracts"},
            {"delay": 3, "action": "tap", "x": 108, "y": 2109, "desc": "Back to Overview"}
        ]
    },
    {
        "id": 6,
        "filename": "Clip_06_Gia_Han_Doi_Xe_Va_Tra_Xe",
        "title": "Clip 06: Gia hạn hợp đồng, Đổi xe & Trả xe",
        "sentences": [
            "Video thứ sáu hướng dẫn ba thao tác thường gặp trong kỳ thuê: Gia hạn hợp đồng, Đổi xe và Trả xe kết thúc hợp đồng.",
            "Thao tác thứ nhất là Gia hạn: Khi khách muốn thuê thêm ngày, mở hợp đồng của khách và bấm nút Gia hạn.",
            "Nhập số ngày gia hạn mới, hệ thống tự động tính số tiền cần thu thêm. Thu tiền và bấm Xác nhận gia hạn để kéo dài hạn trả xe.",
            "Thao tác thứ hai là Đổi xe: Khi xe gặp sự cố hoặc khách muốn đổi sang dòng xe khác, bấm nút Đổi xe trên hợp đồng.",
            "Chọn xe thay thế có sẵn trong kho, ghi lại số công tơ mét xe cũ và xe mới, chụp ảnh biên bản đổi xe và bấm Xác nhận.",
            "Hệ thống sẽ tự động cập nhật xe mới vào hợp đồng hiện tại mà không làm gián đoạn kỳ thuê của khách.",
            "Thao tác thứ ba là Trả xe: Khi khách mang xe về trả, chọn nút Trả xe trên hợp đồng.",
            "Kiểm tra tình trạng xe thực tế, chốt công tơ mét, nếu có phát sinh quá giờ hoặc hư hại thì nhập phí bổ sung.",
            "Hệ thống tự động cấn trừ tiền cọc, tính số tiền hoàn trả cho khách hoặc số tiền khách cần thanh toán thêm.",
            "Bấm Hoàn tất trả xe. Chiếc xe lập tức được đưa về trạng thái Lưu kho để sẵn sàng phục vụ lượt thuê tiếp theo."
        ],
        "adb_actions": [
            {"delay": 2, "action": "tap", "x": 540, "y": 2109, "desc": "Tap Hop dong tab"},
            {"delay": 4, "action": "tap", "x": 300, "y": 420, "desc": "Tap filter Dang thue"},
            {"delay": 4, "action": "swipe", "x1": 540, "y1": 1500, "x2": 540, "y2": 700, "duration": 500, "desc": "Scroll down active contracts"},
            {"delay": 4, "action": "swipe", "x1": 540, "y1": 700, "x2": 540, "y2": 1500, "duration": 500, "desc": "Scroll up active contracts"},
            {"delay": 4, "action": "tap", "x": 120, "y": 420, "desc": "Tap filter Tat ca"},
            {"delay": 3, "action": "tap", "x": 108, "y": 2109, "desc": "Back to Overview"}
        ]
    },
    {
        "id": 7,
        "filename": "Clip_07_Tro_Ly_AI_Va_Huong_Dan_SOP",
        "title": "Clip 07: Trợ lý AI Gemini & Hướng dẫn SOP chuẩn",
        "sentences": [
            "Video thứ bảy giới thiệu tính năng Hướng dẫn chuẩn hóa SOP và Trợ lý ảo AI Gemini thông minh trên phiên bản một chấm không chấm bốn.",
            "Để mở tài liệu hướng dẫn nghiệp vụ, vào tab Tài khoản và chọn Hướng dẫn và hỏi đáp.",
            "Mục Hướng dẫn trình bày trực quan Quy trình SOP sáu bước chuẩn hóa khi lập hợp đồng thuê xe mới.",
            "Bao gồm: chọn loại hợp đồng, nhập căn cước công dân, chọn xe, bàn giao xe kèm ảnh chụp và thanh toán hợp đồng.",
            "Mỗi bước đều có hình ảnh minh họa thực tế cùng các lưu ý kiểm tra quan trọng giúp nhân viên không bỏ sót thao tác.",
            "Mục Hỏi đáp tổng hợp các câu hỏi xử lý tình huống thường gặp nhất tại cơ sở, như quy định tiền cọc hay xử lý sự cố trên đường.",
            "Đặc biệt, anh chị có thể trò chuyện trực tiếp với Trợ lý AI Gemini ngay trên ứng dụng.",
            "Gõ bất kỳ câu hỏi thắc mắc nào về chính sách công ty, trợ lý AI sẽ giải đáp ngay lập tức theo đúng quy định chuẩn.",
            "Đây là công cụ hỗ trợ đắc lực giúp nhân viên mới nhanh chóng làm quen và tự tin xử lý mọi nghiệp vụ tại cửa hàng."
        ],
        "adb_actions": [
            {"delay": 2, "action": "tap", "x": 972, "y": 2109, "desc": "Tap Account tab"},
            {"delay": 4, "action": "tap", "x": 540, "y": 1785, "desc": "Tap Huong dan va hoi dap"},
            {"delay": 5, "action": "swipe", "x1": 540, "y1": 1600, "x2": 540, "y2": 800, "duration": 500, "desc": "Scroll SOP step 1 to 3"},
            {"delay": 5, "action": "swipe", "x1": 540, "y1": 1600, "x2": 540, "y2": 800, "duration": 500, "desc": "Scroll SOP step 4 to 6"},
            {"delay": 4, "action": "tap", "x": 750, "y": 300, "desc": "Tap Hoi dap FAQ tab"},
            {"delay": 4, "action": "swipe", "x1": 540, "y1": 1400, "x2": 540, "y2": 800, "duration": 500, "desc": "Scroll FAQ items"},
            {"delay": 3, "action": "key", "code": 4, "desc": "Back to Account"},
            {"delay": 2, "action": "tap", "x": 108, "y": 2109, "desc": "Back to Overview"}
        ]
    },
    {
        "id": 8,
        "filename": "Clip_08_Van_Hanh_Ngoai_Tuyen_Dong_Bo_Nen",
        "title": "Clip 08: Vận hành ngoại tuyến & Đồng bộ nền",
        "sentences": [
            "Video cuối cùng trong bộ hướng dẫn sẽ giới thiệu về Chế độ vận hành ngoại tuyến và Cơ chế đồng bộ dữ liệu nền của Himoto.",
            "Ứng dụng Himoto một chấm không chấm bốn được trang bị cơ sở dữ liệu SQLite mã hóa an toàn trực tiếp trên điện thoại.",
            "Khi gặp sự cố mất mạng Wi-Fi hoặc 4G, ứng dụng hiển thị thông báo ngoại tuyến nhưng tuyệt đối không bị đơ hoặc văng ứng dụng.",
            "Anh chị vẫn có thể mở danh sách xe, danh bạ khách hàng và tra cứu các hợp đồng đã xem trước đó một cách mượt mà.",
            "Các thao tác tạo bản nháp hoặc ghi nhận sự kiện lúc mất mạng sẽ được lưu an toàn trong bộ nhớ máy.",
            "Ngay khi điện thoại có kết nối mạng trở lại, tiến trình đồng bộ nền WorkManager sẽ tự động gửi toàn bộ dữ liệu lên máy chủ.",
            "Mọi thông tin được cập nhật chính xác và an toàn tuyệt đối mà nhân viên không cần phải nhập lại từ đầu.",
            "Cảm ơn quý khách đã theo dõi trọn bộ tám video hướng dẫn sử dụng ứng dụng Himoto phiên bản một chấm không chấm bốn.",
            "Chúc quý khách và đội ngũ nhân viên vận hành hệ thống hiệu quả, an toàn và thành công."
        ],
        "adb_actions": [
            {"delay": 2, "action": "tap", "x": 108, "y": 2109, "desc": "Tap Overview"},
            {"delay": 4, "action": "swipe", "x1": 540, "y1": 600, "x2": 540, "y2": 1600, "duration": 500, "desc": "Pull to refresh Overview"},
            {"delay": 4, "action": "tap", "x": 324, "y": 2109, "desc": "Inspect Vehicles list offline/cache"},
            {"delay": 4, "action": "tap", "x": 540, "y": 2109, "desc": "Inspect Contracts list offline/cache"},
            {"delay": 4, "action": "tap", "x": 756, "y": 2109, "desc": "Inspect Customers list offline/cache"},
            {"delay": 4, "action": "tap", "x": 108, "y": 2109, "desc": "Return to Overview"}
        ]
    }
]

def format_timestamp(seconds):
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds - int(seconds)) * 1000)
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{millis:03d}"

def get_audio_duration(file_path):
    cmd = [FFMPEG, "-i", file_path]
    res = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", res.stderr)
    if match:
        h, m, s = match.groups()
        return int(h) * 3600 + int(m) * 60 + float(s)
    return 3.0

def generate_clip_audio_and_subtitles(clip):
    print(f"\n[Clip {clip['id']}] Generating Audio and Subtitles: {clip['title']}...")
    mp3_out = os.path.join(AUDIO_DIR, f"{clip['filename']}.mp3")
    srt_out = os.path.join(AUDIO_DIR, f"{clip['filename']}.srt")
    txt_out = os.path.join(SCRIPTS_DIR, f"{clip['filename']}.txt")

    # Save full script text
    with open(txt_out, "w", encoding="utf-8") as f:
        f.write(f"{clip['title']}\n\n")
        f.write("\n\n".join(clip["sentences"]))

    chunk_files = []
    srt_entries = []
    current_time = 0.5  # Start with 0.5s pre-delay

    for i, sentence in enumerate(clip["sentences"]):
        chunk_path = os.path.join(TEMP_DIR, f"c{clip['id']}_s{i}.mp3")
        tts = gTTS(text=sentence, lang="vi", slow=False)
        tts.save(chunk_path)

        duration = get_audio_duration(chunk_path)
        start_ts = format_timestamp(current_time)
        end_ts = format_timestamp(current_time + duration)

        srt_entries.append(f"{i + 1}\n{start_ts} --> {end_ts}\n{sentence}\n")

        chunk_files.append(chunk_path)
        current_time += duration + 0.35  # 0.35s natural pause between sentences

    # Write SRT
    with open(srt_out, "w", encoding="utf-8") as f:
        f.write("\n".join(srt_entries))

    # Concatenate audio chunks with ffmpeg
    concat_list = os.path.join(TEMP_DIR, f"concat_c{clip['id']}.txt")
    with open(concat_list, "w", encoding="utf-8") as f:
        for chunk in chunk_files:
            # Escape path for ffmpeg concat
            clean_chunk = os.path.abspath(chunk).replace("\\", "/")
            f.write(f"file '{clean_chunk}'\n")

    cmd = [
        FFMPEG, "-y", "-f", "concat", "-safe", "0",
        "-i", concat_list,
        "-c:a", "libmp3lame", "-b:a", "128k",
        mp3_out
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    total_duration = get_audio_duration(mp3_out)
    print(f"-> Audio & Subtitles generated: {total_duration:.1f}s, saved to {mp3_out}")
    return total_duration

def record_screen_and_perform_actions(clip, target_duration):
    print(f"\n[Clip {clip['id']}] Recording Phone Screen via ADB (Target: {target_duration:.1f}s)...")
    device_rec_path = f"/sdcard/rec_{clip['id']}.mp4"
    local_rec_path = os.path.join(REC_DIR, f"{clip['filename']}.mp4")

    # Remove any existing recording on device
    subprocess.run([ADB, "-s", DEVICE, "shell", "rm", "-f", device_rec_path], check=False)

    rec_time_limit = int(target_duration + 4)
    # Start screenrecord in background
    rec_cmd = [
        ADB, "-s", DEVICE, "shell",
        "screenrecord", "--size", "1080x2220", "--bit-rate", "8000000",
        "--time-limit", str(rec_time_limit), device_rec_path
    ]
    rec_proc = subprocess.Popen(rec_cmd)
    time.sleep(1.0)  # wait for recording to initialize

    # Execute ADB actions
    start_time = time.time()
    for act in clip["adb_actions"]:
        time.sleep(act["delay"])
        print(f"   Executing: {act['desc']}...")
        if act["action"] == "tap":
            subprocess.run([ADB, "-s", DEVICE, "shell", "input", "tap", str(act["x"]), str(act["y"])], check=False)
        elif act["action"] == "swipe":
            subprocess.run([
                ADB, "-s", DEVICE, "shell", "input", "swipe",
                str(act["x1"]), str(act["y1"]), str(act["x2"]), str(act["y2"]), str(act.get("duration", 500))
            ], check=False)
        elif act["action"] == "key":
            subprocess.run([ADB, "-s", DEVICE, "shell", "input", "keyevent", str(act["code"])], check=False)

    # Wait until duration completes
    elapsed = time.time() - start_time
    remaining = target_duration + 1.5 - elapsed
    if remaining > 0:
        time.sleep(remaining)

    # Terminate recording gracefully
    rec_proc.terminate()
    try:
        rec_proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        rec_proc.kill()
    time.sleep(1.5)

    # Pull recording
    print(f"   Pulling recording to {local_rec_path}...")
    subprocess.run([ADB, "-s", DEVICE, "pull", device_rec_path, local_rec_path], check=True)
    subprocess.run([ADB, "-s", DEVICE, "shell", "rm", "-f", device_rec_path], check=False)

    rec_duration = get_audio_duration(local_rec_path)
    print(f"-> Recording pulled: {rec_duration:.1f}s, size: {os.path.getsize(local_rec_path)} bytes")
    return local_rec_path

def assemble_final_video(clip, audio_duration):
    print(f"\n[Clip {clip['id']}] Assembling Final MP4 with Video, Audio, and Subtitles...")
    video_in = os.path.join(REC_DIR, f"{clip['filename']}.mp4")
    audio_in = os.path.join(AUDIO_DIR, f"{clip['filename']}.mp3")
    srt_in = os.path.join(AUDIO_DIR, f"{clip['filename']}.srt")
    final_out = os.path.join(DIST_DIR, f"Himoto_1.0.4_{clip['filename']}.mp4")

    # In ffmpeg subtitles filter on Windows, escape path
    clean_srt = os.path.abspath(srt_in).replace("\\", "/").replace(":", "\\:")
    
    # Keep full native resolution and burn subtitles above bottom navigation bar
    vf_filter = (
        f"subtitles='{clean_srt}':force_style='FontSize=16,FontName=Arial,PrimaryColour=&H0000FFFF,BackColour=&H80000000,OutlineColour=&H00000000,BorderStyle=4,Outline=1,Alignment=2,MarginV=120'"
    )

    cmd = [
        FFMPEG, "-y",
        "-i", video_in,
        "-i", audio_in,
        "-vf", vf_filter,
        "-c:v", "libx264", "-preset", "fast", "-crf", "22",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        final_out
    ]
    subprocess.run(cmd, check=True)

    final_size = os.path.getsize(final_out)
    final_duration = get_audio_duration(final_out)
    print(f"=== SUCCESS: Clip {clip['id']} Complete! ===")
    print(f"    File: {final_out}")
    print(f"    Duration: {final_duration:.1f}s | Size: {final_size / (1024*1024):.2f} MB\n")
    return final_out

def build_clip(clip):
    print("=" * 65)
    print(f"BUILDING {clip['title'].upper()}")
    print("=" * 65)
    # Reset to Overview tab before starting each clip
    subprocess.run([ADB, "-s", DEVICE, "shell", "input", "tap", "108", "2109"], check=False)
    time.sleep(1.5)
    audio_duration = generate_clip_audio_and_subtitles(clip)
    record_screen_and_perform_actions(clip, audio_duration)
    final_file = assemble_final_video(clip, audio_duration)
    return final_file

def main():
    selected_ids = []
    skip_existing = "--skip-existing" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]

    if args:
        for a in args:
            if "-" in a:
                start, end = map(int, a.split("-"))
                selected_ids.extend(range(start, end + 1))
            else:
                selected_ids.append(int(a))
    else:
        selected_ids = [c["id"] for c in CLIPS_DATA]

    # Ensure Himoto app is active
    subprocess.run([ADB, "-s", DEVICE, "shell", "monkey", "-p", "vn.himoto.staff", "-c", "android.intent.category.LAUNCHER", "1"], check=False)
    time.sleep(2)

    produced = []
    for clip in CLIPS_DATA:
        if clip["id"] not in selected_ids:
            continue
        final_out = os.path.join(DIST_DIR, f"Himoto_1.0.4_{clip['filename']}.mp4")
        if skip_existing and os.path.exists(final_out):
            print(f"Skipping Clip {clip['id']} (already exists: {final_out})")
            produced.append(final_out)
            continue
        out = build_clip(clip)
        produced.append(out)

    print("\n" + "=" * 65)
    print("ALL REQUESTED TRAINING VIDEOS SUCCESSFULLY PRODUCED!")
    print("=" * 65)
    for p in produced:
        print(f" - {p}")

if __name__ == "__main__":
    main()

