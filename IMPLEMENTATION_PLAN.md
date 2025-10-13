# Favicon API - Implementation Plan

## Project Overview

A high-performance favicon API service that fetches and serves website favicons with multiple format options, intelligent fallbacks, and proper HTTP caching. Built with TypeScript, Hono, and Bun.

**Self-hostable anywhere**: Deploy via Docker on any VPS (Hetzner, DigitalOcean, AWS, home server, etc.) or any platform that supports Docker. Add a CDN or reverse proxy in front for caching (recommended for production).

**No tiers, no limitations**: Everyone gets the same features - image resizing, format conversion, all processing capabilities. There's no "paid vs self-hosted" distinction.

## Architecture

```
User Request → [Your choice: CDN/Reverse Proxy] → Origin Server (stateless processor)
                           ↓ (handles all caching)
                    Fast cached response
```

- **Application**: Pure stateless processor - no caching logic, just processes requests and sets proper HTTP cache headers
- **Caching**: Bring your own (CDN like Cloudflare/BunnyCDN, reverse proxy like Nginx/Caddy, or nothing)
- **Philosophy**: Separation of concerns - app processes, external layer caches
- **Cost**: Fixed low monthly cost (e.g., $4-6/month VPS) + optional free CDN
- **Performance**: Direct origin: ~200-500ms | With CDN/proxy (cached): <50ms globally

## Tech Stack

- **Framework**: Hono (lightweight, fast)
- **Runtime**: Bun (fast, native TypeScript)
- **Language**: TypeScript
- **Caching**: None in application - sets proper HTTP headers, external layer does caching
- **Image Processing**: Sharp (native image processing)
- **Containerization**: Docker with Bun
- **Deployment**: Any Docker-compatible platform (VPS, cloud, on-premise)

## API Design

### Single Endpoint

```
GET /<website>&format=<json|image>&size=<number>&type=<png|jpg|ico|svg>&default=<url>
```

### Query Parameters

- `url` (required): Target website URL (e.g., `example.com` or `https://example.com`)
- `format` (optional): Response format - `image` (default) or `json`
- `size` (optional): Desired image size in pixels (e.g., `64`, `128`, `256`)
- `type` (optional): Output format - `png`, `jpg`, `ico`, `svg` (auto-detect if not specified)
- `default` (optional): Fallback image URL (overrides server config)

### Response Types

#### Image Response (default)

```
Content-Type: image/png (or appropriate type)
Cache-Control: public, max-age=86400
[Binary image data]
```

#### JSON Response

```json
{
  "url": "https://example.com/favicon.png",
  "width": 256,
  "height": 256,
  "format": "png",
  "size": 12458,
  "source": "link-tag"
}
```

## Implementation Steps

### Phase 1: Project Setup

1. ✅ Initialize project structure
   - Create `package.json` with dependencies
   - Set up TypeScript configuration
   - Bun runs TypeScript natively - no build step needed!
   - Set up ESLint and Prettier

2. ✅ Dependencies
   - `hono`: Web framework
   - `cheerio`: HTML parsing for favicon extraction
   - `sharp`: Image processing
   - Development: `@types/bun`, `bun-types`

3. ✅ Project structure

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
   Dockerfile
   docker-compose.yml
   tsconfig.json
   .env.example
   ```

   Note: Stateless application, no caching logic - relies on external caching layer!

### Phase 2: Core Favicon Discovery

4. ✅ Implement favicon finder (`favicon-finder.ts`)
   - Fetch HTML from target URL
   - Parse and extract favicon URLs from:
     - `<link rel="icon">`
     - `<link rel="shortcut icon">`
     - `<link rel="apple-touch-icon">`
     - `<link rel="apple-touch-icon-precomposed">`
     - `<meta property="og:image">`
     - `/favicon.ico` fallback
     - `/apple-touch-icon.png` fallback
     - Web manifest files (`manifest.json`)
   - Prioritize by quality (size, format)
   - Handle relative vs absolute URLs
   - Timeout handling (5s default)

5. ✅ Quality ranking algorithm
   - Prefer larger sizes (SVG > large PNG > small PNG > ICO)
   - Prefer modern formats (SVG, PNG over ICO)
   - Score each found favicon
   - Return best match

### Phase 3: Image Processing

6. ✅ Image processor (`image-processor.ts`)
   - Use Sharp for all image processing
   - Operations:
     - Resize to specified dimensions
     - Convert between formats (PNG, JPG, ICO, WebP)
     - Optimize file size
     - Validate image data
     - Handle SVG (pass-through or rasterize if size specified)
   - Error handling with fallback to original image

7. ✅ Format conversion support
   - PNG ↔ JPG ↔ ICO ↔ WebP
   - SVG pass-through (or rasterize if size specified)
   - Automatic format detection
   - Quality optimization per format

### Phase 4: HTTP Cache Headers

8. ✅ HTTP headers helper (`http-headers.ts`)
   - Generate proper cache headers for different response types
   - Headers to set:
     - `Cache-Control: public, max-age=86400, s-maxage=2592000` (successful responses)
     - `Cache-Control: public, max-age=3600` (default image fallback)
     - `Cache-Control: no-cache, max-age=60` (errors - short cache)
     - `ETag` generation based on content hash
     - `Last-Modified` timestamp
     - `Vary: Accept` for content negotiation
   - Configurable TTLs via environment variables
   - CDN-friendly headers (works with Cloudflare, BunnyCDN, etc.)

### Phase 5: Main Application

9. ✅ Hono application (`index.ts`)
   - Single route handler `GET /`
   - Query parameter parsing and validation
   - Orchestrate: validate → find favicon → process image → set headers → respond
   - Error handling with default image fallback
   - Stateless - every request is processed fresh
   - Proper HTTP cache headers on all responses

10. ✅ Configuration management
    - Environment variables:
      - `DEFAULT_IMAGE_URL`: Server-side default fallback
      - `CACHE_CONTROL_SUCCESS`: Cache header for successful responses (default: 86400)
      - `CACHE_CONTROL_DEFAULT`: Cache header for default image (default: 3600)
      - `CACHE_CONTROL_ERROR`: Cache header for errors (default: 60)
      - `REQUEST_TIMEOUT`: External request timeout
      - `MAX_IMAGE_SIZE`: Maximum image size to fetch (in bytes)
      - `ALLOWED_ORIGINS`: CORS configuration
    - Validation on startup

11. ✅ Input validation (`validators.ts`)
    - Validate URL format
    - Sanitize inputs to prevent SSRF
    - Validate size parameter (reasonable limits: 16-512px)
    - Validate format parameter (whitelist)
    - Block private IP ranges (security)

### Phase 6: Bun Server

12. ✅ Bun server (`server.ts`)
    - HTTP server using Bun.serve with Hono
    - Stateless request processing
    - Health check endpoint (`/health`)
    - Graceful shutdown handling
    - Leverages Bun's native TypeScript support (no build step!)
    - No caching logic - relies on external caching layer

### Phase 7: Docker & Deployment

13. ✅ Dockerfile
    - Use official Bun Docker image (`oven/bun:1`)
    - Install Sharp dependencies (libvips)
    - Multi-stage build for smaller final image
    - Non-root user for security
    - Health check configured
    - Expose port (default 3000)
    - Environment variable support

14. ✅ Documentation
    - Docker run commands with all environment variables
    - Simple deployment examples
    - No docker-compose needed (single stateless service)

15. ✅ Caching Layer Documentation (recommended)
    - Guide on adding caching layer (user's choice)
    - Example: Cloudflare CDN (free tier)
      - Point domain DNS to your server IP
      - Enable "Proxy" mode (orange cloud)
      - Configure cache rules to respect origin headers
      - Edge cache TTL: 1 month recommended
    - Example: BunnyCDN, KeyCDN, or any pull CDN
      - Point pull zone to your origin server
      - Enable caching with origin header respect
    - Example: Nginx/Caddy reverse proxy (for local caching)
      - Simple proxy_cache configuration
      - Good for single-server deployments
    - Works without any caching layer (just slower)

### Phase 8: Testing & Documentation

16. ✅ Testing
    - Unit tests for core functions
    - Integration tests for API endpoints
    - Test favicon discovery with real websites
    - Test HTTP cache header generation
    - Test error scenarios and fallbacks
    - Test with/without caching layer

17. ✅ Documentation
    - README.md with:
      - Quick start guide (Docker + Bun)
      - API documentation with examples
      - Configuration options
      - VPS deployment guide (works on any provider)
      - Caching layer setup guide (CDN/reverse proxy recommendations)
      - Docker deployment instructions
      - Local development setup
      - Home server / on-premise deployment
    - API examples with curl
    - Environment variable reference
    - Troubleshooting guide
    - Caching configuration examples (Cloudflare, BunnyCDN, Nginx, Caddy)

18. ✅ Production readiness
    - Add logging (structured logs)
    - Add metrics/monitoring hooks
    - Security headers (CSP, etc.)
    - CORS configuration
    - Graceful shutdown
    - Performance monitoring

## Deployment Workflow

### Quick Setup Overview

#### Option 1: Basic Docker Deployment (Any Server)

1. **Provision Server** (any VPS provider)
   - Recommended: 1-2 GB RAM, 1 CPU (e.g., Hetzner $4/month, DigitalOcean $6/month)
   - OS: Ubuntu 22.04, Debian, or any Linux with Docker support
   - Install Docker and Docker Compose
   - Configure firewall (allow 80, 443)

2. **Deploy Application**

   ```bash
   git clone your-repo
   cd favicon-api
   docker build -t favicon-api .
   docker run -d -p 3000:3000 --name favicon-api \
     -e DEFAULT_IMAGE_URL=https://example.com/default.png \
     --restart unless-stopped favicon-api
   ```

3. **Test**
   ```bash
   curl http://your-server-ip:3000/github.com
   curl http://your-server-ip:3000/github.com&size=64&format=json
   ```

#### Option 2: With Caching Layer (Recommended for Production)

Follow steps 1-2 above, then add a caching layer:

**Option 2A: CDN (Cloudflare/BunnyCDN)** 3. **Configure CDN**

- Add your domain to CDN provider
- Point DNS to your server IP (or create pull zone)
- Enable caching with origin header respect
- Set cache rules (see examples below)
- SSL/TLS configuration

4. **Test & Monitor**
   ```bash
   curl https://api.yourdomain.com/github.com
   # Check response headers for cache status
   curl -I https://api.yourdomain.com/github.com
   ```

   - Monitor CDN analytics for cache hit rate
   - Target: 95%+ cache hit rate after warmup

**Option 2B: Local Reverse Proxy (Nginx/Caddy)** 3. **Install and Configure Nginx**

- See Nginx configuration example below
- Provides local caching without external dependencies
- Good for single-server or private deployments

4. **Test**
   ```bash
   curl https://api.yourdomain.com/github.com
   # Check X-Cache-Status header
   ```

## Configuration Example

### Environment Variables

```env
# Required
DEFAULT_IMAGE_URL=https://example.com/default-favicon.png

# Optional - Server
PORT=3000
HOST=0.0.0.0

# Optional - HTTP Cache Headers (in seconds)
CACHE_CONTROL_SUCCESS=86400      # 24 hours for successful favicon fetches
CACHE_CONTROL_DEFAULT=3600       # 1 hour for default fallback image
CACHE_CONTROL_ERROR=60           # 1 minute for errors

# Optional - Request handling
REQUEST_TIMEOUT=5000
MAX_IMAGE_SIZE=5242880
USER_AGENT=FaviconAPI/1.0

# Optional - CORS
ALLOWED_ORIGINS=*

# Optional - Security
BLOCK_PRIVATE_IPS=true
MAX_REDIRECTS=5
```

### Optional: CDN Configuration Examples

#### Cloudflare (Free Tier)

```
DNS:
- A record: api.yourdomain.com → Your_Server_IP
- Proxy status: Proxied (orange cloud)

Cache Rules (Rules → Cache Rules):
- Match: Hostname equals "api.yourdomain.com"
- Then: Cache eligibility = Eligible for cache
       Edge TTL = 1 month
       Browser TTL = 1 day
```

#### BunnyCDN / KeyCDN / Other Pull CDNs

```
1. Create Pull Zone pointing to your origin (http://your-server-ip:3000)
2. Enable "Respect Cache Headers" or similar
3. Set edge cache TTL to 1 month
4. Point your domain CNAME to the CDN hostname
```

#### Nginx Reverse Proxy (Local Caching)

```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=favicon_cache:10m max_size=1g inactive=30d;

server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_cache favicon_cache;
        proxy_cache_valid 200 30d;
        proxy_cache_valid 404 1h;
        proxy_cache_key "$scheme$request_method$host$request_uri";
        add_header X-Cache-Status $upstream_cache_status;
    }
}
```

#### Without Any Caching Layer

```
- Point your domain A record directly to your server IP
- Use a reverse proxy like Nginx or Caddy for SSL only (no caching)
- All features still work, just slower (every request hits origin)
- Good for development or very low traffic
```

## Security Considerations

- ✅ Validate and sanitize all URL inputs
- ✅ Block requests to private IP ranges (SSRF protection)
- ✅ Set maximum file size limits
- ✅ Implement request timeouts
- ✅ Add security headers (X-Content-Type-Options, etc.)
- ✅ CORS configuration
- ✅ Rate limiting (optional)

## Performance Optimizations

- ✅ Stateless architecture - easy horizontal scaling
- ✅ Proper HTTP cache headers - works with any caching layer
- ✅ Parallel favicon discovery (check multiple sources simultaneously)
- ✅ Stream responses where possible
- ✅ Sharp image processing (fast native library)
- ✅ Connection pooling for HTTP requests
- ✅ Minimal dependencies for fast startup
- ✅ CDN/reverse proxy recommended for caching (user's choice)

## Future Enhancements (Post-MVP)

- [ ] Batch API endpoint (fetch multiple favicons)
- [ ] Webhook support for cache invalidation
- [ ] Analytics dashboard
- [ ] Custom favicon scoring algorithms
- [ ] Support for data URLs as default images
- [ ] Admin API for cache management
- [ ] Prometheus metrics export

## Success Criteria

- ✅ Successfully fetch favicons from 95%+ of websites
- ✅ Response time < 50ms for cached requests (when using CDN/reverse proxy)
- ✅ Response time < 500ms for direct origin requests (processing + delivery)
- ✅ Stateless application - no caching logic, easy to scale horizontally
- ✅ Docker image builds and runs on any platform (VPS, cloud, on-premise)
- ✅ Successfully deployable to any Docker-compatible host
- ✅ Works with any caching layer (CDN, reverse proxy) or without (slower)
- ✅ Comprehensive documentation with caching layer examples (Cloudflare, BunnyCDN, Nginx)
- ✅ Proper error handling with default image fallback
- ✅ Image resizing and format conversion working for everyone
- ✅ Single codebase, no feature tiers or limitations
- ✅ Clean separation: app processes, external layer caches
- ✅ Low fixed monthly cost (e.g., $4-6/month VPS + free CDN option)
