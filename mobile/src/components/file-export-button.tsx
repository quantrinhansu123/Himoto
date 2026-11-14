import { Text, View } from 'react-native';
import { usePreventRemove } from 'expo-router';
import type { MobileFileExport } from '../../../shared/mobile-export';
import { useCsvExport } from '@/hooks/use-csv-export';
import { useTheme } from '@/theme';
import { Button, InlineError } from './ui';

export function FileExportButton({ load, disabled = false, hint }: {
  load: (signal: AbortSignal) => Promise<MobileFileExport>;
  disabled?: boolean;
  hint?: string;
}) {
  const output = useCsvExport(), theme = useTheme();
  usePreventRemove(output.busy, () => {});
  return <View style={{ gap: 8 }}>
    <Button secondary label={output.stage === 'fetching' ? 'Đang tạo Excel từ toàn bộ kết quả' : output.stage === 'saving' ? 'Đang lưu / chia sẻ Excel' : 'Tải Excel theo bộ lọc'} loading={output.busy} disabled={disabled} onPress={() => void output.run(load)} />
    {!!hint && <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19 }}>{hint}</Text>}
    {!!output.error && <InlineError message={output.error} />}
    {!!output.message && <Text accessibilityLiveRegion="polite" style={{ color: theme.text, lineHeight: 22 }}>{output.message}</Text>}
  </View>;
}
