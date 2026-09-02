function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function render() {
  const { logs = [] } = await chrome.storage.local.get({ logs: [] });
  const root = document.getElementById('list');
  if (!logs.length) {
    root.innerHTML = '<div class="empty">暂无记录。播放几个视频后再打开这里查看。</div>';
    return;
  }
  root.innerHTML = logs.slice(0, 100).map(entry => {
    const time = new Date(entry.time).toLocaleString();
    const count = entry.count > 1 ? ` ×${entry.count}` : '';
    const replacement = entry.replacement
      ? `<div class="rep">→ ${escapeHtml(entry.replacement)}</div>`
      : '';
    return `<div class="item"><span class="time">${escapeHtml(time)}</span>`
      + `<span class="type">${escapeHtml(entry.type + count)}</span>`
      + `<div>${escapeHtml(entry.url)}</div>${replacement}</div>`;
  }).join('');
}

document.getElementById('refresh').onclick = render;
document.getElementById('clear').onclick = async () => {
  await chrome.storage.local.set({ logs: [] });
  render();
};
render();
