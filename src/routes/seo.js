/**
 * @summary Koa router for the app seo api endpoints.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/seo.js The router for the app seo api endpoints.
 */

import path from 'node:path'
import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import Router from '@koa/router'
// import { AggregateGroupByReducers, AggregateSteps } from 'redis'
// import { redis } from '../daos/impl/redis/redis-om.js'
import { _log, _info, _error } from '../utils/logging.js'

const seoLog = _log.extend('seo')
const seoInfo = _info.extend('seo')
const seoError = _error.extend('seo')
const router = new Router()

router.get('seoSitemap', '/sitemap.xml', async (ctx) => {
  const log = seoLog.extend('GET-sitemap.xml')
  const info = seoInfo.extend('GET-sitemap.xml')
  const error = seoError.extend('GET-sitemap.xml')
  log('generating the sitemap.xml file.')

  const locals = {
    layout: false,
    // origin: ctx.request.origin,
  }
  info(locals)
  if (!locals) {
    error('template locals doesn\'t exist, somehow.')
  }
  let sitemap
  let filePath
  try {
    sitemap = await ctx.render('sitemap.xml', locals)
    filePath = path.resolve(ctx.app.dirs.public.dir, 'sitemap.xml')
    log(`sitemap.xml save path: ${filePath}`)
    const sitemapData = new Uint8Array(Buffer.from(sitemap))
    const file = await writeFile(filePath, sitemapData)
    info(`saved sitemap.xml file: ${file}`)
  } catch (e) {
    error(`Failed to save sitemap to ${filePath}`)
  }
  ctx.type = 'application/xml'
  ctx.status = 200
  ctx.body = sitemap
})

export { router as seo }
