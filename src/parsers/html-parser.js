import * as cheerio from 'cheerio';

export class HtmlParser {
  static parse(htmlContent) {
    return cheerio.load(htmlContent, { decodeEntities: false }, false);
  }
}