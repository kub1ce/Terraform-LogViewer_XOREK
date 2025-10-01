const uploadBtn = document.getElementById('btnUpload');
const searchBtn = document.getElementById('btnSearch');
const unreadBtn = document.getElementById('btnUnread');
const ganttBtn = document.getElementById('btnGantt');
const pluginBtn = document.getElementById('btnPlugins');
let unreadOnly = false;
let currentPluginFilter = null;

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
pluginBtn.onclick = () => testPlugin();
unreadBtn.onclick = () => { unreadOnly = !unreadOnly; search(); }

async function search() {
  const q = document.getElementById('q').value;
  const level = document.getElementById('level').value;
  const tf_req_id = document.getElementById('tf_req_id').value;
  const tf_resource = document.getElementById('tf_resource').value;
  const ts_from = document.getElementById('ts_from').value;
  const ts_to = document.getElementById('ts_to').value;
  
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (level) params.set('level', level);
  if (tf_req_id) params.set('tf_req_id', tf_req_id);
  if (tf_resource) params.set('tf_resource', tf_resource);
  if (ts_from) params.set('ts_from', ts_from);
  if (ts_to) params.set('ts_to', ts_to);
  if (unreadOnly) params.set('unread', '1');
  
  const r = await fetch('/search?' + params.toString());
  const arr = await r.json();
  document.getElementById('gantt-container').style.display = 'none';
  render(arr);
}

async function showTimeline() {
  const params = new URLSearchParams();
  params.set('limit', '1000');
  
  const r = await fetch('/search?' + params.toString());
  const arr = await r.json();
  document.getElementById('results').innerHTML = '';
  document.getElementById('gantt-container').style.display = 'block';
  renderGantt(arr);
}

async function testPlugin() {
  try {
    const r = await fetch('/plugin/process', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        filter_type: 'errors_only',
        search_query: ''
      })
    });
    const result = await r.json();
    alert(`Plugin result: ${result.summary}`);
  } catch (error) {
    alert('Plugin error: ' + error.message);
  }
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

pluginBtn.onclick = () => showPluginSelector();

// Функция выбора плагина
function showPluginSelector() {
    const pluginType = prompt("Choose plugin:\n1. errors_only\n2. warnings_only\n3. group_by_resource\n\nEnter number or type:", "1");
    
    let filterType = "default";
    switch(pluginType) {
        case "1": filterType = "errors_only"; break;
        case "2": filterType = "warnings_only"; break;
        case "3": filterType = "group_by_resource"; break;
        default: filterType = pluginType;
    }
    
    currentPluginFilter = filterType;
    applyPluginFilter();
}

// Применить фильтр плагина
async function applyPluginFilter() {
    if (!currentPluginFilter) return;
    
    const r = await fetch('/plugin/process', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            filter_type: currentPluginFilter,
            search_query: document.getElementById('q').value
        })
    });
    
    const result = await r.json();
    alert(result.summary);
    
    // Показать результаты с учетом фильтра
    const params = new URLSearchParams();
    params.set('limit', '1000');
    
    // Если фильтр по ошибкам - ищем только ошибки
    if (currentPluginFilter === 'errors_only') {
        params.set('level', 'error');
    } else if (currentPluginFilter === 'warnings_only') {
        params.set('level', 'warning');
    }
    
    const searchR = await fetch('/search?' + params.toString());
    const arr = await searchR.json();
    document.getElementById('gantt-container').style.display = 'none';
    render(arr);
}

const sectionsBtn = document.createElement('button');
sectionsBtn.id = 'btnSections';
sectionsBtn.textContent = 'Show Sections';
sectionsBtn.onclick = showSections;
document.querySelector('.filters').appendChild(sectionsBtn);

async function showSections() {
    const r = await fetch('/sections');
    const sections = await r.json();
    
    let html = '<h3>Sections Summary</h3><table border="1" style="width:100%; border-collapse: collapse;">';
    html += '<tr><th>Section</th><th>Count</th><th>Start Time</th><th>End Time</th></tr>';
    
    sections.forEach(s => {
        html += `<tr>
            <td>${s.section}</td>
            <td>${s.count}</td>
            <td>${s.start_time}</td>
            <td>${s.end_time}</td>
        </tr>`;
    });
    
    html += '</table>';
    document.getElementById('results').innerHTML = html;
}