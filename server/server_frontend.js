const fs = require('fs');
const https = require('https');
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();

app.use(cors());

// 🔥 ВАЖНО: Раздаём файлы из РОДИТЕЛЬСКОЙ папки (..)
app.use(express.static(path.join(__dirname, '..')));

// 🔥 Пути к сертификатам
const options = {
    key: fs.readFileSync(path.join(__dirname, 'localhost+2-key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'localhost+2.pem'))
};

const PORT = 4001;

https.createServer(options, app).listen(PORT, () => {
    console.log(`🌐 Frontend HTTPS server running at https://localhost:${PORT}`);
});