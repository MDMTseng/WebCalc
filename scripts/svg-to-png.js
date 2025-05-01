import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const svgBuffer = readFileSync(join(__dirname, '../src/assets/icon.svg'));

sharp(svgBuffer)
  .resize(512, 512)
  .png()
  .toFile(join(__dirname, '../src/assets/icon.png'))
  .then(info => {
    console.log('Generated PNG icon');
  })
  .catch(err => {
    console.error('Error generating PNG icon:', err);
  }); 