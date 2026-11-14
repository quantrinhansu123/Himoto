import {withAccessRequest} from '@/lib/server/access-request';
import {handleBatteryMedia} from '@/lib/server/battery-media-handler';
export const runtime='nodejs';
export const GET=withAccessRequest(handleBatteryMedia);
