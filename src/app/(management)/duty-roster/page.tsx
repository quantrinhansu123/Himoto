import type { Metadata } from 'next';
import { DutyRosterPage } from '@/components/management/DutyRosterPage';
export const metadata:Metadata={title:'Lịch trực cơ sở — HIMOTO'};
export default function DutyRosterRoute(){return <DutyRosterPage />;}
