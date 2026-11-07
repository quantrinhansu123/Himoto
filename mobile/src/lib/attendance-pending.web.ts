import type {AttendancePending} from './attendance-pending';
export type {AttendancePending} from './attendance-pending';
const memory=new Map<number,{origin:string;pending:AttendancePending}>();
export async function loadAttendancePending(actor:number,origin:string):Promise<AttendancePending|null>{const entry=memory.get(actor);if(entry&&entry.origin!==origin)throw Error('Có lần chấm công chờ ở máy chủ khác.');return entry?.pending||null;}
export async function storeAttendancePending(actor:number,origin:string,pending:AttendancePending){if(memory.has(actor))throw Error('Còn lần chấm công chờ.');memory.set(actor,{origin,pending});return pending;}
export async function clearAttendancePending(actor:number,id:string){if(memory.get(actor)?.pending.id===id)memory.delete(actor);}
export async function refreshAttendancePendingLocation(actor:number,origin:string,id:string,location:AttendancePending['location']){const current=memory.get(actor);if(!current||current.origin!==origin||current.pending.id!==id)throw Error('Lần chấm công chờ đã thay đổi.');current.pending={...current.pending,location};return current.pending;}
