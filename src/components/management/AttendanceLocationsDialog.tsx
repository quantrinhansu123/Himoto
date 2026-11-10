'use client';

import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { integrationRequest } from '@/lib/management/integrations';
import { Dialog } from './Dialog';

type StoreLocation = { id: string | number; store_name: string; latitude: number | null; longitude: number | null };
const endpoint = '/api/auth/attendance/locations';

export function AttendanceLocationsDialog({ canEdit, onClose }: { canEdit: boolean; onClose: () => void }) {
  const [stores, setStores] = useState<StoreLocation[] | null>(null);
  const [storeId, setStoreId] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

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
  }

  function locate() {
    setError('');
    setSaved(false);
    if (!navigator.geolocation) {
      setError('Trình duyệt không hỗ trợ lấy vị trí.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCurrentLocation([coords.latitude, coords.longitude].join(", "));
        if (canEdit && storeId) setLatitude(String(coords.latitude));
        if (canEdit && storeId) setLongitude(String(coords.longitude));
        setLocating(false);
      },
      cause => {
        setError(cause.code === 1
          ? 'Hãy cho phép trang này truy cập vị trí rồi thử lại.'
          : 'Chưa lấy được vị trí. Hãy bật dịch vụ định vị rồi thử lại.');
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }

  async function save() {
    if (!canEdit || saving || locating || !storeId || !latitude.trim() || !longitude.trim()) return;
    const coordinates = { latitude: Number(latitude), longitude: Number(longitude) };
    setSaving(true);
    setError('');
    setSaved(false);
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
      setSaving(false);
    }
  }

  return <Dialog title="Cài đặt GPS chấm công" onClose={() => { if (!saving) onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className="mg-dialog-body mg-attendance-location-fields">
        {!stores && !error && <p role="status">Đang tải cơ sở…</p>}
        {stores && <label className="mg-field">Cơ sở
          <select value={storeId} onChange={event => selectStore(event.target.value)} disabled={saving || locating} required>
            <option value="">Chọn cơ sở</option>
            {stores.map(store => <option key={store.id} value={store.id}>{store.store_name}{store.latitude === null ? ' · Chưa có tọa độ' : ` · ${store.latitude}, ${store.longitude}`}</option>)}
          </select>
        </label>}
        <button type="button" className="mg-button mg-attendance-locate" onClick={locate} disabled={saving || locating}>
          <MapPin size={16} aria-hidden="true" />{locating ? 'Đang lấy vị trí…' : 'Lấy vị trí hiện tại'}
        </button>
        {currentLocation && <p role="status">Vị trí hiện tại: {currentLocation}</p>}
        {storeId && <>
          <label className="mg-field">Vĩ độ<input type="number" step="any" min="-90" max="90" required readOnly={!canEdit} disabled={saving || locating} value={latitude} onChange={event => { setLatitude(event.target.value); setSaved(false); }} /></label>
          <label className="mg-field">Kinh độ<input type="number" step="any" min="-180" max="180" required readOnly={!canEdit} disabled={saving || locating} value={longitude} onChange={event => { setLongitude(event.target.value); setSaved(false); }} /></label>
        </>}
        {error && <p role="alert" className="mg-field-error">{error}</p>}
        {saved && <p role="status">Đã lưu tọa độ chấm công.</p>}
      </div>
      <div className="mg-dialog-footer">
        <button type="button" className="mg-button" disabled={saving} onClick={onClose}>Đóng</button>
        {canEdit && <button type="submit" className="mg-button mg-button-primary" disabled={!storeId || saving || locating}>{saving ? 'Đang lưu…' : 'Lưu tọa độ'}</button>}
      </div>
    </form>
  </Dialog>;
}
