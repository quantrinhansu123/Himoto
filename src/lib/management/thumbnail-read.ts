/** A provider-owned in-flight map only; settled metadata never survives a refresh. */
export function createThumbnailReader(){
  const pending=new Map<string,Promise<string>>();
  return (key:string,read:()=>Promise<string>)=>{
    const existing=pending.get(key);if(existing)return existing;
    const work=read().finally(()=>{if(pending.get(key)===work)pending.delete(key);});
    pending.set(key,work);return work;
  };
}
