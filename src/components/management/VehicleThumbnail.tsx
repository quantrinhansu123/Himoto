'use client';

import { useEffect, useState } from 'react';
import { photoEndpoint } from '@/lib/management/record-photos';

export function VehicleThumbnail({ id, revision = '', className = '' }: { id: number; revision?: string | number; className?: string }) {
  const [photoUrl, setPhotoUrl] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setPhotoUrl('');
    fetch(photoEndpoint('vehicles', id), { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(response => response.json())
      .then(body => {
        if (controller.signal.aborted || body?.status !== 'success' || !Array.isArray(body.data)) return;
        const photo = body.data.find((item: { slot: string }) => item.slot === 'vehicle-photo');
        if (photo) setPhotoUrl(`${photoEndpoint('vehicles', id, 'vehicle-photo')}?v=${encodeURIComponent(photo.updated_at || revision)}`);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [id, revision]);
  return <span className={`mg-vehicle-thumb ${className}`} aria-label={photoUrl ? 'Ảnh xe' : 'Chưa có ảnh xe'}>
    {photoUrl && <img src={photoUrl} alt="Ảnh xe" loading="lazy" onError={() => setPhotoUrl('')} />}
  </span>;
}
