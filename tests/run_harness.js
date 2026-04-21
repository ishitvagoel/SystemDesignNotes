
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

async function runHarness() {
  console.log('Running Canvas Test Harness in JSDOM (Injection mode)...');
  
  const html = fs.readFileSync(path.resolve(__dirname, 'canvas_test_harness.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: "http://localhost/tests/canvas_test_harness.html",
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true
  });

  // Mock SVG getBoundingClientRect
  dom.window.SVGSVGElement.prototype.getBoundingClientRect = function() {
    return { width: 800, height: 600, top: 0, left: 0, bottom: 600, right: 800 };
  };
  dom.window.Element.prototype.getBoundingClientRect = function() {
    return { width: 800, height: 600, top: 0, left: 0, bottom: 600, right: 800 };
  };

  // Mock fetch
  dom.window.fetch = (url) => {
    console.log(`Mock fetch: ${url}`);
    let data = {};
    if (url.includes('evolution-chronicles.json')) {
      data = { systems: [] };
    } else if (url.includes('quests.json')) {
      data = [];
    } else if (url.includes('scenarios.json')) {
      data = {};
    }
    return Promise.resolve({
      json: () => Promise.resolve(data),
      ok: true
    });
  };

  // Inject D3
  const d3Code = fs.readFileSync(path.resolve(__dirname, '../node_modules/d3/dist/d3.min.js'), 'utf8');
  const d3Script = dom.window.document.createElement('script');
  d3Script.textContent = d3Code;
  dom.window.document.head.appendChild(d3Script);

  // Inject Canvas Code
  const canvasCode = fs.readFileSync(path.resolve(__dirname, '../js/canvas.js'), 'utf8');
  const canvasScript = dom.window.document.createElement('script');
  canvasScript.textContent = canvasCode;
  dom.window.document.head.appendChild(canvasScript);

  // Wait for tests to complete
  await new Promise(resolve => setTimeout(resolve, 3000));

  const results = dom.window.testResults;
  if (!results) {
    console.error('❌ No test results found in window.testResults');
    // Check for errors in the console
    process.exit(1);
  }

  let failed = 0;
  results.forEach(r => {
    if (r.success) {
      console.log('✅ ' + r.message);
    } else {
      console.error('❌ ' + r.message);
      failed++;
    }
  });

  if (failed > 0) {
    console.error(`\nFound ${failed} failures.`);
    process.exit(1);
  } else {
    console.log('\nAll tests passed!');
  }
}

runHarness().catch(err => {
  console.error(err);
  process.exit(1);
});
