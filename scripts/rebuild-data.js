const fs = require('fs');
const path = require('path');

const NOTES_DIR = path.join(__dirname, '../data/notes');
const INDEX_FILE = path.join(__dirname, '../data/vault-index.json');
const SEARCH_INDEX_FILE = path.join(__dirname, '../data/search-index.json');
const GRAPH_EDGES_FILE = path.join(__dirname, '../data/graph-edges.json');
const STUDY_PROMPTS_FILE = path.join(__dirname, '../data/study-prompts.json');

function normalize(s) {
  return s.replace(/[,;:—–]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function rebuild() {
  console.log('🚀 Rebuilding data indexes from Markdown notes...');

  const files = fs.readdirSync(NOTES_DIR).filter(f => f.endsWith('.md'));
  const vaultIndex = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  
  const searchIndex = {};
  const graphEdges = [];
  const studyPrompts = [];
  
  // Title lookup for graph edges
  const notesByTitle = {};
  vaultIndex.forEach(note => {
    notesByTitle[normalize(note.title)] = note.id;
    notesByTitle[normalize(note.filename.replace('.md', ''))] = note.id;
  });

  let processed = 0;

  files.forEach(file => {
    const id = file.replace('.md', '');
    const content = fs.readFileSync(path.join(NOTES_DIR, file), 'utf8');
    const noteMeta = vaultIndex.find(n => n.id === id);

    // 1. Search Index
    const cleanText = content
      .replace(/[#*`\[\]\(\)>_]/g, '') // remove markdown symbols
      .replace(/\s+/g, ' ')            // collapse whitespace
      .trim()
      .toLowerCase();
    searchIndex[id] = cleanText;

    // 2. Graph Edges
    const re = /\[\[([^\]]+)\]\]/g;
    let m;
    const linksSet = new Set();
    while ((m = re.exec(content)) !== null) {
      let targetName = m[1].split('|')[0].trim();
      const targetId = notesByTitle[normalize(targetName)];
      
      if (targetId && targetId !== id) {
        const key = [id, targetId].sort().join('|');
        if (!linksSet.has(key)) {
          linksSet.add(key);
          graphEdges.push({ source: id, target: targetId });
        }
      }
    }

    // 3. Study Prompts
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
  });

  fs.writeFileSync(SEARCH_INDEX_FILE, JSON.stringify(searchIndex), 'utf8');
  fs.writeFileSync(GRAPH_EDGES_FILE, JSON.stringify(graphEdges), 'utf8');
  fs.writeFileSync(STUDY_PROMPTS_FILE, JSON.stringify(studyPrompts), 'utf8');

  console.log(`✅ Done! Processed ${processed} notes.`);
  console.log(`Generated ${SEARCH_INDEX_FILE}, ${GRAPH_EDGES_FILE}, and ${STUDY_PROMPTS_FILE}.`);
}

rebuild().catch(console.error);
