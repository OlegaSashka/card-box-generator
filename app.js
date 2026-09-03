const STORAGE_KEY = 'card_box_settings_v1';

function saveSettings() {
  const data = {};
  Object.keys(inputs).forEach(k => data[k] = inputs[k].value);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadSettings() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    Object.keys(data).forEach(k => {
      if (inputs[k]) inputs[k].value = data[k];
    });
  } catch (e) {
    console.error("Ошибка загрузки настроек", e);
  }
}

// Конфигурация доступных форматов бумаги (мм)
const PAPER_SIZES = {
  a4: { w: 210, h: 297 },
  a3: { w: 297, h: 420 },
  letter: { w: 215.9, h: 279.4 }
};

const TUCK_BOX_CUSTOM_OPTIONS = [
  {
    id: 'locks',
    label: 'Замки',
    values: [
      { id: 'lock', title: 'С замочками' },
      { id: 'none', title: 'Гладкий клапан' }
    ]
  },
  {
    id: 'notch',
    label: 'Вырез под палец',
    values: [
      { id: 'semi', title: 'Полукруглый' },
      { id: 'none', title: 'Без выреза' }
    ]
  },
  {
    id: 'flaps',
    label: 'Форма клапанов',
    values: [
      { id: 'shoulder', title: 'Со скосом' },
      { id: 'trapezoid', title: 'Симметричные' }
    ]
  }
];

const BOX_TEMPLATES = {
  'reverse-tuck': {
    name: 'RTE — Разнонаправленные клапаны',
    options: TUCK_BOX_CUSTOM_OPTIONS,
    build: generateReverseTuckBox
  },
  'straight-tuck': {
    name: 'STE — Однонаправленные клапаны',
    options: TUCK_BOX_CUSTOM_OPTIONS,
    build: generateStraightTuckBox
  }
};

const customOptionsContainer = document.getElementById('dynamic-box-options');

// Генерация селекторов под активный тип коробки
function renderCustomOptionsUI() {
  customOptionsContainer.innerHTML = '';
  const template = BOX_TEMPLATES[inputs.boxType.value];
  if (!template.options || template.options.length === 0) {
    document.getElementById('box-options-panel').style.display = 'none';
    return;
  }
  document.getElementById('box-options-panel').style.display = 'block';

  template.options.forEach(opt => {
    const wrap = document.createElement('div');
    wrap.className = 'custom-opt-group';
    wrap.innerHTML = `
      <label>${opt.label}</label>
      <select id="opt-${opt.id}">
        ${opt.values.map(v => `<option value="${v.id}">${v.title}</option>`).join('')}
      </select>
    `;
    customOptionsContainer.appendChild(wrap);
    wrap.querySelector('select').addEventListener('change', render);
  });
}

function getCustomOptionsValues() {
  const res = {};
  const selects = customOptionsContainer.querySelectorAll('select');
  selects.forEach(sel => {
    const key = sel.id.replace('opt-', '');
    res[key] = sel.value;
  });
  return res;
}

// Контур заправочного клапана (с замком или плавный без замка)
function createTuckContour(xLeft, xRight, yHinge, yTuckEdge, isPointingUp, hasLock) {
  const dir = isPointingUp ? -1 : 1;
  const w = xRight - xLeft;
  const cornerR = Math.min(6.0, w * 0.15);

  if (hasLock) {
    const notchDepth = 1.8;
    const notchHeight = 2.4;
    return [
      { x: xLeft, y: yHinge },
      { x: xLeft, y: yHinge - dir * notchHeight },
      { x: xLeft + notchDepth, y: yHinge - dir * notchHeight },
      { x: xLeft + notchDepth, y: yHinge },
      { x: xLeft + 0.8, y: yHinge + dir * 1.8 },
      { x: xLeft + cornerR, y: yTuckEdge },
      { x: xRight - cornerR, y: yTuckEdge },
      { x: xRight - 0.8, y: yHinge + dir * 1.8 },
      { x: xRight - notchDepth, y: yHinge },
      { x: xRight - notchDepth, y: yHinge - dir * notchHeight },
      { x: xRight, y: yHinge - dir * notchHeight },
      { x: xRight, y: yHinge }
    ];
  } else {
    // Без замка: гладкий скругленный клапан легкого трения
    return [
      { x: xLeft, y: yHinge },
      { x: xLeft + cornerR, y: yTuckEdge },
      { x: xRight - cornerR, y: yTuckEdge },
      { x: xRight, y: yHinge }
    ];
  }
}

// Контур пылевого клапана (пыльника): скошенный (с зеркалированием) или симметричный
function createDustContour(xLeft, xRight, yBase, length, isPointingUp, style, mirror = false) {
  const dir = isPointingUp ? -1 : 1;
  const w = xRight - xLeft;

  if (style === 'shoulder') {
    const inset = Math.min(5, w * 0.25);
    if (mirror) {
      // Скос/плечико слева (xLeft), прямой срез справа (xRight)
      return [
        { x: xLeft, y: yBase },
        { x: xLeft, y: yBase + dir * 1.5 },
        { x: xLeft + 1, y: yBase + dir * (length * 0.4) },
        { x: xLeft + inset, y: yBase + dir * length },
        { x: xRight, y: yBase + dir * length },
        { x: xRight, y: yBase }
      ];
    } else {
      // Прямой срез слева (xLeft), скос/плечико справа (xRight)
      return [
        { x: xLeft, y: yBase },
        { x: xLeft, y: yBase + dir * length },
        { x: xRight - inset, y: yBase + dir * length },
        { x: xRight - 1, y: yBase + dir * (length * 0.4) },
        { x: xRight, y: yBase + dir * 1.5 },
        { x: xRight, y: yBase }
      ];
    }
  } else {
    // Симметричная трапеция
    const taper = Math.min(4.5, w * 0.22);
    return [
      { x: xLeft, y: yBase },
      { x: xLeft + 1, y: yBase + dir * 1.5 },
      { x: xLeft + taper, y: yBase + dir * length },
      { x: xRight - taper, y: yBase + dir * length },
      { x: xRight - 1, y: yBase + dir * 1.5 },
      { x: xRight, y: yBase }
    ];
  }
}

// -------------------------------------------------------------------------
// Базовая фабрика построения разверток пачек (RTE и STE)
// -------------------------------------------------------------------------
// -------------------------------------------------------------------------
// Базовая фабрика построения разверток пачек (RTE и STE)
// -------------------------------------------------------------------------
function buildTuckBoxGeometry(dim, isReverse, opts = {}) {
  const { L, D, W, glue, tuck, dust } = dim;
  const hasLock = opts.locks !== 'none';
  const hasThumbNotch = opts.notch !== 'none';
  const flapStyle = opts.flaps || 'shoulder';

  const cutLines = [];
  const foldLines = [];

  // Горизонтальная разметка
  const x0 = 0;
  const x1 = glue;
  const x2 = x1 + L;
  const x3 = x2 + W;
  const x4 = x3 + L;
  const x5 = x4 + W;

  // Вертикальная разметка
  const yTopTuck = 0;
  const yTopHinge = tuck;
  const yBodyTop = yTopHinge + W;
  const yBodyBottom = yBodyTop + D;
  const yBottomHinge = yBodyBottom + W;
  const yBottomTuck = yBottomHinge + tuck;

  const totalWidth = x5;
  const totalHeight = yBottomTuck;

  // --- ЛИНИИ СГИБА (FOLD) ---
  // Вертикальные сгибы между гранями
  foldLines.push({ x1: x1, y1: yBodyTop, x2: x1, y2: yBodyBottom });
  foldLines.push({ x1: x2, y1: yBodyTop, x2: x2, y2: yBodyBottom });
  foldLines.push({ x1: x3, y1: yBodyTop, x2: x3, y2: yBodyBottom });
  foldLines.push({ x1: x4, y1: yBodyTop, x2: x4, y2: yBodyBottom });

  // Поперечные сгибы корпуса (верх и низ)
  foldLines.push({ x1: x1, y1: yBodyTop, x2: x5, y2: yBodyTop });
  foldLines.push({ x1: x1, y1: yBodyBottom, x2: x5, y2: yBodyBottom });

  // Линии сгиба заправочных клапанов
  const lockInset = hasLock ? 1.5 : 0;
  foldLines.push({ x1: x3 + lockInset, y1: yTopHinge, x2: x4 - lockInset, y2: yTopHinge });

  const bottomPanelLeft = isReverse ? x1 : x3;
  const bottomPanelRight = isReverse ? x2 : x4;
  foldLines.push({ x1: bottomPanelLeft + lockInset, y1: yBottomHinge, x2: bottomPanelRight - lockInset, y2: yBottomHinge });

  // --- ЛИНИИ РЕЗА (CUT) ---
  // Клеевой боковой клапан
  cutLines.push([
    { x: x1, y: yBodyTop },
    { x: x0, y: yBodyTop + Math.min(glue, 8) },
    { x: x0, y: yBodyBottom - Math.min(glue, 8) },
    { x: x1, y: yBodyBottom }
  ]);

  // Верхний срез лицевой панели (с плавным полукруглым вырезом или прямой)
  const thumbR = 8;
  const midX = (x1 + x2) / 2;

  if (hasThumbNotch) {
    const arcPoints = [];
    const segments = 24;
    for (let i = 0; i <= segments; i++) {
      const angle = (Math.PI * i) / segments;
      arcPoints.push({
        x: midX - thumbR * Math.cos(angle),
        y: yBodyTop + thumbR * Math.sin(angle)
      });
    }
    cutLines.push([
      { x: x1, y: yBodyTop },
      ...arcPoints,
      { x: x2, y: yBodyTop }
    ]);
  } else {
    cutLines.push([{ x: x1, y: yBodyTop }, { x: x2, y: yBodyTop }]);
  }

  // Верхняя часть: левый пылевой клапан (зеркальный) + крышка + правый пылевой клапан
  cutLines.push(createDustContour(x2, x3, yBodyTop, dust, true, flapStyle, true));
  cutLines.push([
    { x: x3, y: yBodyTop },
    ...createTuckContour(x3, x4, yTopHinge, yTopTuck, true, hasLock),
    { x: x4, y: yBodyTop }
  ]);
  cutLines.push(createDustContour(x4, x5, yBodyTop, dust, true, flapStyle, false));

  // Правый срез последней панели
  cutLines.push([{ x: x5, y: yBodyTop }, { x: x5, y: yBodyBottom }]);

  // Нижняя часть: распределение крышки и пыльников в зависимости от типа (RTE или STE)
  if (isReverse) {
    // RTE: крышка на панели 1, пыльники зеркально направлены к ней
    cutLines.push([
      { x: x1, y: yBodyBottom },
      ...createTuckContour(x1, x2, yBottomHinge, yBottomTuck, false, hasLock),
      { x: x2, y: yBodyBottom }
    ]);
    cutLines.push(createDustContour(x2, x3, yBodyBottom, dust, false, flapStyle, false));
    cutLines.push([{ x: x3, y: yBodyBottom }, { x: x4, y: yBodyBottom }]);
    cutLines.push(createDustContour(x4, x5, yBodyBottom, dust, false, flapStyle, true));
  } else {
    // STE: крышка на панели 3, пыльники ориентированы зеркально к панели 3
    cutLines.push([{ x: x1, y: yBodyBottom }, { x: x2, y: yBodyBottom }]);
    cutLines.push(createDustContour(x2, x3, yBodyBottom, dust, false, flapStyle, true));
    cutLines.push([
      { x: x3, y: yBodyBottom },
      ...createTuckContour(x3, x4, yBottomHinge, yBottomTuck, false, hasLock),
      { x: x4, y: yBodyBottom }
    ]);
    cutLines.push(createDustContour(x4, x5, yBodyBottom, dust, false, flapStyle, false));
  }

  // Область клеевого шва
  const glueArea = { x: x0, y: yBodyTop + 5, w: glue, h: D - 10 };

  // Размерные стрелки
  const annotations = [
    { type: 'dim-h', text: 'W', x1: x2, x2: x3, y: yBodyTop + D * 0.4 },
    { type: 'dim-h', text: 'L', x1: x3, x2: x4, y: yBodyTop + D * 0.4 },
    { type: 'dim-v', text: 'D', y1: yBodyTop, y2: yBodyBottom, x: x2 + W * 0.75 }
  ];

  return { cutLines, foldLines, glueArea, annotations, totalWidth, totalHeight };
}

function generateReverseTuckBox(dim, opts) {
  return buildTuckBoxGeometry(dim, true, opts);
}

function generateStraightTuckBox(dim, opts) {
  return buildTuckBoxGeometry(dim, false, opts);
}

// =========================================================================
// ОСНОВНАЯ ЛОГИКА ИНТЕРФЕЙСА И РЕНДЕРА
// =========================================================================
const inputs = {
  boxType: document.getElementById('box-type'),
  width: document.getElementById('card-width'),
  height: document.getElementById('card-height'),
  depth: document.getElementById('card-depth'),
  clearance: document.getElementById('box-clearance'),
  margin: document.getElementById('printer-margin'),
  posX: document.getElementById('pos-x'),
  posY: document.getElementById('pos-y'),
  paper: document.getElementById('paper-format'),
  orientation: document.getElementById('paper-orientation')
};

const labels = {
  width: document.getElementById('val-width'),
  height: document.getElementById('val-height'),
  depth: document.getElementById('val-depth'),
  clearance: document.getElementById('val-clearance'),
  margin: document.getElementById('val-margin'),
  posX: document.getElementById('val-pos-x'),
  posY: document.getElementById('val-pos-y')
};

const btnCenter = document.getElementById('btn-center');

const badge = document.getElementById('status-badge');
const svg = document.getElementById('preview-svg');
const exportBtn = document.getElementById('btn-export');

// Инициализация выпадающего списка доступных шаблонов
function initTemplatesUI() {
  inputs.boxType.innerHTML = '';
  Object.keys(BOX_TEMPLATES).forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = BOX_TEMPLATES[key].name;
    inputs.boxType.appendChild(opt);
  });
}

function getDimensions() {
  const c = parseFloat(inputs.clearance.value);
  const L = parseFloat(inputs.width.value) + c;
  const D = parseFloat(inputs.height.value) + c;
  const W = parseFloat(inputs.depth.value) + c;
  return {
    L, D, W,
    glue: 12,
    tuck: Math.max(14, W * 0.65 + 4),
    dust: Math.min(W * 0.85, 24)
  };
}

function getPaperDimensions() {
  const base = PAPER_SIZES[inputs.paper.value];
  const isLandscape = inputs.orientation.value === 'landscape';
  return {
    w: isLandscape ? Math.max(base.w, base.h) : Math.min(base.w, base.h),
    h: isLandscape ? Math.min(base.w, base.h) : Math.max(base.w, base.h)
  };
}

function render() {
  // Обновление подписей значений
  labels.width.textContent = inputs.width.value;
  labels.height.textContent = inputs.height.value;
  labels.depth.textContent = inputs.depth.value;
  labels.clearance.textContent = inputs.clearance.value;
  labels.margin.textContent = inputs.margin.value; // <-- Новое

  // Сохраняем любое изменение
  saveSettings();

  const dim = getDimensions();
  const paper = getPaperDimensions();
  const margin = parseFloat(inputs.margin.value);
  const template = BOX_TEMPLATES[inputs.boxType.value];
  const customOpts = getCustomOptionsValues();
  const box = template.build(dim, customOpts);

  const printableW = paper.w - (margin * 2);
  const printableH = paper.h - (margin * 2);

  // Динамическое обновление максимальных границ ползунков
  inputs.posX.max = Math.round(paper.w);
  inputs.posY.max = Math.round(paper.h);

  labels.posX.textContent = inputs.posX.value;
  labels.posY.textContent = inputs.posY.value;

  const ox = parseFloat(inputs.posX.value);
  const oy = parseFloat(inputs.posY.value);

  // Проверка: находится ли чертеж целиком внутри безопасной зоны печати
  const fits = (ox >= margin) && 
              (oy >= margin) && 
              (ox + box.totalWidth <= paper.w - margin) && 
              (oy + box.totalHeight <= paper.h - margin);
             
  badge.textContent = fits 
    ? `Помещается (${box.totalWidth.toFixed(1)} × ${box.totalHeight.toFixed(1)} мм)`
    : `Не влезает в область печати! (${box.totalWidth.toFixed(1)} × ${box.totalHeight.toFixed(1)} мм)`;
  badge.className = `badge ${fits ? 'ok' : 'overflow'}`;

  svg.setAttribute('viewBox', `0 0 ${paper.w} ${paper.h}`);
  svg.setAttribute('width', '90%');
  svg.setAttribute('height', '90%');

  let html = `
    <!-- Физический лист бумаги -->
    <rect x="0" y="0" width="${paper.w}" height="${paper.h}" fill="#ffffff" stroke="#94a3b8" stroke-width="0.8"/>
    
    <!-- Безопасная граница печати принтера (пунктир) -->
    <rect x="${margin}" y="${margin}" width="${printableW}" height="${printableH}" 
          fill="none" stroke="#64748b" stroke-width="0.6" stroke-dasharray="3,3" />
    
    <g transform="translate(${ox}, ${oy})">
      <!-- Зона склейки -->
      <rect x="${box.glueArea.x}" y="${box.glueArea.y}" width="${box.glueArea.w}" height="${box.glueArea.h}" 
            fill="#fef08a" stroke="#eab308" stroke-dasharray="2,2" opacity="0.8" />
  `;

  // Сгибы
  box.foldLines.forEach(l => {
    html += `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="#16a34a" stroke-width="0.5" stroke-dasharray="2,1.5" />`;
  });

  // Резы
  box.cutLines.forEach(points => {
    const d = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    html += `<path d="${d}" stroke="#dc2626" stroke-width="0.7" fill="none" stroke-linejoin="round" />`;
  });

  // Размерные стрелки
  box.annotations.forEach(a => {
    if (a.type === 'dim-h') {
      html += `
        <line x1="${a.x1}" y1="${a.y}" x2="${a.x2}" y2="${a.y}" stroke="#0f172a" stroke-width="0.4" />
        <text x="${(a.x1 + a.x2) / 2}" y="${a.y - 2}" font-size="6" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="#0f172a">${a.text}</text>
      `;
    } else if (a.type === 'dim-v') {
      html += `
        <line x1="${a.x}" y1="${a.y1}" x2="${a.x}" y2="${a.y2}" stroke="#0f172a" stroke-width="0.4" />
        <text x="${a.x - 3}" y="${(a.y1 + a.y2) / 2}" font-size="7" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="#0f172a">${a.text}</text>
      `;
    }
  });

  html += `</g>`;
  svg.innerHTML = html;
}

// Экспорт чертежа в PDF с соблюдением пропорций 1:1
function exportToPDF() {
  const { jsPDF } = window.jspdf;
  const paper = getPaperDimensions();
  const dim = getDimensions();
  const template = BOX_TEMPLATES[inputs.boxType.value];
  const customOpts = getCustomOptionsValues();
  const box = template.build(dim, customOpts);

  const doc = new jsPDF({
    orientation: inputs.orientation.value,
    unit: 'mm',
    format: [paper.w, paper.h]
  });

  const ox = parseFloat(inputs.posX.value);
  const oy = parseFloat(inputs.posY.value);

  // Зона клея
  doc.setFillColor(254, 240, 138);
  doc.rect(ox + box.glueArea.x, oy + box.glueArea.y, box.glueArea.w, box.glueArea.h, 'F');

  // Линии сгиба (зеленый пунктир)
  doc.setDrawColor(22, 163, 74);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([2, 2], 0);
  box.foldLines.forEach(l => {
    doc.line(ox + l.x1, oy + l.y1, ox + l.x2, oy + l.y2);
  });

  // Линии реза (красный сплошной)
  doc.setDrawColor(220, 38, 38);
  doc.setLineWidth(0.35);
  doc.setLineDashPattern([], 0);
  box.cutLines.forEach(points => {
    for (let i = 0; i < points.length - 1; i++) {
      doc.line(ox + points[i].x, oy + points[i].y, ox + points[i + 1].x, oy + points[i + 1].y);
    }
  });
  
  doc.save(`box-${inputs.boxType.value}-${dim.L - parseFloat(inputs.clearance.value)}x${dim.D - parseFloat(inputs.clearance.value)}x${dim.W - parseFloat(inputs.clearance.value)}.pdf`);
}

function centerBox() {
  const paper = getPaperDimensions();
  const dim = getDimensions();
  const template = BOX_TEMPLATES[inputs.boxType.value];
  const customOpts = getCustomOptionsValues();
  const box = template.build(dim, customOpts);

  inputs.posX.value = Math.max(0, Math.round((paper.w - box.totalWidth) / 2));
  inputs.posY.value = Math.max(0, Math.round((paper.h - box.totalHeight) / 2));
  render();
}

// Регистрация слушателей событий
initTemplatesUI();
loadSettings();
renderCustomOptionsUI();
Object.values(inputs).forEach(input => input.addEventListener('input', render));
exportBtn.addEventListener('click', exportToPDF);

btnCenter.addEventListener('click', centerBox);

// Если в памяти еще не было координат — отцентрируем сразу
if (!localStorage.getItem(STORAGE_KEY)) {
  centerBox();
}

render();