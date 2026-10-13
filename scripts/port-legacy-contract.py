"""Port the existing Vue print template without rewriting its text or layout."""
import argparse
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
source = args.source.read_text(encoding='utf-8-sig')
legacy = root / 'src/components/contracts/legacy'
legacy.mkdir(parents=True, exist_ok=True)
(legacy / 'ContractPrintDocument.vue').write_text(source, encoding='utf-8')
template = source.split('<template>', 1)[1].split('</template>', 1)[0]
template = re.sub(r'<!--([\s\S]*?)-->', lambda m: '{/*' + m[1] + '*/}', template)
template = template.replace(':class="{ \'is-preview-mode\': doc.is_preview }"', '')
template = template.replace('class=', 'className=').replace(':href=', 'href=')
template = template.replace('href="doc.customer_source.url"', 'href={doc.customer_source.url}')
template = template.replace('colspan=', 'colSpan=')
template = re.sub(r'colSpan="(\d+)"', r'colSpan={\1}', template)
template = re.sub(r'{{\s*([\s\S]*?)\s*}}', r'{\1}', template)
template = re.sub(r'style="width: ([0-9]+(?:%|px));"', lambda m: 'style={{ width: "' + m[1] + '" }}', template)
conditions = [
    ('div', 'doc.is_preview'),
    ('a', 'doc.customer_source && doc.customer_source.url'),
    ('span', 'doc.lessor.authorization && doc.lessor.authorization.date'),
    ('span', 'doc.return_confirmation.additional_note'),
    ('div', 'doc.vehicles_count > 1'),
    ('span', 'v.driver_license_issued_on'),
]
for tag, condition in conditions:
    pattern = r'<' + tag + r' v-if="' + re.escape(condition) + r'"([^>]*)>'
    match = re.search(pattern, template)
    if not match:
        raise ValueError(f'Missing conditional: {condition}')
    # Locate the closing tag at the matching depth (the multi-vehicle page nests divs).
    depth, end = 1, match.end()
    for token in re.finditer(r'</?' + tag + r'(?:\s[^>]*|)>', template[match.end():]):
        depth += -1 if token[0].startswith('</') else 1
        if depth == 0:
            end = match.end() + token.end()
            break
    fragment = template[match.start():end]
    fragment = re.sub(r' v-if="[^"]*"', '', fragment, count=1)
    template = template[:match.start()] + '{Boolean(' + condition + ') && (' + fragment + ')}' + template[end:]
template = template.replace('<strong v-else>', '{!doc.customer_source?.url && <strong>', 1)
start = template.index('{!doc.customer_source?.url && <strong>')
end = template.index('</strong>', start) + len('</strong>')
template = template[:end] + '}' + template[end:]
template = template.replace('<tr v-for="(v, idx) in doc.vehicles" :key="idx"', '{doc.vehicles.map((v, idx) => <tr key={idx}')
start = template.index('{doc.vehicles.map((v, idx) =>')
end = template.index('</tr>', start) + len('</tr>')
template = template[:end] + ')}' + template[end:]
if re.search(r'v-if=|v-for=|v-else|:key=|:class=|{{ doc\.', template):
    raise ValueError('Unconverted Vue expression')
component = '''import { LegacyContractDocument } from '@/lib/management/contract-document';

// Mechanical port of the original Vue template. Its wording and layout are retained.
export function ContractPrintDocument({ doc }: { doc: LegacyContractDocument }) {
  const representativeNameA = doc.lessor.representative_name || doc.lessor.authorization.party_name || doc.signers.signer_a_name || '................................';
  const primaryVehicle = doc.primary_vehicle || doc.vehicles[0];
  return (''' + template + ''');
}
'''
(root / 'src/components/contracts/ContractPrintDocument.tsx').write_text(component, encoding='utf-8')
css = source.split('<style scoped>', 1)[1].split('</style>', 1)[0]
# Preserve the legacy styles, limiting their selectors to this document.
css = re.sub(r'(?m)^(\.[^\n{]+)(?=\s*\{)', lambda m: m[1] if m[1].startswith('.contract-print-wrapper') else '.contract-print-wrapper ' + m[1], css)
legacy_isolation = '\tbody * {\n\t\tvisibility: hidden !important;\n\t}\n\n\t.contract-print-wrapper,\n\t.contract-print-wrapper * {\n\t\tvisibility: visible !important;\n\t}\n'
assert legacy_isolation in css
css = css.replace('/* In ấn @media print */', '.himoto-print-root {\n\tdisplay: none;\n}\n\n/* In ấn @media print */').replace(legacy_isolation, '''\thtml.himoto-printing,
\thtml.himoto-printing body {
\t\tmargin: 0 !important;
\t\tpadding: 0 !important;
\t\theight: auto !important;
\t\tmin-height: 0 !important;
\t\toverflow: visible !important;
\t\tbackground: #fff !important;
\t}

\thtml.himoto-printing body > :not(.himoto-print-root),
\thtml.himoto-printing dialog {
\t\tdisplay: none !important;
\t}

\thtml.himoto-printing .himoto-print-root {
\t\tdisplay: block;
\t}
''')
css += '''
/* Utilities the legacy template received from Bootstrap, scoped to its document. */
.contract-print-wrapper .d-flex { display: flex; }
.contract-print-wrapper .justify-content-between { justify-content: space-between; }
.contract-print-wrapper .align-items-start { align-items: flex-start; }
.contract-print-wrapper .text-center { text-align: center; }
.contract-print-wrapper .text-left { text-align: left; }
.contract-print-wrapper .text-uppercase { text-transform: uppercase; }
.contract-print-wrapper .font-weight-bold { font-weight: 700; }
.contract-print-wrapper .font-italic { font-style: italic; }
.contract-print-wrapper .flex-shrink-0 { flex-shrink: 0; }
.contract-print-wrapper .small { font-size: 80%; }
.contract-print-wrapper .d-block { display: block; }
.contract-print-wrapper .w-100 { width: 100%; }
.contract-print-wrapper .text-danger { color: #dc3545; }
.contract-print-wrapper .bg-light { background: #f8f9fa; }
.contract-print-wrapper .mt-1 { margin-top: 4px; }
.contract-print-wrapper .mt-2 { margin-top: 8px; }
.contract-print-wrapper .mt-4 { margin-top: 24px; }
.contract-print-wrapper .mb-0 { margin-bottom: 0; }
.contract-print-wrapper .mb-3 { margin-bottom: 16px; }
.contract-print-wrapper .mr-2 { margin-right: 8px; }
.contract-print-wrapper .ml-1 { margin-left: 4px; }
.contract-print-wrapper .ml-2 { margin-left: 8px; }
.contract-print-wrapper .px-2 { padding-inline: 8px; }
.contract-print-wrapper .px-3 { padding-inline: 16px; }
.contract-print-wrapper .px-5 { padding-inline: 48px; }
.contract-print-wrapper .p-3 { padding: 16px; }
.contract-print-wrapper .table { width: 100%; border-collapse: collapse; }
.contract-print-wrapper .table th, .contract-print-wrapper .table td { border: 1px solid #dee2e6; padding: 4px; }
.contract-print-wrapper p { margin-top: 0; }
.contract-print-wrapper .text-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
'''
(root / 'src/styles/contract-print.css').write_text(css, encoding='utf-8')
print('Ported the complete legacy print template and styles.')
