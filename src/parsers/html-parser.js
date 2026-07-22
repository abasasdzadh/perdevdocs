import * as cheerio from 'cheerio';

export class HtmlParser {
  static parse(content) {
    return cheerio.load(content, { decodeEntities: false }, false);
  }
}