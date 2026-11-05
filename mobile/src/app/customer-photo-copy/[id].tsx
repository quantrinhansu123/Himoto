import {useLocalSearchParams} from 'expo-router';
import {CustomerPhotoCopyScreen} from '@/components/customer-photo-copy';
export default function CustomerPhotoCopyRoute(){
  const {id}=useLocalSearchParams<{id:string}>();return <CustomerPhotoCopyScreen id={typeof id==='string'?id:''}/>;
}
