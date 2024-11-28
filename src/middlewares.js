/**
 * @summary Useful middleware functions.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/middlewares.js A small library of useful middleware funtions.
 */

// import Debug from 'debug'
import { METHODS } from 'node:http'
// import { subtle } from 'node:crypto'
// import { stat, readFile } from 'node:fs/promises'
import { _log, _error } from './utils/logging.js'
import { Users } from './models/users.js'
import { App } from './models/app.js'

// const DBNAME = 'koastub'
const USERS = 'users'
const middlewareLog = _log.extend('middlewares')
const middlewareError = _error.extend('middlewares')

export async function checkServerJWKs(ctx, next) {
  const log = middlewareLog.extend('checkServerJWKs')
  const error = middlewareLog.extend('checkServerJWKs')
  log()
  try {
    const o = {
      db: ctx.state.mongodb.client.db(ctx.state.mongodb.client.dbName),
      keyDir: ctx.app.dirs.keys,
      siteName: ctx.app.site,
      appEnv: ctx.app.appEnv,
    }
    const theApp = new App(o)
    ctx.state.keys = await theApp.keys()
  } catch (e) {
    error('Failed to lookup app keys in db.')
    ctx.throw(500, 'Failed to lookup app keys in db.', e)
  }
  try {
    await next()
  } catch (e) {
    ctx.throw(500, 'Error after checking for existing app keys.', e)
  }
}

export async function getSessionUser(ctx, next) {
  const log = middlewareLog.extend('getSessionUser')
  const error = middlewareLog.extend('getSessionUser')
  if (ctx.session?.id) {
    try {
      log(`restoring session user: ${ctx.session.id}`)
      log(`requested url: ${ctx.request.originalUrl}`)
      const db = ctx.state.mongodb.client.db(ctx.state.mongodb.client.dbName)
      const collection = db.collection(USERS)
      const users = new Users(collection, ctx)
      const user = await users.getById(ctx.session.id)
      if (user) {
        ctx.state.sessionUser = user
        ctx.state.isAuthenticated = true
      } else {
        ctx.state.isAuthenticated = false
        ctx.state.sessionUser = null
      }
    } catch (e) {
      error(e)
      // throw new Error(e)
      ctx.app.emit('error', e, ctx)
      ctx.throw(500, 'Error while reconstituting the session.', e)
    }
    log(`ctx.state.isAuthenticated: ${ctx.state.isAuthenticated}`)
  }
  try {
    await next()
  } catch (e) {
    // ctx.app.emit('error', e, ctx)
    ctx.throw(500, 'Error after reconstituting the session.', e)
  }
}

export function flashMessage(options, application) {
  const log = middlewareLog.extend('flashMessage')
  const error = middlewareError.extend('flashMessage')
  let app
  let opts
  if (options && typeof options.use === 'function') {
    opts = application
    app = options
  } else {
    app = application
    opts = options
  }
  if (!app || typeof app.use !== 'function') {
    error('Required app instance not provided.')
    throw new Error('App instance is required: flashMessage(opts, app)')
  }
  log('adding the flash property to the app.context')
  const key = opts.key ?? 'flash'
  const msg = opts.msg ?? {}

  return async function flash(ctx, next) {
    if (ctx.session === undefined) {
      throw new Error('Session is required to store flash messages.')
    }
    const message = ctx.session[key] ?? msg
    delete ctx.session[key]
    Object.defineProperty(app.context, 'flash', {
      configurable: true,
      enumerable: true,
      get() {
        return message
      },
      set(x) {
        ctx.session[key] = x
      },
    })
    try {
      log('Added flash message to session.')
      await next()
    } catch (e) {
      error('Fail after adding flash message to session.')
      error(e)
      // ctx.app.emit('error', e, ctx)
      ctx.throw(500, 'Error after adding flash message to session.', e)
    }
    if (ctx.status === 302 && ctx.session && !ctx.session[key]) {
      ctx.session[key] = message
    }
  }
}
export function prepareRequest(options = {}) {
  const log = middlewareLog.extend('prepareRequest')
  const error = middlewareError.extend('prepareRequest')
  const opts = { ...options }
  return async function prepRequest(ctx, next) {
    // Is the request an Async / Ajax style request?
    // log(ctx.request.headers)
    log(opts)
    ctx.state.isAsyncRequest = false
    ctx.state.accessToken = null
    if (/json/.test(ctx.request.get('Accept'))
    || ctx.request.get('X-ASYNCREQUEST')
    || ctx.request.get('X-AJAXREQUEST')
    || ctx.request.get('X-REQUESTED-WITH')) {
      log(`Async request made: ${ctx.request.get('accept')}`)
      ctx.state.isAsyncRequest = true
    }
    // Check for Authorization Bearer (access) token
    const accessToken = /Bearer\s([\w._-]*)$/.exec(ctx.request.get('Authorization'))
    if (accessToken && accessToken[1]) {
      log(`access token: ${accessToken[1]}`);
      [, ctx.state.accessToken] = accessToken
    }
    try {
      await next()
    } catch (e) {
      error('Fail after checking for AJAX / ASYNC request.')
      error(e)
      // ctx.app.emit('error', 'Error after checking for AJAX / ASYNC request.', ctx)
      ctx.throw(500, 'Error after checking for AJAX / ASYNC request.', e)
    }
  }
}

export function tokenAuthMiddleware(options = {}) {
  const log = middlewareLog.extend('tokenAuth')
  const error = middlewareError.extend('tokenAuth')
  const opts = { ...options }
  return async function authenticateTokenUser(ctx, next) {
    if (ctx.state?.isAsyncRequest && ctx.state?.accessToken !== null) {
      log(opts)
      log('Authenticating async request by access token')
      const isValidToken = /[^+\s]*[A-Za-z0-9._-]*/g.exec(ctx.state.accessToken)
      if (!isValidToken) {
        ctx.status = 400
        ctx.type = 'text/plain; charset=utf-8'
        ctx.body = `HTTP 400 Bad Request\nWWW-Authenticate: Bearer realm="${ctx.app.domain}"`
      } else {
        try {
          const db = ctx.state.mongodb.client.db()
          const collection = db.collection(USERS)
          const users = new Users(collection, ctx)
          const tokenUser = await users.authenticateByAccessToken(ctx.state.accessToken)
          if (tokenUser && tokenUser.message === 'success') {
            ctx.state.sessionUser = tokenUser.user
            ctx.state.isAuthenticated = true
            await next()
          } else {
            ctx.state.isAuthenticated = false
            ctx.state.sessionUser = {}
            ctx.status = 401
            ctx.type = 'text/plain; charset=utf-8'
            ctx.body = `HTTP 401 Unauthorized\nWWW-Authenticate: Bearer realm="${ctx.app.domain}"`
          }
        } catch (e) {
          error(e)
          ctx.status = 403
          ctx.type = 'text/plain; charset=utf-8'
          ctx.body = `HTTP 403 Forbidden\nWWW-Authenticate: Bearer realm="${ctx.app.domain}"`
        }
      }
    } else {
      log('Not an async request bearing jwt access token.')
      try {
        await next()
      } catch (e) {
        error('Failed after token authentication.')
        error(e)
        // ctx.app.emit('error', 'Failed after token authentication.', ctx)
        ctx.throw(500, 'Failed after token authentication.', e)
      }
    }
  }
}

export function httpMethodOverride(options = {}) {
  const log = middlewareLog.extend('methodOverride')
  const error = middlewareError.extend('methodOverride')
  const opts = { allMethods: METHODS, allowOverride: ['POST'], ...options }
  return async function methodOverride(ctx, next) {
    log('Adding the methodOverride middleware.')
    log(`ctx.request.method: ${ctx.request.method}`)
    const requestMethod = ctx.request.method.toUpperCase()
    let newMethod = ctx.get('X-Http-Method-Override') ?? false
    if (opts.allMethods.includes(requestMethod.toUpperCase())) {
      if (newMethod) {
        log(`caught method override in header: ${newMethod}`)
        /* eslint-disable-next-line no-cond-assign */
      } else if ((newMethod = ctx.request?.body?._method ?? false)) {
        log(`caught method override in body: ${newMethod}`)
        /* eslint-disable-next-line no-cond-assign */
      } else if ((newMethod = ctx.cookies.get('_method') ?? false)) {
        log(`caught method override in cookie: ${newMethod}`)
      }
    } else {
      const msg = `Not allowed to override ${ctx.request.method} with ${newMethod}`
      error(msg)
      ctx.throw(403, msg)
    }
    if (newMethod && opts.allMethods.includes(newMethod.toUpperCase())) {
      // overriding original request method
      ctx.request.method = newMethod.toUpperCase()
      log(`Setting new Request Method to: ${ctx.request.method}`)
    }
    // } else {
    //   const msg = `Invalid method: ${newMethod}`
    //   error(msg)
    //   ctx.throw(405, msg)
    // }
    try {
      await next()
    } catch (e) {
      const msg = 'Failed after methodOverride middleware.'
      error(msg)
      ctx.throw(405, msg, e)
    }
  }
}

export async function errors(ctx, next) {
  const log = middlewareLog.extend('errorHandler')
  const error = middlewareError.extend('errorHandler')
  try {
    log('error-handler pre-next')
    await next()
    log('error-handler post-next')
  } catch (e) {
    error('Caught by the app-level error-handler')
    error(`ctx.response.status: ${ctx.status}`)
    error(e)
    switch (ctx.response.status) {
      case 400:
        ctx.response.message = ctx.response.message ?? 'bad request'
        break
      case 401:
        ctx.response.message = 'unauthorized'
        break
      case 402:
        ctx.response.message = 'payment required'
        break
      case 403:
        ctx.response.message = 'forbidden'
        break
      case 404:
        ctx.response.message = 'not found'
        break
      case 405:
        ctx.response.message = 'method not allowed'
        break
      case 406:
        ctx.response.message = 'not acceptable'
        break
      case 407:
        ctx.response.message = 'proxy authentication required'
        break
      case 408:
        ctx.response.message = 'request timeout'
        break
      case 409:
        ctx.response.message = 'conflict'
        break
      case 410:
        ctx.response.message = 'gone'
        break
      case 411:
        ctx.response.message = 'length required'
        break
      case 412:
        ctx.response.message = 'precondition failed'
        break
      case 413:
        ctx.response.message = 'payload too large'
        break
      case 414:
        ctx.response.message = 'uri too long'
        break
      case 415:
        ctx.response.message = 'unsupported media type'
        break
      case 416:
        ctx.response.message = 'range not satisfiable'
        break
      case 417:
        ctx.response.message = 'expectation failed'
        break
      case 418:
        ctx.response.message = 'I\'m a teapot'
        break
      default:
        ctx.response.status = 418
        ctx.response.message = 'I\'m a teapot'
        // ctx.response.status = 500
        // ctx.response.message = 'Something is broken inside'
    }
    ctx.response.message += `\n${e.message}`
  }
  error(`last chance check of ctx.status code: ${ctx.status}`)
  if (ctx.status >= 400) {
    ctx.response.type = 'html'
    const locals = {
      title: ctx.response.status,
      sessionUser: ctx.state?.sessionUser ?? {},
      isAuthenticated: ctx.state.isAuthenticated,
      errors: ctx.flash?.errors ?? {},
      status: ctx.response.status,
      message: ctx.response.message,
    }
    ctx.status = ctx.response.status
    await ctx.render('errors/error', locals)
  }
  log('escaped error-handler with no trapped errors')
}

export async function errorHandlers(ctx, next) {
  const log = middlewareLog.extend('errorHandler')
  const error = middlewareError.extend('errorHandler')
  log()
  try {
    await next()
    if (!ctx.body) {
      error('404, How get here?')
      ctx.status = 404
      const locals = {
        body: ctx.body,
        title: `${ctx.app.site}: 404`,
        sessionUser: ctx.state.sessionUser,
        isAuthenticated: ctx.state.isAuthenticated,
      }
      await ctx.render('404', locals)
    }
  } catch (e) {
    if (ctx.status === 500) {
      error('500, How get here?')
      const locals = {
        body: ctx.body,
        title: `${ctx.app.site}: 500`,
        user: ctx.state.sessionUser,
        isAuthenticated: ctx.state.isAuthenticated,
      }
      await ctx.render('500', locals)
    }
  }
}
