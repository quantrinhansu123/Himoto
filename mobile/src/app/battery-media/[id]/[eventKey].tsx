import {ScrollView} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useLocalSearchParams} from 'expo-router';
import {useSession} from '@/providers/session';
import {BatteryPhotoBatch} from '@/components/battery-photo-batch';
import {StateView} from '@/components/ui';
export default function Route(){const{id,eventKey}=useLocalSearchParams<{id:string;eventKey:string}>(),{session}=useSession();if(!session||!/^[1-9]\d{0,14}$/.test(id)||eventKey!=='rental'&&!/^[a-f0-9-]{36}$/.test(eventKey))return <StateView title="Không mở được ảnh lượt pin"/>;return <SafeAreaView edges={['left','right','bottom']} style={{flex:1}}><ScrollView contentContainerStyle={{padding:20,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}><BatteryPhotoBatch id={id} eventKey={eventKey} title={eventKey==='rental'?'Ảnh thuê pin / sạc':'Ảnh và Telegram của lượt pin / sạc'}/></ScrollView></SafeAreaView>;}
