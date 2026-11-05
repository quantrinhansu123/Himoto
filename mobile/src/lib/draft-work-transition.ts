/** Run every local persistence boundary before a view can leave or the system picker can take control. */
export async function prepareDraftWorkTransition({isCurrent,ensurePhotos,flush,hasChanges}:{isCurrent:()=>boolean;ensurePhotos:()=>Promise<void>;flush:()=>Promise<unknown>;hasChanges:()=>boolean}){
  const check=()=>{if(!isCurrent())throw Error('Phiên hoặc bản đang soạn đã thay đổi. Dữ liệu gốc được giữ để đối chiếu.');};
  check();await ensurePhotos();check();if(hasChanges())await flush();check();
}
