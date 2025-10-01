function renderGantt(data) {
    const container = document.getElementById('gantt-container');
    container.innerHTML = '<h3>Timeline Visualization</h3><div id="gantt-chart"></div>';
    
    // ? переделать
    const chart = document.getElementById('gantt-chart');
    chart.style.height = '400px';
    chart.style.border = '1px solid #ccc';
    chart.style.position = 'relative';
    chart.style.overflowX = 'auto';
    
    // Найти минимальное и максимальное время
    const times = data.filter(item => item.ts).map(item => new Date(item.ts));
    if (times.length === 0) return;
    
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
        bar.title = `${item.level} - ${item.ts}`;
        
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