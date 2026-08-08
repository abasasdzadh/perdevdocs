import * as cheerio from 'cheerio';
import { RuleEngine } from '../cache/rule-engine.js';

const ruleEngine = new RuleEngine();

export class TextExtractor {
  /**
   * ماسک‌گذاری عناصر فنی (دینامیک بر اساس html_tag_classification)
   */
  static extractAndMask($, $element) {
    const placeholders = [];
    let tokenIndex = 0;
    const tagsToMask = ruleEngine.getNeverTranslateTags();

    $element.find(tagsToMask).each((i, el) => {
      const $code = $(el);
      const token = `___KEEP_REF_${tokenIndex}___`;

      placeholders.push({
        token,
        html: $.html($code.attr('dir', 'ltr').attr('style', 'unicode-bidi: isolate; display: inline-block;'))
      });

      $code.replaceWith(token);
      tokenIndex++;
    });

    return {
      maskedText: $element.html(),
      placeholders
    };
  }

  static extractSequentialNodes($) {
    const nodes = [];
    const elements = $('p, li, h1, h2, h3, h4, h5, h6, td, th, figcaption, dt, dd, summary, blockquote, caption');

    elements.each((index, el) => {
      const $block = $(el);
      const { maskedText, placeholders } = TextExtractor.extractAndMask($, $block);

      if (maskedText && maskedText.trim().length > 0) {
        nodes.push({
          nodeIndex: index,
          $block,
          maskedText,
          placeholders
        });
      }
    });

    return nodes;
  }

  /**
   * استراتژی جدید: ترجمه یکپارچه صفحه
   * سقف ۱۰۰,۰۰۰ کاراکتر (معادل ۲۵ هزار توکن) که بسیار امن است.
   * هیچوقت وسط پاراگراف یا کد بریده نمی‌شود.
   */
  static createSmartChunks(unCachedNodes, maxCharsPerBatch = 100000) {
    const chunks = [];
    let currentChunk = [];
    let currentChunkChars = 0;

    for (const node of unCachedNodes) {
      const text = node.maskedText;

      // اگر یک پاراگراف به تنهایی از سقف هم بزرگتر بود
      if (text.length > maxCharsPerBatch) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentChunkChars = 0;
        }
        chunks.push([node]);
      } else {
        // اگر اضافه کردن این پاراگراف از سقف عبور کند، چنک قبلی را ببند
        if (currentChunkChars + text.length > maxCharsPerBatch && currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentChunkChars = 0;
        }
        currentChunk.push(node);
        currentChunkChars += text.length;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }
}