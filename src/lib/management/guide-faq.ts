export const FAQ_CATEGORIES = ['Hợp đồng', 'Khách hàng', 'Gia hạn', 'Trả xe', 'Thanh toán', 'Telegram', 'Phân ca / Chấm công', 'Khác'] as const;
export type GuideFaq = {id:number;category:string;question:string;asker_name:string;answer:string;answerer_name:string|null;revision:number;created_at:string;images:number[]};
