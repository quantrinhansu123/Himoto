import { withAccessRequest } from '@/lib/server/access-request';
import { handleShiftMedia } from '@/lib/server/shift-media-handler';
export const runtime='nodejs';
export const maxDuration=300;
export const GET=withAccessRequest(handleShiftMedia);
export const PUT=withAccessRequest(handleShiftMedia);
export const DELETE=withAccessRequest(handleShiftMedia);
