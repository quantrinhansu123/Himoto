// Render production TSX with synthetic hooks; no device state, backend writes or network.
require('./lib/offline-tests.cjs');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { load: loadDomain } = require('./lib/load-typescript.cjs');
const root = path.resolve(__dirname, '..');
const React = require('../mobile/node_modules/react'), jsx = require('../mobile/node_modules/react/jsx-runtime');
const config = loadDomain(path.join(root, 'mobile/src/lib/catalogue-config'));
const workspaces = loadDomain(path.join(root, 'shared/mobile-contract-workspaces'));
const checks = [], pushed = [], requests = [];
let user, pathname, params, hookIndex, hookValues, infiniteOptions, statisticsOptions, listPage, statisticsPage;
const theme = new Proxy({}, { get: (_o, key) => key });
const components = Object.fromEntries(['Button','Card','InlineError','StateView','StatusBadge','Brand'].map(name => [name, name]));
const native = Object.fromEntries(['Modal','Pressable','ScrollView','Text','View','FlatList','ActivityIndicator','RefreshControl','TextInput'].map(name => [name, name]));
Object.assign(native, { StyleSheet: { create: value => value }, Platform: { OS: 'android' }, Keyboard: { dismiss() {} }, useWindowDimensions: () => ({ width: 375, height: 812 }) });
const hooks = { ...React, useMemo: fn => fn(), useCallback: fn => fn, useEffect() {}, useRef: value => ({ current: value }),
  useState(value) { const position = hookIndex++; return [Object.hasOwn(hookValues, position) ? hookValues[position] : typeof value === 'function' ? value() : value, next => { hookValues[position] = next; }]; } };
const queryClient = { invalidateQueries: async () => {}, prefetchQuery: async () => {} };
const api = { origin: 'https://fixture.invalid', catalogue: async (kind, query) => { requests.push({ kind, query: new URLSearchParams(query) }); return listPage; } };
const base = { react: hooks, 'react/jsx-runtime': jsx, 'react-native': native, 'lucide-react-native': new Proxy({}, { get: () => () => null }),
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  'expo-router': { Stack: { Screen: 'StackScreen' }, router: { push: value => pushed.push(value) }, useRouter: () => ({ push: value => pushed.push(value) }), usePathname: () => pathname, useLocalSearchParams: () => params },
  '@/theme': { useTheme: () => theme, statuses: { renting: 'Đang thuê', draft: 'Nháp' }, roles: {}, money: String, dateTime: String },
  '@/components/ui': components, './ui': components,
  '@/lib/catalogue-config': config, '../../../shared/mobile-contract-workspaces': workspaces,
  '../../../shared/mobile-backfill': loadDomain(path.join(root, 'shared/mobile-backfill')),
  '../../../shared/mobile-managed-accounts': loadDomain(path.join(root, 'shared/mobile-managed-accounts')),
  '../../../../shared/mobile-contract-workspaces': workspaces,
  '@/providers/session': { useSession: () => ({ session: { user }, api, logout: async () => {}, restore: async () => {} }) },
  '@/hooks/use-workspace': { useWorkspace: () => ({ data: { stores: [{ id: 23, name: 'Branch A' }, { id: 24, name: 'Branch B' }] } }) },
  '@tanstack/react-query': { useQueryClient: () => queryClient,
    useInfiniteQuery: options => { infiniteOptions = options; return { data: { pages: [listPage] }, isSuccess: true }; },
    useQuery: options => { statisticsOptions = options; return { data: statisticsPage, isSuccess: !!statisticsPage }; },
    useQueries: options => options.queries.map(() => ({ data: listPage, isPending: false })), },
};
function load(file, extra = {}) {
  const module = { exports: {} }, dependencies = { ...base, ...extra };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', 'setTimeout', code)(name => {
    assert(Object.hasOwn(dependencies, name), 'Unexpected dependency: ' + name); return dependencies[name];
  }, module, module.exports, fn => fn());
  return module.exports;
}
function nodes(tree) { return !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)]; }
function text(tree) { return tree == null || typeof tree === 'boolean' ? '' : typeof tree !== 'object' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : text(tree.props?.children) + text(tree.props?.ListHeaderComponent); }
function reset() {
  user = { id: 7, role: 'staff', storeId: 23, allStores: false, permissions: ['contracts.read','customers.read','vehicles.read'] };
  pathname = '/contracts'; params = {}; hookIndex = 0; hookValues = {}; pushed.length = requests.length = 0;
  listPage = { rows: [], total: 0, page: 1, pages: 1, statusCounts: [] };
  statisticsPage = { ...listPage, active: 0, overdue: 0, tabCount: 10, statusCounts: [['renting', 4], ['overdue', 2], ['bad_debt', 1], ['completed', 3]] };
}
const { RecordActionsModal } = load('mobile/src/components/record-actions-modal.tsx');
const record = { id: 101, code: 'QA-101', name: 'Same Name', status: 'renting', license: 'QA-TEST', reminderEligible: true };
function actions(kind, row = record, permissions = user.permissions) {
  return nodes(RecordActionsModal({ visible: true, onClose() {}, kind, record: row, permissions })).filter(n => n.type === 'Pressable' && n.key);
}
function actionKeys(kind, row, permissions) { return actions(kind, row, permissions).map(n => n.key); }
async function main() {
  reset();
  assert.deepEqual(actionKeys('contracts'), ['view','qr','telegram','battery','print']);
  for (const [permission, enabled] of [['contracts.return',['return','swap']], ['contracts.renew',['renew']], ['finance.write',['payment','reminder']], ['contracts.draft',['reminder']]]) {
    const keys = actionKeys('contracts', record, ['contracts.read',permission]);
    for (const key of ['return','swap','renew','payment','reminder']) assert.equal(keys.includes(key), enabled.includes(key), permission + ': ' + key);
  }
  assert(!actionKeys('contracts', { ...record, status: 'draft' }).includes('draft_edit'));
  assert(actionKeys('contracts', { ...record, status: 'draft' }, ['contracts.read','contracts.draft']).includes('draft_edit'));
  assert(!actionKeys('contracts', { ...record, reminderEligible: false }, ['contracts.read','finance.write']).includes('reminder'));
  assert.deepEqual(actionKeys('vehicles'), ['view','history']);
  assert(actionKeys('vehicles', record, ['vehicles.read','vehicles.transfer']).includes('transfer'));
  assert(actionKeys('vehicles', record, ['vehicles.read','vehicles.write']).includes('status'));
  assert.deepEqual(actionKeys('customers', record, ['customers.read']), ['view']);
  checks.push('Row menus require each projected write grant; read-only accounts keep only readable actions, draft/reminder eligibility is preserved');

  const bad = { ...record, status: 'bad_debt' };
  assert(!actionKeys('contracts', bad, ['contracts.read']).includes('close_bad_debt'));
  const close = actions('contracts', bad, ['contracts.read','contracts.settle']).find(n => n.key === 'close_bad_debt');
  close.props.onPress(); assert.deepEqual(pushed.pop(), { pathname: '/contract-lifecycle/[id]', params: { id: '101', action: 'close_bad_debt' } });
  const { default: Lifecycle } = load('mobile/src/app/contract-lifecycle/[id].tsx', { '@/components/contract-lifecycle-editor': { ContractLifecycleEditor: 'Lifecycle' } });
  params = { id: '101', action: 'close_bad_debt' }; assert.equal(Lifecycle().props.initialAction, 'close_bad_debt');
  params = { id: '101', action: 'arbitrary' }; assert.equal(Lifecycle().props.initialAction, undefined);
  checks.push('Settlement grant opens contract lifecycle with close_bad_debt for server review, never the vehicle recovery writer; arbitrary action presets are ignored');

  actions('customers').find(n => n.key === 'history').props.onPress();
  const history = pushed.pop(); assert.equal(history.params.customer_id, '101'); assert.equal(history.params.status, 'all'); assert(!Object.hasOwn(history.params, 'search'));
  const { default: Contracts } = load('mobile/src/app/(tabs)/contracts.tsx', { '@/components/catalogue-screen': { CatalogueScreen: 'Catalogue' } });
  params = history.params; const screen = Contracts(); assert.equal(screen.props.initialCustomerId, '101'); assert.equal(screen.props.initialStatus, '');
  params = { search: 'Same Name' }; assert.equal(Contracts().props.initialSearch, 'Same Name'); assert.equal(Contracts().props.initialStatus, '');
  params = {}; assert.equal(Contracts().props.initialStatus, 'draft');
  for (const customer_id of ['0','01','101 OR 1=1','', ['101']]) { params = { customer_id }; assert.equal(Contracts().type, 'StateView'); }
  checks.push('Customer history binds an exact ID and all statuses; general search is consumed, normal opening still defaults to drafts and malformed IDs fail closed');

  const { ManagementDrawer } = load('mobile/src/components/management-drawer.tsx', { '../../../shared/mobile-managed-accounts': { canManageAccounts: () => false } });
  user.permissions.push('hr.read','settings.write');
  const drawer = nodes(ManagementDrawer({ visible: true, onClose() {} }));
  for (const [key, route] of [['staff','/directory/staff'],['stores','/directory/stores']]) { drawer.find(n => n.key === key).props.onPress(); assert.equal(pushed.pop(), route); }
  assert.equal(drawer.find(n => n.key === 'contracts').props.accessibilityState.selected, true);
  const files = fs.readdirSync(path.join(root,'mobile/src/app'), { recursive: true }).filter(file => /\.tsx$/.test(file));
  const routes = files.map(file => file.replaceAll('\\','/').replace(/\.tsx$/,'').replace(/(^|\/)index$/,'').replace(/(^|\/)\([^/]+\)(?=\/|$)/g,'').replace(/^\//,''));
  function exists(route) { const clean = typeof route === 'string' ? route : route.pathname; return routes.some(pattern => new RegExp('^/' + pattern.replace(/\[[^\]]+\]/g,'[^/]+') + '/?$').test(clean.replace(/\/\([^/]+\)/g,'') || '/')); }
  for (const item of drawer.filter(n => n.type === 'Pressable' && n.key)) { item.props.onPress(); assert(exists(pushed.pop()), 'Missing route for ' + item.key); }
  user.permissions = ['contracts.read']; const limitedDrawer = nodes(ManagementDrawer({ visible: true, onClose() {} }));
  assert(!limitedDrawer.some(n => n.key === 'staff'));
  assert(limitedDrawer.some(n => n.key === 'stores'));
  checks.push('Every drawer destination exists, staff/stores open directories, grouped tab paths highlight correctly and denied sections remain hidden');

  reset(); const { default: Overview } = load('mobile/src/app/(tabs)/index.tsx', { '@/components/workspace-links': { WorkspaceLinks: 'WorkspaceLinks' }, '@/components/management-drawer': { ManagementDrawer: 'Drawer' } });
  for (const allStores of [true, false]) {
    hookIndex = 0; hookValues = { 3: '24' }; user.allStores = allStores; user.permissions.push('contracts.draft');
    nodes(Overview()).find(n => n.props?.accessibilityLabel === 'Làm hợp đồng mới').props.onPress();
    assert.deepEqual(pushed.pop(), { pathname: '/draft/new', params: { store_id: allStores ? '24' : '23' } });
  }
  checks.push('New contract inherits the selected branch for managers while branch staff cannot replace their assigned store through local selection');

  reset(); const { CatalogueScreen } = load('mobile/src/components/catalogue-screen.tsx', {
    './vehicle-thumbnail': { VehicleThumbnail: 'Thumbnail' }, '@/lib/record-preview': { rememberRecordPreview() {} },
    '@/components/catalogue-filters': { CatalogueFilters: 'Filters' }, '@/components/management-drawer': { ManagementDrawer: 'Drawer' },
    '@/components/record-actions-modal': { RecordActionsModal: 'Actions' },
  });
  let tree = CatalogueScreen({ kind: 'contracts', initialStatus: 'draft', initialCustomerId: '101', customerName: 'Same Name', initialStore: 'all' });
  assert(text(tree).includes('Tất cả (10)')); assert(text(tree).includes('Đang thuê (7)'));
  assert(text(tree).includes('Hợp đồng của khách: Same Name'));
  assert(statisticsOptions.enabled); const countKey = statisticsOptions.queryKey;
  await infiniteOptions.queryFn({ pageParam: 1, signal: new AbortController().signal });
  await statisticsOptions.queryFn({ signal: new AbortController().signal });
  assert.equal(requests[0].query.get('customer_id'), '101'); assert.equal(requests[0].query.get('status'), 'draft');
  assert.equal(requests[0].query.get('store'), '23'); assert.equal(requests[1].query.get('statistics'), '1');
  assert(!requests[1].query.has('status')); assert.equal(requests[1].query.get('customer_id'), '101');
  hookIndex = 0; hookValues = {}; tree = CatalogueScreen({ kind: 'contracts', initialStatus: 'completed', initialCustomerId: '101' });
  assert.deepEqual(statisticsOptions.queryKey, countKey); assert(text(tree).includes('Tất cả (10)'));
  statisticsPage = undefined; hookIndex = 0; hookValues = {}; tree = CatalogueScreen({ kind: 'contracts', initialStatus: 'draft' });
  assert(!text(tree).includes('Tất cả (0)'), 'Unavailable statistics must not be replaced with a filtered zero');
  hookIndex = 0; hookValues = {}; CatalogueScreen({ kind: 'contracts', operationsCatalogue: true }); assert(!statisticsOptions.enabled);
  checks.push('Independent counters keep All=10 and active=7 even on an empty draft tab; customer/store filters bind both reads, status switches reuse counts and unavailable counts never show a false zero');
  reset(); hookIndex = 0;
  tree = CatalogueScreen({ kind: 'contracts', initialStatus: '' });
  assert(text(tree).includes('Quá hạn (3)'));
  for (const scope of ['overdue','drafts','vat','due','ownership']) {
    reset(); tree = CatalogueScreen({ kind: 'contracts', initialScope: scope });
    const label = scope === 'drafts' ? 'Tất cả bản nháp' : workspaces.contractWorkspace(scope).title;
    assert(text(tree).includes(label + ' (10)'), scope);
    assert(!text(tree).includes('Tất cả (10)'), scope);
    await infiniteOptions.queryFn({ pageParam: 1, signal: new AbortController().signal });
    assert.equal(requests[0].query.get('scope'), scope);
    assert.equal(requests[0].query.get('status'), '');
  }
  checks.push('Overdue tab counts bad debt; five drawer workspaces select their own group with an unfiltered status instead of misleading All');
  reset(); statisticsPage = { ...statisticsPage, tabCount: 0, statusCounts: [] };
  tree = CatalogueScreen({ kind: 'contracts', initialStatus: '' });
  assert(text(tree).includes('Quá hạn (0)'));
  reset(); listPage = { ...listPage, total: 2, statusCounts: [['bad_debt',2]] };
  tree = CatalogueScreen({ kind: 'customers' });
  assert(text(tree).includes('Nợ xấu / Cấm thuê (2)'));
  checks.push('Customer blacklist tab counts the web bad_debt status instead of showing a false zero for its filter alias');
  console.log(JSON.stringify({ passed: checks.length, checks, operationalWrites: 0, nativeScreenReaderCertified: false }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
