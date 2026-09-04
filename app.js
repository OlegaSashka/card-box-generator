const STORAGE_KEY = 'card_box_settings_v1';

function saveSettings() {
  const data = {};
  Object.keys(inputs).forEach(k => data[k] = inputs[k].value);
  data.showDimensions = showDimensionsInput.checked;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadSettings() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    Object.keys(data).forEach(k => {
      if (inputs[k]) {
        inputs[k].value = data[k];
        // Синхронизируем связанное числовое поле
        const pair = SLIDER_SYNC_PAIRS.find(p => p.range === inputs[k]);
        if (pair) pair.num.value = data[k];
      }
    });
    if (data.showDimensions !== undefined) {
      showDimensionsInput.checked = Boolean(data.showDimensions);
    }
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

// -------------------------------------------------------------------------
// 1. Аккуратный пылевой клапан: скос, уступ и разгрузочный скос у петли
// -------------------------------------------------------------------------
function createDustContour(xLeft, xRight, yBase, length, isPointingUp, style, slopeSide = 'left') {
  const dir = isPointingUp ? -1 : 1;
  const w = xRight - xLeft;
  const yTop = yBase + dir * length;

  if (style === 'shoulder') {
    const slopeInset = Math.min(5.5, w * 0.22);

    if (slopeSide === 'left') {
      // Скос слева, справа зазор 1.2 мм и разгрузочный скос у основания (к крышке)
      return [
        { x: xLeft, y: yBase },
        { x: xLeft + 0.8, y: yBase + dir * 1.5 },
        { x: xLeft + slopeInset, y: yTop },
        { x: xRight - 1.2, y: yTop },
        { x: xRight - 1.2, y: yBase + dir * 2.5 },
        { x: xRight, y: yBase }
      ];
    } else {
      // Слева зазор 1.2 мм и разгрузочный скос у основания (к крышке), скос справа
      return [
        { x: xLeft, y: yBase },
        { x: xLeft + 1.2, y: yBase + dir * 2.5 },
        { x: xLeft + 1.2, y: yTop },
        { x: xRight - slopeInset, y: yTop },
        { x: xRight - 0.8, y: yBase + dir * 1.5 },
        { x: xRight, y: yBase }
      ];
    }
  } else {
    // Симметричная трапеция
    const taper = Math.min(4.5, w * 0.2);
    return [
      { x: xLeft, y: yBase },
      { x: xLeft + 1.0, y: yBase + dir * 1.5 },
      { x: xLeft + taper, y: yTop },
      { x: xRight - taper, y: yTop },
      { x: xRight - 1.0, y: yBase + dir * 1.5 },
      { x: xRight, y: yBase }
    ];
  }
}

// -------------------------------------------------------------------------
// 2. Крышка + заправочный язычок с замками (единый неразрывный контур)
// -------------------------------------------------------------------------
function addCoverWithTuckFlap(xLeft, xRight, yBody, yHinge, tuckLength, isPointingUp, hasLock, cutLines, foldLines) {
  const dir = isPointingUp ? -1 : 1;
  const w = xRight - xLeft;
  const yTuckEdge = yHinge + dir * tuckLength;

  if (hasLock) {
    const lockInset = 2.5; // Отступ линии сгиба от краев
    const slitDepth = 1.6; // Глубина просечки в сторону крышки
    const earHeight = 2.2; // Высота замочка (ушка)
    const earY = yHinge + dir * earHeight;
    const cornerR = Math.min(8.0, w * 0.2, (tuckLength - earHeight) * 0.8);

    // Непрерывный внешний контур: стенка крышки -> ушко -> закругление -> срез -> обратно
    const contour = [];
    contour.push({ x: xLeft, y: yBody });
    contour.push({ x: xLeft, y: earY });

    const arcSteps = 12;
    for (let i = 0; i <= arcSteps; i++) {
      const a = (Math.PI / 2) * (i / arcSteps);
      contour.push({
        x: (xLeft + cornerR) - cornerR * Math.cos(a),
        y: earY + dir * (tuckLength - earHeight) * Math.sin(a)
      });
    }

    contour.push({ x: xRight - cornerR, y: yTuckEdge });

    for (let i = arcSteps; i >= 0; i--) {
      const a = (Math.PI / 2) * (i / arcSteps);
      contour.push({
        x: (xRight - cornerR) + cornerR * Math.cos(a),
        y: earY + dir * (tuckLength - earHeight) * Math.sin(a)
      });
    }

    contour.push({ x: xRight, y: earY });
    contour.push({ x: xRight, y: yBody });
    cutLines.push(contour);

    // Просечки под замочки у линии сгиба
    cutLines.push([
      { x: xLeft, y: yHinge },
      { x: xLeft + lockInset, y: yHinge },
      { x: xLeft + lockInset, y: yHinge - dir * slitDepth }
    ]);
    cutLines.push([
      { x: xRight, y: yHinge },
      { x: xRight - lockInset, y: yHinge },
      { x: xRight - lockInset, y: yHinge - dir * slitDepth }
    ]);

    // Линия сгиба (между просечками)
    foldLines.push({
      x1: xLeft + lockInset,
      y1: yHinge,
      x2: xRight - lockInset,
      y2: yHinge
    });
  } else {
    // Вариант без замка
    const cornerR = Math.min(6.0, w * 0.18, tuckLength * 0.6);
    const contour = [];
    contour.push({ x: xLeft, y: yBody });
    contour.push({ x: xLeft, y: yHinge });

    const arcSteps = 12;
    for (let i = 0; i <= arcSteps; i++) {
      const a = (Math.PI / 2) * (i / arcSteps);
      contour.push({
        x: (xLeft + cornerR) - cornerR * Math.cos(a),
        y: yHinge + dir * tuckLength * Math.sin(a)
      });
    }

    contour.push({ x: xRight - cornerR, y: yTuckEdge });

    for (let i = arcSteps; i >= 0; i--) {
      const a = (Math.PI / 2) * (i / arcSteps);
      contour.push({
        x: (xRight - cornerR) + cornerR * Math.cos(a),
        y: yHinge + dir * tuckLength * Math.sin(a)
      });
    }

    contour.push({ x: xRight, y: yHinge });
    contour.push({ x: xRight, y: yBody });
    cutLines.push(contour);

    foldLines.push({ x1: xLeft, y1: yHinge, x2: xRight, y2: yHinge });
  }
}

// -------------------------------------------------------------------------
// 2. Генератор замка и плавного скругления крышки (с точным сопряжением дуг)
// -------------------------------------------------------------------------
function addTuckFlap(xLeft, xRight, yHinge, tuckLength, isPointingUp, hasLock, cutLines, foldLines) {
  const dir = isPointingUp ? -1 : 1;
  const w = xRight - xLeft;
  const yTuckEdge = yHinge + dir * tuckLength;

  if (hasLock) {
    const lockInset = 2.5; // Отступ линии сгиба от краев
    const slitDepth = 1.6; // Глубина прорези в стенку коробки
    const earHeight = 2.4; // Высота выступающего ушка замка
    const cornerR = Math.min(8.0, w * 0.2, tuckLength * 0.6);
    const radiusY = tuckLength - earHeight;

    // Линия сгиба (начинается строго от прорезей)
    foldLines.push({ x1: xLeft + lockInset, y1: yHinge, x2: xRight - lockInset, y2: yHinge });

    // Внутренние прорези под ушки (засечки)
    cutLines.push([
      { x: xLeft, y: yHinge },
      { x: xLeft + lockInset, y: yHinge },
      { x: xLeft + lockInset, y: yHinge - dir * slitDepth }
    ]);
    cutLines.push([
      { x: xRight, y: yHinge },
      { x: xRight - lockInset, y: yHinge },
      { x: xRight - lockInset, y: yHinge - dir * slitDepth }
    ]);

    // Контур заправочного язычка с плавными дугами
    const flapContour = [];
    flapContour.push({ x: xLeft, y: yHinge });
    flapContour.push({ x: xLeft, y: yHinge + dir * earHeight });

    // Левое сопряжение (плавный переход от вертикали в горизонталь)
    const arcSteps = 12;
    for (let i = 0; i <= arcSteps; i++) {
      const a = (Math.PI / 2) * (i / arcSteps);
      flapContour.push({
        x: (xLeft + cornerR) - cornerR * Math.cos(a),
        y: (yHinge + dir * earHeight) + dir * (radiusY * Math.sin(a))
      });
    }

    // Верхняя горизонтальная грань
    flapContour.push({ x: xRight - cornerR, y: yTuckEdge });

    // Правое сопряжение
    for (let i = arcSteps; i >= 0; i--) {
      const a = (Math.PI / 2) * (i / arcSteps);
      flapContour.push({
        x: (xRight - cornerR) + cornerR * Math.cos(a),
        y: (yHinge + dir * earHeight) + dir * (radiusY * Math.sin(a))
      });
    }

    flapContour.push({ x: xRight, y: yHinge + dir * earHeight });
    flapContour.push({ x: xRight, y: yHinge });

    cutLines.push(flapContour);
  } else {
    // Вариант без замка (гладкое овальное скругление)
    foldLines.push({ x1: xLeft, y1: yHinge, x2: xRight, y2: yHinge });

    const cornerR = Math.min(6.0, w * 0.15, tuckLength * 0.5);
    const radiusY = tuckLength;
    const flapContour = [{ x: xLeft, y: yHinge }];
    const arcSteps = 12;

    for (let i = 0; i <= arcSteps; i++) {
      const a = (Math.PI / 2) * (i / arcSteps);
      flapContour.push({
        x: (xLeft + cornerR) - cornerR * Math.cos(a),
        y: yHinge + dir * (radiusY * Math.sin(a))
      });
    }
    flapContour.push({ x: xRight - cornerR, y: yTuckEdge });
    for (let i = arcSteps; i >= 0; i--) {
      const a = (Math.PI / 2) * (i / arcSteps);
      flapContour.push({
        x: (xRight - cornerR) + cornerR * Math.cos(a),
        y: yHinge + dir * (radiusY * Math.sin(a))
      });
    }
    flapContour.push({ x: xRight, y: yHinge });
    cutLines.push(flapContour);
  }
}

// -------------------------------------------------------------------------
// 3. Сборка всей развертки RTE / STE
// -------------------------------------------------------------------------
function buildTuckBoxGeometry(dim, isReverse, opts = {}) {
  const { L, D, W, glue, tuck, dust } = dim;
  const hasLock = opts.locks !== 'none';
  const hasThumbNotch = opts.notch !== 'none';
  const flapStyle = opts.flaps || 'shoulder';

  const cutLines = [];
  const foldLines = [];

  const x0 = 0;
  const x1 = glue;
  const x2 = x1 + L;
  const x3 = x2 + W;
  const x4 = x3 + L;
  const x5 = x4 + W;

  const yTopTuck = 0;
  const yTopHinge = tuck;
  const yBodyTop = yTopHinge + W;
  const yBodyBottom = yBodyTop + D;
  const yBottomHinge = yBodyBottom + W;
  const yBottomTuck = yBottomHinge + tuck;

  const totalWidth = x5;
  const totalHeight = yBottomTuck;

  // Основные сгибы корпуса
  foldLines.push({ x1: x1, y1: yBodyTop, x2: x1, y2: yBodyBottom });
  foldLines.push({ x1: x2, y1: yBodyTop, x2: x2, y2: yBodyBottom });
  foldLines.push({ x1: x3, y1: yBodyTop, x2: x3, y2: yBodyBottom });
  foldLines.push({ x1: x4, y1: yBodyTop, x2: x4, y2: yBodyBottom });

  foldLines.push({ x1: x1, y1: yBodyTop, x2: x5, y2: yBodyTop });
  foldLines.push({ x1: x1, y1: yBodyBottom, x2: x5, y2: yBodyBottom });

  // Клеевой боковой клапан
  cutLines.push([
    { x: x1, y: yBodyTop },
    { x: x0, y: yBodyTop + Math.min(glue, 8) },
    { x: x0, y: yBodyBottom - Math.min(glue, 8) },
    { x: x1, y: yBodyBottom }
  ]);

  // Лицевой верхний срез (с полукруглым вырезом или прямой)
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
    cutLines.push([{ x: x1, y: yBodyTop }, ...arcPoints, { x: x2, y: yBodyTop }]);
  } else {
    cutLines.push([{ x: x1, y: yBodyTop }, { x: x2, y: yBodyTop }]);
  }

  // ВЕРХ: пыльник (L) -> крышка (Back) -> пыльник (R)
  cutLines.push(createDustContour(x2, x3, yBodyTop, dust, true, flapStyle, 'left'));
  addCoverWithTuckFlap(x3, x4, yBodyTop, yTopHinge, tuck, true, hasLock, cutLines, foldLines);
  cutLines.push(createDustContour(x4, x5, yBodyTop, dust, true, flapStyle, 'right'));
  cutLines.push([{ x: x5, y: yBodyTop }, { x: x5, y: yBodyBottom }]);

  // НИЗ: в зависимости от RTE или STE
  if (isReverse) {
    // RTE: крышка снизу на первой панели (Front)
    addCoverWithTuckFlap(x1, x2, yBodyBottom, yBottomHinge, tuck, false, hasLock, cutLines, foldLines);
    cutLines.push(createDustContour(x2, x3, yBodyBottom, dust, false, flapStyle, 'right'));
    cutLines.push([{ x: x3, y: yBodyBottom }, { x: x4, y: yBodyBottom }]);
    cutLines.push(createDustContour(x4, x5, yBodyBottom, dust, false, flapStyle, 'left'));
  } else {
    // STE: крышка снизу на третьей панели (Back)
    cutLines.push([{ x: x1, y: yBodyBottom }, { x: x2, y: yBodyBottom }]);
    cutLines.push(createDustContour(x2, x3, yBodyBottom, dust, false, flapStyle, 'left'));
    addCoverWithTuckFlap(x3, x4, yBodyBottom, yBottomHinge, tuck, false, hasLock, cutLines, foldLines);
    cutLines.push(createDustContour(x4, x5, yBodyBottom, dust, false, flapStyle, 'right'));
  }

  const glueCut = Math.min(glue, 8);
  const glueArea = { 
    x: x0, 
    y: yBodyTop + glueCut, 
    w: glue, 
    h: D - (glueCut * 2) 
  };a = { x: x0, y: yBodyTop + 5, w: glue, h: D - 10 };
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

const showDimensionsInput = document.getElementById('show-dimensions');
const btnCenter = document.getElementById('btn-center');
const badge = document.getElementById('status-badge');
const svg = document.getElementById('preview-svg');
const exportBtn = document.getElementById('btn-export');

// Конфигурация пар: ползунок <-> числовое поле
const SLIDER_SYNC_PAIRS = [
  { range: inputs.posX, num: document.getElementById('num-pos-x') },
  { range: inputs.posY, num: document.getElementById('num-pos-y') },
  { range: inputs.width, num: document.getElementById('num-width') },
  { range: inputs.height, num: document.getElementById('num-height') },
  { range: inputs.depth, num: document.getElementById('num-depth') },
  { range: inputs.clearance, num: document.getElementById('num-clearance') },
  { range: inputs.margin, num: document.getElementById('num-margin') }
];

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

  // Синхронизируем динамические границы для X и Y
  inputs.posX.max = Math.round(paper.w);
  inputs.posY.max = Math.round(paper.h);
  document.getElementById('num-pos-x').max = Math.round(paper.w);
  document.getElementById('num-pos-y').max = Math.round(paper.h);

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

  // Размерные стрелки (W, D, L) выводятся только при активном чекбоксе
  if (showDimensionsInput.checked && box.annotations) {
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
  }

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

  const cx = Math.max(0, Math.round((paper.w - box.totalWidth) / 2));
  const cy = Math.max(0, Math.round((paper.h - box.totalHeight) / 2));

  inputs.posX.value = cx;
  inputs.posY.value = cy;
  document.getElementById('num-pos-x').value = cx;
  document.getElementById('num-pos-y').value = cy;

  render();
}

// Двусторонняя привязка range <-> number
SLIDER_SYNC_PAIRS.forEach(({ range, num }) => {
  range.addEventListener('input', () => {
    num.value = range.value;
    render();
  });
  num.addEventListener('input', () => {
    if (num.value !== '') {
      range.value = num.value;
      render();
    }
  });
});

inputs.boxType.addEventListener('change', () => {
  renderCustomOptionsUI();
  render();
});
inputs.paper.addEventListener('change', render);
inputs.orientation.addEventListener('change', render);
showDimensionsInput.addEventListener('change', render);
exportBtn.addEventListener('click', exportToPDF);
btnCenter.addEventListener('click', centerBox);

// Инициализация при старте
initTemplatesUI();
renderCustomOptionsUI();
loadSettings();

if (!localStorage.getItem(STORAGE_KEY)) {
  centerBox();
} else {
  render();
}