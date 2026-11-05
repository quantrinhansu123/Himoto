export function PrintPaper({ html }: { html: string }) {
  return <iframe title="Mẫu giấy Himoto" srcDoc={html} sandbox="" style={{ width: '100%', height: '100%', border: 0, background: '#fff' }} />;
}
