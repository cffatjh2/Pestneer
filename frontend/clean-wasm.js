import fs from 'fs';
import path from 'path';

const assetsDir = path.resolve('dist/assets');
if (fs.existsSync(assetsDir)) {
  fs.readdirSync(assetsDir)
    .filter((file) => file.endsWith('.wasm'))
    .forEach((file) => {
      const filePath = path.join(assetsDir, file);
      console.log(`Removing wasm asset (loaded via CDN): ${file}`);
      fs.unlinkSync(filePath);
    });
}
