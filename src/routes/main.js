/**
 * @summary Koa router for the main top-level pages.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/main.js The router for the top level app URLs.
 */

import Router from '@koa/router'
import { ObjectId } from 'mongodb'
import { _log, _error } from '../utils/logging.js'
import { Users } from '../models/users.js'

const mainLog = _log.extend('main')
const mainError = _error.extend('main')
function sanitize(param) {
  // fill in with some effective input scubbing logic
  return param
}
const router = new Router()
async function hasFlash(ctx, next) {
  const log = mainLog.extend('hasFlash')
  const error = mainError.extend('hasFlash')
  if (ctx.flash) {
    log('ctx.flash is present: %o', ctx.flash)
  } else {
    error('ctx.flash is missing.')
  }
  await next()
}

router.get('index', '/', hasFlash, async (ctx, next) => {
  const log = mainLog.extend('index')
  const error = mainError.extend('index')
  log('inside main router: /')
  // await next()
  ctx.status = 200
  // log(ctx.state.sessionUser)
  await ctx.render('index', {
    sessionUser: ctx.state.sessionUser,
    body: ctx.body,
    flash: ctx.flash?.index ?? {},
    title: `${ctx.app.site}: Home`,
    isAuthenticated: ctx.state.isAuthenticated,
  })
})

router.get('galleries', '/galleries', hasFlash, async (ctx, next) => {
  const log = mainLog.extend('galleries')
  const error = mainError.extend('galleries')
  log('inside index router: /galleries')
  ctx.status = 200
  await ctx.render('about', {
    body: ctx.body,
    title: `${ctx.app.site}: Galleries`,
    sessionUser: ctx.state.sessionUser,
    isAuthenticated: ctx.state.isAuthenticated,
  })
})

router.get('about', '/about', hasFlash, async (ctx, next) => {
  const log = mainLog.extend('about')
  const error = mainError.extend('about')
  log('inside index router: /about')
  // await next()
  ctx.status = 200
  await ctx.render('about', {
    body: ctx.body,
    title: `${ctx.app.site}: About`,
    sessionUser: ctx.state.sessionUser,
    isAuthenticated: ctx.state.isAuthenticated,
  })
})

router.get('contact', '/contact', hasFlash, async (ctx, next) => {
  const log = mainLog.extend('contact')
  const error = mainError.extend('contact')
  log('inside index router: /contact')
  // await next()
  ctx.status = 200
  await ctx.render('contact', {
    title: `${ctx.app.site}: Contact`,
    sessionUser: ctx.state.sessionUser,
    isAuthenticated: ctx.state.isAuthenticated,
  })
})

router.get('renderTest', '/renderTest', async (ctx, next) => {
  const log = mainLog.extend('renderTest')
  const rendered = await ctx.render('renderTest', {
    title: `${ctx.app.site}: render test`,
    user: ctx.state?.user ?? 'Matt',
    sessionUser: ctx.state?.sessionUser ?? {},
    isAuthenticated: false,
  })
  log(rendered)
  ctx.redirect('/')
})

export { router as main }
