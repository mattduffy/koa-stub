/**
 * @summary Koa router for the public .well-known resources.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/wellKnown.js The router for public well-known URI actions.
 */

import Router from '@koa/router'
import NodeInfo from '@mattduffy/webfinger/nodeinfo.js' // eslint-disable-line import/no-unresolved
import Hostmeta from '@mattduffy/webfinger/host-meta.js' // eslint-disable-line import/no-unresolved
import Webfinger from '@mattduffy/webfinger/webfinger.js' // eslint-disable-line import/no-unresolved
import { App } from '../models/app.js'
import { _log, _error } from '../utils/logging.js'

const wellKnownLog = _log.extend('wellKnown')
const wellKnownError = _error.extend('wellKnown')
const router = new Router()

router.get('jwks-json', '/.well-known/jwks.json', async (ctx) => {
  const log = wellKnownLog.extend('GET-jwks_json')
  const error = wellKnownError.extend('GET-jwks_json')
  log('server-wide JWK set')
  const o = {
    db: ctx.state.mongodb.client.db(ctx.state.mongodb.client.dbName),
    keyDir: ctx.app.dirs.keys,
    siteName: ctx.app.site,
  }
  const theApp = new App(o)
  // const theApp = new App({ db: ctx.state.mongodb.client, keyDir: ctx.app.dirs.keys })
  let keys
  try {
    keys = await theApp.keys()
    log(keys)
  } catch (e) {
    error(e)
    ctx.throw(500, e)
  }
  let jwks
  try {
    jwks = await theApp.jwksjson(0)
    log(jwks)
  } catch (e) {
    error(e)
    ctx.throw(500, e)
  }
  ctx.status = 200
  ctx.type = 'application/json; charset=utf-8'
  ctx.body = jwks
})

router.get('nodeinfo', '/.well-known/nodeinfo', async (ctx) => {
  const log = wellKnownLog.extend('GET-nodeinfo')
  const error = wellKnownError.extend('GET-nodeinfo')
  log('well-known nodeinfo request')
  if (!ctx.state.mongodb) {
    error('Missing database connection')
    ctx.status = 500
    ctx.type = 'text/plain; charset=utf-8'
    ctx.throw(500, 'Missing db connection')
  }
  let info
  try {
    const host = ctx.origin
    const o = { db: ctx.state.mongodb.client, host, path: ctx.request.path }
    const node = new NodeInfo(o)
    info = await node.info()
    if (!info) {
      ctx.status = 400
      ctx.type = 'text/plain; charset=utf-8'
      ctx.body = 'Bad Request'
    } else {
      ctx.status = 200
      ctx.type = info.type
      ctx.body = info.body
    }
  } catch (e) {
    error(e)
    ctx.status = 500
    ctx.throw(500, 'Nodeinfo failure - 100', e)
  }
})

router.get('nodeinfo2.1', '/nodeinfo/2.1', async (ctx) => {
  const log = wellKnownLog.extend('GET-nodeinfo2.1')
  const error = wellKnownError.extend('GET-nodeinfo2.1')
  const { proto, host } = ctx.request
  const o = { db: ctx.state.mongodb.client, proto, host }
  const node = new NodeInfo(o)
  let info
  try {
    info = await node.stats()
    log(info)
  } catch (e) {
    error(e)
    ctx.throw(500, e)
  }
  if (!info) {
    error('Nodeinfo not found')
    ctx.status = 404
    ctx.type = 'text/plain; charset=utf-8'
    ctx.body = 'Not Found'
  } else {
    ctx.status = 200
    ctx.type = info.type
    ctx.body = info.body
  }
})

router.get('host-meta', '/.well-known/host-meta', async (ctx, next) => {
  const log = wellKnownLog.extend('GET-host-meta')
  const error = wellKnownError.extend('GET-host-meta')
  // Doesn't seem like anything other than Mastodon relies on this anymore.
  // No need to make it do anything other than return the default description
  // of the webfinger interface.
  try {
    await next()
  } catch (e) {
    error('Hostmeta failure - 200')
    ctx.throw(500, 'Hostmeta failure - 200', e)
  }
  let info
  try {
    // const host = `${ctx.request.protocol}://${ctx.request.host}`
    const host = ctx.request.origin
    const o = { path: ctx.request.path, host }
    const meta = new Hostmeta(o)
    info = meta.info()
    log(info)
    if (!info) {
      ctx.status = 400
      ctx.type = 'text/plain; charset=utf8'
      ctx.body = 'Bad request'
    } else {
      ctx.status = 200
      ctx.type = info.type
      ctx.body = info.body
    }
  } catch (e) {
    error(e)
    ctx.status = 500
    // throw new Error(e)
    ctx.throw(500, 'Hostmeta failure - 100', e)
  }
})

router.get('webfinger', '/.well-known/webfinger', async (ctx, next) => {
  const log = wellKnownLog.extend('GET-webfinger')
  const error = wellKnownError.extend('GET-webfinger')
  if (!ctx.state.mongodb) {
    error('Missing db connection')
    ctx.status = 500
    ctx.type = 'text/plain; charset=utf-8'
    ctx.throw(500, 'Missing database connection.')
  }
  try {
    log('awaiting next return')
    await next()
  } catch (e) {
    error('Webfinger failure - 200')
    error(e)
    ctx.throw(500, 'Webfinger failure - 200', e)
  }
  try {
    const re = /^acct:([^\\s][A-Za-z0-9_-]{2,30})(?:@)?([^\\s].*)?$/
    const username = re.exec(ctx.request.query?.resource)
    if (!ctx.request.query.resource || !username) {
      error('Missing resource query parameter.')
      ctx.status = 400
      ctx.type = 'text/plain; charset=utf-8'
      ctx.body = 'Bad request'
    } else {
      const { origin, host, protocol } = ctx.request
      const localAcct = new RegExp(`(${host})`)
      let isLocal = false
      if (username[2] === undefined || localAcct.test(username[2])) {
        isLocal = true
      }
      const db = ctx.state.mongodb.client.db()
      const users = db.collection('users')
      const o = {
        db: users,
        username,
        local: isLocal,
        origin,
        protocol: `${protocol}`,
        host: `${host}`,
        imgDir: ctx.app.dirs.public.dir,
      }
      const finger = new Webfinger(o)
      const found = await finger.finger()
      if (!found) {
        ctx.status = 404
        ctx.type = 'text/plain; charset=utf-8'
        ctx.body = `${username[1]} not found`
      } else {
        ctx.status = 200
        ctx.type = 'application/jrd+json; charset=utf-8'
        ctx.body = found
      }
    }
  } catch (e) {
    error(e)
    ctx.status = 500
    // throw new Error(e)
    ctx.throw(500, 'Webfinger failure - 100', e)
  }
})

export { router as wellKnown }
