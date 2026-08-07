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

app.get('/api/docsets', (req, res) => {
  try {
    const raw = fs.readFileSync('./docsets.json', 'utf8');
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ error: 'خطا در خواندن فایل docsets.json' });
  }
});

app.get('/api/stats', (req, res) => {
  let dailyUsage = { date: '', count: 0 };
  try {
    if (fs.existsSync('./data/usage_tracker.json')) {
      dailyUsage = JSON.parse(fs.readFileSync('./data/usage_tracker.json', 'utf8'));
    }
  } catch (e) {}

  res.json({
    isRunning: pipeline.isRunning,
    currentDoc: pipeline.currentDoc,
    currentPage: pipeline.currentPage,
    progress: pipeline.progress,
    dailyUsageCount: dailyUsage.count || 0,
    maxDailyLimit: 400
  });
});

app.post('/api/start', (req, res) => {
  const { docId } = req.body;
  if (pipeline.isRunning) {
    return res.status(400).json({ error: 'موتور در حال حاضر در حال اجرا است.' });
  }
  pipeline.start(docId);
  res.json({ message: 'موتور ترجمه روشن شد.' });
});

app.post('/api/stop', (req, res) => {
  if (!pipeline.isRunning) {
    return res.status(400).json({ error: 'موتور در حال اجرا نیست.' });
  }
  pipeline.stop();
  res.json({ message: 'دستور توقف ارسال شد.' });
});

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

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🌐 پنل وب با موفقیت آنلاین شد!`);
  console.log(`👉 آدرس ورودی: http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});