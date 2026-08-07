import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PipelineManager } from './src/pipeline-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const pipeline = new PipelineManager();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ۱. دریافت آمار و تنظیمات
app.get('/api/stats', (req, res) => {
  let dailyUsage = { date: '', count: 0 };
  try {
    if (fs.existsSync('./data/usage_tracker.json')) {
      dailyUsage = JSON.parse(fs.readFileSync('./data/usage_tracker.json', 'utf8'));
    }
  } catch (e) {}

  res.json({
    isRunning: pipeline.isRunning,
    isPaused: pipeline.isPaused,
    apiDelaySeconds: pipeline.apiDelaySeconds,
    currentDoc: pipeline.currentDoc,
    currentPage: pipeline.currentPage,
    progress: pipeline.progress,
    dailyUsageCount: dailyUsage.count || 0,
    maxDailyLimit: 400
  });
});

// ۲. تنظیم تاخیر زمانی
app.post('/api/settings/delay', (req, res) => {
  const { seconds } = req.body;
  pipeline.setDelay(seconds);
  res.json({ success: true, apiDelaySeconds: pipeline.apiDelaySeconds });
});

// ۳. کنترل شروع / توقف / مکث
app.post('/api/control', (req, res) => {
  const { action, docId } = req.body;
  if (action === 'start') {
    if (pipeline.isRunning) return res.status(400).json({ error: 'موتور روشن است.' });
    pipeline.start(docId);
    return res.json({ message: 'شروع شد' });
  }
  if (action === 'pause') {
    const isPaused = pipeline.togglePause();
    return res.json({ isPaused });
  }
  if (action === 'stop') {
    pipeline.stop();
    return res.json({ message: 'توقف ارسال شد' });
  }
  res.status(400).json({ error: 'دستور نامعتبر' });
});

// ۴. پیش‌نمایش زنده HTML صفحه فعلی
app.get('/api/preview/current', (req, res) => {
  res.json({
    pageKey: pipeline.currentPage,
    html: pipeline.currentPageHtml || '<div style="padding:20px;text-align:center;">هنوز صفحه‌ای پردازش نشده است.</div>'
  });
});

// ۵. مدیریت واژه‌نامه (Glossary API)
app.get('/api/glossary', (req, res) => {
  try {
    if (fs.existsSync('./glossary.json')) {
      const data = fs.readFileSync('./glossary.json', 'utf8');
      return res.json(JSON.parse(data));
    }
    res.json({});
  } catch (e) {
    res.status(500).json({ error: 'خطا در خواندن واژه‌نامه' });
  }
});

app.post('/api/glossary', (req, res) => {
  try {
    fs.writeFileSync('./glossary.json', JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'خطا در ذخیره واژه‌نامه' });
  }
});

// ۶. جستجو و مشاهده کش SQLite
app.get('/api/cache/search', async (req, res) => {
  const query = req.query.q || '';
  try {
    if (!pipeline.tm || !pipeline.tm.db) {
      return res.json([]);
    }
    const rows = await pipeline.tm.db.all(
      'SELECT original_text, translated_text, created_at FROM memory WHERE original_text LIKE ? OR translated_text LIKE ? LIMIT 50',
      [`%${query}%`, `%${query}%`]
    );
    res.json(rows);
  } catch (e) {
    res.json([]);
  }
});

// ۷. دریافت لیست داک‌ست‌های ترجمه‌شده برای دانلود
app.get('/api/downloads', (req, res) => {
  const outputDir = './data/output';
  if (!fs.existsSync(outputDir)) return res.json([]);
  
  const folders = fs.readdirSync(outputDir);
  const result = [];
  for (const f of folders) {
    const filePath = path.join(outputDir, f, 'db.json');
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      result.push({
        id: f,
        sizeMb: (stats.size / (1024 * 1024)).toFixed(2),
        updatedAt: stats.mtime.toLocaleTimeString('fa-IR')
      });
    }
  }
  res.json(result);
});

app.get('/api/download/:docId', (req, res) => {
  const filePath = path.join(__dirname, 'data/output', req.params.docId, 'db.json');
  if (fs.existsSync(filePath)) {
    return res.download(filePath);
  }
  res.status(404).send('فایل پیدا نشد');
});

// ۸. استریم زنده لاگ‌ها (SSE)
app.get('/api/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const onLog = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  pipeline.on('log', onLog);
  req.on('close', () => {
    pipeline.removeListener('log', onLog);
  });
});

app.get('/api/docsets', (req, res) => {
  try {
    const raw = fs.readFileSync('./docsets.json', 'utf8');
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ error: 'خطا در docsets' });
  }
});

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🌐 داشبورد پیشرفته DevDocs آنلاین شد: http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});