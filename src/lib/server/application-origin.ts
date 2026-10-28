import 'server-only';

/** Canonical public URL for callbacks generated outside a browser request. */
export function applicationOrigin() {
  const url=new URL(process.env.HIMOTO_PUBLIC_ORIGIN||'https://app.himoto.vn');
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Invalid application origin');
  return url.origin;
}
