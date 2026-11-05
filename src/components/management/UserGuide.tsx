'use client';

import { Fragment, type ReactNode } from 'react';
import { Check, ZoomIn } from 'lucide-react';

function safeHref(href: string) { return href.startsWith('#') || href.startsWith('https://') || href.startsWith('/help/') ? href : '#'; }
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
    if (part.startsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) return <a key={index} href={safeHref(link[2])}>{link[1]}</a>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}
export function GuideContent({ body, onImage }: { body: string; onImage: (src: string, alt: string) => void }) {
  const lines = body.split('\n'), blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line === '---') continue;
    const image = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line);
    if (image) {
      const src = image[2].startsWith('images/') ? `/help/${image[2]}` : safeHref(image[2]);
      blocks.push(<figure className="ug-figure" key={i}><button type="button" onClick={() => onImage(src, image[1])} aria-label={`Phóng to ảnh: ${image[1]}`}><img src={src} alt={image[1]} loading="lazy" /><span><ZoomIn size={16} />Bấm để xem ảnh lớn</span></button><figcaption>{image[1]}</figcaption></figure>);
      continue;
    }
    if (line.startsWith('### ')) { blocks.push(<h3 key={i}>{inline(line.slice(4))}</h3>); continue; }
    if (line.startsWith('|')) {
      const table: string[][] = [];
      do { table.push(lines[i].trim().split('|').slice(1, -1).map(cell => cell.trim())); i++; } while (i < lines.length && lines[i].trim().startsWith('|'));
      i--;
      blocks.push(<div className="ug-table" key={i}><table><thead><tr>{table[0].map((cell, j) => <th key={j}>{inline(cell)}</th>)}</tr></thead><tbody>{table.slice(2).map((row, j) => <tr key={j}>{row.map((cell, k) => <td key={k}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^\d+\. /.test(line) || line.startsWith('- ')) {
      const ordered = /^\d+\. /.test(line), items: ReactNode[] = [];
      do {
        const value = lines[i].trim().replace(ordered ? /^\d+\. / : /^- /, '');
        items.push(<li key={i}>{value.startsWith('[ ] ') ? <><Check size={16} aria-hidden="true" />{inline(value.slice(4))}</> : inline(value)}</li>); i++;
      } while (i < lines.length && (ordered ? /^\d+\. /.test(lines[i].trim()) : lines[i].trim().startsWith('- ')));
      i--; blocks.push(ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>); continue;
    }
    let paragraph = line;
    while (i + 1 < lines.length && lines[i + 1].trim() && !/^(?:#|!\[|\||\d+\. |-|```)/.test(lines[i + 1].trim())) paragraph += ` ${lines[++i].trim()}`;
    blocks.push(<p key={i}>{inline(paragraph)}</p>);
  }
  return <div className="ug-prose">{blocks}</div>;
}
