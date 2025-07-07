/**
 * @summary Koa router for the user api endpoints.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/users.js The router for the user api endpoints.
 */

/* eslint-disable no-unused-vars */
import Router from '@koa/router'
import { ObjectId } from 'mongodb'
import { _log, _error } from '../utils/logging.js'
import { Users, AdminUser } from '../models/users.js'
/* eslint-enable no-unused-vars */

const userLog = _log.extend('/users')
const userError = _error.extend('/users')
const USERS_COL = 'users'

function capitalize(word) {
  return word[0].toUpperCase() + word.substring(1).toLowerCase()
}
function sanitize(param) {
  // fill in with some effective input scubbing logic
  return param
}
const router = new Router()

router.get('getUsers', '/users/:type*', async (ctx) => {
  const log = userLog.extend('GET-users_type')
  const error = userError.extend('GET-users_type')
  if (!ctx.state.isAuthenticated || !(ctx.state?.sessionUser.type === 'Admin')) {
    ctx.status = 401
    ctx.type = 'application/json; charset=utf-8'
    ctx.body = { status: 'Unauthorized', code: 401 }
  } else {
    const db = ctx.state.mongodb.client.db()
    let filter
    if (!ctx.params.type) {
      filter = {}
    } else {
      filter = { userTypes: [capitalize(sanitize(ctx.params.type))] }
      log(filter)
    }
    // await next()
    const collection = db.collection(USERS_COL)
    const users = new Users(collection, ctx)
    let allUsers
    try {
      // this uses the aggregate query to group by user type
      allUsers = await users.getAllUsers(filter)
    } catch (err) {
      error('Error getting all users.')
      error(err)
    }
    ctx.status = 200
    ctx.type = 'application/json'
    ctx.body = { users: allUsers }
  }
})

router.get('getArchivedUsers', '/archived/:type*', async (ctx) => {
  const log = userLog.extend('GET-archived_type')
  const error = userError.extend('GET-archived_type')
  if (!ctx.state.isAuthenticated || !(ctx.state?.sessionUser.type === 'Admin')) {
    ctx.status = 401
    ctx.type = 'application/json; charset=utf-8'
    ctx.body = { status: 'Unauthorized', code: 401 }
  } else {
    const db = ctx.state.mongodb.client.db()
    let filter
    if (!ctx.params.type) {
      filter = {}
    } else {
      filter = { userTypes: [capitalize(sanitize(ctx.params.type))] }
    }
    log(filter)
    // await next()
    const collection = db.collection(USERS_COL)
    const users = new Users(collection, ctx)
    let allUsers
    try {
      // this uses the aggregate query to group by user type
      allUsers = await users.getAllArchivedUsers(filter)
    } catch (err) {
      error('Error getting all archived users.')
      error(err)
    }
    ctx.status = 200
    ctx.type = 'application/json'
    ctx.body = { users: allUsers }
  }
})

router.get('getUserById', '/user/byId/:id', async (ctx) => {
  const log = userLog.extend('GET-user_byId')
  const error = userError.extend('GET-user_byId')
  const id = sanitize(ctx.params.id)
  log(`looking up user by Id: ${id}`)
  if (Buffer.from(id).length !== 24 || /[^0-9A-Fa-f]/.test(id)) {
    // ctx.throw(400, `Not a valid user ID: ${id}`)
    const err = new Error(`Not a valid user ID: ${id}`)
    ctx.throw(400, err)
  }
  ctx.state.sessionUser = { id }
  const db = ctx.state.mongodb.client.db()
  // await next()
  const collection = db.collection(USERS_COL)
  const users = new Users(collection, ctx)
  const foundUser = await users.getById(id, { archived: false })
  if (foundUser === null) {
    error(`No user found with ID: ${id}`)
    // ctx.throw(404, `No user found with ID: ${id}`)
    const err = new Error(`No user found with ID: ${id}`)
    ctx.throw(404, err)
  }
  ctx.status = 200
  ctx.state.sessionUser = foundUser
  ctx.body = foundUser.toString()
  ctx.type = 'application/json'
})

router.get('getUserByEmail', '/user/byEmail/:email', async (ctx) => {
  const log = userLog.extend('GET-user_byEmail')
  const error = userError.extend('GET-user_byEmail')
  const email = sanitize(ctx.params.email)
  log(`looking up user by email: ${email}`)
  if (/^[\w!#$%&'*+/=?`{|}~^-]+(?:\.[\w!#$%&'*+/=?`{|}~^-]+)*@(?:[A-Z0-9-]+\.)+[A-Z]{2,6}$/i
    .test(email)) {
    error(`Not a valid email address: ${email}`)
    // ctx.throw(400, `Not a valid email address: ${email}`)
    const err = new Error(`Not a valid email address: ${email}`)
    ctx.throw(400, err)
  }
  ctx.state.sessionUser = { email }
  const db = ctx.state.mongodb.client.db()
  // await next()
  const collection = db.collection(USERS_COL)
  const users = new Users(collection, ctx)
  const foundUser = await users.getByEmail(email, { archived: false })
  if (foundUser === null) {
    error(`No user found with email: ${email}`)
    // ctx.throw(404, `No user found with email: ${email}`)
    const err = new Error(`No user found with email: ${email}`)
    ctx.throw(404, err)
  }
  ctx.status = 200
  ctx.state.sessionUser = foundUser
  ctx.body = foundUser.toString()
  ctx.type = 'application/json'
})

router.get('getUserByUsername', '/user/:username', async (ctx) => {
  const log = userLog.extend('GET-user_username')
  const error = userError.extend('GET-user_username')
  const username = sanitize(ctx.params.username)
  log(`loooking up user by username: ${username}`)
  let user
  const locals = {}
  // await next()
  try {
    const db = ctx.state.mongodb.client.db()
    const collection = db.collection(USERS_COL)
    const users = new Users(collection, ctx)
    user = await users.getByUsername(username, { archived: false })
    if (!user) {
      locals.title = `${ctx.app.site}: User Details`
      locals.username = username
    }
  } catch (err) {
    error(`Error getting username: ${username}`)
    error(err)
  }
  ctx.status = 200
  locals.title = `${ctx.app.site}: ${user.name}`
  // locals.user = user
  locals.displayUser = user
  locals.isAuthenticated = ctx.state.isAuthenticated
  locals.sessionUser = ctx.state.sessionUser
  await ctx.render('user', locals)
})

router.get('@username', /^\/@(?<username>[^@+?.:\s][a-zA-Z0-9_-]{2,30})$/, async (ctx) => {
  const log = userLog.extend('GET-user_@username')
  const error = userError.extend('GET-user_@username')
  const username = sanitize(ctx.params.username)
  log(`loooking up user by @username: ${username}`)
  let user
  const locals = {}
  // await next()
  try {
    // const db = ctx.state.mongodb.client.db()
    // const collection = db.collection(USERS_COL)
    // const users = new Users(collection, ctx)
    const users = new Users(ctx.state.mongodb, ctx)
    user = await users.getByUsername(username, { archived: false })
    if (!user) {
      locals.title = `${ctx.app.site}: User Details`
      locals.username = username
    }
  } catch (err) {
    error(`Error getting username: ${username}`)
    error(err)
  }
  ctx.status = 200
  locals.title = `${ctx.app.site}: ${username}`
  locals.sessionUser = ctx.state.sessionUser
  locals.displayUser = user
  locals.isAuthenticated = ctx.state.isAuthenticated
  locals.sessionUser = ctx.state.sessionUser
  await ctx.render('user', locals)
})

router.get('jwks', /^\/@(?<username>[^@+?.:\s][a-zA-Z0-9_-]{2,30})\/jwks.json$/, async (ctx) => {
  // This api route is publicly available, no need for authentication.
  const log = userLog.extend('GET-user_jwks-json')
  const error = userError.extend('GET-user_username')
  const username = sanitize(ctx.params.username)
  log(`looking up user by @username: ${username}`)
  let user
  let keys = {}
  try {
    const db = ctx.state.mongodb.client.db()
    const collection = db.collection(USERS_COL)
    const users = new Users(collection, ctx)
    user = await users.getByUsername(username, { archived: false })
    if (!user) {
      error(`User ${username} not found.`)
      ctx.status = 404
      ctx.type = 'text/plain; charset=utf-8'
      ctx.body = 'Not Found'
      return
    }
    keys = await user.jwksjson(0)
    if (keys.keys.length < 1) {
      error('No JWKS found.')
      ctx.status = 404
      ctx.type = 'text/plain; charset=utf-8'
      ctx.body = 'JWKS Not Found'
      return
    }
  } catch (e) {
    error(e)
    ctx.status = 500
    ctx.type = 'text/plain; charset=utf-8'
    ctx.body = 'JWKS lookup failed.'
    return
  }
  ctx.status = 200
  ctx.type = 'application/json; charset=utf-8'
  ctx.body = keys
})

export { router as users }
