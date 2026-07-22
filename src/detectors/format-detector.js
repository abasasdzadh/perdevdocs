import path from 'path';

export class FormatDetector {
  static detect(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html' || ext === '.htm') return 'html';
    if (ext === '.json') return 'json';
    if (ext === '.md') return 'markdown';
    
    throw new Error(`فرمت پشتیبانی نشده: ${ext}`);
  }
}