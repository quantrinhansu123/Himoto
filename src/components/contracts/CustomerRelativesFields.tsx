'use client';

import type { ContractRelative } from '@/lib/management/contract-document';

export function CustomerRelativesFields({ prefix, relatives, disabled, onChange }: {
  prefix: string;
  relatives: [ContractRelative, ContractRelative];
  disabled: boolean;
  onChange: (relatives: [ContractRelative, ContractRelative]) => void;
}) {
  const labels = { name: 'Họ tên', relationship: 'Quan hệ', phone: 'SĐT' };
  return <div className="mg-field-wide mg-relative-list"><h3>Thông tin người thân</h3>
    {relatives.map((relative, index) => <div key={index} className="mg-relative-card"><h4>Người thân {index + 1}</h4>
      <div className="mg-form-grid mg-contract-grid-three">{(['name', 'relationship', 'phone'] as const).map(key => {
        const id = `${prefix}-relative-${index}-${key}`;
        return <div className="mg-field" key={key}><label htmlFor={id}>{labels[key]}</label>
          <input id={id} name={`relative_${index}_${key}`} type={key === 'phone' ? 'tel' : 'text'} value={relative[key]} disabled={disabled} maxLength={key === 'phone' ? 50 : 200}
            onChange={event => onChange(relatives.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: event.target.value } : item) as [ContractRelative, ContractRelative])} />
        </div>;
      })}</div>
    </div>)}
  </div>;
}
