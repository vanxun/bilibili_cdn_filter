const MAX_LOGS = 300;

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return `${url.origin}${url.pathname}`;
  } catch {
    return String(value || '').slice(0, 1000);
  }
}

async function saveLog(entry) {
  const { logs = [] } = await chrome.storage.local.get({ logs: [] });
  const next = {
    time: Number(entry.time) || Date.now(),
    type: String(entry.type || 'event'),
    url: safeUrl(entry.url),
    replacement: safeUrl(entry.replacement)
  };
  const first = logs[0];
  if (first && first.type === next.type && first.url === next.url && first.replacement === next.replacement) {
    first.time = next.time;
    first.count = (first.count || 1) + 1;
  } else {
    logs.unshift(next);
  }
  await chrome.storage.local.set({ logs: logs.slice(0, MAX_LOGS) });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.source !== 'bilibili-cdn-filter-v4' || !sender.tab?.url?.includes('bilibili.com')) return;
  saveLog(message).catch(() => {});
});

chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(info => {
  const resourceType = info.request?.type || 'unknown';
  saveLog({
    type: `DNR-block:${resourceType}`,
    url: info.request?.url,
    replacement: info.request?.initiator || ''
  }).catch(() => {});
});
