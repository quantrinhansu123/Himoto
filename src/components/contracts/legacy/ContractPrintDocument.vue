<template>
	<div class="contract-print-wrapper" :class="{ 'is-preview-mode': doc.is_preview }">
		<!-- Watermark khi xem trước / in nháp -->
		<div v-if="doc.is_preview" class="contract-watermark">
			{{ doc.contract_number_label || 'BẢN XEM TRƯỚC - CHƯA CẤP SỐ' }}
		</div>

		<!-- Trang 1: A4 Ngang gồm Hợp đồng (Trái) & Phụ lục + Bảng trả xe (Phải) -->
		<div class="contract-page a4-landscape">
			<div class="contract-two-columns">
				<!-- CỘT TRÁI: HỢP ĐỒNG THUÊ XE -->
				<div class="contract-col col-left">
					<!-- Header Quốc hiệu & Logo Himoto -->
					<div class="header-section d-flex justify-content-between align-items-start">
						<div class="himoto-brand">
							<div class="himoto-logo-badge">
								<span class="logo-title">HIMOTO</span>
								<div class="logo-subtitle">DỊCH VỤ THUÊ XE GIÁ RẺ</div>
							</div>
						</div>
						<div class="national-header text-center">
							<div class="national-title">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
							<div class="national-motto">Độc lập - Tự do - Hạnh phúc</div>
							<div class="header-divider">-----------------</div>
						</div>
					</div>

					<div class="contract-title-wrap text-center mt-1">
						<div class="contract-main-title">HỢP ĐỒNG THUÊ XE</div>
						<div class="contract-meta d-flex justify-content-between px-2">
							<span class="contract-num">Số: <strong>{{ doc.contract_number || '............' }}</strong>/HĐTX</span>
							<span class="contract-officer">Nguồn khách:
								<a v-if="doc.customer_source && doc.customer_source.url" :href="doc.customer_source.url" target="_blank" rel="noopener noreferrer"><strong>{{ doc.customer_source.name || doc.customer_source.url }}</strong></a>
								<strong v-else>{{ doc.customer_source && doc.customer_source.name ? doc.customer_source.name : '........................' }}</strong>
							</span>
						</div>
					</div>

					<div class="legal-references mt-1">
						<p class="legal-line">- Căn cứ Bộ Luật Dân sự số 91/2005/QH13 đã được Quốc Hội ban hành ngày 24/11/2015;</p>
						<p class="legal-line">- Căn cứ Luật Thương mại số 36/2005/QH11 đã được Quốc Hội thông qua ngày 14/06/2005;</p>
						<p class="legal-line">- Căn cứ Hợp đồng ủy quyền ký ngày: {{ (doc.lessor.authorization && doc.lessor.authorization.date) || '........................' }} giữa Công ty CP TMDV Himoto Việt Nam và {{ (doc.lessor.authorization && doc.lessor.authorization.party_name) || representativeNameA }}</p>
						<p class="legal-line">- Căn cứ vào nhu cầu và khả năng cung ứng của các bên.</p>
					</div>

					<div class="signed-date-line mt-1">
						<span>{{ doc.signed_date.full_text }}</span>
					</div>

					<!-- Bên A -->
					<div class="party-info party-a mt-1">
						<div class="party-name"><strong>Bên A (Bên cho thuê): {{ doc.lessor.company_name }}</strong></div>
						<div class="party-row d-flex justify-content-between">
							<span>- MST: {{ doc.lessor.tax_code }}</span>
							<span class="text-truncate mr-2">- Tại ĐĐ kinh doanh: <strong>{{ doc.lessor.branch_name }}</strong> ({{ doc.lessor.branch_address }})</span>
							<span class="flex-shrink-0">SĐT: <strong>{{ doc.lessor.branch_phone }}</strong></span>
						</div>
						<div class="party-row">- ĐC trụ sở chính: {{ doc.lessor.head_office }}</div>
						<div class="party-row d-flex justify-content-between">
							<span>- NGƯỜI ỦY QUYỀN A: <strong class="text-uppercase">{{ representativeNameA }}</strong> <span v-if="doc.lessor.authorization && doc.lessor.authorization.date" class="font-italic small ml-1">(Ngày {{ doc.lessor.authorization.date }})</span></span>
							<span>- Chức vụ: <strong>{{ doc.lessor.representative_title || 'Nhân viên quầy giao dịch' }}</strong></span>
						</div>
					</div>

					<!-- Bên B -->
					<div class="party-info party-b mt-1">
						<div class="party-row d-flex justify-content-between">
							<span><strong>Bên B (Bên thuê) Ông/Bà:</strong> <strong class="text-uppercase">{{ doc.customer.name || '...................................................................' }}</strong></span>
							<span>Điện thoại: <strong>{{ doc.customer.phone || '................................' }}</strong></span>
						</div>
						<div class="party-row">- Địa chỉ: {{ doc.customer.address || '...................................................................................................................................................................' }}</div>
						<div class="party-row d-flex justify-content-between">
							<span>- Số CCCD: <strong>{{ doc.customer.id_card || '................................' }}</strong></span>
							<span>Cấp ngày: {{ doc.customer.id_card_issued_on || '....../....../..........' }}</span>
							<span class="text-truncate">Tại: {{ doc.customer.id_card_issued_by || '................................' }}</span>
						</div>
						<div class="party-row">- Thông tin người thân: {{ doc.customer.relatives_text || '...................................................................................................................................................................' }}</div>
					</div>

					<div class="contract-intro mt-1">
						Sau khi bàn bạc, thỏa thuận, hai bên thống nhất ký kết Hợp đồng thuê xe với các điều khoản như sau:
					</div>

					<!-- Điều 1 -->
					<div class="contract-clause mt-1">
						<div class="clause-heading"><strong>ĐIỀU 1: NỘI DUNG HỢP ĐỒNG:</strong> <span class="hours-badge">(Giờ mở cửa: 8h00 - Đóng cửa: 21h00)</span></div>
						<div class="clause-content">
							<div class="d-flex justify-content-between">
								<span>Bên B đồng ý thuê của bên A số lượng xe moto là: <strong>{{ doc.vehicles_count }}</strong> xe.</span>
								<span>Biển số xe: <strong class="badge-license">{{ primaryVehicle.license || '................................' }}</strong></span>
							</div>
							<div class="d-flex justify-content-between">
								<span>- Nhãn hiệu: <strong>{{ primaryVehicle.brand || '............' }}</strong></span>
								<span>- Loại xe: <strong>{{ primaryVehicle.type_text || 'Xe ga' }}</strong></span>
								<span>- Màu sắc: <strong>{{ primaryVehicle.color || '............' }}</strong></span>
								<span>- Năm SX: <strong>{{ primaryVehicle.year || '............' }}</strong></span>
							</div>
							<div class="d-flex justify-content-between">
								<span>- Tên Lái xe: <strong>{{ primaryVehicle.driver_name || doc.customer.name || '................................................' }}</strong></span>
								<span>- GP lái xe: <strong>{{ primaryVehicle.driver_license_number || '................................' }}</strong></span>
								<span>- Cấp ngày: {{ primaryVehicle.driver_license_issued_on || '....../....../..........' }}</span>
							</div>
						</div>
					</div>

					<!-- Điều 2 -->
					<div class="contract-clause mt-1">
						<div class="clause-heading"><strong>ĐIỀU 2: THỜI HẠN, GIÁ THUÊ, PHƯƠNG THỨC THANH TOÁN:</strong></div>
						<div class="clause-content">
							<div class="clause-row">
								<strong>2.1.</strong> Bắt đầu: <strong>{{ doc.rent_time.start.hour }}</strong> h <strong>{{ doc.rent_time.start.minute }}</strong> phút, ngày <strong>{{ doc.rent_time.start.day }}</strong>/<strong>{{ doc.rent_time.start.month }}</strong>/<strong>{{ doc.rent_time.start.year }}</strong>
								- đến: <strong>{{ doc.rent_time.end.hour }}</strong> h <strong>{{ doc.rent_time.end.minute }}</strong> phút, ngày <strong>{{ doc.rent_time.end.day }}</strong>/<strong>{{ doc.rent_time.end.month }}</strong>/<strong>{{ doc.rent_time.end.year }}</strong>
							</div>
							<div class="clause-row d-flex justify-content-between">
								<span><strong>2.2.</strong> Giá thuê: <strong>{{ doc.pricing.unit_price_text }}</strong></span>
								<span>- Đã thanh toán: <strong>{{ doc.pricing.paid_amount_formatted }}</strong> ({{ doc.pricing.payment_method_text }})</span>
								<span>- Gói: <strong>{{ doc.pricing.package_name }}</strong></span>
							</div>
							<div class="clause-row"><strong>{{ doc.pricing.calculation_text }}</strong></div>
							<div class="clause-row">
								<strong>2.3.</strong> Đặt cọc (Tài sản thế chấp): <strong>{{ doc.deposit.deposit_amount_formatted }}</strong> ({{ doc.deposit.collateral_description }}) ({{ doc.deposit.payment_method_text }})
							</div>
						</div>
					</div>

					<!-- Điều 3 & 4 -->
					<div class="contract-clause mt-1">
						<div class="clause-heading"><strong>ĐIỀU 3: QUYỀN VÀ NGHĨA VỤ CỦA CÁC BÊN</strong> <span class="sub-text">(Chi tiết phụ lục kèm theo, là một phần không thể tách rời của hợp đồng này)</span></div>
						<div class="clause-heading"><strong>ĐIỀU 4: TRÁCH NHIỆM CỦA CÁC BÊN:</strong></div>
						<div class="clause-content">
							<p class="clause-p"><strong>4.1. Trách nhiệm của bên A:</strong> Bên A giao chìa khóa và xe cho bên B, kèm theo: <strong>{{ doc.equipment.total_hats }}</strong> mũ bảo hiểm, <strong>{{ doc.equipment.total_raincoats }}</strong> áo mưa. Khi bên B trả xe cho bên A, bên A phải hoàn lại số tiền cọc cho bên B sau khi cấn trừ mọi chi phí liên quan khác do bên B gây ra (hỏng hóc, sửa chữa và các vấn đề khác do lỗi của bên B).</p>
							<p class="clause-p"><strong>4.2. Trách nhiệm của bên B:</strong> Các thông tin về nhân thân của bên B cung cấp ở trên là đúng và chấp nhận những cam kết kèm theo phụ lục hợp đồng. Được quyền sử dụng xe để đi lại và phải thanh toán tiền thuê xe và trả xe cho bên A đúng hạn hoặc gia hạn HĐ khi hết hạn. Trường hợp có bất cứ sự cố gì về xe, bên B phải thông báo cho bên A, không tự ý sửa chữa, thay thế, thay đổi cấu trúc xe. Tự chịu mọi trách nhiệm đi xe trên đường, không vi phạm luật giao thông. Không giao xe cho người khác mượn, không dùng xe chở hàng cấm, vi phạm pháp luật.</p>
						</div>
					</div>

					<!-- Điều 5 -->
					<div class="contract-clause mt-1">
						<div class="clause-heading"><strong>ĐIỀU 5. ĐIỀU KHOẢN CHUNG:</strong></div>
						<div class="clause-content">
							<p class="clause-p">Hai bên cam kết thi hành đúng các điều khoản của hợp đồng này... Hợp đồng này có hiệu lực từ ngày ký và được thanh lý sau khi hai bên thực hiện xong nghĩa vụ. Hợp đồng được lập thành 02 (hai) bản có giá trị pháp lý như nhau, Bên A giữ 01 bản, Bên B giữ 01 bản.</p>
						</div>
					</div>

					<!-- Chữ ký Hợp đồng -->
					<div class="contract-signatures mt-2 d-flex justify-content-between px-3">
						<div class="sig-block text-center">
							<div class="sig-role font-weight-bold">NGƯỜI ỦY QUYỀN A</div>
							<div class="sig-hint">(Ký, đóng dấu, ghi rõ họ tên)</div>
							<div class="sig-space"></div>
							<div class="sig-name font-weight-bold text-uppercase">{{ doc.signers.signer_a_name || representativeNameA }}</div>
						</div>
						<div class="sig-block text-center">
							<div class="sig-role font-weight-bold">BÊN B</div>
							<div class="sig-hint">(Ký, ghi rõ họ tên)</div>
							<div class="sig-space"></div>
							<div class="sig-name font-weight-bold text-uppercase">{{ doc.signers.signer_b_name }}</div>
						</div>
					</div>
				</div>

				<!-- CỘT PHẢI: PHỤ LỤC HỢP ĐỒNG & BẢNG XÁC NHẬN TRẢ XE -->
				<div class="contract-col col-right">
					<div class="appendix-title-wrap text-center">
						<div class="appendix-main-title">PHỤ LỤC HỢP ĐỒNG:</div>
						<div class="appendix-subtitle">(kèm theo hợp đồng và là một phần không thể tách rời của hợp đồng)</div>
					</div>

					<div class="appendix-terms mt-1">
						<div class="term-section">
							<div class="term-heading"><strong>3.1. Quyền và nghĩa vụ của bên A:</strong></div>
							<ul class="term-list">
								<li>Bảo đảm quyền sử dụng tài sản ổn định cho bên thuê.</li>
								<li>Bên A được quyền thực hiện đồng thời việc đơn phương chấm dứt hợp đồng, thu hồi lại tài sản cho thuê và các giấy tờ, tài liệu đã bàn giao cho Bên B, yêu cầu bồi thường thiệt hại (nếu có) và yêu cầu phạt vi phạm bằng khoản tiền Bên B đã đặt cọc nếu phát hiện Bên B vi phạm một trong những nội dung đã thỏa thuận tại Hợp đồng này.</li>
							</ul>
						</div>

						<div class="term-section mt-1">
							<div class="term-heading"><strong>3.2. Quyền và nghĩa vụ của bên B:</strong></div>
							<ul class="term-list">
								<li>Thanh toán tiền thuê xe cho Bên A đúng hạn (tiền thuê được thanh toán vào đầu kỳ).</li>
								<li>Trong quá trình thuê, bên B được quyền ưu tiên mua lại tài sản của bên A theo giá ưu đãi (Nếu Bên B mua lại tài sản thì 2 bên sẽ ký thêm Phụ lục bổ sung kèm theo).</li>
								<li>Bên B có trách nhiệm trả xe đúng hạn theo hợp đồng hoặc phải gia hạn hợp đồng khi hết thời hạn thuê của hợp đồng.</li>
								<li>Quản lý và bảo quản đầy đủ, nguyên trạng tài sản thuê và các giấy tờ kèm theo. Bên B phải chịu toàn bộ thiệt hại, mất mát (bao gồm cả thiệt hại, mất mát không do lỗi của Bên B hoặc do việc bên B vi phạm Hợp đồng hoặc vi phạm pháp luật dẫn đến việc Bên A không thể thu hồi được tài sản thuê khi hết thời hạn thuê), hư hỏng (trừ những hao mòn tự nhiên) đối với xe trong thời gian sử dụng tài sản thuê.</li>
								<li>Trong trường hợp Bên B sử dụng xe thuê của Bên A gây thiệt hại cho bên thứ ba, Bên B phải chịu toàn bộ trách nhiệm với bên thứ ba.</li>
								<li>Trong trường hợp Bên B có hành vi vi phạm pháp luật trong quá trình sử dụng xe, Bên B phải thông báo ngay cho Bên A và Bên B phải chịu toàn bộ trách nhiệm, nghĩa vụ tài chính trong trường hợp bị xử phạt (bao gồm cả nghĩa vụ của chủ xe và người điều khiển phương tiện), kể cả trường hợp Bên B không thông báo và sau khi kết thúc hợp đồng Bên A mới phát hiện hành vi vi phạm của Bên B.</li>
								<li>Trường hợp bên B vi phạm luật giao thông bên B phải chịu 100% phí phạt hành chính cho bên A và bên B, chịu thêm phí gia hạn hợp đồng thuê đến khi trả lại xe cho bên A.</li>
							</ul>
						</div>

						<div class="term-section mt-1">
							<div class="term-heading"><strong>Bên B cam kết:</strong></div>
							<ul class="term-list commitments">
								<li>Nếu tôi không thể hoàn trả tài sản đã thuê cho bên A, thì dựa theo điều 175 bộ luật hình sự năm 2015 và sửa đổi năm 2017. Tôi xin chịu hoàn toàn trách nhiệm trước pháp luật.</li>
								<li>Không giao xe cho người khác mượn, không được chuyển nhượng, tặng cho, cầm cố, thế chấp, cho thuê lại hoặc thực hiện bất kỳ giao dịch nào có liên quan đến tài sản thuê của bên A.</li>
								<li>Nếu tôi chậm thanh toán tiền thuê xe không đúng hạn hợp đồng, bên A được quyền thu hồi xe bất cứ lúc nào và tôi chịu mọi chi phí phát sinh trong quá trình trên.</li>
								<li>Làm mất mũ bảo hiểm phạt <strong>70.000 VNĐ/1 mũ</strong>.</li>
							</ul>
						</div>
					</div>

					<!-- Chữ ký Phụ lục -->
					<div class="appendix-signatures mt-1 d-flex justify-content-between px-3">
						<div class="sig-block text-center">
							<div class="sig-role font-weight-bold">ĐẠI DIỆN BÊN A</div>
							<div class="sig-hint">(Ký, đóng dấu, ghi rõ họ tên)</div>
							<div class="sig-space-sm"></div>
							<div class="sig-name font-weight-bold text-uppercase">{{ doc.signers.signer_a_name || representativeNameA }}</div>
						</div>
						<div class="sig-block text-center">
							<div class="sig-role font-weight-bold">BÊN B</div>
							<div class="sig-hint">(Ký, ghi rõ họ tên)</div>
							<div class="sig-space-sm"></div>
							<div class="sig-name font-weight-bold text-uppercase">{{ doc.signers.signer_b_name }}</div>
						</div>
					</div>

					<!-- BẢNG XÁC NHẬN VIỆC TRẢ XE -->
					<div class="return-receipt-box mt-2">
						<div class="receipt-company text-center font-weight-bold">
							CÔNG TY CỔ PHẦN THƯƠNG MẠI DỊCH VỤ HIMOTO VIỆT NAM
						</div>
						<div class="receipt-title text-center font-weight-bold">
							BẢNG XÁC NHẬN VIỆC TRẢ XE
						</div>
						<table class="receipt-table w-100">
							<tbody>
								<tr>
									<td class="receipt-td-label" style="width: 25%;">Giờ trả xe:</td>
									<td class="receipt-td-val" style="width: 25%;">
										<strong>{{ doc.return_confirmation.return_hour || '.....' }}</strong> h <strong>{{ doc.return_confirmation.return_minute || '.....' }}</strong> phút
									</td>
									<td class="receipt-td-label" style="width: 25%;">Xác nhận Bên A:</td>
									<td class="receipt-td-val" style="width: 25%;">
										{{ doc.return_confirmation.signer_a_name || representativeNameA }}
									</td>
								</tr>
								<tr>
									<td class="receipt-td-label">Số tiền trả khách:</td>
									<td class="receipt-td-val" colspan="2">
										<strong>{{ doc.return_confirmation.refund_amount_formatted || '................................' }}</strong>
										<span v-if="doc.return_confirmation.additional_note" class="ml-2 font-italic small">({{ doc.return_confirmation.additional_note }})</span>
									</td>
									<td class="receipt-td-val text-center">
										<div>Bên B ký tên:</div>
										<div class="receipt-sig-space"></div>
										<strong>{{ doc.return_confirmation.signer_b_name || '' }}</strong>
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>

		<!-- Trang 2 (Tùy chọn): Phụ lục danh sách xe thuê nếu có từ 2 xe trở lên -->
		<div v-if="doc.vehicles_count > 1" class="contract-page a4-landscape page-break mt-4">
			<div class="appendix-multi-vehicles p-3">
				<div class="text-center mb-3">
					<h4 class="font-weight-bold">PHỤ LỤC DANH SÁCH XE THUÊ</h4>
					<p class="font-italic mb-0">Đính kèm Hợp đồng thuê xe số: <strong>{{ doc.contract_number }}</strong>/HĐTX ký ngày {{ doc.signed_date.full_text }}</p>
				</div>

				<table class="table table-bordered table-sm">
					<thead class="bg-light text-center">
						<tr>
							<th style="width: 40px;">STT</th>
							<th>Tên xe</th>
							<th>Biển số</th>
							<th>Loại xe</th>
							<th>Màu sắc</th>
							<th>Năm SX</th>
							<th>Người lái</th>
							<th>GPLX</th>
							<th>Mũ BH</th>
							<th>Áo mưa</th>
							<th>Thời gian thuê</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="(v, idx) in doc.vehicles" :key="idx" class="text-center">
							<td>{{ idx + 1 }}</td>
							<td class="text-left font-weight-bold">{{ v.name }}</td>
							<td class="font-weight-bold text-danger">{{ v.license }}</td>
							<td>{{ v.type_text }}</td>
							<td>{{ v.color }}</td>
							<td>{{ v.year }}</td>
							<td class="text-left">{{ v.driver_name }}</td>
							<td>{{ v.driver_license_number }} <span v-if="v.driver_license_issued_on" class="small d-block">({{ v.driver_license_issued_on }})</span></td>
							<td>{{ v.borrow_hats }}</td>
							<td>{{ v.borrow_raincoats }}</td>
							<td class="small text-left">
								<div>Từ: {{ v.rent_at }}</div>
								<div>Đến: {{ v.return_at }}</div>
							</td>
						</tr>
					</tbody>
				</table>

				<div class="d-flex justify-content-between mt-4 px-5">
					<div class="text-center">
						<div class="font-weight-bold">ĐẠI DIỆN BÊN A</div>
						<div class="sig-space"></div>
						<div class="font-weight-bold text-uppercase">{{ doc.signers.signer_a_name || representativeNameA }}</div>
					</div>
					<div class="text-center">
						<div class="font-weight-bold">BÊN B</div>
						<div class="sig-space"></div>
						<div class="font-weight-bold text-uppercase">{{ doc.signers.signer_b_name }}</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script>
export default {
	name: "ContractPrintDocument",
	props: {
		doc: {
			type: Object,
			required: true,
			default: () => ({
				is_preview: true,
				contract_number: "",
				signed_date: {},
				lessor: { authorization: {} },
				customer: {},
				vehicles: [],
				vehicles_count: 1,
				primary_vehicle: {},
				rent_time: { start: {}, end: {} },
				pricing: {},
				deposit: {},
				equipment: {},
				signers: {},
				return_confirmation: {},
			}),
		},
	},
	computed: {
		representativeNameA() {
			const rep = this.doc?.lessor?.representative_name;
			const auth = this.doc?.lessor?.authorization?.party_name;
			const signer = this.doc?.signers?.signer_a_name;
			return (rep && rep !== '........................') ? rep : (auth || signer || '................................');
		},
		primaryVehicle() {
			if (this.doc.primary_vehicle && (this.doc.primary_vehicle.license || this.doc.primary_vehicle.name)) {
				return this.doc.primary_vehicle;
			}
			if (this.doc.vehicles && this.doc.vehicles.length > 0) {
				return this.doc.vehicles[0];
			}
			return {};
		},
	},
};
</script>

<style scoped>
.contract-print-wrapper {
	position: relative;
	background: #fff;
	color: #111;
	font-family: "Times New Roman", Times, serif;
	font-size: 11px;
	line-height: 1.25;
	margin: 0 auto;
}

.contract-page.a4-landscape {
	width: 285mm;
	min-height: 195mm;
	padding: 6mm 8mm;
	background: #fff;
	box-sizing: border-box;
	margin: 0 auto;
	box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
	position: relative;
}

.contract-two-columns {
	display: flex;
	width: 100%;
}

.contract-col {
	width: 50%;
	box-sizing: border-box;
}

.col-left {
	padding-right: 12px;
	border-right: 1px dashed #777;
}

.col-right {
	padding-left: 12px;
}

/* Watermark */
.contract-watermark {
	position: absolute;
	top: 45%;
	left: 50%;
	transform: translate(-50%, -50%) rotate(-25deg);
	font-size: 40px;
	font-weight: 900;
	color: rgba(220, 53, 69, 0.14);
	border: 5px dashed rgba(220, 53, 69, 0.2);
	padding: 12px 30px;
	text-transform: uppercase;
	pointer-events: none;
	z-index: 99;
	letter-spacing: 2px;
	text-align: center;
	white-space: nowrap;
}

/* Header Himoto Brand */
.himoto-brand {
	width: 130px;
}

.himoto-logo-badge {
	border: 1.5px solid #d32f2f;
	padding: 2px 4px;
	text-align: center;
}

.himoto-logo-badge .logo-title {
	font-size: 20px;
	font-weight: 900;
	color: #d32f2f;
	letter-spacing: 1px;
	display: block;
	line-height: 1;
}

.himoto-logo-badge .logo-subtitle {
	font-size: 8px;
	font-weight: bold;
	background: #111;
	color: #fff;
	padding: 1px 2px;
	margin-top: 2px;
	letter-spacing: 0.5px;
}

.national-header .national-title {
	font-size: 11px;
	font-weight: bold;
}

.national-header .national-motto {
	font-size: 10.5px;
	font-weight: bold;
}

.header-divider {
	letter-spacing: 2px;
	font-size: 10px;
	line-height: 1;
}

.contract-main-title {
	font-size: 16px;
	font-weight: bold;
	letter-spacing: 0.5px;
}

.contract-meta {
	font-size: 10.5px;
}

.legal-references {
	font-size: 9.5px;
	font-style: italic;
	line-height: 1.2;
}

.legal-line {
	margin-bottom: 1px;
}

.signed-date-line {
	font-size: 10.5px;
	font-style: italic;
}

.party-info {
	font-size: 10px;
	line-height: 1.25;
}

.party-row {
	margin-bottom: 1px;
}

.contract-intro {
	font-size: 10px;
	font-style: italic;
}

.contract-clause {
	font-size: 10px;
	line-height: 1.25;
}

.clause-heading {
	font-size: 10.5px;
}

.hours-badge {
	font-size: 9.5px;
	font-weight: normal;
	font-style: italic;
}

.clause-p {
	margin-bottom: 2px;
	text-align: justify;
}

.badge-license {
	display: inline-block;
	border: 1px solid #111;
	padding: 0 4px;
	border-radius: 2px;
}

.sig-block {
	width: 48%;
}

.sig-role {
	font-size: 11px;
}

.sig-hint {
	font-size: 9px;
	font-style: italic;
}

.sig-space {
	height: 35px;
}

.sig-space-sm {
	height: 25px;
}

.sig-name {
	font-size: 10.5px;
}

/* Cột Phải - Phụ lục */
.appendix-main-title {
	font-size: 13px;
	font-weight: bold;
}

.appendix-subtitle {
	font-size: 9.5px;
	font-style: italic;
}

.appendix-terms {
	font-size: 9.5px;
	line-height: 1.2;
}

.term-heading {
	font-size: 10px;
}

.term-list {
	padding-left: 14px;
	margin-bottom: 2px;
	text-align: justify;
}

.term-list li {
	margin-bottom: 2px;
}

.term-list.commitments li {
	margin-bottom: 2px;
}

/* Bảng xác nhận trả xe */
.return-receipt-box {
	border: 1.5px solid #111;
	padding: 4px;
	margin-top: 4px;
}

.receipt-company {
	font-size: 10px;
}

.receipt-title {
	font-size: 11px;
	letter-spacing: 0.5px;
}

.receipt-table {
	border-collapse: collapse;
	margin-top: 3px;
	font-size: 9.5px;
}

.receipt-table td {
	border: 1px solid #666;
	padding: 2px 4px;
}

.receipt-td-label {
	font-weight: bold;
	background: #f9f9f9;
}

.receipt-sig-space {
	height: 20px;
}

/* In ấn @media print */
@media print {
	@page {
		size: A4 landscape;
		margin: 6mm 6mm;
	}

	body * {
		visibility: hidden !important;
	}

	.contract-print-wrapper,
	.contract-print-wrapper * {
		visibility: visible !important;
	}

	.contract-print-wrapper {
		position: absolute;
		left: 0;
		top: 0;
		width: 100% !important;
		margin: 0 !important;
		padding: 0 !important;
		background: transparent !important;
	}

	.contract-page.a4-landscape {
		width: 100% !important;
		min-height: auto !important;
		padding: 0 !important;
		margin: 0 !important;
		box-shadow: none !important;
	}

	.page-break {
		page-break-before: always;
	}
}
</style>
