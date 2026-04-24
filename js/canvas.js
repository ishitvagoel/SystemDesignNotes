/**
 * System Design Playground - Canvas Engine
 * Manages D3-based drag-and-drop architecture canvas.
 */

function escapeCanvasHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case '\'': return '&#39;';
      default: return ch;
    }
  });
}

class CanvasEngine {
  constructor(svgId, stateKey = 'system-design-canvas-state', isPrimary = false) {
    this.svgId = svgId;
    this.stateKey = stateKey;
    this.isPrimary = isPrimary;
    this.svg = d3.select(svgId);
    this.container = this.svg.append('g').attr('class', 'canvas-container');
    this.nodes = [];
    this.links = [];
    this.selectedNode = null;
    this.connectingNode = null;
    this.connectMode = false;
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
    this.chronicles = null;
    this.currentChronicle = null;
    this.currentSnapshotIndex = 0;

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

    // Arrow marker definition for directional links
    const defs = this.svg.append('defs');
    defs.append('marker')
      .attr('id', 'arrow-' + this.svgId.replace(/[^a-z0-9]/gi, ''))
      .attr('viewBox', '0 0 10 6')
      .attr('refX', 10)
      .attr('refY', 3)
      .attr('markerWidth', 10)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,0 L10,3 L0,6 Z')
      .attr('fill', 'var(--border2)');
    this.arrowMarkerId = 'arrow-' + this.svgId.replace(/[^a-z0-9]/gi, '');

    // Temporary line for drag-to-connect
    this.dragLine = this.container.append('line')
      .attr('class', 'canvas-drag-line')
      .attr('stroke', 'var(--yellow)')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '6,4')
      .style('display', 'none');

    // Initial render
    this.render();

    // Load persisted state
    this.loadState();
    this.loadChronicles();
    
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

  async loadChronicles() {
    try {
      const res = await fetch('data/evolution-chronicles.json');
      this.chronicles = await res.json();
    } catch (e) {
      console.error('Failed to load chronicles:', e);
    }
  }

  setSnapshot(index) {
    if (!this.currentChronicle) return;
    
    // Track previous node IDs to highlight new ones
    const prevIds = new Set(this.nodes.map(n => n.id));
    
    this.currentSnapshotIndex = index;
    const snapshot = this.currentChronicle.snapshots[index];
    
    // Update internal state
    this.nodes = JSON.parse(JSON.stringify(snapshot.nodes));
    this.nodes.forEach(n => {
      n.isNew = !prevIds.has(n.id) && prevIds.size > 0;
    });

    this.links = snapshot.links.map(l => ({
      source: this.nodes.find(n => n.id === l.source),
      target: this.nodes.find(n => n.id === l.target)
    })).filter(l => l.source && l.target);
    
    // Update HUD (we'll build the HUD in Task 3)
    if (this.updateHUD) this.updateHUD(snapshot);
    
    this.render(); // Existing render method
  }

  updateHUD(snapshot) {
    const hud = document.getElementById('narrative-hud');
    if (!hud) return;
    
    hud.classList.remove('hidden');
    document.getElementById('hud-era').textContent = snapshot.label;
    document.getElementById('hud-scale').textContent = snapshot.scale;
    document.getElementById('hud-text').textContent = snapshot.narrative;
    
    const eraLabel = document.getElementById('slider-label');
    if (eraLabel) {
      eraLabel.textContent = `Era ${this.currentSnapshotIndex + 1}`;
    }
    
    const sliderLabel = document.getElementById('canvas-scale-label');
    if (sliderLabel) {
      sliderLabel.textContent = snapshot.scale;
    }
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
      <h2 style="font-size:18px; color:var(--text); line-height:1.4; margin-bottom:24px;">${escapeCanvasHtml(scenario.text)}</h2>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${scenario.choices.map(c => `
          <button class="decision-btn" data-choice="${escapeCanvasHtml(c.id)}" style="text-align:left; padding:16px; background:var(--surface); border:1px solid var(--border); border-radius:8px; color:var(--text2); cursor:pointer; transition:all 0.15s;">
            <div style="font-weight:600; color:var(--text); margin-bottom:4px;">${escapeCanvasHtml(c.text)}</div>
            <div style="font-size:11px; opacity:0.8;">${escapeCanvasHtml(c.impact)}</div>
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
      btn.addEventListener('pointerenter', () => { btn.style.borderColor = 'var(--accent)'; btn.style.background = 'var(--accent-dim2)'; });
      btn.addEventListener('pointerleave', () => { btn.style.borderColor = 'var(--border)'; btn.style.background = 'var(--surface)'; });
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
      if (this.isPrimary) this.renderQuests();
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
      el.innerHTML = `<span>🏆</span> <span>${escapeCanvasHtml(q.title)}</span>`;
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
      <div style="color:var(--yellow); font-weight:600; margin-bottom:8px;">${escapeCanvasHtml(q.title)}</div>
      <p style="font-size:12px; color:var(--text2); line-height:1.5; margin-bottom:12px;">${escapeCanvasHtml(q.description)}</p>
      <div style="font-size:10px; color:var(--text3); text-transform:uppercase; margin-bottom:8px;">Objectives</div>
      <ul style="font-size:11px; color:var(--text2); padding-left:16px; margin-bottom:16px;">
        ${q.objectives.map(o => `<li>${escapeCanvasHtml(o)}</li>`).join('')}
      </ul>
      <button id="exit-quest-btn" class="graph-ctrl-btn" style="width:100%">Exit Quest</button>
    `;
    content.querySelector('#exit-quest-btn').addEventListener('click', () => {
      activePlayground.activeQuest = null;
      activePlayground.updateProps();
    });

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
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        color: var(--text2);
        transition: all 0.15s;
      `;
      el.innerHTML = `<span>${c.icon}</span><span>${escapeCanvasHtml(c.label)}</span>`;
      el.onclick = () => activePlayground.addComponent(c.type, c.label);
      el.addEventListener('pointerenter', () => el.style.borderColor = 'var(--accent)');
      el.addEventListener('pointerleave', () => el.style.borderColor = 'var(--border)');
      list.appendChild(el);
    });
  }

  addComponent(type, label) {
    const svgEl = this.svg.node();
    const { width, height } = svgEl.getBoundingClientRect();
    const transform = d3.zoomTransform(svgEl);
    const [cx, cy] = transform.invert([width / 2, height / 2]);
    const newNode = {
      id: `node-${Date.now()}`,
      type: type,
      label: label,
      x: cx + (Math.random() - 0.5) * 120,
      y: cy + (Math.random() - 0.5) * 120,
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
      .attr('marker-end', `url(#${this.arrowMarkerId})`)
      .merge(links)
      .transition().duration(750)
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => {
        // Shorten line so arrow sits at node edge (node half-width = 60)
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        return d.target.x - (dx / dist) * 60;
      })
      .attr('y2', d => {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        return d.target.y - (dy / dist) * 32;
      });

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

    const NODE_ICONS = { client: '💻', lb: '⚖️', cdn: '🌐', app: '⚙️', db: '🗄️', cache: '⚡', queue: '📥' };

    nodeEnter.append('rect')
      .attr('width', 120)
      .attr('height', 64)
      .attr('rx', 6)
      .attr('x', -60)
      .attr('y', -32)
      .attr('fill', 'var(--surface)')
      .attr('stroke', 'var(--border)')
      .attr('stroke-width', 2);

    nodeEnter.append('text')
      .attr('class', 'node-icon')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.5em')
      .attr('fill', 'var(--text)')
      .style('font-size', '16px')
      .style('pointer-events', 'none')
      .text(d => NODE_ICONS[d.type] || '🔲');

    nodeEnter.append('text')
      .attr('class', 'node-label')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.2em')
      .attr('fill', 'var(--text)')
      .style('font-size', '11px')
      .style('pointer-events', 'none')
      .text(d => d.label);

    // Connection port: output (right side)
    nodeEnter.append('circle')
      .attr('class', 'port port-out')
      .attr('cx', 60).attr('cy', 0).attr('r', 6)
      .attr('fill', 'var(--bg2)')
      .attr('stroke', 'var(--accent)')
      .attr('stroke-width', 1.5)
      .style('cursor', 'crosshair')
      .style('opacity', 0)
      .on('mouseenter', function() { d3.select(this).style('opacity', 1); })
      .on('mouseleave', function() { if (!self.connectingNode) d3.select(this).style('opacity', 0); });

    // Connection port: input (left side)
    nodeEnter.append('circle')
      .attr('class', 'port port-in')
      .attr('cx', -60).attr('cy', 0).attr('r', 6)
      .attr('fill', 'var(--bg2)')
      .attr('stroke', 'var(--accent)')
      .attr('stroke-width', 1.5)
      .style('cursor', 'crosshair')
      .style('opacity', 0)
      .on('mouseenter', function() { d3.select(this).style('opacity', 1); })
      .on('mouseleave', function() { if (!self.connectingNode) d3.select(this).style('opacity', 0); });

    const nodeMerge = nodeEnter.merge(nodes)
      .classed('node-pulse', d => d.isNew);
    nodeMerge.transition().duration(750)

      .attr('transform', d => `translate(${d.x},${d.y})`);
    
    nodeMerge.select('.node-label').text(d => d.label);
    nodeMerge.select('.node-icon').text(d => NODE_ICONS[d.type] || '🔲');
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
      
      if (e.shiftKey || this.connectMode || this.connectingNode) {
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

    const tooltip = document.getElementById('canvas-tooltip');
    nodeMerge.on('mouseover', (e, d) => {
      const util = d.capacity > 0 ? Math.round((d.load / d.capacity) * 100) : 0;
      const status = d.load > d.capacity ? '🔴 Overloaded' : d.load > d.capacity * 0.7 ? '🟡 High' : '🟢 OK';
      tooltip.innerHTML = `<strong>${escapeCanvasHtml(d.label)}</strong><br>Capacity: ${d.capacity} RPS<br>Load: ${Math.round(d.load)} RPS (${util}%)<br>Status: ${escapeCanvasHtml(status)}`;
      tooltip.style.display = 'block';
      tooltip.style.left = (e.pageX + 14) + 'px';
      tooltip.style.top = (e.pageY - 10) + 'px';
    });
    nodeMerge.on('mousemove', (e) => {
      tooltip.style.left = (e.pageX + 14) + 'px';
      tooltip.style.top = (e.pageY - 10) + 'px';
    });
    nodeMerge.on('mouseout', () => { tooltip.style.display = 'none'; });

    // Show ports when in connect mode or connecting
    nodeMerge.selectAll('.port')
      .style('opacity', (this.connectMode || this.connectingNode) ? 0.8 : 0);

    // Drag-to-connect from output port
    nodeMerge.select('.port-out')
      .call(d3.drag()
        .on('start', (e, d) => {
          e.sourceEvent.stopPropagation();
          this.connectingNode = d;
          this.dragLine.style('display', null)
            .attr('x1', d.x + 60).attr('y1', d.y)
            .attr('x2', d.x + 60).attr('y2', d.y);
        })
        .on('drag', (e, d) => {
          const transform = d3.zoomTransform(this.svg.node());
          const [mx, my] = transform.invert([e.sourceEvent.offsetX, e.sourceEvent.offsetY]);
          this.dragLine.attr('x2', mx).attr('y2', my);
        })
        .on('end', (e, d) => {
          this.dragLine.style('display', 'none');
          // Find if we dropped on a node
          const transform = d3.zoomTransform(this.svg.node());
          const [mx, my] = transform.invert([e.sourceEvent.offsetX, e.sourceEvent.offsetY]);
          const target = this.nodes.find(n => n !== d &&
            Math.abs(n.x - mx) < 60 && Math.abs(n.y - my) < 32);
          if (target) {
            const exists = this.links.some(l =>
              (l.source.id === d.id && l.target.id === target.id) ||
              (l.source.id === target.id && l.target.id === d.id));
            if (!exists) {
              this.links.push({ source: d, target: target });
              this.saveState();
            }
          }
          this.connectingNode = null;
          this.render();
        })
      );

    // Update hint overlay (only for primary canvas / active canvas)
    if (this === activePlayground) {
      const hint = document.getElementById('canvas-hint');
      if (hint) {
        if (this.connectingNode) {
          hint.textContent = `🔗 Click another node to connect to "${this.connectingNode.label}" — Esc to cancel`;
          hint.style.display = 'block';
        } else if (this.nodes.length >= 2 && this.links.length === 0) {
          hint.textContent = '💡 Click "Connect" or Shift+Click nodes to create connections. Drag from port circles on node edges.';
          hint.style.display = 'block';
        } else {
          hint.style.display = 'none';
        }
      }
    }

    // Live load refresh in props panel
    if (this.selectedNode) {
      const loadVal = document.getElementById('prop-load-val');
      const loadBar = document.getElementById('prop-load-bar');
      if (loadVal) loadVal.textContent = Math.round(this.selectedNode.load) + ' RPS';
      if (loadBar) {
        loadBar.style.width = Math.min(100, (this.selectedNode.load / this.selectedNode.capacity) * 100) + '%';
        loadBar.style.background = this.selectedNode.load > this.selectedNode.capacity ? 'var(--pink)' : 'var(--accent)';
      }
    }

    // Simulation stats overlay — show for both A and B
    const statsId = this.isPrimary ? 'canvas-sim-stats' : 'canvas-sim-stats-b';
    const stats = document.getElementById(statsId);
    if (stats) {
      if (globalIsSimulating && this.nodes.length > 0) {
        const overloaded = this.nodes.filter(n => n.load > n.capacity).length;
        const totalRps = this.nodes.filter(n => n.type === 'client').reduce((s, n) => s + n.load, 0);
        const totalCap = this.nodes.reduce((s, n) => s + n.capacity, 0);
        stats.innerHTML = `NODES: ${this.nodes.length} &nbsp;|&nbsp; LINKS: ${this.links.length}<br>THROUGHPUT: ${Math.round(totalRps)} RPS<br>CAPACITY: ${totalCap} RPS<br>OVERLOADED: <span style="color:${overloaded > 0 ? 'var(--pink)' : 'var(--accent)'}">${overloaded}</span>`;
        stats.style.display = 'block';
      } else {
        stats.style.display = 'none';
      }
    }
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
        <input id="prop-name" type="text" value="${escapeCanvasHtml(this.selectedNode.label)}" style="width:100%; background:var(--surface); border:1px solid var(--border); color:var(--text); padding:6px; border-radius:4px; font-size:12px; outline:none;">
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:10px; color:var(--text3); margin-bottom:4px;">CAPACITY (RPS)</label>
        <input id="prop-cap" type="number" value="${this.selectedNode.capacity}" style="width:100%; background:var(--surface); border:1px solid var(--border); color:var(--text); padding:6px; border-radius:4px; font-size:12px; outline:none;">
      </div>
      <div style="font-size:10px; color:var(--text3); line-height:1.4; margin-top:16px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>CURRENT LOAD</span> <span id="prop-load-val">${Math.round(this.selectedNode.load)} RPS</span></div>
        <div style="height:4px; background:var(--surface2); border-radius:2px; overflow:hidden;">
          <div id="prop-load-bar" style="width:${Math.min(100, (this.selectedNode.load / this.selectedNode.capacity) * 100)}%; height:100%; background:${this.selectedNode.load > this.selectedNode.capacity ? 'var(--pink)' : 'var(--accent)'};"></div>
        </div>
      </div>
      <div id="node-links" style="margin-top:16px;">
        <div style="font-size:10px; color:var(--text3); text-transform:uppercase; margin-bottom:8px;">Connections</div>
        <div id="links-list"></div>
      </div>
      <button id="node-duplicate" style="width:100%; padding:8px; background:var(--surface); border:1px solid var(--border); color:var(--text2); border-radius:4px; font-size:11px; cursor:pointer; margin-top:12px;">Duplicate Component</button>
      <button id="node-delete" style="width:100%; padding:8px; background:rgba(222,107,138,0.1); border:1px solid var(--pink); color:var(--pink); border-radius:4px; font-size:11px; cursor:pointer; margin-top:8px;">Delete Component</button>
    `;

    // Render connections
    const nodeLinks = this.links.filter(l => l.source.id === this.selectedNode.id || l.target.id === this.selectedNode.id);
    const linksList = document.getElementById('links-list');
    nodeLinks.forEach(l => {
      const target = l.source.id === this.selectedNode.id ? l.target : l.source;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--text2); margin-bottom:4px; background:var(--surface); padding:4px 8px; border-radius:4px;';
      row.innerHTML = `<span>→ ${escapeCanvasHtml(target.label)}</span> <span class="link-del" style="color:var(--pink); cursor:pointer;">×</span>`;
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

    document.getElementById('node-duplicate').onclick = () => {
      const src = this.selectedNode;
      const copy = { ...src, id: `node-${Date.now()}`, x: src.x + 40, y: src.y + 40, load: 0 };
      this.nodes.push(copy);
      this.selectedNode = copy;
      this.updateProps();
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

  document.getElementById('canvas-connect').onclick = () => {
    if (!activePlayground) return;
    activePlayground.connectMode = !activePlayground.connectMode;
    document.getElementById('canvas-connect').classList.toggle('active', activePlayground.connectMode);
    if (!activePlayground.connectMode) {
      activePlayground.connectingNode = null;
      activePlayground.render();
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
    const wrapA = document.getElementById('canvas-stage-wrap');
    const wrapB = document.getElementById('canvas-stage-wrap-b');
    const splitter = document.getElementById('canvas-splitter');
    const labelA = document.getElementById('label-a');
    const compTable = document.getElementById('canvas-comparison-table');

    if (isCompareMode) {
      btn.classList.add('active');
      wrapB.style.display = 'block';
      splitter.style.display = 'block';
      labelA.style.display = 'block';
      compTable.style.display = 'block';
      // Set initial 50/50 split
      wrapA.style.flex = 'none';
      wrapA.style.width = '50%';
      wrapB.style.flex = 'none';
      wrapB.style.width = 'calc(50% - 6px)';
      if (!playgroundB) {
        playgroundB = new CanvasEngine('#canvas-svg-b', 'system-design-canvas-state-b');
      }
      activePlayground = playgroundB;
      initSplitter();
      updateComparisonTable();
    } else {
      btn.classList.remove('active');
      wrapB.style.display = 'none';
      splitter.style.display = 'none';
      labelA.style.display = 'none';
      compTable.style.display = 'none';
      wrapA.style.flex = '1';
      wrapA.style.width = '';
      activePlayground = playgroundA;
    }
  };

  document.getElementById('canvas-export').onclick = () => {
    const pg = activePlayground;
    if (!pg) return;
    const state = {
      nodes: pg.nodes.map(n => ({ ...n, load: 0 })),
      links: pg.links.map(l => ({ source: l.source.id, target: l.target.id }))
    };
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'system-design.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  document.addEventListener('keydown', (e) => {
    const canvasVisible = document.getElementById('canvas-screen').style.display !== 'none';
    if (!canvasVisible || !activePlayground) return;
    if (e.target.tagName === 'INPUT') return; // don't interfere with text inputs
    if ((e.key === 'Delete' || e.key === 'Backspace') && activePlayground.selectedNode) {
      const n = activePlayground.selectedNode;
      activePlayground.nodes = activePlayground.nodes.filter(node => node.id !== n.id);
      activePlayground.links = activePlayground.links.filter(l => l.source.id !== n.id && l.target.id !== n.id);
      activePlayground.selectedNode = null;
      activePlayground.updateProps();
      activePlayground.render();
      activePlayground.saveState();
    } else if (e.key === 'Escape') {
      activePlayground.selectedNode = null;
      activePlayground.connectingNode = null;
      activePlayground.connectMode = false;
      document.getElementById('canvas-connect').classList.remove('active');
      activePlayground.updateProps();
      activePlayground.render();
    }
  });

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

// ── Draggable Splitter ──
function initSplitter() {
  const splitter = document.getElementById('canvas-splitter');
  const container = document.getElementById('canvas-split-container');
  const wrapA = document.getElementById('canvas-stage-wrap');
  const wrapB = document.getElementById('canvas-stage-wrap-b');

  let isDragging = false;

  function startDrag(e) {
    e.preventDefault();
    isDragging = true;
    splitter.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }
  function onDrag(clientX) {
    if (!isDragging) return;
    const rect = container.getBoundingClientRect();
    const offset = clientX - rect.left;
    const total = rect.width;
    const pct = Math.max(20, Math.min(80, (offset / total) * 100));
    wrapA.style.width = pct + '%';
    wrapB.style.width = (100 - pct) + '%';
  }
  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
    splitter.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  // Mouse events
  splitter.addEventListener('mousedown', startDrag);
  document.addEventListener('mousemove', (e) => onDrag(e.clientX));
  document.addEventListener('mouseup', endDrag);

  // Touch events
  splitter.addEventListener('touchstart', (e) => { startDrag(e); }, { passive: false });
  document.addEventListener('touchmove', (e) => { if (isDragging) onDrag(e.touches[0].clientX); }, { passive: true });
  document.addEventListener('touchend', endDrag);
}

// ── Comparison Trade-Off Table ──
function getCanvasMetrics(engine) {
  if (!engine || engine.nodes.length === 0) return null;
  const nodes = engine.nodes;
  const links = engine.links;
  const totalCapacity = nodes.reduce((s, n) => s + (n.capacity || 0), 0);
  const totalLoad = nodes.reduce((s, n) => s + (n.load || 0), 0);
  const overloaded = nodes.filter(n => n.load > n.capacity).length;
  const types = {};
  nodes.forEach(n => { types[n.type] = (types[n.type] || 0) + 1; });
  const typeStr = Object.entries(types).map(([t, c]) => `${c} ${t}`).join(', ');
  const avgUtil = totalCapacity > 0 ? Math.round((totalLoad / totalCapacity) * 100) : 0;
  return {
    nodeCount: nodes.length,
    linkCount: links.length,
    totalCapacity,
    totalLoad: Math.round(totalLoad),
    overloaded,
    typeStr,
    avgUtil
  };
}

function updateComparisonTable() {
  if (!isCompareMode) return;
  const table = document.getElementById('canvas-comparison-table');
  if (!table) return;

  const mA = getCanvasMetrics(playgroundA);
  const mB = getCanvasMetrics(playgroundB);

  if (!mA && !mB) {
    table.innerHTML = '<div style="color:var(--text3); text-align:center; padding:8px;">Add components to both designs to see comparison</div>';
    return;
  }

  const a = mA || { nodeCount: 0, linkCount: 0, totalCapacity: 0, totalLoad: 0, overloaded: 0, typeStr: '—', avgUtil: 0 };
  const b = mB || { nodeCount: 0, linkCount: 0, totalCapacity: 0, totalLoad: 0, overloaded: 0, typeStr: '—', avgUtil: 0 };

  function better(valA, valB, higherIsBetter) {
    if (valA === valB) return ['', ''];
    if (higherIsBetter) return valA > valB ? ['metric-better', 'metric-worse'] : ['metric-worse', 'metric-better'];
    return valA < valB ? ['metric-better', 'metric-worse'] : ['metric-worse', 'metric-better'];
  }

  const cap = better(a.totalCapacity, b.totalCapacity, true);
  const ovr = better(a.overloaded, b.overloaded, false);
  const util = better(a.avgUtil, b.avgUtil, false);

  table.innerHTML = `
    <table>
      <thead><tr><th>Metric</th><th>Design A</th><th>Design B</th><th>Verdict</th></tr></thead>
      <tbody>
        <tr><td>Components</td><td>${a.nodeCount}</td><td>${b.nodeCount}</td><td>${a.nodeCount === b.nodeCount ? 'Tied' : a.nodeCount < b.nodeCount ? 'A is simpler' : 'B is simpler'}</td></tr>
        <tr><td>Connections</td><td>${a.linkCount}</td><td>${b.linkCount}</td><td>${a.linkCount === b.linkCount ? 'Tied' : a.linkCount < b.linkCount ? 'A less coupled' : 'B less coupled'}</td></tr>
        <tr><td>Topology</td><td>${a.typeStr || '—'}</td><td>${b.typeStr || '—'}</td><td>—</td></tr>
        <tr><td>Total Capacity</td><td class="${cap[0]}">${a.totalCapacity.toLocaleString()} RPS</td><td class="${cap[1]}">${b.totalCapacity.toLocaleString()} RPS</td><td>${a.totalCapacity === b.totalCapacity ? 'Tied' : a.totalCapacity > b.totalCapacity ? 'A higher' : 'B higher'}</td></tr>
        <tr><td>Avg Utilization</td><td class="${util[0]}">${a.avgUtil}%</td><td class="${util[1]}">${b.avgUtil}%</td><td>${a.avgUtil === b.avgUtil ? 'Tied' : a.avgUtil < b.avgUtil ? 'A headroom' : 'B headroom'}</td></tr>
        <tr><td>Bottlenecks</td><td class="${ovr[0]}">${a.overloaded}</td><td class="${ovr[1]}">${b.overloaded}</td><td>${a.overloaded === b.overloaded ? 'Tied' : a.overloaded < b.overloaded ? 'A healthier' : 'B healthier'}</td></tr>
      </tbody>
    </table>
  `;
}

// Auto-update comparison table during simulation
let comparisonInterval = null;
function startComparisonUpdates() {
  if (comparisonInterval) return;
  comparisonInterval = setInterval(() => {
    if (isCompareMode) updateComparisonTable();
  }, 1000);
}
function stopComparisonUpdates() {
  if (comparisonInterval) { clearInterval(comparisonInterval); comparisonInterval = null; }
}

function initCanvas() {
  if (!playgroundA) {
    playgroundA = new CanvasEngine('#canvas-svg', 'system-design-canvas-state', true);
    activePlayground = playgroundA;
    playgroundA.initPalette();
    initCanvasControls();
    startComparisonUpdates();
  }
}
