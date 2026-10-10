import type { ContractDraft } from './contract-document';

export type ManagementKind = 'staff' | 'customers' | 'contracts' | 'stores' | 'vehicles';
export type EditableKind = Exclude<ManagementKind, 'contracts'>;
export type CellValue = string | number | undefined;

/** View models, not database schemas. Missing API fields remain undefined. */
export interface ManagementRow {
  id: number;
  code: string;
  name: string;
  status: string;
  [key: string]: CellValue;
}

export type ManagementDataset = Record<ManagementKind, ManagementRow[]>;

export interface ContractEdits {
  revision?: string;
  draft: ContractDraft;
  status: string;
  rental_type: string;
  notes: string;
}
export interface ContractMutationResult { row: ManagementRow; dataset: ManagementDataset }
export interface CustomerAssignment { status: string; store_id: number }

export interface ManagementRepository {
  source: 'demo' | 'api';
  supportsContractDrafts?: boolean;
  load(): Promise<ManagementDataset>;
  loadKind(kind: ManagementKind): Promise<ManagementRow[]>;
  save(kind: EditableKind, row: ManagementRow): Promise<ManagementDataset>;
  cloneContract(id: number): Promise<ContractMutationResult>;
  saveContract(id: number, edits: ContractEdits): Promise<ContractMutationResult>;
  saveContractDraft(id: number | null, edits: ContractEdits): Promise<ContractMutationResult>;
  reset(): Promise<ManagementDataset>;
}

export interface Option { value: string; label: string }
export interface ManagementColumn {
  key: string;
  label: string;
  format?: 'person' | 'vehicle' | 'code' | 'money' | 'date' | 'number' | 'status';
  secondary?: string;
  align?: 'right';
  hidden?: boolean;
}
export interface ManagementField {
  key: string;
  label: string;
  type?: 'text' | 'tel' | 'email' | 'number' | 'date' | 'select' | 'textarea';
  required?: boolean;
  options?: Option[];
  storeOptions?: boolean;
  wide?: boolean;
  hint?: string;
}
export interface ManagementConfig {
  kind: ManagementKind;
  title: string;
  description: string;
  singular: string;
  addLabel?: string;
  searchPlaceholder: string;
  columns: ManagementColumn[];
  fields: ManagementField[];
  statuses: Option[];
  filters: { key: string; label: string; options: Option[] }[];
}
