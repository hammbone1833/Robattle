/** Small DOM helpers plus the modal panel and toast plumbing every screen shares. */

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

const panels = () => document.getElementById('panels');

let onCloseHook = null;

export function openPanel({ title, sub, body, footer, onClose, wide = false }) {
  const host = panels();
  host.innerHTML = '';
  onCloseHook = onClose ?? null;

  const panel = el('div', { class: 'panel', style: wide ? 'width:min(1240px,100%)' : null },
    el('div', { class: 'panel-head' },
      el('h2', { text: title }),
      sub ? el('div', { class: 'sub', text: sub }) : null,
      el('button', { class: 'panel-close', title: 'Close (Esc)', onclick: closePanel, html: '&times;' })),
    el('div', { class: 'panel-body' }, body),
    footer ? el('div', { class: 'panel-foot' }, footer) : null);

  host.append(panel);
  host.classList.remove('hidden');
  return panel;
}

export function closePanel() {
  const host = panels();
  if (host.classList.contains('hidden')) return;
  host.classList.add('hidden');
  host.innerHTML = '';
  const fn = onCloseHook;
  onCloseHook = null;
  fn?.();
}

export function panelIsOpen() {
  return !panels().classList.contains('hidden');
}

/** Re-render the open panel's body in place, keeping scroll position. */
export function replaceBody(content) {
  const body = panels().querySelector('.panel-body');
  if (!body) return;
  const top = body.scrollTop;
  body.innerHTML = '';
  body.append(content);
  body.scrollTop = top;
}

let lastToast = { message: null, at: 0 };

export function toast(message, kind = '') {
  const host = document.getElementById('toasts');
  const now = performance.now();
  // Repeating the same message is noise, not information.
  if (message === lastToast.message && now - lastToast.at < 2000) return;
  lastToast = { message, at: now };

  const node = el('div', { class: `toast ${kind}`, text: message });
  host.append(node);
  while (host.children.length > 3) host.firstElementChild.remove();
  setTimeout(() => {
    node.style.transition = 'opacity .3s';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 320);
  }, 2600);
}

export function confirmPanel({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm }) {
  openPanel({
    title,
    body: el('p', { class: 'muted', text: message }),
    footer: [
      el('button', { class: 'btn', text: 'Cancel', onclick: closePanel }),
      el('button', {
        class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
        text: confirmLabel,
        onclick: () => { closePanel(); onConfirm?.(); },
      }),
    ],
  });
}
