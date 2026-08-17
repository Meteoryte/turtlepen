const byId = (id) => document.getElementById(id);
const hiddenPages = new Set();
const pending = new Map();
let socket = null;
let reconnectDelay = 400;
let current = null;
let selectedId = null;
let selectedFinding = null;
let draftDirty = false;
let draftRevision = null;
let zoomMode = 'fit';

const severityLabel = { S0: 'CRITICAL', S1: 'ERROR', S2: 'WARN', S3: 'INFO' };
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const options = (values, selected = null) => values.map((value) =>
  `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(value)}</option>`).join('');

function setConnection(state, text) {
  const node = byId('connection');
  node.dataset.state = state;
  node.textContent = text;
}

function setOperation(text = '', kind = '') {
  const node = byId('operation');
  node.textContent = text;
  node.className = `operation${kind ? ` ${kind}` : ''}`;
}

function connect() {
  setConnection('connecting', 'Connecting');
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}/ws`);
  socket.addEventListener('open', () => {
    reconnectDelay = 400;
    setConnection('live', 'Live');
  });
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return setOperation('Invalid server message', 'error'); }
    if (message.type === 'state') renderState(message.state);
    if (message.type === 'result') {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.ok) {
        draftDirty = false;
        setOperation(request?.success ?? 'Saved');
        request?.resolve(message.text);
      } else {
        setOperation(message.error, 'error');
        request?.reject(new Error(message.error));
      }
    }
    if (message.type === 'error') setOperation(message.error, 'error');
  });
  socket.addEventListener('close', () => {
    setConnection('offline', 'Reconnecting');
    for (const request of pending.values()) request.reject(new Error('Connection closed'));
    pending.clear();
    updateHistoryButtons();
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 5000);
  });
  socket.addEventListener('error', () => socket.close());
}

function callTool(tool, args, success) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    setOperation('Editor is offline', 'error');
    return Promise.reject(new Error('Editor is offline'));
  }
  const id = crypto.randomUUID();
  setOperation('Applying change', 'busy');
  socket.send(JSON.stringify({ type: 'call', id, tool, args }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject, success }));
}

function renderState(state) {
  current = state;
  if (!state.ok) {
    byId('doc').textContent = state.error;
    byId('stage').replaceChildren();
    byId('pages').replaceChildren();
    byId('inspector').innerHTML = '<div class="empty">No document</div>';
    byId('log').innerHTML = '<div class="empty">No collision log</div>';
    byId('ascii').textContent = '';
    byId('counts').replaceChildren();
    updateHistoryButtons();
    setOperation(state.error, 'error');
    return;
  }

  if (selectedId && !state.elements.some((element) => element.id === selectedId)) {
    selectedId = null;
    draftDirty = false;
  }
  byId('doc').textContent = `${state.name}  |  r${state.revision}  |  ${state.lattice.pxPerCell}px cells`;
  renderCounts(state.summary);
  renderPages(state.pages);
  renderStage(state.svg);
  renderInspector();
  renderFindings(state.findings, state.accepted, state.stale);
  byId('ascii').textContent = state.ascii;
  updateHistoryButtons();
}

function renderCounts(summary) {
  const badge = (severity, count) => count ? `<span class="badge ${severity}">${severity} ${count}</span>` : '';
  const primary = summary.clean
    ? `<span class="badge clean">Clean</span>${badge('S2', summary.S2)}${badge('S3', summary.S3)}`
    : badge('S0', summary.S0) + badge('S1', summary.S1) + badge('S2', summary.S2) + badge('S3', summary.S3);
  const audit = summary.accepted ? `<span class="badge accepted">Accepted ${summary.accepted}</span>` : '';
  const stale = summary.stale ? `<span class="badge stale">Stale ${summary.stale}</span>` : '';
  byId('counts').innerHTML = primary + audit + stale;
}

function renderPages(pages) {
  byId('pages').innerHTML = pages.map((page) =>
    `<label class="${hiddenPages.has(page.id) ? '' : 'on'}"><input type="checkbox" data-page="${escapeHtml(page.id)}"${hiddenPages.has(page.id) ? '' : ' checked'}> ${escapeHtml(page.id)} z:${page.z} ${escapeHtml(page.intent)}</label>`).join('');
}

function renderStage(svg) {
  const stage = byId('stage');
  stage.innerHTML = svg;
  for (const node of stage.querySelectorAll('[data-element]')) {
    const element = current.elements.find((entry) => entry.id === node.dataset.element);
    if (element?.kind === 'image' && element.bounds) {
      // Sparse dither has no painted pixels in most of its footprint. Give the
      // image an invisible, viewer-only hit surface so its whitespace remains
      // selectable without changing the exported SVG or document geometry.
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const q = current.lattice.pxPerQuadrant;
      hit.classList.add('selection-hit');
      hit.setAttribute('x', element.bounds.x * q);
      hit.setAttribute('y', element.bounds.y * q);
      hit.setAttribute('width', element.bounds.w * q);
      hit.setAttribute('height', element.bounds.h * q);
      hit.setAttribute('fill', 'transparent');
      hit.setAttribute('pointer-events', 'all');
      node.prepend(hit);
    }
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', `Select ${node.dataset.element}`);
    node.classList.toggle('is-selected', node.dataset.element === selectedId);
  }
  applyPageVisibility();
  requestAnimationFrame(applyZoom);
}

function applyPageVisibility() {
  for (const group of document.querySelectorAll('#stage g[data-page]')) {
    group.classList.toggle('page-hidden', hiddenPages.has(group.dataset.page));
  }
}

function applyZoom() {
  const stage = byId('stage');
  const svg = stage.querySelector('svg');
  if (!svg) return;
  const nativeWidth = Number(svg.getAttribute('width'));
  const nativeHeight = Number(svg.getAttribute('height'));
  if (!Number.isFinite(nativeWidth) || !Number.isFinite(nativeHeight) || nativeWidth <= 0 || nativeHeight <= 0) return;
  const scale = zoomMode === 'fit'
    ? Math.min(Math.max(0.1, (stage.clientWidth - 36) / nativeWidth), Math.max(0.1, (stage.clientHeight - 36) / nativeHeight))
    : Number(zoomMode) / 100;
  svg.style.width = `${Math.round(nativeWidth * scale)}px`;
  svg.style.height = `${Math.round(nativeHeight * scale)}px`;
}

function selectedElement() {
  return current?.elements.find((element) => element.id === selectedId) ?? null;
}

function renderInspector(force = false) {
  const inspector = byId('inspector');
  const element = selectedElement();
  if (!element) {
    inspector.className = 'empty';
    inspector.textContent = 'No selection';
    return;
  }
  if (!force && draftDirty && inspector.dataset.element === element.id) {
    if (draftRevision !== current.revision) {
      let warning = inspector.querySelector('.draft-warning');
      if (!warning) {
        warning = document.createElement('div');
        warning.className = 'draft-warning';
        inspector.prepend(warning);
      }
      warning.textContent = 'Document changed; draft retained';
    }
    return;
  }
  inspector.className = '';
  inspector.dataset.element = element.id;
  inspector.innerHTML = inspectorHtml(element);
  draftDirty = false;
  draftRevision = current.revision;
}

function inspectorHtml(element) {
  const group = current.groups.find((entry) => entry.members.includes(element.id));
  const incoming = current.constraints.find((entry) => entry.dependent === element.id);
  const outgoing = current.constraints.filter((entry) => entry.target === element.id);
  const movable = `<div class="control-block"><h3>Position</h3><div class="nudge"><div class="icon-grid" aria-label="Move element"><button type="button" class="up" data-move-y="-1" title="Move up">↑</button><button type="button" class="left" data-move-x="-1" title="Move left">←</button><button type="button" class="down" data-move-y="1" title="Move down">↓</button><button type="button" class="right" data-move-x="1" title="Move right">→</button></div><label class="field">Step (cells)<select id="move-step">${options(['1', '5', '10'], '1')}</select></label></div></div>`;
  const sized = element.kind !== 'path' && !(element.kind === 'image' && element.mode !== 'embed') ? `<form class="control-block" data-form="resize"><h3>Size</h3><div class="field-grid"><label class="field">Width (cells)<input name="cellsW" type="number" min="1" step="1" required value="${element.cells.w}"></label><label class="field">Height (cells)<input name="cellsH" type="number" min="1" step="1" required value="${element.cells.h}"></label><label class="field wide">Pinned corner<select name="anchor">${options(['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'], 'tl')}</select></label></div><div class="command-row"><button type="submit">Apply size</button></div></form>` : '';
  const imageFacts = element.kind === 'image' && element.scale
    ? `<dt>Mode</dt><dd>${escapeHtml(element.mode)}</dd><dt>Render</dt><dd>${escapeHtml(element.scale.render.direction)} ${element.scale.render.contentPx.width} x ${element.scale.render.contentPx.height}px | ${escapeHtml(element.scale.fit)}</dd><dt>Sampling</dt><dd>${escapeHtml(element.scale.sampling.direction)} | ${escapeHtml(element.scale.sampling.content.width)} x ${escapeHtml(element.scale.sampling.content.height)} ${escapeHtml(element.scale.sampling.content.unit)}</dd>${element.ditherStats ? `<dt>Readability</dt><dd>${escapeHtml(element.ditherStats.readability)} | ${(element.ditherStats.transitionRatio * 100).toFixed(1)}% transitions</dd>` : ''}${element.processing ? `<dt>Simplification</dt><dd>${escapeHtml(element.processing.resolvedDetail)} detail | ${escapeHtml(element.processing.strategy)} | ${element.processing.resolvedSupersample ?? 1}x working canvas${element.processing.workingCanvas ? ` ${element.processing.workingCanvas.width} x ${element.processing.workingCanvas.height}` : ''} -> 1x | ${element.processing.removedSamples} samples removed</dd>` : ''}`
    : '';
  const restyle = ['box', 'text'].includes(element.kind) ? `<form class="control-block" data-form="restyle"><h3>Content and style</h3><div class="field-grid"><label class="field wide">${element.kind === 'text' ? 'Text' : 'Label'}<input name="label" value="${escapeHtml(element.label)}"></label><label class="field">Alignment<select name="align">${options(['left', 'center', 'right'], element.align)}</select></label><label class="field">Font size (px)<input name="fontSize" type="number" min="1" step="1" value="${element.fontSize}"></label>${element.kind === 'box' ? `<label class="field">Corners<select name="corner">${options(['square', 'rounded', 'indented', 'chamfered'], element.corner)}</select></label><label class="field">Fill (hex)<input name="fill" pattern="#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?" value="${escapeHtml(element.fill ?? '')}" placeholder="#e9e7e1"></label>` : ''}</div><div class="command-row"><button type="submit">Apply changes</button></div></form>` : '';

  const pathEditor = element.kind === 'path' ? `<form class="control-block" data-form="extend-path"><h3>Extend path</h3><label class="field">Pen program<textarea name="program" required></textarea></label><div class="command-row"><button type="submit">Extend</button></div></form><form class="control-block" data-form="replace-path"><h3>Replace path</h3><label class="field">Pen program<textarea name="program" required></textarea></label><div class="command-row"><button type="submit">Replace</button></div></form>` : '';
  return `<div class="selection-title"><strong>${escapeHtml(element.id)}</strong><span>${escapeHtml(element.kind)}</span></div><dl class="facts"><dt>Page</dt><dd>${escapeHtml(element.page)}</dd><dt>Address</dt><dd>${escapeHtml(element.at)}</dd><dt>Size</dt><dd>${element.cells ? `${element.cells.w} x ${element.cells.h} cells` : 'n/a'}</dd>${imageFacts}</dl>${movable}${sized}${restyle}${pathEditor}${groupHtml(element, group)}${constraintHtml(element, incoming, outgoing)}<div class="control-block"><button type="button" class="danger" data-delete>Delete element</button></div>`;
}

function groupHtml(element, group) {
  if (group) {
    return `<div class="control-block"><h3>Group</h3><div class="relation">${escapeHtml(group.id)} | ${group.members.map(escapeHtml).join(', ')}</div><div class="nudge"><div class="icon-grid" aria-label="Move group"><button type="button" class="up" data-group="${escapeHtml(group.id)}" data-group-y="-1" title="Move group up">↑</button><button type="button" class="left" data-group="${escapeHtml(group.id)}" data-group-x="-1" title="Move group left">←</button><button type="button" class="down" data-group="${escapeHtml(group.id)}" data-group-y="1" title="Move group down">↓</button><button type="button" class="right" data-group="${escapeHtml(group.id)}" data-group-x="1" title="Move group right">→</button></div><label class="field">Step (cells)<select class="group-step">${options(['1', '5', '10'], '1')}</select></label></div><div class="command-row"><button type="button" data-group-remove="${escapeHtml(group.id)}">Remove membership</button><button type="button" class="danger" data-group-delete="${escapeHtml(group.id)}">Delete group</button></div></div>`;
  }
  const available = current.groups.filter((entry) => !entry.members.includes(element.id));
  return `<div class="control-block"><h3>Group</h3><form data-form="new-group"><div class="field-grid"><label class="field">ID<input name="id" required value="${escapeHtml(element.id)}-group"></label><label class="field">Label<input name="label" value="${escapeHtml(element.id)} group"></label></div><div class="command-row"><button type="submit">Create group</button></div></form>${available.length ? `<form data-form="add-group"><label class="field">Existing group<select name="id">${options(available.map((entry) => entry.id))}</select></label><div class="command-row"><button type="submit">Add membership</button></div></form>` : ''}</div>`;
}

function constraintHtml(element, incoming, outgoing) {
  const anchors = ['C', 'N', 'E', 'S', 'W', 'NW', 'NE', 'SE', 'SW'];
  let body = '';
  if (incoming) {
    body += `<div class="relation">${escapeHtml(incoming.id)} | follows ${escapeHtml(incoming.target)}.${escapeHtml(incoming.targetAnchor)} | offset ${incoming.offset.x}, ${incoming.offset.y} quadrants | ${incoming.synchronized ? 'synchronized' : `actual ${incoming.actualOffset.x}, ${incoming.actualOffset.y}`}</div><div class="command-row"><button type="button" data-constraint-sync="${escapeHtml(incoming.id)}">Sync</button><button type="button" data-constraint-delete="${escapeHtml(incoming.id)}">Delete relationship</button></div>`;
  } else {
    const targets = current.elements.filter((entry) => entry.id !== element.id).map((entry) => entry.id);
    body += targets.length ? `<form data-form="new-constraint"><div class="field-grid"><label class="field wide">ID<input name="id" required value="${escapeHtml(element.id)}-follow"></label><label class="field wide">Target<select name="target">${options(targets)}</select></label><label class="field">This anchor<select name="dependentAnchor">${options(anchors, 'C')}</select></label><label class="field">Target anchor<select name="targetAnchor">${options(anchors, 'C')}</select></label><label class="field">Offset X (quadrants)<input name="offsetX" type="number" step="1"></label><label class="field">Offset Y (quadrants)<input name="offsetY" type="number" step="1"></label></div><div class="command-row"><button type="submit">Create relationship</button></div></form>` : '<div class="empty">No available target</div>';
  }
  for (const relation of outgoing) body += `<div class="relation">${escapeHtml(relation.dependent)} follows via ${escapeHtml(relation.id)}</div>`;
  return `<div class="control-block"><h3>Follow relationships</h3>${body}</div>`;
}

function renderFindings(findings, accepted = [], stale = []) {
  const log = byId('log');
  if (!findings.length && !accepted.length && !stale.length) {
    log.className = 'empty';
    log.innerHTML = 'No findings';
    return;
  }
  log.className = '';
  const openHtml = findings.length
    ? `<h3 class="log-heading">Open</h3>${findings.map((finding) => `<div class="finding ${finding.severity}${finding.fingerprint === selectedFinding ? ' selected' : ''}" data-fingerprint="${finding.fingerprint}" data-selectable tabindex="0"><div class="rule">${severityLabel[finding.severity]} | ${escapeHtml(finding.rule)} ${escapeHtml(finding.title)} | ${escapeHtml(finding.page)}</div><div class="message">${escapeHtml(finding.message)}</div>${finding.cellSummary ? `<div class="fix">At ${escapeHtml(finding.cellSummary)}</div>` : ''}${finding.fixes.map((fix) => `<div class="fix">Fix: ${escapeHtml(fix.description)}</div>`).join('')}<div class="fingerprint">#${finding.fingerprint}</div><div class="finding-actions"><button type="button" data-accept="${finding.fingerprint}">Accept</button></div></div>`).join('')}`
    : '';
  const acceptedHtml = accepted.length
    ? `<h3 class="log-heading">Accepted</h3>${accepted.map((finding) => `<div class="finding accepted"><div class="rule">ACCEPTED | ${escapeHtml(finding.rule)} ${escapeHtml(finding.title)} | ${escapeHtml(finding.page)}</div><div class="message">${escapeHtml(finding.message)}</div><div class="fix">Reason: ${escapeHtml(finding.reason)}</div><div class="fingerprint">#${finding.fingerprint}</div><div class="finding-actions"><button type="button" data-unaccept="${finding.fingerprint}">Withdraw</button></div></div>`).join('')}`
    : '';
  const staleHtml = stale.length
    ? `<h3 class="log-heading">Stale acceptances</h3>${stale.map((entry) => `<div class="finding stale"><div class="rule">STALE | ${escapeHtml(entry.rule ?? 'recorded finding')}${entry.page ? ` | ${escapeHtml(entry.page)}` : ''}</div><div class="message">Geometry changed; this acceptance no longer applies.</div><div class="fix">Reason: ${escapeHtml(entry.reason)}</div><div class="fingerprint">#${escapeHtml(entry.fingerprint)}</div><div class="finding-actions"><button type="button" data-unaccept="${escapeHtml(entry.fingerprint)}">Withdraw</button></div></div>`).join('')}`
    : '';
  log.innerHTML = openHtml + acceptedHtml + staleHtml;
}

function updateHistoryButtons() {
  const live = socket?.readyState === WebSocket.OPEN && current?.ok;
  byId('undo').disabled = !live || !current.history.undo;
  byId('redo').disabled = !live || !current.history.redo;
  byId('undo').title = current?.history?.nextUndo ? `Undo ${current.history.nextUndo}` : 'Undo';
  byId('redo').title = current?.history?.nextRedo ? `Redo ${current.history.nextRedo}` : 'Redo';
}

function selectElement(id) {
  if (draftDirty && id !== selectedId && !confirm('Discard the current draft?')) return;
  selectedId = id;
  draftDirty = false;
  renderStage(current.svg);
  renderInspector(true);
}

byId('pages').addEventListener('change', (event) => {
  const id = event.target.dataset.page;
  if (!id) return;
  if (event.target.checked) hiddenPages.delete(id); else hiddenPages.add(id);
  event.target.closest('label').classList.toggle('on', event.target.checked);
  applyPageVisibility();
});

byId('stage').addEventListener('click', (event) => {
  const node = event.target.closest('[data-element]');
  if (node) selectElement(node.dataset.element);
});
byId('stage').addEventListener('keydown', (event) => {
  const node = event.target.closest('[data-element]');
  if (node && ['Enter', ' '].includes(event.key)) { event.preventDefault(); selectElement(node.dataset.element); }
});

byId('inspector').addEventListener('input', () => {
  if (!draftDirty) draftRevision = current?.revision ?? null;
  draftDirty = true;
});

byId('inspector').addEventListener('click', async (event) => {
  const element = selectedElement();
  if (!element) return;
  const moveX = event.target.dataset.moveX;
  const moveY = event.target.dataset.moveY;
  if (moveX || moveY) {
    const step = Number(byId('move-step').value);
    await callTool('move', { id: element.id, cellsX: Number(moveX ?? 0) * step, cellsY: Number(moveY ?? 0) * step }, `Moved ${element.id}`).catch(() => {});
  }
  if (event.target.matches('[data-delete]') && confirm(`Delete ${element.id}?`)) {
    await callTool('remove', { id: element.id }, `Deleted ${element.id}`).catch(() => {});
  }
  if (event.target.dataset.groupRemove) {
    await callTool('group', { action: 'remove', id: event.target.dataset.groupRemove, members: [element.id] }, `Removed ${element.id} from group`).catch(() => {});
  }
  if (event.target.dataset.groupDelete && confirm(`Delete group ${event.target.dataset.groupDelete}?`)) {
    await callTool('group', { action: 'delete', id: event.target.dataset.groupDelete }, `Deleted group`).catch(() => {});
  }
  if (event.target.dataset.group) {
    const step = Number(event.target.closest('.nudge').querySelector('.group-step').value);
    await callTool('group', {
      action: 'move', id: event.target.dataset.group,
      cellsX: Number(event.target.dataset.groupX ?? 0) * step,
      cellsY: Number(event.target.dataset.groupY ?? 0) * step,
    }, `Moved group ${event.target.dataset.group}`).catch(() => {});
  }
  if (event.target.dataset.constraintDelete) {
    await callTool('constraint', { action: 'delete', id: event.target.dataset.constraintDelete }, `Deleted relationship`).catch(() => {});
  }
  if (event.target.dataset.constraintSync) {
    await callTool('constraint', { action: 'sync', id: event.target.dataset.constraintSync }, 'Synchronized relationship').catch(() => {});
  }
});

byId('inspector').addEventListener('submit', async (event) => {
  event.preventDefault();
  const element = selectedElement();
  if (!element) return;
  if (draftDirty && draftRevision !== current.revision) {
    draftRevision = current.revision;
    setOperation('Document changed; review the retained draft and apply again', 'error');
    return;
  }
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  let request;
  if (form.dataset.form === 'resize') request = ['resize', { id: element.id, cellsW: Number(data.cellsW), cellsH: Number(data.cellsH), anchor: data.anchor }, `Resized ${element.id}`];
  if (form.dataset.form === 'restyle') {
    const args = { id: element.id, label: data.label, align: data.align, fontSize: Number(data.fontSize) };
    if (element.kind === 'box') { args.corner = data.corner; if (data.fill) args.fill = data.fill; }
    request = ['restyle', args, `Updated ${element.id}`];
  }
  if (form.dataset.form === 'new-group') request = ['group', { action: 'create', id: data.id, label: data.label, members: [element.id] }, `Created group ${data.id}`];
  if (form.dataset.form === 'add-group') request = ['group', { action: 'add', id: data.id, members: [element.id] }, `Added ${element.id} to ${data.id}`];
  if (form.dataset.form === 'new-constraint') {
    const args = { action: 'create', id: data.id, dependent: element.id, target: data.target, dependentAnchor: data.dependentAnchor, targetAnchor: data.targetAnchor };
    if (data.offsetX !== '' || data.offsetY !== '') {
      if (data.offsetX === '' || data.offsetY === '') return setOperation('Both offsets are required when either is set', 'error');
      args.offsetX = Number(data.offsetX); args.offsetY = Number(data.offsetY);
    }
    request = ['constraint', args, `Created relationship ${data.id}`];
  }
  if (form.dataset.form === 'extend-path') request = ['extend_path', { id: element.id, program: data.program }, `Extended ${element.id}`];
  if (form.dataset.form === 'replace-path') request = ['replace_path', { id: element.id, program: data.program }, `Replaced ${element.id}`];
  if (request) await callTool(...request).catch(() => {});
});

byId('log').addEventListener('click', async (event) => {
  const unaccept = event.target.dataset.unaccept;
  if (unaccept) {
    event.stopPropagation();
    await callTool('unaccept_finding', { fingerprint: unaccept }, 'Acceptance withdrawn').catch(() => {});
    return;
  }
  const accept = event.target.dataset.accept;
  if (accept) {
    event.stopPropagation();
    const reason = prompt('Reason this finding is intentional:');
    if (reason?.trim()) await callTool('accept_finding', { fingerprint: accept, reason: reason.trim() }, 'Finding accepted').catch(() => {});
    return;
  }
  const finding = event.target.closest('.finding');
  if (!finding?.matches('[data-selectable]')) return;
  toggleFinding(finding.dataset.fingerprint);
});

byId('log').addEventListener('keydown', (event) => {
  if (!['Enter', ' '].includes(event.key) || event.target.closest('button')) return;
  const finding = event.target.closest('.finding[data-selectable]');
  if (!finding) return;
  event.preventDefault();
  toggleFinding(finding.dataset.fingerprint);
});

function toggleFinding(fingerprint) {
  selectedFinding = fingerprint === selectedFinding ? null : fingerprint;
  renderFindings(current.findings, current.accepted, current.stale);
  const marks = document.querySelectorAll(`#stage rect[data-fp="${CSS.escape(selectedFinding ?? '')}"]`);
  marks[0]?.scrollIntoView({ block: 'center', inline: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

byId('undo').addEventListener('click', () => callTool('history', { action: 'undo' }, 'Undid last change').catch(() => {}));
byId('redo').addEventListener('click', () => callTool('history', { action: 'redo' }, 'Redid change').catch(() => {}));
byId('zoom').addEventListener('change', (event) => { zoomMode = event.target.value; applyZoom(); });
window.addEventListener('resize', () => { if (zoomMode === 'fit') applyZoom(); });

connect();
