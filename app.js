// Подключение к Socket.IO серверу
const socket = io('http://localhost:3001');

// Элементы DOM
const form = document.getElementById('note-form');
const input = document.getElementById('note-input');
const list = document.getElementById('notes-list');

// Загрузка заметок
function loadNotes() {
    const notes = JSON.parse(localStorage.getItem('notes') || '[]');
    list.innerHTML = notes.map(note => 
        `<li class="card" style="margin: 0.5rem 0; padding: 0.75rem;">
            ${note.text} 
            <small style="color: #999; display: block; margin-top: 0.25rem;">
                ${new Date(note.timestamp).toLocaleString()}
            </small>
        </li>`
    ).join('');
}

// Добавление заметки
function addNote(text) {
    const notes = JSON.parse(localStorage.getItem('notes') || '[]');
    const newNote = {
        id: Date.now(),
        text: text,
        timestamp: Date.now()
    };
    notes.push(newNote);
    localStorage.setItem('notes', JSON.stringify(notes));
    loadNotes();
    
    // Отправляем событие на сервер
    socket.emit('newTask', newNote);
}

// Обработка формы
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (text) {
        addNote(text);
        input.value = '';
    }
});

// Получение событий от других клиентов
socket.on('taskAdded', (task) => {
    console.log('Задача от другого клиента:', task);
    showNotification(`Новая задача: ${task.text}`);
    loadNotes(); // Обновляем список
});

// Показ всплывающего уведомления
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// Первоначальная загрузка
loadNotes();

// === PUSH NOTIFICATIONS ===

// Преобразование base64 в Uint8Array
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Подписка на push
async function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('Push notifications not supported');
        return;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        
        // ВСТАВЬТЕ СВОЙ ПУБЛИЧНЫЙ КЛЮЧ!
        const publicKey = 'ВАШ_ПУБЛИЧНЫЙ_VAPID_КЛЮЧ';
        
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
        });

        await fetch('http://localhost:3001/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription)
        });

        console.log('Подписка на push отправлена');
    } catch (err) {
        console.error('Ошибка подписки:', err);
    }
}

// Отписка от push
async function unsubscribeFromPush() {
    if (!('serviceWorker' in navigator)) return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
        await fetch('http://localhost:3001/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint })
        });
        
        await subscription.unsubscribe();
        console.log('Отписка выполнена');
    }
}

// Кнопки управления push
const enableBtn = document.getElementById('enable-push');
const disableBtn = document.getElementById('disable-push');

if (enableBtn && disableBtn) {
    // Проверяем текущую подписку при загрузке
    navigator.serviceWorker.ready.then(async (registration) => {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            enableBtn.style.display = 'none';
            disableBtn.style.display = 'inline-block';
        }
    });

    enableBtn.addEventListener('click', async () => {
        if (Notification.permission === 'denied') {
            alert('Уведомления запрещены. Разрешите их в настройках браузера.');
            return;
        }
        
        if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                alert('Необходимо разрешить уведомления.');
                return;
            }
        }

        await subscribeToPush();
        enableBtn.style.display = 'none';
        disableBtn.style.display = 'inline-block';
    });

    disableBtn.addEventListener('click', async () => {
        await unsubscribeFromPush();
        disableBtn.style.display = 'none';
        enableBtn.style.display = 'inline-block';
    });
}

// Регистрация Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('SW registered:', registration.scope);
        } catch (err) {
            console.error('SW registration failed:', err);
        }
    });
}
