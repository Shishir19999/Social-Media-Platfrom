// Writes the ES module copy of lib/rules.js used by the Frontend (the file differs only in its export statement).
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../lib/rules.js'), 'utf8');
const names = src.match(/module\.exports = \{([\s\S]*?)\};/)[1].split(',').map((s) => s.trim()).filter(Boolean);
const esm = src.replace(/module\.exports = \{[\s\S]*?\};\s*$/, `export {\n  ${names.join(', ')},\n};\n`);
fs.writeFileSync(path.join(__dirname, '../../Frontend/src/lib/rules.js'), esm);
console.log('Frontend/src/lib/rules.js updated');
