/**
 * System Design Playground - Canvas Engine
 * Manages D3-based drag-and-drop architecture canvas.
 */

class CanvasEngine {
  constructor(svgId, stateKey = 'system-design-canvas-state') {
    this.stateKey = stateKey;
    this.svg = d3.select(svgId);
    this.container = this.svg.append('g').attr('class', 'canvas-container');
    this.nodes = [];
    this.links = [];
    this.selectedNode = null;
    this.connectingNode = null;
    this.isSimulating = false;
    this.scaleIndex = 0;
    this.scaleOptions = [
      { label: '1 User', traffic: 1 },
      { label: '100', traffic: 100 },
      { label: '1K', traffic: 1000 },
      { label: '10K', traffic: 10000 },
      { label: '100K', traffic: 100000 },
      { label: '1M', traffic: 1000000 },
      { label: '5M', traffic: 5000000 },
      { label: '10M', traffic: 10000000 }
    ];

    this.init();
  }

  init() {
    const self = this;
    
    // Zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 5])
      .on('zoom', (event) => {
        this.container.attr('transform', event.transform);
      });
    
    this.svg.call(zoom);

    // Initial render
    this.render();

    // Load persisted state
    this.loadState();
    
    // Global click to deselect
    this.svg.on('click', (e) => {
      activePlayground = this;
      if (e.target.tagName === 'svg') {
        this.selectedNode = null;
        this.connectingNode = null;
        this.updateProps();
        this.render();
      }
    });
    this.initQuests();
    this.initScenarios();
  }

  async initScenarios() {
    try {
      const res = await fetch('data/scenarios.json');
      this.scenarios = await res.json();
    } catch (e) {
      console.error('Failed to load scenarios:', e);
    }
  }

  showDecisionModal(junctionId) {
    const scenario = this.scenarios[junctionId];
    if (!scenario || this.modalActive) return;

    this.modalActive = true;
    this.isSimulating = false; // Pause simulation
    if (this.simTimeout) clearTimeout(this.simTimeout);

    const overlay = document.createElement('div');
    overlay.id = 'decision-overlay';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:1000; display:flex; align-items:center; justify-content:center; padding:24px;';
    
    const modal = document.createElement('div');
    modal.style.cssText = 'max-width:480px; background:var(--bg2); border:1px solid var(--border); border-radius:12px; padding:32px; box-shadow:0 20px 50px rgba(0,0,0,0.5);';
    modal.innerHTML = `
      <div style="font-family:\'IBM Plex Mono\',monospace; font-size:11px; color:var(--yellow); text-transform:uppercase; margin-bottom:12px;">Architectural Decision Needed</div>
      <h2 style="font-size:18px; color:var(--text); line-height:1.4; margin-bottom:24px;">${scenario.text}</h2>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${scenario.choices.map(c => `
          <button class="decision-btn" data-choice="${c.id}" style="text-align:left; padding:16px; background:var(--surface); border:1px solid var(--border); border-radius:8px; color:var(--text2); cursor:pointer; transition:all 0.15s;">
            <div style="font-weight:600; color:var(--text); margin-bottom:4px;">${c.text}</div>
            <div style="font-size:11px; opacity:0.8;">${c.impact}</div>
          </button>
        `).join('')}
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelectorAll('.decision-btn').forEach(btn => {
      btn.onclick = () => {
        const choice = scenario.choices.find(c => c.id === btn.dataset.choice);
        this.applyDecision(choice);
        overlay.remove();
        this.modalActive = false;
        // Resume sim after decision
        this.isSimulating = true;
        this.startSimulation();
      };
      btn.onmouseenter = () => { btn.style.borderColor = 'var(--accent)'; btn.style.background = 'var(--accent-dim2)'; };
      btn.onmouseleave = () => { btn.style.borderColor = 'var(--border)'; btn.style.background = 'var(--surface)'; };
    });
  }

  applyDecision(choice) {
    if (choice.component) {
      this.addComponent(choice.component.type, choice.component.label);
      // find the newly added node and set its capacity
      this.nodes[this.nodes.length-1].capacity = choice.component.capacity;
    } else if (choice.modify) {
      const node = this.nodes.find(n => n.type === choice.modify.type);
      if (node) node.capacity = choice.modify.capacity;
    }
    this.render();
  }

  async initQuests() {
    try {
      const res = await fetch('data/quests.json');
      this.quests = await res.json();
      this.renderQuests();
    } catch (e) {
      console.error('Failed to load quests:', e);
    }
  }

  renderQuests() {
    const list = document.getElementById('palette-list');
    const qHeader = document.createElement('div');
    qHeader.style.cssText = `
      padding: 16px 8px 8px;
      font-family:'IBM Plex Mono',monospace;
      font-size: 11px; color:var(--text3);
      text-transform:uppercase;
      border-top:1px solid var(--border);
      margin-top:16px;
    `;
    qHeader.textContent = 'Active Quests';
    list.appendChild(qHeader);

    this.quests.forEach(q => {
      const el = document.createElement('div');
      el.className = 'palette-item';
      el.style.cssText = `
        padding: 10px;
        margin-bottom: 8px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        color: var(--yellow);
        transition: all 0.15s;
      `;
      el.innerHTML = `<span>🏆</span> <span>${q.title}</span>`;
      el.onclick = () => this.startQuest(q);
      list.appendChild(el);
    });
  }

  startQuest(q) {
    this.activeQuest = q;
    this.nodes = [];
    this.links = [];
    
    // Set up initial state (simple example)
    const client = { id: 'c1', type: 'client', label: 'Global Traffic', x: 100, y: 300, capacity: 5000, load: 0 };
    const app = { id: 'a1', type: 'app', label: 'API Server', x: 400, y: 300, capacity: 1000, load: 0 };
    const db = { id: 'd1', type: 'db', label: 'Main DB', x: 700, y: 300, capacity: 500, load: 0 };
    
    this.nodes = [client, app, db];
    this.links = [
      { source: client, target: app },
      { source: app, target: db }
    ];

    const props = document.getElementById('canvas-props');
    const content = document.getElementById('props-content');
    props.style.display = 'block';
    content.innerHTML = `
      <div style="color:var(--yellow); font-weight:600; margin-bottom:8px;">${q.title}</div>
      <p style="font-size:12px; color:var(--text2); line-height:1.5; margin-bottom:12px;">${q.description}</p>
      <div style="font-size:10px; color:var(--text3); text-transform:uppercase; margin-bottom:8px;">Objectives</div>
      <ul style="font-size:11px; color:var(--text2); padding-left:16px; margin-bottom:16px;">
        ${q.objectives.map(o => `<li>${o}</li>`).join('')}
      </ul>
      <button class="graph-ctrl-btn" style="width:100%" onclick="playground.activeQuest=null; playground.updateProps()">Exit Quest</button>
    `;

    this.render();
  }

  initPalette() {
    const components = [
      { type: 'client', label: 'Client', icon: '💻' },
      { type: 'lb', label: 'Load Balancer', icon: '⚖️' },
      { type: 'cdn', label: 'CDN', icon: '🌐' },
      { type: 'app', label: 'App Server', icon: '⚙️' },
      { type: 'db', label: 'Database', icon: '🗄️' },
      { type: 'cache', label: 'Cache', icon: '⚡' },
      { type: 'queue', label: 'Queue', icon: '📥' }
    ];

    const list = document.getElementById('palette-list');
    list.innerHTML = '';
    components.forEach(c => {
      const el = document.createElement('div');
      el.className = 'palette-item';
      el.style.cssText = `
        padding: 10px;
        margin-bottom: 8px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 6px;
        cursor: grab;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        color: var(--text2);
        transition: all 0.15s;
      `;
      el.innerHTML = `<span>${c.icon}</span><span>${c.label}</span>`;
      el.onclick = () => this.activePlayground.addComponent(c.type, c.label);
      el.onmouseenter = () => el.style.borderColor = 'var(--accent)';
      el.onmouseleave = () => el.style.borderColor = 'var(--border)';
      list.appendChild(el);
    });
  }

  addComponent(type, label) {
    const newNode = {
      id: `node-${Date.now()}`,
      type: type,
      label: label,
      x: 100 + Math.random() * 50,
      y: 100 + Math.random() * 50,
      capacity: 1000,
      load: 0
    };
    this.nodes.push(newNode);
    this.render();
  }

  render() {
    const self = this;

    // Draw Links
    const links = this.container.selectAll('.canvas-link')
      .data(this.links, d => d.source.id + '-' + d.target.id);
    
    links.exit().remove();
    
    links.enter().append('line')
      .attr('class', 'canvas-link')
      .attr('stroke', 'var(--border2)')
      .attr('stroke-width', 2)
      .merge(links)
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    // Draw Nodes
    const nodes = this.container.selectAll('.canvas-node')
      .data(this.nodes, d => d.id);

    nodes.exit().remove();

    const nodeEnter = nodes.enter().append('g')
      .attr('class', 'canvas-node')
      .call(d3.drag()
        .on('start', function(e, d) { d3.select(this).raise(); })
        .on('drag', function(e, d) {
          d.x = e.x;
          d.y = e.y;
          self.render();
        })
        .on('end', () => this.saveState())
      );

    nodeEnter.append('rect')
      .attr('width', 120)
      .attr('height', 50)
      .attr('rx', 6)
      .attr('x', -60)
      .attr('y', -25)
      .attr('fill', 'var(--surface)')
      .attr('stroke', 'var(--border)')
      .attr('stroke-width', 2);

    nodeEnter.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '.35em')
      .attr('fill', 'var(--text)')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .text(d => d.label);

    const nodeMerge = nodeEnter.merge(nodes);
    
    nodeMerge.attr('transform', d => `translate(${d.x},${d.y})`);
    
    nodeMerge.select('rect')
      .attr('fill', d => {
        if (d.load > d.capacity) return 'rgba(222,107,138,0.3)'; // Red
        if (d.load > d.capacity * 0.7) return 'rgba(232,208,107,0.3)'; // Yellow
        return 'var(--surface)';
      })
      .attr('stroke', d => {
        if (d === this.selectedNode) return 'var(--accent)';
        if (d === this.connectingNode) return 'var(--yellow)';
        if (d.load > d.capacity) return 'var(--pink)';
        return 'var(--border)';
      });

    nodeMerge.on('click', (e, d) => {
      activePlayground = this;
      e.stopPropagation();
      
      if (e.shiftKey || this.connectingNode) {
        if (this.connectingNode && this.connectingNode !== d) {
          // Create link
          const exists = this.links.some(l => 
            (l.source.id === this.connectingNode.id && l.target.id === d.id) ||
            (l.source.id === d.id && l.target.id === this.connectingNode.id)
          );
          if (!exists) {
            this.links.push({ source: this.connectingNode, target: d });
          }
          this.connectingNode = null;
        } else {
          this.connectingNode = d;
        }
      } else {
        this.selectedNode = d;
        this.connectingNode = null;
        this.updateProps();
      }
      this.render();
    });
  }

  updateProps() {
    const props = document.getElementById('canvas-props');
    const content = document.getElementById('props-content');
    
    if (!this.selectedNode) {
      props.style.display = 'none';
      return;
    }

    props.style.display = 'block';
    content.innerHTML = `
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:10px; color:var(--text3); margin-bottom:4px;">NAME</label>
        <input id="prop-name" type="text" value="${this.selectedNode.label}" style="width:100%; background:var(--surface); border:1px solid var(--border); color:var(--text); padding:6px; border-radius:4px; font-size:12px; outline:none;">
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:10px; color:var(--text3); margin-bottom:4px;">CAPACITY (RPS)</label>
        <input id="prop-cap" type="number" value="${this.selectedNode.capacity}" style="width:100%; background:var(--surface); border:1px solid var(--border); color:var(--text); padding:6px; border-radius:4px; font-size:12px; outline:none;">
      </div>
      <div style="font-size:10px; color:var(--text3); line-height:1.4; margin-top:16px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>CURRENT LOAD</span> <span>${Math.round(this.selectedNode.load)} RPS</span></div>
        <div style="height:4px; background:var(--surface2); border-radius:2px; overflow:hidden;">
          <div style="width:${Math.min(100, (this.selectedNode.load / this.selectedNode.capacity) * 100)}%; height:100%; background:${this.selectedNode.load > this.selectedNode.capacity ? 'var(--pink)' : 'var(--accent)'};"></div>
        </div>
      </div>
      <div id="node-links" style="margin-top:16px;">
        <div style="font-size:10px; color:var(--text3); text-transform:uppercase; margin-bottom:8px;">Connections</div>
        <div id="links-list"></div>
      </div>
      <button id="node-delete" style="width:100%; padding:8px; background:rgba(222,107,138,0.1); border:1px solid var(--pink); color:var(--pink); border-radius:4px; font-size:11px; cursor:pointer; margin-top:20px;">Delete Component</button>
    `;

    // Render connections
    const nodeLinks = this.links.filter(l => l.source.id === this.selectedNode.id || l.target.id === this.selectedNode.id);
    const linksList = document.getElementById('links-list');
    nodeLinks.forEach(l => {
      const target = l.source.id === this.selectedNode.id ? l.target : l.source;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--text2); margin-bottom:4px; background:var(--surface); padding:4px 8px; border-radius:4px;';
      row.innerHTML = `<span>→ ${target.label}</span> <span class="link-del" style="color:var(--pink); cursor:pointer;">×</span>`;
      row.querySelector('.link-del').onclick = () => {
        this.links = this.links.filter(link => link !== l);
        this.updateProps();
        this.render();
        this.saveState();
      };
      linksList.appendChild(row);
    });

    document.getElementById('prop-name').oninput = (e) => {
      this.selectedNode.label = e.target.value;
      this.render();
      this.saveState();
    };
    document.getElementById('prop-cap').oninput = (e) => {
      this.selectedNode.capacity = Number(e.target.value);
      this.render();
      this.saveState();
    };

    document.getElementById('node-delete').onclick = () => {
      this.nodes = this.nodes.filter(n => n.id !== this.selectedNode.id);
      this.links = this.links.filter(l => l.source.id !== this.selectedNode.id && l.target.id !== this.selectedNode.id);
      this.selectedNode = null;
      this.updateProps();
      this.render();
      this.saveState();
    };
  }

  saveState() {
    // Only save free-form design, not active quest state
    if (!this.activeQuest) {
      const state = {
        nodes: this.nodes.map(n => ({ ...n, load: 0 })),
        links: this.links.map(l => ({ source: l.source.id, target: l.target.id }))
      };
      localStorage.setItem(this.stateKey, JSON.stringify(state));
    }
  }

  loadState() {
    const raw = localStorage.getItem(this.stateKey);
    if (!raw) return;
    try {
      const state = JSON.parse(raw);
      this.nodes = state.nodes;
      this.links = state.links.map(l => ({
        source: this.nodes.find(n => n.id === l.source),
        target: this.nodes.find(n => n.id === l.target)
      })).filter(l => l.source && l.target);
      this.render();
    } catch (e) { console.error('Failed to load state', e); }
  }

  stopSimulation() {
    this.isSimulating = false;
    if (this.simTimeout) clearTimeout(this.simTimeout);
  }

  startSimulation() {
    if (!globalIsSimulating) return;

    // Reset loads
    this.nodes.forEach(n => n.load = 0);

    // Identify sources (clients)
    const sources = this.nodes.filter(n => n.type === 'client');
    
    // Calculate total load based on scale slider
    // rpsPerUser = 0.01 (active users / total users ratio * requests per active user)
    const totalRps = this.scaleOptions[this.scaleIndex].traffic * 0.01;
    const perSourceRps = totalRps / (sources.length || 1);

    sources.forEach(source => {
      this.generatePackets(source, perSourceRps);
    });

    // Check quest win condition
    if (this.activeQuest) {
      this.checkWinCondition();
    }

    this.simTimeout = setTimeout(() => this.startSimulation(), 1000);
  }

  generatePackets(source, count) {
    // Find all outgoing links
    const links = this.links.filter(l => l.source.id === source.id || l.target.id === source.id);
    const targets = links.map(l => l.source.id === source.id ? l.target : l.source);

    if (targets.length === 0) return;

    // Load Balancer logic: Round-robin or even split
    // Cache logic: reduce load to next hop if cache is present
    let nextCount = count;
    if (source.type === 'cache') {
      nextCount = count * 0.1; // Cache hit: only 10% traffic goes through
    }

    const perTarget = nextCount / targets.length;

    targets.forEach(target => {
      target.load += perTarget;
      this.animatePacket(source, target);
      
      // Stop propagation at DB or if load is negligible
      if (target.type !== 'db' && perTarget > 1) {
        setTimeout(() => this.generatePackets(target, perTarget), 300);
      }
    });

    this.render();
  }

  checkWinCondition() {
    const q = this.activeQuest;
    if (!q || !q.winCondition) return;

    const win = q.winCondition;
    let satisfied = true;

    // Check RPS requirement
    const clients = this.nodes.filter(n => n.type === 'client');
    if (win.minRps && clients.length === 0) satisfied = false;

    // Check bottlenecks
    const overloaded = this.nodes.find(n => n.load > n.capacity);
    if (overloaded) satisfied = false;

    // Trigger branching decisions for specific quests
    if (q.id === 'q1' && !this.junctionsTriggered?.flash_sale_db_bottleneck) {
      const db = this.nodes.find(n => n.type === 'db');
      if (db && db.load > db.capacity * 0.9) {
        if (!this.junctionsTriggered) this.junctionsTriggered = {};
        this.junctionsTriggered.flash_sale_db_bottleneck = true;
        this.showDecisionModal('flash_sale_db_bottleneck');
      }
    }

    if (q.id === 'q2' && !this.junctionsTriggered?.global_latency_cdn) {
      if (this.scaleIndex >= 4) { // At 100k+ users
        if (!this.junctionsTriggered) this.junctionsTriggered = {};
        this.junctionsTriggered.global_latency_cdn = true;
        this.showDecisionModal('global_latency_cdn');
      }
    }

    if (q.id === 'q3' && !this.junctionsTriggered?.chat_reliability_bottleneck) {
      const app = this.nodes.find(n => n.type === 'app');
      if (app && app.load > app.capacity * 0.8) {
        if (!this.junctionsTriggered) this.junctionsTriggered = {};
        this.junctionsTriggered.chat_reliability_bottleneck = true;
        this.showDecisionModal('chat_reliability_bottleneck');
      }
    }

    if (q.id === 'q4' && !this.junctionsTriggered?.newsfeed_fanout_conflict) {
      if (this.scaleIndex >= 5) { // At 1M+ users
        if (!this.junctionsTriggered) this.junctionsTriggered = {};
        this.junctionsTriggered.newsfeed_fanout_conflict = true;
        this.showDecisionModal('newsfeed_fanout_conflict');
      }
    }

    if (q.id === 'q5' && !this.junctionsTriggered?.distributed_lock_contention) {
      const db = this.nodes.find(n => n.type === 'db');
      if (db && db.load > db.capacity * 0.5) { // Earlier trigger for contention
        if (!this.junctionsTriggered) this.junctionsTriggered = {};
        this.junctionsTriggered.distributed_lock_contention = true;
        this.showDecisionModal('distributed_lock_contention');
      }
    }

    if (satisfied && !this.questWon) {
      this.questWon = true;
      this.showWinMessage();
    }
  }

  showWinMessage() {
    const props = document.getElementById('canvas-props');
    const content = document.getElementById('props-content');
    const winEl = document.createElement('div');
    winEl.style.cssText = `
      margin-top: 20px;
      padding: 16px;
      background: rgba(107,222,140,0.15);
      border: 1px solid var(--accent);
      border-radius: 8px;
      color: var(--accent);
      font-weight: 600;
      text-align: center;
      animation: fadeIn 0.3s ease;
    `;
    winEl.innerHTML = `
      <div style="font-size:24px; margin-bottom:8px;">🏆</div>
      <div>Quest Complete!</div>
      <div style="font-size:11px; font-weight:400; margin-top:4px; color:var(--text2);">You successfully scaled the system.</div>
    `;
    content.appendChild(winEl);
  }

  animatePacket(source, target) {
    const packet = this.container.append('circle')
      .attr('r', 3)
      .attr('fill', 'var(--accent)')
      .attr('cx', source.x)
      .attr('cy', source.y);

    packet.transition()
      .duration(500)
      .attr('cx', target.x)
      .attr('cy', target.y)
      .remove();
  }
}


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
