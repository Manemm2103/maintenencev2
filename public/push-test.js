
async function ensureNotificationPermission() {
  if (!('Notification' in window)) {
    throw new Error('Notifications are not supported on this device/browser.');
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') {
    throw new Error('Notifications are blocked. Enable them in your device settings.');
  }
  const result = await Notification.requestPermission();
  if (result !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }
  return true;
}

async function showDrHomeNotification(title, body) {
  await ensureNotificationPermission();
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification(title, {
    body,
    icon: 'logo.png',
    badge: 'logo.png',
    tag: 'drhome-test',
    renotify: true,
    data: { url: 'index.html' }
  });
}
