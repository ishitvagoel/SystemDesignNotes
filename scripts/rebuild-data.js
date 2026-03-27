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

/**
 * Recursively find all markdown files
 */
function getFiles(dir, allFiles = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, allFiles);
    } else if (file.endsWith('.md')) {
      allFiles.push(name);
    }
  });
  return allFiles;
}

async function rebuild() {
  console.log('🚀 Rebuilding data indexes from Markdown notes...');

  const fullPaths = getFiles(NOTES_DIR);
  let vaultIndex = [];
  
  fullPaths.forEach(fullPath => {
    const rel = path.relative(NOTES_DIR, fullPath);
    const filename = path.basename(fullPath);
    // ID should be the filename without .md for flat lookup
    const id = filename.replace('.md', '');
    
    // Heuristic for folder/subfolder/title
    const parts = rel.split('/');
    let folder = null;
    let subfolder = null;
    let title = filename.replace('.md', '').replace(/_/g, ' ');
    
    // Try to extract title from content if first line is # Title
    const content = fs.readFileSync(fullPath, 'utf8');
    const titleMatch = content.match(/^#\s+(.*)/m);
    if (titleMatch) title = titleMatch[1].trim();

    if (parts.length === 3) {
      folder = parts[0];
      subfolder = parts[1];
    } else if (parts.length === 2) {
      folder = parts[0];
    } else {
      // Root file, check if it's Meta
      if (id.startsWith('00-Meta')) folder = '00-Meta';
    }

    vaultIndex.push({
      id,
      title,
      folder,
      subfolder,
      filename,
      is_moc: filename.toLowerCase().includes('moc'),
      phase: folder ? parseInt(folder.match(/\d+/)) || 0 : 0,
      module: subfolder ? parseInt(subfolder.match(/\d+/)) || 0 : 0
    });
  });

  fs.writeFileSync(INDEX_FILE, JSON.stringify(vaultIndex, null, 2), 'utf8');

  const searchIndex = {};
  const graphEdges = [];
  const studyPrompts = [];
  
  // Title lookup for graph edges
  const notesByTitle = {};
  vaultIndex.forEach(note => {
    notesByTitle[normalize(note.title)] = note.id;
    if (note.filename) {
      notesByTitle[normalize(note.filename.replace('.md', ''))] = note.id;
    }
  });

  let processed = 0;

  fullPaths.forEach(fullPath => {
    const filename = path.basename(fullPath);
    const id = filename.replace('.md', '');
    const content = fs.readFileSync(fullPath, 'utf8');
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
            // Infer difficulty from question keywords
            const lower = cleaned.toLowerCase();
            let difficulty = 'medium';
            if (/\bdesign\b|\bcompare\b|\btrade.off\b|\bcalculate\b|\bestimate\b|\barchitect\b/.test(lower)) {
              difficulty = 'hard';
            } else if (/\bdefine\b|\bwhat is\b|\bname\b|\blist\b/.test(lower)) {
              difficulty = 'easy';
            }
            studyPrompts.push({
              text: cleaned,
              noteId: id,
              noteTitle: noteMeta.title,
              folder: noteMeta.folder,
              mentalSnippet: mentalSnippet,
              difficulty
            });
          }
        }
      }
    }

    // 4. Validation: Mermaid diagram presence (non-MOC notes only)
    if (noteMeta && !noteMeta.is_moc) {
      if (!content.includes('```mermaid')) {
        console.warn(`⚠️  MISSING MERMAID: ${path.relative(NOTES_DIR, fullPath)} has no mermaid diagram block`);
      }
    }

    // 5. Validation: Required section headers (non-MOC notes only)
    if (noteMeta && !noteMeta.is_moc) {
      const requiredSections = ['## Why This Exists', '## Reflection Prompts'];
      for (const section of requiredSections) {
        if (!content.includes(section)) {
          console.warn(`⚠️  MISSING SECTION "${section}": ${path.relative(NOTES_DIR, fullPath)}`);
        }
      }
    }

    processed++;
  });

  // 6. Validation: Broken wiki-links
  let brokenLinkCount = 0;
  fullPaths.forEach(fullPath => {
    const content = fs.readFileSync(fullPath, 'utf8');
    const id = path.basename(fullPath).replace('.md', '');
    const re = /\[\[([^\]]+)\]\]/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      const targetName = m[1].split('|')[0].trim();
      const targetId = notesByTitle[normalize(targetName)];
      if (!targetId) {
        console.warn(`⚠️  BROKEN LINK: [[${targetName}]] in ${path.relative(NOTES_DIR, fullPath)}`);
        brokenLinkCount++;
      }
    }
  });
  if (brokenLinkCount > 0) {
    console.warn(`\n⚠️  Total broken wiki-links found: ${brokenLinkCount}`);
  }

  fs.writeFileSync(SEARCH_INDEX_FILE, JSON.stringify(searchIndex), 'utf8');
  fs.writeFileSync(GRAPH_EDGES_FILE, JSON.stringify(graphEdges), 'utf8');
  fs.writeFileSync(STUDY_PROMPTS_FILE, JSON.stringify(studyPrompts), 'utf8');

  // Generate sitemap.xml
  const SITE_URL = 'https://ishitvagoel.github.io/SystemDesignNotes';
  const today = new Date().toISOString().split('T')[0];
  const sitemapEntries = vaultIndex.map(note =>
    `  <url>\n    <loc>${SITE_URL}/#note/${note.id}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`
  );
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${SITE_URL}/</loc>\n    <lastmod>${today}</lastmod>\n    <priority>1.0</priority>\n  </url>\n${sitemapEntries.join('\n')}\n</urlset>\n`;
  const SITEMAP_FILE = path.join(__dirname, '../sitemap.xml');
  fs.writeFileSync(SITEMAP_FILE, sitemap, 'utf8');

  console.log(`✅ Done! Processed ${processed} notes.`);
  console.log(`Generated ${INDEX_FILE}, ${SEARCH_INDEX_FILE}, ${GRAPH_EDGES_FILE}, ${STUDY_PROMPTS_FILE}, and ${SITEMAP_FILE}.`);
}

rebuild().catch(console.error);
