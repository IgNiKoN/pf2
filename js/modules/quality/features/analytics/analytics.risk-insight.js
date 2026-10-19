/**
 * analytics.risk-insight.js
 * Сводка «Анализ зон риска» по УрК подрядчиков (зелёная ≥85 / жёлтая 70–84 / красная <70;
 * N<7 — «сбор данных»). Автотекст + факты для промпта ИИ.
 */

function _t(key, fallback, vars) {
  try {
    var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
    if (i18n && typeof i18n.t === 'function') {
      var s = vars ? i18n.t(key, vars) : i18n.t(key);
      if (s && s !== key) return s;
    }
  } catch (e) { /* ignore */ }
  if (vars && fallback) {
    return String(fallback).replace(/\{(\w+)\}/g, function (_m, k) {
      return vars[k] != null ? String(vars[k]) : '';
    });
  }
  return fallback;
}

function shortName(full) {
  var s = String(full || '—');
  var i = s.indexOf(' [');
  return i > 0 ? s.slice(0, i) : s;
}

export function escapeInsightHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Сохранённый автошаблон (простыня) — не показывать вместо живой карточки. */
export function isAutoRiskInsightText(plain) {
  var s = String(plain || '').replace(/\s+/g, ' ').trim();
  if (!s) return false;
  if (!/Уровень качества:\s*(НИЗКИЙ|ПРИЕМЛЕМЫЙ|ВЫСОКИЙ|нет данных)/i.test(s)
    && !/Quality level:\s*(LOW|ACCEPTABLE|HIGH)/i.test(s)
    && !/Nivo kvaliteta:\s*(NIZAK|PRIHVATLJIV|VISOK)/i.test(s)) {
    return false;
  }
  return /(ср\.?\s*УрК|Средний уровень качества|Зоны (качества|по УрК)|Действие:|avg UrK|Zones|Action:)/i.test(s);
}

/**
 * Читаемая вёрстка для сохранённого/ИИ plain-текста (абзацы, списки, «Заголовок:»).
 * @param {string} plain
 * @returns {string} HTML
 */
export function formatRiskInsightDisplayHtml(plain) {
  var raw = String(plain == null ? '' : plain).replace(/\r\n/g, '\n').trim();
  if (!raw) return '';
  var escaped = escapeInsightHtml(raw);
  var blocks = escaped.split(/\n{2,}/).map(function (b) { return b.trim(); }).filter(Boolean);
  if (blocks.length === 1 && /\n/.test(blocks[0])) {
    // Одна простыня без пустых строк — режем по одиночным \n на «секции».
    blocks = blocks[0].split(/\n+/).map(function (b) { return b.trim(); }).filter(Boolean);
  }

  function renderBlock(block) {
    var lines = block.split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) return '';

    var numbered = lines.length > 1 && lines.every(function (l) {
      return /^\d+[.)]\s+/.test(l);
    });
    if (numbered) {
      return '<ol class="ana-risk-ol">' + lines.map(function (l) {
        return '<li>' + l.replace(/^\d+[.)]\s+/, '') + '</li>';
      }).join('') + '</ol>';
    }

    var bullets = lines.length > 1 && lines.every(function (l) {
      return /^[-•*]\s+/.test(l);
    });
    if (bullets) {
      return '<ul class="ana-risk-ul">' + lines.map(function (l) {
        return '<li>' + l.replace(/^[-•*]\s+/, '') + '</li>';
      }).join('') + '</ul>';
    }

    if (lines.length > 1
      && /^\d+[.)]\s+/.test(lines[0])
      && lines.slice(1).every(function (l) { return /^[-•*]\s+/.test(l); })) {
      return '<div class="ana-risk-sec"><span class="ana-risk-num">'
        + lines[0].match(/^(\d+[.)])/)[1] + '</span> '
        + lines[0].replace(/^\d+[.)]\s+/, '')
        + '<ul class="ana-risk-ul">' + lines.slice(1).map(function (l) {
          return '<li>' + l.replace(/^[-•*]\s+/, '') + '</li>';
        }).join('') + '</ul></div>';
    }

    if (lines.length === 1) {
      var num = lines[0].match(/^(\d+[.)])\s+([\s\S]+)$/);
      if (num) {
        return '<div class="ana-risk-sec"><span class="ana-risk-num">' + num[1] + '</span> '
          + num[2] + '</div>';
      }
      var m = lines[0].match(/^([^:]{2,48}):\s+([\s\S]+)$/);
      if (m) {
        return '<p class="ana-risk-p"><span class="ana-risk-k">' + m[1] + ':</span> ' + m[2] + '</p>';
      }
      return '<p class="ana-risk-p">' + lines[0] + '</p>';
    }

    return '<p class="ana-risk-p">' + lines.join('<br>') + '</p>';
  }

  return '<div class="ana-risk-insight ana-risk-insight--prose">'
    + blocks.map(renderBlock).join('')
    + '</div>';
}

function zoneNamesInline(arr, max) {
  max = max || 2;
  if (!arr.length) return '';
  var shown = arr.slice(0, max).map(function (x) {
    var pct = (x.urk != null && !Number.isNaN(Number(x.urk)))
      ? (' ' + escapeInsightHtml(String(x.urk)) + '%')
      : '';
    return escapeInsightHtml(shortName(x.name)) + pct;
  });
  if (arr.length > max) shown.push('+' + (arr.length - max));
  return shown.join(', ');
}

function buildStructuredInsightHtml(ctx) {
  var levelMod = 'mute';
  if (ctx.qualityKey === 'critical') levelMod = 'low';
  else if (ctx.qualityKey === 'medium') levelMod = 'mid';
  else if (ctx.qualityKey === 'good') levelMod = 'high';

  var pct = (ctx.avgUrk != null && !Number.isNaN(Number(ctx.avgUrk)))
    ? (escapeInsightHtml(String(ctx.avgUrk)) + '%')
    : '—';

  var html = '<div class="ana-risk-insight ana-risk-insight--compact">';
  html += '<div class="ana-risk-top">';
  html += '<span class="ana-risk-level ana-risk-level--' + levelMod + '">'
    + '<span class="ana-risk-level-label">'
    + escapeInsightHtml(_t('quality.analytics.insight.html_level', 'Уровень качества'))
    + '</span>'
    + '<span class="ana-risk-level-value">'
    + escapeInsightHtml(ctx.qualityLevel) + ' · ' + pct
    + '</span></span>';
  html += '<span class="ana-risk-zones">'
    + '<span class="z z-g">🟢' + ctx.green.length + '</span>'
    + '<span class="z z-y">🟡' + ctx.yellow.length + '</span>'
    + '<span class="z z-r">🔴' + ctx.red.length + '</span>'
    + '<span class="z z-n">N&lt;7:' + ctx.lowN.length + '</span>'
    + '</span></div>';

  var focus = [];
  if (ctx.red.length) {
    focus.push('<span class="ana-risk-focus-red"><b>'
      + escapeInsightHtml(_t('quality.analytics.insight.html_red', 'Красная'))
      + ':</b> ' + zoneNamesInline(ctx.red) + '</span>');
  } else if (ctx.yellow.length) {
    focus.push('<span class="ana-risk-focus-yellow"><b>'
      + escapeInsightHtml(_t('quality.analytics.insight.html_yellow', 'Жёлтая'))
      + ':</b> ' + zoneNamesInline(ctx.yellow) + '</span>');
  }
  if (focus.length) {
    html += '<div class="ana-risk-focus">' + focus.join(' · ') + '</div>';
  }

  html += '<div class="ana-risk-action">'
    + escapeInsightHtml(ctx.action)
    + '</div>';
  html += '</div>';
  return html;
}

/** @returns {'lowN'|'red'|'yellow'|'green'} */
export function classifyContractorZone(metrics) {
  var n = Number(metrics && metrics.count) || 0;
  // Зоны по ср. УрК (baseUrkContrPerc) — тот же показатель, что KPI «Ср. УрК», не ИУрК/«надёжность».
  var urk = Number(metrics && metrics.baseUrkContrPerc);
  if (urk == null || Number.isNaN(urk)) urk = Number(metrics && metrics.finalC);
  if (n < 7 || urk == null || Number.isNaN(urk)) return 'lowN';
  if (metrics.isRedZone || urk < 70) return 'red';
  if (urk < 85) return 'yellow';
  return 'green';
}

/**
 * @param {object} opts
 * @param {Array<{name:string, metrics:object}>} opts.rows
 * @param {number} [opts.avgUrk]
 * @param {number|null} [opts.avgReliability]
 * @param {number} [opts.relN]
 * @param {number} [opts.sumB1]
 * @param {number} [opts.sumB2]
 * @param {number} [opts.sumB3]
 * @param {number} [opts.checks]
 */
export function buildRiskZonesInsight(opts) {
  opts = opts || {};
  var rows = Array.isArray(opts.rows) ? opts.rows : [];
  var green = [];
  var yellow = [];
  var red = [];
  var lowN = [];

  rows.forEach(function (r) {
    if (!r || !r.metrics) return;
    var z = classifyContractorZone(r.metrics);
    var urkVal = Number(r.metrics.baseUrkContrPerc);
    if (urkVal == null || Number.isNaN(urkVal)) urkVal = Number(r.metrics.finalC);
    var item = {
      name: shortName(r.name),
      fullName: r.name,
      urk: urkVal,
      count: r.metrics.count,
      b3: r.metrics.n_изделий_с_B3 || 0
    };
    if (z === 'green') green.push(item);
    else if (z === 'yellow') yellow.push(item);
    else if (z === 'red') red.push(item);
    else lowN.push(item);
  });

  var byUrkAsc = function (a, b) { return (Number(a.urk) || 0) - (Number(b.urk) || 0); };
  red.sort(byUrkAsc);
  yellow.sort(byUrkAsc);

  // Главная цифра блока = ср. УрК (KPI «Ср. УрК»), НЕ avgReliability / ИУрК («Надёжность»).
  var avgUrk = opts.avgUrk != null ? Number(opts.avgUrk) : 0;
  if (Number.isNaN(avgUrk)) avgUrk = 0;
  var qualityN = opts.qualityN != null
    ? Number(opts.qualityN)
    : (opts.relN != null ? Number(opts.relN) : 0);
  var checks = opts.checks != null ? Number(opts.checks) : 0;
  var sumB1 = opts.sumB1 != null ? Number(opts.sumB1) : 0;
  var sumB2 = opts.sumB2 != null ? Number(opts.sumB2) : 0;
  var sumB3 = opts.sumB3 != null ? Number(opts.sumB3) : 0;

  // Вердикт только по ср. УрК: ≥85 высокий, 70–84 приемлемый, <70 низкий.
  // Красная/жёлтая зона — в фокусе отдельно, не понижает ярлык при среднем 70+.
  var qualityLevel;
  var qualityKey;
  var scoreForLabel = avgUrk;
  if (!rows.length) {
    qualityLevel = _t('quality.analytics.insight.level_none', 'нет данных');
    qualityKey = 'none';
  } else if (green.length === 0 && yellow.length === 0 && red.length === 0 && lowN.length > 0) {
    qualityLevel = _t('quality.analytics.insight.level_insufficient', 'недостаточно данных для уверенной оценки');
    qualityKey = 'insufficient';
  } else if (scoreForLabel < 70) {
    qualityLevel = _t('quality.analytics.insight.level_low', 'НИЗКИЙ');
    qualityKey = 'critical';
  } else if (scoreForLabel < 85) {
    qualityLevel = _t('quality.analytics.insight.level_acceptable', 'ПРИЕМЛЕМЫЙ');
    qualityKey = 'medium';
  } else {
    qualityLevel = _t('quality.analytics.insight.level_high', 'ВЫСОКИЙ');
    qualityKey = 'good';
  }

  function namesList(arr, max) {
    max = max || 3;
    if (!arr.length) return '—';
    var shown = arr.slice(0, max).map(function (x) {
      return x.name + (x.urk != null && !Number.isNaN(Number(x.urk)) ? ' (' + x.urk + '%)' : '');
    });
    if (arr.length > max) shown.push('+' + (arr.length - max));
    return shown.join(', ');
  }

  // Действие — по зонам (если есть красная/жёлтая), иначе по общему уровню.
  var action;
  if (red.length > 0) {
    action = _t(
      'quality.analytics.insight.action_critical',
      'Красная зона: разбор B3/B2, усилить проверки.'
    );
  } else if (yellow.length > 0) {
    action = _t(
      'quality.analytics.insight.action_medium',
      'Жёлтая зона: точечный контроль и закрытие замечаний.'
    );
  } else if (qualityKey === 'insufficient') {
    action = _t(
      'quality.analytics.insight.action_insufficient',
      'Нужно ≥7 проверок по ключевым подрядчикам.'
    );
  } else if (qualityKey === 'none') {
    action = _t('quality.analytics.insight.action_none', 'Нет данных по фильтрам.');
  } else {
    action = _t(
      'quality.analytics.insight.action_good',
      'Держать режим; смотреть подрядчиков с N<7.'
    );
  }

  var qualityPct = avgUrk + '%';
  var qualitySample = qualityN ? (' (по ' + qualityN + ' подр. с N≥7)') : '';

  var lines = [];
  lines.push(_t(
    'quality.analytics.insight.line_level',
    'Уровень качества: {level} (ср. УрК {pct}){sample}.',
    { level: qualityLevel, pct: qualityPct, sample: qualitySample }
  ));
  lines.push(_t(
    'quality.analytics.insight.line_metrics',
    'Средний уровень качества (ср. УрК): {urk}%. Проверок: {checks}.',
    {
      urk: avgUrk,
      checks: checks
    }
  ));
  lines.push(_t(
    'quality.analytics.insight.line_zones',
    'Зоны по УрК (N≥7): зелёная {g}, жёлтая {y}, красная {r}; сбор (N<7): {low}.',
    { g: green.length, y: yellow.length, r: red.length, low: lowN.length }
  ));
  if (red.length) {
    lines.push(_t('quality.analytics.insight.line_red', 'Красная зона: {list}.', { list: namesList(red) }));
  } else if (yellow.length) {
    lines.push(_t('quality.analytics.insight.line_yellow', 'Жёлтая зона: {list}.', { list: namesList(yellow) }));
  }
  lines.push(_t('quality.analytics.insight.line_action', 'Действие: {action}', { action: action }));

  var text = lines.join('\n\n');

  var facts = [
    'Уровень качества: ' + qualityLevel + ' (ср. УрК ' + qualityPct + ')' + qualitySample,
    'Средний уровень качества = KPI «Ср. УрК» (baseUrkContrPerc): ' + avgUrk + '%',
    'НЕ использовать KPI «Надёжность» / ИУрК (finalC) для оценки уровня качества.',
    'Проверок: ' + checks,
    'Зоны по УрК N≥7 — зелёная: ' + green.length + ', жёлтая: ' + yellow.length + ', красная: ' + red.length + ', сбор N<7: ' + lowN.length,
    'Красная: ' + namesList(red, 5),
    'Жёлтая: ' + namesList(yellow, 5),
    'Дефекты B1/B2/B3: ' + sumB1 + '/' + sumB2 + '/' + sumB3,
    'Пороги: высокий УрК≥85%, приемлемый 70–84%, низкий <70%.'
  ].join('\n');

  var html = buildStructuredInsightHtml({
    qualityKey: qualityKey,
    qualityLevel: qualityLevel,
    qualityPct: qualityPct,
    qualitySample: qualitySample,
    avgUrk: avgUrk,
    checks: checks,
    green: green,
    yellow: yellow,
    red: red,
    lowN: lowN,
    sumB1: sumB1,
    sumB2: sumB2,
    sumB3: sumB3,
    action: action
  });

  return {
    text: text,
    html: html,
    facts: facts,
    qualityLevel: qualityLevel,
    qualityKey: qualityKey,
    zones: {
      green: green,
      yellow: yellow,
      red: red,
      lowN: lowN
    },
    avgUrk: avgUrk,
    avgQuality: avgUrk,
    relN: qualityN,
    checks: checks,
    sumB1: sumB1,
    sumB2: sumB2,
    sumB3: sumB3
  };
}

/**
 * Собрать insight из сырых проверок аналитики.
 * @param {Array} data
 * @param {{ getMetrics?: Function, templates?: object }} [options]
 */
export function buildRiskZonesInsightFromChecks(data, options) {
  options = options || {};
  data = Array.isArray(data) ? data : [];
  var getMetrics = options.getMetrics || window.getContractorMetrics;
  var templates = options.templates;
  if (templates == null) {
    try {
      if (window.RBI && window.RBI.services && window.RBI.services.templates
        && typeof window.RBI.services.templates.getUserTemplates === 'function') {
        templates = window.RBI.services.templates.getUserTemplates();
      } else if (typeof window.getUserTemplates === 'function') {
        templates = window.getUserTemplates();
      }
    } catch (e) { templates = {}; }
  }

  var grouped = {};
  var sumB1 = 0;
  var sumB2 = 0;
  var sumB3 = 0;
  data.forEach(function (i) {
    if (!i) return;
    if (i.metrics) {
      sumB1 += Number(i.metrics.n_B1_fail) || 0;
      sumB2 += Number(i.metrics.n_B2_fail) || 0;
      sumB3 += Number(i.metrics.n_B3_fail) || 0;
    }
    var projectLabel = i.project_display_name || i.projectName || i.project_canonical_key
      || _t('quality.analytics.fallback.no_project', 'Без объекта');
    var cKey = (i.contractorName || '—') + ' [' + projectLabel + ']';
    if (!grouped[cKey]) grouped[cKey] = [];
    grouped[cKey].push(i);
  });

  var rows = [];
  if (typeof getMetrics === 'function') {
    Object.keys(grouped).forEach(function (name) {
      var m = getMetrics(grouped[name], templates);
      if (m) rows.push({ name: name, metrics: m });
    });
  }

  var ratings = { avgUrk: 0, avgDoc: null, avgReliability: null, relN: 0 };
  if (typeof window.avgContractorRatingsFromChecks === 'function') {
    try { ratings = window.avgContractorRatingsFromChecks(data) || ratings; } catch (e) { /* ignore */ }
  }

  return buildRiskZonesInsight({
    rows: rows,
    avgUrk: ratings.avgUrk || 0,
    qualityN: ratings.relN || 0,
    sumB1: sumB1,
    sumB2: sumB2,
    sumB3: sumB3,
    checks: data.length
  });
}
