import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {prepareRecordMediaAsset} from './record-media-photo';
import type {AttendanceLocation} from '../../../shared/mobile-support';

export async function captureAttendancePhoto(signal:AbortSignal) {
  if(!(await ImagePicker.requestCameraPermissionsAsync()).granted)throw Error('Cần cấp quyền camera để chụp ảnh chấm công.');
  const result=await ImagePicker.launchCameraAsync({mediaTypes:['images'],cameraType:ImagePicker.CameraType.front,allowsEditing:false,quality:1,exif:false});
  if(result.canceled||signal.aborted)return null;
  return prepareRecordMediaAsset(result.assets[0],signal);
}
export async function locateAttendance(purpose = 'chấm công'):Promise<AttendanceLocation> {
  if(!(await Location.requestForegroundPermissionsAsync()).granted)throw Error(`Cần cấp quyền vị trí khi dùng app để ${purpose}.`);
  if(!await Location.hasServicesEnabledAsync())throw Error('GPS đang tắt. Bật vị trí trên thiết bị rồi thử lại.');
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const value=await Promise.race([Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Chưa lấy được GPS sau 20 giây. Ra vị trí thoáng hơn rồi thử lại.')),20000);})]);
    if(value.coords.accuracy===null)throw Error('Chưa xác định được sai số GPS. Vui lòng lấy lại vị trí.');
    return {latitude:value.coords.latitude,longitude:value.coords.longitude,accuracy:value.coords.accuracy,timestamp:value.timestamp};
  }finally{if(timer)clearTimeout(timer);}
}
/** Silent best-effort GPS capture for shift evidence/stock photos: never throws or alerts staff. */
export async function locateAttendanceSilent(timeoutMs = 7000): Promise<AttendanceLocation | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    const granted = perm.granted || (await Location.requestForegroundPermissionsAsync()).granted;
    if (!granted) return null;
    if (!await Location.hasServicesEnabledAsync()) return null;
    const value = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
    if (!value || value.coords.accuracy === null) {
      const last = await Location.getLastKnownPositionAsync({ maxAge: 180_000 }).catch(() => null);
      if (!last || last.coords.accuracy === null) return null;
      return { latitude: last.coords.latitude, longitude: last.coords.longitude, accuracy: last.coords.accuracy, timestamp: last.timestamp };
    }
    return { latitude: value.coords.latitude, longitude: value.coords.longitude, accuracy: value.coords.accuracy, timestamp: value.timestamp };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
