'use client';

import { useEffect, useState } from 'react';
import { photoEndpoint } from '@/lib/management/record-photos';

export function VehicleThumbnail({ id, className = '' }: { id: number; className?: string }) {
  const [exists, setExists] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(photoEndpoint('vehicles', id), { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(response => response.json())
      .then(body => { if (!controller.signal.aborted) setExists(body?.status === 'success' && body.data?.some((photo: { slot: string }) => photo.slot === 'vehicle-photo')); })
      .catch(() => {});
    return () => controller.abort();
  }, [id]);
  return <span className={`mg-vehicle-thumb ${className}`} aria-label={exists ? 'Ảnh xe' : 'Chưa có ảnh xe'}>
    {exists && <img src={`${photoEndpoint('vehicles', id, 'vehicle-photo')}`} alt="" loading="lazy" />}
  </span>;
}
