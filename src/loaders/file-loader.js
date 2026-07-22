import fs from 'fs';

export class FileLoader {
  static load(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`فایل یافت نشد: ${filePath}`);
    }
    return fs.readFileSync(filePath, 'utf8');
  }
}