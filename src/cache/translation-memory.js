import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * دیتابیس حافظه ترجمه محلی جهت پیش‌ترجمه آنی (۰ میلی‌ثانیه و بدون هزینه API)
 */
export class TranslationMemory {
  constructor() {
    this.db = null;
  }

  async init() {
    const dir = './data';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = await open({
      filename: './data/cache.sqlite',
      driver: sqlite3.Database
    });

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory (
        hash TEXT PRIMARY KEY,
        original_text TEXT,
        translated_text TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  static hashText(text) {
    return crypto.createHash('sha256').update(text.trim()).digest('hex');
  }

  async get(text) {
    const hash = TranslationMemory.hashText(text);
    const result = await this.db.get('SELECT translated_text FROM memory WHERE hash = ?', hash);
    return result ? result.translated_text : null;
  }

  async set(originalText, translatedText) {
    const hash = TranslationMemory.hashText(originalText);
    await this.db.run(
      'INSERT OR REPLACE INTO memory (hash, original_text, translated_text) VALUES (?, ?, ?)',
      [hash, originalText, translatedText]
    );
  }
}