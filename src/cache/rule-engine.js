import fs from 'fs';

/**
 * موتور قوانین هوشمند برای اعمال قوانین Bypass و تگ‌های HTML
 */
export class RuleEngine {
  constructor() {
    this.neverTranslate = new Set();
    this.cacheOnce = new Set();
    this.neverTranslateTags = 'code, pre, kbd, samp, var, math, svg, iframe, script, style, noscript, annotation, semantics';
    this.loadRules();
  }

  loadRules() {
    try {
      // ۱. بارگذاری لیست سیاه (Bypass)
      const bypassPath = './rules/master_bypass_list.json';
      if (fs.existsSync(bypassPath)) {
        const bypass = JSON.parse(fs.readFileSync(bypassPath, 'utf8'));
        bypass.never_translate.technical_terms.forEach(term => this.neverTranslate.add(term.trim()));
        Object.values(bypass.cache_once_translate).forEach(arr => {
          arr.forEach(text => this.cacheOnce.add(text.trim()));
        });
      }

      // ۲. بارگذاری برچسب‌های UI
      const uiPath = './rules/ui_labels.json';
      if (fs.existsSync(uiPath)) {
        const labels = JSON.parse(fs.readFileSync(uiPath, 'utf8'));
        labels.labels.forEach(item => {
          if (["Firefox", "Safari", "Chrome", "Opera", "Edge", "Node.js", "Deno", "Server"].includes(item.text)) {
            this.neverTranslate.add(item.text.trim());
          } else {
            this.cacheOnce.add(item.text.trim());
          }
        });
      }

      // ۳. بارگذاری قوانین تگ‌های HTML
      const tagsPath = './rules/html_tag_classification.json';
      if (fs.existsSync(tagsPath)) {
        const tags = JSON.parse(fs.readFileSync(tagsPath, 'utf8'));
        const neverTags = Object.keys(tags.tag_rules.never_translate).join(', ');
        if (neverTags) this.neverTranslateTags = neverTags;
      }

      console.log(`⚙️ Rule Engine Loaded: ${this.neverTranslate.size} never-translate terms, ${this.cacheOnce.size} cache-once texts.`);
    } catch (e) {
      console.warn('⚠️ Error loading rules:', e.message);
    }
  }

  isNeverTranslate(text) {
    if (!text) return false;
    return this.neverTranslate.has(text.trim());
  }

  isCacheOnce(text) {
    if (!text) return false;
    return this.cacheOnce.has(text.trim());
  }

  getNeverTranslateTags() {
    return this.neverTranslateTags;
  }
}