import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image, type ImageSource } from "expo-image";
import { X } from "lucide-react-native";
import { useTheme } from "@/theme";
import { Button, InlineError } from "./ui";

export function BillPhoto({source,label,onReady,context='bill'}:{source:ImageSource;label:string;onReady?:(ready:boolean)=>void;context?:string}) {
  const theme=useTheme(),window=useWindowDimensions();
  const [expanded,setExpanded]=useState(false),[zoom,setZoom]=useState(1),[error,setError]=useState(false);
  const [aspect,setAspect]=useState(1);
  const imageWidth=window.width*zoom,imageHeight=imageWidth/aspect;
  return <View style={{gap:12}}>
    {error&&<InlineError message={'Chưa tải được ảnh '+context+'. Tải lại số liệu để kiểm tra đúng ảnh hiện tại.'}/>}
    <Pressable accessibilityRole="button" accessibilityLabel={`Xem lớn ${label}`} onPress={()=>{setZoom(1);setExpanded(true);}}
      style={{borderRadius:16,overflow:"hidden",borderWidth:1,borderColor:theme.border}}>
      <Image source={source} accessibilityLabel={label} cachePolicy="none" contentFit="contain" style={{width:"100%",height:280,backgroundColor:theme.background}}
        onLoad={event=>{setError(false);if(event.source.width>0&&event.source.height>0)setAspect(Math.max(.1,Math.min(10,event.source.width/event.source.height)));onReady?.(true);}}
        onError={()=>{setError(true);onReady?.(false);}}/>
      <Text style={{color:theme.primary,textAlign:"center",padding:16,fontSize:16,fontWeight:"700"}}>Xem ảnh lớn</Text>
    </Pressable>
    <Modal visible={expanded} animationType="none" onRequestClose={()=>setExpanded(false)} accessibilityViewIsModal>
      <SafeAreaView style={{flex:1,backgroundColor:theme.background}}>
        <View style={{padding:12,gap:8,flexShrink:0,zIndex:1,backgroundColor:theme.background}}>
          <View style={{flexDirection:"row",alignItems:"center",gap:12}}>
            <Text accessibilityRole="header" style={{flex:1,color:theme.text,fontSize:20,fontWeight:"800"}}>{label}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={'Đóng ảnh '+context} onPress={()=>setExpanded(false)}
              style={{width:48,height:48,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:theme.controlBorder,borderRadius:12}}>
              <X size={22} color={theme.text} accessible={false}/>
            </Pressable>
          </View>
          <View style={{flexDirection:"row",gap:12}}>
            <View style={{flex:1}}><Button secondary label="Thu nhỏ" disabled={zoom===1} onPress={()=>setZoom(value=>Math.max(1,value-1))}/></View>
            <View style={{flex:1}}><Button label="Phóng to" disabled={zoom===3} onPress={()=>setZoom(value=>Math.min(3,value+1))}/></View>
          </View>
          <Text accessibilityLiveRegion="polite" style={{color:theme.muted,fontSize:15}}>Mức {zoom}× · Kéo để xem chi tiết.</Text>
        </View>
        <View style={{flex:1,minHeight:0,overflow:"hidden"}}><ScrollView horizontal nestedScrollEnabled style={{flex:1}} contentContainerStyle={{width:imageWidth}}>
          <ScrollView nestedScrollEnabled style={{width:imageWidth}} contentContainerStyle={{height:imageHeight}}>
            <Image source={source} cachePolicy="none" contentFit="contain" accessibilityLabel={label}
              style={{width:imageWidth,height:imageHeight}}/>
          </ScrollView>
        </ScrollView></View>
      </SafeAreaView>
    </Modal>
  </View>;
}
