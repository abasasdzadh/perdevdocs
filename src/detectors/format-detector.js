import path from 'path';

export class FormatDetector {
  static detect(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.json') return 'json';
    if (ext === '.html' || ext === '.htm') return 'html';
    if (ext === '.md') return 'markdown';
    return 'unknown';
  }
}