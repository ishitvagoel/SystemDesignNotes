/**
 * System Design Playground - Canvas Engine
 * Manages D3-based drag-and-drop architecture canvas.
 */

class CanvasEngine {
  constructor(svgId) {
    this.svg = d3.select(svgId);
    this.container = this.svg.append('g').attr('class', 'canvas-container');
    this.nodes = [];
    this.links = [];
    this.selectedNode = null;
    this.connectingNode = null;
    this.isSimulating = false;

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

    // Palette setup
    this.initPalette();
    
    // Global click to deselect
    this.svg.on('click', (e) => {
      if (e.target.tagName === 'svg') {
        this.selectedNode = null;
        this.connectingNode = null;
        this.updateProps();
        this.render();
      }
    });

    // Toolbar
    document.getElementById('canvas-clear').onclick = () => {
      this.nodes = [];
      this.links = [];
      this.selectedNode = null;
      this.render();
    };

    document.getElementById('canvas-simulate').onclick = () => {
      this.isSimulating = !this.isSimulating;
      document.getElementById('canvas-simulate').classList.toggle('active', this.isSimulating);
      if (this.isSimulating) this.startSimulation();
    };

    this.initQuests();
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
      el.onclick = () => this.addComponent(c.type, c.label);
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
        <input type="text" value="${this.selectedNode.label}" style="width:100%; background:var(--surface); border:1px solid var(--border); color:var(--text); padding:6px; border-radius:4px; font-size:12px;">
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:10px; color:var(--text3); margin-bottom:4px;">CAPACITY (RPS)</label>
        <input type="number" value="${this.selectedNode.capacity}" style="width:100%; background:var(--surface); border:1px solid var(--border); color:var(--text); padding:6px; border-radius:4px; font-size:12px;">
      </div>
      <button id="node-delete" style="width:100%; padding:8px; background:rgba(222,107,138,0.1); border:1px solid var(--pink); color:var(--pink); border-radius:4px; font-size:11px; cursor:pointer; margin-top:20px;">Delete Component</button>
    `;

    document.getElementById('node-delete').onclick = () => {
      this.nodes = this.nodes.filter(n => n.id !== this.selectedNode.id);
      this.links = this.links.filter(l => l.source.id !== this.selectedNode.id && l.target.id !== this.selectedNode.id);
      this.selectedNode = null;
      this.updateProps();
      this.render();
    };
  }

  startSimulation() {
    if (!this.isSimulating) return;

    // Reset loads
    this.nodes.forEach(n => n.load = 0);

    // Identify sources (clients)
    const sources = this.nodes.filter(n => n.type === 'client');
    
    sources.forEach(source => {
      this.generatePackets(source, 100); // 100 requests per tick
    });

    setTimeout(() => this.startSimulation(), 1000);
  }

  generatePackets(source, count) {
    const targets = this.links
      .filter(l => l.source.id === source.id || l.target.id === source.id)
      .map(l => l.source.id === source.id ? l.target : l.source);

    if (targets.length === 0) return;

    targets.forEach(target => {
      const perTarget = count / targets.length;
      target.load += perTarget;
      this.animatePacket(source, target);
      
      // Propagate if not a DB
      if (target.type !== 'db') {
        setTimeout(() => this.generatePackets(target, perTarget), 200);
      }
    });

    this.render();
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

let playground = null;
function initCanvas() {
  if (!playground) {
    playground = new CanvasEngine('#canvas-svg');
  }
}
