import { useLocalSearchParams } from 'expo-router';
import { ShiftVideoEditor } from '@/components/shift-video-editor';

export default function Screen() {
  const p = useLocalSearchParams<{ id: string; stage: string; category: string }>();
  return <ShiftVideoEditor id={typeof p.id === 'string' ? p.id : ''} stage={typeof p.stage === 'string' ? p.stage : ''} category={typeof p.category === 'string' ? p.category : ''} />;
}
