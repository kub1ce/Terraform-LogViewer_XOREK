function renderGantt(data) {
    const container = document.getElementById('gantt-container');
    container.innerHTML = `
        <h3>Timeline Visualization</h3>
        <div id="gantt-header" style="display:flex; height:30px; margin-bottom:5px;">
            <div style="width:200px;">Request ID</div>
            <div style="flex:1; position:relative;">Timeline</div>
        </div>
        <div id="gantt-chart" style="height:400px; overflow-y:auto; border:1px solid #ccc; position:relative;"></div>
    `;
    
    const chart = document.getElementById('gantt-chart');
    chart.innerHTML = '';
    
    // Группируем по tf_req_id
    const groups = groupBy(data, item => item.tf_req_id || 'unknown');
    
    let row = 0;
    groups.forEach((items, reqId) => {
        if (!items[0].ts) return; // Пропускаем без времени
        
        // Найти начало и конец для этой группы
        const times = items.filter(i => i.ts).map(i => new Date(i.ts));
        if (times.length === 0) return;
        
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        
        // Создаем строку для группы
        const groupDiv = document.createElement('div');
        groupDiv.style.cssText = `
            display:flex; 
            height:40px; 
            border-bottom:1px solid #eee; 
            align-items:center;
            margin-bottom:2px;
        `;
        
        const idDiv = document.createElement('div');
        idDiv.style.cssText = 'width:200px; padding:5px; font-size:12px;';
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
            const width = 2; // ширина бара в %
            
            const bar = document.createElement('div');
            bar.style.cssText = `
                position:absolute;
                left:${position}%;
                top:10px;
                width:${width}px;
                height:20px;
                background-color:${getColorForLevel(item.level)};
                border-radius:2px;
                cursor:pointer;
            `;
            bar.title = `${item.level} - ${item.ts} - ${item.text_excerpt?.substring(0, 50) || ''}`;
            bar.onclick = () => showLogDetails(item);
            
            timelineDiv.appendChild(bar);
        });
        
        groupDiv.appendChild(idDiv);
        groupDiv.appendChild(timelineDiv);
        chart.appendChild(groupDiv);
        
        row++;
    });
}

function showLogDetails(log) {
    const details = `
ID: ${log.id}
Level: ${log.level}
Time: ${log.ts}
Request: ${log.tf_req_id}
Resource: ${log.tf_resource}
Text: ${log.text_excerpt}
    `;
    alert(details);
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