/**
 * Image processing with Sharp
 * Handles resizing, format conversion, and optimization
 */

import sharp from 'sharp';
import type { ImageProcessOptions, ProcessedImage } from '../types';

/**
 * Process image: resize, convert format, optimize
 */
export async function processImage(
  imageData: Buffer,
  options: ImageProcessOptions
): Promise<ProcessedImage> {
  try {
    // Handle SVG pass-through (unless size is specified)
    if (isSvg(imageData)) {
      if (!options.size && (!options.format || options.format === 'svg')) {
        return {
          data: imageData,
          format: 'svg',
          width: 0,
          height: 0,
          size: imageData.length,
        };
      }
      // If size or format conversion is requested, rasterize the SVG
    }

    let pipeline = sharp(imageData);

    // Resize if size is specified
    if (options.size) {
      pipeline = pipeline.resize(options.size, options.size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });
    }

    // Convert format if specified
    if (options.format && options.format !== 'svg') {
      pipeline = applyFormat(pipeline, options.format, options.quality);
    }

    // Process the image
    const outputBuffer = await pipeline.toBuffer();
    const outputMetadata = await sharp(outputBuffer).metadata();

    return {
      data: outputBuffer,
      format: outputMetadata.format || options.format || 'png',
      width: outputMetadata.width || 0,
      height: outputMetadata.height || 0,
      size: outputBuffer.length,
    };
  } catch (error) {
    console.error('Error processing image:', error);
    // Return original image on error
    return {
      data: imageData,
      format: 'png',
      width: 0,
      height: 0,
      size: imageData.length,
    };
  }
}

/**
 * Check if buffer contains SVG data
 */
function isSvg(buffer: Buffer): boolean {
  const header = buffer.toString('utf8', 0, 100).toLowerCase();
  return header.includes('<svg') || header.includes('<?xml');
}

/**
 * Apply format conversion to Sharp pipeline
 */
function applyFormat(pipeline: sharp.Sharp, format: string, quality?: number): sharp.Sharp {
  switch (format.toLowerCase()) {
    case 'png':
      return pipeline.png({
        quality: quality || 90,
        compressionLevel: 9,
      });

    case 'jpg':
    case 'jpeg':
      return pipeline.jpeg({
        quality: quality || 85,
        mozjpeg: true,
      });

    case 'webp':
      return pipeline.webp({
        quality: quality || 90,
      });

    case 'ico':
      // Sharp doesn't natively support ICO output, convert to PNG
      // ICO files are typically handled by browsers as PNG anyway
      return pipeline.png({
        quality: quality || 90,
      });

    default:
      return pipeline.png({
        quality: quality || 90,
      });
  }
}

/**
 * Validate that buffer contains valid image data
 */
export async function validateImage(buffer: Buffer): Promise<boolean> {
  try {
    await sharp(buffer).metadata();
    return true;
  } catch {
    return false;
  }
}
