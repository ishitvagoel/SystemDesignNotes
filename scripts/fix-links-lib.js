// scripts/fix-links-lib.js
function fixLinks(content, vaultIndex) {
  const normalize = s => s.replace(/[,;:—–]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const notesByTitle = {};
  const mocsByModule = {};
  const mocsByPhase = {};

  // Manual aliases for common typos or renamed notes
  const aliases = {
    "monitoring and alerting": "03-Phase-3-Architecture-Operations__Module-17-Observability-Deployment__Observability_and_Alerting",
    "authentication and identity": "03-Phase-3-Architecture-Operations__Module-15-Security__Authentication_and_Authorization",
    "multi-region e-commerce": "06-Phase-6-Capstones__Capstone_—_Multi-Region_E-Commerce"
  };

  vaultIndex.forEach(n => {
    notesByTitle[normalize(n.title)] = n.id;
    notesByTitle[normalize(n.id)] = n.id;
    if (n.is_moc) {
      if (n.module !== null) mocsByModule[n.module] = n.id;
      if (n.phase !== null) mocsByPhase[n.phase] = n.id;
    }
  });

  return content.replace(/\[\[([^\]]+)\]\]/g, (match, p1) => {
    const parts = p1.split('|');
    const label = parts[0].trim();
    const display = parts[1];
    
    const normalizedLabel = normalize(label);

    // Check aliases first
    if (aliases[normalizedLabel]) {
      return `[[${aliases[normalizedLabel]}${display ? '|' + display : ''}]]`;
    }

    // Check for _Module XX MOC
    const moduleMatch = label.match(/^_(Module|M)\s*(\d+)\s*MOC$/i);
    if (moduleMatch) {
      const moduleNum = parseInt(moduleMatch[2]);
      if (mocsByModule[moduleNum]) {
        return `[[${mocsByModule[moduleNum]}${display ? '|' + display : ''}]]`;
      }
    }

    // Check for _Phase X MOC
    const phaseMatch = label.match(/^_(Phase|P)\s*(\d+)\s*MOC$/i);
    if (phaseMatch) {
      const phaseNum = parseInt(phaseMatch[2]);
      if (mocsByPhase[phaseNum]) {
        return `[[${mocsByPhase[phaseNum]}${display ? '|' + display : ''}]]`;
      }
    }

    const targetId = notesByTitle[normalizedLabel];
    if (targetId) {
      return `[[${targetId}${display ? '|' + display : ''}]]`;
    }
    return match;
  });
}
module.exports = { fixLinks };
