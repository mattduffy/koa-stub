/**
 * @summary Koa router for Activity Stream related actions.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/activity_stream.js
 */

import Router from '@koa/router'
// import { ObjectId } from 'mongodb'
// import Debug from 'debug'
// import { Users } from '../models/users.js'

function sanitize(param) {
  // fill in with some effective input scubbing logic
  return param
}

// const router = new Router({ prefix: '/as/v1' })
const router = new Router()

router.get('authorize_interaction', '/authorize_interaction', async (ctx, next) => {
  await next()
  if (!ctx.request.query.uri) {
    ctx.status = 400
    ctx.type = 'text/plain; charset=utf-8'
    ctx.body = 'Missing required URI parameter.'
  } else {
    const uri = sanitize(ctx.request.query.uri)
    ctx.status = 200
    ctx.type = 'application/json'
    ctx.body = JSON.stringify({ move: 'twerk', style: 'turf', uri })
  }
})

export {
  router as activityV1,
}
