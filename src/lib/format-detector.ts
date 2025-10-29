/**
 * Image format detection utilities
 * Detects image formats from buffer magic numbers and content
 */

/**
 * Check if buffer contains SVG data
 */
export function isSvg(buffer: Buffer): boolean {
  const header = buffer.toString('utf8', 0, 100).toLowerCase();
  return header.includes('<svg') || header.includes('<?xml');
}

export function isIco(buffer: Buffer): boolean {
  const isIco =
    buffer.length >= 4 &&
    buffer[0] === 0x00 &&
    buffer[1] === 0x00 &&
    buffer[2] === 0x01 &&
    buffer[3] === 0x00;

  return isIco;
}

/**
 * Check if buffer contains GIF data
 */
export function isGif(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;
}

/**
 * Detect image format from buffer magic numbers
 * @param buffer - Image data buffer
 * @returns Detected format string (png, jpeg, ico, webp, svg, gif)
 */
export function detectFormatFromBuffer(buffer: Buffer): string {
  if (buffer.length < 2) return 'png'; // Default fallback (need at least 2 bytes)

  // BMP: 42 4D (check early since it only needs 2 bytes)
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return 'bmp';
  }

  // Need at least 3 bytes for remaining checks
  if (buffer.length < 3) return 'png';

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  // GIF: 47 49 46
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'gif';
  }

  // Need at least 4 bytes for remaining checks
  if (buffer.length < 4) return 'png';

  // ICO: 00 00 01 00
  if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) {
    return 'ico';
  }

  // WebP: RIFF ... WEBP (check RIFF header)
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    // Verify WEBP signature at offset 8
    if (
      buffer.length >= 12 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return 'webp';
    }
  }

  // SVG: Check for SVG/XML content
  if (isSvg(buffer)) {
    return 'svg';
  }

  // AVIF: Check for ftyp box with avif brand
  if (
    buffer.length >= 12 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    const brand = buffer.toString('utf8', 8, 12);
    if (brand === 'avif' || brand === 'avis') {
      return 'avif';
    }
  }

  return 'png'; // Default fallback
}

/**
 * Get MIME type from format string
 * @param format - Image format (png, jpeg, ico, etc.)
 * @returns MIME type string
 */
export function getContentTypeFromFormat(format: string): string {
  const contentTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    ico: 'image/x-icon',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    gif: 'image/gif',
    bmp: 'image/bmp',
    avif: 'image/avif',
  };

  return contentTypes[format.toLowerCase()] || 'image/png';
}

/**
 * Check if a format is supported by Sharp for processing
 * @param format - Image format string
 * @returns true if format is supported by Sharp
 */
export function isSupportedBySharp(format: string): boolean {
  const supportedFormats = ['png', 'jpeg', 'jpg', 'webp', 'gif', 'svg', 'tiff', 'avif'];
  return supportedFormats.includes(format.toLowerCase());
}
