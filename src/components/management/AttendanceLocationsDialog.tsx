'use client';

import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, MapPin } from 'lucide-react';
import { integrationRequest } from '@/lib/management/integrations';
import { Dialog } from './Dialog';
import { requestBrowserLocation, type BrowserLocation } from '@/lib/management/browser-geolocation';
import styles from './AttendanceLocationsDialog.module.css';

type StoreLocation = { id: string | number; store_name: string; latitude: number | null; longitude: number | null };
const endpoint = '/api/auth/attendance/locations';

export function AttendanceLocationsDialog({ canEdit, onClose }: { canEdit: boolean; onClose: () => void }) {
  const [stores, setStores] = useState<StoreLocation[] | null>(null);
  const [storeId, setStoreId] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<BrowserLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const locatingRequest = useRef<AbortController | null>(null);
  const saveLock = useRef(false);
  useEffect(() => () => { locatingRequest.current?.abort(); locatingRequest.current = null; }, []);

  useEffect(() => {
    const controller = new AbortController();
    integrationRequest<StoreLocation[]>(endpoint, { signal: controller.signal }).then(setStores).catch(cause => {
      if (!controller.signal.aborted) setError(cause.message);
    });
    return () => controller.abort();
  }, []);

  function selectStore(id: string) {
    const row = stores?.find(store => String(store.id) === id);
    setStoreId(id);
    setLatitude(String(row?.latitude ?? ''));
    setLongitude(String(row?.longitude ?? ''));
    setError('');
    setSaved(false);
    setCurrentLocation(null);
  }

  async function locate() {
    if (!canEdit || saving || locatingRequest.current) return;
    if (!storeId) { setError('Chọn cơ sở trước khi lấy vị trí.'); return; }
    const controller = new AbortController(); locatingRequest.current = controller;
    setError(''); setSaved(false); setLocating(true); setCurrentLocation(null);
    try {
      const location = await requestBrowserLocation({ signal: controller.signal });
      if (locatingRequest.current !== controller || controller.signal.aborted) return;
      setCurrentLocation(location); setLatitude(String(location.latitude)); setLongitude(String(location.longitude));
    } catch (cause) {
      if (locatingRequest.current === controller && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Chưa lấy được vị trí. Vui lòng thử lại.');
    } finally {
      if (locatingRequest.current === controller) { locatingRequest.current = null; setLocating(false); }
    }
  }
  function cancelLocation() {
    locatingRequest.current?.abort(); locatingRequest.current = null; setLocating(false);
  }
  const validCoordinates = latitude.trim() !== '' && longitude.trim() !== '' && Number.isFinite(Number(latitude)) && Math.abs(Number(latitude)) <= 90 && Number.isFinite(Number(longitude)) && Math.abs(Number(longitude)) <= 180;
  function close() { if (!saveLock.current) { cancelLocation(); onClose(); } }

  async function save() {
    if (!canEdit || saveLock.current || locating || !storeId) return;
    if (!validCoordinates) { setError('Lấy vị trí hiện tại hoặc nhập đủ vĩ độ, kinh độ hợp lệ trước khi lưu.'); return; }
    const coordinates = { latitude: Number(latitude), longitude: Number(longitude) };
    setSaving(true);
    setError('');
    setSaved(false);
    saveLock.current = true;
    try {
      await integrationRequest(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, ...coordinates }),
      });
      setStores(current => current?.map(store => String(store.id) === storeId ? { ...store, ...coordinates } : store) ?? null);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa lưu được tọa độ.');
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  return <Dialog title="Cài đặt GPS chấm công" className={styles.dialog} onClose={close}>
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className="mg-dialog-body mg-attendance-location-fields">
        {!stores && !error && <p role="status">Đang tải cơ sở…</p>}
        {stores && <label className="mg-field">Cơ sở
          <select value={storeId} onChange={event => selectStore(event.target.value)} disabled={saving || locating} required>
            <option value="">Chọn cơ sở</option>
            {stores.map(store => <option key={store.id} value={store.id}>{store.store_name}{store.latitude === null ? ' · Chưa có tọa độ' : ` · ${store.latitude}, ${store.longitude}`}</option>)}
          </select>
        </label>}
        {canEdit && <button type="button" data-dialog-no-focus-scroll className={`mg-button mg-attendance-locate ${styles.locate}`} onClick={() => void locate()} disabled={!storeId || saving || locating} aria-busy={locating}>
          {locating ? <LoaderCircle size={18} className="mg-spin" aria-hidden="true" /> : <MapPin size={18} aria-hidden="true" />}{locating ? 'Đang lấy GPS…' : 'Lấy vị trí hiện tại'}
        </button>}
        {locating && <div className={styles.status} role="status" aria-live="polite"><p>Đã nhận yêu cầu. Nếu Safari hỏi quyền vị trí, chọn <strong>Cho phép</strong>. Đang chờ GPS, tối đa 20 giây.</p><button type="button" data-dialog-no-focus-scroll className="mg-button" onClick={cancelLocation}>Dừng lấy vị trí</button></div>}
        {currentLocation && <p role="status" className={styles.success}>Đã lấy GPS và điền tọa độ bên dưới. Sai số khoảng ±{Math.round(currentLocation.accuracy)} m. Kiểm tra đúng cơ sở rồi bấm <strong>Lưu tọa độ</strong>.</p>}
        {!storeId && canEdit && <p className="mg-reminder-help">Chọn cơ sở để bật nút Lấy vị trí hiện tại.</p>}
        {storeId && <>
          <label className="mg-field">Vĩ độ<input type="number" step="any" min="-90" max="90" required readOnly={!canEdit} disabled={saving || locating} value={latitude} onChange={event => { setLatitude(event.target.value); setSaved(false); setCurrentLocation(null); }} /></label>
          <label className="mg-field">Kinh độ<input type="number" step="any" min="-180" max="180" required readOnly={!canEdit} disabled={saving || locating} value={longitude} onChange={event => { setLongitude(event.target.value); setSaved(false); setCurrentLocation(null); }} /></label>
        </>}
        {error && <p role="alert" className="mg-field-error">{error}</p>}
        {canEdit && <details className={styles.help}><summary>Không lấy được vị trí trên iPhone?</summary><ol><li>Vào <strong>Cài đặt → Quyền riêng tư &amp; Bảo mật → Dịch vụ định vị</strong> và bật định vị.</li><li>Trong Dịch vụ định vị, chọn <strong>Trang web Safari</strong>, cho phép khi dùng ứng dụng và bật Vị trí chính xác nếu có.</li><li>Quay lại Safari, mở menu cạnh thanh địa chỉ → <strong>Cài đặt trang web → Vị trí → Cho phép</strong>.</li><li>Đứng tại đúng cơ sở, giữ trang đang mở rồi bấm lại <strong>Lấy vị trí hiện tại</strong>. Nếu đã biết tọa độ chính xác, có thể nhập tay.</li></ol></details>}
        {saved && <p role="status">Đã lưu tọa độ chấm công.</p>}
      </div>
      <div className="mg-dialog-footer">
        <button type="button" className="mg-button" disabled={saving} onClick={close}>Đóng</button>
        {canEdit && <button type="submit" data-dialog-no-focus-scroll className="mg-button mg-button-primary" disabled={!storeId || saving || locating || !validCoordinates}>{saving ? 'Đang lưu…' : 'Lưu tọa độ'}</button>}
      </div>
    </form>
  </Dialog>;
}
