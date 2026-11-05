// Synthetic, clearly marked receipt image for native codec/picker acceptance.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const output=path.resolve('.backups/mobile-bill-qa.png');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2400">
<rect width="3600" height="2400" fill="white"/><rect width="3600" height="300" fill="#bc1f2d"/>
<g font-family="Arial,sans-serif" fill="#17212b"><text x="160" y="200" font-size="145" fill="white">SYNTHETIC BILL - QA ONLY</text>
<text x="180" y="580" font-size="125">HIMOTO - HD-QA-4001</text><text x="180" y="850" font-size="110">RENEWAL VERSION: 2</text>
<text x="180" y="1120" font-size="110">AMOUNT: 1,000 VND (FIXTURE)</text><text x="180" y="1390" font-size="110">DATE: 2026-11-01 08:00</text>
<text x="180" y="1660" font-size="110">ACCOUNT: CASH QA</text><text x="180" y="2010" font-size="90">NOT A REAL PAYMENT OR BANK RECEIPT</text></g>
<path d="M150 2160h3300" stroke="#17212b" stroke-width="6"/><text x="180" y="2320" font-family="Arial,sans-serif" font-size="85" fill="#bc1f2d">Original: 3600 x 2400 - verify native downsampling</text></svg>`;
fs.mkdirSync(path.dirname(output),{recursive:true});
sharp(Buffer.from(svg)).png().toFile(output).then(info=>console.log(JSON.stringify({path:output,width:info.width,height:info.height,fixtureOnly:true}))).catch(error=>{console.error(error);process.exitCode=1;});
