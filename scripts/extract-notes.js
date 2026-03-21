const fs = require('fs');
const path = require('path');

const indexData = JSON.parse(fs.readFileSync('data/vault-index.json', 'utf8'));
const contentData = JSON.parse(fs.readFileSync('data/vault-content.json', 'utf8'));

const notesDir = path.join(__dirname, '../data/notes');
if (!fs.existsSync(notesDir)) {
  fs.mkdirSync(notesDir, { recursive: true });
}

const searchIndex = {};
const graphEdges = [];
const notesByTitle = {};
const studyPrompts = [];

// Build title lookup for graph edges
indexData.forEach(note => {
  const normalize = s => s.replace(/[,;:—–]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  notesByTitle[normalize(note.title)] = note;
  notesByTitle[normalize(note.filename.replace('.md',''))] = note;
});

let processed = 0;

for (const [id, content] of Object.entries(contentData)) {
  // 1. Write individual MD file
  fs.writeFileSync(path.join(notesDir, `${id}.md`), content, 'utf8');

  // 2. Build search index (strip markdown formatting for smaller payload)
  const cleanText = content
    .replace(/[#*`\[\]\(\)>_]/g, '') // remove markdown symbols
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim()
    .toLowerCase();
  searchIndex[id] = cleanText;

  // 3. Build graph edges
  const re = /\[\[([^\]]+)\]\]/g;
  let m;
  const linksSet = new Set();
  
  while ((m = re.exec(content)) !== null) {
    let target = m[1].split('|')[0].trim();
    const normalize = s => s.replace(/[,;:—–]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const targetNote = notesByTitle[normalize(target)];
    
    if (targetNote && targetNote.id !== id) {
      const key = [id, targetNote.id].sort().join('|');
      if (!linksSet.has(key)) {
        linksSet.add(key);
        graphEdges.push({ source: id, target: targetNote.id });
      }
    }
  }

  // 4. Extract Study Prompts and Context
  const noteMeta = indexData.find(n => n.id === id);
  if (noteMeta && !noteMeta.is_moc) {
    const promptMatch = content.match(/## Reflection Prompts\s*\n([\s\S]*?)(?=\n## |$)/);
    const mentalMatch = content.match(/## Mental Model\s*\n([\s\S]*?)(?=\n## )/);
    
    if (promptMatch) {
      const mentalSnippet = mentalMatch ? mentalMatch[1].trim().split('\n').slice(0, 6).join('\n') : '';
      const items = promptMatch[1].trim().split(/\n(?=\d+\.\s)/).filter(s => s.trim());
      
      for (const item of items) {
        const cleaned = item.replace(/^\d+\.\s*/, '').trim();
        if (cleaned.length > 20) {
          studyPrompts.push({
            text: cleaned,
            noteId: id,
            noteTitle: noteMeta.title,
            folder: noteMeta.folder,
            mentalSnippet: mentalSnippet
          });
        }
      }
    }
  }
  
  processed++;
}

fs.writeFileSync(path.join(__dirname, '../data/search-index.json'), JSON.stringify(searchIndex), 'utf8');
fs.writeFileSync(path.join(__dirname, '../data/graph-edges.json'), JSON.stringify(graphEdges), 'utf8');
fs.writeFileSync(path.join(__dirname, '../data/study-prompts.json'), JSON.stringify(studyPrompts), 'utf8');

console.log(`Extraction complete. Processed ${processed} notes.`);
console.log(`Generated data/search-index.json, data/graph-edges.json, and data/study-prompts.json.`);
