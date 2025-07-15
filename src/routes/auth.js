/**
 * @summary Koa router for the main top-level pages.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/auth.js The router for authentication related actions.
 */

import Router from '@koa/router'
import { ulid } from 'ulid'
// import { ObjectId } from 'mongodb'
import {
  addIpToSession,
  doTokensMatch,
  processFormData,
  hasFlash,
} from './middlewares.js'
import { _log, _error } from '../utils/logging.js'
import { Users } from '../models/users.js'

const authLog = _log.extend('auth')
const authError = _error.extend('auth')
const router = new Router()

//
// Middleware functions located in ./middlewares.js file:
// - doTokensMatch()
// - processFormData()
// - hasFlash()
//

router.get('getLogin', '/login', async (ctx, next) => {
  const log = authLog.extend('GET-login')
  const error = authError.extend('GET-login')
  log('logging the user in')
  try {
    await next()
  } catch (e) {
    error(e)
    // ctx.throw(500, e)
    const err = new Error('', { cause: e })
    ctx.throw(500, err)
  }
  ctx.state.sessionUser = ctx.state.sessionUser ?? {}
  if (ctx.state.isAuthenticated) {
    ctx.redirect('/')
  }
  const csrfToken = ulid()
  const locals = {
    body: ctx.body,
    title: `${ctx.app.site}: Login`,
    sessionUser: ctx.state.sessionUser,
    csrfToken,
    login: ctx.flash.login ?? {},
    isAuthenticated: ctx.state.isAuthenticated,
  }
  log('template {locals}: %O', locals)
  ctx.session.csrfToken = locals.csrfToken
  ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
  await ctx.render('login', locals)
})

router.post('postLogin', '/login', hasFlash, addIpToSession, processFormData, async (ctx) => {
  const log = authLog.extend('POST-login')
  const error = authError.extend('POST-login')
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  const sessionId = ctx.cookies.get('session')
  const [username] = ctx.request.body.username
  const [password] = ctx.request.body.password
  if (!doTokensMatch(ctx)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    const db = ctx.state.mongodb.client.db()
    const collection = db.collection('users')
    const users = new Users(collection, ctx)
    const authUser = await users.authenticateAndGetUser(username, password)
    log('authentication result: %o', authUser)
    const doc = { attemptedAt: new Date(), username }
    if (ctx.state?.logEntry) {
      doc.from = { ip: ctx.state.logEntry.ip, geo: ctx.state.logEntry.geo }
    }
    if (!authUser.user) {
      doc.incorrectPassword = password
      await db.collection('loginAttempts').insertOne(doc)
      ctx.state.isAuthenticated = false
      ctx.flash = {
        login: {
          username,
          info: authUser.info,
          message: authUser.message,
          error: authUser.error,
        },
      }
      error(`Unsuccesful login attempt for ${username}`)
      ctx.redirect('/login')
    } else if (authUser) {
      await db.collection('loginAttempts').insertOne(doc)
      log('successful user login')
      authUser.user.sessionId = sessionId
      const loggedInUser = await authUser.user.update()
      ctx.state.sessionUser = loggedInUser
      ctx.state.isAuthenticated = true
      ctx.session.id = loggedInUser.id
      ctx.session.jwts = loggedInUser.jwts
      ctx.session.username = loggedInUser.username
      delete ctx.session.csrfToken
      ctx.cookies.set('csrfToken')
      ctx.cookies.set('csrfToken.sig')
      ctx.flash = {
        index: {
          username: loggedInUser.username,
          message: `Hello ${loggedInUser.firstName}`,
          info: authUser.message,
          error: null,
        },
      }
      ctx.redirect('/account')
    }
  }
})

router.get('getLogout', '/logout', async (ctx) => {
  const log = authLog.extend('logout')
  // const error = authError.extend('logout')
  if (ctx.state.isAuthenticated) {
    log('logging out')
    ctx.state.sessionUser = null
    ctx.session = null
  }
  ctx.state.isAuthenticated = false
  ctx.cookies.set('csrfToken')
  ctx.cookies.set('csrfToken.sig')
  ctx.redirect('/')
})

export { router as auth }
