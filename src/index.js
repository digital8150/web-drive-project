require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, '../uploads');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Ensure uploads directory exists
if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(DATA_PATH, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = resolvePath(req.body.path || '');
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ 
    storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Middleware: Admin Authentication
const authMiddleware = (req, res, next) => {
    const password = req.headers['x-admin-password'];
    if (password === ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized: Admin access required' });
    }
};

// Helper to resolve and validate paths
const resolvePath = (requestedPath = '') => {
    const resolvedPath = path.resolve(DATA_PATH, requestedPath);
    if (!resolvedPath.startsWith(path.resolve(DATA_PATH))) {
        throw new Error('Access Denied: Path Traversal Detected');
    }
    return resolvedPath;
};

// API: Media Info (Tracks)
app.get('/api/media-info', (req, res) => {
    try {
        const filePath = req.query.path;
        if (!filePath) return res.status(400).json({ error: 'Path is required' });

        const targetPath = resolvePath(filePath);
        ffmpeg.ffprobe(targetPath, (err, metadata) => {
            if (err) return res.status(500).json({ error: err.message });
            
            const streams = metadata.streams.map(s => ({
                index: s.index,
                type: s.codec_type,
                codec: s.codec_name,
                language: s.tags ? s.tags.language : 'unknown',
                title: s.tags ? s.tags.title : (s.codec_type + ' ' + s.index)
            }));

            res.json({ streams });
        });
    } catch (err) {
        res.status(403).json({ error: err.message });
    }
});

// API: Subtitle Extraction (SRT)
app.get('/api/subtitle', (req, res) => {
    try {
        const filePath = req.query.path;
        const trackIndex = req.query.index;
        if (!filePath || trackIndex === undefined) return res.status(400).json({ error: 'Path and index are required' });

        const targetPath = resolvePath(filePath);
        
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        ffmpeg(targetPath)
            .outputOptions([`-map 0:${trackIndex}`, '-f srt'])
            .on('error', (err) => {
                console.error('Subtitle extraction error:', err);
                if (!res.headersSent) res.status(500).send(err.message);
            })
            .pipe(res, { end: true });
    } catch (err) {
        res.status(403).json({ error: err.message });
    }
});

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

// API: Upload file (Admin only)
app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ message: 'File uploaded successfully', file: req.file });
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

// API: Stream or Preview file
app.get('/api/view', (req, res) => {
    try {
        const filePath = req.query.path;
        if (!filePath) return res.status(400).json({ error: 'Path is required' });

        const targetPath = resolvePath(filePath);
        if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
            return res.status(404).json({ error: 'File not found' });
        }

        const stat = fs.statSync(targetPath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(targetPath, { start, end });
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': getMimeType(targetPath),
            };
            res.writeHead(206, head);
            file.pipe(res);
        } else {
            const head = {
                'Content-Length': fileSize,
                'Content-Type': getMimeType(targetPath),
            };
            res.writeHead(200, head);
            fs.createReadStream(targetPath).pipe(res);
        }
    } catch (err) {
        res.status(403).json({ error: err.message });
    }
});

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.wav': 'audio/wav',
        '.mp4': 'video/mp4',
        '.mkv': 'video/x-matroska',
        '.webm': 'video/webm',
        '.mp3': 'audio/mpeg',
        '.pdf': 'application/pdf',
        '.txt': 'text/plain',
        '.vtt': 'text/vtt',
        '.srt': 'text/plain',
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

app.get('/api/status', (req, res) => {
    res.json({ status: 'ok', message: 'LiteDrive Server is running', rootPath: DATA_PATH });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File size too large (Limit: 100MB)' });
        }
    }
    res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
    console.log(`LiteDrive Server is running on http://localhost:${PORT}`);
    console.log(`Shared Local Path: ${DATA_PATH}`);
});
