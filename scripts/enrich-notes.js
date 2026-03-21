const fs = require('fs');
const path = require('path');

// Configuration
const API_KEY = process.env.GEMINI_API_KEY; // Ensure you set this before running
const NOTES_DIR = path.join(__dirname, '../data/notes');
const DELAY_MS = 3000; // Rate limit protection (3s between requests)

if (!API_KEY) {
  console.error("❌ ERROR: GEMINI_API_KEY environment variable is not set.");
  console.error("Usage: GEMINI_API_KEY='your_key' node scripts/enrich-notes.js");
  process.exit(1);
}

async function generateEnrichment(noteTitle, noteContent) {
  const prompt = `You are a Senior Principal Engineer. Analyze the following system design note titled "${noteTitle}".
Generate exactly three markdown sections to append to the note to elevate it to a "Senior Engineer" standard:

1. "## Architecture Diagram"
Provide a valid Mermaid.js diagram (sequence or flowchart) enclosed in \`\`\`mermaid ... \`\`\` backticks. Use clear labels and standard Mermaid syntax. Do not include complex CSS styling or classDef statements inside the mermaid code.
2. "## Back-of-the-Envelope Heuristics"
Provide concrete, realistic numbers, latencies, or capacities related to this topic. Use a bulleted list.
3. "## Real-World Case Studies"
Briefly describe how 1-2 tech giants (e.g., Netflix, Uber, AWS, Meta) implement or use this pattern.

IMPORTANT: Do not output anything outside of these three sections. Do not include introductory or concluding remarks. Just output the three markdown headers and their contents.

Here is the note:
---
${noteContent}
---`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const files = fs.readdirSync(NOTES_DIR).filter(f => f.endsWith('.md') && !f.startsWith('00-Meta'));
  console.log(`Found ${files.length} notes to process.`);

  let enrichedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const filePath = path.join(NOTES_DIR, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Skip if already enriched (check for the headers)
    if (content.includes('## Architecture Diagram') && content.includes('## Back-of-the-Envelope Heuristics')) {
      console.log(`⏩ Skipping ${file} (already enriched)`);
      skippedCount++;
      continue;
    }

    console.log(`⏳ Processing ${file}...`);
    try {
      const noteTitle = file.replace('.md', '').replace(/_/g, ' ');
      
      // Call Gemini API
      const enrichedText = await generateEnrichment(noteTitle, content);
      
      // We want to insert the enriched text just above "## Connections"
      const connectionsIdx = content.indexOf('## Connections');
      if (connectionsIdx !== -1) {
        content = content.slice(0, connectionsIdx) + enrichedText + '\n\n' + content.slice(connectionsIdx);
      } else {
        // If no connections header, just append to the bottom
        content += '\n\n' + enrichedText;
      }

      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Enriched ${file}`);
      enrichedCount++;

      // Rate limit protection
      await sleep(DELAY_MS);
    } catch (error) {
      console.error(`❌ Failed to process ${file}:`, error.message);
    }
  }

  console.log('---');
  console.log(`🎉 Enrichment complete! Enriched: ${enrichedCount}, Skipped: ${skippedCount}`);
}

main().catch(console.error);
