import fs from 'fs';
import path from 'path';

export class OutputBuilder {
  static saveJson(outputPath, jsonData) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(jsonData, null, 2), 'utf8');
  }
}