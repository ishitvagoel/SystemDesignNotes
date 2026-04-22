// scripts/fix-links-lib.js
function fixLinks(content, vaultIndex) {
  const normalize = s => s.replace(/[,;:—–]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const notesByTitle = {};
  vaultIndex.forEach(n => {
    notesByTitle[normalize(n.title)] = n.id;
    // Also index by ID just in case it's already an ID
    notesByTitle[normalize(n.id)] = n.id;
  });

  return content.replace(/\[\[([^\]]+)\]\]/g, (match, p1) => {
    const parts = p1.split('|');
    const label = parts[0].trim();
    const display = parts[1];
    
    const targetId = notesByTitle[normalize(label)];
    if (targetId) {
      return `[[${targetId}${display ? '|' + display : ''}]]`;
    }
    return match;
  });
}
module.exports = { fixLinks };
