import {ScrollView} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useLocalSearchParams} from 'expo-router';
import {useSession} from '@/providers/session';
import {useTheme} from '@/theme';
import {BatteryPhotoBatch} from '@/components/battery-photo-batch';
import {StateView} from '@/components/ui';
export default function Route(){const{id,eventKey}=useLocalSearchParams<{id:string;eventKey:string}>(),{session}=useSession(),theme=useTheme();if(!session||!/^[1-9]\d{0,14}$/.test(id)||eventKey!=='rental'&&!/^[a-f0-9-]{36}$/.test(eventKey))return <StateView title="Không mở được ảnh lượt pin"/>;return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}><ScrollView contentContainerStyle={{padding:16,gap:14,maxWidth:760,width:'100%',alignSelf:'center'}}><BatteryPhotoBatch id={id} eventKey={eventKey} title={eventKey==='rental'?'Ảnh thuê pin / sạc':'Ảnh và Telegram của lượt pin / sạc'}/></ScrollView></SafeAreaView>;}
