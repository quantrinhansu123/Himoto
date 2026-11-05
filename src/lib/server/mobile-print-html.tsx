import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ReactNode } from 'react';
import { MobileError } from './mobile-session';
export async function mobilePrintHtml(title: string, body: ReactNode, portrait = false) {
  // Route handlers return HTML inside a JSON DTO. Next 15 rejects the static
  // react-dom/server import in its RSC analysis; load React's Node renderer here.
  const { renderToStaticMarkup } = await import('react-dom/server');
  const css = await readFile(path.join(process.cwd(), 'src/styles/contract-print.css'), 'utf8');
  const html = '<!doctype html>' + renderToStaticMarkup(<html lang="vi"><head><meta charSet="utf-8" /><meta name="viewport" content={`width=${portrait ? 794 : 1077}`} /><meta httpEquiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'" /><title>{title}</title><style>{css + `\n@page{size:A4 ${portrait ? 'portrait' : 'landscape'};margin:${portrait ? '0' : '6mm'}}html,body{margin:0;padding:0;background:#fff}#himoto-contract-print-root{display:block!important}.contract-page,.battery-page{break-inside:avoid}`}</style></head><body><div id="himoto-contract-print-root">{body}</div></body></html>);
  if (Buffer.byteLength(html, 'utf8') > 2_097_152) throw new MobileError('Mẫu in vượt giới hạn; cần đối chiếu hồ sơ trên web.', 409, 'PRINT_TOO_LARGE');
  return html;
}
