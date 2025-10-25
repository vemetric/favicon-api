/**
 * Image processing with Sharp
 * Handles resizing, format conversion, and optimization
 */

import type { Sharp } from 'sharp';
import sharp from 'sharp';
import { sharpsFromIco } from 'sharp-ico';
import type { ImageProcessOptions, ProcessedImage } from '../types';
import { detectFormatFromBuffer, isIco, isSvg } from './format-detector';

/**
 * Process image: resize, convert format, optimize
 */
export async function processImage(
  imageData: Buffer,
  options: ImageProcessOptions
): Promise<ProcessedImage> {
  try {
    // Handle SVG pass-through
    // SVGs are vector graphics and scale perfectly, so keep them as SVG
    // unless the user explicitly requests a raster format (png, jpg, etc.)
    if (isSvg(imageData)) {
      if (!options.format || options.format === 'svg') {
        // Pass through SVG without rasterization
        const dimensions = extractSvgDimensions(imageData);

        // If size is specified, report that size (SVGs scale perfectly)
        // Otherwise, report the original SVG dimensions
        const width = options.size || dimensions.width;
        const height = options.size || dimensions.height;

        return {
          data: imageData,
          format: 'svg',
          width,
          height,
          bytes: imageData.length,
        };
      }
      // If format conversion to raster is requested, rasterize the SVG
    }

    // Handle ICO files specially since Sharp doesn't support them natively
    let workingBuffer = imageData;
    let originalMetadata: sharp.Metadata | null = null;
    let detectedFormat = 'png';

    if (isIco(imageData)) {
      try {
        // Convert ICO to Sharp instance(s), get the largest one
        const sharpInstances = await sharpsFromIco(imageData);
        if (sharpInstances.length > 0) {
          // Find the largest icon by examining metadata of all instances
          let largestSharp: Sharp | null = null;
          let largestSize = 0;

          for (const sharpInstance of sharpInstances) {
            if (!('metadata' in sharpInstance)) {
              continue;
            }

            const metadata = await sharpInstance.metadata();
            const size = (metadata.width || 0) * (metadata.height || 0);
            if (size > largestSize) {
              largestSize = size;
              largestSharp = sharpInstance;
            }
          }

          detectedFormat = 'ico';
          if (!largestSharp) {
            throw new Error('No valid Sharp instance found in ICO');
          }

          originalMetadata = await largestSharp.metadata();

          // Convert the Sharp instance to a buffer for further processing
          workingBuffer = await largestSharp.png().toBuffer();
        }
      } catch {
        // If ICO parsing fails, fall back to original behavior
        detectedFormat = 'ico';
      }
    }

    // Try to get original metadata first (helps with error recovery)
    if (!originalMetadata) {
      try {
        originalMetadata = await sharp(workingBuffer).metadata();
        detectedFormat = originalMetadata.format || 'png';
      } catch {
        // If we can't read metadata, try to detect format from buffer
        detectedFormat = detectFormatFromBuffer(imageData);

        // If it's an unsupported format and no processing is requested, return as-is
        if (!options.size && !options.format) {
          return {
            data: imageData,
            format: detectedFormat,
            width: originalMetadata?.width || 0,
            height: originalMetadata?.height || 0,
            bytes: imageData.length,
          };
        }
      }
    }

    let pipeline = sharp(workingBuffer);

    // Resize if size is specified
    if (options.size) {
      pipeline = pipeline.resize(options.size, options.size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });
    }

    // Convert format if specified
    if (options.format) {
      pipeline = applyFormat(pipeline, options.format, options.quality);
    }

    // Process the image
    const outputBuffer = await pipeline.toBuffer();
    const outputMetadata = await sharp(outputBuffer).metadata();

    return {
      data: outputBuffer,
      format: outputMetadata.format || options.format || detectedFormat,
      width: outputMetadata.width || 0,
      height: outputMetadata.height || 0,
      bytes: outputBuffer.length,
    };
  } catch {
    // Try to detect format from buffer for better error recovery
    const detectedFormat = detectFormatFromBuffer(imageData);

    // Return original image on error with detected format
    return {
      data: imageData,
      format: detectedFormat,
      width: 0,
      height: 0,
      bytes: imageData.length,
    };
  }
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
    if (isSvg(buffer) || isIco(buffer)) {
      return true;
    }

    await sharp(buffer).metadata();
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract dimensions from SVG buffer
 * Looks for width/height attributes or viewBox on the SVG element
 */
function extractSvgDimensions(buffer: Buffer): { width: number; height: number } {
  try {
    const svgContent = buffer.toString('utf-8');

    // Extract the opening <svg> tag (everything until the first >)
    const svgTagMatch = svgContent.match(/<svg[^>]*>/i);
    if (!svgTagMatch) {
      return { width: 0, height: 0 };
    }

    const svgTag = svgTagMatch[0];

    // Try to extract width and height attributes from the SVG tag
    const widthMatch = svgTag.match(/\swidth=["']?(\d+(?:\.\d+)?)/i);
    const heightMatch = svgTag.match(/\sheight=["']?(\d+(?:\.\d+)?)/i);

    if (widthMatch?.[1] && heightMatch?.[1]) {
      return {
        width: Math.round(Number.parseFloat(widthMatch[1])),
        height: Math.round(Number.parseFloat(heightMatch[1])),
      };
    }

    // Try to extract from viewBox (format: "minX minY width height")
    const viewBoxMatch = svgTag.match(/\sviewBox=["']?[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/i);
    if (viewBoxMatch?.[1] && viewBoxMatch?.[2]) {
      return {
        width: Math.round(Number.parseFloat(viewBoxMatch[1])),
        height: Math.round(Number.parseFloat(viewBoxMatch[2])),
      };
    }

    // If no dimensions found, return 0 (unknown)
    return { width: 0, height: 0 };
  } catch {
    return { width: 0, height: 0 };
  }
}
