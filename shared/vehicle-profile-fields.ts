export const VEHICLE_PROFILE_FIELDS = [
  { key: 'name', label: 'Tên / dòng xe', required: true, max: 255 },
  { key: 'license', label: 'Biển số', required: true, max: 25 },
  { key: 'brand', label: 'Hãng xe', required: true, max: 255 },
  { key: 'color', label: 'Màu sắc', required: false, max: 255 },
  { key: 'year', label: 'Năm sản xuất', required: true, numeric: true, max: 4 },
  { key: 'odometer', label: 'Số km', required: false, numeric: true, max: 15 },
  { key: 'daily_price', label: 'Giá thuê / ngày (VNĐ)', required: false, numeric: true, max: 16 },
  { key: 'cost_price', label: 'Giá mua xe (VNĐ)', required: false, numeric: true, max: 16 },
  { key: 'chassis', label: 'Số khung', required: false, max: 255 },
  { key: 'engine', label: 'Số máy', required: false, max: 255 },
] as const;

export const VEHICLE_DOCUMENT_SLOTS = [
  { key: 'vehicle-photo', label: 'Ảnh xe' },
  { key: 'registration-front', label: 'Đăng ký xe mặt trước' },
  { key: 'registration-back', label: 'Đăng ký xe mặt sau' },
  { key: 'purchase-document-1', label: 'Giấy mua bán trang 1' },
  { key: 'purchase-document-2', label: 'Giấy mua bán trang 2' },
] as const;
