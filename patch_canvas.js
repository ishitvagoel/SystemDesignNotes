const fs = require('fs');

let content = fs.readFileSync('js/canvas.js', 'utf8');

// 1. Add stateKey to constructor
content = content.replace(/constructor\(svgId\) \{/, "constructor(svgId, stateKey = 'system-design-canvas-state') {\n    this.stateKey = stateKey;");

// 2. Remove toolbar and scale logic from init()
content = content.replace(/\s*\/\/ Toolbar[\s\S]*?this\.initQuests\(\);\n    this\.initScenarios\(\);\n  \}/, `
    this.initQuests();
    this.initScenarios();
  }`);

// 3. Remove initPalette from init() because it's now global
content = content.replace(/\s*\/\/ Palette setup\s*this\.initPalette\(\);/, '');

// 4. Update saveState and loadState to use this.stateKey
content = content.replace(/localStorage\.setItem\('system-design-canvas-state'/g, "localStorage.setItem(this.stateKey");
content = content.replace(/localStorage\.getItem\('system-design-canvas-state'\)/g, "localStorage.getItem(this.stateKey)");

// 5. Update global click to set activePlayground
content = content.replace(/this\.svg\.on\('click', \(e\) => \{/, `this.svg.on('click', (e) => {
      activePlayground = this;`);
content = content.replace(/nodeMerge\.on\('click', \(e, d\) => \{/, `nodeMerge.on('click', (e, d) => {
      activePlayground = this;`);

// 6. Rewrite initPalette to add to activePlayground
content = content.replace(/addComponent\(c\.type, c\.label\)/g, "activePlayground.addComponent(c.type, c.label)");
content = content.replace(/this\.addComponent\(c\.type, c\.label\)/g, "activePlayground && activePlayground.addComponent(c.type, c.label)");

// 7. Update bottom script for Split-View
const globalScript = `
let playgroundA = null;
let playgroundB = null;
let activePlayground = null;
let isCompareMode = false;
let globalIsSimulating = false;
let globalScaleIndex = 0;
let globalSimTimeout = null;

function initCanvasControls() {
  document.getElementById('canvas-clear').onclick = () => {
    if (activePlayground) {
      activePlayground.nodes = [];
      activePlayground.links = [];
      activePlayground.selectedNode = null;
      activePlayground.render();
      activePlayground.saveState();
    }
  };

  document.getElementById('canvas-simulate').onclick = () => {
    globalIsSimulating = !globalIsSimulating;
    document.getElementById('canvas-simulate').classList.toggle('active', globalIsSimulating);
    if (globalIsSimulating) {
      if (playgroundA) playgroundA.startSimulation();
      if (playgroundB && isCompareMode) playgroundB.startSimulation();
    } else {
      if (playgroundA) playgroundA.stopSimulation();
      if (playgroundB) playgroundB.stopSimulation();
    }
  };

  document.getElementById('canvas-compare').onclick = () => {
    isCompareMode = !isCompareMode;
    const btn = document.getElementById('canvas-compare');
    const wrapB = document.getElementById('canvas-stage-wrap-b');
    const labelA = document.getElementById('label-a');
    
    if (isCompareMode) {
      btn.classList.add('active');
      wrapB.style.display = 'block';
      labelA.style.display = 'block';
      if (!playgroundB) {
        playgroundB = new CanvasEngine('#canvas-svg-b', 'system-design-canvas-state-b');
      }
      activePlayground = playgroundB;
    } else {
      btn.classList.remove('active');
      wrapB.style.display = 'none';
      labelA.style.display = 'none';
      activePlayground = playgroundA;
    }
  };

  const slider = document.getElementById('canvas-scale-slider');
  const label = document.getElementById('canvas-scale-label');
  slider.oninput = (e) => {
    globalScaleIndex = Number(e.target.value);
    if (playgroundA) {
      playgroundA.scaleIndex = globalScaleIndex;
      label.textContent = playgroundA.scaleOptions[globalScaleIndex].label + (globalScaleIndex > 0 ? ' Users' : '');
    }
    if (playgroundB) playgroundB.scaleIndex = globalScaleIndex;
  };
}

function initCanvas() {
  if (!playgroundA) {
    playgroundA = new CanvasEngine('#canvas-svg', 'system-design-canvas-state');
    activePlayground = playgroundA;
    playgroundA.initPalette();
    initCanvasControls();
  }
}
`;

content = content.replace(/let playground = null;[\s\S]*$/, globalScript);

// 8. Add stopSimulation method
content = content.replace(/startSimulation\(\) \{/, `stopSimulation() {
    this.isSimulating = false;
    if (this.simTimeout) clearTimeout(this.simTimeout);
  }

  startSimulation() {`);

// Also update CanvasEngine startSimulation to not read this.isSimulating globally but its own (or global).
// Wait, we pass globalIsSimulating to startSimulation
content = content.replace(/if \(\!this\.isSimulating\) return;/g, 'if (!globalIsSimulating) return;');

fs.writeFileSync('js/canvas.js', content, 'utf8');
console.log("Canvas.js patched successfully.");
