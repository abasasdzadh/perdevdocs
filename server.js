import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PipelineManager } from './src/pipeline-manager.js';
import { GeminiTranslator } from './src/translators/gemini-translator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const pipeline = new PipelineManager();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// دریافت آمار
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
    selectedModel: pipeline.selectedModel,
    currentDoc: pipeline.currentDoc,
    currentPage: pipeline.currentPage,
    progress: pipeline.progress,
    stats: pipeline.stats,
    failedPagesCount: pipeline.failedPages.length,
    dailyUsageCount: dailyUsage.count || 0,
    maxDailyLimit: 400
  });
});

// کلیدهای API
app.get('/api/keys', (req, res) => {
  const keysRaw = process.env.GEMINI_API_KEYS || '';
  const keys = keysRaw.split(',').map(k => k.trim()).filter(Boolean);
  res.json(keys.map((k, i) => ({
    id: i,
    masked: k.length > 8 ? `${k.substring(0, 4)}...${k.substring(k.length - 4)}` : '***',
    key: k
  })));
});

app.post('/api/keys/add', (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'کلید خالی است.' });

  const keysRaw = process.env.GEMINI_API_KEYS || '';
  const keys = keysRaw.split(',').map(k => k.trim()).filter(Boolean);
  if (!keys.includes(key)) {
    keys.push(key);
    process.env.GEMINI_API_KEYS = keys.join(',');
  }
  res.json({ success: true });
});

app.post('/api/keys/test', async (req, res) => {
  const { key } = req.body;
  const result = await GeminiTranslator.testKey(key);
  res.json(result);
});

app.post('/api/keys/delete', (req, res) => {
  const { key } = req.body;
  let keysRaw = process.env.GEMINI_API_KEYS || '';
  let keys = keysRaw.split(',').map(k => k.trim()).filter(Boolean);
  keys = keys.filter(k => k !== key);
  process.env.GEMINI_API_KEYS = keys.join(',');
  res.json({ success: true });
});

// تنظیم مدل و تاخیر
app.post('/api/settings', (req, res) => {
  const { delay, model } = req.body;
  if (delay !== undefined) pipeline.setDelay(delay);
  if (model !== undefined) pipeline.setModel(model);
  res.json({ success: true });
});

// افزودن داک‌ست جدید
app.post('/api/docsets/add', (req, res) => {
  const { id, name, contentUrl } = req.body;
  if (!id || !name || !contentUrl) return res.status(400).json({ error: 'اطلاعات ناقص است' });

  try {
    const raw = fs.readFileSync('./docsets.json', 'utf8');
    const docsets = JSON.parse(raw);
    docsets.push({ id, name, format: 'json-db', contentUrl });
    fs.writeFileSync('./docsets.json', JSON.stringify(docsets, null, 2), 'utf8');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'خطا در افزودن داک‌ست' });
  }
});

// صفحات دارای خطا
app.get('/api/failed-pages', (req, res) => {
  res.json(pipeline.failedPages);
});

app.post('/api/retry-failed', (req, res) => {
  const { docId, pageKey } = req.body;
  pipeline.start(docId, pageKey);
  res.json({ message: 'تلاش مجدد آغاز شد.' });
});

// سایر اندپینت‌ها
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

app.get('/api/preview/current', (req, res) => {
  res.json({
    pageKey: pipeline.currentPage,
    html: pipeline.currentPageHtml || '<div style="padding:20px;text-align:center;">هنوز صفحه‌ای پردازش نشده است.</div>'
  });
});

app.get('/api/glossary', (req, res) => {
  try {
    if (fs.existsSync('./glossary.json')) {
      return res.json(JSON.parse(fs.readFileSync('./glossary.json', 'utf8')));
    }
    res.json({});
  } catch (e) { res.status(500).json({}); }
});

app.post('/api/glossary', (req, res) => {
  try {
    fs.writeFileSync('./glossary.json', JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ success: true });
  } catch (e) { res.status(500).json({}); }
});

app.get('/api/cache/search', async (req, res) => {
  const query = req.query.q || '';
  try {
    if (!pipeline.tm || !pipeline.tm.db) return res.json([]);
    const rows = await pipeline.tm.db.all(
      'SELECT original_text, translated_text, created_at FROM memory WHERE original_text LIKE ? OR translated_text LIKE ? LIMIT 50',
      [`%${query}%`, `%${query}%`]
    );
    res.json(rows);
  } catch (e) { res.json([]); }
});

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
  if (fs.existsSync(filePath)) return res.download(filePath);
  res.status(404).send('فایل پیدا نشد');
});

app.get('/api/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const onLog = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  pipeline.on('log', onLog);
  req.on('close', () => pipeline.removeListener('log', onLog));
});

app.get('/api/docsets', (req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync('./docsets.json', 'utf8')));
  } catch (e) { res.status(500).json([]); }
});

app.listen(PORT, () => {
  console.log(`🌐 داشبورد فوق پیشرفته DevDocs آنلاین شد: http://localhost:${PORT}`);
});