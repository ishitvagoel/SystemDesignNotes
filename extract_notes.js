const fs = require('fs');
const index = JSON.parse(fs.readFileSync('data/vault-index.json', 'utf8'));
const content = JSON.parse(fs.readFileSync('data/vault-content.json', 'utf8'));

const nonMocNotes = index.filter(n => !n.is_moc && n.title.length > 0);
// Pick three diverse notes
const notesToPick = [
  nonMocNotes.find(n => n.title.includes('Vector Search')),
  nonMocNotes.find(n => n.title.includes('Event-Driven Architecture')),
  nonMocNotes.find(n => n.title.includes('Authentication'))
].filter(Boolean);

notesToPick.forEach(note => {
  console.log('--- TITLE: ' + note.title + ' ---');
  console.log(content[note.id].substring(0, 1500) + '...\n\n[CONTENT TRUNCATED FOR ANALYSIS]\n\n');
});
