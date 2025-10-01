const uploadBtn = document.getElementById('btnUpload');
const ganttBtn = document.getElementById('btnGantt');
const unreadBtn = document.getElementById('btnUnread');
const pluginBtn = document.getElementById('btnPlugins');
const sectionsBtn = document.getElementById('btnSections');
const sectionSelect = document.getElementById('section');

// Фильтры
const qInput = document.getElementById('q');
const levelSelect = document.getElementById('level');
const tf_req_idInput = document.getElementById('tf_req_id');
const tf_resourceInput = document.getElementById('tf_resource');
const ts_fromInput = document.getElementById('ts_from');
const ts_toInput = document.getElementById('ts_to');

let unreadOnly = true;
let currentPluginFilter = null;
let searchTimeout = null;
let currentResults = [];
let selectedAIModel = 'openai'; // Глобальная переменная для выбранной модели

// Автоматический поиск
[qInput, levelSelect, tf_req_idInput, tf_resourceInput, ts_fromInput, ts_toInput, sectionSelect]
    .forEach(element => {
        if (element.type === 'select-one' || element.type === 'select-multiple') {
            element.addEventListener('change', debouncedSearch);
        } else {
            element.addEventListener('input', debouncedSearch);
        }
    });

uploadBtn.onclick = async () => {
    const f = document.getElementById('file').files[0];
    if (!f) {
        showNotification('Please select a file', 'warning');
        return;
    }
    const fd = new FormData();
    fd.append('file', f);
    try {
        showNotification('Uploading logs...', 'info');
        const r = await fetch('/upload', { method: 'POST', body: fd });
        const j = await r.json();
        showNotification(`Successfully inserted: ${j.inserted} logs`, 'success');
        search();
    } catch (error) {
        showNotification('Upload failed: ' + error.message, 'danger');
    }
};

ganttBtn.onclick = () => showTimeline();
pluginBtn.onclick = () => showPluginSelector();
sectionsBtn.onclick = () => showSections();

unreadBtn.onclick = () => {
    unreadOnly = !unreadOnly;
    updateUnreadButton();
    search();
};

function updateUnreadButton() {
    if (unreadOnly) {
        unreadBtn.innerHTML = '<i class="fas fa-eye me-1" aria-hidden="true"></i> Show All';
        unreadBtn.className = 'btn btn-success me-2';
        showNotification('Showing only unread logs', 'info');
    } else {
        unreadBtn.innerHTML = '<i class="fas fa-eye-slash me-1" aria-hidden="true"></i> Show Unread Only';
        unreadBtn.className = 'btn btn-outline-secondary me-2';
    }
}

function debouncedSearch() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(search, 500);
}

async function search() {
    const params = new URLSearchParams();
    if (qInput.value) params.set('q', qInput.value);
    if (levelSelect.value) params.set('level', levelSelect.value);
    if (tf_req_idInput.value) params.set('tf_req_id', tf_req_idInput.value);
    if (tf_resourceInput.value) params.set('tf_resource', tf_resourceInput.value);
    if (ts_fromInput.value) params.set('ts_from', ts_fromInput.value);
    if (ts_toInput.value) params.set('ts_to', ts_toInput.value);
    if (sectionSelect.value) params.set('section', sectionSelect.value);
    if (unreadOnly) params.set('unread', '1');
    
    try {
        const r = await fetch('/search?' + params.toString());
        const arr = await r.json();
        document.getElementById('gantt-container').style.display = 'none';
        currentResults = arr;
        render(arr);
        updateSummary(arr);
    } catch (error) {
        showNotification('Search failed: ' + error.message, 'danger');
    }
}

function updateSummary(arr) {
    const groups = groupBy(arr, it => it.tf_req_id || '__no__');
    const summary = document.getElementById('summary');
    summary.innerHTML = `
        <i class="fas fa-chart-bar me-2" aria-hidden="true"></i>
        <strong>Results:</strong> ${arr.length} | 
        <strong>Groups:</strong> ${groups.size} | 
        <strong>Unique Requests:</strong> ${Array.from(groups.keys()).filter(k => k !== '__no__').length}
        ${unreadOnly ? ' | <span class="badge bg-warning">Unread Only</span>' : ''}
    `;
}

function showTimeline() {
    fetch('/search?limit=1000')
        .then(r => r.json())
        .then(arr => {
            document.getElementById('results').innerHTML = '';
            document.getElementById('gantt-container').style.display = 'block';
            renderGantt(arr);
            showNotification('Timeline loaded', 'success');
        })
        .catch(error => showNotification('Timeline failed: ' + error.message, 'danger'));
}

function showPluginSelector() {
    const content = `
        <div class="mb-3">
            <h5><i class="fas fa-plug me-2"></i>Выберите плагин для анализа</h5>
        </div>
        
        <div class="list-group">
            <button class="list-group-item list-group-item-action plugin-option" data-plugin="errors_only">
                <div class="d-flex justify-content-between">
                    <div>
                        <i class="fas fa-exclamation-triangle me-2 text-danger"></i>
                        <strong>Только ошибки</strong>
                    </div>
                    <span class="badge bg-danger">Error Filter</span>
                </div>
                <small class="text-muted">Фильтрует только логи с уровнем error</small>
            </button>
            
            <button class="list-group-item list-group-item-action plugin-option" data-plugin="warnings_only">
                <div class="d-flex justify-content-between">
                    <div>
                        <i class="fas fa-exclamation-circle me-2 text-warning"></i>
                        <strong>Только предупреждения</strong>
                    </div>
                    <span class="badge bg-warning text-dark">Warning Filter</span>
                </div>
                <small class="text-muted">Фильтрует только логи с уровнем warning</small>
            </button>
            
            <button class="list-group-item list-group-item-action plugin-option" data-plugin="group_by_resource">
                <div class="d-flex justify-content-between">
                    <div>
                        <i class="fas fa-layer-group me-2 text-info"></i>
                        <strong>Группировка по ресурсам</strong>
                    </div>
                    <span class="badge bg-info">Resource Group</span>
                </div>
                <small class="text-muted">Группирует логи по типам ресурсов</small>
            </button>
            
            <button class="list-group-item list-group-item-action plugin-option" data-plugin="custom">
                <div class="d-flex justify-content-between">
                    <div>
                        <i class="fas fa-cog me-2 text-secondary"></i>
                        <strong>Пользовательский фильтр</strong>
                    </div>
                    <span class="badge bg-secondary">Custom</span>
                </div>
                <small class="text-muted">Введите свой тип фильтра</small>
            </button>
        </div>
        
        <div class="mt-3">
            <input type="text" id="customPluginInput" class="form-control mb-2" placeholder="Введите тип плагина..." style="display: none;">
            <button id="applyPluginBtn" class="btn btn-success w-100" disabled>
                <i class="fas fa-play me-1"></i>Применить плагин
            </button>
        </div>
    `;
    
    createModal('AI Плагины', content);
    
    // Добавляем обработчики для выбора плагина
    document.querySelectorAll('.plugin-option').forEach(btn => {
        btn.onclick = function() {
            const pluginType = this.getAttribute('data-plugin');
            if (pluginType === 'custom') {
                document.getElementById('customPluginInput').style.display = 'block';
                document.getElementById('customPluginInput').focus();
            } else {
                applyPlugin(pluginType);
            }
        };
    });
    
    // Обработчик для пользовательского плагина
    const customInput = document.getElementById('customPluginInput');
    const applyBtn = document.getElementById('applyPluginBtn');
    
    customInput.oninput = function() {
        applyBtn.disabled = this.value.trim() === '';
    };
    
    applyBtn.onclick = function() {
        const customValue = customInput.value.trim();
        if (customValue) {
            applyPlugin(customValue);
        }
    };
}

// Функция применения плагина
function applyPlugin(pluginType) {
    currentPluginFilter = pluginType;
    applyPluginFilter();
}

async function applyPluginFilter() {
    if (!currentPluginFilter) return;
    
    try {
        showNotification('Processing with plugin...', 'info');
        const r = await fetch('/plugin/process', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                filter_type: currentPluginFilter,
                search_query: qInput.value
            })
        });
        
        const result = await r.json();
        showNotification(result.summary, 'info');
        
        const searchR = await fetch('/search?limit=1000');
        const arr = await searchR.json();
        document.getElementById('gantt-container').style.display = 'none';
        currentResults = arr;
        render(arr);
        updateSummary(arr);
    } catch (error) {
        showNotification('Plugin failed: ' + error.message, 'danger');
    }
}

async function showSections() {
    try {
        showNotification('Loading sections...', 'info');
        const r = await fetch('/sections');
        const sections = await r.json();
        
        let html = '<div class="card"><div class="card-header"><h5 class="mb-0">Sections Summary</h5></div><div class="card-body">';
        html += '<table class="table table-hover"><thead><tr><th>Section</th><th>Count</th><th>Start Time</th><th>End Time</th></tr></thead><tbody>';
        
        sections.forEach(s => {
            html += `<tr>
                <td><span class="badge bg-${getSectionBadgeColor(s.section)}">${s.section}</span></td>
                <td><span class="badge bg-secondary">${s.count}</span></td>
                <td>${s.start_time || 'N/A'}</td>
                <td>${s.end_time || 'N/A'}</td>
            </tr>`;
        });
        
        html += '</tbody></table></div></div>';
        document.getElementById('results').innerHTML = html;
        showNotification(`Loaded ${sections.length} sections`, 'success');
    } catch (error) {
        showNotification('Sections failed: ' + error.message, 'danger');
    }
}

function getSectionBadgeColor(section) {
    const colors = {
        'plan': 'primary',
        'apply': 'success',
        'start': 'warning text-dark',
        'end': 'info',
        'refresh': 'secondary'
    };
    return colors[section] || 'dark';
}

function showNotification(message, type) {
    const container = document.getElementById('notifications-container');
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show mb-2`;
    alert.style.minWidth = '300px';
    alert.style.maxWidth = '400px';
    alert.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : type === 'danger' ? 'exclamation-circle' : 'info-circle'} me-2" aria-hidden="true"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" style="position: absolute; right: 10px; top: 10px;" aria-label="Close"></button>
    `;
    
    container.appendChild(alert);
    
    setTimeout(() => {
        if (alert.parentNode) {
            const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
            bsAlert.close();
        }
    }, 3000);
    
    alert.querySelector('.btn-close').onclick = () => {
        const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
        bsAlert.close();
    };
}

// Функция загрузки доступных моделей
async function loadAImodels() {
    try {
        const r = await fetch('/ai/models');
        const models = await r.json();
        
        // Создаем селектор моделей
        const modelSelector = document.createElement('select');
        modelSelector.id = 'aiModelSelector';
        modelSelector.className = 'form-select form-select-sm me-2';
        modelSelector.style.width = 'auto';
        
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = `${model.name} ${model.available ? '' : '(API key required)'}`;
            option.disabled = !model.available;
            modelSelector.appendChild(option);
        });
        
        // Устанавливаем обработчик изменения
        modelSelector.onchange = function() {
            selectedAIModel = this.value;
            showNotification(`Selected AI model: ${this.options[this.selectedIndex].text}`, 'info');
        };
        
        // Вставляем селектор перед кнопкой AI
        const buttonRow = document.querySelector('.col-12');
        if (buttonRow) {
            buttonRow.insertBefore(modelSelector, document.getElementById('btnAI'));
        }
        
    } catch (error) {
        console.error('Error loading AI models:', error);
    }
}

// Обновляем функцию анализа с выбором модели
async function analyzeWithAI() {
    try {
        showNotification(`AI анализ логов (${selectedAIModel})...`, 'info');
        
        // Получаем текущие логи с учетом фильтров
        const q = qInput.value;
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        params.set('limit', '100');
        params.set('model', selectedAIModel); // Передаем выбранную модель
        
        const r = await fetch(`/ai/analyze?${params.toString()}`);
        const analysis = await r.json();
        
        // Создаем модальное окно как в expandJson
        const content = `
            <div class="mb-3">
                <h5><i class="fas fa-robot me-2"></i>AI Анализ логов</h5>
                <div class="alert alert-info">
                    <i class="fas fa-microchip me-2"></i>
                    Использована модель: <strong>${analysis.ai_model || selectedAIModel}</strong>
                    ${analysis.confidence ? `<span class="badge bg-primary ms-2">Уверенность: ${(analysis.confidence * 100).toFixed(1)}%</span>` : ''}
                </div>
            </div>
            
            <div class="mb-3">
                <strong>Резюме:</strong>
                <p class="bg-light p-2 rounded">${analysis.summary || 'Нет резюме'}</p>
            </div>
            
            <div class="mb-3">
                <strong>Найденные проблемы:</strong>
                <ul class="list-group">
                    ${(analysis.issues || []).map(issue => `
                        <li class="list-group-item">
                            <span class="badge bg-${issue.severity === 'высокий' ? 'danger' : issue.severity === 'средний' ? 'warning' : 'secondary'} me-2">${issue.severity}</span>
                            ${issue.type} (${issue.count})
                        </li>
                    `).join('')}
                </ul>
            </div>
            
            <div class="mb-3">
                <strong>Рекомендации:</strong>
                <ul class="list-group">
                    ${(analysis.recommendations || []).map(rec => `
                        <li class="list-group-item">
                            <i class="fas fa-lightbulb me-2 text-primary"></i>
                            ${rec}
                        </li>
                    `).join('')}
                </ul>
            </div>
            
            <div class="mb-3">
                <strong>Распределение по уровням:</strong>
                <pre class="bg-light p-2 rounded">${JSON.stringify(analysis.severity_distribution || {}, null, 2)}</pre>
            </div>
            
            ${analysis.raw_response ? `
                <div>
                    <strong>Полный ответ ИИ:</strong>
                    <pre class="bg-light p-2 rounded" style="max-height: 200px; overflow-y: auto;">${analysis.raw_response}</pre>
                </div>
            ` : ''}
        `;
        
        createModal('AI Анализ Terraform Логов', content);
        showNotification(`AI анализ завершен (${analysis.ai_model || selectedAIModel})`, 'success');
        
    } catch (error) {
        showNotification('Ошибка AI анализа: ' + error.message, 'danger');
    }
}

function showAINotification(analysis) {
    const container = document.getElementById('notifications-container');
    
    const alert = document.createElement('div');
    alert.className = 'alert alert-info alert-dismissible fade show mb-2';
    alert.style.minWidth = '400px';
    alert.style.maxWidth = '500px';
    alert.innerHTML = `
        <div>
            <h6><i class="fas fa-robot me-2" aria-hidden="true"></i>AI Analysis</h6>
            <p><strong>Summary:</strong> ${analysis.summary || 'No summary'}</p>
            <p><strong>Issues Found:</strong> ${analysis.issues?.length || 0}</p>
            ${analysis.recommendations ? `
                <p><strong>Recommendations:</strong></p>
                <ul class="mb-0">
                    ${analysis.recommendations.slice(0, 3).map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            ` : ''}
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="alert" style="position: absolute; right: 10px; top: 10px;" aria-label="Close"></button>
    `;
    
    container.appendChild(alert);
    
    setTimeout(() => {
        if (alert.parentNode) {
            const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
            bsAlert.close();
        }
    }, 10000);
    
    alert.querySelector('.btn-close').onclick = () => {
        const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
        bsAlert.close();
    };
}

// Функция для получения рекомендаций по конкретной ошибке
async function getAIRecommendations(errorText) {
    try {
        const r = await fetch('/ai/recommend', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({error_text: errorText})
        });
        const response = await r.json();
        return response.recommendations || [];
    } catch (error) {
        console.error('AI recommendations error:', error);
        return [];
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

// Состояние групп
window.groupStates = {};

function toggleGroup(groupId) {
    window.groupStates[groupId] = !window.groupStates[groupId];
    const groupElement = document.querySelector(`[data-group-id="${groupId}"]`);
    if (groupElement) {
        const body = groupElement.querySelector('.group-body');
        const toggleButton = groupElement.querySelector('.toggle-btn');
        
        if (body && toggleButton) {
            const isExpanded = window.groupStates[groupId];
            body.className = isExpanded ? 'group-body card-body p-0' : 'group-body card-body p-0 d-none';
            toggleButton.innerHTML = `<i class="fas fa-${isExpanded ? 'minus' : 'plus'}" aria-hidden="true"></i>`;
            toggleButton.setAttribute('aria-label', `${isExpanded ? 'Collapse' : 'Expand'} group ${groupId}`);
        }
    }
}

function expandAllGroups() {
    const groups = groupBy(currentResults, it => it.tf_req_id || '__no__');
    groups.forEach((_, key) => window.groupStates[key] = true);
    render(currentResults);
}

function collapseAllGroups() {
    const groups = groupBy(currentResults, it => it.tf_req_id || '__no__');
    groups.forEach((_, key) => window.groupStates[key] = false);
    render(currentResults);
}

function render(arr) {
    currentResults = arr;
    const results = document.getElementById('results');
    results.innerHTML = '';
    
    // Кнопки Expand/Collapse All
    const controls = document.createElement('div');
    controls.className = 'mb-3 d-flex justify-content-end';
    controls.innerHTML = `
        <button class="btn btn-sm btn-outline-primary me-2" onclick="expandAllGroups()" aria-label="Expand all groups">
            <i class="fas fa-expand me-1" aria-hidden="true"></i>Expand All
        </button>
        <button class="btn btn-sm btn-outline-secondary" onclick="collapseAllGroups()" aria-label="Collapse all groups">
            <i class="fas fa-compress me-1" aria-hidden="true"></i>Collapse All
        </button>
    `;
    results.appendChild(controls);
    
    const groups = groupBy(arr, it => it.tf_req_id || '__no__');
    updateSummary(arr);

    groups.forEach((items, gid) => {
        const isExpanded = window.groupStates[gid] !== false;
        
        const gdiv = document.createElement('div');
        gdiv.className = 'card mb-3 shadow-sm';
        gdiv.setAttribute('data-group-id', gid);
        
        const header = document.createElement('div');
        header.className = 'card-header bg-light';
        header.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <div class="d-flex align-items-center">
                    <button class="btn btn-sm btn-outline-secondary me-2 toggle-btn" onclick="toggleGroup('${gid}')" aria-label="${isExpanded ? 'Collapse' : 'Expand'} group ${gid}">
                        <i class="fas fa-${isExpanded ? 'minus' : 'plus'}" aria-hidden="true"></i>
                    </button>
                    <h6 class="mb-0">
                        <i class="fas fa-link me-1" aria-hidden="true"></i>
                        Request ID: <code>${gid}</code> (${items.length} logs)
                    </h6>
                </div>
                <span class="badge bg-primary">${gid === '__no__' ? 'No Request ID' : 'Grouped'}</span>
            </div>
        `;
        gdiv.appendChild(header);
        
        const body = document.createElement('div');
        body.className = `group-body card-body p-0 ${isExpanded ? '' : 'd-none'}`;
        
        items.forEach(it => {
            const line = document.createElement('div');
            const isRead = it.read_flag === 1;
            line.className = `p-3 border-bottom ${getLogLevelClass(it.level)} ${isRead ? 'bg-light opacity-75' : ''}`;
            line.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <small class="text-muted">
                        <i class="fas fa-clock me-1" aria-hidden="true"></i>${it.ts || 'No time'} 
                        <i class="fas fa-layer-group ms-2 me-1" aria-hidden="true"></i>${it.tf_resource || 'No resource'}
                    </small>
                    <div>
                        <span class="badge bg-${getLogLevelBadgeColor(it.level)}">${it.level || 'unknown'}</span>
                        <span class="badge bg-info ms-1">${it.section || 'no-section'}</span>
                        ${isRead ? '<span class="badge bg-success ms-1"><i class="fas fa-check me-1" aria-hidden="true"></i>Read</span>' : '<span class="badge bg-warning ms-1"><i class="fas fa-eye-slash me-1" aria-hidden="true"></i>Unread</span>'}
                    </div>
                </div>
                <div class="excerpt mb-2">${escapeHtml(it.text_excerpt)}</div>
                <div class="actions">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick='expandJson(${it.id})' aria-label="Expand JSON for log ${it.id}">
                        <i class="fas fa-expand me-1" aria-hidden="true"></i>Expand JSON
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick='toggleRead(${it.id})' aria-label="${isRead ? 'Mark as unread' : 'Mark as read'}">
                        <i class="fas fa-${isRead ? 'eye-slash' : 'check'} me-1" aria-hidden="true"></i>${isRead ? 'Mark Unread' : 'Mark Read'}
                    </button>
                </div>
            `;
            body.appendChild(line);
        });
        
        gdiv.appendChild(body);
        results.appendChild(gdiv);
    });
}

function getLogLevelClass(level) {
    const classes = {
        'error': 'border-start border-4 border-danger',
        'warning': 'border-start border-4 border-warning',
        'info': 'border-start border-4 border-info',
        'debug': 'border-start border-4 border-secondary'
    };
    return classes[level] || 'border-start border-4 border-light';
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

function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '<').replace(/>/g, '>');
}

async function expandJson(id) {
    try {
        showNotification('Loading JSON...', 'info');
        const r = await fetch('/json_bodies/' + id);
        const arr = await r.json();
        
        if (!arr.length) {
            // Ищем в текущих результатах
            const currentLog = currentResults.find(log => log.id === id);
            if (currentLog) {
                const modal = createModal('JSON Content', 
                    `<pre class="bg-light p-3 rounded" style="max-height: 400px; overflow-y: auto;">${JSON.stringify(JSON.parse(currentLog.raw_json), null, 2)}</pre>`
                );
                showNotification('JSON loaded successfully', 'success');
                return;
            }
            showNotification('No JSON bodies found', 'warning');
            return;
        }
        
        let text = '';
        arr.forEach(b => {
            text += `=== ${b.body_type} ===\n` + JSON.stringify(JSON.parse(b.body_json), null, 2) + '\n\n';
        });
        
        const modal = createModal('JSON Bodies', 
            `<pre class="bg-light p-3 rounded" style="max-height: 400px; overflow-y: auto;">${text}</pre>`
        );
        showNotification(`Loaded ${arr.length} JSON bodies`, 'success');
    } catch (error) {
        showNotification('Error expanding JSON: ' + error.message, 'danger');
    }
}

function createModal(title, content) {
    const modalHtml = `
        <div class="modal fade" id="aiModal" tabindex="-1" aria-labelledby="aiModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="aiModalLabel">${title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        ${content}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Закрыть</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalElement = document.getElementById('aiModal');
    const modalInstance = new bootstrap.Modal(modalElement);
    modalInstance.show();
    modalElement.addEventListener('hidden.bs.modal', () => {
        modalElement.remove();
    });
    return modalInstance;
}

async function toggleRead(id) {
    try {
        const currentLog = currentResults.find(log => log.id === id);
        if (!currentLog) return;
        
        const newReadStatus = currentLog.read_flag === 1 ? 0 : 1;
        
        await fetch('/mark_read', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ids:[id]}) 
        });
        
        const action = newReadStatus === 1 ? 'marked as read' : 'marked as unread';
        showNotification(`Log ${action}`, 'success');
        currentLog.read_flag = newReadStatus;
        render(currentResults);
    } catch (error) {
        showNotification('Toggle read failed: ' + error.message, 'danger');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.groupStates = {};
    updateUnreadButton();
    search();

    loadAImodels();
});

document.addEventListener('DOMContentLoaded', function() {
    // Инициализируем состояние групп
    window.groupStates = {};
    updateUnreadButton();
    search();
    
    // Добавляем кнопку ИИ к другим кнопкам
    const aiBtn = document.createElement('button');
    aiBtn.id = 'btnAI';
    aiBtn.className = 'btn btn-ai me-2'; // Новый класс для ИИ кнопки
    aiBtn.innerHTML = '<i class="fas fa-robot me-1" aria-hidden="true"></i>AI Analysis';
    aiBtn.onclick = () => analyzeWithAI();
    aiBtn.setAttribute('aria-label', 'Запустить AI анализ логов');
    
    // Вставляем перед первой кнопкой
    const buttonRow = document.querySelector('.col-12');
    if (buttonRow) {
        buttonRow.insertBefore(aiBtn, buttonRow.firstChild);
    }
});