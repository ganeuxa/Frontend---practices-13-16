const express = require('express');
const https = require('https');
const fs = require('fs');
const socketIo = require('socket.io');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors({
    origin: 'https://localhost:4001',
    credentials: true
}));
app.use(bodyParser.json());

const vapidKeys = {
    publicKey: 'BFxiINbiF3NwDmcS0jDekbwDtMClU2rFJ7o-MtDEqVIhAH4rlAcpYF5wt7Z87QLyW0BsITc9PxIwXPA1369xxkk',
    privateKey: 'FmUIFWMA6LOxxE6iUFh6Q0Rx3yX5SWmblPwh-PwFpDk'
};
webpush.setVapidDetails('mailto:your-email@example.com', vapidKeys.publicKey, vapidKeys.privateKey);

// 🔥 Инициализация Map
const subscriptions = new Map();

const optionsHttps = {
    key: fs.readFileSync(path.join(__dirname, 'localhost+2-key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'localhost+2.pem'))
};

const server = https.createServer(optionsHttps, app);

const io = socketIo(server, { 
    cors: { 
        origin: 'https://localhost:4001', 
        methods: ['GET','POST'],
        credentials: true
    } 
});

io.on('connection', socket => {
    console.log('✅ Client connected:', socket.id);
    console.log('📊 Active subscriptions:', subscriptions.size);

    socket.on('newTask', task => {
        console.log('📩 New task:', task.text);
        console.log('📤 Sending to', subscriptions.size, 'subscribers');
        
        io.emit('taskAdded', task);

        if (subscriptions.size > 0) {
            const payload = JSON.stringify({ 
                title: 'Новая задача', 
                body: task.text 
            });

            subscriptions.forEach((sub, endpoint) => {
                console.log('🔔 Sending push to:', endpoint.substring(0, 50) + '...');
                webpush.sendNotification(sub, payload)
                    .catch(err => console.error('❌ Push error:', err.message));
            });
        } else {
            console.log('⚠️ No subscribers - push NOT sent');
        }
    });

    socket.on('disconnect', () => console.log('❌ Client disconnected:', socket.id));
});

// ✅ ПОДПИСКА
app.post('/subscribe', (req, res) => {
    console.log('📝 ====== SUBSCRIBE REQUEST =======');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    if (!req.body || !req.body.endpoint) {
        console.error('❌ Invalid subscription');
        return res.status(400).json({ error: 'Invalid subscription' });
    }
    
    const endpoint = req.body.endpoint;
    console.log('Endpoint:', endpoint.substring(0, 60) + '...');
    console.log('Subscriptions before:', subscriptions.size);
    
    // 🔥 Map.set() - добавляем или обновляем
    subscriptions.set(endpoint, req.body);
    
    console.log('✅ Subscription added');
    console.log('Subscriptions after:', subscriptions.size);
    console.log('📝 =========================================\n');
    
    res.status(201).json({ message: 'Subscribed', count: subscriptions.size });
});

// ✅ ОТПИСКА
app.post('/unsubscribe', (req, res) => {
    console.log('🗑️ ====== UNSUBSCRIBE REQUEST =======');
    console.log('Request body endpoint:', req.body.endpoint);
    console.log('Subscriptions before:', subscriptions.size);
    
    if (!req.body || !req.body.endpoint) {
        console.error('❌ Invalid unsubscribe request');
        return res.status(400).json({ error: 'Invalid request' });
    }
    
    const endpoint = req.body.endpoint;
    
    // 🔥 Map.delete() - удаляем по ключу
    const deleted = subscriptions.delete(endpoint);
    
    console.log('Subscriptions after:', subscriptions.size);
    console.log('Deleted:', deleted ? 'YES ✅' : 'NO ❌');
    console.log('🗑️ =========================================\n');
    
    res.status(200).json({ 
        message: 'Unsubscribed',
        deleted: deleted,
        count: subscriptions.size
    });
});

// Эндпоинт для проверки
app.get('/subscriptions', (req, res) => {
    res.json({ 
        count: subscriptions.size,
        endpoints: Array.from(subscriptions.keys())
    });
});

server.listen(3001, () => {
    console.log('🚀 Server running at https://localhost:3001');
    console.log('📊 Initial subscriptions:', subscriptions.size);
});