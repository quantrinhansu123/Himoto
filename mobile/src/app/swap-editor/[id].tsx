import {useLocalSearchParams} from 'expo-router';
import {SwapEditor} from '@/components/swap-editor';
export default function SwapEntry(){const {id}=useLocalSearchParams<{id:string}>();return <SwapEditor id={id}/>;}
