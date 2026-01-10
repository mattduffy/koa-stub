# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Koa-based stub server for testing new Node.js packages and middleware. This is a full-featured web application with user authentication, session management, MongoDB/Redis integration, and modular routing.

## Development Commands

### Running the Application
- `npm run dev` - Start development server with full debug output
- `npm run cluster` - Start app in cluster mode using all CPU cores
- `npm start` - Production start (runs src/index.js)

### Testing & Quality
- `npm test` - Run test suite (currently tests Redis connection)
- `npm run lint` - Run ESLint (airbnb-base config)
- `npm run lint -- <path>` - Lint specific files

### Database & Utilities
- `npm run bootstrap` - Initialize app database collections and create server keys
- `npm run newUser` - Create a new user account interactively
- `npm run deleteData` - Delete user data (use with caution)

### Notes on Test Execution
- Tests use Node's built-in test runner (`node --test`)
- Run single test: `DEBUG=* node --test test/<filename>.js`

## Architecture Overview

### Entry Points
- **src/index.js** - Main application entry point, sets up Koa app with all middleware and routes
- **src/cluster.js** - Cluster mode entry point, forks workers based on CPU cores

### Configuration Management
Environment variables are loaded from multiple `.env` files in `config/`:
- `app.env` - Main application config (site name, domain, ports, keys)
- `mongodb.env` - MongoDB connection settings (X.509 cert auth, replica set)
- `redis.env` - Redis connection settings (Sentinel mode with TLS)
- `sessions.env` - Session storage configuration (Redis-backed)
- `ai.env` - AI/ML model configuration (embedding models, vector settings)

Configuration is loaded in individual modules using dotenv, not globally.

### Database Clients
Two singleton database clients are initialized at import:
- **MongoDB**: `src/daos/impl/mongodb/mongo-client.js` - X.509 authenticated replica set connection
- **Redis**: `src/daos/impl/redis/redis-client.js` or `ioredis-client.js` - Sentinel mode with TLS

Both clients are imported and attached to `ctx.state` in middleware.

### Session Management
- Redis-backed sessions via koa-session (see `src/session-handler.js`)
- Custom Redis store from `@mattduffy/koa-redis` package
- Sessions configured for Sentinel mode with TLS
- Session security handled by `config.secure`, `config.httpOnly`, `config.signed`

### Middleware Stack (src/index.js)
Order matters. Key middleware:
1. `isMongo` - Attaches MongoDB client to ctx.state.mongodb
2. `logRequest` - Logs all requests to MongoDB with GeoIP data
3. `banner.use()` - Adds banner info to responses
4. `viewGlobals` - Sets up ctx.state with origin, domain, nonce, structured data
5. `openGraph` - Generates Open Graph and Twitter Card meta tags
6. `errors` - Top-level error handler (catches all downstream errors)
7. `httpMethodOverride()` - Allows method override via header/body/_method
8. `getSessionUser` - Reconstitutes user from session ID
9. `flashMessage()` - Adds flash message support via session
10. `prepareRequest()` - Detects AJAX/async requests, extracts Bearer tokens
11. `tokenAuthMiddleware()` - Authenticates requests with JWT access tokens
12. `checkServerJWKs` - Loads server's JWK keys into ctx.state
13. `csp` - Content Security Policy header with nonces
14. `cors` - CORS headers (special handling for webfinger)

### Routing Structure
Routes are modular and mounted in src/index.js:
- `src/routes/app.js` - App-level routes
- `src/routes/auth.js` - Authentication endpoints (login, logout, register)
- `src/routes/account.js` - User account management
- `src/routes/users.js` - User-related pages
- `src/routes/main.js` - Top-level pages (home, about, etc)
- `src/routes/blogs.js` - Blog functionality
- `src/routes/galleries.js` - Photo gallery features
- `src/routes/wellKnown.js` - .well-known endpoints (security.txt, webfinger)
- `src/routes/seo.js` - SEO-related endpoints (sitemap, robots.txt)
- `src/routes/activity_stream.js` - ActivityPub/ActivityStreams endpoints
- `src/routes/api_v1.js` - REST API v1 endpoints

### Models
Models are thin wrappers around external packages:
- `src/models/users.js` - Re-exports from `@mattduffy/users` package
- `src/models/app.js` - App-level model for server keys and config
- `src/models/cryptoKeys.js` - Cryptographic key management

### Directory Structure (app.dirs)
Configured in src/index.js and available throughout the app:
- `app.root` - Project root directory
- `app.dirs.config` - Configuration files
- `app.dirs.keys` - Cryptographic keys
- `app.dirs.public.dir` - Public static files
- `app.dirs.public.accounts` - User public directories
- `app.dirs.private.dir` - Private files
- `app.dirs.private.uploads` - File uploads
- `app.dirs.cache.pages` - Cached pages
- `app.dirs.cache.models` - AI model cache

### Template Engine
- EJS templates in `views/default/`
- Layout template: `grid-template`
- Templates have access to ctx.state properties passed as locals

### Security Features
- **CSP**: Strict Content-Security-Policy with nonces for inline scripts/styles
- **CORS**: Configurable per route (special webfinger handling)
- **Sessions**: Signed, httpOnly, secure cookies
- **Authentication**: JWT-based access tokens + session-based auth
- **TLS**: MongoDB and Redis use X.509/TLS with custom CA certificates
- **GeoIP**: MaxMind GeoIP2 for request logging

### External Local Packages
Several `@mattduffy/*` packages are linked locally via `file:` protocol:
- `@mattduffy/albums` - Photo album management
- `@mattduffy/banner` - CLI banner display
- `@mattduffy/blogs` - Blog post handling
- `@mattduffy/exiftool` - EXIF data extraction
- `@mattduffy/koa-migrations` - Database migration system
- `@mattduffy/koa-redis` - Redis session store
- `@mattduffy/unpacker` - Archive unpacking
- `@mattduffy/users` - User model and authentication
- `@mattduffy/webfinger` - WebFinger protocol implementation

These are development dependencies and may need to be built/updated separately.

## Common Patterns

### Adding New Middleware
1. Create function in src/middlewares.js or inline in src/index.js
2. Add to middleware stack in src/index.js (order matters!)
3. Middleware signature: `async function name(ctx, next) { await next() }`

### Adding New Routes
1. Create router file in src/routes/
2. Export router instance
3. Import and mount in src/index.js with `app.use(router.routes())`

### Accessing Databases
```javascript
// MongoDB
const db = ctx.state.mongodb.client.db()
const collection = db.collection('collectionName')

// Redis
import { redis } from './daos/impl/redis/redis-client.js'
await redis.get('key')
```

### Working with Sessions
```javascript
// Set session data
ctx.session.userId = user._id

// Get session data
const userId = ctx.session?.userId

// Flash messages
ctx.flash = { errors: ['Error message'] }
// Access in next request
const errors = ctx.flash?.errors
```

## ESLint Configuration
- Uses airbnb-base style guide
- No semicolons (semi: ['error', 'never'])
- Max line length: 100 characters
- Console statements allowed
- Import extensions not required
- See .eslintrc.cjs for full rules

## Important Notes
- This is an ES module project (`"type": "module"` in package.json)
- All imports require .js extensions
- Debug logging uses the 'debug' package with namespace prefixes
- Proxy mode enabled (`app.proxy = true`) - expects nginx reverse proxy
- The app checks for `x-nginx-proxy` header to detect proxy environment
