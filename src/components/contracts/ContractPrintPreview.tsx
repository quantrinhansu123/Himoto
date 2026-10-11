'use client';

import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { LoaderCircle, Minus, Plus, Printer, RotateCw } from 'lucide-react';
import { Dialog } from '@/components/management/Dialog';
import { LegacyContractDocument } from '@/lib/management/contract-document';
import { ContractPrintDocument } from './ContractPrintDocument';

const PreviewLayout = createContext({ scale: 1, rotated: false });

function PreviewPage({ children }: { children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const { scale, rotated } = useContext(PreviewLayout);
  const [size, setSize] = useState({ width: 1077, height: 737 });
  useEffect(() => {
    const page = content.current?.querySelector<HTMLElement>('.contract-page');
    if (!page) return;
    const measure = () => setSize(current => current.width === page.offsetWidth && current.height === page.offsetHeight ? current : { width: page.offsetWidth, height: page.offsetHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(page); measure();
    return () => observer.disconnect();
  }, []);
  return <div className="mg-contract-preview-page" style={{ width: (rotated ? size.height : size.width) * scale, height: (rotated ? size.width : size.height) * scale }}>
    <div ref={content} className="mg-contract-preview-page-content" style={{ transform: rotated ? `translateX(${size.height * scale}px) rotate(90deg) scale(${scale})` : `scale(${scale})` }}>{children}</div>
  </div>;
}

export function ContractPrintPreview({ doc, onClose }: { doc: LegacyContractDocument; onClose: () => void }) {
  const paper = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const busy = useRef(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const [portraitPhone, setPortraitPhone] = useState(false);
  const [rotationOverride, setRotationOverride] = useState<boolean | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const rotated = rotationOverride ?? portraitPhone;
  const scale = fitScale * zoom;
  useEffect(() => () => { frame.current?.remove(); }, []);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 600px) and (orientation: portrait)');
    const update = () => setPortraitPhone(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const viewport = paper.current;
    const pages = Array.from(viewport?.querySelectorAll<HTMLElement>('.contract-page') || []);
    if (!viewport || !pages.length) return;
    const measure = () => {
      const style = getComputedStyle(viewport);
      const available = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const width = Math.max(...pages.map(page => rotated ? page.offsetHeight : page.offsetWidth));
      if (available > 0 && width > 0) setFitScale(Math.min(1, available / width));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport); pages.forEach(page => observer.observe(page)); measure();
    return () => observer.disconnect();
  }, [doc, rotated]);
  async function print() {
    if (busy.current) return;
    busy.current = true; setPrinting(true); setError('');
    try {
      const source = paper.current?.querySelector('.contract-print-wrapper');
      if (!source) throw new Error('Chưa tải xong mẫu in.');
      frame.current?.remove();
      const iframe = document.createElement('iframe'); frame.current = iframe;
      iframe.title = 'Bản in hợp đồng'; iframe.className = 'mg-contract-print-frame';
      document.body.appendChild(iframe);
      const target = iframe.contentDocument;
      if (!target || !iframe.contentWindow) throw new Error('Không mở được bản in.');
      if (typeof iframe.contentWindow.print !== 'function') throw new Error('Trình duyệt này không hỗ trợ in trực tiếp. Hãy mở trang bằng Chrome, Edge hoặc Firefox trên máy tính rồi thử lại.');
      target.title = `HIMOTO - ${doc.contract_number}`;
      target.documentElement.lang = 'vi'; target.body.className = 'himoto-contract-frame';
      target.body.style.margin = '0';
      const styles: Promise<void>[] = [];
      document.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => {
        const copy = node.cloneNode(true) as HTMLElement;
        if (copy instanceof HTMLLinkElement) { copy.href = (node as HTMLLinkElement).href; styles.push(new Promise<void>((resolve, reject) => { copy.onload = () => resolve(); copy.onerror = () => reject(new Error('Không tải được định dạng mẫu in.')); })); }
        target.head.appendChild(copy);
      });
      const printable = source.cloneNode(true) as HTMLElement;
      // Only the preview rotates/scales pages; print retains the original A4 layout.
      printable.querySelectorAll('.mg-contract-preview-page').forEach(wrapper => {
        const page = wrapper.querySelector('.contract-page');
        if (page) wrapper.replaceWith(page);
      });
      target.body.appendChild(printable);
      await Promise.all(styles); await target.fonts.ready;
      iframe.contentWindow.addEventListener('afterprint', () => { iframe.remove(); if (frame.current === iframe) frame.current = null; }, { once: true });
      iframe.contentWindow.focus(); iframe.contentWindow.print();
    } catch (cause) {
      frame.current?.remove(); frame.current = null;
      const message = cause instanceof Error ? cause.message : '';
      setError(message.includes('định dạng mẫu in')
        ? 'Không tải được định dạng của hợp đồng nên chưa thể in. Kiểm tra kết nối mạng rồi bấm “In hợp đồng” để thử lại.'
        : message || 'Không mở được hộp thoại in. Hãy thử lại; nếu vẫn lỗi, mở trang bằng Chrome hoặc Edge và kiểm tra quyền in của trình duyệt.');
    }
    finally { busy.current = false; setPrinting(false); }
  }
  return <Dialog title="Xem trước mẫu in hợp đồng" subtitle="Mẫu cũ · A4 ngang · Bản nháp chưa phát hành" className="mg-contract-print-dialog" onClose={() => { if (!busy.current) onClose(); }}>
    <div className="mg-contract-print-toolbar"><p>Đối chiếu thông tin với khách trước khi in. Có thể chọn “Lưu dưới dạng PDF” trong hộp thoại in.</p>
      <button className="mg-button mg-button-primary" type="button" onClick={() => void print()} disabled={printing}>{printing ? <LoaderCircle size={16} className="mg-spin" /> : <Printer size={16} />}{printing ? 'Đang chuẩn bị…' : 'In hợp đồng'}</button></div>
    {error && <p className="mg-error-message" role="alert">{error}</p>}
    <div className="mg-contract-preview-controls" role="group" aria-label="Điều chỉnh mẫu xem trước">
      <button type="button" className="mg-button" aria-pressed={rotated} onClick={() => { setRotationOverride(!rotated); setZoom(1); }}><RotateCw size={16} />Xoay trang</button>
      <button type="button" className="mg-icon-button" aria-label="Thu nhỏ mẫu in" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - 0.5))}><Minus size={16} /></button>
      <output aria-live="polite">{Math.round(scale * 100)}%</output>
      <button type="button" className="mg-icon-button" aria-label="Phóng to mẫu in" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + 0.5))}><Plus size={16} /></button>
      <button type="button" className="mg-button" onClick={() => setZoom(1)}>Vừa màn hình</button>
      <p className="mg-contract-preview-hint">Xoay ngang điện thoại để đọc. Phóng to để kiểm tra thông tin.</p>
    </div>
    <div className="mg-contract-paper-scroll" tabIndex={0} role="region" aria-label="Mẫu hợp đồng, cuộn để xem các trang" ref={paper}>
      <PreviewLayout.Provider value={{ scale, rotated }}><ContractPrintDocument doc={doc} pageWrapper={PreviewPage} /></PreviewLayout.Provider>
    </div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose} disabled={printing}>Quay lại thông tin</button></div>
  </Dialog>;
}
