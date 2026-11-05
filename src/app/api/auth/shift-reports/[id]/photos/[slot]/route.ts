import { withAccessRequest } from '@/lib/server/access-request';
import { handleShiftPhoto } from '@/lib/server/shift-photo-handler';
export const runtime='nodejs';
export const GET=withAccessRequest(handleShiftPhoto);
export const PUT=withAccessRequest(handleShiftPhoto);
