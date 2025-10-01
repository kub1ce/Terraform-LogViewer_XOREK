const uploadBtn = document.getElementById('btnUpload');
const searchBtn = document.getElementById('btnSearch');
const unreadBtn = document.getElementById('btnUnread');
const ganttBtn = document.getElementById('btnGantt');
let unreadOnly = false;

uploadBtn.onclick = async () => {
  const f = document.getElementById('file').files[0];
  if (!f) return alert('Select file');
  const fd = new FormData();
  fd.append('file', f);
  const r = await fetch('/upload', { method: 'POST', body: fd });
  const j = await r.json();
  alert('Inserted: ' + j.inserted);
}

searchBtn.onclick = () => search();
ganttBtn.onclick = () => showTimeline();
unreadBtn.onclick = () => { unreadOnly = !unreadOnly; search(); }

async function search() {
  const q = document.getElementById('q').value;
  const level = document.getElementById('level').value;
  const tf_req_id = document.getElementById('tf_req_id').value;
  const tf_resource = document.getElementById('tf_resource').value;
  
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (level) params.set('level', level);
  if (tf_req_id) params.set('tf_req_id', tf_req_id);
  if (tf_resource) params.set('tf_resource', tf_resource);
  if (unreadOnly) params.set('unread', '1');
  
  const r = await fetch('/search?' + params.toString());
  const arr = await r.json();
  document.getElementById('gantt-container').style.display = 'none';
  render(arr);
}

async function showTimeline() {
  const params = new URLSearchParams();
  params.set('limit', '1000'); // Получить больше данных для диаграммы
  
  const r = await fetch('/search?' + params.toString());
  const arr = await r.json();
  document.getElementById('results').innerHTML = '';
  document.getElementById('gantt-container').style.display = 'block';
  renderGantt(arr);
}

function renderGantt(data) {
    const container = document.getElementById('gantt-container');
    container.innerHTML = '<h3>Timeline Visualization</h3><div id="gantt-chart"></div>';
    
    const chart = document.getElementById('gantt-chart');
    chart.style.height = '400px';
    chart.style.border = '1px solid #ccc';
    chart.style.position = 'relative';
    chart.style.overflowX = 'auto';
    
    // Найти минимальное и максимальное время
    const times = data.filter(item => item.ts).map(item => new Date(item.ts));
    if (times.length === 0) {
        chart.innerHTML = '<p>No timestamp data available</p>';
        return;
    }
    
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const totalDuration = maxTime - minTime;
    
    data.forEach((item, index) => {
        if (!item.ts) return;
        
        const startTime = new Date(item.ts);
        const position = ((startTime - minTime) / totalDuration) * 100;
        
        const bar = document.createElement('div');
        bar.style.position = 'absolute';
        bar.style.left = position + '%';
        bar.style.top = (index * 25) + 'px';
        bar.style.width = '4px';
        bar.style.height = '20px';
        bar.style.backgroundColor = getColorForLevel(item.level);
        bar.style.borderRadius = '2px';
        bar.title = `${item.level} - ${item.ts} - ${item.tf_resource || ''}`;
        
        chart.appendChild(bar);
    });
}

function getColorForLevel(level) {
    const colors = {
        'error': '#d32f2f',
        'warning': '#f57c00', 
        'info': '#388e3c',
        'debug': '#1976d2'
    };
    return colors[level] || '#666';
}

function groupBy(arr, keyFn) {
  const map = new Map();
  arr.forEach(item => {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  });
  return map;
}

function render(arr) {
  const results = document.getElementById('results');
  results.innerHTML = '';
  const groups = groupBy(arr, it => it.tf_req_id || '__no__');
  const summary = document.getElementById('summary');
  summary.innerText = `Results: ${arr.length}, groups: ${groups.size}`;

  groups.forEach((items, gid) => {
    const gdiv = document.createElement('div');
    gdiv.className = 'group';
    const h = document.createElement('h3');
    h.textContent = `tf_req_id: ${gid} (${items.length})`;
    gdiv.appendChild(h);
    items.forEach(it => {
      const line = document.createElement('div');
      line.className = 'line ' + (it.level || '');
      line.innerHTML = `<div class="meta"><small>${it.ts || ''} ${it.level || ''} ${it.tf_resource || ''}</small></div>
                        <div class="excerpt">${escapeHtml(it.text_excerpt)}</div>
                        <div class="actions">
                          <button onclick='expandJson(${it.id})'>Expand JSON</button>
                          <button onclick='markRead(${it.id})'>Mark read</button>
                        </div>`;
      gdiv.appendChild(line);
    });
    results.appendChild(gdiv);
  });
}

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '<').replace(/>/g, '>');
}

async function expandJson(id) {
  const r = await fetch('/json_bodies/' + id);
  const arr = await r.json();
  if (!arr.length) {
    const r2 = await fetch('/search?q=' + encodeURIComponent(`"id":${id}`));
    const s = await r2.json();
    const item = s.find(x => x.id === id);
    if (item) return alert(JSON.stringify(JSON.parse(item.raw_json), null, 2));
    return alert('No JSON bodies found');
  }
  let text = '';
  arr.forEach(b => {
    text += `=== ${b.body_type} ===\n` + JSON.stringify(JSON.parse(b.body_json), null, 2) + '\n\n';
  });
  alert(text);
}

async function markRead(id) {
  await fetch('/mark_read', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ids:[id]}) });
  search();
}

async function testPlugin() {
  const r = await fetch('/plugin/process', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({filter_type: 'errors_only'})
  });
  const result = await r.json();
  console.log(result);
}