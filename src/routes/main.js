/**
 * @summary Koa router for the main top-level pages.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/main.js The router for the top level app URLs.
 */

import Router from '@koa/router'
import { ObjectId } from 'mongodb'

const router = new Router()

router.get('getLogin', '/login', async (ctx, next) => {
  const user = ctx.state.user || {}
  if (user?.isAuthenticated) {
    ctx.redirect('/')
  }
  const locals = {
    body: ctx.body,
    title: `${ctx.app.site}: Login`,
    user,
    csrfToken: new ObjectId().toString(),
  }
  await ctx.render('login', locals)
  await next()
})

router.get('index', '/', async (ctx, next) => {
  await next()
  console.log('inside main router: /')
  const user = ctx.state.user || {}
  await ctx.render('index', { body: ctx.body, title: `${ctx.app.site}: Contact`, user })
})

router.get('about', '/about', async (ctx, next) => {
  await next()
  console.log('inside index router: /about')
  const user = ctx.state.user || {}
  await ctx.render('about', { body: ctx.body, title: `${ctx.app.site}: Contact`, user })
})

router.get('contact', '/contact', async (ctx, next) => {
  await next()
  const user = ctx.state.user || {}
  await ctx.render('contact', { title: `${ctx.app.site}: Contact`, user })
})

export { router as main }
