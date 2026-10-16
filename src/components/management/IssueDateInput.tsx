'use client';

import type { InputHTMLAttributes } from 'react';
import { displayIssueDate, parseIssueDateInput } from '@/lib/management/customer-identity';

export function IssueDateInput({ value, onValueChange, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & { value: string; onValueChange: (value: string) => void }) {
  return <input {...props} type="text" inputMode="numeric" placeholder="dd/mm/yyyy" autoComplete="off" maxLength={10}
    value={displayIssueDate(value)} onChange={event => onValueChange(parseIssueDateInput(event.target.value))} />;
}
