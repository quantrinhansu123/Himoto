import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { OperationGuide } from '@/components/management/OperationGuide';
import '@/styles/user-guide.css';

export const metadata = { title: 'Hướng dẫn sử dụng | HIMOTO' };

export default async function UserGuidePage() {
  const markdown = await readFile(path.join(process.cwd(), 'docs/huong-dan-su-dung/HUONG-DAN-SU-DUNG-HIMOTO.md'), 'utf8');
  const sections = markdown.split(/^## /m).slice(1).filter(section => /^\d+\./.test(section)).map(section => {
    const newline = section.indexOf('\n');
    const title = section.slice(0, newline).trim();
    return { id: title.split('.')[0], title, body: section.slice(newline + 1).split('\n---\n')[0].trim() };
  });
  return <OperationGuide sections={sections} />;
}
