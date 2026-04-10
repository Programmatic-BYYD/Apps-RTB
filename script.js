const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS8XqGItjuzPfwUUWRpp0sMAJtaggktH_HFu8ETpfhPGvn4OIkBsHphgrX4nVh79A/pub?gid=131548543&single=true&output=csv';

let fullDatabase = [];
let filteredApps = [];
let excelBundles = []; 

let selectedAges = new Set();
let selectedGlobalTags = new Set();
let rowCatSelections = {}; 
let rowTagSelections = {}; 

async function init() {
    try {
        const response = await fetch(SHEET_CSV_URL);
        const csvData = await response.text();
        fullDatabase = parseCSV(csvData);
        
        document.getElementById('db-total').innerText = fullDatabase.length;
        
        populateAgeFilters();
        populateGlobalTags();
        addFilterRow(); 
        
        renderTable([]); 

        document.getElementById('excel-upload').addEventListener('change', handleExcelUpload);

        window.addEventListener('click', (e) => {
            if (!e.target.closest('.custom-multiselect')) {
                document.querySelectorAll('.options-container').forEach(el => el.classList.add('hidden'));
            }
        });
    } catch (e) {
        console.error("Initialization error:", e);
    }
}

window.addEventListener('DOMContentLoaded', init);

function parseCSV(csv) {
    const lines = csv.split(/\r?\n/).filter(l => l.trim() !== "");
    return lines.slice(1).map(line => {
        const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/"/g, '').trim());
        return {
            name: cols[0] || "",
            bundle: cols[1] || "",
            os: (cols[2] || "").toLowerCase(), 
            link: cols[3] || "",
            cat_ru: cols[5] || "", 
            tags: [cols[6], cols[7], cols[8]].filter(t => t && t.length > 0),
            age: (cols[9] || "").toString().trim(),
            downloads: parseInt(cols[10]?.toString().replace(/[^\d]/g, '')) || 0
        };
    }).filter(a => a.name);
}

// --- ГЛАВНАЯ ЛОГИКА ФИЛЬТРАЦИИ ---

window.generateSelection = function() {
    const search = document.getElementById('global-search').value.toLowerCase().trim();
    const osFilter = document.querySelector('input[name="os"]:checked').value.toLowerCase();
    const minDL = parseInt(document.getElementById('min-dl').value) || 0;
    const limitInput = document.getElementById('total-qty').value;
    const totalQty = limitInput ? parseInt(limitInput) : Infinity;

    let results = [];

    if (excelBundles.length > 0) {
        results = excelBundles.map(inputBundle => {
            const found = fullDatabase.find(app => app.bundle.toLowerCase() === inputBundle.toLowerCase());
            return found ? { ...found, status: 'found' } : { 
                bundle: inputBundle, name: "Нет в базе", cat_ru: "-", os: "-", age: "-", downloads: 0, status: 'missing', tags: [] 
            };
        });
    } else {
        results = fullDatabase.filter(app => {
            // 1. Поиск
            const allAppTags = app.tags.join(" ").toLowerCase();
            const mSearch = !search || 
                app.name.toLowerCase().includes(search) || 
                app.bundle.toLowerCase().includes(search) || 
                app.cat_ru.toLowerCase().includes(search) ||
                allAppTags.includes(search);

            // 2. Платформа (ОС)
            let mOS = (osFilter === 'all');
            if (!mOS) {
                if (osFilter === 'phone') { // iOS
                    mOS = (app.os === 'iphone' || app.os === 'ios' || app.os === 'phone');
                } else if (osFilter === 'android') {
                    mOS = (app.os === 'android');
                }
            }

            // 3. Загрузки
            const mDL = app.downloads >= minDL;

            // 4. Возраст (Глобальный)
            const mAge = selectedAges.size === 0 || selectedAges.has(app.age);

            // 5. Теги (Глобальные)
            const mGlobalTag = selectedGlobalTags.size === 0 || app.tags.some(t => selectedGlobalTags.has(t));

            // 6. Конструктор сегментов (Карточки)
            let mSegment = true;
            const activeRows = Object.keys(rowCatSelections);
            if (activeRows.length > 0) {
                // Если добавлены карточки, приложение должно подходить хотя бы под ОДНУ из них (логика ИЛИ)
                mSegment = activeRows.some(rowId => {
                    const cats = rowCatSelections[rowId];
                    const tags = rowTagSelections[rowId];
                    
                    // Если карточка пустая, считаем что она не фильтрует
                    if (cats.size === 0 && tags.size === 0) return true;

                    const matchCat = cats.size === 0 || cats.has(app.cat_ru);
                    const matchTag = tags.size === 0 || app.tags.some(t => tags.has(t));
                    
                    // Внутри карточки логика И
                    return matchCat && matchTag;
                });
            }

            return mSearch && mOS && mDL && mAge && mGlobalTag && mSegment;
        });

        results.sort((a, b) => b.downloads - a.downloads);
    }

    filteredApps = results.slice(0, totalQty);
    renderTable(filteredApps, true);
};

// --- ФУНКЦИИ ВЫБОРА (ГЛОБАЛЬНЫЕ) ---

window.toggleAgeSelection = function(val, cb) {
    cb.checked ? selectedAges.add(val) : selectedAges.delete(val);
    updatePlaceholderText('age-multiselect', selectedAges, "Возраст");
};

window.toggleGlobalTag = function(val, cb) {
    cb.checked ? selectedGlobalTags.add(val) : selectedGlobalTags.delete(val);
    updatePlaceholderText('global-tags-multiselect', selectedGlobalTags, "Теги");
};

// --- КАРТОЧКИ СЕГМЕНТОВ ---

window.addFilterRow = function() {
    const container = document.getElementById('filter-rows-container');
    const rowId = 'row-' + Date.now();
    const categories = [...new Set(fullDatabase.map(a => a.cat_ru))].filter(Boolean).sort();
    
    rowCatSelections[rowId] = new Set();
    rowTagSelections[rowId] = new Set();

    const row = document.createElement('div');
    row.className = 'filter-card';
    row.id = rowId;
    row.innerHTML = `
        <button class="btn-remove-row" onclick="delete rowCatSelections['${rowId}']; delete rowTagSelections['${rowId}']; document.getElementById('${rowId}').remove()">×</button>
        <div class="custom-multiselect" id="${rowId}-cat-ms">
            <div class="select-box" onclick="toggleMultiselect('${rowId}-cat-opts', event)">
                <span class="placeholder">Выберите категории...</span>
                <span class="arrow">▼</span>
            </div>
            <div class="options-container hidden" id="${rowId}-cat-opts">
                ${categories.map(c => `
                    <div class="option-item" onclick="event.stopPropagation()">
                        <input type="checkbox" id="${rowId}-cat-${c}" onchange="handleRowCat('${rowId}', '${c}', this)">
                        <label for="${rowId}-cat-${c}">${c}</label>
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="custom-multiselect" id="${rowId}-ms" style="margin-top:8px">
            <div class="select-box" onclick="handleMultiselectClick('${rowId}', event)">
                <span class="placeholder">Выберите теги...</span>
                <span class="arrow">▼</span>
            </div>
            <div class="options-container hidden" id="${rowId}-opts"></div>
        </div>
    `;
    container.appendChild(row);
};

window.handleRowCat = function(rowId, cat, cb) {
    cb.checked ? rowCatSelections[rowId].add(cat) : rowCatSelections[rowId].delete(cat);
    updatePlaceholderText(`${rowId}-cat-ms`, rowCatSelections[rowId], "Категории");
    updateRowTags(rowId);
};

window.updateRowTags = function(rowId) {
    const opts = document.getElementById(`${rowId}-opts`);
    const selectedCats = rowCatSelections[rowId];
    if (!selectedCats || selectedCats.size === 0) {
        opts.innerHTML = '<div class="option-item" style="color:gray; font-size:12px">Сначала выберите категории</div>';
        rowTagSelections[rowId].clear();
        updatePlaceholderText(`${rowId}-ms`, rowTagSelections[rowId], "Теги");
        return;
    }
    const tags = new Set();
    fullDatabase.filter(a => selectedCats.has(a.cat_ru)).forEach(a => a.tags.forEach(t => tags.add(t)));
    const currentSelectedTags = rowTagSelections[rowId];
    for (let t of currentSelectedTags) { if (!tags.has(t)) currentSelectedTags.delete(t); }
    opts.innerHTML = Array.from(tags).sort().map(t => `
        <div class="option-item" onclick="event.stopPropagation()">
            <input type="checkbox" id="${rowId}-${t}" ${currentSelectedTags.has(t) ? 'checked' : ''} onchange="handleRowTag('${rowId}', '${t}', this)">
            <label for="${rowId}-${t}">${t}</label>
        </div>
    `).join('');
    updatePlaceholderText(`${rowId}-ms`, currentSelectedTags, "Теги");
};

window.handleRowTag = function(rowId, tag, cb) {
    cb.checked ? rowTagSelections[rowId].add(tag) : rowTagSelections[rowId].delete(tag);
    updatePlaceholderText(`${rowId}-ms`, rowTagSelections[rowId], "Теги");
};

// --- СЕРВИСНЫЕ ФУНКЦИИ UI ---

window.toggleMultiselect = function(id, event) {
    if (event) event.stopPropagation();
    const target = document.getElementById(id);
    const isOpening = target.classList.contains('hidden');
    document.querySelectorAll('.options-container').forEach(el => el.classList.add('hidden'));
    if (isOpening) {
        const rect = event.currentTarget.getBoundingClientRect();
        target.style.position = 'fixed';
        target.style.top = (rect.bottom + 4) + 'px';
        target.style.left = rect.left + 'px';
        target.style.width = rect.width + 'px';
        target.classList.remove('hidden');
    }
};

window.handleMultiselectClick = function(rowId, event) {
    window.toggleMultiselect(`${rowId}-opts`, event);
};

function updatePlaceholderText(id, set, text) {
    const el = document.querySelector(`#${id} .placeholder`);
    if (el) el.innerText = set.size > 0 ? `${text} (${set.size})` : `Выберите ${text.toLowerCase()}...`;
}

function populateAgeFilters() {
    const ages = [...new Set(fullDatabase.map(a => a.age))].filter(Boolean).sort();
    document.getElementById('age-options').innerHTML = ages.map(age => `
        <div class="option-item" onclick="event.stopPropagation()">
            <input type="checkbox" id="age-${age}" onchange="toggleAgeSelection('${age}', this)">
            <label for="age-${age}">${age}</label>
        </div>
    `).join('');
}

function populateGlobalTags() {
    const allTags = new Set();
    fullDatabase.forEach(app => app.tags.forEach(t => allTags.add(t)));
    document.getElementById('global-tags-options').innerHTML = Array.from(allTags).sort().map(tag => `
        <div class="option-item" onclick="event.stopPropagation()">
            <input type="checkbox" id="gt-${tag}" onchange="toggleGlobalTag('${tag}', this)">
            <label for="gt-${tag}">${tag}</label>
        </div>
    `).join('');
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

function renderTable(data, isSearchActive = false) {
    const tbody = document.getElementById('tableBody');
    document.getElementById('selected-total').innerText = data.length;

    if (data.length === 0) {
        // Если поиск был активен, но массив пуст — выводим "Нет в базе"
        // Если поиск не активен (просто сброс), оставляем таблицу пустой
        tbody.innerHTML = isSearchActive ? `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted); font-size: 16px;">
                    <strong>Нет в базе</strong><br>
                    <small>Приложение не найдено по вашему запросу</small>
                </td>
            </tr>
        ` : '';
        return;
    }

    tbody.innerHTML = data.map(app => {
        const isIPhone = app.os === 'iphone' || app.os === 'ios' || app.os === 'phone';
        const dlDisplay = app.status === 'missing' ? "-" : (isIPhone ? "<i>Данные закрыты</i>" : app.downloads.toLocaleString());
        return `
            <tr>
                <td><strong>${app.name}</strong><br><small style="color:gray">${app.bundle}</small></td>
                <td style="text-transform: capitalize">${app.os}</td>
                <td>${app.cat_ru}</td>
                <td>${app.tags.map(t => `<span class="tag-badge">${t}</span>`).join('')}</td>
                <td>${app.age}</td>
                <td style="text-align:right">${dlDisplay}</td>
            </tr>
        `;
    }).join('');
}

function handleExcelUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
        excelBundles = rows.flat().filter(b => b).map(b => b.toString().trim()); 
        alert("Загружено " + excelBundles.length + " ID.");
    };
    reader.readAsArrayBuffer(file);
}

window.clearExcelUpload = function() {
    document.getElementById('excel-upload').value = "";
    excelBundles = [];
};

window.clearSearchText = function() {
    const searchInput = document.getElementById('global-search');
    if (searchInput) searchInput.value = '';

    filteredApps = [];
    // Передаем false, чтобы не выводить "Нет в базе" при сбросе
    renderTable([], false); 

    const selectedTotal = document.getElementById('selected-total');
    if (selectedTotal) selectedTotal.innerText = '0';
};

window.exportData = function() {
    if (filteredApps.length === 0) return alert("Список пуст");
    
    const dataToExport = filteredApps.map(a => {
        // Проверяем, является ли устройство iPhone/iOS
        const isIPhone = a.os === 'iphone' || a.os === 'ios' || a.os === 'phone';
        
        // Определяем значение для колонки загрузок
        // Если это iPhone, пишем текст, иначе — количество загрузок
        const downloadsValue = isIPhone ? "Данные закрыты App Store" : a.downloads;

        return {
            "Приложение": a.name,
            "Ссылка": a.link,
            "ОС": a.os,
            "Загрузки": downloadsValue
        };
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Apps");
    XLSX.writeFile(wb, "Export Apps.xlsx");
};