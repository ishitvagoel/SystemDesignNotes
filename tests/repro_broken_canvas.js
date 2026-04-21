
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Mock browser environment
const html = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf8');
const dom = new JSDOM(html, {
  url: "http://localhost/",
  runScripts: "dangerously",
  resources: "usable"
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.localStorage = {
  getItem: () => null,
  setItem: () => null,
  removeItem: () => null
};

// Mock D3
global.d3 = {
  select: () => ({
    append: () => ({
      attr: () => ({
        attr: () => ({
          append: () => ({
            attr: () => ({
              attr: () => ({
                attr: () => ({
                  attr: () => ({
                    attr: () => ({
                      attr: () => ({
                        append: () => ({
                          attr: () => ({})
                        })
                      })
                    })
                  })
                })
              })
            })
          })
        }),
        on: () => {}
      }),
      on: () => {},
      style: () => {}
    }),
    selectAll: () => ({
      data: () => ({
        join: () => ({})
      })
    }),
    on: () => {}
  }),
  zoom: () => ({
    scaleExtent: () => ({
      on: () => {}
    })
  })
};

// Mock mermaid and marked
global.mermaid = { initialize: () => {} };
global.marked = { setOptions: () => {}, Renderer: function() {} };

async function testCanvasInitialization() {
  console.log('Testing Canvas Initialization...');
  
  // Load canvas.js
  require('./js/canvas.js');
  
  if (typeof initCanvas !== 'function') {
    throw new Error('initCanvas is not defined globally');
  }
  
  try {
    initCanvas();
    console.log('✅ initCanvas executed successfully');
  } catch (e) {
    console.error('❌ initCanvas failed:', e);
    process.exit(1);
  }
  
  if (!playgroundA) {
    throw new Error('playgroundA was not initialized');
  }
  console.log('✅ playgroundA initialized');
  
  if (activePlayground !== playgroundA) {
    throw new Error('activePlayground not set to playgroundA');
  }
  console.log('✅ activePlayground set correctly');
}

testCanvasInitialization().catch(err => {
  console.error(err);
  process.exit(1);
});
