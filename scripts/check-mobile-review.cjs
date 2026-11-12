require('./lib/offline-tests.cjs');
const assert = require('node:assert/strict'), path = require('node:path');
const { load, root } = require('./lib/load-typescript.cjs');
const { QueryClient, QueryObserver } = require('../mobile/node_modules/@tanstack/react-query');
const { refreshTabLookups } = load(path.resolve('mobile/src/lib/query-persistence'));
const { filterRows, EMPTY_QUERY } = load(path.join(root, 'lib/management/table-utils'));
const { contractOverdueCount } = load(path.join(root, 'lib/management/contract-tabs'));
const { contractStatusClause } = load(path.join(root, 'lib/server/management-table'));
const { contextualStatusLabel } = load(path.resolve('mobile/src/lib/catalogue-config'));
const { issuedContractStatuses } = load(path.resolve('shared/mobile-contract-edit'));
const fs = require('node:fs'), ts = require('typescript');
async function main() {
  const checks = [], rows = ['renting','overdue','bad_debt','completed'].map((status, id) => ({ id, status, code: `QA-${id}`, store_id: 23 }));
  const app = path.resolve('mobile/src/app');
  const patterns = fs.readdirSync(app,{recursive:true}).filter(f=>f.endsWith('.tsx')&&!/(^|[\\/])_layout\.tsx$/.test(f)).map(f=>'/'+f.replaceAll('\\','/').replace(/\.tsx$/,'').replace(/(^|\/)index$/,'').replace(/\/$/,''));
  const normalize = value => value.replace(/\/\([^/]+\)/g,'') || '/';
  const seen = new Set();
  function verify(value) {
    if (!value.startsWith('/')) return;
    const clean = normalize(value.split('?')[0]);
    assert(patterns.some(pattern=>new RegExp('^'+normalize(pattern).replace(/\[[^\]]+\]/g,'[^/]+')+'/?$').test(clean)), 'Missing navigation route: '+value);
    seen.add(value);
  }
  for (const file of fs.readdirSync(path.resolve('mobile/src'),{recursive:true}).filter(f=>f.endsWith('.tsx'))) {
    const source = ts.createSourceFile(file,fs.readFileSync(path.resolve('mobile/src',file),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isJsxAttribute(node) && ['label','hint','title','placeholder','message','confirmLabel'].includes(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer)) {
        assert(!/[A-Za-z]\?[A-Za-z]|\?{2,}|\uFFFD/.test(node.initializer.text), 'Broken UI label in '+file+': '+node.initializer.text);
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(source)==='router' && ['push','replace','navigate'].includes(node.expression.name.text)) {
        const arg=node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) verify(arg.text);
        if (arg && ts.isObjectLiteralExpression(arg)) for (const prop of arg.properties) if (ts.isPropertyAssignment(prop) && prop.name.getText(source)==='pathname') {
          function strings(expr) { if(ts.isStringLiteral(expr))verify(expr.text);else if(ts.isConditionalExpression(expr)){strings(expr.whenTrue);strings(expr.whenFalse);} }
          strings(prop.initializer);
        }
      }
      ts.forEachChild(node,visit);
    }
    visit(source);
  }
  checks.push(`${seen.size} literal navigation destinations throughout the app resolve to existing screens`);
  assert.deepEqual(filterRows(rows, { ...EMPTY_QUERY, status: 'overdue' }, 'all').map(r => r.status), ['overdue','bad_debt']);
  assert(contractStatusClause('overdue').includes("IN ('overdue','bad_debt')"));
  assert.equal(contractOverdueCount(new Map([['overdue',2],['bad_debt',1]])),3);
  checks.push('Web/app overdue predicate and count include bad debt without completed contracts');
  for (const status of issuedContractStatuses) {
    const label = contextualStatusLabel('contracts',status);
    assert(label && label !== status && !label.includes('_'), status);
  }
  checks.push('Every issued-contract status has a Vietnamese display label, retaining its API code');
  const batteryFile = fs.readFileSync('mobile/src/components/battery-form.tsx','utf8');
  const compiled = ts.transpileModule(batteryFile,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const batteryModule = {exports:{}};
  new Function('require','module','exports',compiled+'\nmodule.exports.initialForTest=blank;')(name=>name==='../../../shared/mobile-battery'?load(path.resolve('shared/mobile-battery')):{},batteryModule,batteryModule.exports);
  const initial = batteryModule.exports.initialForTest(23,'Logged in actor',{staff_name:'Employee from source contract'});
  assert.equal(initial.staff_name,'Logged in actor'); assert.equal(initial.store_id,23);
  checks.push('A new battery contract uses the logged-in signer even when copied from a vehicle contract signed by another employee');
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  const reads = new Map(), cleanups = [];
  try {
    for (const [key,active] of [
      [['catalogue',7,23,true,'contracts'],true],
      [['catalogue','status-counts','contracts',7],true],
      [['catalogue',7,23,true,'customers'],true],
      [['catalogue',7,23,true,'vehicles'],false],
      [['contract-edit',7,101],true], [['record-media','gallery',7,101],true],
    ]) {
      const hash = JSON.stringify(key), options = { queryKey:key, queryFn: async () => { reads.set(hash,(reads.get(hash)||0)+1); return { stable:true }; } };
      await client.fetchQuery(options);
      if (active) cleanups.push(new QueryObserver(client,options).subscribe(() => {}));
    }
    await refreshTabLookups(client,'contracts');
    for (const [key,count] of reads) assert.equal(count, key.includes('contracts') ? 2 : 1, key);
    await refreshTabLookups(client,'vehicles');
    assert(client.getQueryState(['catalogue',7,23,true,'vehicles']).isInvalidated);
    assert.deepEqual(client.getQueryData(['catalogue',7,23,true,'contracts']),{stable:true});
    checks.push('A fresh mounted destination refreshes list/counters in the background; inactive tabs become stale; other tabs, media and edit preparations remain untouched');
  } finally { cleanups.forEach(fn=>fn()); client.clear(); }
  console.log(JSON.stringify({passed:checks.length,checks,operationalWrites:0},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
