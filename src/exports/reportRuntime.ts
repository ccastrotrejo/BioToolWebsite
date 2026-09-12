export const REPORT_STYLE = `
:root{color-scheme:light;--bg:#f4f6f5;--panel:#fff;--ink:#182923;--muted:#495e55;--line:#c4d1ca;--accent:#24654f;--track:#e3ebe6}
:root[data-theme=dark]{color-scheme:dark;--bg:#121d19;--panel:#1b2a23;--ink:#edf6ef;--muted:#b8cbbd;--line:#4a6052;--accent:#9fd9b0;--track:#30483a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:32px 20px}
header{border-bottom:3px solid var(--accent);padding-bottom:20px}h1{font-size:clamp(1.8rem,4vw,2.8rem);line-height:1.15}h2{font-size:1.35rem}h3{font-size:1.1rem}
section{margin:24px 0;padding:24px;background:var(--panel);border:1px solid var(--line);border-radius:8px}p,li,td,th{overflow-wrap:anywhere}
.toolbar,.controls{display:flex;flex-wrap:wrap;align-items:center;gap:12px}.toolbar{justify-content:space-between}.brand{font-weight:700;letter-spacing:.12em}.muted,caption{color:var(--muted)}
button,select{font:inherit;border:1px solid var(--line);border-radius:4px;background:var(--panel);color:var(--ink);padding:7px 12px}button,summary{cursor:pointer}button:disabled,select:disabled{opacity:.55;cursor:default}
:focus-visible{outline:3px solid var(--accent);outline-offset:4px}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;text-align:left;font-variant-numeric:tabular-nums}
caption{text-align:left;padding:12px 0}th,td{padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}thead th{background:var(--track)}td:nth-child(2){font-variant-numeric:tabular-nums}
.track{display:block;min-width:90px;background:var(--track);height:12px}.bar{display:block;height:100%;background:var(--accent)}
pre,code{font-family:ui-monospace,monospace}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:32rem;overflow:auto;padding:16px;background:var(--bg);border:1px solid var(--line)}
summary{font-weight:600;padding:12px 0}canvas{display:block;width:100%;height:clamp(280px,50vw,480px);background:var(--bg);border:1px solid var(--line);touch-action:none;margin:16px 0}
[hidden]{display:none!important}.scope{font-weight:600}footer{color:var(--muted)}@media(max-width:600px){main{padding:20px 12px}section{padding:16px}th,td{padding:8px}}
@media print{:root,:root[data-theme=dark]{color-scheme:light;--bg:#fff;--panel:#fff;--ink:#000;--muted:#333;--line:#999;--accent:#333;--track:#eee}main{max-width:none;padding:0}.toolbar,.controls,#plot-help,#plot-status{display:none}section{border-radius:0;padding:12px}pre{max-height:none;overflow:visible;font-size:10px}.scroll{overflow:visible}thead{display:table-header-group}tr,canvas{break-inside:avoid}h2,h3{break-after:avoid}}
`;

// This is deliberately standalone JavaScript: the downloaded file needs no app runtime.
export const REPORT_SCRIPT = String.raw`
(() => {
  const appearance = document.getElementById('appearance');
  const print = document.getElementById('print-report');
  appearance.disabled = false;
  print.disabled = false;
  print.addEventListener('click', () => window.print());
  let closedDetails = [];
  window.addEventListener('beforeprint', () => {
    closedDetails = Array.from(document.querySelectorAll('details:not([open])'));
    closedDetails.forEach(detail => { detail.open = true; });
  });
  window.addEventListener('afterprint', () => {
    closedDetails.forEach(detail => { detail.open = false; });
    closedDetails = [];
  });
  let schedule = () => {};
  appearance.addEventListener('change', () => {
    document.documentElement.dataset.theme = appearance.value === 'dark' ? 'dark' : 'light';
    schedule();
  });
  const canvas = document.getElementById('atom-plot');
  if (!canvas) return;
  const status = document.getElementById('plot-status');
  const { points, scope } = JSON.parse(document.getElementById('atom-coordinates').textContent);
  let context = null;
  try { context = canvas.getContext('2d'); } catch { /* Native coordinate table remains available. */ }
  if (!context || !points.length) {
    canvas.hidden = true;
    status.textContent = !points.length ? 'No finite atomic coordinates in this scope.' : 'Canvas is unavailable. Use the coordinate summary below.';
    return;
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis], point[axis]); max[axis] = Math.max(max[axis], point[axis]);
  }
  const center = min.map((value, axis) => value / 2 + max[axis] / 2);
  const radius = Math.max(0.000001, ...min.map((value, axis) => max[axis] / 2 - value / 2));
  const normalized = points.map(point => point.map((value, axis) => (value / 2 - center[axis] / 2) / (radius / 2)));
  let yaw = 0, pitch = 0, zoom = 1, pointer = null, queued = false;
  const announce = () => {
    status.textContent = scope + ': ' + points.length + ' unbonded atoms. Horizontal rotation ' +
      Math.round(yaw * 180 / Math.PI) + '°, vertical rotation ' + Math.round(pitch * 180 / Math.PI) +
      '°, zoom ' + Math.round(zoom * 100) + '%.';
  };
  const draw = (printing = false) => {
    const box = canvas.getBoundingClientRect();
    const width = Math.max(1, box.width), height = Math.max(1, box.height);
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = printing ? '#182923' : getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const scale = Math.min(width, height) * 0.25 * zoom;
    for (const [x, y, z] of normalized) {
      const rx = x * cy + z * sy, rz = -x * sy + z * cy;
      const ry = y * cp - rz * sp;
      context.fillRect(width / 2 + rx * scale - 1, height / 2 - ry * scale - 1, 2, 2);
    }
  };
  schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; draw(); });
  };
  const change = action => {
    if (action === 'left') yaw -= 0.15;
    if (action === 'right') yaw += 0.15;
    if (action === 'up') pitch -= 0.15;
    if (action === 'down') pitch += 0.15;
    if (action === 'in') zoom = Math.min(8, zoom * 1.2);
    if (action === 'out') zoom = Math.max(0.2, zoom / 1.2);
    if (action === 'reset') { yaw = 0; pitch = 0; zoom = 1; }
    schedule(); announce();
  };
  document.querySelectorAll('[data-view]').forEach(button => {
    button.disabled = false;
    button.addEventListener('click', () => change(button.dataset.view));
  });
  canvas.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const action = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      '+': 'in', '=': 'in', '-': 'out', '0': 'reset', Home: 'reset', r: 'reset', R: 'reset' }[event.key];
    if (action) { event.preventDefault(); change(action); }
  });
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointer) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId); canvas.focus(); event.preventDefault();
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    yaw += (event.clientX - pointer.x) * 0.01; pitch += (event.clientY - pointer.y) * 0.01;
    pointer.x = event.clientX; pointer.y = event.clientY; schedule();
  });
  const release = event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    pointer = null; announce();
  };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(name => canvas.addEventListener(name, release));
  canvas.addEventListener('wheel', event => {
    event.preventDefault(); change(event.deltaY < 0 ? 'in' : 'out');
  }, { passive: false });
  window.addEventListener('resize', schedule);
  window.addEventListener('beforeprint', () => draw(true));
  window.addEventListener('afterprint', schedule);
  schedule(); announce();
})();
`;
