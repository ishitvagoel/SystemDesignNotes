# Wiki-Link Integrity Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all broken wiki-links in the MOC files and notes by resolving them to valid Note IDs from `vault-index.json`.

**Architecture:** A Node.js script `scripts/fix-links.js` will read the vault index, scan Markdown files for `[[label]]` or `[[label|display]]` syntax, and replace the label with the matching `id` if a match is found by title. TDD will be used to verify the resolution logic.

**Tech Stack:** Node.js, Regular Expressions.

---

### Task 1: Initialize TDD Harness for Link Fixer

**Files:**
- Create: `tests/link-fixer.test.js`
- Create: `scripts/fix-links-lib.js`

- [x] **Step 1: Write the failing test**
Create a test file that imports the (yet-to-be-written) link fixer and asserts that it can resolve a title to an ID.

```javascript
// tests/link-fixer.test.js
const { fixLinks } = require('../scripts/fix-links-lib.js');

const mockIndex = [
  { id: "01-Foundations__TCP", title: "TCP Deep Dive" },
  { id: "02-Dist__CAP", title: "CAP Theorem" }
];

function testResolution() {
  console.log("Running testResolution...");
  const content = "Read more in [[TCP Deep Dive]].";
  const expected = "Read more in [[01-Foundations__TCP]].";
  const result = fixLinks(content, mockIndex);
  
  if (result === expected) {
    console.log("✅ testResolution passed");
  } else {
    console.error(`❌ testResolution failed\nExpected: ${expected}\nGot:      ${result}`);
    process.exit(1);
  }
}

testResolution();
```

- [x] **Step 2: Run test to verify it fails**
Run: `node tests/link-fixer.test.js`
Expected: FAIL (Module not found or function not defined)

- [x] **Step 3: Create skeleton library**
Create `scripts/fix-links-lib.js`.

```javascript
// scripts/fix-links-lib.js
function fixLinks(content, vaultIndex) {
  // Skeleton: return unchanged
  return content;
}
module.exports = { fixLinks };
```

- [x] **Step 4: Run test to verify it fails correctly**
Run: `node tests/link-fixer.test.js`
Expected: FAIL (Output matches input, but expected ID)

- [x] **Step 5: Commit**
```bash
git add tests/link-fixer.test.js scripts/fix-links-lib.js
git commit -m "test: add failing test for link resolution"
```

### Task 2: Implement Link Resolution Logic (TDD)

**Files:**
- Modify: `scripts/fix-links-lib.js`
- Modify: `tests/link-fixer.test.js`

- [ ] **Step 1: Implement the resolution logic**
Update `scripts/fix-links-lib.js` to match titles to IDs.

```javascript
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
```

- [ ] **Step 2: Run test to verify it passes**
Run: `node tests/link-fixer.test.js`
Expected: PASS

- [ ] **Step 3: Add test case for piped links**
Update `tests/link-fixer.test.js` to handle `[[Title|Display]]`.

```javascript
// Add to tests/link-fixer.test.js
function testPipedResolution() {
  console.log("Running testPipedResolution...");
  const content = "Check [[TCP Deep Dive|this note]].";
  const expected = "Check [[01-Foundations__TCP|this note]].";
  const result = fixLinks(content, mockIndex);
  if (result === expected) {
    console.log("✅ testPipedResolution passed");
  } else {
    console.error(`❌ testPipedResolution failed\nExpected: ${expected}\nGot:      ${result}`);
    process.exit(1);
  }
}
testPipedResolution();
```

- [ ] **Step 4: Run tests to verify all pass**
Run: `node tests/link-fixer.test.js`
Expected: PASS for both tests

- [ ] **Step 5: Commit**
```bash
git add scripts/fix-links-lib.js tests/link-fixer.test.js
git commit -m "feat: implement wiki-link title-to-id resolution"
```

### Task 3: Implement Batch Fix Script

**Files:**
- Create: `scripts/fix-links.js`

- [ ] **Step 1: Write the batch processing script**
This script will use the library to fix all files in `data/notes/`.

```javascript
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
```

- [ ] **Step 2: Run the batch fix**
Run: `node scripts/fix-links.js`

- [ ] **Step 3: Verify with rebuild-data script**
Run: `node scripts/rebuild-data.js`
Expected: Broken link count should be significantly lower or 0.

- [ ] **Step 4: Commit**
```bash
git add scripts/fix-links.js
git commit -m "chore: run link fixer on all notes"
```

### Task 4: Update TODO and Status

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Update TODO.md**
Mark the task as complete and add a note about the link fixer script.

- [ ] **Step 2: Commit**
```bash
git add TODO.md
git commit -m "docs: mark broken link fix as complete"
```
