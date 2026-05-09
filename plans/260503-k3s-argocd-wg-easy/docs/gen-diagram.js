const fs = require('fs');

const W = 2100, H = 1700;

function rect(x, y, w, h, fill, stroke, dashed=false, radius=8) {
  const dash = dashed ? 'stroke-dasharray="10,5"' : '';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="2" rx="${radius}" ${dash}/>`;
}

function text(x, y, content, size=14, color='#374151', anchor='middle', weight='normal') {
  const lines = content.split('\n');
  if (lines.length === 1) {
    return `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}" font-weight="${weight}" font-family="monospace">${content}</text>`;
  }
  const lineH = size * 1.4;
  const startY = y - ((lines.length - 1) * lineH) / 2;
  return lines.map((line, i) =>
    `<text x="${x}" y="${startY + i * lineH}" font-size="${size}" fill="${color}" text-anchor="${anchor}" font-weight="${weight}" font-family="monospace">${line}</text>`
  ).join('\n');
}

function arrow(x1, y1, x2, y2, color='#495057', label='', dashed=false) {
  const dash = dashed ? 'stroke-dasharray="8,4"' : '';
  let path = `M${x1},${y1} L${x2},${y2}`;
  let labelEl = '';
  if (label) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - 8;
    labelEl = `<text x="${mx}" y="${my}" font-size="12" fill="${color}" text-anchor="middle" font-family="monospace">${label}</text>`;
  }
  return `<path d="${path}" stroke="${color}" stroke-width="2" fill="none" ${dash} marker-end="url(#arr_${color.replace('#','')})"/>` + labelEl;
}

function arrowBend(points, color='#495057', label='', dashed=false) {
  const dash = dashed ? 'stroke-dasharray="8,4"' : '';
  const d = 'M' + points.map(p => p.join(',')).join(' L');
  let labelEl = '';
  if (label) {
    const mid = points[Math.floor(points.length / 2)];
    labelEl = `<text x="${mid[0]+5}" y="${mid[1]-6}" font-size="12" fill="${color}" text-anchor="middle" font-family="monospace">${label}</text>`;
  }
  return `<path d="${d}" stroke="${color}" stroke-width="2" fill="none" ${dash} marker-end="url(#arrowhead)"/>` + labelEl;
}

const defs = `<defs>
  <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
    <polygon points="0 0, 10 3.5, 0 7" fill="#495057"/>
  </marker>
  <marker id="arrowhead_blue" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
    <polygon points="0 0, 10 3.5, 0 7" fill="#1971c2"/>
  </marker>
  <marker id="arrowhead_purple" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
    <polygon points="0 0, 10 3.5, 0 7" fill="#7048e8"/>
  </marker>
  <marker id="arrowhead_green" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
    <polygon points="0 0, 10 3.5, 0 7" fill="#00a888"/>
  </marker>
</defs>`;

function arrowC(points, color, label='', dashed=false) {
  const dash = dashed ? 'stroke-dasharray="8,4"' : '';
  const markerMap = {'#1971c2':'blue','#7048e8':'purple','#00a888':'green','#495057':''};
  const mSuffix = markerMap[color] || '';
  const markerId = mSuffix ? `arrowhead_${mSuffix}` : 'arrowhead';
  const d = 'M' + points.map(p => p.join(',')).join(' L');
  let labelEl = '';
  if (label) {
    const mid = points[Math.floor(points.length / 2)];
    const lx = mid[0], ly = mid[1] - 8;
    labelEl = `<text x="${lx}" y="${ly}" font-size="12" fill="${color}" text-anchor="middle" font-family="monospace" font-style="italic">${label}</text>`;
  }
  return `<path d="${d}" stroke="${color}" stroke-width="2" fill="none" ${dash} marker-end="url(#${markerId})"/>` + labelEl;
}

function box(x, y, w, h, fill, stroke, label, sublabel='', textColor='#374151', dashed=false) {
  return rect(x, y, w, h, fill, stroke, dashed) +
    text(x + w/2, y + h/2 - (sublabel ? 8 : 0), label, 14, textColor, 'middle', 'bold') +
    (sublabel ? text(x + w/2, y + h/2 + 14, sublabel, 12, textColor === '#ffffff' ? '#d0d0ff' : '#666', 'middle') : '');
}

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${defs}
<rect width="${W}" height="${H}" fill="#ffffff"/>
`;

// Title
svg += text(W/2, 35, 'HashiCorp Vault + VSO Architecture trong k3s', 22, '#1e40af', 'middle', 'bold') + '\n';

// ── EXTERNAL ZONE ──────────────────────────────────
svg += text(50, 65, 'EXTERNAL', 12, '#868e96', 'start') + '\n';
svg += rect(40, 45, W-80, 140, '#f8f9fa', '#c5c5c5', true, 12) + '\n';

// Developer
svg += `<ellipse cx="180" cy="115" rx="80" ry="35" fill="#e7f5ff" stroke="#1971c2" stroke-width="2"/>` + '\n';
svg += text(180, 119, 'Developer', 14, '#1971c2', 'middle', 'bold') + '\n';

// VPN arrow + label
svg += arrowC([[280, 115],[420, 115]], '#1971c2', 'bật VPN (WireGuard)') + '\n';

// Traefik
svg += box(420, 82, 360, 65, '#ccfff6', '#00a888', 'Traefik Ingress', 'vault.company.com · VPN-only') + '\n';

// Arrow Traefik → cluster
svg += arrowC([[600, 147],[600, 190]], '#00a888', '') + '\n';
svg += text(630, 172, 'HTTPS', 11, '#00a888', 'start') + '\n';

// ── CLUSTER ZONE ────────────────────────────────────
svg += rect(40, 195, W-80, H-250, '#f8f9fa', '#868e96', true, 12) + '\n';
svg += text(55, 215, 'k3s Cluster', 13, '#868e96', 'start') + '\n';

// ── NAMESPACE: VAULT ───────────────────────────────
svg += rect(65, 225, 1020, 390, '#f3f0ff', '#7048e8', true, 10) + '\n';
svg += text(575, 243, 'namespace: vault', 13, '#7048e8', 'middle', 'bold') + '\n';

// Vault pod
svg += box(90, 258, 320, 155, '#326ce5', '#2756b8', 'Vault pod', 'KV v2 · K8s Auth · Raft', '#ffffff') + '\n';
// Raft PVC
svg += box(90, 432, 320, 50, '#ffec99', '#f08c00', 'Raft PVC 5Gi · persistent storage', '', '#374151') + '\n';
svg += arrowC([[250, 413],[250, 432]], '#f08c00') + '\n';

// VSO pod
svg += box(500, 258, 320, 155, '#326ce5', '#2756b8', 'VSO pod', 'Vault Secrets Operator', '#ffffff') + '\n';
svg += text(660, 435, 'watch VaultStaticSecret CRDs', 11, '#7048e8', 'middle') + '\n';

// Arrow Vault ↔ VSO
svg += `<path d="M410,335 L500,335" stroke="#ffffff" stroke-width="2" fill="none" marker-end="url(#arrowhead_blue)"/>` + '\n';
svg += `<path d="M500,355 L410,355" stroke="#7048e8" stroke-width="2" fill="none" marker-end="url(#arrowhead_purple)"/>` + '\n';
svg += text(455, 328, 'kv read', 11, '#ffffff', 'middle') + '\n';
svg += text(455, 372, 'auth', 11, '#7048e8', 'middle') + '\n';

// Kubernetes API box
svg += box(900, 258, 280, 120, '#dee2e6', '#495057', 'Kubernetes API', 'verify SA JWT token') + '\n';

// Arrow Vault → K8s API (over the top)
svg += arrowC([[250, 258],[250, 230],[1040, 230],[1040, 258]], '#495057', 'verify JWT', true) + '\n';

// ── SYNC LABEL ──────────────────────────────────────
svg += text(W/2, 640, '▼  VSO sync: Vault secrets → k8s Secrets (refreshAfter: 60s)  ▼', 14, '#7048e8', 'middle', 'bold') + '\n';

// ── CONSUMER NAMESPACES ─────────────────────────────
const nsY = 660;
const nsH = 420;
const nsW = 360;
const nsGap = 22;
const nsDefs = [
  { key:'data',       fill:'#ebfbee', stroke:'#2f9e44', label:'ns: data',
    auth:'data-auth (data-role)', vss:'redis-password', secret:'redis-password', app:null },
  { key:'dev',        fill:'#e7f5ff', stroke:'#1971c2', label:'ns: dev',
    auth:'dev-auth (dev-role)', vss:'app-dev-secret', secret:'app-dev-secret',
    app:'App pods x5\nenvFrom: app-dev-secret', appFill:'#a5d8ff', appStroke:'#1971c2' },
  { key:'uat',        fill:'#fff5f5', stroke:'#e03131', label:'ns: uat',
    auth:'uat-auth (uat-role)', vss:'app-uat-secret', secret:'app-uat-secret',
    app:'App pods x5\nenvFrom: app-uat-secret', appFill:'#ffc9c9', appStroke:'#e03131' },
  { key:'kube-sys',   fill:'#f1f3f5', stroke:'#495057', label:'ns: kube-system',
    auth:'kube-system-auth', vss:'aws-ecr-credentials', secret:'aws-ecr-credentials', app:null },
  { key:'monitoring', fill:'#ebfbee', stroke:'#40c057', label:'ns: monitoring',
    auth:'monitoring-auth', vss:'elasticsearch-secret', secret:'elasticsearch-secret', app:null },
];

const totalW = nsW * nsDefs.length + nsGap * (nsDefs.length - 1);
const startX = Math.floor((W - totalW) / 2);

nsDefs.forEach((ns, i) => {
  const x = startX + i * (nsW + nsGap);
  const hasApp = !!ns.app;
  const h = hasApp ? nsH : nsH - 90;

  svg += rect(x, nsY, nsW, h, ns.fill, ns.stroke, true, 10) + '\n';
  svg += text(x + nsW/2, nsY + 18, ns.label, 13, ns.stroke, 'middle', 'bold') + '\n';

  // VaultAuth
  svg += box(x+15, nsY+30, nsW-30, 52, '#ffd8a8', '#e8590c', 'VaultAuth', ns.auth, '#374151') + '\n';
  // VaultStaticSecret
  svg += box(x+15, nsY+98, nsW-30, 52, '#ffd8a8', '#e8590c', 'VaultStaticSecret', ns.vss, '#374151') + '\n';
  // k8s Secret
  svg += box(x+15, nsY+166, nsW-30, 65, '#e9ecef', '#626d6e', 'k8s Secret', ns.secret) + '\n';

  if (hasApp) {
    svg += arrowC([[x+nsW/2, nsY+231],[x+nsW/2, nsY+258]], ns.appStroke) + '\n';
    svg += box(x+15, nsY+258, nsW-30, 65, ns.appFill, ns.appStroke, ns.app.split('\n')[0], ns.app.split('\n')[1]) + '\n';
  }

  // VSO sync arrow (from VSO pod bottom)
  const vsoX = 660, vsoY = 413; // VSO pod bottom center
  const secretX = x + nsW/2;
  const secretY = nsY + 166;
  svg += arrowC([[vsoX, vsoY],[vsoX, 625],[secretX, 625],[secretX, secretY]], '#7048e8', '', true) + '\n';
});

// Legend
const lx = 1750, ly = 1100;
svg += rect(lx, ly, 280, 210, '#ffffff', '#c0c0c0', false, 8) + '\n';
svg += text(lx+140, ly+22, 'Legend', 15, '#1e40af', 'middle', 'bold') + '\n';
svg += rect(lx+15, ly+40, 18, 18, '#ffd8a8', '#e8590c', false, 3) + '\n';
svg += text(lx+42, ly+53, 'VaultAuth / VaultStaticSecret CRD', 11, '#374151', 'start') + '\n';
svg += rect(lx+15, ly+68, 18, 18, '#e9ecef', '#626d6e', false, 3) + '\n';
svg += text(lx+42, ly+81, 'k8s Secret (output của VSO)', 11, '#374151', 'start') + '\n';
svg += rect(lx+15, ly+96, 18, 18, '#326ce5', '#2756b8', false, 3) + '\n';
svg += text(lx+42, ly+109, 'Kubernetes pod', 11, '#374151', 'start') + '\n';
svg += `<path d="M${lx+15},${ly+128} L${lx+33},${ly+128}" stroke="#7048e8" stroke-width="2" stroke-dasharray="6,3" marker-end="url(#arrowhead_purple)"/>` + '\n';
svg += text(lx+42, ly+132, 'VSO sync (mỗi 60s)', 11, '#374151', 'start') + '\n';
svg += `<path d="M${lx+15},${ly+156} L${lx+33},${ly+156}" stroke="#00a888" stroke-width="2" marker-end="url(#arrowhead_green)"/>` + '\n';
svg += text(lx+42, ly+160, 'HTTPS traffic (VPN only)', 11, '#374151', 'start') + '\n';
svg += `<path d="M${lx+15},${ly+184} L${lx+33},${ly+184}" stroke="#495057" stroke-width="2" stroke-dasharray="6,3" marker-end="url(#arrowhead)"/>` + '\n';
svg += text(lx+42, ly+188, 'JWT verify (dashed)', 11, '#374151', 'start') + '\n';

svg += '</svg>';

fs.writeFileSync('d:/devops/devops/plans/260503-k3s-argocd-wg-easy/docs/vault-k8s-architecture.svg', svg);
console.log('SVG generated successfully');
