'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { LoaderCircle, Minus, Plus, Printer } from 'lucide-react';
import { Dialog } from '@/components/management/Dialog';
import { LegacyContractDocument } from '@/lib/management/contract-document';
import { ContractPrintDocument } from './ContractPrintDocument';

const PreviewLayout = createContext(1);
const DOCUMENT_SELECTOR = '.contract-print-wrapper, .battery-print-wrapper';
const PAGE_SELECTOR = '.contract-page, .battery-page';

export function PreviewPage({ children }: { children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const scale = useContext(PreviewLayout);
  const [size, setSize] = useState({ width: 1077, height: 737 });
  useEffect(() => {
    const page = content.current?.querySelector<HTMLElement>(PAGE_SELECTOR);
    if (!page) return;
    const measure = () => setSize(current => current.width === page.offsetWidth && current.height === page.offsetHeight ? current : { width: page.offsetWidth, height: page.offsetHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(page); measure();
    return () => observer.disconnect();
  }, []);
  return <div className="mg-contract-preview-page" style={{ width: size.width * scale, height: size.height * scale }}>
    <div ref={content} className="mg-contract-preview-page-content" style={{ transform: `scale(${scale})` }}>{children}</div>
  </div>;
}

interface PrintPreviewDialogProps { title: string; subtitle: string; printTitle: string; printLabel: string; layoutKey: unknown; pageRule?: string; children: ReactNode; onClose: () => void }

export function PrintPreviewDialog({ title, subtitle, printTitle, printLabel, layoutKey, pageRule, children, onClose }: PrintPreviewDialogProps) {
  const paper = useRef<HTMLDivElement>(null);
  const printRoot = useRef<HTMLDivElement | null>(null);
  const pageTitle = useRef<string | null>(null);
  const busy = useRef(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const scale = fitScale * zoom;
  const clearPrint = useCallback(() => {
    printRoot.current?.remove(); printRoot.current = null;
    document.documentElement.classList.remove('himoto-printing');
    if (pageTitle.current !== null) { document.title = pageTitle.current; pageTitle.current = null; }
  }, []);
  useEffect(() => clearPrint, [clearPrint]);
  useEffect(() => {
    const viewport = paper.current;
    const pages = Array.from(viewport?.querySelectorAll<HTMLElement>(PAGE_SELECTOR) || []);
    if (!viewport || !pages.length) return;
    const measure = () => {
      const style = getComputedStyle(viewport);
      const available = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const width = Math.max(...pages.map(page => page.offsetWidth));
      if (available > 0 && width > 0) setFitScale(Math.min(1, available / width));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport); pages.forEach(page => observer.observe(page)); measure();
    return () => observer.disconnect();
  }, [layoutKey]);
  async function print() {
    if (busy.current) return;
    busy.current = true; setPrinting(true); setError('');
    try {
      const source = paper.current?.querySelector(DOCUMENT_SELECTOR);
      if (!source) throw new Error('Chưa tải xong mẫu in.');
      if (typeof window.print !== 'function') throw new Error('Trình duyệt này không hỗ trợ in trực tiếp. Hãy mở trang bằng Chrome, Edge hoặc Firefox trên máy tính rồi thử lại.');
      clearPrint();
      const root = document.createElement('div'); printRoot.current = root;
      root.className = 'himoto-print-root';
      const printable = source.cloneNode(true) as HTMLElement;
      // Only the preview scales pages; print retains the original A4 layout.
      printable.querySelectorAll('.mg-contract-preview-page').forEach(wrapper => {
        const page = wrapper.querySelector(PAGE_SELECTOR);
        if (page) wrapper.replaceWith(page);
      });
      // Chrome paginates named @page rules with the default page height, so a different paper size overrides @page itself.
      if (pageRule) { const style = document.createElement('style'); style.textContent = `@media print { @page { ${pageRule} } }`; root.appendChild(style); }
      root.appendChild(printable);
      document.body.appendChild(root);
      document.documentElement.classList.add('himoto-printing');
      pageTitle.current = document.title; document.title = printTitle;
      await document.fonts.ready;
      // Printing from a script-created iframe makes Chrome offer only "Save as PDF", so the page itself is printed.
      window.addEventListener('afterprint', () => { if (printRoot.current === root) clearPrint(); }, { once: true });
      window.print();
    } catch (cause) {
      clearPrint();
      setError(cause instanceof Error && cause.message ? cause.message : 'Không mở được hộp thoại in. Hãy thử lại; nếu vẫn lỗi, mở trang bằng Chrome hoặc Edge và kiểm tra quyền in của trình duyệt.');
    }
    finally { busy.current = false; setPrinting(false); }
  }
  return <Dialog title={title} subtitle={subtitle} className="mg-contract-print-dialog" onClose={() => { if (!busy.current) onClose(); }}>
    <div className="mg-contract-print-toolbar"><p>Đối chiếu thông tin với khách trước khi in. Có thể chọn “Lưu dưới dạng PDF” trong hộp thoại in.</p>
      <button className="mg-button mg-button-primary" type="button" onClick={() => void print()} disabled={printing}>{printing ? <LoaderCircle size={16} className="mg-spin" /> : <Printer size={16} />}{printing ? 'Đang chuẩn bị…' : printLabel}</button></div>
    {error && <p className="mg-error-message" role="alert">{error}</p>}
    <div className="mg-contract-preview-controls" role="group" aria-label="Điều chỉnh mẫu xem trước">
      <button type="button" className="mg-icon-button" aria-label="Thu nhỏ mẫu in" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - 0.5))}><Minus size={16} /></button>
      <output aria-live="polite">{Math.round(scale * 100)}%</output>
      <button type="button" className="mg-icon-button" aria-label="Phóng to mẫu in" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + 0.5))}><Plus size={16} /></button>
      <button type="button" className="mg-button" onClick={() => setZoom(1)}>Vừa màn hình</button>
      <p className="mg-contract-preview-hint">Xoay ngang điện thoại để đọc. Phóng to để kiểm tra thông tin.</p>
    </div>
    <div className="mg-contract-paper-scroll" tabIndex={0} role="region" aria-label="Mẫu hợp đồng, cuộn để xem các trang" ref={paper}>
      <PreviewLayout.Provider value={scale}>{children}</PreviewLayout.Provider>
    </div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose} disabled={printing}>Quay lại thông tin</button></div>
  </Dialog>;
}

export function ContractPrintPreview({ doc, onClose }: { doc: LegacyContractDocument; onClose: () => void }) {
  return <PrintPreviewDialog title="Xem trước mẫu in hợp đồng" subtitle="Mẫu cũ · A4 ngang · Bản nháp chưa phát hành" printTitle={`HIMOTO - ${doc.contract_number}`} printLabel="In hợp đồng" layoutKey={doc} onClose={onClose}>
    <ContractPrintDocument doc={doc} pageWrapper={PreviewPage} />
  </PrintPreviewDialog>;
}
