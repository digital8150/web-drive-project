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

// Helper to resolve and validate paths
const resolvePath = (requestedPath = '') => {
    const resolvedPath = path.resolve(DATA_PATH, requestedPath);
    if (!resolvedPath.startsWith(path.resolve(DATA_PATH))) {
        throw new Error('Access Denied: Path Traversal Detected');
    }
    return resolvedPath;
};

// API: List files and directories
app.get('/api/files', (req, res) => {
    try {
        const queryPath = req.query.path || '';
        const targetPath = resolvePath(queryPath);

        if (!fs.existsSync(targetPath)) {
            return res.status(404).json({ error: 'Directory not found' });
        }

        const stats = fs.statSync(targetPath);
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: 'Target is not a directory' });
        }

        const items = fs.readdirSync(targetPath).map(name => {
            const itemPath = path.join(targetPath, name);
            const itemStats = fs.statSync(itemPath);
            return {
                name,
                isDirectory: itemStats.isDirectory(),
                size: itemStats.size,
                mtime: itemStats.mtime,
                ext: path.extname(name).toLowerCase()
            };
        });

        res.json({
            currentPath: queryPath,
            items: items.sort((a, b) => (b.isDirectory - a.isDirectory) || a.name.localeCompare(b.name))
        });
    } catch (err) {
        res.status(403).json({ error: err.message });
    }
});

// API: Download file
app.get('/api/download', (req, res) => {
    try {
        const filePath = req.query.path;
        if (!filePath) return res.status(400).json({ error: 'Path is required' });

        const targetPath = resolvePath(filePath);
        if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
            return res.status(404).json({ error: 'File not found' });
        }

        res.download(targetPath);
    } catch (err) {
        res.status(403).json({ error: err.message });
    }
});

app.get('/api/status', (req, res) => {
    res.json({ status: 'ok', message: 'LiteDrive Server is running', rootPath: DATA_PATH });
});

app.listen(PORT, () => {
    console.log(`LiteDrive Server is running on http://localhost:${PORT}`);
    console.log(`Shared Local Path: ${DATA_PATH}`);
});
