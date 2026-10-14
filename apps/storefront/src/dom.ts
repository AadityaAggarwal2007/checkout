/**
 * Tiny DOM helper. Text always goes in as text (never innerHTML), so merchant or product
 * strings can never inject markup. Only our own static SVG icons use innerHTML.
 */
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | null | undefined>;

export function h(tag: string, attrs: Attrs = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

/** Static, trusted SVG markup from icons.ts only. */
export function svg(markup: string, cls = 'ck-i'): HTMLElement {
  const span = document.createElement('span');
  span.className = cls;
  span.innerHTML = markup;
  return span;
}

/** Safe CSS url(): only quotes, backslashes and new lines are escaped (data: URIs stay intact). */
export function cssUrl(url: string): string {
  return `url("${url.replace(/["\\\n\r]/g, (c) => encodeURIComponent(c))}")`;
}
