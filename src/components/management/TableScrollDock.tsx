'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Dock {
  target: HTMLElement; host: HTMLElement; left: number; top: number; width: number; range: number; label: string;
}
const PANES = '.mg-table-scroll, .mg-import-table-scroll, .shift-table-scroll';
const HEIGHT = 22;

/** A shared native scrollbar for the visible table, including tables in modal dialogs. */
export function TableScrollDock() {
  const [dock, setDock] = useState<Dock | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const preferred = useRef<HTMLElement | null>(null);
  const prefix = useId().replace(/:/g, '');

  useEffect(() => {
    let frame = 0, nextId = 0;
    const panes = new Set<HTMLElement>();
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    const discover = () => {
      resize.disconnect(); panes.clear();
      for (const pane of document.querySelectorAll<HTMLElement>(PANES)) {
        const table = pane.querySelector('table');
        if (!table || pane.closest('.mg-contract-paper-scroll')) continue;
        panes.add(pane); resize.observe(pane); resize.observe(table);
      }
      schedule();
    };
    function measure() {
      frame = 0;
      const modal = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].filter(el => el.matches(':modal')).at(-1);
      const viewport = window.visualViewport;
      const viewTop = viewport?.offsetTop || 0;
      const viewBottom = viewTop + (viewport?.height || window.innerHeight);
      const nav = !modal && document.querySelector('.mg-mobile-bottom-nav')?.getBoundingClientRect();
      const footer = modal?.querySelector('.mg-dialog-footer')?.getBoundingClientRect();
      const bottom = Math.min(viewBottom, nav && nav.height ? nav.top : viewBottom, footer?.height ? footer.top : viewBottom);
      const header = (modal?.querySelector('.mg-dialog-header') || document.querySelector('.mg-topbar'))?.getBoundingClientRect();
      const top = Math.max(viewTop, header && header.bottom > viewTop && header.top <= viewTop + 1 ? header.bottom : viewTop);
      let best: Dock | null = null, bestScore = 0;
      for (const pane of panes) {
        if (!pane.isConnected || !pane.getClientRects().length || modal && !modal.contains(pane)) continue;
        const range = pane.scrollWidth - pane.clientWidth;
        if (range < 2) continue;
        const rect = pane.getBoundingClientRect();
        let left = Math.max(0, rect.left + pane.clientLeft), right = Math.min(window.innerWidth, rect.left + pane.clientLeft + pane.clientWidth);
        let start = Math.max(top, rect.top), end = Math.min(bottom, rect.bottom);
        // A table can be clipped by a scrolling dialog/body or a closed tab panel.
        for (let parent = pane.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { start = Math.max(start, bounds.top); end = Math.min(end, bounds.bottom); }
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
        }
        if (end - start < 64 || right - left < 80) continue;
        const score = (end - start) * (right - left) + (preferred.current === pane ? 1e9 : 0);
        if (score <= bestScore) continue;
        bestScore = score;
        if (!pane.id) pane.id = `table-scroll-${prefix}-${++nextId}`;
        best = { target: pane, host: modal || document.body, left: Math.round(left), top: Math.round(end - HEIGHT), width: Math.floor(right - left), range,
          label: `Cuộn ngang: ${pane.getAttribute('aria-label') || pane.querySelector('caption')?.textContent || 'bảng dữ liệu'}` };
      }
      setDock(previous => previous?.target === best?.target && previous?.host === best?.host && previous?.left === best?.left && previous?.top === best?.top && previous?.width === best?.width && previous?.range === best?.range && previous?.label === best?.label ? previous : best);
      if (best && bar.current?.getAttribute('aria-controls') === best.target.id && Math.abs(bar.current.scrollLeft - best.target.scrollLeft) > 1) bar.current.scrollLeft = best.target.scrollLeft;
    }
    const onScroll = (event: Event) => { if (event.target !== bar.current) schedule(); };
    const prefer = (event: Event) => {
      if (event.target instanceof Element) {
        const pane = event.target.closest<HTMLElement>(PANES);
        if (pane && panes.has(pane)) { preferred.current = pane; schedule(); }
      }
    };
    const mutations = new MutationObserver(records => {
      if (records.some(record => !(record.target instanceof Element && record.target.closest('.mg-table-scroll-dock')))) discover();
    });
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'open', 'hidden'] });
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', schedule);
    document.addEventListener('pointerdown', prefer);
    document.addEventListener('focusin', prefer);
    document.addEventListener('toggle', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    discover();
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect();
      window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', schedule);
      document.removeEventListener('pointerdown', prefer); document.removeEventListener('focusin', prefer); document.removeEventListener('toggle', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [prefix]);

  useLayoutEffect(() => { if (dock && bar.current) bar.current.scrollLeft = dock.target.scrollLeft; }, [dock]);

  return dock && createPortal(<div ref={bar} className="mg-table-scroll-dock" role="region" aria-label={dock.label} aria-controls={dock.target.id} tabIndex={0}
    style={{ left: dock.left, top: dock.top, width: dock.width }}
    onScroll={event => { const left = event.currentTarget.scrollLeft; if (Math.abs(dock.target.scrollLeft - left) > 1) dock.target.scrollLeft = left; }}
    onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      event.currentTarget.scrollLeft = event.key === 'Home' ? 0 : event.key === 'End' ? dock.range : event.currentTarget.scrollLeft + (event.key === 'ArrowLeft' ? -80 : 80);
    }}><div style={{ width: dock.width + dock.range, height: 1 }} /></div>, dock.host);
}
