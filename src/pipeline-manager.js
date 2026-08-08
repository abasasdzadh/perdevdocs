import EventEmitter from 'events';
import fs from 'fs';
import { FileLoader } from './loaders/file-loader.js';
import { HtmlParser } from './parsers/html-parser.js';
import { TextExtractor } from './extractor/text-extractor.js';
import { StaticDictionary } from './cache/static-dictionary.js';
import { TranslationMemory } from './cache/translation-memory.js';
import { RuleEngine } from './cache/rule-engine.js';
import { GeminiTranslator } from './translators/gemini-translator.js';
import { TranslationQueue } from './queue/translation-queue.js';
import { TranslationValidator } from './validators/translation-validator.js';
import { TextReplacer } from './replacer/text-replacer.js';
import { OutputBuilder } from './builders/output-builder.js';

export class PipelineManager extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.isPaused = false;
    this.shouldStop = false;
    this.apiDelaySeconds = 90;
    this.modelCascade = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']; // مدل‌های شما دست‌نخورده
    this.currentDoc = null;
    this.currentPage = '';
    this.currentPageHtml = '';
    this.progress = { current: 0, total: 0 };
    this.stats = { cacheHits: 0, aiCalls: 0 };
    this.failedPages = [];
    this.tm = null;
    this.ruleEngine = new RuleEngine();
    this.maxCharsPerBatch = 100000;
    this.useKeyRotation = false;
    
    // تنظیمات پیشرفته AI
    this.aiConfig = {
      temperature: 0.2,
      maxOutputTokens: 8192,
      topP: 0.95,
      topK: 40
    };
    
    this.settingsPath = './settings.json';
    this.geminiKeys = [];
    this.loadSettings();
  }

  loadSettings() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const s = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
        this.apiDelaySeconds = s.apiDelaySeconds ?? this.apiDelaySeconds;
        this.modelCascade = s.modelCascade ?? this.modelCascade;
        this.maxCharsPerBatch = s.maxCharsPerBatch ?? this.maxCharsPerBatch;
        this.useKeyRotation = s.useKeyRotation ?? this.useKeyRotation;
        this.aiConfig = s.aiConfig ?? this.aiConfig;
        this.geminiKeys = s.geminiKeys ?? [];
        process.env.GEMINI_API_KEYS = this.geminiKeys.join(',');
      }
    } catch (e) { console.warn('⚠️ Error loading settings.json'); }
  }

  saveSettings() {
    try {
      const s = {
        apiDelaySeconds: this.apiDelaySeconds,
        modelCascade: this.modelCascade,
        maxCharsPerBatch: this.maxCharsPerBatch,
        useKeyRotation: this.useKeyRotation,
        aiConfig: this.aiConfig,
        geminiKeys: this.geminiKeys
      };
      fs.writeFileSync(this.settingsPath, JSON.stringify(s, null, 2), 'utf8');
    } catch (e) { console.warn('⚠️ Error saving settings.json'); }
  }

  addKey(key) {
    if (!this.geminiKeys.includes(key)) {
      this.geminiKeys.push(key);
      process.env.GEMINI_API_KEYS = this.geminiKeys.join(',');
      this.saveSettings();
    }
  }

  deleteKey(key) {
    this.geminiKeys = this.geminiKeys.filter(k => k !== key);
    process.env.GEMINI_API_KEYS = this.geminiKeys.join(',');
    this.saveSettings();
  }

  getKeys() {
    return this.geminiKeys.map((k, i) => ({ id: i, masked: k.length > 8 ? `${k.substring(0, 4)}...${k.substring(k.length - 4)}` : '***', key: k }));
  }

  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('fa-IR');
    const logData = { timestamp, message, type };
    console.log(`[${timestamp}] ${message}`);
    this.emit('log', logData);
  }

  getRulesStats() {
    return {
      neverTranslateCount: this.ruleEngine.neverTranslate.size,
      cacheOnceCount: this.ruleEngine.cacheOnce.size,
      ignoredTags: this.ruleEngine.getNeverTranslateTags()
    };
  }

  setChunkSize(size) {
    this.maxCharsPerBatch = Math.max(1000, parseInt(size) || 100000);
    this.saveSettings();
    this.log(`⚙️ سقف کاراکتر برای هر درخواست به ${this.maxCharsPerBatch} تغییر یافت.`);
  }

  setKeyRotation(enabled) {
    this.useKeyRotation = !!enabled;
    this.saveSettings();
    this.log(`⚙️ چرخش کلیدها (Load Balancing) ${this.useKeyRotation ? 'فعال شد' : 'غیرفعال شد'}.`);
  }

  setAiConfig(config) {
    this.aiConfig = {
      temperature: parseFloat(config.temperature) || 0.2,
      maxOutputTokens: parseInt(config.maxOutputTokens) || 8192,
      topP: parseFloat(config.topP) || 0.95,
      topK: parseInt(config.topK) || 40
    };
    this.saveSettings();
    this.log(`⚙️ تنظیمات پیشرفته AI ذخیره شد.`);
  }

  async clearCache() {
    if (this.tm) {
      await this.tm.clearAll();
      this.log('🗑️ حافظه کش (SQLite) به طور کامل پاکسازی شد.', 'warn');
    }
  }

  async deleteCacheItem(originalText) {
    if (this.tm) {
      await this.tm.delete(originalText);
      this.log('🗑️ یک ترجمه از کش حذف شد.', 'warn');
    }
  }

  reloadRules() {
    this.ruleEngine.loadRules();
    this.log('🔄 قوانین موتور با موفقیت مجدداً بارگذاری شدند.');
  }

  setModelCascade(cascadeArray) {
    if (Array.isArray(cascadeArray) && cascadeArray.length > 0) {
      this.modelCascade = cascadeArray;
      this.saveSettings();
      this.log(`⚙️ زنجیره مدل‌ها بهینه‌سازی شد: [ ${this.modelCascade.join(' ➔ ')} ]`);
    }
  }

  setDelay(seconds) {
    this.apiDelaySeconds = Math.max(0, parseInt(seconds) || 0);
    this.saveSettings();
    this.log(`⚙️ تاخیر API به ${this.apiDelaySeconds} ثانیه تغییر یافت.`);
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    this.log(this.isPaused ? '⏸️ موتور متوقف موقت شد.' : '▶️ موتور ادامه یافت.', 'warn');
    this.emit('statusChange', { isRunning: this.isRunning, isPaused: this.isPaused });
    return this.isPaused;
  }

  stop() {
    if (this.isRunning) {
      this.shouldStop = true;
      this.isPaused = false;
      this.log('🛑 دستور توقف کامل موتور دریافت شد...', 'warn');
    }
  }

  async start(selectedDocId = null, targetPageKey = null) {
    if (this.isRunning) return;

    this.isRunning = true;
    this.isPaused = false;
    this.shouldStop = false;
    this.emit('statusChange', { isRunning: true, isPaused: false });

    try {
      this.log('🚀 شروع موتور اختصاصی ترجمه DevDocs...');

      this.tm = new TranslationMemory();
      await this.tm.init();

      // ارسال تنظیمات AI به مترجم
      const translator = new GeminiTranslator(this.modelCascade, this.useKeyRotation, this.aiConfig);
      const queue = new TranslationQueue();

      const docsetsRaw = fs.readFileSync('./docsets.json', 'utf8');
      let docsets = JSON.parse(docsetsRaw);

      if (selectedDocId) {
        docsets = docsets.filter(d => d.id === selectedDocId);
      }

      for (const doc of docsets) {
        if (this.shouldStop) break;

        this.currentDoc = doc.name;
        this.log(`📚 پردازش مستندات: ${doc.name} (${doc.id})`);

        const rawDbContent = await FileLoader.load(doc.contentUrl);
        const dbData = JSON.parse(rawDbContent);

        const translatedDbData = {};
        let pageKeys = Object.keys(dbData);

        if (targetPageKey) {
          pageKeys = pageKeys.filter(k => k === targetPageKey);
        }

        this.progress = { current: 0, total: pageKeys.length };

        for (let index = 0; index < pageKeys.length; index++) {
          if (this.shouldStop) {
            this.log('🛑 فرایند ترجمه متوقف شد.', 'warn');
            break;
          }

          while (this.isPaused && !this.shouldStop) {
            await new Promise(res => setTimeout(res, 500));
          }

          const pageKey = pageKeys[index];
          this.currentPage = pageKey;
          this.progress.current = index + 1;
          this.emit('progress', this.progress);

          const pageHtml = dbData[pageKey];
          this.log(`[صفحه ${index + 1}/${pageKeys.length}] 📄 در حال پردازش: "${pageKey}"`);

          try {
            const $ = HtmlParser.parse(pageHtml);
            $('body').attr('dir', 'rtl').addClass('fa-doc');

            const nodes = TextExtractor.extractSequentialNodes($);
            const unCachedNodes = [];

            for (const node of nodes) {
              const staticMatch = StaticDictionary.get(node.maskedText);
              if (staticMatch) {
                node.translatedText = staticMatch;
                this.stats.cacheHits++;
                continue;
              }

              if (this.ruleEngine.isNeverTranslate(node.maskedText)) {
                node.translatedText = node.maskedText;
                this.stats.cacheHits++;
                continue;
              }

              const cached = await this.tm.get(node.maskedText);
              if (cached) {
                node.translatedText = cached;
                this.stats.cacheHits++;
              } else {
                unCachedNodes.push(node);
              }
            }

            let hasAiCalls = false;

            if (unCachedNodes.length > 0) {
              hasAiCalls = true;
              this.stats.aiCalls += unCachedNodes.length;

              const smartChunks = TextExtractor.createSmartChunks(unCachedNodes, this.maxCharsPerBatch);
              this.log(`  🌐 پاراگراف‌های جدید: ${unCachedNodes.length} (در قالب ${smartChunks.length} درخواست یکپارچه)...`);

              for (let chunkIdx = 0; chunkIdx < smartChunks.length; chunkIdx++) {
                if (this.shouldStop) break;

                const chunkNodes = smartChunks[chunkIdx];
                const textsToTranslate = chunkNodes.map(n => n.maskedText);

                try {
                  const translatedArray = await queue.executeBatchWithRetry(translator, textsToTranslate);

                  for (let j = 0; j < chunkNodes.length; j++) {
                    const node = chunkNodes[j];
                    const trans = (translatedArray && translatedArray[j]) ? translatedArray[j] : node.maskedText;

                    const isValid = TranslationValidator.validate(node.placeholders, trans);
                    if (isValid) {
                      node.translatedText = trans;
                      await this.tm.set(node.maskedText, trans);
                    } else {
                      node.translatedText = node.maskedText;
                    }
                  }
                } catch (apiErr) {
                  this.log(`❌ خطای API در این بخش: ${apiErr.message}`, 'error');
                  chunkNodes.forEach(node => { node.translatedText = node.maskedText; });
                }
              }
            } else {
              this.log(`  ⚡ تمام پاراگراف‌ها از کش یا قوانین خوانده شد (0ms)`);
            }

            for (const node of nodes) {
              let finalHtml;
              if (node.translatedText) {
                finalHtml = TextReplacer.unmask(node.translatedText, node.placeholders);
              } else {
                finalHtml = TextReplacer.unmask(node.maskedText, node.placeholders);
              }
              node.$block.html(finalHtml);
            }

            this.currentPageHtml = $.html();
            translatedDbData[pageKey] = this.currentPageHtml;

            this.failedPages = this.failedPages.filter(p => !(p.docId === doc.id && p.pageKey === pageKey));

            if (index < pageKeys.length - 1 && !this.shouldStop) {
              if (hasAiCalls && this.apiDelaySeconds > 0) {
                this.log(`⏳ تعلیق ${this.apiDelaySeconds} ثانیه‌ای موتور...`);
                for (let sec = this.apiDelaySeconds; sec > 0; sec--) {
                  if (this.shouldStop) break;
                  while (this.isPaused && !this.shouldStop) {
                    await new Promise(res => setTimeout(res, 500));
                  }
                  await new Promise(res => setTimeout(res, 1000));
                }
              } else {
                await new Promise(res => setTimeout(res, 50));
              }
            }

          } catch (pageErr) {
            this.log(`❌ خطا در ترجمه صفحه "${pageKey}": ${pageErr.message}`, 'error');
            if (!this.failedPages.some(p => p.docId === doc.id && p.pageKey === pageKey)) {
              this.failedPages.push({ docId: doc.id, docName: doc.name, pageKey, error: pageErr.message, time: new Date().toLocaleTimeString('fa-IR') });
            }
          }
        }

        if (!this.shouldStop && !targetPageKey) {
          const outputPath = `./data/output/${doc.id}/db.json`;
          OutputBuilder.saveJson(outputPath, translatedDbData);
          this.log(`🎉 ترجمه db.json برای ${doc.name} با موفقیت ذخیره شد!`, 'success');
        }
      }
    } catch (error) {
      this.log(`❌ خطا در موتور: ${error.message}`, 'error');
    } finally {
      this.isRunning = false;
      this.isPaused = false;
      this.emit('statusChange', { isRunning: false, isPaused: false });
      this.log('🏁 عملیات خروج.');
    }
  }
}