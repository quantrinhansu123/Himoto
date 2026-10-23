'use client';
import {OWNERSHIP_REPORT_GROUPS,ownershipReportText,reconciliation,type OwnershipReport,type OwnershipReportKey} from '@/lib/management/ownership-report';

export function OwnershipReportFields({report,date,onChange,readonly}:{report:OwnershipReport;date:string;onChange:(value:OwnershipReport)=>void;readonly:boolean}){
  function change(key:OwnershipReportKey,value:string){
    onChange({...report,values:{...report.values,[key]:value===''?null:Number(value)},manual:[...new Set([...report.manual,key])]});
  }
  return <div className="mg-ownership-report"><p>Số liệu có nguồn được tự thống kê. Ô trống cần nhập số thực tế; nhập 0 nếu đã kiểm tra không phát sinh. Số trong mẫu không được dùng làm dữ liệu.</p>
    {report.read_at&&<small>Đọc số liệu: {new Date(report.read_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</small>}
    {OWNERSHIP_REPORT_GROUPS.map((group,index)=><details key={group.title} open><summary>{group.title}</summary><div className="mg-form-grid">{group.fields.map(([key,label])=><label className="mg-field" key={key} htmlFor={`ownership-${key}`}>{label}{index>0?' (đồng)':''}<input id={`ownership-${key}`} type="number" step="1" min={index===0?0:undefined} max={index===0?100000:1e12} value={report.values[key]??''} placeholder="Chưa có nguồn / nhập thực tế" readOnly={readonly} onChange={e=>change(key,e.target.value)}/><small>{report.manual.includes(key)?'Đã nhập / điều chỉnh thực tế':report.app[key]===null?'Cần nhập thực tế':'Tự thống kê từ app'}{report.manual.includes(key)&&report.app[key]!==null?` · App: ${report.app[key]!.toLocaleString('vi-VN')}`:''}</small></label>)}</div></details>)}
    <div className="mg-ownership-reconciliation"><p>TK THU: {reconciliation(report.values.thu_actual,report.thu_balance)} · Sổ app: {report.thu_balance?.toLocaleString('vi-VN')??'Chưa có tài khoản được phân công'}</p><p>TK CTY: {reconciliation(report.values.company_actual,report.company_balance)} · Sổ app: {report.company_balance?.toLocaleString('vi-VN')??'Chưa có tài khoản được phân công'}</p><p>APP / Sổ: {reconciliation(report.values.book_income,report.app.income_day)}</p></div>
    <details><summary>Nguồn số liệu và mục cần đối chiếu</summary><ul>{report.sources.map(s=><li key={s}>{s}</li>)}</ul></details>
    <details open><summary>Xem trước tin báo cáo Telegram</summary><pre className="mg-report-preview">{ownershipReportText(date,report)}</pre><p>Chốt báo cáo sẽ tự gửi một lần vào nhóm Thuê sở hữu · Ký mới, trả xe & điều chuyển đang cấu hình. Kiểm tra nội dung trước khi chốt.</p></details>
  </div>;
}
