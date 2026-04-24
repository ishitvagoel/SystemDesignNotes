
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { VirtualConsole } = require('jsdom');

async function runHarness() {
  console.log('Running Canvas Test Harness in JSDOM (Injection mode)...');
  
  const html = fs.readFileSync(path.resolve(__dirname, 'canvas_test_harness.html'), 'utf8');
  const virtualConsole = new VirtualConsole();
  const uncaughtErrors = [];
  virtualConsole.sendTo(console);
  virtualConsole.on('jsdomError', (error) => {
    uncaughtErrors.push(error);
  });
  const dom = new JSDOM(html, {
    url: "http://localhost/tests/canvas_test_harness.html",
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole
  });

  // Mock SVG getBoundingClientRect
  dom.window.SVGSVGElement.prototype.getBoundingClientRect = function() {
    return { width: 800, height: 600, top: 0, left: 0, bottom: 600, right: 800 };
  };
  dom.window.Element.prototype.getBoundingClientRect = function() {
    return { width: 800, height: 600, top: 0, left: 0, bottom: 600, right: 800 };
  };
  Object.defineProperty(dom.window.SVGElement.prototype, 'transform', {
    configurable: true,
    get() {
      return {
        baseVal: {
          consolidate() {
            return null;
          }
        }
      };
    }
  });
  dom.window.addEventListener('error', (event) => {
    uncaughtErrors.push(event.error || new Error(event.message));
  });
  dom.window.addEventListener('unhandledrejection', (event) => {
    uncaughtErrors.push(event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
  });

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
  const d3Code = fs.readFileSync(path.resolve(__dirname, '../vendor/d3.min.js'), 'utf8');
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

  if (uncaughtErrors.length > 0) {
    uncaughtErrors.forEach((error) => console.error('❌ Uncaught runtime error:', error));
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
    dom.window.close();
    process.exit(1);
  } else {
    console.log('\nAll tests passed!');
    dom.window.close();
  }
}

runHarness().catch(err => {
  console.error(err);
  process.exit(1);
});
