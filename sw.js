const CACHE_NAME = 'notes-app-shell-v5';
const DYNAMIC_CACHE = 'notes-dynamic-v1';

const APP_SHELL = ['/', '/index.html', '/app.js', '/manifest.json', '/content/home.html'];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME && key !== DYNAMIC_CACHE)
                    .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (url.origin !== location.origin) return;
    
    if (url.pathname === '/' || url.pathname === '/index.html') {
        event.respondWith(
            fetch(event.request)
                .then(networkResponse => {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
                    return networkResponse;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }
    
    if (url.pathname.startsWith('/content/')) {
        event.respondWith(
            fetch(event.request)
                .then(networkResponse => {
                    const responseClone = networkResponse.clone();
                    caches.open(DYNAMIC_CACHE).then(cache => cache.put(event.request, responseClone));
                    return networkResponse;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }
    
    event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request))
    );
});

self.addEventListener('push', event => {
    console.log('[SW] Push received');
    
    let data = { title: 'Новое уведомление', body: '', reminderId: null };
    if (event.data) {
        try {
            data = event.data.json();
        } catch (err) {
            console.error('[SW] Parse error:', err);
        }
    }

    const options = {
        body: data.body,
        icon: '/icons/favicon-128x128.png',
        badge: '/icons/favicon-48x48.png',
        data: { reminderId: data.reminderId, url: '/' },
        tag: `reminder-${data.reminderId}`,
        requireInteraction: true,
        vibrate: [200, 100, 200]
    };

    if (data.reminderId) {
        console.log('[SW] Adding snooze button');
        options.actions = [
            { action: 'snooze', title: '⏰ Отложить на 5 мин' },
            { action: 'dismiss', title: '❌ Закрыть' }
        ];
    }

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', event => {
    console.log('[SW] Click event, action:', event.action);
    
    const notification = event.notification;
    const action = event.action;
    const reminderId = notification.data?.reminderId;

    notification.close();

    if (action === 'snooze') {
        console.log('[SW] SNOOZE ACTION!');
        
        event.waitUntil(
            fetch(`https://localhost:3001/snooze?reminderId=${reminderId}`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            })
            .then(response => {
                console.log('[SW] Snooze response:', response.status);
                if (response.ok) {
                    return self.registration.showNotification('✅ Отложено', {
                        body: 'Напоминание перенесено на 5 минут',
                        icon: '/icons/favicon-128x128.png',
                        tag: 'snooze-confirm',
                        requireInteraction: false
                    });
                }
            })
            .catch(err => console.error('[SW] Snooze error:', err))
        );
        return;
    }

    if (action === 'dismiss') {
        return;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientsList => {
                const client = clientsList.find(c => c.url.includes('localhost:4001'));
                if (client && 'focus' in client) {
                    return client.focus();
                }
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
    );
});

console.log('[SW] Service Worker loaded');