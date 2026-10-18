import { ComponentType, Fragment, ReactNode } from 'react';
import { LegacyContractDocument } from '@/lib/management/contract-document';
import { ContractPaymentQr } from '@/components/management/ContractPaymentQr';

function PaymentMethod({ value }: { value: string }) {
  const text = value.toLowerCase();
  const transfer = /ck|chuyển khoản|transfer/.test(text), cash = /tiền mặt|cash/.test(text);
  return <span className="payment-method">(<span className={transfer ? 'is-picked' : ''}>CK</span> / <span className={cash ? 'is-picked' : ''}>TM</span>)</span>;
}

// Preserve the legacy legal template.
export function ContractPrintDocument({ doc, pageWrapper,contractId }: { doc: LegacyContractDocument; pageWrapper?: ComponentType<{ children: ReactNode }>;contractId?:number }) {
  const Page = pageWrapper || Fragment;
  const representativeNameA = doc.lessor.representative_name || doc.lessor.authorization.party_name || doc.signers.signer_a_name || '................................';
  const primaryVehicle = doc.primary_vehicle || doc.vehicles[0];
  return (
	<div className="contract-print-wrapper" >
		{/* Watermark khi xem trước / in nháp */}
		{Boolean(doc.is_preview) && (<div className="contract-watermark">
			{doc.contract_number_label || 'BẢN XEM TRƯỚC - CHƯA CẤP SỐ'}
		</div>)}

		{/* Trang 1: A4 Ngang gồm Hợp đồng (Trái) & Phụ lục + Bảng trả xe (Phải) */}
		<Page><div className="contract-page a4-landscape">
			<div className="contract-two-columns">
				{/* CỘT TRÁI: HỢP ĐỒNG THUÊ XE */}
				<div className="contract-col col-left">
					{/* Header Quốc hiệu & Logo Himoto */}
					<div className="header-section d-flex justify-content-between align-items-start">
						<div className="himoto-brand">
							<div className="himoto-logo-badge">
								<span className="logo-title">HIMOTO</span>
								<div className="logo-subtitle">DỊCH VỤ THUÊ XE GIÁ RẺ</div>
							</div>
						</div>
						<div className="national-header text-center">
							<div className="national-title">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
							<div className="national-motto">Độc lập - Tự do - Hạnh phúc</div>
							<div className="header-divider">-----------------</div>
						</div>
					</div>

					<div className="contract-title-wrap text-center mt-1">
						<div className="contract-main-title">HỢP ĐỒNG THUÊ XE</div>
						<div className="contract-meta px-2">
							<span className="contract-num">Số: <strong>{doc.contract_number || '............'}</strong>/HĐTX</span>
							<span className="contract-officer">NV: <strong>{doc.staff_name || '........................'}</strong></span>
						</div>
					</div>

					<div className="legal-references mt-1">
						<p className="legal-line">- Căn cứ Bộ luật Dân sự số 91/2005/QH13 đã được Quốc Hội ban hành ngày 24/11/2015;</p>
						<p className="legal-line">- Căn cứ Luật Thương mại số 36/2005/QH11 đã được Quốc Hội thông qua ngày 14/06/2005;</p>
						<p className="legal-line">- Căn cứ Hợp đồng ủy quyền ký ngày {doc.lessor.authorization.date || '……………'} giữa Công ty CP TMDV Himoto Việt Nam và {doc.lessor.authorization.party_name || representativeNameA}</p>
						<p className="legal-line">- Căn cứ vào nhu cầu và khả năng cung ứng của các bên.</p>
					</div>

					<div className="signed-date-line mt-1">
						<span>{doc.signed_date.full_text}</span>
					</div>

					{/* Bên A */}
					<div className="party-info party-a mt-1">
						<div className="party-name"><strong>BÊN A (Bên cho thuê): {doc.lessor.company_name}</strong></div>
						<div className="party-row d-flex justify-content-between">
							<span>- MST: {doc.lessor.tax_code}</span>
							<span>- Đại diện là Bà: {doc.lessor.director_name}</span>
							<span>- Chức vụ: {doc.lessor.director_title}</span>
						</div>
						<div className="party-row">- ĐC trụ sở chính: {doc.lessor.head_office}</div>
						<div className="party-row d-flex justify-content-between">
							<span className="text-truncate mr-2">- Tại địa điểm kinh doanh: <strong>{doc.lessor.branch_name}</strong>{doc.lessor.branch_address ? ` (${doc.lessor.branch_address})` : ''}</span>
							<span className="flex-shrink-0">Số điện thoại liên hệ: <strong>{doc.lessor.branch_phone || '……………'}</strong></span>
						</div>
						<div className="party-row">- Đại diện ủy quyền: <strong className="text-uppercase">{representativeNameA}</strong></div>
					</div>

					{/* Bên B */}
					<div className="party-info party-b mt-1">
						<div className="party-row d-flex justify-content-between">
							<span><strong>BÊN B (Bên thuê) Ông/Bà:</strong> <strong className="text-uppercase">{doc.customer.name || '...................................................................'}</strong></span>
							<span>Điện thoại: <strong>{doc.customer.phone || '................................'}</strong></span>
						</div>
						<div className="party-row">- Địa chỉ: {doc.customer.address || '...................................................................................................................................................................'}</div>
						<div className="party-row d-flex justify-content-between">
							<span>- {doc.customer.customer_type==='foreign'?'Hộ chiếu / Giấy tờ':'Số CCCD'}: <strong>{doc.customer.id_card || '................................'}</strong></span>
							<span>Cấp ngày: {doc.customer.id_card_issued_on || '....../....../..........'}</span>
							<span className="text-truncate">Tại: {doc.customer.id_card_issued_by || '................................'}</span>
						</div>
						<div className="party-row">- Thông tin người thân: {(doc.relatives || []).slice(0, 2).map(relative => relative.name ? `${relative.name}${relative.relationship ? ` (${relative.relationship})` : ''}${relative.phone ? `: ${relative.phone}` : ''}` : '……………………………………').join(' Và ')}</div>
					</div>

					<div className="contract-intro mt-1">
						Sau khi bàn bạc, thỏa thuận, hai bên thống nhất ký kết Hợp đồng thuê xe với các điều khoản như sau:
					</div>

					{/* Điều 1 */}
					<div className="contract-clause mt-1">
						<div className="clause-heading"><strong>ĐIỀU 1: NỘI DUNG HỢP ĐỒNG:</strong> <span className="hours-badge">(Giờ mở cửa: 8h00 - Đóng cửa: 21h00)</span></div>
						<div className="clause-content">
							<div className="d-flex justify-content-between">
								<span>Bên B đồng ý thuê của bên A số lượng xe moto là: <strong>{doc.vehicles_count}</strong> xe.</span>
								<span>Biển số xe: <strong className="badge-license">{primaryVehicle.license || '................................'}</strong></span>
							</div>
							<div className="d-flex justify-content-between">
								<span>- Nhãn hiệu: <strong>{primaryVehicle.brand || '............'}</strong></span>
								<span>- Loại xe: <strong>{primaryVehicle.type_text || 'Xe ga'}</strong></span>
								<span>- Màu sắc: <strong>{primaryVehicle.color || '............'}</strong></span>
							</div>
							<div className="d-flex justify-content-between">
								<span>- Tên Lái xe: <strong>{primaryVehicle.driver_name || doc.customer.name || '................................................'}</strong></span>
								<span>- GP lái xe: <strong>{primaryVehicle.driver_license_number || '................................'}</strong></span>
								<span>- Cấp ngày: {primaryVehicle.driver_license_issued_on || '....../....../..........'}</span>
							</div>
						</div>
					</div>

					{/* Điều 2 */}
					<div className="contract-clause mt-1">
						<div className="clause-heading"><strong>ĐIỀU 2: THỜI HẠN, GIÁ THUÊ, PHƯƠNG THỨC THANH TOÁN:</strong></div>
						<div className="clause-content">
							<div className="clause-row">
								<strong>2.1.</strong> Bắt đầu: <strong>{doc.rent_time.start.hour}</strong> h <strong>{doc.rent_time.start.minute}</strong> phút, ngày <strong>{doc.rent_time.start.day}</strong> tháng <strong>{doc.rent_time.start.month}</strong> năm <strong>{doc.rent_time.start.year}</strong>
								{' '}- Đến: <strong>{doc.rent_time.end.hour}</strong> h <strong>{doc.rent_time.end.minute}</strong> phút, ngày <strong>{doc.rent_time.end.day}</strong> tháng <strong>{doc.rent_time.end.month}</strong> năm <strong>{doc.rent_time.end.year}</strong>
							</div>
							<div className="clause-row d-flex justify-content-between">
								<span><strong>2.2.</strong> Giá thuê: <strong>{doc.pricing.unit_price_text}</strong>.</span>
								<span>- Đã thanh toán: <strong>{doc.pricing.paid_amount_formatted}</strong> <PaymentMethod value={doc.pricing.payment_method} /></span>
								<span>- Gói thuê: <strong>{doc.pricing.package_name}</strong></span>
							</div>
							<div className="clause-row"><strong>{doc.pricing.calculation_text}</strong></div>
							{doc.pricing.installment_text && <div className="clause-row">{doc.pricing.installment_text}</div>}
							<div className="clause-row">
								<strong>2.3.</strong> Đặt cọc (Tài sản thế chấp): <strong>{doc.deposit.deposit_amount_formatted}</strong>{doc.deposit.collateral_text ? <> – <strong>{doc.deposit.collateral_text}</strong></> : ''} <PaymentMethod value={doc.deposit.payment_method} />
							</div>
						</div>
					</div>

					{/* Điều 3 & 4 */}
					<div className="contract-clause mt-1">
						<div className="clause-heading"><strong>ĐIỀU 3: QUYỀN VÀ NGHĨA VỤ CỦA CÁC BÊN</strong></div>
						<div className="clause-note">(Chi tiết phụ lục kèm theo, là một phần không thể tách rời của hợp đồng này)</div>
						<div className="clause-heading"><strong>ĐIỀU 4: TRÁCH NHIỆM CỦA CÁC BÊN:</strong></div>
						<div className="clause-content">
							<p className="clause-p"><strong>4.1. Trách nhiệm của bên A:</strong></p>
							<p className="clause-p">- Bên A giao chìa khóa và xe cho bên B, kèm theo: <strong>{doc.equipment.total_hats}</strong> mũ bảo hiểm, <strong>{doc.equipment.total_raincoats}</strong> áo mưa.</p>
							<p className="clause-p">- Khi bên B trả xe cho bên A, bên A phải hoàn lại số tiền cọc cho bên B sau khi cấn trừ mọi chi phí liên quan khác do bên B gây ra (hỏng hóc, sửa chữa và các vấn đề khác do lỗi của bên B).</p>
							<p className="clause-p"><strong>4.2. Trách nhiệm của bên B:</strong></p>
							<p className="clause-p">- Các thông tin về nhân thân của bên B cung cấp ở trên là đúng và chấp nhận những cam kết kèm theo phụ lục hợp đồng.</p>
							<p className="clause-p">- Được quyền sử dụng xe để đi lại và phải thanh toán tiền thuê xe và trả xe cho bên A đúng hạn hoặc gia hạn HĐ khi hết hạn.</p>
							<p className="clause-p">- Trường hợp có bất cứ sự cố gì về xe, bên B phải thông báo cho bên A, không tự ý sửa chữa, thay thế, thay đổi cấu trúc xe.</p>
							<p className="clause-p">- Tự chịu mọi trách nhiệm đi xe trên đường, không vi phạm luật giao thông.</p>
							<p className="clause-p">- Không giao xe cho người khác đi lại, mượn, cất giữ. Không dùng xe để vận chuyển hàng cấm, vi phạm pháp luật.</p>
						</div>
					</div>

					{/* Điều 5 */}
					<div className="contract-clause mt-1">
						<div className="clause-heading"><strong>ĐIỀU 5. ĐIỀU KHOẢN CHUNG</strong></div>
						<div className="clause-content">
							<p className="clause-p">- Hai bên cam kết thi hành đúng các điều khoản của hợp đồng, không bên nào tự ý đơn phương sửa đổi, đình chỉ hoặc hủy bỏ hợp đồng. Mọi sửa đổi, bổ sung nội dung của Hợp đồng này đều phải lập thành văn bản, có xác nhận của các bên.</p>
							<p className="clause-p">- Hợp đồng này có hiệu lực kể từ ngày ký và được thanh lý sau khi hai bên thực hiện xong nghĩa vụ của mình và không có khiếu nại nào. Hợp đồng được lập thành 02 (hai) bản có giá trị pháp lý như nhau, Bên A giữ 01 bản, Bên B giữ 01 bản.</p>
							<p className="clause-p">- Các bên đã đọc lại toàn bộ nội dung Hợp đồng này, đã hiểu và đồng ý với toàn bộ nội dung ghi trong Hợp đồng (bao gồm cả phụ lục hợp đồng kèm theo) và ký xác nhận dưới đây.</p>
						</div>
					</div>

				</div>

				{/* CỘT PHẢI: PHỤ LỤC HỢP ĐỒNG & BẢNG XÁC NHẬN TRẢ XE */}
				<div className="contract-col col-right">
					<div className="appendix-title-wrap text-center">
						<div className="appendix-main-title">PHỤ LỤC HỢP ĐỒNG:</div>
						<div className="appendix-subtitle">(Kèm theo hợp đồng và là một phần không thể tách rời của hợp đồng)</div>
					</div>

					<div className="appendix-terms mt-1">
						<div className="term-section">
							<div className="term-heading"><strong>3.1. Quyền và nghĩa vụ của bên A:</strong></div>
							<ul className="term-list">
								<li>Bảo đảm quyền sử dụng tài sản ổn định cho bên thuê.</li>
								<li>Bên A được quyền thực hiện đồng thời việc đơn phương chấm dứt hợp đồng, thu hồi lại tài sản cho thuê và các giấy tờ, tài liệu đã bàn giao cho Bên B, yêu cầu bồi thường thiệt hại (nếu có) và yêu cầu phạt vi phạm bằng khoản tiền Bên B đã đặt cọc nếu phát hiện Bên B vi phạm một trong những nội dung đã thỏa thuận tại Hợp đồng này.</li>
							</ul>
						</div>

						<div className="term-section mt-1">
							<div className="term-heading"><strong>3.2. Quyền và nghĩa vụ của bên B:</strong></div>
							<ul className="term-list">
								<li>Thanh toán tiền thuê xe cho Bên A đúng hạn (tiền thuê được thanh toán vào đầu kỳ).</li>
								<li>Trong quá trình thuê, bên B được quyền ưu tiên mua lại tài sản của bên A theo giá ưu đãi (Nếu Bên B mua lại tài sản thì 2 bên sẽ ký thêm Phụ lục bổ sung kèm theo).</li>
								<li>Bên B có trách nhiệm trả xe đúng hạn theo hợp đồng hoặc phải gia hạn hợp đồng khi hết thời hạn thuê của hợp đồng.</li>
								<li>Quản lý và bảo quản đầy đủ, nguyên trạng tài sản thuê và các giấy tờ kèm theo. Bên B phải chịu toàn bộ thiệt hại, mất mát (bao gồm cả thiệt hại, mất mát không do lỗi của Bên B hoặc do việc bên B vi phạm Hợp đồng hoặc vi phạm pháp luật dẫn đến việc Bên A không thể thu hồi được tài sản thuê khi hết thời hạn thuê), hư hỏng (trừ những hao mòn tự nhiên) đối với xe trong thời gian sử dụng tài sản thuê.</li>
								<li>Trong trường hợp Bên B sử dụng xe thuê của Bên A gây thiệt hại cho bên thứ ba, Bên B phải chịu toàn bộ trách nhiệm với bên thứ ba.</li>
								<li>Trong trường hợp Bên B có hành vi vi phạm pháp luật trong quá trình sử dụng xe, Bên B phải thông báo ngay cho Bên A và Bên B phải chịu toàn bộ trách nhiệm, nghĩa vụ tài chính trong trường hợp bị xử phạt (bao gồm cả nghĩa vụ của chủ xe và người điều khiển phương tiện), kể cả trường hợp Bên B không thông báo và sau khi kết thúc hợp đồng Bên A mới phát hiện hành vi vi phạm của Bên B.</li>
								<li>Trường hợp bên B vi phạm luật giao thông bên B phải chịu 100% phí phạt hành chính cho bên A và bên B, chịu thêm phí gia hạn hợp đồng thuê đến khi trả lại xe cho bên A.</li>
							</ul>
						</div>

						<div className="term-section mt-1">
							<div className="term-heading"><strong>Bên B cam kết:</strong></div>
							<ul className="term-list commitments">
								<li>Nếu tôi không thể hoàn trả tài sản đã thuê cho bên A, thì dựa theo điều 175 Bộ luật Hình sự năm 2015 và sửa đổi năm 2017. Tôi xin chịu hoàn toàn trách nhiệm trước pháp luật.</li>
								<li>Không giao xe cho người khác mượn, không được chuyển nhượng, tặng cho, cầm cố, thế chấp, cho thuê lại hoặc thực hiện bất kỳ giao dịch nào có liên quan đến tài sản thuê của bên A.</li>
								<li>Nếu tôi chậm thanh toán tiền thuê xe không đúng hạn hợp đồng, bên A được quyền thu hồi xe bất cứ lúc nào và tôi chịu mọi chi phí phát sinh trong quá trình trên.</li>
								<li>Làm mất mũ bảo hiểm phạt <strong>70.000 VNĐ/1 mũ</strong>.</li>
							</ul>
						</div>
					</div>

					{/* Ký chung hợp đồng và phụ lục; xác nhận trả xe khi khách trả. */}
					<div className="appendix-confirmations">
						<div className="appendix-signatures mt-2 d-flex">
							<div className="sig-block text-center">
								<div className="sig-role font-weight-bold">ĐẠI DIỆN BÊN A</div>
								<div className="sig-hint">(Ký, đóng dấu, ghi rõ họ tên)</div>
								<div className="sig-space"></div>
								<div className="sig-name font-weight-bold text-uppercase">{doc.signers.signer_a_name || representativeNameA}</div>
							</div>
							<div className="sig-block text-center">
								<div className="sig-role font-weight-bold">BÊN B</div>
								<div className="sig-hint">(Ký, ghi rõ họ tên)</div>
								<div className="sig-space"></div>
								<div className="sig-name font-weight-bold text-uppercase">{doc.signers.signer_b_name}</div>
							</div>
						</div>

						<div className="return-receipt-box mt-2">
							<div className="receipt-company text-center font-weight-bold">
								CÔNG TY CỔ PHẦN THƯƠNG MẠI<br />DỊCH VỤ HIMOTO VIỆT NAM
							</div>
							<div className="receipt-title text-center font-weight-bold">BẢNG XÁC NHẬN VIỆC TRẢ XE</div>
							<table className="receipt-table w-100" aria-label="Bảng xác nhận việc trả xe">
								<tbody>
									<tr>
										<td className="receipt-td-label">Giờ trả xe</td>
										<td>{doc.return_confirmation.return_hour || '……'} h {doc.return_confirmation.return_minute || '……'} phút</td>
										<td className="receipt-td-label">Xác nhận của Bên A:</td>
										<td>{doc.return_confirmation.signer_a_name}</td>
									</tr>
									<tr>
										<td className="receipt-td-label">Số tiền trả khách</td>
										<td>{doc.return_confirmation.refund_amount_formatted || '……………………'} Và {doc.return_confirmation.additional_note || '………………'}</td>
										<td className="receipt-td-label">Bên B ký tên:</td>
										<td>{doc.return_confirmation.signer_b_name}</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>
					{contractId&&<ContractPaymentQr id={contractId} compact/>}
				</div>
			</div>
		</div></Page>

		{/* Trang 2 (Tùy chọn): Phụ lục danh sách xe thuê nếu có từ 2 xe trở lên */}
		{Boolean(doc.vehicles_count > 1) && (<Page><div className="contract-page a4-landscape page-break mt-4">
			<div className="appendix-multi-vehicles p-3">
				<div className="text-center mb-3">
					<h4 className="font-weight-bold">PHỤ LỤC DANH SÁCH XE THUÊ</h4>
					<p className="font-italic mb-0">Đính kèm Hợp đồng thuê xe số: <strong>{doc.contract_number}</strong>/HĐTX ký ngày {doc.signed_date.full_text}</p>
				</div>

				<table className="table table-bordered table-sm">
					<thead className="bg-light text-center">
						<tr>
							<th style={{ width: "40px" }}>STT</th>
							<th>Tên xe</th>
							<th>Biển số</th>
							<th>Loại xe</th>
							<th>Màu sắc</th>
							<th>Người lái</th>
							<th>GPLX</th>
							<th>Mũ BH</th>
							<th>Áo mưa</th>
							<th>Thời gian thuê</th>
						</tr>
					</thead>
					<tbody>
						{doc.vehicles.map((v, idx) => <tr key={idx} className="text-center">
							<td>{idx + 1}</td>
							<td className="text-left font-weight-bold">{v.name}</td>
							<td className="font-weight-bold text-danger">{v.license}</td>
							<td>{v.type_text}</td>
							<td>{v.color}</td>
							<td className="text-left">{v.driver_name}</td>
							<td>{v.driver_license_number} {Boolean(v.driver_license_issued_on) && (<span className="small d-block">({v.driver_license_issued_on})</span>)}</td>
							<td>{v.borrow_hats}</td>
							<td>{v.borrow_raincoats}</td>
							<td className="small text-left">
								<div>Từ: {v.rent_at}</div>
								<div>Đến: {v.return_at}</div>
							</td>
						</tr>)}
					</tbody>
				</table>

			</div>
		</div></Page>)}

		{doc.ownership_schedule.length > 0 && <Page><div className="contract-page a4-landscape page-break mt-4">
			<div className="appendix-ownership-billing p-3">
				<div className="text-center mb-3">
					<h4 className="font-weight-bold">PHỤ LỤC LỊCH ĐÓNG TIỀN THUÊ SỞ HỮU</h4>
					<p>Đính kèm Hợp đồng thuê xe số: <strong>{doc.contract_number}</strong>/HĐTX</p>
					<p>Khoản đầu tiên thu khi lập hợp đồng. Các khoản tiếp theo thu theo ngày hẹn; tiền cọc ghi riêng trong hợp đồng.</p>
				</div>
				<table className="table table-bordered table-sm">
					<thead><tr><th scope="col">Lần đóng</th><th scope="col">Ngày hẹn đóng tiền</th><th scope="col">Tiền thuê (VNĐ)</th></tr></thead>
					<tbody>{doc.ownership_schedule.map(period => <tr key={period.number}><td>{period.number}</td><td>{period.due_at.slice(0, 10).split('-').reverse().join('/')} {period.due_at.slice(11)}</td><td>{period.amount.toLocaleString('vi-VN')}</td></tr>)}</tbody>
					<tfoot><tr><th colSpan={2} scope="row">Tổng tiền thuê theo lịch (cọc riêng)</th><td>{doc.ownership_schedule.reduce((sum, period) => sum + period.amount, 0).toLocaleString('vi-VN')}</td></tr></tfoot>
				</table>
			</div>
		</div></Page>}
	</div>
);
}
