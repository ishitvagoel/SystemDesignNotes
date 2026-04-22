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

testResolution();
testPipedResolution();
