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
        const uploadDir = resolvePath(req.uploadPath || '');
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, safeName);
    }
});
const upload = multer({ 
    storage
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
                title: s.tags ? s.tags.title : (s.codec_type + ' ' + s.index),
                isExternal: false
            }));

            // Check for external subtitle files
            const dir = path.dirname(targetPath);
            const fileName = path.basename(targetPath, path.extname(targetPath));
            const externalSubs = [];
            
            for (const ext of ['.srt', '.smi']) {
                const subPath = path.join(dir, fileName + ext);
                if (fs.existsSync(subPath)) {
                    externalSubs.push({
                        index: -1,
                        type: 'subtitle',
                        codec: ext.substring(1).toLowerCase(),
                        language: 'external',
                        title: `External ${ext.substring(1).toUpperCase()}`,
                        isExternal: true
                    });
                }
            }

            res.json({ streams: [...streams, ...externalSubs] });
        });
    } catch (err) {
        res.status(403).json({ error: err.message });
    }
});

// API: Subtitle Extraction (SRT or External Files)
app.get('/api/subtitle', (req, res) => {
    try {
        const filePath = req.query.path;
        const trackIndex = parseInt(req.query.index);
        const isExternal = req.query.external === 'true';
        
        if (!filePath || trackIndex === undefined) return res.status(400).json({ error: 'Path and index are required' });

        const targetPath = resolvePath(filePath);
        
        // External subtitle file
        if (isExternal) {
            const dir = path.dirname(targetPath);
            const fileName = path.basename(targetPath, path.extname(targetPath));
            
            for (const ext of ['.srt', '.smi']) {
                const subPath = path.join(dir, fileName + ext);
                if (fs.existsSync(subPath)) {
                    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                    return fs.createReadStream(subPath).pipe(res);
                }
            }
            return res.status(404).json({ error: 'Subtitle file not found' });
        }
        
        // Embedded subtitle stream from video
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

// API: Create directory (Admin only)
app.post('/api/mkdir', authMiddleware, (req, res) => {
    try {
        const { path: parentPath, name } = req.body;
        if (!name) return res.status(400).json({ error: 'Folder name is required' });

        const targetDir = path.join(resolvePath(parentPath || ''), name);
        
        if (fs.existsSync(targetDir)) {
            return res.status(400).json({ error: 'Folder already exists' });
        }

        fs.mkdirSync(targetDir);
        res.json({ message: 'Folder created successfully' });
    } catch (err) {
        res.status(403).json({ error: err.message });
    }
});

// API: Upload file (Admin only)
app.post('/api/upload', authMiddleware, (req, res, next) => {
    // 쿼리로 경로를 확실히 전달받아 multer 인스턴스에 주입
    req.uploadPath = req.query.path || '';
    next();
}, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ message: 'File uploaded successfully', file: req.file });
});

// API: Rename file/folder (Admin only)
app.post('/api/rename', authMiddleware, (req, res) => {
    try {
        const { path: itemPath, newName } = req.body;
        if (!itemPath || !newName) return res.status(400).json({ error: 'Path and new name are required' });

        const oldPath = resolvePath(itemPath);
        const parentDir = path.dirname(oldPath);
        const newPath = path.join(parentDir, newName);

        if (fs.existsSync(newPath)) {
            return res.status(400).json({ error: 'Target name already exists' });
        }

        fs.renameSync(oldPath, newPath);
        res.json({ message: 'Renamed successfully' });
    } catch (err) {
        res.status(403).json({ error: err.message });
    }
});

// API: Delete file/folder (Admin only)
app.post('/api/delete', authMiddleware, (req, res) => {
    try {
        const { path: itemPath } = req.body;
        if (!itemPath) return res.status(400).json({ error: 'Path is required' });

        const targetPath = resolvePath(itemPath);
        if (!fs.existsSync(targetPath)) {
            return res.status(404).json({ error: 'Item not found' });
        }

        const stats = fs.statSync(targetPath);
        if (stats.isDirectory()) {
            fs.rmSync(targetPath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(targetPath);
        }
        res.json({ message: 'Deleted successfully' });
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

// API: Stream or Preview file (오디오 트랙 선택 및 Seek 지원)
app.get('/api/view', (req, res) => {
    try {
        const filePath = req.query.path;
        const audioIndex = req.query.audio_index; 
        const startTime = req.query.start; // 프론트에서 보낸 시작 시간
        
        if (!filePath) return res.status(400).json({ error: 'Path is required' });
        const targetPath = resolvePath(filePath);
        
        if (!fs.existsSync(targetPath)) {
            console.error(`[View Error] File not found: ${targetPath}`);
            return res.status(404).json({ error: 'File not found' });
        }

        const stats = fs.statSync(targetPath);
        const ext = path.extname(targetPath).toLowerCase();
        const isVideo = ['.mp4', '.mkv', '.webm', '.mov'].includes(ext);

        // [오디오 리믹싱 스트리밍 모드] audio_index가 있을 때
        if (isVideo && audioIndex !== undefined) {
            console.log(`[Remux Start] Audio: ${audioIndex}, Start Time: ${startTime || 0}`);
            
            res.status(200).set({
                'Content-Type': 'video/mp4',
                'Transfer-Encoding': 'chunked',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache'
            });

            const ffmpegCommand = ffmpeg(targetPath);
            
            // 시작 시간이 있으면 해당 시간부터 잘라서 스트리밍
            if (startTime) {
                ffmpegCommand.setStartTime(startTime); 
            }

            const ffmpegProcess = ffmpegCommand
                .outputOptions([
                    '-map 0:v:0',              // 비디오 트랙 1번
                    `-map 0:${audioIndex}`,    // 선택한 오디오 트랙
                    '-c:v copy',               // 비디오 복사 (인코딩 X)
                    '-tag:v hvc1',             // HEVC 웹 브라우저 호환성 태그 강제
                    '-c:a aac',                // 오디오 AAC 변환
                    '-b:a 192k',               // 오디오 비트레이트
                    '-ac 2',                   // 스테레오 강제
                    '-f mp4',                  // 포맷 강제
                    // faststart 제거됨 (에러 원인)
                    '-movflags frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset',
                    '-preset ultrafast',       // 첫 데이터 생성 속도 극대화
                    '-tune zerolatency',       // 지연 시간 제거
                    '-strict -2'
                ])
                .on('start', (cmd) => console.log('FFmpeg Cmd:', cmd))
                .on('error', (err) => {
                    if (err.message.includes('SIGKILL') || err.message.includes('Output stream closed')) {
                        return;
                    }
                    console.error('FFmpeg Critical Error:', err.message);
                });

            // 클라이언트에 데이터 전송
            ffmpegProcess.pipe(res, { end: true });

            // 사용자가 연결 끊으면 프로세스 즉시 종료 (리소스 보호)
            req.on('close', () => {
                console.log('[Remux] Connection closed. Killing FFmpeg.');
                ffmpegProcess.kill('SIGKILL');
            });

            return; 
        }

        // [일반 스트리밍 모드] (오디오 선택 없을 때 - Range 지원)
        const fileSize = stats.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': getMimeType(targetPath),
            });
            fs.createReadStream(targetPath, { start, end }).pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': getMimeType(targetPath),
            });
            fs.createReadStream(targetPath).pipe(res);
        }
    } catch (err) {
        console.error('[View Catch Error]:', err.message);
        if (!res.headersSent) res.status(403).json({ error: err.message });
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
    res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
    console.log(`LiteDrive Server is running on http://localhost:${PORT}`);
    console.log(`Shared Local Path: ${DATA_PATH}`);
});
