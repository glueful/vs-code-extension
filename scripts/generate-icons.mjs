#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';

/*
 * Icon Generation Script
 * Primary input: media/glueful-icon-source.png (expected 512x512 or larger)
 * Optional themed inputs:
 *   media/glueful-icon-light.png
 *   media/glueful-icon-dark.png
 * If light/dark variants exist they are processed in addition to the main icon.
 * Outputs:
 *   media/glueful-icon.png (128x128) – main marketplace icon
 *   media/icons/icon-<size>.png (other sizes)
 *   media/icons/light/icon-<size>.png (if light variant provided)
 *   media/icons/dark/icon-<size>.png (if dark variant provided)
 */

const projectRoot = path.resolve(process.cwd());
const mediaDir = path.join(projectRoot, 'media');
const primarySourceCandidates = ['glueful-icon-source.png', 'glueful-icon.png'];
const variantMap = {
  light: ['glueful-icon-light.png', 'glueful-icon-light-source.png'],
  dark: ['glueful-icon-dark.png', 'glueful-icon-dark-source.png'],
};

async function findFirstExisting(candidates) {
  for (const name of candidates) {
    const full = path.join(mediaDir, name);
    try {
      await fs.access(full);
      return full;
    } catch {}
  }
  return null;
}

async function findSources() {
  const primary = await findFirstExisting(primarySourceCandidates);
  if (!primary) {
    throw new Error(
      `No primary icon found. Place one of: ${primarySourceCandidates.join(', ')} in media/`,
    );
  }
  const variants = {};
  for (const key of Object.keys(variantMap)) {
    const found = await findFirstExisting(variantMap[key]);
    if (found) variants[key] = found;
  }
  return { primary, variants };
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function generate() {
  const { primary: sourcePath, variants } = await findSources();
  const sizes = [128, 64, 48, 32, 24, 16];
  const outMain = path.join(mediaDir, 'glueful-icon.png'); // 128 required by VS Code
  const iconsDir = path.join(mediaDir, 'icons');
  await ensureDir(iconsDir);

  // Preserve original alpha channel (transparency) for icons.
  const image = sharp(sourcePath);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to read source icon dimensions.');
  }
  if (metadata.width < 256 || metadata.height < 256) {
    console.warn('[warn] Source icon is smaller than 256px; upscale may reduce quality.');
  }

  // Generate main 128x128 with high-quality Lanczos3 kernel
  await sharp(sourcePath)
    .resize(128, 128, { fit: 'contain' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outMain);
  console.log('Generated', path.relative(projectRoot, outMain));

  // Helper to generate a family of sizes for a given input
  async function generateSizes(label, inputPath, baseDir) {
    for (const size of sizes) {
      if (size === 128 && label === 'primary') continue; // already produced main 128
      const outPath = path.join(baseDir, `icon-${size}.png`);
      await sharp(inputPath)
        .resize(size, size, { fit: 'contain' })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toFile(outPath);
      console.log(`Generated ${label}`, path.relative(projectRoot, outPath));
    }
  }

  await generateSizes('primary', sourcePath, iconsDir);

  // Variants (light/dark) if provided
  for (const [variant, variantPath] of Object.entries(variants)) {
    const variantDir = path.join(iconsDir, variant);
    await ensureDir(variantDir);
    // Also produce a 128 root-level themed preview for docs if desired
    const themed128 = path.join(variantDir, 'icon-128.png');
    await sharp(variantPath)
      .resize(128, 128, { fit: 'contain' })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(themed128);
    console.log(`Generated variant base ${variant}`, path.relative(projectRoot, themed128));
    await generateSizes(variant, variantPath, variantDir);
  }

  if (Object.keys(variants).length) {
    console.log(
      'Variants processed:',
      Object.keys(variants)
        .map((v) => `${v}`)
        .join(', '),
    );
  }

  console.log('All icons (including variants) generated successfully.');
}

generate().catch((err) => {
  console.error('[icon generation failed]', err.message);
  process.exit(1);
});
