import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, usePreventRemove } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import { uuid } from 'expo';
import type { MobilePrintDocument, MobilePrintKind } from '../../../shared/mobile-print';
import { useSession } from '@/providers/session';
import { dateTime, useTheme } from '@/theme';
import { Button, Card, InlineError, StateView } from './ui';
import { ChoiceField } from './form-fields';
import { PrintPaper } from './print-paper';

export function PrintEditor({ kind, id, initialVersion = '' }: { kind: MobilePrintKind; id: string; initialVersion?: string }) {
  const { api, session } = useSession(), theme = useTheme(), [version, setVersion] = useState(initialVersion), [includeQr, setIncludeQr] = useState(kind === 'contracts'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [pages, setPages] = useState<number | null>(null);
  const alive = useRef(true), running = useRef(false), file = useRef<{ identity: MobilePrintDocument; uri: string; pages: number } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  usePreventRemove(busy, () => {});
  const query = useQuery({ queryKey: ['print', api?.origin, session?.user.id, session?.user.storeId, session?.user.allStores, kind, id, version, includeQr], gcTime: 0, staleTime: 0, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: ({ signal }) => api!.printDocument(kind, id, version, includeQr, signal), enabled: !!api });
  const p = query.data, text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  async function pdf(document: MobilePrintDocument) {
    if (file.current?.identity === document) return file.current;
    const Print = await import('expo-print'), generated = await Print.printToFileAsync({ html: document.html, width: document.portrait ? 595.28 : 841.89, height: document.portrait ? 841.89 : 595.28, margins: { top: 0, left: 0, right: 0, bottom: 0 } });
    if (!generated.uri.startsWith(Paths.cache.uri) || !generated.uri.endsWith('.pdf')) throw Error('Chưa xác nhận được tệp PDF. Tạo lại mẫu trước khi in.');
    const source = new File(generated.uri), target = new File(Paths.cache, `himoto-${kind}-${id}-${uuid.v4()}.pdf`);
    source.move(target); const result = { identity: document, uri: target.uri, pages: generated.numberOfPages }; file.current = result; if (alive.current) setPages(result.pages); return result;
  }
  async function output(action: 'print' | 'pdf') {
    if (!p || running.current || query.isFetching || query.isError) return;
    if (Platform.OS === 'web') { setError('Mở Himoto trên Android hoặc iPhone để in / chia sẻ PDF của hồ sơ.'); return; }
    running.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const generated = await pdf(p); if (!alive.current) return;
      if (action === 'print') {
        const Print = await import('expo-print'); await Print.printAsync({ uri: generated.uri, orientation: p.portrait ? Print.Orientation.portrait : Print.Orientation.landscape });
        if (alive.current) setNotice('Đã mở hộp thoại in. Kiểm tra giấy và máy in trong hộp thoại hệ thống.');
      } else {
        const Sharing = await import('expo-sharing'); if (!await Sharing.isAvailableAsync()) throw Error('Thiết bị chưa có chức năng chia sẻ tệp. Có thể dùng hộp thoại in để lưu PDF.');
        if (!alive.current) return; await Sharing.shareAsync(generated.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Himoto · ${p.code}` });
        if (alive.current) setNotice('Đã mở tùy chọn chia sẻ / lưu PDF.');
      }
    } catch (cause) { if (alive.current && !/cancel/i.test((cause as Error).message)) setError((cause as Error).message); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  return <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.background }}><Stack.Screen options={{ title: 'Xem giấy và in hợp đồng' }} />
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      {!!error && <InlineError message={error} />}{!!notice && <Text accessibilityLiveRegion="polite" style={text}>{notice}</Text>}
      {query.isPending && <StateView title="Đang tạo mẫu giấy" loading />}{query.isError && <StateView title="Chưa tạo được mẫu giấy" message={(query.error as Error).message} retry={() => void query.refetch()} />}
      {p && <>
        <Card style={{ gap: 10 }}><Text accessibilityRole="header" style={{ ...text, fontSize: 22, fontWeight: '700' }}>{p.code}</Text><Text style={text}>{p.versionLabel} · A4 {p.portrait ? 'dọc' : 'ngang'}{p.preview ? ' · Mẫu nháp' : ''}</Text><Text style={muted}>Tạo mẫu lúc {dateTime(p.generatedAt)} · Phiên bản hồ sơ {p.revision}</Text>{p.notices.map(n => <Text key={n} style={muted}>{n}</Text>)}</Card>
        {kind === 'contracts' && <ChoiceField label="Phiên bản giấy cần in" value={version} choices={[{ value: '', label: 'Hợp đồng hiện tại' }, ...p.versions.map(v => ({ value: v.id, label: `${v.label} · ${dateTime(v.at)}` }))]} disabled={busy || query.isFetching} searchable onChange={v => { setVersion(v); setPages(null); setNotice(''); }} />}
        {kind === 'contracts' && <ChoiceField label="QR thanh toán trên giấy" value={includeQr ? 'yes' : 'no'} choices={[{ value: 'yes', label: 'Kèm QR mặc định của cơ sở nếu có' }, { value: 'no', label: 'Không kèm QR thanh toán' }]} disabled={busy || query.isFetching} onChange={v => { setIncludeQr(v === 'yes'); setPages(null); setNotice(''); }} />}
        <Text style={muted}>Phóng bằng hai ngón hoặc xoay ngang máy để đọc giấy trước khi in.</Text>
        <View accessibilityLabel="Mẫu giấy hợp đồng" style={{ height: 540, borderWidth: 1, borderColor: theme.border, borderRadius: 12, overflow: 'hidden' }}><PrintPaper html={p.html} /></View>
        {pages !== null && <Text style={muted}>PDF vừa tạo: {pages} trang.</Text>}
        <Button secondary label="Tạo lại giấy từ hồ sơ mới nhất" disabled={busy || query.isFetching} onPress={() => { setPages(null); setNotice(''); void query.refetch(); }} />
      </>}
    </ScrollView>
    {p && <View style={{ padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.surface }}><Button label="Mở hộp thoại in" loading={busy} disabled={query.isFetching || query.isError} onPress={() => void output('print')} /><Button secondary label="Chia sẻ / lưu PDF hợp đồng" disabled={busy || query.isFetching || query.isError} onPress={() => void output('pdf')} /></View>}
  </SafeAreaView>;
}
