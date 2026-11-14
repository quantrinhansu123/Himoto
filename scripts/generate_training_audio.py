# -*- coding: utf-8 -*-
"""
Script to generate Vietnamese voiceover and subtitles for Himoto Android 1.0.4 training videos.
Uses edge-tts (Microsoft Neural TTS) with voice vi-VN-HoaiMyNeural.
"""

import os
import sys
import asyncio
import edge_tts

OUTPUT_DIR = r"E:\Himoto\videos\training-1.0.4"
AUDIO_DIR = os.path.join(OUTPUT_DIR, "audio")
SCRIPTS_DIR = os.path.join(OUTPUT_DIR, "scripts")

VOICE = "vi-VN-HoaiMyNeural"
RATE = "-4%"  # slightly slower for clear, professional instructional pace

CLIPS = [
    {
        "id": 1,
        "code": "clip_01_dang_nhap_bao_mat",
        "title": "Clip 01: Đăng nhập & Bảo mật tài khoản",
        "script": """Chào mừng anh chị đến với video hướng dẫn sử dụng ứng dụng Himoto phiên bản một chấm không chấm bốn.
Trong video đầu tiên này, chúng ta sẽ làm quen với quy trình đăng nhập và thiết lập bảo mật cho tài khoản nhân viên.
Đầu tiên, mở ứng dụng Himoto trên điện thoại. Nhập tên tài khoản hoặc email được cấp, cùng mật khẩu của anh chị, sau đó bấm Đăng nhập.
Hệ thống sẽ tự động xác thực và nhận diện cơ sở làm việc được phân quyền, ví dụ như Cơ sở Hàng Bút hoặc Cơ sở Nguyễn Hoàng.
Tại thanh điều hướng dưới cùng, chọn tab Tài khoản. Tại đây, anh chị có thể thấy thông tin vai trò, phạm vi truy cập cơ sở và thời hạn duy trì phiên đăng nhập lên đến ba mươi ngày mà không lo bị đăng xuất bất ngờ.
Để bảo vệ tài khoản, anh chị có thể bấm Đổi mật khẩu của mình để cập nhật mật khẩu mới an toàn hơn.
Ngoài ra, anh chị có thể bật tính năng Mở khóa bằng sinh trắc học như vân tay hoặc khuôn mặt. Trong các lần mở app tiếp theo, chỉ cần chạm nhẹ vân tay là có thể vào ngay hệ thống.
Như vậy, anh chị đã nắm rõ cách đăng nhập và thiết lập bảo mật an toàn cho tài khoản Himoto."""
    },
    {
        "id": 2,
        "code": "clip_02_cham_cong_gps",
        "title": "Clip 02: Chấm công vào ra ca theo GPS",
        "script": """Trong video này, chúng ta sẽ tìm hiểu quy trình Chấm công vào ca và ra ca theo định vị GPS thực tế trên phiên bản một chấm không chấm bốn.
Mỗi nhân viên khi đến ca làm việc cần thực hiện chấm công đúng giờ để hệ thống ghi nhận lịch trực và tính công chính xác.
Từ màn hình chính, chọn tab Tài khoản, sau đó chọn mục Chấm công vào ra ca.
Giao diện Chấm công yêu cầu ba yếu tố xác thực bắt buộc: kết nối mạng, định vị GPS trong bán kính cơ sở và chụp ảnh chân dung tại chỗ.
Anh chị bấm chọn Ca làm việc phù hợp, ví dụ Ca sáng, Ca chiều, Ca tối hoặc Ca hành chính theo lịch trực được phân công.
Tiếp theo, bấm Chụp ảnh xác thực. Camera sẽ mở ra để anh chị chụp rõ khuôn mặt tại quầy giao dịch của cơ sở.
Sau khi ảnh được chụp và hệ thống xác nhận tọa độ GPS khớp với cơ sở, bấm nút Vào ca.
Hệ thống sẽ lưu nhận diện thời gian theo máy chủ chuẩn, chống ghi đè và chống gian lận.
Khi hết giờ làm việc, anh chị vào lại màn hình này và bấm Kết thúc ca để hoàn tất.
Phía dưới màn hình, anh chị có thể tra cứu Lịch sử chấm công của mình theo từng khoảng ngày để đối chiếu công việc một cách minh bạch."""
    },
    {
        "id": 3,
        "code": "clip_03_quan_ly_khach_hang_qr",
        "title": "Clip 03: Quản lý khách hàng & Quét QR Căn cước",
        "script": """Video này sẽ hướng dẫn anh chị cách quản lý hồ sơ khách hàng và tính năng Quét mã QR thẻ Căn cước công dân cực kỳ tiện lợi trên app Himoto.
Tại thanh điều hướng bên dưới, chạm vào tab Khách hàng.
Danh sách hiển thị toàn bộ khách hàng trong phạm vi quản lý. Phía trên có ô tìm kiếm nhanh, anh chị có thể gõ tên hoặc số điện thoại để tìm lại hồ sơ cũ trong tích tắc.
Các nút bộ lọc cho phép phân loại nhanh khách hàng Bình thường, khách Cần lưu ý, hoặc khách thuộc Danh sách cảnh báo nợ xấu.
Khi có khách mới đến thuê xe, bấm nút Thêm khách hàng ở góc trên.
Thay vì phải gõ tay từng dòng, anh chị hãy bấm vào biểu tượng Quét mã QR. Đưa camera quét mã QR trên thẻ Căn cước công dân của khách.
Hệ thống sẽ tự động đọc chính xác một trăm phần trăm: họ tên, số căn cước, ngày sinh, giới tính và địa chỉ thường trú.
Anh chị chỉ cần nhập thêm số điện thoại liên hệ của khách, chụp ảnh mặt trước mặt sau căn cước và bấm Lưu hồ sơ.
Hồ sơ khách hàng mới đã sẵn sàng để lập hợp đồng thuê xe chỉ trong chưa đầy một phút."""
    },
    {
        "id": 4,
        "code": "clip_04_doi_xe_dieu_chuyen",
        "title": "Clip 04: Quản lý Đội xe, Định vị & Điều chuyển",
        "script": """Trong video thứ tư, chúng ta sẽ tìm hiểu cách quản lý Đội xe, theo dõi vị trí GPS và thực hiện Điều chuyển xe giữa các cơ sở.
Chạm vào tab Đội xe trên thanh điều hướng. Màn hình hiển thị danh sách toàn bộ xe thuộc cơ sở quản lý.
Mỗi thẻ xe đều ghi rõ: biển số, dòng xe, tình trạng hoạt động và trạng thái như Lưu kho, Đang thuê hoặc Chờ luân chuyển.
Để tìm nhanh xe sẵn sàng cho thuê, anh chị bấm vào bộ lọc Lưu kho.
Chạm vào một xe bất kỳ để mở hồ sơ chi tiết. Tại đây anh chị có thể xem lịch sử thuê xe, tình trạng pin, bình ắc quy và vị trí định vị GPS thực tế của xe trên bản đồ.
Khi cần chuyển xe sang cơ sở khác hoặc chuyển về Trụ sở chính, bấm nút Chuyển xe.
Chọn cơ sở tiếp nhận, nhập ghi chú tình trạng xe và chụp ảnh hiện trạng xe trước khi bàn giao.
Bấm Xác nhận chuyển xe. Lập tức hệ thống sẽ chuyển xe sang trạng thái Đang điều chuyển và tự động gửi thông báo chi tiết vào nhóm Telegram của hai cơ sở.
Khi xe đến nơi, nhân viên cơ sở nhận chỉ cần bấm Nhận xe để xe về kho sẵn sàng phục vụ khách."""
    },
    {
        "id": 5,
        "code": "clip_05_hop_dong_giao_xe_thu_tien",
        "title": "Clip 05: Lập hợp đồng, Bàn giao xe & Thu tiền",
        "script": """Video này hướng dẫn quy trình cốt lõi của cửa hàng: Lập hợp đồng thuê xe, chụp ảnh bàn giao và thu tiền thanh toán.
Từ thanh điều hướng, chọn tab Hợp đồng. Danh sách hiển thị các hợp đồng Đang thuê, Quá hạn và Bản nháp.
Để tạo hợp đồng mới, bấm nút Tạo hợp đồng.
Bước một, chọn loại hình thuê: thuê theo ngày, theo tuần, thuê tháng hoặc thuê sở hữu.
Bước hai, chọn khách hàng từ danh bạ hoặc quét nhanh căn cước công dân.
Bước ba, chọn xe bàn giao từ danh sách xe Lưu kho có sẵn tại cơ sở.
Bước bốn, điền thời gian thuê, tiền đặt cọc và đơn giá thuê theo quy định. Hệ thống sẽ tự động tính tổng tiền cần thu.
Bước năm, tiến hành chụp bộ ảnh bàn giao xe gồm bốn góc xe, đồng hồ công-tơ-mét, mức pin và phụ kiện đi kèm để lưu trữ bằng chứng.
Cuối cùng, chọn hình thức thanh toán: Tiền mặt hoặc Chuyển khoản qua mã VietQR thông minh.
Khách quét mã chuyển khoản thành công, bấm Xác nhận thu tiền và Xuất hợp đồng. Thông tin hợp đồng lập tức được lưu an toàn và đồng bộ tới toàn hệ thống."""
    },
    {
        "id": 6,
        "code": "clip_06_gia_han_doi_xe_tra_xe",
        "title": "Clip 06: Gia hạn hợp đồng, Đổi xe & Trả xe",
        "script": """Trong quá trình vận hành, khách hàng thường có nhu cầu gia hạn thêm ngày, đổi sang xe khác hoặc trả xe kết thúc hợp đồng. Video này sẽ hướng dẫn chi tiết cả ba thao tác trên.
Một là Gia hạn hợp đồng: Khi khách muốn thuê thêm, mở hợp đồng của khách và bấm Gia hạn.
Nhập số ngày gia hạn mới, hệ thống tự tính số tiền cần thu thêm. Anh chị thu tiền và bấm Xác nhận gia hạn để cập nhật hạn trả xe mới.
Hai là Đổi xe: Trường hợp xe gặp sự cố hoặc khách muốn đổi dòng xe khác, bấm nút Đổi xe.
Chọn xe thay thế đang có sẵn trong kho, ghi lại số công tơ mét xe cũ và xe mới, chụp ảnh biên bản đổi xe và bấm Xác nhận. Hợp đồng sẽ tự động liên kết với xe mới mà không làm gián đoạn kỳ thuê.
Ba là Trả xe và thanh lý hợp đồng: Khi khách mang xe về trả, chọn Trả xe.
Kiểm tra tình trạng xe, đối chiếu công tơ mét, nếu có hư hại hoặc quá hạn thì nhập phí phát sinh. Hệ thống sẽ cấn trừ tiền cọc, tính số tiền hoàn trả cho khách hoặc số tiền khách cần thanh toán thêm.
Bấm Hoàn tất trả xe. Chiếc xe lập tức được đưa về trạng thái Lưu kho để sẵn sàng phục vụ khách hàng tiếp theo."""
    },
    {
        "id": 7,
        "code": "clip_07_tro_ly_ai_sop_quy_trinh",
        "title": "Clip 07: Trợ lý AI Gemini & Quy trình SOP chuẩn",
        "script": """Phiên bản một chấm không chấm bốn tích hợp tính năng Hướng dẫn chuẩn hóa SOP và Trợ lý ảo AI Gemini thông minh, giúp nhân viên mới dễ dàng nắm bắt công việc.
Để xem tài liệu hướng dẫn, vào tab Tài khoản và chọn Hướng dẫn và hỏi đáp.
Mục Hướng dẫn trình bày trực quan Quy trình SOP sáu bước chuẩn hóa khi lập hợp đồng thuê xe mới: từ tiếp nhận khách, kiểm tra căn cước, chọn xe, chụp ảnh giao xe đến xuất hợp đồng. Mỗi bước đều có hình ảnh minh họa và các điểm cần lưu ý.
Mục Hỏi đáp tổng hợp các câu hỏi thường gặp nhất tại cơ sở, như cách xử lý khi khách quên căn cước, quy định tiền cọc hay quy trình xử lý khi xe gặp sự cố trên đường.
Đặc biệt, anh chị có thể trò chuyện trực tiếp với Trợ lý AI Gemini ngay trên ứng dụng.
Chỉ cần gõ câu hỏi thắc mắc về nghiệp vụ, trợ lý AI sẽ phản hồi ngay lập tức theo đúng quy định và chính sách của Himoto, giúp giải quyết công việc nhanh chóng mà không cần chờ quản lý hỗ trợ."""
    },
    {
        "id": 8,
        "code": "clip_08_che_do_offline_dong_bo",
        "title": "Clip 08: Chế độ ngoại tuyến & Đồng bộ nền",
        "script": """Video cuối cùng trong bộ hướng dẫn sẽ giới thiệu về Chế độ vận hành ngoại tuyến và Cơ chế đồng bộ dữ liệu nền của ứng dụng Himoto.
Ứng dụng được trang bị cơ sở dữ liệu SQLite mã hóa an toàn ngay trên điện thoại.
Khi xảy ra sự cố mất kết nối mạng Wi-Fi hoặc 4G, ứng dụng sẽ hiển thị thanh thông báo trạng thái ngoại tuyến nhưng tuyệt đối không bị đơ hoặc văng ứng dụng.
Anh chị vẫn có thể mở danh sách xe, danh bạ khách hàng và tra cứu các hợp đồng đã xem trước đó một cách mượt mà.
Các thao tác tạo bản nháp hoặc ghi nhận sự kiện lúc mất mạng sẽ được lưu trữ an toàn trong hàng đợi cục bộ.
Ngay khi điện thoại có kết nối mạng trở lại, tiến trình đồng bộ nền WorkManager sẽ tự động kích hoạt, gửi toàn bộ dữ liệu lên máy chủ và cập nhật thông tin mới nhất mà anh chị không cần thao tác thủ công.
Cảm ơn anh chị đã theo dõi trọn bộ tám video hướng dẫn sử dụng ứng dụng Himoto. Chúc anh chị vận hành hiệu quả và thành công."""
    }
]

async def generate_speech(clip):
    print(f"Generating audio for Clip {clip['id']}: {clip['title']}...")
    mp3_path = os.path.join(AUDIO_DIR, f"{clip['code']}.mp3")
    vtt_path = os.path.join(AUDIO_DIR, f"{clip['code']}.vtt")
    srt_path = os.path.join(AUDIO_DIR, f"{clip['code']}.srt")
    script_path = os.path.join(SCRIPTS_DIR, f"{clip['code']}.txt")

    # Save script text
    with open(script_path, "w", encoding="utf-8") as f:
        f.write(f"TIÊU ĐỀ: {clip['title']}\n\n")
        f.write(clip['script'].strip())

    # Generate audio + vtt
    communicate = edge_tts.Communicate(clip["script"], VOICE, rate=RATE)
    await communicate.save(mp3_path)
    
    # Generate subtitle file with edge-tts
    sub_comm = edge_tts.Communicate(clip["script"], VOICE, rate=RATE)
    sub_maker = edge_tts.SubMaker()
    async for chunk in sub_comm.stream():
        if chunk["type"] == "word_boundary":
            sub_maker.feed(chunk)
    
    with open(vtt_path, "w", encoding="utf-8") as f:
        f.write(sub_maker.get_vtt())
    
    # Convert VTT to SRT for ffmpeg compatibility
    vtt_content = sub_maker.get_vtt()
    lines = vtt_content.splitlines()
    srt_lines = []
    counter = 1
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if "-->" in line:
            # Timestamp line: format 00:00:00.000 --> 00:00:00.000
            # Replace . with , for standard srt
            time_line = line.replace(".", ",")
            srt_lines.append(str(counter))
            srt_lines.append(time_line)
            counter += 1
            i += 1
            if i < len(lines):
                text_line = lines[i].strip()
                srt_lines.append(text_line)
                srt_lines.append("")
        i += 1
    
    with open(srt_path, "w", encoding="utf-8") as f:
        f.write("\n".join(srt_lines))

    print(f"-> Done Clip {clip['id']}: {mp3_path} ({os.path.getsize(mp3_path)} bytes)")

async def main():
    os.makedirs(AUDIO_DIR, exist_ok=True)
    os.makedirs(SCRIPTS_DIR, exist_ok=True)
    for clip in CLIPS:
        await generate_speech(clip)
    print("\nAll 8 voiceovers and subtitles generated successfully!")

if __name__ == "__main__":
    asyncio.run(main())

