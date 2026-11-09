(function () {
  'use strict';

  var viewerUrl = chrome.runtime.getURL('src/viewer/viewer.html');

  document.getElementById('openViewer').addEventListener('click', function () {
    chrome.tabs.create({ url: viewerUrl });
    window.close();
  });

  document.getElementById('openFile').addEventListener('click', function () {
    chrome.tabs.create({ url: viewerUrl + '?action=open' });
    window.close();
  });
})();
