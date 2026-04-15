const socket = io('https://localhost:3001');
const contentDiv = document.getElementById('app-content');
const enableBtn = document.getElementById('enable-push');
const disableBtn = document.getElementById('disable-push');

async function loadContent(page) {
    try {
        const response = await fetch(`/content/${page}.html`);
        const html = await response.text();
        contentDiv.innerHTML = html;
        if (page === 'home') initNotes();
    } catch (err) {
        console.error('Error loading content:', err);
        contentDiv.innerHTML = `<p class="is-center text-error">Ошибка загрузки.</p>`;
    }
}

function loadNotes() {
    const list = document.getElementById('notes-list');
    if (!list) return;
    
    const notes = JSON.parse(localStorage.getItem('notes') || '[]');
    list.innerHTML = notes.map(note => {
        let reminderInfo = '';
        if (note.reminder) {
            const date = new Date(note.reminder);
            
            
            if (note.snoozed === true) {
                reminderInfo = `
                    <br><small style="color: #f39c12;">
                        ⏰ Отложено на 5 минуточек<br>
                        🕐 Новое время: ${date.toLocaleString('ru-RU')}
                    </small>
                `;
            } else {
                const timeUntilReminder = note.reminder - Date.now();
                if (timeUntilReminder > 0) {
                    reminderInfo = `
                        <br><small style="color: #e74c3c;">
                            ⏰ Напоминание: ${date.toLocaleString('ru-RU')}
                        </small>
                    `;
                } else {
                    reminderInfo = `
                        <br><small style="color: #27ae60;">
                            ✅ Напоминание сработало
                        </small>
                    `;
                }
            }
        }
        return `<li class="card" style="margin: 0.5rem 0; padding: 0.75rem;">
            ${escapeHtml(note.text)} ${reminderInfo}
            <small style="color: #999; display: block; margin-top: 0.25rem;">
                ${new Date(note.timestamp).toLocaleString('ru-RU')}
            </small>
        </li>`;
    }).join('');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showInAppNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

socket.on('connect', () => console.log('✅ WebSocket connected:', socket.id));
socket.on('taskAdded', (task) => {
    showInAppNotification(`🔔 Новая задача: ${task.text}`);
    loadNotes();
});

socket.on('reminderTriggered', (data) => {
    showInAppNotification(`⏰ Напоминание: ${data.text}`);
    loadNotes();
});


socket.on('reminderSnoozed', (data) => {
    console.log('🔔 Reminder snoozed:', data);
    // Обновляем заметку в localStorage
    const notes = JSON.parse(localStorage.getItem('notes') || '[]');
    const note = notes.find(n => n.id === data.id);
    if (note) {
        note.snoozed = true;
        note.reminder = data.newTime;
        localStorage.setItem('notes', JSON.stringify(notes));
        loadNotes();
    }
    showInAppNotification('✅ Напоминание отложено на 5 минут');
});

function initNotes() {
    const form = document.getElementById('note-form');
    const input = document.getElementById('note-input');
    const reminderForm = document.getElementById('reminder-form');
    const reminderText = document.getElementById('reminder-text');
    const reminderTime = document.getElementById('reminder-time');
    
    if (form && input) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = input.value.trim();
            if (text) {
                addNote(text);
                input.value = '';
            }
        });
    }
    
    if (reminderForm && reminderText && reminderTime) {
        reminderForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = reminderText.value.trim();
            const datetime = reminderTime.value;
            if (text && datetime) {
                const timestamp = new Date(datetime).getTime();
                if (timestamp > Date.now()) {
                    addNote(text, timestamp);
                    reminderText.value = '';
                    reminderTime.value = '';
                    alert('✅ Напоминание установлено!');
                } else {
                    alert('❌ Дата должна быть в будущем!');
                }
            }
        });
    }
    loadNotes();
}

function addNote(text, reminderTimestamp = null) {
    const notes = JSON.parse(localStorage.getItem('notes') || '[]');
    const newNote = {
        id: Date.now(),
        text: text,
        timestamp: Date.now(),
        reminder: reminderTimestamp,
        snoozed: false
    };
    notes.push(newNote);
    localStorage.setItem('notes', JSON.stringify(notes));
    loadNotes();
    
    if (reminderTimestamp) {
        socket.emit('newReminder', {
            id: newNote.id,
            text: text,
            reminderTime: reminderTimestamp
        });
    } else {
        socket.emit('newTask', { text, timestamp: Date.now() });
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('Push не поддерживается');
        return false;
    }
    try {
        const registration = await navigator.serviceWorker.ready;
        const publicKey = 'BFxiINbiF3NwDmcS0jDekbwDtMClU2rFJ7o-MtDEqVIhAH4rlAcpYF5wt7Z87QLyW0BsITc9PxIwXPA1369xxkk';
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
        await fetch('https://localhost:3001/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription)
        });
        console.log('✅ Подписка отправлена');
        return true;
    } catch (err) {
        console.error('❌ Ошибка подписки:', err);
        return false;
    }
}

async function unsubscribeFromPush() {
    if (!('serviceWorker' in navigator)) return false;
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            await fetch('https://localhost:3001/unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: subscription.endpoint })
            });
            await subscription.unsubscribe();
            console.log('✅ Отписка выполнена');
            return true;
        }
        return false;
    } catch (err) {
        console.error('❌ Ошибка отписки:', err);
        return false;
    }
}

async function initPushButtons() {
    if (!enableBtn || !disableBtn) return;
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                enableBtn.style.display = 'none';
                disableBtn.style.display = 'inline-block';
            } else {
                enableBtn.style.display = 'inline-block';
                disableBtn.style.display = 'none';
            }
        } catch (err) {
            console.error('Ошибка проверки подписки:', err);
        }
    }
    enableBtn.addEventListener('click', async () => {
        if (Notification.permission === 'denied') {
            alert('Уведомления запрещены');
            return;
        }
        if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                alert('Необходимо разрешить уведомления');
                return;
            }
        }
        const success = await subscribeToPush();
        if (success) {
            enableBtn.style.display = 'none';
            disableBtn.style.display = 'inline-block';
        }
    });
    disableBtn.addEventListener('click', async () => {
        const success = await unsubscribeFromPush();
        if (success) {
            disableBtn.style.display = 'none';
            enableBtn.style.display = 'inline-block';
        }
    });
}

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.warn('Service Worker не поддерживается');
        return;
    }
    try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('✅ Service Worker зарегистрирован');
        await initPushButtons();
    } catch (err) {
        console.error('❌ Ошибка регистрации:', err);
    }
}

function initApp() {
    console.log('🚀 App initialized');
    loadContent('home');
    registerServiceWorker();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}