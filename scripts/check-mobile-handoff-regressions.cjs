require('./lib/offline-tests.cjs');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { load: domain, root } = require('./lib/load-typescript.cjs');
const jsx = require('../mobile/node_modules/react/jsx-runtime');
const config = domain(path.resolve('mobile/src/lib/catalogue-config'));
const { printFailure } = domain(path.resolve('mobile/src/lib/print-feedback'));
const checks = [], pushed = [], states = [], printed = [];
let cursor = 0, tab = 'customer', printError = null, pdfCalls = 0;
const document = { id: 17, code: 'QA-17', revision: '123', version: '', versionLabel: 'Hợp đồng hiện tại', html: '<!doctype html><html><body>QA contract</body></html>', portrait: false, preview: false, qrIncluded: false, notices: [], versions: [], generatedAt: '2026-11-17T00:00:00Z' };
const react = { useEffect() {}, useRef: value => ({ current: value }), useState(value) {
  const at = cursor++; return [at === 0 && tab ? tab : value, next => { states[at] = next; }];
} };
const primitive = new Proxy({}, { get: (_, key) => key });
const deps = {
  react, 'react/jsx-runtime': jsx, 'react-native': { ...primitive, View: 'View', Text: 'Text', ScrollView: 'ScrollView', StyleSheet: { create: v => v }, Platform: { OS: 'android' } },
  'expo-router': { router: { push: value => pushed.push(value) }, Stack: { Screen: 'Screen' }, usePreventRemove() {} },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }, 'lucide-react-native': primitive,
  '@/lib/catalogue-config': config, '@/lib/print-feedback': { printFailure },
  '@/providers/session': { useSession: () => ({ api: {}, session: { user: { permissions: ['contracts.read'] } } }) },
  '@/theme': { useTheme: () => primitive, dateTime: String, money: String }, './ui': { Button: 'Button', Card: 'Card', InfoBanner: 'InfoBanner', InlineError: 'InlineError', KeyValueRow: 'KeyValueRow', StateView: 'StateView', StatusBadge: 'StatusBadge' },
  './editor-sheet': { ConfirmEdit: 'ConfirmEdit' },
  '../../../shared/rental-time': domain(path.resolve('shared/rental-time')),
  './section-tabs': { SectionTabs: 'SectionTabs' }, './contract-approval-summary': { ContractApprovalSummary: 'Approval' }, './contract-photos-tab': { ContractPhotosTab: 'ContractPhotosTab' }, './form-fields': { ChoiceField: 'ChoiceField' }, './print-paper': { PrintPaper: 'PrintPaper' },
  '@tanstack/react-query': { useQuery: ({ queryKey } = {}) => ({ data: queryKey?.[0] === 'contract-detail' ? undefined : document }), useQueryClient: () => ({ invalidateQueries: async () => {} }) },
  'expo-file-system': { File: class {}, Paths: { cache: { uri: 'file:///cache/' } } }, expo: { uuid: {} },
  'expo-print': { Orientation: { portrait: 'portrait', landscape: 'landscape' }, async printAsync(options) { printed.push(options); if (printError) throw printError; }, async printToFileAsync() { pdfCalls++; throw Error('Synthetic PDF failure'); } },
};
function load(file) {
  const mod = { exports: {} }, code = ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require','module','exports',code)(name => { assert(Object.hasOwn(deps,name),name); return deps[name]; },mod,mod.exports);
  return mod.exports;
}
function nodes(value) { return !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value,...nodes(value.props?.children)]; }
async function main() {
  const { ContractDetailView } = load('mobile/src/components/contract-detail-view.tsx');
  const detail = ContractDetailView({ record: { id: 17, code: 'QA-17', name: 'Synthetic QA', phone: '', status: 'renting' }, onRefresh() {} });
  nodes(detail).find(n => n.props?.label === 'Giấy tờ và CCCD trong hợp đồng').props.onPress();
  assert.deepEqual(pushed.pop(), { pathname: '/record-media/[entity]/[id]', params: { entity: 'contracts', id: '17', kind: 'rental', referenceId: '17' } });
  checks.push('Contract documents bind the contract rental album, never a customer with the same numeric ID');
  assert(config.catalogueStatuses('customers','',true).includes('draft'));
  assert(!config.catalogueStatuses('contracts','overdue',true).includes('renting'));
  assert.equal(config.catalogueAllLabel('vehicles'),'Đang quản lý');
  checks.push('Full customer filters retain incomplete profiles while scoped overdue filters cannot introduce a second active-rental list');
  const { PrintEditor } = load('mobile/src/components/print-editor.tsx');
  for (const failure of [null, new Error("Call to function 'ExpoPrint.print' has been rejected. Caused by: native private path"), new Error('Printing cancelled')]) {
    cursor = 0; tab = ''; printError = failure; states.length = 0;
    const tree = PrintEditor({ kind: 'contracts', id: '17' });
    nodes(tree).find(n => n.props?.label === 'Mở hộp thoại in').props.onPress();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(printed.at(-1).html,document.html); assert.equal(printed.at(-1).uri,undefined); assert.equal(pdfCalls,0);
    if (failure && !/cancel/.test(failure.message)) { assert(states[3].includes('Chia sẻ / lưu PDF')); assert(!states[3].includes('ExpoPrint')); assert(!states[3].includes('private path')); }
    if (failure && /cancel/.test(failure.message)) { assert.equal(states[3],''); assert(states[4].includes('Đã đóng')); }
  }
  checks.push('Actual print button sends HTML/A4 landscape directly to the native dialog without PDF file printing; native failure is actionable and cancellation stays informational');
  for (const cause of [undefined, null, new Error('Unknown native failure')]) assert(printFailure(cause,'pdf').error.includes('PDF'));
  assert(printFailure(new Error('Missing printer'),'print').error.includes('ứng dụng đọc PDF'));
  console.log(JSON.stringify({ passed: checks.length, checks, externalRequests: 0, operationalWrites: 0 },null,2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
