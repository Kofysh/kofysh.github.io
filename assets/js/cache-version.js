(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;

  var refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker.getRegistration().then(function (registration) {
      if (!registration) return;

      registration.update();

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    });
  });
}());
