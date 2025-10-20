# Favicon API

[![CI](https://github.com/Vemetric/favicon-api/actions/workflows/ci.yml/badge.svg)](https://github.com/Vemetric/favicon-api/actions/workflows/ci.yml)

A high-performance, self-hostable favicon API service built with TypeScript, Hono, and Bun. Fetch and serve website favicons with multiple format options, intelligent fallbacks, and proper HTTP caching.

**Powered by [Vemetric](https://vemetric.com)**

## Features

- **Fast & Lightweight**: Built on Bun runtime and Hono framework
- **Smart Discovery**: Automatically finds the best favicon from multiple sources
- **Format Support**: PNG, JPG, ICO, WebP, SVG
- **Image Processing**: Resize and convert images on-the-fly
- **Caching Ready**: Sets proper HTTP cache headers for CDN/proxy integration
- **Security**: Built-in SSRF protection and input validation
- **Docker Ready**: Easy deployment with Docker
- **Fully Typed**: Written in TypeScript with strict type checking

## Quick Start

### Local Development

```bash
# Install dependencies
bun install

# Start development server (with hot reload)
bun run dev

# The server will start on http://localhost:3000
```

### Using Docker

```bash
# Build the image
docker build -t favicon-api .

# Run with default settings
docker run -d \
  -p 3000:3000 \
  --name favicon-api \
  --restart unless-stopped \
  favicon-api

# Or run with custom configuration
docker run -d \
  -p 3000:3000 \
  --name favicon-api \
  --restart unless-stopped \
  -e PORT=3000 \
  -e DEFAULT_IMAGE_URL=https://example.com/default-favicon.png \
  -e CACHE_CONTROL_SUCCESS=604800 \
  -e CACHE_CONTROL_ERROR=604800 \
  -e REQUEST_TIMEOUT=5000 \
  -e MAX_IMAGE_SIZE=5242880 \
  -e ALLOWED_ORIGINS=* \
  -e BLOCK_PRIVATE_IPS=true \
  favicon-api

# Check it's running
curl http://localhost:3000/health
```

## API Usage

### Single Endpoint

```
GET /<domain>&format=<json|image>&size=<number>&type=<png|jpg|ico|svg>&default=<url>
```

### Query Parameters

- `url` (required): Target website URL (e.g., `example.com` or `https://example.com`)
- `format` (optional): Response format - `image` (default) or `json`
- `size` (optional): Desired image size in pixels (16-512)
- `type` (optional): Output format - `png`, `jpg`, `ico`, `webp`, `svg`
- `default` (optional): Fallback image URL (overrides server config)

### Examples

**Get favicon as image:**

```bash
curl "http://localhost:3000/github.com"
```

**Get favicon metadata as JSON:**

```bash
curl "http://localhost:3000/github.com&format=json"
```

**Resize favicon to 64x64:**

```bash
curl "http://localhost:3000/github.com&size=64"
```

**Convert to PNG:**

```bash
curl "http://localhost:3000/github.com&type=png&size=128"
```

**With custom fallback:**

```bash
curl "http://localhost:3000/example.com&default=https://mysite.com/fallback.png"
```

### Response Examples

**Image Response (default):**

```
Content-Type: image/png
Cache-Control: public, max-age=604800, s-maxage=604800
ETag: "abc123"
[Binary image data]
```

**JSON Response:**

```json
{
  "url": "https://github.githubassets.com/favicons/favicon.svg",
  "width": 0,
  "height": 0,
  "format": "svg",
  "size": 959,
  "source": "link-tag"
}
```

## Configuration

Create a `.env` file (see `.env.example`):

```env
# Server
PORT=3000
HOST=0.0.0.0

# Default fallback image (optional)
DEFAULT_IMAGE_URL=https://example.com/default-favicon.png

# Cache control headers (seconds) - applies to both browser and CDN
# 604800 seconds = 7 days
CACHE_CONTROL_SUCCESS=604800
CACHE_CONTROL_ERROR=604800

# Request handling
REQUEST_TIMEOUT=5000
MAX_IMAGE_SIZE=5242880
USER_AGENT=FaviconAPI/1.0

# CORS
ALLOWED_ORIGINS=*

# Security
BLOCK_PRIVATE_IPS=true
MAX_REDIRECTS=5
```

## Architecture

The application is a **stateless processor** with no built-in caching. It:

1. Processes requests and finds favicons
2. Sets proper HTTP cache headers
3. Returns images or JSON responses

For production, add a **caching layer** in front (CDN or reverse proxy):

- **Cloudflare** (free tier)
- **BunnyCDN, KeyCDN** (paid)
- **Nginx/Caddy** (self-hosted)

This separation of concerns keeps the app simple and horizontally scalable.

## Development

```bash
# Install dependencies
bun install

# Run development server (with hot reload)
bun run dev

# Run tests
bun test

# Run tests in watch mode
bun test --watch

# Type check
bun run typecheck

# Lint
bun run lint

# Format code
bun run format
```

## Testing

The project includes comprehensive integration tests covering:

- Health endpoint functionality
- Favicon fetching from real websites
- Error handling and validation
- Cache header generation
- Image processing and format conversion

Run tests with:

```bash
bun test
```

All tests run against a dedicated test server (port 3001) to avoid conflicts with the development server.

## Project Structure

```
/src
  /lib
    favicon-finder.ts    # Favicon discovery logic
    image-processor.ts   # Image processing with Sharp
    validators.ts        # Input validation & SSRF protection
    http-headers.ts      # HTTP cache header generation
    config.ts            # Configuration management
  /types
    index.ts             # TypeScript types & interfaces
  index.ts               # Main Hono application
  server.ts              # Bun server entry point
```

## Deployment

### Option 1: Direct with Bun (No Docker)

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Clone and run
git clone your-repo
cd favicon-api
bun install
bun run start
```

### Option 2: Docker (Recommended)

```bash
# On your VPS (1-2 GB RAM recommended)
git clone your-repo
cd favicon-api

# Build and run
docker build -t favicon-api .
docker run -d \
  -p 3000:3000 \
  --name favicon-api \
  --restart unless-stopped \
  -e DEFAULT_IMAGE_URL=https://example.com/default.png \
  favicon-api

# Verify it's running
curl http://your-server-ip:3000/health
```

### With CDN (Recommended for Production)

**Cloudflare Setup:**

1. Add domain to Cloudflare
2. Point A record to your server IP
3. Enable "Proxy" mode (orange cloud)
4. Configure cache rules to respect origin headers

**BunnyCDN Setup:**

1. Create pull zone pointing to your origin
2. Enable "Respect Cache Headers"
3. Point CNAME to CDN hostname

## Security

- ✅ URL validation and sanitization
- ✅ SSRF protection (blocks private IPs)
- ✅ Request timeouts and size limits
- ✅ Input validation on all parameters
- ✅ Proper CORS configuration

## Performance

- **Direct origin**: ~200-500ms per request
- **With CDN (cached)**: <50ms globally
- **Stateless design**: Easy horizontal scaling

## Favicon Sources

The API searches multiple sources for favicons:

1. `<link rel="icon">` tags
2. `<link rel="apple-touch-icon">` tags
3. `<meta property="og:image">` tags
4. Web manifest files (`manifest.json`)
5. Common fallback locations (`/favicon.ico`, `/apple-touch-icon.png`)

Favicons are ranked by quality (size, format, source) and the best one is returned.

## License

MIT

## Credits

Built with:

- [Bun](https://bun.sh) - Fast JavaScript runtime
- [Hono](https://hono.dev) - Lightweight web framework
- [Sharp](https://sharp.pixelplumbing.com) - Image processing
- [Cheerio](https://cheerio.js.org) - HTML parsing
