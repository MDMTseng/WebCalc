import sharp from 'sharp';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const inputFile = join(__dirname, '../src/assets/icon.png');
const outputDir = join(__dirname, '../public/icons');

// Create output directory if it doesn't exist
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

sizes.forEach(size => {
  sharp(inputFile)
    .resize(size, size)
    .toFile(join(outputDir, `icon-${size}x${size}.png`))
    .then(info => {
      console.log(`Generated ${size}x${size} icon`);
    })
    .catch(err => {
      console.error(`Error generating ${size}x${size} icon:`, err);
    });
}); 