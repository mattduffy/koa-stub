/**
 * @summary Koa router for the app syndication feeds api endpoints.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/feeds.js
 */

import path from 'node:path'
import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import Router from '@koa/router'
import { AggregateGroupByReducers, AggregateSteps } from 'redis'
import { redis } from '../daos/impl/redis/redis-om.js'
import { _log, _info, _error } from '../utils/logging.js'

const seoLog = _log.extend('feeds')
const seoInfo = _info.extend('feeds')
const seoError = _error.extend('feeds')
const router = new Router()

router.get('seoSitemap', '/sitemap.xml', async (ctx) => {
  const log = seoLog.extend('GET-sitemap.xml')
  const info = seoInfo.extend('GET-sitemap.xml')
  const error = seoError.extend('GET-sitemap.xml')
  let assocs
  let piers
  const offset = 0
  const num = 79
  log('generating the sitemap.xml file.')
  try {
    piers = await redis.zRange('glp:all_piers_in_order', 0, -1)
    info(piers)
  } catch (e) {
    error('Failed to get all_piers_in_order.')
    piers = []
  }
  try {
    log()
    const optsAggregateAssoc = {
      LOAD: ['@pier', '@association'],
      STEPS: [
        {
          type: AggregateSteps.GROUPBY,
          properties: '@association',
          REDUCE: [{
            type: AggregateGroupByReducers.COUNT_DISTINCT,
            property: 'association',
            AS: 'num_associations',
          }],
        },
        {
          type: AggregateSteps.SORTBY,
          BY: '@association',
          MAX: 1,
        },
        {
          type: AggregateSteps.LIMIT,
          from: offset,
          size: num,
        },
      ],
    }
    assocs = await redis.ft.aggregate('glp:idx:piers:association', '*', optsAggregateAssoc)
  } catch (e) {
    error('Failed to get list of association names.')
    assocs = []
  }
  const locals = {
    layout: false,
    // origin: ctx.request.origin,
    assocs,
    piers,
  }
  // info(locals)
  if (!locals) {
    error('template locals doesn\'t exist, somehow.')
  }
  let sitemap
  let filePath
  try {
    sitemap = await ctx.render('sitemap.xml', locals)
    filePath = path.resolve(ctx.app.dirs.public.dir, 'sitemap.xml')
    log()
    const sitemapData = new Uint8Array(Buffer.from(sitemap))
    await writeFile(filePath, sitemapData)
    info()
  } catch (e) {
    error()
  }
  ctx.type = 'application/xml'
  ctx.status = 200
  ctx.body = sitemap
})

export { router as feeds }
