'use client';

import { useEffect, useRef,useState } from 'react';
import { photoEndpoint } from '@/lib/management/record-photos';
import {useManagement} from './ManagementProvider';
import {createThumbnailReader} from '@/lib/management/thumbnail-read';
const readers=new WeakMap<object,ReturnType<typeof createThumbnailReader>>();

export function VehicleThumbnail({ id, revision = '', photoRevision, className = '' }: { id: number; revision?: string | number; photoRevision?: string | number; className?: string }) {
  const directUrl = photoRevision === undefined ? undefined : photoRevision === 'none' || photoRevision === '' ? '' : `${photoEndpoint('vehicles', id, 'vehicle-photo')}?v=${encodeURIComponent(photoRevision)}&preview=1`;
  const [photoUrl, setPhotoUrl] = useState(directUrl ?? '');
  const element=useRef<HTMLSpanElement>(null),{resources,accessUser,selectedStore}=useManagement(),scope=resources.vehicles;
  const actorScope=JSON.stringify([accessUser?.id,accessUser?.access_role,accessUser?.store_id,accessUser?.scope_all,accessUser?.permissions,selectedStore]);
  useEffect(() => {
    if (directUrl !== undefined) {
      setPhotoUrl(directUrl);
      return;
    }
    let alive=true,started=false;
    setPhotoUrl('');
    let reader=readers.get(scope);if(!reader){reader=createThumbnailReader();readers.set(scope,reader);}
    const load=()=>{if(started)return;started=true;
    void reader!(`${actorScope}:${id}:${revision}`,()=>fetch(photoEndpoint('vehicles', id), { credentials: 'same-origin', cache: 'no-store', signal:AbortSignal.timeout(15000) })
      .then(response => response.json())
      .then(body => {
        if (body?.status !== 'success' || !Array.isArray(body.data)) return '';
        const photo = body.data.find((item: { slot: string }) => item.slot === 'vehicle-photo');
        return photo?`${photoEndpoint('vehicles', id, 'vehicle-photo')}?v=${encodeURIComponent(photo.updated_at || revision)}&preview=1`:'';
      })).then(url=>{if(alive)setPhotoUrl(url);})
      .catch(() => {});
    };
    const observer=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer?.disconnect();load();}},{rootMargin:'150px'}):null;
    if(observer&&element.current)observer.observe(element.current);else load();
    return () => {alive=false;observer?.disconnect();};
  }, [id, revision, directUrl, scope, actorScope]);
  return <span ref={element} className={`mg-vehicle-thumb ${className}`} aria-label={photoUrl ? 'Ảnh xe' : 'Chưa có ảnh xe'}>
    {photoUrl && <img src={photoUrl} alt="Ảnh xe" loading="lazy" onError={() => setPhotoUrl('')} />}
  </span>;
}
