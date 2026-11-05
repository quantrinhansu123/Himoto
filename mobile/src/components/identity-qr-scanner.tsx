import {useEffect,useRef,useState} from 'react';
import {AppState,Text,View} from 'react-native';
import {WebView,type WebViewProps} from 'react-native-webview';
import {uuid} from 'expo';
import {useSession} from '@/providers/session';
import {useTheme} from '@/theme';
import {identityQrMessage,identityQrSourceAllowed,type IdentityQrScan} from '../../../shared/identity-qr';
import {Button,InlineError} from './ui';
import {EditorSheet} from './editor-sheet';

export function IdentityQrScanner({onScan,onClose}:{onScan:(scan:IdentityQrScan)=>void;onClose:()=>void}){
  const {api}=useSession(),theme=useTheme(),[nonce]=useState(()=>uuid.v4().toLowerCase()),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
  const url=api?.origin+'/mobile-identity-qr#'+nonce;
  const web=useRef<WebView<WebViewProps>>(null);
  useEffect(()=>{const listener=AppState.addEventListener('change',state=>{
    // The album picker is another Android activity. Keep its WebView mounted so
    // the selected file can return, while explicitly stopping any live camera.
    if(state==='background')web.current?.injectJavaScript('window.dispatchEvent(new Event("himoto:identity-qr-pause"));true;');
  });return()=>listener.remove();},[]);
  return <EditorSheet title="Quét QR căn cước" onClose={onClose}>
    {failed?<View style={{padding:20,gap:16}}><InlineError message="Chưa mở được bộ quét. Kiểm tra mạng rồi thử lại."/><Button label="Tải lại bộ quét QR" onPress={()=>{setFailed(false);setAttempt(value=>value+1);}}/></View>:
      <WebView ref={web} key={attempt} source={{uri:url}} style={{flex:1,backgroundColor:theme.surface}} javaScriptEnabled domStorageEnabled={false}
        incognito sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} originWhitelist={[api!.origin]} setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false} mediaPlaybackRequiresUserAction={false} allowsInlineMediaPlayback
        onShouldStartLoadWithRequest={request=>request.url===url}
        onError={()=>setFailed(true)} onHttpError={()=>setFailed(true)}
        onMessage={event=>{if(!identityQrSourceAllowed(event.nativeEvent.url,url))return;const scan=identityQrMessage(event.nativeEvent.data,nonce);if(scan){onScan(scan);onClose();}}}/>}
    <Text style={{color:theme.muted,padding:16,lineHeight:22}}>Chỉ điền thông tin từ QR. Kiểm tra lại trước khi lưu hồ sơ.</Text>
  </EditorSheet>;
}
