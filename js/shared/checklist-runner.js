/**
 * js/shared/checklist-runner.js
 * Shared fullscreen checklist UI — audit-parity UX for construction (P).
 * Adapter API: status + photos/comment/help/escalate/swipe/collapse.
 * Does not read AuditState.
 */

const ROOT_ID = 'rbi-checklist-runner';
const HELP_SVG =
  '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"></path></svg>';
const CAM_SVG =
  '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><circle cx="12" cy="13" r="3" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></circle></svg>';
const COMMENT_SVG =
  '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>';

/** @type {{ shell: HTMLElement, opts: object, forceExpand: Set<string> } | null} */
let _active = null;

function _escape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _feat(opts, key, fallback) {
  const f = (opts && opts.features) || {};
  if (Object.prototype.hasOwnProperty.call(f, key)) return !!f[key];
  return fallback !== false;
}

function _setting(key) {
  try {
    const svc = window.RBI && window.RBI.services && window.RBI.services.settings;
    if (svc && typeof svc.get === 'function') return svc.get(key);
  } catch (_) { /* ignore */ }
  try {
    const s = window.appSettings;
    if (s && Object.prototype.hasOwnProperty.call(s, key)) return s[key];
  } catch (_) { /* ignore */ }
  return undefined;
}

function _groupTitle(g, idx) {
  return String(g.group || g.title || 'Группа ' + (idx + 1));
}

function _itemMeta(item, groupName) {
  return {
    id: String(item.id),
    name: String(item.n || ''),
    group: groupName,
    norm: item.t != null ? String(item.t) : '',
    weight: item.w != null ? Number(item.w) : null,
    raw: item
  };
}

function _statusOf(opts, id) {
  try {
    const st = opts.getStatus(String(id));
    if (st === 'ok' || st === 'fail' || st === 'na' || st === 'fail_escalated') return st;
  } catch (_) { /* ignore */ }
  return null;
}

function _detailsOf(opts, id) {
  if (typeof opts.getItemDetails !== 'function') return { comment: '', photos: [] };
  try {
    const d = opts.getItemDetails(String(id)) || {};
    const photos = Array.isArray(d.photos) ? d.photos.filter(Boolean).map(String) : [];
    return { comment: d.comment != null ? String(d.comment) : '', photos };
  } catch (_) {
    return { comment: '', photos: [] };
  }
}

function _thumbSrc(src) {
  try {
    if (typeof window.getPhotoThumbSrc === 'function') return window.getPhotoThumbSrc(src);
    if (typeof window.getPhotoSrc === 'function') return window.getPhotoSrc(src);
    const pm = window.PhotoManager;
    if (pm && typeof pm.getDisplaySrc === 'function') return pm.getDisplaySrc(src) || src;
  } catch (_) { /* ignore */ }
  return src;
}

function _countProgress(opts) {
  let total = 0;
  let done = 0;
  let ok = 0;
  let fail = 0;
  let na = 0;
  (opts.groups || []).forEach((g) => {
    (g.items || []).forEach((it) => {
      if (!it || it.id == null) return;
      total += 1;
      const st = _statusOf(opts, it.id);
      if (!st) return;
      done += 1;
      if (st === 'ok') ok += 1;
      else if (st === 'fail' || st === 'fail_escalated') fail += 1;
      else if (st === 'na') na += 1;
    });
  });
  return { total, done, ok, fail, na, unset: Math.max(0, total - done) };
}

function _photoRowHtml(id, photos, style) {
  const thumbs = (photos || [])
    .map((src, idx) => {
      const safe = _escape(src);
      const attrs = (typeof window.rbiBuildPhotoImgAttrs === 'function')
        ? window.rbiBuildPhotoImgAttrs(src, { preferThumb: true })
        : ('src="' + _escape(_thumbSrc(src)) + '"');
      return (
        `<div class="relative shrink-0">` +
        `<img data-cr-photo-view="${safe}" ${attrs} class="photo-thumb !w-11 !h-11 !rounded-[12px] border ${style.thumbBorder} shadow-sm object-cover cursor-pointer" loading="lazy">` +
        `<div data-cr-photo-remove="${idx}" class="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[12px] font-bold cursor-pointer shadow-md border border-white z-10">✕</div>` +
        `</div>`
      );
    })
    .join('');
  const addTitle = photos && photos.length ? 'Добавить ещё фото' : style.title;
  const addBtn =
    `<button type="button" data-cr-photo-add class="btn-status !w-11 !h-11 !rounded-[12px] shrink-0 shadow-sm ${style.addBtn}" title="${_escape(addTitle)}">${CAM_SVG}</button>`;
  return `<div class="flex items-center gap-1.5 shrink-0">${thumbs}${addBtn}</div>`;
}

function _helpBtnHtml(opts) {
  if (!_feat(opts, 'help', true)) return '';
  return (
    `<button type="button" data-cr-help class="btn-status text-slate-600 bg-slate-100 border-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600 !w-11 !h-11 !rounded-[12px] relative shadow-sm shrink-0" title="Инструкции и Справка">${HELP_SVG}</button>`
  );
}

function _cardHtml(item, groupName, status, opts) {
  const id = String(item.id);
  const name = String(item.n || '');
  const norm = item.t != null ? String(item.t) : '';
  const w = item.w != null ? Number(item.w) : null;
  const showWeight = _feat(opts, 'weightTag', true) && w != null && !isNaN(w);
  const showNorm = _feat(opts, 'norms', true) && !!norm;
  const showNa = _feat(opts, 'na', true);
  const showFailAction = _feat(opts, 'failAction', true) && typeof opts.onFailAction === 'function';
  const showPhotos = _feat(opts, 'photos', true) && typeof opts.addItemPhoto === 'function';
  const showComments = _feat(opts, 'comments', true) && typeof opts.setItemComment === 'function';
  const showEscalate =
    _feat(opts, 'escalate', true) &&
    typeof opts.onEscalate === 'function' &&
    w === 2;
  const showCollapse = _feat(opts, 'collapse', true);
  const details = _detailsOf(opts, id);

  const isEscalated = status === 'fail_escalated';
  const failActive = status === 'fail' || status === 'fail_escalated';
  const okActive = status === 'ok';
  const naActive = status === 'na';

  let collapseClass = '';
  let cardBg = failActive
    ? 'bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-800'
    : okActive
      ? 'bg-green-50 border-green-100 dark:bg-green-900/20 dark:border-green-800'
      : naActive
        ? 'bg-slate-50 border-slate-200 dark:bg-slate-900/40 dark:border-slate-700'
        : '';

  if (
    showCollapse &&
    okActive &&
    _setting('autoCollapseOk') &&
    !(_active && _active.forceExpand && _active.forceExpand.has(id))
  ) {
    collapseClass = 'card-collapsed';
    cardBg = '';
  }

  const indicator = okActive
    ? 'indicator-ok'
    : failActive
      ? isEscalated
        ? 'indicator-3'
        : w === 3
          ? 'indicator-3'
          : w === 2
            ? 'indicator-2'
            : 'indicator-1'
      : w === 3
        ? 'indicator-3'
        : w === 2
          ? 'indicator-2'
          : 'indicator-1';

  const weightHtml = showWeight
    ? `<span class="weight-tag wt-${_escape(String(w))}">B${_escape(String(w))}</span> `
    : '';

  const okBtn =
    `<button type="button" data-cr-set="ok" class="btn-status ${okActive ? 'bg-green-500 text-white border-green-500' : ''} !w-11 !h-11 shrink-0 shadow-sm transition-transform active:scale-90" title="OK">` +
    `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M20 6L9 17l-5-5"/></svg></button>`;

  const failBtn =
    `<button type="button" data-cr-set="fail" class="btn-status ${failActive ? 'bg-red-500 text-white border-red-500' : ''} !w-11 !h-11 shrink-0 shadow-sm transition-transform active:scale-90" title="FAIL">` +
    `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`;

  const naBtn = showNa
    ? `<button type="button" data-cr-set="na" class="btn-status ${naActive ? 'bg-slate-500 text-white border-slate-500' : ''} !w-11 !h-11 shrink-0 shadow-sm transition-transform active:scale-90 text-[10px] font-black" title="N/A">N/A</button>`
    : '';

  const failActionBtn =
    showFailAction && failActive
      ? `<button type="button" data-cr-fail-action class="text-[9px] font-black uppercase text-red-600 border border-red-200 bg-red-50 px-2 py-1.5 rounded-lg shrink-0">+ Замечание</button>`
      : '';

  const helpBtn = _helpBtnHtml(opts);
  const mainBtns = `${failActionBtn}${naBtn}${okBtn}${failBtn}`;

  let content = '';
  if (failActive) {
    const hasComment = !!(details.comment && details.comment.trim());
    const commBtn = showComments
      ? hasComment
        ? `<div class="relative shrink-0"><button type="button" data-cr-comment class="btn-status text-indigo-600 bg-indigo-50 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800 !w-11 !h-11 !rounded-[12px] shadow-sm">${COMMENT_SVG}</button><div data-cr-comment-clear class="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[12px] font-bold cursor-pointer shadow-md border border-white z-10">✕</div></div>`
        : `<button type="button" data-cr-comment class="btn-status !w-11 !h-11 !rounded-[12px] shrink-0 shadow-sm">${COMMENT_SVG}</button>`
      : '';
    const photoBtn = showPhotos
      ? _photoRowHtml(id, details.photos, {
          thumbBorder: 'border-indigo-200 dark:border-indigo-800',
          addBtn: '',
          title: 'Добавить фото'
        })
      : '';
    const escBtn = showEscalate
      ? `<button type="button" data-cr-escalate class="btn-status ${isEscalated ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400' : 'text-orange-500 bg-orange-50 border-orange-200 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400'} !w-11 !h-11 !rounded-[12px] transition-all shrink-0 shadow-sm"><span class="text-[13px] font-bold">&gt;1.5</span></button>`
      : '';
    const badge = isEscalated
      ? `<div class="text-[10px] font-black text-white bg-red-600 px-2 py-0.5 rounded w-fit mt-1 shadow-sm">Дефект учтен как B3</div>`
      : '';
    const commentBlock = hasComment
      ? `<div class="mt-2 text-[12px] font-semibold text-slate-700 dark:text-slate-300 italic bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-red-100 dark:border-red-800 shadow-sm leading-snug break-words w-full">💬 ${_escape(details.comment)}</div>`
      : '';
    content =
      `<div class="flex flex-col w-full">` +
      `<div class="w-full pointer-events-none mb-2">` +
      `<div class="text-[13px] font-bold leading-snug card-title-text text-slate-800 dark:text-white">${weightHtml}${_escape(name)}</div>` +
      badge +
      commentBlock +
      `</div>` +
      `<div class="flex justify-end items-center flex-wrap gap-1.5 w-full mt-1 border-t border-red-100 dark:border-red-800 pt-3">` +
      escBtn +
      commBtn +
      photoBtn +
      helpBtn +
      mainBtns +
      `</div></div>`;
  } else if (okActive) {
    const photoBtn = showPhotos
      ? _photoRowHtml(id, details.photos, {
          thumbBorder: 'border-green-300',
          addBtn: 'text-green-600 bg-green-50 border-green-200',
          title: 'Добавить фото эталона'
        })
      : '';
    content =
      `<div class="flex justify-between items-center w-full min-h-[44px]">` +
      `<div class="flex-1 mr-3 min-w-0 pointer-events-none">` +
      `<div class="text-[13px] font-bold leading-snug card-title-text text-slate-800 dark:text-white">${weightHtml}${_escape(name)}</div>` +
      `</div>` +
      `<div class="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">${photoBtn}${helpBtn}${mainBtns}</div>` +
      `</div>`;
  } else {
    const normHtml =
      showNorm && !okActive && !failActive
        ? `<div class="text-[11px] text-[var(--text-muted)] leading-snug norm-desc-text mt-0.5">${_escape(norm)}</div>`
        : '';
    content =
      `<div class="flex justify-between items-start w-full min-h-[44px] gap-2">` +
      `<div class="flex-1 mr-2 min-w-0 pointer-events-none">` +
      `<div class="text-[13px] font-bold leading-snug card-title-text text-slate-800 dark:text-white">${weightHtml}${_escape(name)}</div>` +
      normHtml +
      `</div>` +
      `<div class="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">${helpBtn}${mainBtns}</div>` +
      `</div>`;
  }

  const swipeOn = _feat(opts, 'swipe', true);
  const swipeBg = swipeOn
    ? `<div class="swipe-actions-bg swipe-bg-ok"><span class="ml-4">OK</span></div><div class="swipe-actions-bg swipe-bg-fail"><span class="mr-4">FAIL</span></div>`
    : '';

  return (
    `<div class="card-audit ${swipeOn ? 'swipe-container' : ''} ${indicator} ${cardBg} ${collapseClass} mb-2" data-cr-item="${_escape(id)}" data-cr-name="${_escape(name)}" data-cr-group="${_escape(groupName)}" data-cr-norm="${_escape(norm)}" data-cr-weight="${_escape(w != null && !isNaN(w) ? String(w) : '')}" data-cr-status="${_escape(status || '')}">` +
    swipeBg +
    `<div class="${swipeOn ? 'swipe-content ' : ''}p-2.5 bg-inherit border-inherit rounded-inherit h-full w-full bg-[var(--card-bg)] dark:bg-slate-800 transition-colors">${content}</div>` +
    `</div>`
  );
}

function _renderBody(opts) {
  let navHtml = '';
  let bodyHtml = '';
  (opts.groups || []).forEach((g, gIndex) => {
    const title = _groupTitle(g, gIndex);
    const items = g.items || [];
    navHtml +=
      `<button type="button" data-cr-nav="${gIndex}" class="inline-block px-3 py-1.5 min-w-fit text-[10px] font-bold uppercase rounded-xl bg-[var(--hover-bg)] text-[var(--text-muted)] border border-[var(--card-border)] transition-colors active:scale-95 shrink-0">` +
      _escape(title) +
      `</button>`;

    const cards = items
      .map((it) => {
        if (!it || it.id == null || !String(it.n || '').trim()) return '';
        return _cardHtml(it, title, _statusOf(opts, it.id), opts);
      })
      .join('');

    let doneInGroup = 0;
    items.forEach((it) => {
      if (it && it.id != null && _statusOf(opts, it.id)) doneInGroup += 1;
    });

    bodyHtml +=
      `<div class="block-title flex justify-between items-center cursor-pointer select-none rounded-lg px-2 mt-4" data-cr-toggle-group="${gIndex}">` +
      `<span data-cr-group-title="${gIndex}">▼ ${_escape(title)}</span>` +
      `<span data-cr-group-counter="${gIndex}" class="text-[10px] bg-[var(--card-border)] px-2 py-0.5 rounded text-[var(--text-muted)]">${doneInGroup}/${items.length}</span>` +
      `</div>` +
      `<div data-cr-group-content="${gIndex}" class="transition-all origin-top" style="display:block">${cards}</div>`;
  });

  return { navHtml, bodyHtml, progress: _countProgress(opts) };
}

function _progressLabel(p) {
  if (!p.total) return '0/0';
  return `${p.done}/${p.total} · OK ${p.ok} · FAIL ${p.fail} · N/A ${p.na}`;
}

function _mountShell(opts) {
  const host = opts.host || document.body;
  const existing = document.getElementById(ROOT_ID);
  if (existing) existing.remove();

  const shell = document.createElement('div');
  shell.id = ROOT_ID;
  shell.className =
    'fixed inset-0 z-[7000] flex flex-col bg-[var(--bg-color,#f8fafc)] dark:bg-slate-950';
  shell.setAttribute('data-cr-root', '1');
  shell.innerHTML =
    `<div class="shrink-0 border-b border-[var(--card-border)] bg-[var(--card-bg)] dark:bg-slate-900 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">` +
    `<div class="flex items-center justify-between gap-2 mb-2">` +
    `<div class="min-w-0">` +
    `<div class="text-[11px] font-black uppercase tracking-widest text-indigo-500">Чек-лист</div>` +
    `<div class="text-[14px] font-black text-slate-800 dark:text-white truncate" data-cr-title></div>` +
    `</div>` +
    `<button type="button" data-cr-close class="shrink-0 w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 font-black text-lg leading-none bg-white dark:bg-slate-800">✕</button>` +
    `</div>` +
    `<div class="text-[11px] font-bold text-slate-500 mb-2" data-cr-progress></div>` +
    `<div class="mb-2 hidden" data-cr-batch-wrap>` +
    `<button type="button" data-cr-batch-fail class="w-full py-2 rounded-xl bg-red-50 text-red-700 border border-red-200 text-[11px] font-black uppercase">Создать замечания по FAIL</button>` +
    `</div>` +
    `<div class="flex gap-2 overflow-x-auto pb-1 no-scrollbar" data-cr-nav></div>` +
    `</div>` +
    `<div class="flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]" data-cr-body></div>`;

  host.appendChild(shell);
  return shell;
}

function _countFailForBatch(opts) {
  let n = 0;
  (opts.groups || []).forEach((g) => {
    (g.items || []).forEach((it) => {
      if (!it || it.id == null) return;
      const st = _statusOf(opts, it.id);
      if (st === 'fail' || st === 'fail_escalated') n += 1;
    });
  });
  return n;
}

function _paint(shell, opts) {
  const painted = _renderBody(opts);
  const titleEl = shell.querySelector('[data-cr-title]');
  const progressEl = shell.querySelector('[data-cr-progress]');
  const navEl = shell.querySelector('[data-cr-nav]');
  const bodyEl = shell.querySelector('[data-cr-body]');
  const batchWrap = shell.querySelector('[data-cr-batch-wrap]');
  const batchBtn = shell.querySelector('[data-cr-batch-fail]');
  if (titleEl) titleEl.textContent = String(opts.title || opts.templateKey || 'Чек-лист');
  if (progressEl) progressEl.textContent = _progressLabel(painted.progress);
  if (navEl) navEl.innerHTML = painted.navHtml;
  if (bodyEl) bodyEl.innerHTML = painted.bodyHtml;

  const showBatch =
    _feat(opts, 'batchFail', false) && typeof opts.onBatchFailAction === 'function';
  const failN = showBatch ? _countFailForBatch(opts) : 0;
  if (batchWrap && batchBtn) {
    if (showBatch && failN > 0) {
      batchWrap.classList.remove('hidden');
      batchBtn.textContent = `Создать замечания по FAIL (${failN})`;
    } else {
      batchWrap.classList.add('hidden');
    }
  }
}

function _findItem(opts, id) {
  const sid = String(id);
  for (let gi = 0; gi < (opts.groups || []).length; gi++) {
    const g = opts.groups[gi];
    const title = _groupTitle(g, gi);
    const items = g.items || [];
    for (let ii = 0; ii < items.length; ii++) {
      if (items[ii] && String(items[ii].id) === sid) {
        return _itemMeta(items[ii], title);
      }
    }
  }
  return null;
}

function close() {
  if (!_active) return;
  const shell = _active.shell;
  const onClose = _active.opts && _active.opts.onClose;
  _active = null;
  if (shell && shell.parentNode) shell.parentNode.removeChild(shell);
  if (typeof onClose === 'function') {
    try {
      onClose();
    } catch (e) {
      console.error('[ChecklistRunner] onClose', e);
    }
  }
}

function _applyStatus(shell, opts, meta, nextStatus) {
  if (!meta || typeof opts.setStatus !== 'function') return;
  Promise.resolve(opts.setStatus(meta.id, nextStatus, meta))
    .then(() => {
      if (!_active || _active.shell !== shell) return;
      if (nextStatus === 'ok' && _active.forceExpand) _active.forceExpand.delete(meta.id);
      _paint(shell, opts);
    })
    .catch((e) => {
      console.error('[ChecklistRunner] setStatus', e);
      if (typeof window.showToast === 'function') {
        window.showToast('❌ ' + (e && e.message ? e.message : String(e)));
      }
    });
}

function _openCommentUi(shell, opts, meta) {
  const details = _detailsOf(opts, meta.id);
  const existing = document.getElementById('rbi-cr-comment-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'rbi-cr-comment-overlay';
  overlay.className = 'fixed inset-0 z-[7100] flex items-end sm:items-center justify-center bg-black/40 p-3';
  overlay.innerHTML =
    `<div class="w-full max-w-md bg-[var(--card-bg)] dark:bg-slate-900 border border-[var(--card-border)] rounded-2xl shadow-xl p-4" data-cr-cmt-panel>` +
    `<div class="text-[12px] font-black uppercase tracking-widest text-slate-500 mb-2">Комментарий</div>` +
    `<div class="text-[13px] font-bold text-slate-800 dark:text-white mb-3">${_escape(meta.name)}</div>` +
    `<textarea data-cr-cmt-text class="w-full min-h-[96px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-[13px]" placeholder="Описание дефекта">${_escape(details.comment)}</textarea>` +
    `<div class="flex gap-2 mt-3">` +
    `<button type="button" data-cr-cmt-cancel class="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[12px] font-bold">Отмена</button>` +
    `<button type="button" data-cr-cmt-save class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-[12px] font-black">Сохранить</button>` +
    `</div></div>`;
  document.body.appendChild(overlay);
  const closeCmt = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) closeCmt();
  });
  overlay.querySelector('[data-cr-cmt-cancel]')?.addEventListener('click', closeCmt);
  overlay.querySelector('[data-cr-cmt-save]')?.addEventListener('click', () => {
    const ta = overlay.querySelector('[data-cr-cmt-text]');
    const text = ta ? String(ta.value || '').trim() : '';
    Promise.resolve(opts.setItemComment(meta.id, text, meta))
      .then(() => {
        closeCmt();
        if (_active && _active.shell === shell) _paint(shell, opts);
      })
      .catch((e) => {
        console.error('[ChecklistRunner] setItemComment', e);
        if (typeof window.showToast === 'function') {
          window.showToast('❌ ' + (e && e.message ? e.message : String(e)));
        }
      });
  });
  const ta = overlay.querySelector('[data-cr-cmt-text]');
  if (ta) {
    try {
      ta.focus();
    } catch (_) { /* ignore */ }
  }
}

function _bindSwipe(shell, opts) {
  if (!_feat(opts, 'swipe', true)) return;
  const body = shell.querySelector('[data-cr-body]');
  if (!body || body._crSwipeBound) return;
  body._crSwipeBound = true;

  let startX = 0;
  let currentX = 0;
  let isDragging = false;
  let currentCard = null;
  let content = null;
  let bgOk = null;
  let bgFail = null;

  body.addEventListener(
    'touchstart',
    (e) => {
      if (!_setting('swipeEnabled')) return;
      const target = e.target.closest('.swipe-container');
      if (!target || !body.contains(target)) return;
      if (e.target.closest('.btn-status') || e.target.closest('.photo-thumb') || e.target.closest('[data-cr-photo-remove]') || e.target.closest('[data-cr-fail-action]')) return;
      currentCard = target;
      content = currentCard.querySelector('.swipe-content');
      bgOk = currentCard.querySelector('.swipe-bg-ok');
      bgFail = currentCard.querySelector('.swipe-bg-fail');
      startX = e.touches[0].clientX;
      currentX = startX;
      isDragging = true;
      currentCard.classList.add('swiping');
      if (bgOk) bgOk.style.opacity = '0';
      if (bgFail) bgFail.style.opacity = '0';
    },
    { passive: true }
  );

  body.addEventListener(
    'touchmove',
    (e) => {
      if (!isDragging || !currentCard || !content) return;
      currentX = e.touches[0].clientX;
      const diff = currentX - startX;
      const maxSwipe = 100;
      let moveX = diff;
      if (diff > maxSwipe) moveX = maxSwipe + (diff - maxSwipe) * 0.2;
      if (diff < -maxSwipe) moveX = -maxSwipe + (diff + maxSwipe) * 0.2;
      content.style.transform = `translateX(${moveX}px)`;
      if (diff > 0 && bgOk && bgFail) {
        bgOk.style.zIndex = 1;
        bgFail.style.zIndex = 0;
        bgOk.style.opacity = String(Math.min(diff / 80, 1));
        bgFail.style.opacity = '0';
      } else if (diff < 0 && bgOk && bgFail) {
        bgOk.style.zIndex = 0;
        bgFail.style.zIndex = 1;
        bgFail.style.opacity = String(Math.min(Math.abs(diff) / 80, 1));
        bgOk.style.opacity = '0';
      }
    },
    { passive: true }
  );

  body.addEventListener('touchend', () => {
    if (!isDragging || !currentCard || !content) return;
    isDragging = false;
    currentCard.classList.remove('swiping');
    const diff = currentX - startX;
    const id = currentCard.getAttribute('data-cr-item');
    content.style.transform = 'translateX(0)';
    if (bgOk) bgOk.style.opacity = '0';
    if (bgFail) bgFail.style.opacity = '0';
    const meta = _findItem(opts, id);
    if (diff > 80) {
      setTimeout(() => {
        if (!_active || _active.shell !== shell || !meta) return;
        const cur = _statusOf(opts, meta.id);
        _applyStatus(shell, opts, meta, cur === 'ok' ? null : 'ok');
      }, 150);
    } else if (diff < -80) {
      setTimeout(() => {
        if (!_active || _active.shell !== shell || !meta) return;
        const cur = _statusOf(opts, meta.id);
        _applyStatus(shell, opts, meta, cur === 'fail' || cur === 'fail_escalated' ? null : 'fail');
      }, 150);
    }
    currentCard = null;
    content = null;
    bgOk = null;
    bgFail = null;
  });
}

function _bind(shell, opts) {
  shell.addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof Element)) return;

    const closeBtn = t.closest('[data-cr-close]');
    if (closeBtn && shell.contains(closeBtn)) {
      close();
      return;
    }

    const batchBtn = t.closest('[data-cr-batch-fail]');
    if (batchBtn && shell.contains(batchBtn)) {
      if (typeof opts.onBatchFailAction === 'function') {
        Promise.resolve(opts.onBatchFailAction())
          .then(() => {
            if (_active && _active.shell === shell) _paint(shell, opts);
          })
          .catch((e) => {
            console.error('[ChecklistRunner] onBatchFailAction', e);
            if (typeof window.showToast === 'function') {
              window.showToast('❌ ' + (e && e.message ? e.message : String(e)));
            }
          });
      }
      return;
    }

    const navBtn = t.closest('[data-cr-nav]');
    if (navBtn && shell.contains(navBtn)) {
      const navIdx = navBtn.getAttribute('data-cr-nav');
      const target = shell.querySelector(`[data-cr-toggle-group="${navIdx}"]`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const toggle = t.closest('[data-cr-toggle-group]');
    if (toggle && shell.contains(toggle)) {
      const gIdx = toggle.getAttribute('data-cr-toggle-group');
      const content = shell.querySelector(`[data-cr-group-content="${gIdx}"]`);
      const titleSpan = shell.querySelector(`[data-cr-group-title="${gIdx}"]`);
      if (content) {
        const hidden = content.style.display === 'none';
        content.style.display = hidden ? 'block' : 'none';
        if (titleSpan) {
          const raw = titleSpan.textContent || '';
          const name = raw.replace(/^[▼▶]\s*/, '');
          titleSpan.textContent = (hidden ? '▼ ' : '▶ ') + name;
        }
      }
      return;
    }

    const card = t.closest('[data-cr-item]');
    if (!card || !shell.contains(card)) return;
    const meta = _findItem(opts, card.getAttribute('data-cr-item'));
    if (!meta) return;

    if (card.classList.contains('card-collapsed')) {
      if (_active) _active.forceExpand.add(meta.id);
      _paint(shell, opts);
      return;
    }

    if (t.closest('[data-cr-fail-action]')) {
      if (typeof opts.onFailAction === 'function') {
        try {
          opts.onFailAction(meta);
        } catch (e) {
          console.error('[ChecklistRunner] onFailAction', e);
        }
      }
      return;
    }

    if (t.closest('[data-cr-help]')) {
      if (typeof opts.onHelp === 'function') {
        try {
          opts.onHelp(meta.id, ev, meta);
        } catch (e) {
          console.error('[ChecklistRunner] onHelp', e);
        }
      }
      return;
    }

    if (t.closest('[data-cr-escalate]')) {
      if (typeof opts.onEscalate === 'function') {
        Promise.resolve(opts.onEscalate(meta.id, meta))
          .then(() => {
            if (_active && _active.shell === shell) _paint(shell, opts);
          })
          .catch((e) => console.error('[ChecklistRunner] onEscalate', e));
      }
      return;
    }

    if (t.closest('[data-cr-comment-clear]')) {
      if (typeof opts.setItemComment === 'function') {
        Promise.resolve(opts.setItemComment(meta.id, '', meta))
          .then(() => {
            if (_active && _active.shell === shell) _paint(shell, opts);
          })
          .catch((e) => console.error('[ChecklistRunner] clearComment', e));
      }
      return;
    }

    if (t.closest('[data-cr-comment]')) {
      _openCommentUi(shell, opts, meta);
      return;
    }

    const photoView = t.closest('[data-cr-photo-view]');
    if (photoView) {
      const src = photoView.getAttribute('data-cr-photo-view');
      if (src && typeof window.openPhotoViewer === 'function') {
        try {
          window.openPhotoViewer(src);
        } catch (e) {
          console.error('[ChecklistRunner] openPhotoViewer', e);
        }
      }
      return;
    }

    const photoRemove = t.closest('[data-cr-photo-remove]');
    if (photoRemove) {
      const idx = Number(photoRemove.getAttribute('data-cr-photo-remove'));
      if (!confirm('Удалить фото?')) return;
      if (typeof opts.removeItemPhoto === 'function') {
        Promise.resolve(opts.removeItemPhoto(meta.id, idx, meta))
          .then(() => {
            if (_active && _active.shell === shell) _paint(shell, opts);
          })
          .catch((e) => console.error('[ChecklistRunner] removeItemPhoto', e));
      }
      return;
    }

    if (t.closest('[data-cr-photo-add]')) {
      if (typeof opts.addItemPhoto === 'function') {
        Promise.resolve(opts.addItemPhoto(meta.id, meta))
          .then(() => {
            if (_active && _active.shell === shell) _paint(shell, opts);
          })
          .catch((e) => {
            console.error('[ChecklistRunner] addItemPhoto', e);
            if (typeof window.showToast === 'function') {
              window.showToast('❌ ' + (e && e.message ? e.message : String(e)));
            }
          });
      }
      return;
    }

    const setBtn = t.closest('[data-cr-set]');
    if (!setBtn) return;
    const nextStatus = setBtn.getAttribute('data-cr-set');
    if (nextStatus !== 'ok' && nextStatus !== 'fail' && nextStatus !== 'na') return;
    const cur = card.getAttribute('data-cr-status') || '';
    // toggle-same-status (как audit toggleOk / toggleFail)
    if (cur === nextStatus || (nextStatus === 'fail' && cur === 'fail_escalated')) {
      _applyStatus(shell, opts, meta, null);
      return;
    }
    _applyStatus(shell, opts, meta, nextStatus);
  });

  _bindSwipe(shell, opts);
}

/**
 * @param {object} options
 * @param {HTMLElement} [options.host]
 * @param {string} options.title
 * @param {string} options.templateKey
 * @param {Array} options.groups
 * @param {(id: string) => string|null} options.getStatus
 * @param {(id: string, status: string|null, itemMeta: object) => void|Promise<void>} options.setStatus
 * @param {(id: string) => ({comment?: string, photos?: string[]})} [options.getItemDetails]
 * @param {(id: string, comment: string, itemMeta: object) => void|Promise<void>} [options.setItemComment]
 * @param {(id: string, itemMeta: object) => void|Promise<void>} [options.addItemPhoto]
 * @param {(id: string, index: number, itemMeta: object) => void|Promise<void>} [options.removeItemPhoto]
 * @param {(id: string, event: Event, itemMeta: object) => void} [options.onHelp]
 * @param {(id: string, itemMeta: object) => void|Promise<void>} [options.onEscalate]
 * @param {(item: object) => void} [options.onFailAction]
 * @param {() => void|Promise<void>} [options.onBatchFailAction]
 * @param {() => void} [options.onClose]
 * @param {object} [options.features]
 * @param {boolean} [options.features.batchFail]
 */
export function open(options) {
  const opts = options || {};
  if (typeof opts.getStatus !== 'function' || typeof opts.setStatus !== 'function') {
    console.error('[ChecklistRunner] getStatus/setStatus required');
    return null;
  }
  if (_active) close();
  const shell = _mountShell(opts);
  _active = { shell, opts, forceExpand: new Set() };
  _paint(shell, opts);
  _bind(shell, opts);
  return {
    close,
    refresh() {
      if (_active && _active.shell === shell) _paint(shell, opts);
    },
    el: shell
  };
}

export function isOpen() {
  return !!_active;
}

export { close };

export const ChecklistRunner = { open, close, isOpen };

if (typeof window !== 'undefined') {
  window.ChecklistRunner = ChecklistRunner;
  window.RBI = window.RBI || {};
  window.RBI.shared = window.RBI.shared || {};
  window.RBI.shared.checklistRunner = ChecklistRunner;
  if (window.RBI.registry && typeof window.RBI.registry.register === 'function') {
    try {
      window.RBI.registry.register('shared.checklistRunner', ChecklistRunner);
    } catch (_) { /* ignore */ }
  }
}
