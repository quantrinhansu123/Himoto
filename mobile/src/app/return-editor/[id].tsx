import {useLocalSearchParams} from 'expo-router';
import {ReturnEditor} from '@/components/return-editor';
export default function ReturnEdit(){const {id}=useLocalSearchParams<{id:string}>();return <ReturnEditor id={id}/>;}
