import type { ComponentType, ReactNode } from 'react';
import type { BatteryContractFields, BatteryPaymentMethod } from '@/lib/management/battery-contracts';

export interface BatteryPrintData extends BatteryContractFields { code: string; store_address: string; store_phone: string }

const blank = (value: string, dots: string) => value.trim() ? <b>{value.trim()}</b> : dots;
const money = (value: number | null) => value === null ? '' : value.toLocaleString('vi-VN');
const dateParts = (value: string) => { const [year = '', month = '', day = ''] = value.slice(0, 10).split('-'); return { day, month, year }; };
const printedDate = (value: string) => { const { day, month, year } = dateParts(value); return value ? `${day}/${month}/${year}` : ''; };
function Moment({ value }: { value: string }) {
  if (!value) return <>.... h … phút, ngày …. tháng …. năm 202…</>;
  const { day, month, year } = dateParts(value);
  return <><b>{value.slice(11, 13)}</b> h <b>{value.slice(14, 16)}</b> phút, ngày <b>{day}</b> tháng <b>{month}</b> năm <b>{year}</b></>;
}
const Method = ({ value }: { value: BatteryPaymentMethod }) => <>(<span className={value === 'CK' ? 'is-picked' : ''}>CK</span> / <span className={value === 'TM' ? 'is-picked' : ''}>TM</span>)</>;

export function BatteryContractPrintDocument({ doc, pageWrapper: PageWrapper }: { doc: BatteryPrintData; pageWrapper?: ComponentType<{ children: ReactNode }> }) {
  const signed = dateParts(doc.signed_on);
  const deposit = [money(doc.deposit_amount), doc.deposit_note.trim()].filter(Boolean).join(' · ');
  const page = <div className="battery-page">
    <header className="battery-head">
      <div className="battery-logo"><span>HiMOTO</span><small>DỊCH VỤ THUÊ XE GIÁ RẺ</small></div>
      <div className="battery-nation"><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><em>Độc lập – Tự do – Hạnh phúc</em></div>
      <div className="battery-number"><span>Số: {blank(doc.code, '……………….')}/HĐTX</span><em>NV: {blank(doc.staff_name, '………………')}</em></div>
    </header>
    <h1>HỢP ĐỒNG THUÊ PIN</h1>
    <ul className="battery-legal">
      <li>Căn cứ Bộ luật Dân sự số 91/2015/QH13 đã được Quốc hội ban hành ngày 24/11/2015;</li>
      <li>Căn cứ Luật Thương mại số 36/2005/QH11 đã được Quốc hội thông qua ngày 14/06/2005;</li>
      <li>Căn cứ Hợp đồng ủy quyền ngày …………… giữa Công ty CP TMDV Himoto Việt Nam và ………………………………</li>
      <li>Căn cứ vào nhu cầu và khả năng cung ứng của các bên.</li>
    </ul>
    <p className="battery-row"><em>Hôm nay ngày {blank(signed.day, '….')} tháng {blank(signed.month, '…..')} năm {blank(signed.year, '202….')}, Tại:</em> <span className="battery-fill">{blank(doc.signed_place || doc.store_address, '')}</span> <em>chúng tôi gồm:</em></p>
    <p><strong>BÊN A (Bên cho thuê): CÔNG TY CP THƯƠNG MẠI DỊCH VỤ HIMOTO VIỆT NAM</strong></p>
    <p className="battery-cols"><span>- MST: 0110863055</span><span>- Đại diện là Bà: Nguyễn Thu Thủy</span><span>- Chức vụ: Giám đốc</span></p>
    <p>- ĐC trụ sở chính: SN31 - C1 Khu Đồng Bát, BV198 Bộ CA, P. Mai Dịch, Q. Cầu Giấy, TP Hà Nội</p>
    <p className="battery-row"><span>-Tại địa điểm kinh doanh:</span> <span className="battery-fill">{blank(doc.store_address, '')}</span> <span>Số điện thoại liên hệ:</span> <span className="battery-fill battery-fill-short">{blank(doc.store_phone, '')}</span></p>
    <p className="battery-row"><strong>BÊN B (Bên thuê) Ông/Bà:</strong> <span className="battery-fill">{blank(doc.customer_name, '')}</span> <span>Điện thoại:</span> <span className="battery-fill battery-fill-short">{blank(doc.customer_phone, '')}</span></p>
    <p className="battery-row"><span>- Địa chỉ:</span> <span className="battery-fill">{blank(doc.customer_address, '')}</span></p>
    <p className="battery-row"><span>- Số CCCD:</span> <span className="battery-fill">{blank(doc.customer_id_card, '')}</span> <span>Cấp ngày:</span> <span className="battery-fill battery-fill-short">{blank(printedDate(doc.id_card_issued_on), '')}</span> <span>Tại {doc.id_card_issued_by.trim() ? <b>{doc.id_card_issued_by.trim()}</b> : 'Cục cảnh sát'}.</span></p>
    <p>Sau khi bàn bạc, thỏa thuận, hai bên thống nhất ký kết Hợp đồng thuê xe với các điều khoản như sau:</p>
    <p><strong>ĐIỀU 1: NỘI DUNG HỢP ĐỒNG: (Giờ mở cửa: 8h00 – Đóng cửa: 21h00)</strong></p>
    <p className="battery-row"><span>Bên B đồng ý thuê của Bên A 01 {doc.battery_name.trim() || 'Pin xe điện 2.4 của Vinfast'}. Tương ứng với biển số xe của khách:</span> <span className="battery-fill">{blank(doc.vehicle_license, '')}</span></p>
    <p className="battery-cols"><span>- Nhãn hiệu: {blank(doc.vehicle_brand, '…………')}</span><span>- Loại xe: {blank(doc.vehicle_type, '…………')}</span><span>- Màu sắc: {blank(doc.vehicle_color, '………')}</span><span>- Năm sản xuất: {blank(doc.vehicle_year, '……')}</span></p>
    <p><strong>ĐIỀU 2: THỜI HẠN, GIÁ THUÊ, PHƯƠNG THỨC THANH TOÁN:</strong></p>
    <p>2.1. Bắt đầu: <Moment value={doc.starts_at} /> &nbsp;- đến: <Moment value={doc.ends_at} /></p>
    <p className="battery-cols"><span>2.2. Giá thuê: {blank(money(doc.rent_price), '…………')} / {blank(doc.price_unit, '……')}</span><span>- Đã thanh toán: {blank(money(doc.paid_amount), '…………')} <Method value={doc.paid_method} /></span><span>- Gói thuê: {blank(doc.package_name, '…………')}</span></p>
    <p className="battery-row"><span>2.3. Đặt cọc (Tài sản thế chấp):</span> <span className="battery-fill battery-fill-medium">{blank(deposit, '')}</span> <Method value={doc.deposit_method} /></p>
    <p><strong>ĐIỀU 3: QUYỀN VÀ TRÁCH NHIỆM CỦA CÁC BÊN:</strong></p>
    <p><strong>3.1. Quyền và trách nhiệm của bên A:</strong></p>
    <p>- Bảo đảm quyền sử dụng tài sản ổn định cho bên thuê.</p>
    <p>- Bên A được quyền đơn phương chấm dứt hợp đồng, thu hồi lại tài sản cho thuê và các giấy tờ, tài liệu đã bàn giao cho Bên B, yêu cầu bồi thường thiệt hại (nếu có) và yêu cầu phạt vi phạm bằng khoản tiền Bên B đã đặt cọc nếu phát hiện Bên B vi phạm một trong các nội dung đã thỏa thuận tại Hợp đồng này.</p>
    <p>- Khi bên B trả pin cho bên A, bên A phải hoàn lại số tiền cọc cho bên B sau khi cấn trừ mọi chi phí liên quan khác do bên B gây ra (hỏng hóc, sửa chữa và các vấn đề khác do lỗi của bên B – trừ hao mòn tự nhiên)</p>
    <p><strong>3.2. Quyền và trách nhiệm của bên B:</strong></p>
    <p>- Thanh toán tiền thuê pin cho Bên A đúng hạn (tiền thuê thanh toán vào đầu kỳ)</p>
    <p>- Bên B đảm bảo pin không dưới 20%, nếu pin dưới 20% bên B sẽ phải chịu phạt 100k/1 lần. Quá 5 lần bên A sẽ thu hồi pin.</p>
    <p>- Trường hợp xảy ra hỏng hóc pin do lỗi của bên B, bên B phải chịu trách nhiệm bồi thường thiệt hại cho bên A bằng đúng giá trị mua pin mới là 5.000.000 VNĐ.</p>
    <p>- Pin do bên A bàn giao có dán tem logo xác định quyền sở hữu. Trường hợp bên B làm mất tem khiến không xác minh được tài sản, bên B phải bồi thường theo giá trị pin mới.</p>
    <p>- Các thông tin về nhân thân của bên B cung cấp ở trên là đúng và tự chịu trách nhiệm về rủi ro trong quá trình vận hành Pin.</p>
    <p>- Được quyền sử dụng Pin và phải thanh toán tiền thuê pin và trả pin cho bên A đúng hạn hoặc gia hạn HĐ khi hết hạn.</p>
    <p>- Trường hợp có bất cứ sự cố gì về pin, bên B phải thông báo cho bên A, không tự ý sửa chữa, thay thế, thay đổi cấu trúc pin.</p>
    <p>- Không giao pin cho người khác mượn, cất giữ. không được chuyển nhượng, tặng cho, cầm cố, thế chấp, cho thuê lại hoặc thực hiện bất kỳ giao dịch nào có liên quan đến tài sản thuê của bên A</p>
    <p>- Nếu tôi không thể hoàn trả tài sản đã thuê cho bên A, thì dựa theo điều 175 bộ luật hình sự năm 2015 và sửa đổi năm 2017. Tôi xin chịu hoàn toàn trách nhiệm trước pháp luật.</p>
    <p>- Nếu tôi chậm thanh toán tiền thuê Pin, bên A được quyền thu hồi bất cứ lúc nào và tôi chịu mọi chi phí phát sinh trong quá trình trên.</p>
    <p><strong>ĐIỀU 4. ĐIỀU KHOẢN CHUNG</strong></p>
    <p>- Hai bên cam kết thi hành đúng các điều khoản của hợp đồng, không bên nào tự ý đơn phương sửa đổi, đình chỉ hoặc hủy bỏ hợp đồng. Mọi sửa đổi, bổ sung nội dung của Hợp đồng này đều phải lập thành văn bản, có xác nhận của các bên.</p>
    <p>- Hợp đồng này có hiệu lực kể từ ngày ký và được thanh lý sau khi hai bên thực hiện xong nghĩa vụ của mình và không có khiếu nại nào. Hợp đồng được lập thành 02 (hai) bản có giá trị pháp lý như nhau, Bên A giữ 01 bản, Bên B giữ 01 bản.</p>
    <p>Các bên đã đọc lại toàn bộ nội dung Hợp đồng này, đã hiểu và đồng ý với toàn bộ nội dung ghi trong Hợp đồng (bao gồm cả phụ lục hợp đồng kèm theo) và ký xác nhận dưới đây.</p>
    <div className="battery-signatures">
      <div><strong>ĐẠI DIỆN BÊN A</strong><em>(Ký, đóng dấu, ghi rõ họ tên)</em></div>
      <div><strong>BÊN B</strong><em>(ký, ghi rõ họ tên)</em><b className="battery-sign-name">{doc.customer_name.trim()}</b></div>
    </div>
  </div>;
  return <div className="battery-print-wrapper">{PageWrapper ? <PageWrapper>{page}</PageWrapper> : page}</div>;
}
