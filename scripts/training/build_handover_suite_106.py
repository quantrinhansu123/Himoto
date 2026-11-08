# -*- coding: utf-8 -*-
"""
Himoto Android 1.0.6 - Production Handover Training Video Suite.
Automates 8 Full Handover Videos:
- Vietnamese AI Voiceover with atempo=1.2 (1.2x brisk handover speed)
- Subtitles in dedicated safe caption area (y=2200..2350, Font size 52 Bold Segoe UI)
- Sentence-aligned ADB Action Timeline: screen reacts at exact spoken cue
- High-res 1080x2400 canvas with modern card layout & progress header
- Push to phone /sdcard/Movies/Himoto-Huong-dan and trigger media scan
"""

import os
import re
import sys
import time
import json
import wave
import shutil
import asyncio
import subprocess
from pathlib import Path
from gtts import gTTS
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT_DIR = Path("E:/Himoto")
VIDEOS_DIR = ROOT_DIR / "videos" / "training-1.0.6"
SCRIPTS_DIR = VIDEOS_DIR / "scripts"
AUDIO_DIR = VIDEOS_DIR / "audio"
REC_DIR = VIDEOS_DIR / "recordings"
DIST_DIR = VIDEOS_DIR / "dist"
TEMP_DIR = ROOT_DIR / ".backups" / "training-suite-1.0.6-temp"

ADB = "E:/Android/Sdk/platform-tools/adb.exe"
DEVICE = "282a05859f3f7ece"
FFMPEG = Path("E:/backup/daotaonhansukama/node_modules/ffmpeg-static/ffmpeg.exe")

WIDTH, HEIGHT, FPS = 1080, 2400, 30
PANEL = (68, 230, 944, 1940)
CAPTION_TOP, CAPTION_BOTTOM = 2200, 2350

FONT_PATH = Path("C:/Windows/Fonts/segoeui.ttf")
BOLD_PATH = Path("C:/Windows/Fonts/segoeuib.ttf")
FONT_TITLE = ImageFont.truetype(str(BOLD_PATH), 50)
FONT_SUBTITLE = ImageFont.truetype(str(FONT_PATH), 28)
FONT_CAPTION = ImageFont.truetype(str(BOLD_PATH), 52)
FONT_BADGE = ImageFont.truetype(str(BOLD_PATH), 24)
FONT_FOOTER = ImageFont.truetype(str(FONT_PATH), 24)

for d in [SCRIPTS_DIR, AUDIO_DIR, REC_DIR, DIST_DIR, TEMP_DIR]:
    d.mkdir(parents=True, exist_ok=True)

CLIPS_DATA = [
    {
        "id": 1,
        "filename": "Himoto_1.0.6_Clip_01_Dang_Nhap_Va_Bao_Mat",
        "title": "Clip 01: Đăng nhập & Bảo mật sinh trắc học",
        "badge": "BÀI 01 / 08",
        "sentences": [
            "Chào mừng quý khách đến với video hướng dẫn sử dụng ứng dụng Himoto phiên bản một chấm không chấm sáu.",
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
        "cue_actions": {
            0: [{"delay": 0.5, "type": "tap", "x": 108, "y": 2109, "desc": "Overview tab"}],
            1: [{"delay": 1.0, "type": "swipe", "x1": 540, "y1": 600, "x2": 540, "y2": 1500, "dur": 400, "desc": "Pull refresh"}],
            4: [{"delay": 0.5, "type": "tap", "x": 972, "y": 2109, "desc": "Account tab"}],
            7: [{"delay": 0.5, "type": "swipe", "x1": 540, "y1": 1700, "x2": 540, "y2": 950, "dur": 450, "desc": "Scroll to Biometrics"}],
            9: [
                {"delay": 0.5, "type": "swipe", "x1": 540, "y1": 950, "x2": 540, "y2": 1700, "dur": 450, "desc": "Scroll back"},
                {"delay": 2.5, "type": "tap", "x": 108, "y": 2109, "desc": "Return Overview"}
            ]
        }
    },
    {
        "id": 2,
        "filename": "Himoto_1.0.6_Clip_02_Cham_Cong_GPS_Va_Khuon_Mat",
        "title": "Clip 02: Chấm công vào ra ca theo GPS",
        "badge": "BÀI 02 / 08",
        "sentences": [
            "Video thứ hai hướng dẫn nghiệp vụ Chấm công vào ca và ra ca theo định vị GPS trên phiên bản một chấm không chấm sáu.",
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
        "cue_actions": {
            0: [{"delay": 0.5, "type": "tap", "x": 108, "y": 2109, "desc": "Overview tab"}],
            2: [
                {"delay": 0.5, "type": "tap", "x": 972, "y": 2109, "desc": "Account tab"},
                {"delay": 2.0, "type": "tap", "x": 540, "y": 1750, "desc": "Open Cham cong"}
            ],
            7: [{"delay": 0.5, "type": "swipe", "x1": 540, "y1": 1600, "x2": 540, "y2": 950, "dur": 450, "desc": "Scroll Cham cong history"}],
            9: [
                {"delay": 0.5, "type": "swipe", "x1": 540, "y1": 950, "x2": 540, "y2": 1600, "dur": 450, "desc": "Scroll back top"},
                {"delay": 2.0, "type": "key", "code": 4, "desc": "Back to Account"},
                {"delay": 3.0, "type": "tap", "x": 108, "y": 2109, "desc": "Return Overview"}
            ]
        }
    },
    {
        "id": 3,
        "filename": "Himoto_1.0.6_Clip_03_Quan_Ly_Khach_Hang_Quet_QR",
        "title": "Clip 03: Quản lý khách hàng & Quét QR Căn cước",
        "badge": "BÀI 03 / 08",
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
        "cue_actions": {
            0: [{"delay": 0.5, "type": "tap", "x": 108, "y": 2109, "desc": "Overview tab"}],
            1: [{"delay": 0.5, "type": "tap", "x": 756, "y": 2109, "desc": "Customers tab"}],
            3: [
                {"delay": 0.5, "type": "tap", "x": 420, "y": 420, "desc": "Filter Binh thuong"},
                {"delay": 2.0, "type": "tap", "x": 620, "y": 420, "desc": "Filter Can luu y"},
                {"delay": 3.5, "type": "tap", "x": 840, "y": 420, "desc": "Filter Canh bao"},
                {"delay": 5.0, "type": "tap", "x": 160, "y": 420, "desc": "Filter Tat ca"}
            ],
            4: [{"delay": 0.5, "type": "swipe", "x1": 540, "y1": 1500, "x2": 540, "y2": 700, "dur": 450, "desc": "Scroll Customers"}],
            8: [
                {"delay": 0.5, "type": "swipe", "x1": 540, "y1": 700, "x2": 540, "y2": 1500, "dur": 450, "desc": "Scroll up"},
                {"delay": 2.0, "type": "tap", "x": 108, "y": 2109, "desc": "Return Overview"}
            ]
        }
    },
    {
        "id": 4,
        "filename": "Himoto_1.0.6_Clip_04_Quan_Ly_Doi_Xe_Va_Dieu_Chuyen",
        "title": "Clip 04: Quản lý Đội xe, Định vị & Điều chuyển",
        "badge": "BÀI 04 / 08",
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
        "cue_actions": {
            0: [{"delay": 0.5, "type": "tap", "x": 108, "y": 2109, "desc": "Overview tab"}],
            1: [{"delay": 0.5, "type": "tap", "x": 324, "y": 2109, "desc": "Vehicles tab"}],
            3: [{"delay": 0.5, "type": "tap", "x": 320, "y": 870, "desc": "Filter Luu kho"}],
            4: [
                {"delay": 0.5, "type": "tap", "x": 550, "y": 870, "desc": "Filter Dang thue"},
                {"delay": 2.5, "type": "tap", "x": 850, "y": 870, "desc": "Filter Cho luan chuyen"},
                {"delay": 4.5, "type": "tap", "x": 120, "y": 870, "desc": "Filter Tat ca"}
            ],
            6: [{"delay": 0.5, "type": "swipe", "x1": 540, "y1": 1500, "x2": 540, "y2": 700, "dur": 450, "desc": "Scroll Vehicles"}],
            8: [
                {"delay": 0.5, "type": "swipe", "x1": 540, "y1": 700, "x2": 540, "y2": 1500, "dur": 450, "desc": "Scroll up"},
                {"delay": 2.0, "type": "tap", "x": 108, "y": 2109, "desc": "Return Overview"}
            ]
        }
    },
    {
        "id": 5,
        "filename": "Himoto_1.0.6_Clip_05_Lap_Hop_Dong_Giao_Xe_Thu_Tien",
        "title": "Clip 05: Lập hợp đồng, Bàn giao xe & Thu tiền",
        "badge": "BÀI 05 / 08",
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
        "cue_actions": {
            0: [{"delay": 0.5, "type": "tap", "x": 108, "y": 2109, "desc": "Overview tab"}],
            1: [{"delay": 0.5, "type": "tap", "x": 540, "y": 2109, "desc": "Contracts tab"}],
            2: [
                {"delay": 0.5, "type": "tap", "x": 300, "y": 420, "desc": "Filter Active"},
                {"delay": 2.0, "type": "tap", "x": 560, "y": 420, "desc": "Filter Overdue"},
                {"delay": 3.5, "type": "tap", "x": 800, "y": 420, "desc": "Filter Drafts"},
                {"delay": 5.0, "type": "tap", "x": 120, "y": 420, "desc": "Filter All"}
            ],
            4: [{"delay": 0.5, "type": "swipe", "x1": 540, "y1": 1500, "x2": 540, "y2": 700, "dur": 450, "desc": "Scroll Contracts"}],
            9: [
                {"delay": 0.5, "type": "swipe", "x1": 540, "y1": 700, "x2": 540, "y2": 1500, "dur": 450, "desc": "Scroll up"},
                {"delay": 2.0, "type": "tap", "x": 108, "y": 2109, "desc": "Return Overview"}
            ]
        }
    },
    {
        "id": 6,
        "filename": "Himoto_1.0.6_Clip_06_Gia_Han_Doi_Xe_Va_Tra_Xe",
        "title": "Clip 06: Gia hạn hợp đồng, Đổi xe & Trả xe",
        "badge": "BÀI 06 / 08",
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
        "cue_actions": {
            0: [{"delay": 0.5, "type": "tap", "x": 108, "y": 2109, "desc": "Overview tab"}],
            1: [{"delay": 0.5, "type": "tap", "x": 540, "y": 2109, "desc": "Contracts tab"}],
            3: [{"delay": 0.5, "type": "tap", "x": 300, "y": 420, "desc": "Filter Dang thue"}],
            5: [{"delay": 0.5, "type": "swipe", "x1": 540, "y1": 1500, "x2": 540, "y2": 700, "dur": 450, "desc": "Inspect contracts"}],
            9: [
                {"delay": 0.5, "type": "swipe", "x1": 540, "y1": 700, "x2": 540, "y2": 1500, "dur": 450, "desc": "Scroll up"},
                {"delay": 2.0, "type": "tap", "x": 108, "y": 2109, "desc": "Return Overview"}
            ]
        }
    },
    {
        "id": 7,
        "filename": "Himoto_1.0.6_Clip_07_Tro_Ly_AI_Va_Huong_Dan_SOP",
        "title": "Clip 07: Trợ lý AI Gemini & Hướng dẫn SOP chuẩn",
        "badge": "BÀI 07 / 08",
        "sentences": [
            "Video thứ bảy giới thiệu tính năng Hướng dẫn chuẩn hóa SOP và Trợ lý ảo AI Gemini thông minh trên phiên bản một chấm không chấm sáu.",
            "Để mở tài liệu hướng dẫn nghiệp vụ, vào tab Tài khoản và chọn Hướng dẫn và hỏi đáp.",
            "Mục Hướng dẫn trình bày trực quan Quy trình SOP sáu bước chuẩn hóa khi lập hợp đồng thuê xe mới.",
            "Bao gồm: chọn loại hợp đồng, nhập căn cước công dân, chọn xe, bàn giao xe kèm ảnh chụp và thanh toán hợp đồng.",
            "Mỗi bước đều có hình ảnh minh họa thực tế cùng các lưu ý kiểm tra quan trọng giúp nhân viên không bỏ sót thao tác.",
            "Mục Hỏi đáp tổng hợp các câu hỏi xử lý tình huống thường gặp nhất tại cơ sở, như quy định tiền cọc hay xử lý sự cố trên đường.",
            "Đặc biệt, anh chị có thể trò chuyện trực tiếp với Trợ lý AI Gemini ngay trên ứng dụng.",
            "Gõ bất kỳ câu hỏi thắc mắc nào về chính sách công ty, trợ lý AI sẽ giải đáp ngay lập tức theo đúng quy định chuẩn.",
            "Đây là công cụ hỗ trợ đắc lực giúp nhân viên mới nhanh chóng làm quen và tự tin xử lý mọi nghiệp vụ tại cửa hàng."
        ],
        "cue_actions": {
            0: [{"delay": 0.5, "type": "tap", "x": 108, "y": 2109, "desc": "Overview tab"}],
            1: [
                {"delay": 0.5, "type": "tap", "x": 972, "y": 2109, "desc": "Account tab"},
                {"delay": 2.0, "type": "tap", "x": 540, "y": 1940, "desc": "Open Guide & SOP"}
            ],
            3: [{"delay": 0.5, "type": "swipe", "x1": 540, "y1": 1700, "x2": 540, "y2": 900, "dur": 500, "desc": "Scroll SOP 1-3"}],
            4: [{"delay": 0.5, "type": "swipe", "x1": 540, "y1": 1700, "x2": 540, "y2": 900, "dur": 500, "desc": "Scroll SOP 4-6"}],
            5: [{"delay": 0.5, "type": "tap", "x": 790, "y": 620, "desc": "FAQ tab"}],
            6: [{"delay": 0.5, "type": "swipe", "x1": 540, "y1": 1500, "x2": 540, "y2": 900, "dur": 450, "desc": "Scroll FAQ"}],
            8: [
                {"delay": 0.5, "type": "key", "code": 4, "desc": "Back to Account"},
                {"delay": 2.0, "type": "tap", "x": 108, "y": 2109, "desc": "Return Overview"}
            ]
        }
    },
    {
        "id": 8,
        "filename": "Himoto_1.0.6_Clip_08_Van_Hanh_Ngoai_Tuyen_Dong_Bo_Nen",
        "title": "Clip 08: Vận hành ngoại tuyến & Đồng bộ nền",
        "badge": "BÀI 08 / 08",
        "sentences": [
            "Video cuối cùng trong bộ hướng dẫn sẽ giới thiệu về Chế độ vận hành ngoại tuyến và Cơ chế đồng bộ dữ liệu nền của Himoto.",
            "Ứng dụng Himoto một chấm không chấm sáu được trang bị cơ sở dữ liệu SQLite mã hóa an toàn trực tiếp trên điện thoại.",
            "Khi gặp sự cố mất mạng Wi-Fi hoặc 4G, ứng dụng hiển thị thông báo ngoại tuyến nhưng tuyệt đối không bị đơ hoặc văng ứng dụng.",
            "Anh chị vẫn có thể mở danh sách xe, danh bạ khách hàng và tra cứu các hợp đồng đã xem trước đó một cách mượt mà.",
            "Các thao tác tạo bản nháp hoặc ghi nhận sự kiện lúc mất mạng sẽ được lưu an toàn trong bộ nhớ máy.",
            "Ngay khi điện thoại có kết nối mạng trở lại, tiến trình đồng bộ nền WorkManager sẽ tự động gửi toàn bộ dữ liệu lên máy chủ.",
            "Mọi thông tin được cập nhật chính xác và an toàn tuyệt đối mà nhân viên không cần phải nhập lại từ đầu.",
            "Cảm ơn quý khách đã theo dõi trọn bộ tám video hướng dẫn sử dụng ứng dụng Himoto phiên bản một chấm không chấm sáu.",
            "Chúc quý khách và đội ngũ nhân viên vận hành hệ thống hiệu quả, an toàn và thành công."
        ],
        "cue_actions": {
            0: [{"delay": 0.5, "type": "tap", "x": 108, "y": 2109, "desc": "Overview tab"}],
            1: [{"delay": 0.5, "type": "swipe", "x1": 540, "y1": 600, "x2": 540, "y2": 1500, "dur": 400, "desc": "Refresh check offline"}],
            3: [
                {"delay": 0.5, "type": "tap", "x": 324, "y": 2109, "desc": "Vehicles offline view"},
                {"delay": 3.0, "type": "swipe", "x1": 540, "y1": 1500, "x2": 540, "y2": 800, "dur": 400, "desc": "Scroll Vehicles"}
            ],
            4: [
                {"delay": 0.5, "type": "tap", "x": 540, "y": 2109, "desc": "Contracts offline view"},
                {"delay": 3.0, "type": "tap", "x": 756, "y": 2109, "desc": "Customers offline view"}
            ],
            5: [
                {"delay": 0.5, "type": "tap", "x": 108, "y": 2109, "desc": "Return Overview"},
                {"delay": 2.5, "type": "tap", "x": 500, "y": 140, "desc": "Show Sync status dialog"}
            ],
            6: [{"delay": 0.5, "type": "key", "code": 4, "desc": "Dismiss dialog"}],
            8: [{"delay": 0.5, "type": "tap", "x": 108, "y": 2109, "desc": "Final Overview"}]
        }
    }
]

def format_timestamp(seconds, srt=True):
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int(round((seconds - int(seconds)) * 1000))
    if millis >= 1000:
        millis = 999
    sep = "," if srt else "."
    return f"{hrs:02d}:{mins:02d}:{secs:02d}{sep}{millis:03d}"

def get_media_duration(file_path):
    cmd = [str(FFMPEG), "-i", str(file_path)]
    res = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", res.stderr)
    if match:
        h, m, s = match.groups()
        return int(h) * 3600 + int(m) * 60 + float(s)
    return 10.0

def wrap_text(text, font, max_width=920):
    words = text.split()
    lines = [""]
    for w in words:
        candidate = (lines[-1] + " " + w).strip()
        if font.getlength(candidate) <= max_width:
            lines[-1] = candidate
        else:
            lines.append(w)
    return lines

async def generate_clip_audio(clip):
    print(f"\n[Clip {clip['id']}] Synthesizing Vietnamese audio (gTTS + atempo=1.2)...")
    clip_temp = TEMP_DIR / f"clip_{clip['id']}"
    clip_temp.mkdir(parents=True, exist_ok=True)
    
    chunk_files = []
    srt_cues = []
    current_time = 0.5  # initial lead-in pause

    for idx, sentence in enumerate(clip["sentences"]):
        raw_mp3 = clip_temp / f"raw_s_{idx:02d}.mp3"
        speed_mp3 = clip_temp / f"s_{idx:02d}.mp3"

        # Generate audio using Vietnamese voice
        tts = gTTS(text=sentence, lang="vi", slow=False)
        tts.save(str(raw_mp3))

        # Apply atempo=1.2 for 1.2x brisk handover speed
        cmd_speed = [
            str(FFMPEG), "-y", "-i", str(raw_mp3),
            "-filter:a", "atempo=1.2",
            "-vn", str(speed_mp3)
        ]
        subprocess.run(cmd_speed, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        duration = get_media_duration(speed_mp3)
        start_ts = format_timestamp(current_time, srt=True)
        end_ts = format_timestamp(current_time + duration, srt=True)

        wrapped = wrap_text(sentence, FONT_CAPTION, max_width=920)
        srt_cues.append({
            "index": idx + 1,
            "start": current_time,
            "end": current_time + duration,
            "start_ts": start_ts,
            "end_ts": end_ts,
            "text": sentence,
            "lines": wrapped
        })

        chunk_files.append(speed_mp3)
        current_time += duration + 0.35  # comfortable sentence gap

    # Write SRT
    srt_path = DIST_DIR / f"{clip['filename']}.srt"
    srt_content = "\n\n".join(
        f"{c['index']}\n{c['start_ts']} --> {c['end_ts']}\n" + "\n".join(c['lines'])
        for c in srt_cues
    )
    srt_path.write_text(srt_content + "\n", encoding="utf-8-sig")

    # Write TXT script
    txt_path = SCRIPTS_DIR / f"{clip['filename']}.txt"
    txt_path.write_text(f"{clip['title']}\n\n" + "\n\n".join(clip["sentences"]) + "\n", encoding="utf-8-sig")

    # Concat all audio chunks
    concat_txt = clip_temp / "concat.txt"
    concat_txt.write_text("\n".join(f"file '{p.resolve().as_posix()}'" for p in chunk_files), encoding="utf-8")

    mp3_master = AUDIO_DIR / f"{clip['filename']}.mp3"
    wav_master = clip_temp / "master.wav"
    subprocess.run([
        str(FFMPEG), "-y", "-f", "concat", "-safe", "0",
        "-i", str(concat_txt),
        "-ar", "48000", "-ac", "2",
        str(wav_master)
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Encode master MP3
    subprocess.run([
        str(FFMPEG), "-y", "-i", str(wav_master),
        "-c:a", "libmp3lame", "-b:a", "192k",
        str(mp3_master)
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    total_duration = get_media_duration(wav_master)
    print(f"-> Audio master generated: {total_duration:.2f}s, {len(srt_cues)} subtitle cues.")
    return wav_master, srt_cues, total_duration

def record_samsung_screen(clip, srt_cues, target_duration):
    print(f"\n[Clip {clip['id']}] Recording Samsung phone screen ({target_duration:.2f}s)...")
    remote_mp4 = f"/data/local/tmp/training_rec_{clip['id']}.mp4"
    local_mp4 = REC_DIR / f"{clip['filename']}.mp4"

    subprocess.run([ADB, "-s", DEVICE, "shell", "rm", "-f", remote_mp4], check=False)
    # Reset to overview
    subprocess.run([ADB, "-s", DEVICE, "shell", "input", "tap", "108", "2109"], check=False)
    time.sleep(0.8)

    rec_limit = int(target_duration + 5)
    rec_cmd = [
        ADB, "-s", DEVICE, "shell",
        f"screenrecord --size 1080x2220 --bit-rate 12000000 --time-limit {rec_limit} {remote_mp4}"
    ]
    rec_proc = subprocess.Popen(rec_cmd)
    time.sleep(1.2)  # allow screenrecord to start

    # Build scheduled action timeline based on EXACT cue timings
    scheduled_actions = []
    cue_actions = clip.get("cue_actions", {})
    for cue_idx, actions in cue_actions.items():
        if cue_idx < len(srt_cues):
            cue_start = srt_cues[cue_idx]["start"]
            for act in actions:
                act_time = cue_start + act.get("delay", 0.5)
                scheduled_actions.append({"target_time": act_time, **act})

    scheduled_actions.sort(key=lambda a: a["target_time"])

    start_time = time.time()
    for act in scheduled_actions:
        target_sec = act["target_time"]
        elapsed = time.time() - start_time
        if target_sec > elapsed:
            time.sleep(target_sec - elapsed)
        
        print(f"   [{time.time()-start_time:.1f}s] ADB: {act['desc']}...")
        if act["type"] == "tap":
            subprocess.run([ADB, "-s", DEVICE, "shell", "input", "tap", str(act["x"]), str(act["y"])], check=False)
        elif act["type"] == "swipe":
            subprocess.run([
                ADB, "-s", DEVICE, "shell", "input", "swipe",
                str(act["x1"]), str(act["y1"]), str(act["x2"]), str(act["y2"]), str(act.get("dur", 500))
            ], check=False)
        elif act["type"] == "key":
            subprocess.run([ADB, "-s", DEVICE, "shell", "input", "keyevent", str(act["code"])], check=False)

    elapsed = time.time() - start_time
    remain = (target_duration + 1.0) - elapsed
    if remain > 0:
        time.sleep(remain)

    rec_proc.terminate()
    try:
        rec_proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        rec_proc.kill()
    time.sleep(1.0)

    print(f"   Pulling recording to {local_mp4}...")
    subprocess.run([ADB, "-s", DEVICE, "pull", remote_mp4, str(local_mp4)], check=True)
    subprocess.run([ADB, "-s", DEVICE, "shell", "rm", "-f", remote_mp4], check=False)

    dur = get_media_duration(local_mp4)
    print(f"-> Pulled screen recording: {dur:.2f}s, size: {local_mp4.stat().st_size} bytes")
    return local_mp4

def create_base_canvas(clip):
    canvas = Image.new("RGB", (WIDTH, HEIGHT), "#F5F6F8")
    draw = ImageDraw.Draw(canvas)

    # Header Top Bar
    draw.text((68, 42), "HIMOTO", font=ImageFont.truetype(str(BOLD_PATH), 32), fill="#BA2028")
    
    # Badge
    draw.rounded_rectangle((780, 38, 1012, 90), radius=16, fill="#FFF0F0")
    draw.text((800, 48), clip["badge"], font=FONT_BADGE, fill="#BA2028")

    # Title
    draw.text((68, 98), clip["title"].split(":", 1)[-1].strip(), font=FONT_TITLE, fill="#17202A")
    draw.text((68, 172), "Hệ thống Quản lý Vận hành Xe máy Điện Thông minh", font=FONT_SUBTITLE, fill="#536071")

    # App Frame Card
    x, y, w, h = PANEL
    draw.rounded_rectangle((x - 4, y - 4, x + w + 4, y + h + 4), radius=16, fill="#D6DAE1")
    draw.rectangle((x, y, x + w, y + h), fill="#FFFFFF")

    # Caption Box Border Divider
    draw.rectangle((68, 2196, 1012, 2199), fill="#D6DAE1")
    progress_w = int(944 * (clip["id"] / 8.0))
    draw.rectangle((68, 2196, 68 + progress_w, 2199), fill="#BA2028")

    # Footer
    draw.text((68, 2362), "Himoto Android v1.0.6  ·  Bàn giao vận hành chính thức", font=FONT_FOOTER, fill="#536071")
    return canvas

def render_final_handover_video(clip, wav_audio, srt_cues, raw_video, total_duration):
    print(f"\n[Clip {clip['id']}] Rendering Final Handover Video (1080x2400 @ 30fps)...")
    clip_temp = TEMP_DIR / f"clip_{clip['id']}"
    final_mp4 = DIST_DIR / f"{clip['filename']}.mp4"

    # Save base layout canvas
    base_canvas = create_base_canvas(clip)
    base_png = clip_temp / "base_layout.png"
    base_canvas.save(base_png)

    # Subtitles ASS generation with Font size 52 Bold Segoe UI, safe area
    ass_path = clip_temp / "captions.ass"
    ass_header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {WIDTH}
PlayResY: {HEIGHT}
WrapStyle: 2
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Segoe UI,52,&H002A2017,&H002A2017,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,1,0,0,5,80,80,0,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ass_events = []
    for cue in srt_cues:
        start_ts = format_timestamp(cue["start"], srt=False)
        end_ts = format_timestamp(cue["end"], srt=False)
        text_ass = r"\N".join(cue["lines"]).replace("{", "(").replace("}", ")")
        ass_events.append(
            f"Dialogue: 0,{start_ts},{end_ts},Caption,,0,0,0,,{{\\an5\\pos(540,2275)}}{text_ass}"
        )
    ass_path.write_text(ass_header + "\n".join(ass_events), encoding="utf-8-sig")

    # Mux phone video inside PANEL and burn ASS subtitles
    x, y, w, h = PANEL
    clean_ass = ass_path.resolve().as_posix().replace(":", "\\:")

    filter_complex = (
        f"[1:v]fps=30,scale={w}:{h},setsar=1[screen];"
        f"[0:v][screen]overlay=x={x}:y={y}:shortest=0[composed];"
        f"[composed]subtitles='{clean_ass}',format=yuv420p[vout]"
    )

    cmd = [
        str(FFMPEG), "-y",
        "-loop", "1", "-framerate", str(FPS), "-i", str(base_png),
        "-i", str(raw_video),
        "-i", str(wav_audio),
        "-filter_complex", filter_complex,
        "-map", "[vout]",
        "-map", "2:a:0",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        "-t", f"{total_duration:.2f}",
        "-movflags", "+faststart",
        str(final_mp4)
    ]
    subprocess.run(cmd, check=True)

    final_size = final_mp4.stat().st_size
    final_dur = get_media_duration(final_mp4)
    print(f"=== SUCCESS: {final_mp4.name} ===")
    print(f"    Duration: {final_dur:.2f}s | Size: {final_size / (1024*1024):.2f} MB")
    return final_mp4

def push_to_samsung_phone(final_mp4):
    remote_dir = "/sdcard/Movies/Himoto-Huong-dan"
    remote_file = f"{remote_dir}/{final_mp4.name}"
    print(f"   Pushing to phone: {remote_file}...")
    subprocess.run([ADB, "-s", DEVICE, "shell", "mkdir", "-p", remote_dir], check=True)
    subprocess.run([ADB, "-s", DEVICE, "push", str(final_mp4), remote_file], check=True)
    # Broadcast media scanner
    subprocess.run([
        ADB, "-s", DEVICE, "shell",
        "am", "broadcast", "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
        "-d", f"file://{remote_file}"
    ], check=True)
    print(f"   Phone updated & MediaScanner triggered for {final_mp4.name}!")

async def process_clip(clip):
    print("=" * 70)
    print(f"BUILDING: {clip['title'].upper()}")
    print("=" * 70)
    wav_audio, srt_cues, duration = await generate_clip_audio(clip)
    raw_video = record_samsung_screen(clip, srt_cues, duration)
    final_mp4 = render_final_handover_video(clip, wav_audio, srt_cues, raw_video, duration)
    push_to_samsung_phone(final_mp4)
    return final_mp4

async def main():
    selected = [int(a) for a in sys.argv[1:] if a.isdigit()]
    clips_to_run = [c for c in CLIPS_DATA if not selected or c["id"] in selected]
    
    print(f"Starting Handover Suite Build for {len(clips_to_run)} clip(s)...")
    results = []
    for c in clips_to_run:
        res = await process_clip(c)
        results.append(res)
    
    print("\n" + "=" * 70)
    print("ALL REQUESTED HANDOVER VIDEOS SUCCESSFULLY PRODUCED & DEPLOYED!")
    print("=" * 70)
    for r in results:
        print(f" -> {r}")

if __name__ == "__main__":
    asyncio.run(main())
