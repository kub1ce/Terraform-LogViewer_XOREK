function renderGantt(data) {
    const container = document.getElementById('gantt-container');
    container.innerHTML = '<h3>Timeline Visualization</h3><div id="gantt-chart"></div>';
    
    const chart = document.getElementById('gantt-chart');
    chart.style.height = '600px';
    chart.style.border = '1px solid #ccc';
    chart.style.position = 'relative';
    chart.style.overflowX = 'auto';
    chart.style.overflowY = 'auto';
    
    // Группируем по tf_req_id
    const groups = groupBy(data, item => item.tf_req_id || 'unknown');
    
    let row = 0;
    groups.forEach((items, reqId) => {
        if (!items[0].ts) return;
        
        // Найти начало и конец для этой группы
        const times = items.filter(i => i.ts).map(i => new Date(i.ts));
        if (times.length === 0) return;
        
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        
        // Создаем строку для группы
        const groupDiv = document.createElement('div');
        groupDiv.style.cssText = `
            display:flex; 
            height:60px; 
            border-bottom:1px solid #eee; 
            align-items:center;
            margin-bottom:2px;
            position:relative;
        `;
        
        const idDiv = document.createElement('div');
        idDiv.style.cssText = 'width:250px; padding:5px; font-size:12px; font-weight:bold; color:#333;';
        idDiv.textContent = reqId;
        
        const timelineDiv = document.createElement('div');
        timelineDiv.style.cssText = 'flex:1; position:relative; height:100%;';
        
        // Рассчитываем временные метки
        const allTimes = data.filter(i => i.ts).map(i => new Date(i.ts));
        const globalMin = Math.min(...allTimes);
        const globalMax = Math.max(...allTimes);
        const totalDuration = globalMax - globalMin;
        
        // Добавляем элементы для каждого лога в группе
        items.forEach(item => {
            if (!item.ts) return;
            
            const startTime = new Date(item.ts);
            const position = ((startTime - globalMin) / totalDuration) * 100;
            const width = 3; // ширина бара в %
            
            const bar = document.createElement('div');
            bar.style.cssText = `
                position:absolute;
                left:${position}%;
                top:20px;
                width:${width}px;
                height:20px;
                background-color:${getColorForLevel(item.level)};
                border-radius:2px;
                cursor:pointer;
                transition: all 0.2s;
                opacity: ${item.read_flag === 1 ? '0.5' : '1'};
            `;
            bar.title = `${item.level} - ${item.ts} - ${item.text_excerpt?.substring(0, 30) || ''}...`;
            
            // Добавляем обработчик клика - показываем все данные
            bar.onclick = () => showLogDetailsModal(item);
            
            bar.onmouseover = () => {
                bar.style.transform = 'scale(1.5)';
                bar.style.zIndex = '10';
            };
            
            bar.onmouseout = () => {
                bar.style.transform = 'scale(1)';
                bar.style.zIndex = '1';
            };
            
            timelineDiv.appendChild(bar);
        });
        
        groupDiv.appendChild(idDiv);
        groupDiv.appendChild(timelineDiv);
        chart.appendChild(groupDiv);
        
        row++;
    });
}

// Функция показа всех деталей лога - сразу с JSON и всеми данными
function showLogDetailsModal(log) {
    const content = `
        <div class="mb-3">
            <h5><i class="fas fa-info-circle me-2"></i>Детали лога</h5>
        </div>
        
        <div class="row mb-3">
            <div class="col-md-3">
                <strong>ID:</strong> <code>${log.id}</code>
            </div>
            <div class="col-md-3">
                <strong>Уровень:</strong> 
                <span class="badge bg-${getLogLevelBadgeColor(log.level)}">${log.level || 'unknown'}</span>
            </div>
            <div class="col-md-3">
                <strong>Время:</strong> ${log.ts || 'N/A'}
            </div>
            <div class="col-md-3">
                <strong>Секция:</strong> 
                <span class="badge bg-info">${log.section || 'no-section'}</span>
            </div>
        </div>
        
        <div class="row mb-3">
            <div class="col-md-6">
                <strong>Request ID:</strong> <code>${log.tf_req_id || 'N/A'}</code>
            </div>
            <div class="col-md-6">
                <strong>Ресурс:</strong> ${log.tf_resource || 'N/A'}
            </div>
        </div>
        
        <div class="mb-3">
            <strong>Текст лога:</strong>
            <pre class="bg-light p-2 rounded" style="max-height: 150px; overflow-y: auto; white-space: pre-wrap;">${log.text_excerpt || 'N/A'}</pre>
        </div>
        
        <div class="mb-3">
            <strong>Полный JSON:</strong>
            <pre class="bg-light p-3 rounded" style="max-height: 300px; overflow-y: auto; font-size: 0.8em;">${JSON.stringify(log, null, 2)}</pre>
        </div>
        
        <div class="mb-3">
            <strong>JSON тела (если есть):</strong>
            <div id="jsonBodiesContainer"></div>
        </div>
        
        <div class="d-flex justify-content-between">
            <button class="btn btn-${log.read_flag === 1 ? 'secondary' : 'success'}" 
                    onclick='toggleReadFromGantt(${log.id}, this)'>
                <i class="fas fa-${log.read_flag === 1 ? 'eye-slash' : 'check'} me-1"></i>
                ${log.read_flag === 1 ? 'Mark Unread' : 'Mark Read'}
            </button>
        </div>
    `;
    
    const modal = createModal('Детали лога', content);
    
    // Загружаем JSON тела если есть
    loadJsonBodiesForLog(log.id, 'jsonBodiesContainer');
}

// Функция загрузки JSON тел для лога
function loadJsonBodiesForLog(logId, containerId) {
    fetch(`/json_bodies/${logId}`)
        .then(response => response.json())
        .then(bodies => {
            const container = document.getElementById(containerId);
            if (bodies.length > 0) {
                let bodiesHtml = '';
                bodies.forEach(body => {
                    bodiesHtml += `
                        <div class="card mb-2">
                            <div class="card-header">
                                <strong>${body.body_type}</strong>
                            </div>
                            <div class="card-body">
                                <pre class="bg-light p-2 rounded" style="max-height: 200px; overflow-y: auto; font-size: 0.8em;">${JSON.stringify(JSON.parse(body.body_json), null, 2)}</pre>
                            </div>
                        </div>
                    `;
                });
                container.innerHTML = bodiesHtml;
            } else {
                container.innerHTML = '<p class="text-muted">JSON тела отсутствуют</p>';
            }
        })
        .catch(error => {
            console.error('Error loading JSON bodies:', error);
            const container = document.getElementById(containerId);
            container.innerHTML = '<p class="text-danger">Ошибка загрузки JSON тел</p>';
        });
}

function toggleReadFromGantt(id, button) {
    const currentLog = currentResults.find(log => log.id === id);
    if (!currentLog) return;
    
    const newReadStatus = currentLog.read_flag === 1 ? 0 : 1;
    
    fetch('/mark_read', { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'}, 
        body: JSON.stringify({ids:[id]}) 
    })
    .then(response => response.json())
    .then(result => {
        currentLog.read_flag = newReadStatus;
        
        button.className = `btn btn-${newReadStatus === 1 ? 'secondary' : 'success'}`;
        button.innerHTML = `<i class="fas fa-${newReadStatus === 1 ? 'eye-slash' : 'check'} me-1"></i>${newReadStatus === 1 ? 'Mark Unread' : 'Mark Read'}`;
        
        const action = newReadStatus === 1 ? 'marked as read' : 'marked as unread';
        showNotification(`Log ${action}`, 'success');
        
        if (document.getElementById('gantt-container').style.display !== 'none') {
            showTimeline();
        }
    })
    .catch(error => {
        showNotification('Toggle read failed: ' + error.message, 'danger');
    });
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

function getColorForLevel(level) {
    const colors = {
        'error': '#d32f2f',
        'warning': '#f57c00', 
        'info': '#388e3c',
        'debug': '#1976d2'
    };
    return colors[level] || '#666';
}

function getLogLevelBadgeColor(level) {
    const colors = {
        'error': 'danger',
        'warning': 'warning text-dark',
        'info': 'info',
        'debug': 'secondary'
    };
    return colors[level] || 'dark';
}