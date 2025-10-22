/**
 * Type definitions for the Favicon API
 */

export interface FaviconSource {
  url: string;
  size?: number;
  format?: string;
  source: 'link-tag' | 'manifest' | 'fallback';
  score: number;
}

export interface FaviconResult {
  url: string; // API URL to fetch this exact processed image
  sourceUrl: string; // Original favicon URL from the website
  width: number;
  height: number;
  format: string;
  bytes: number; // File size in bytes
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
  bytes: number; // File size in bytes
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
