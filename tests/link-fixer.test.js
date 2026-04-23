// tests/link-fixer.test.js
const { fixLinks } = require('../scripts/fix-links-lib.js');

const mockIndex = [
  { id: "01-Foundations__TCP", title: "TCP Deep Dive", phase: 1, module: 1, is_moc: false },
  { id: "02-Dist__CAP", title: "CAP Theorem", phase: 2, module: 8, is_moc: false },
  { id: "Module_Module_02_MOC", title: "Module 02: API Design", phase: 1, module: 2, is_moc: true },
  { id: "Phase_0_MOC", title: "Phase 0: Design Thinking", phase: 0, module: 0, is_moc: true }
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

function testMocResolution() {
  console.log("Running testMocResolution...");
  const content = "See [[_Module 02 MOC]].";
  const expected = "See [[Module_Module_02_MOC]].";
  const result = fixLinks(content, mockIndex);
  if (result === expected) {
    console.log("✅ testMocResolution passed");
  } else {
    console.error(`❌ testMocResolution failed\nExpected: ${expected}\nGot:      ${result}`);
    process.exit(1);
  }
}

testResolution();
testPipedResolution();
testMocResolution();
