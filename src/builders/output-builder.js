import fs from 'fs';
import path from 'path';

export class OutputBuilder {
  static save(outputPath, content) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, content, 'utf8');
  }
}