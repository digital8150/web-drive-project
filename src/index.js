require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, '../uploads');

// Ensure uploads directory exists
if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(DATA_PATH, { recursive: true });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/status', (req, res) => {
    res.json({ status: 'ok', message: 'LiteDrive Server is running', rootPath: DATA_PATH });
});

app.listen(PORT, () => {
    console.log(`LiteDrive Server is running on http://localhost:${PORT}`);
    console.log(`Shared Local Path: ${DATA_PATH}`);
});
