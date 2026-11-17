export function printFailure(cause: unknown, action: 'print' | 'pdf'): { error: string; notice: string } {
  const detail = cause instanceof Error ? cause.message : '';
  if (/\bcancel(?:led|ed|lation)?\b|\bdismiss(?:ed)?\b/i.test(detail))
    return { error: '', notice: 'Đã đóng hộp thoại. Anh/chị có thể mở lại khi cần.' };
  return { error: action === 'print'
    ? 'Chưa mở được hộp thoại in trên thiết bị này. Anh/chị có thể chọn “Chia sẻ / lưu PDF hợp đồng” bên dưới để lưu hoặc gửi tệp, rồi in từ ứng dụng đọc PDF.'
    : 'Chưa tạo hoặc chia sẻ được tệp PDF. Anh/chị hãy tạo lại giấy từ hồ sơ mới nhất rồi thử lại; kiểm tra dung lượng trống và ứng dụng nhận tệp trên điện thoại.', notice: '' };
}
