(() => {
  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== 'bilibili-cdn-filter-v4') return;
    chrome.runtime.sendMessage(event.data).catch(() => {});
  });
})();
