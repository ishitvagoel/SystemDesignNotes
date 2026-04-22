// scripts/fix-links.js
const fs = require('fs');
const path = require('path');
const { fixLinks } = require('./fix-links-lib.js');

const NOTES_DIR = path.join(__dirname, '../data/notes');
const INDEX_FILE = path.join(__dirname, '../data/vault-index.json');

if (!fs.existsSync(INDEX_FILE)) {
  console.error('Vault index not found. Run rebuild-data.js first.');
  process.exit(1);
}

const vaultIndex = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));

function walk(dir) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (file.endsWith('.md')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const fixedContent = fixLinks(content, vaultIndex);
      if (content !== fixedContent) {
        fs.writeFileSync(fullPath, fixedContent, 'utf8');
        console.log(`Fixed: ${path.relative(NOTES_DIR, fullPath)}`);
      }
    }
  });
}

console.log('🚀 Fixing links in notes...');
walk(NOTES_DIR);
console.log('✅ Link fixing complete.');
