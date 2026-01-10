/**
 * @summary Koa router for the main top-level pages.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/api_v1.js
 */

import Router from '@koa/router'
// import { ObjectId } from 'mongodb'
// import Debug from 'debug'
// import { Users } from '../models/users.js'

// function sanitize(param) {
//   // fill in with some effective input scubbing logic
//   return param
// }

const router = new Router({ prefix: '/api/v1' })

router.get('twerk', '/twerk', async (ctx, next) => {
  await next()
  ctx.status = 200
  ctx.type = 'application/json'
  ctx.body = JSON.stringify({ move: 'twerk', style: 'turf' })
})

export {
  router as apiV1,
}
