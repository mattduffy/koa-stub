/**
 * @summary Koa router for the public .well-known resources.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/wellKnown.js The router for public well-known URI actions.
 */

import Router from '@koa/router'
import NodeInfo from '@mattduffy/webfinger/nodeinfo'
import Hostmeta from '@mattduffy/webfinger/host-meta'
import { _log, _error } from '../utils/logging.js'

const wellKnownLog = _log.extend('wellKnown')
const wellKnownError = _error.extend('wellKnown')
const router = new Router()

router.get('jwks-json', '/.well-known/jwks.json', (ctx, next) => {
  const log = wellKnownLog.extend('GET-jwks_json')
  const error = wellKnownError.extend('GET-jwks_json')
  log('server-wide JWK set')

  ctx.status = 200
  ctx.type = 'application/json; charset=utf-8'
  ctx.body = { keys: ['key1', 'key2', 'key3'] }
})

router.get('nodeinfo', '/.well-known/nodeinfo', async (ctx, next) => {
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

router.get('nodeinfo2.1', '/nodeinfo/2.1', async (ctx, next) => {
  const log = wellKnownLog.extend('GET-nodeinfo2.1')
  const error = wellKnownError.extend('GET-nodeinfo2.1')
  const { proto, host } = ctx.request
  const o = { db: ctx.state.mongodb.client, proto, host }
  const node = new NodeInfo(o)
  const info = await node.stats()
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

export { router as wellKnown }
