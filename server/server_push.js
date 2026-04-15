const express = require('express');
const https = require('https');
const fs = require('fs');
const socketIo = require('socket.io');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors({ origin: 'https://localhost:4001', credentials: true }));
app.use(bodyParser.json());

const vapidKeys = {
    publicKey: 'BFxiINbiF3NwDmcS0jDekbwDtMClU2rFJ7o-MtDEqVIhAH4rlAcpYF5wt7Z87QLyW0BsITc9PxIwXPA1369xxkk',
    privateKey: 'FmUIFWMA6LOxxE6iUFh6Q0Rx3yX5SWmblPwh-PwFpDk'
};
webpush.setVapidDetails('mailto:your-email@example.com', vapidKeys.publicKey, vapidKeys.privateKey);

const subscriptions = new Map();
const reminders = new Map();

const optionsHttps = {
    key: fs.readFileSync(path.join(__dirname, 'localhost+2-key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'localhost+2.pem'))
};

const server = https.createServer(optionsHttps, app);
const io = socketIo(server, { 
    cors: { origin: 'https://localhost:4001', methods: ['GET','POST'], credentials: true } 
});

io.on('connection', socket => {
    console.log('✅ Client connected:', socket.id);

    socket.on('newTask', task => {
        console.log('📩 New task:', task.text);
        io.emit('taskAdded', task);
        if (subscriptions.size > 0) {
            const payload = JSON.stringify({ title: 'Новая задача', body: task.text });
            subscriptions.forEach(sub => {
                webpush.sendNotification(sub, payload).catch(err => console.error('❌ Push error:', err.message));
            });
        }
    });

    socket.on('newReminder', reminder => {
        const { id, text, reminderTime } = reminder;
        const delay = reminderTime - Date.now();
        
        console.log('⏰ New reminder:', text, 'in', Math.round(delay/1000), 'seconds');
        
        if (delay <= 0) {
            console.log('⚠️ Time already passed');
            return;
        }

        const timeoutId = setTimeout(() => {
            console.log('🔔 Reminder triggered:', text);
            
            const payload = JSON.stringify({
                title: '⏰ Напоминание',
                body: text,
                reminderId: id
            });

            subscriptions.forEach(sub => {
                webpush.sendNotification(sub, payload)
                    .catch(err => console.error('❌ Push error:', err.message));
            });

            io.emit('reminderTriggered', { id, text });
            
            
            
            console.log('⏰ Reminder still in Map for snooze');
        }, delay);

        reminders.set(id, { timeoutId, text, reminderTime });
        console.log('✅ Reminder scheduled. Total active:', reminders.size);
    });

    socket.on('disconnect', () => console.log('❌ Client disconnected:', socket.id));
});

app.post('/subscribe', (req, res) => {
    if (!req.body || !req.body.endpoint) {
        return res.status(400).json({ error: 'Invalid subscription' });
    }
    subscriptions.set(req.body.endpoint, req.body);
    console.log('📝 Subscription added. Total:', subscriptions.size);
    res.status(201).json({ message: 'Subscribed', count: subscriptions.size });
});

app.post('/unsubscribe', (req, res) => {
    if (!req.body || !req.body.endpoint) {
        return res.status(400).json({ error: 'Invalid request' });
    }
    const deleted = subscriptions.delete(req.body.endpoint);
    console.log('🗑️ Subscription removed. Total:', subscriptions.size);
    res.status(200).json({ message: 'Unsubscribed', deleted, count: subscriptions.size });
});


app.post('/snooze', (req, res) => {
    const reminderId = parseInt(req.query.reminderId, 10);
    
    console.log('😴 Snooze request for:', reminderId);
    
    if (!reminderId || !reminders.has(reminderId)) {
        console.log('❌ Reminder not found');
        return res.status(404).json({ error: 'Reminder not found' });
    }

    const reminder = reminders.get(reminderId);
    clearTimeout(reminder.timeoutId);

    const newDelay = 5 * 60 * 1000;
    const newReminderTime = Date.now() + newDelay;
    
    const newTimeoutId = setTimeout(() => {
        console.log('🔔 Snoozed reminder triggered:', reminder.text);
        
        const payload = JSON.stringify({
            title: '⏰ Напоминание (отложенное)',
            body: reminder.text,
            reminderId: reminderId
        });

        subscriptions.forEach(sub => {
            webpush.sendNotification(sub, payload)
                .catch(err => console.error('❌ Push error:', err.message));
        });

        io.emit('reminderTriggered', { id: reminderId, text: reminder.text, snoozed: true });
        // reminders.delete(reminderId);
    }, newDelay);

    reminders.set(reminderId, { 
        timeoutId: newTimeoutId, 
        text: reminder.text, 
        reminderTime: newReminderTime,
        snoozed: true
    });
    
    console.log('✅ Reminder snoozed');
    
    
    io.emit('reminderSnoozed', {
        id: reminderId,
        newTime: newReminderTime
    });
    
    res.status(200).json({ 
        message: 'Reminder snoozed for 5 minutes',
        newTime: newReminderTime
    });
});

app.get('/subscriptions', (req, res) => {
    res.json({ count: subscriptions.size, endpoints: Array.from(subscriptions.keys()) });
});

server.listen(3001, () => {
    console.log('🚀 Server running at https://localhost:3001');
    console.log('📊 Subscriptions:', subscriptions.size);
    console.log('⏰ Reminders:', reminders.size);
});