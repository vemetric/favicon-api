/**
 * Type definitions for the Favicon API
 */

export interface FaviconSource {
  url: string;
  size?: number;
  format?: string;
  source: 'link-tag' | 'manifest' | 'fallback' | 'og-image';
  score: number;
}

export interface FaviconResult {
  url: string;
  width: number;
  height: number;
  format: string;
  size: number;
  source: string;
}

export interface ImageProcessOptions {
  size?: number;
  format?: 'png' | 'jpg' | 'jpeg' | 'ico' | 'webp' | 'svg';
  quality?: number;
}

export interface ProcessedImage {
  data: Buffer;
  format: string;
  width: number;
  height: number;
  size: number;
}

export type OutputFormat = 'image' | 'json';

/**
 * Web App Manifest types
 */
export interface ManifestIcon {
  src: string;
  sizes?: string;
  type?: string;
  purpose?: string;
}

export interface WebManifest {
  icons?: ManifestIcon[];
  name?: string;
  short_name?: string;
  [key: string]: unknown;
}
