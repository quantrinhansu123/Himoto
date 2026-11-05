const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { load } = require('./lib/load-typescript.cjs');
const mobileRoot = path.resolve(__dirname, '../mobile/src');
let scheme = 'light';
const themeModule = { exports: {} };
const source = ts.transpileModule(fs.readFileSync(path.join(mobileRoot, 'theme.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('require', 'module', 'exports', source)(name => {
  assert.equal(name, 'react-native'); return { useColorScheme: () => scheme };
}, themeModule, themeModule.exports);
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
const checks = [];
for (scheme of ['light', 'dark']) {
  const palette = themeModule.exports.useTheme();
  for (const foreground of ['text', 'muted']) for (const background of ['background', 'surface']) {
    assert(contrast(palette[foreground], palette[background]) >= 4.5, `${scheme} ${foreground}/${background} must meet 4.5:1`);
  }
  for (const [foreground, background] of [['primaryText', 'primary'], ['primary', 'tint'], ['success', 'successBackground'], ['danger', 'dangerBackground'], ['warning', 'warningBackground']]) {
    assert(contrast(palette[foreground], palette[background]) >= 4.5, `${scheme} ${foreground}/${background} must meet 4.5:1`);
  }
  for (const background of ['background', 'surface']) assert(contrast(palette.controlBorder, palette[background]) >= 3, `${scheme} input/control boundaries must meet 3:1`);
  checks.push(`${scheme}: normal text, secondary text, button/status labels and control boundaries meet their contrast thresholds`);
}
const catalogue = load(path.join(mobileRoot, 'lib/catalogue-config'));
assert.equal(catalogue.initialCatalogueStatus('vehicles', 'ready'), 'ready');
assert.equal(catalogue.initialCatalogueStatus('contracts', 'overdue'), 'overdue');
for (const value of ['unknown', 'ready&store=999', ['ready'], undefined]) assert.equal(catalogue.initialCatalogueStatus('contracts', value), '');
assert.equal(catalogue.contextualStatusLabel('contracts', 'pending'), 'Chờ giao xe');
assert.equal(catalogue.contextualStatusLabel('customers', 'draft'), 'Chưa hoàn tất');
assert(catalogue.catalogueConfig.contracts.allStatuses.includes('cancel_pending_settlement'));
checks.push('Shortcut presets reject malformed/unknown values and context-specific statuses retain their business meaning');
console.log(JSON.stringify({ passed: checks.length, checks, nativeScreenReaderCertified: false }, null, 2));
