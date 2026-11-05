import { WebView } from 'react-native-webview';
export function PrintPaper({ html }: { html: string }) {
  return <WebView source={{ html, baseUrl: 'about:blank' }} originWhitelist={['about:*']} javaScriptEnabled={false} domStorageEnabled={false} allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never" setSupportMultipleWindows={false} onShouldStartLoadWithRequest={r => r.url === 'about:blank'} style={{ flex: 1, backgroundColor: '#fff' }} scalesPageToFit />;
}
