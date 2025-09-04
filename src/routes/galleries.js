/**
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary Koa router for the gallery level pages.
 * @file src/routes/main.js
 */

import path from 'node:path'
import { readFile } from 'node:fs/promises'
import Router from '@koa/router'
import { Albums } from '@mattduffy/albums/Albums' // eslint-disable-line import/no-unresolved
import { Users } from '../models/users.js'
// import { Blogs } from '@mattduffy/blogs' // eslint-disable-line import/no-unresolved
import { _log, _error } from '../utils/logging.js'
import { redis } from '../daos/impl/redis/redis-client.js'

const galleriesLog = _log.extend('galleries')
const galleriesError = _error.extend('galleries')

const router = new Router()
async function hasFlash(ctx, next) {
  const log = galleriesLog.extend('hasFlash')
  const error = galleriesError.extend('hasFlash')
  if (ctx.flash) {
    log('ctx.flash is present: %o', ctx.flash)
  } else {
    error('ctx.flash is missing.')
  }
  await next()
}

router.get('usernamePublicGalleryId', '/:username/gallery/:id', hasFlash, async (ctx) => {
  const log = galleriesLog.extend('GET-account-Username-Public-Gallery-id')
  const error = galleriesError.extend('GET-account-Username-Public-Gallery-id')
  let { username } = ctx.params
  const token = ctx.params.id
  let albumId
  let albumSlug
  if (/^([a-f0-9]{24})$/.test(token)) {
    albumId = token
  } else {
    albumSlug = token
  }
  let displayUser
  try {
    log(ctx.state.mongodb.client.options.credentials)
    const users = new Users(ctx.state.mongodb, ctx)
    if (username[0] === '@') {
      username = username.slice(1)
    }
    displayUser = await users.getByUsername(username)
  } catch (e) {
    error(`Failed to find user by @${username}`)
    error(e)
  }
  if (username !== displayUser.username) {
    try {
      const cachedPage = await readFile(path.join(ctx.app.dirs.cache.pages, ctx.path), { encoding: 'utf8' })
      ctx.status = 200
      ctx.type = 'text/html; charset=utf-8'
      ctx.body = cachedPage
      return
    } catch (e) {
      error(e)
      error('No cached page to load.')
    }
  }
  let album
  try {
    const db = ctx.state.mongodb.client.db()
    if (albumId) {
      album = await Albums.getById(db, albumId, redis)
    } else {
      album = await Albums.getBySlug(db, albumSlug, redis)
    }
    log(album)
  } catch (e) {
    error(`Failed to find @${displayUser.username}'s gallery: ${token}`)
  }
  const locals = {}
  locals.view = ctx.flash.view ?? {}
  locals.sessionUser = ctx.state.sessionUser
  locals.isAuthenticated = ctx.state.isAuthenticated
  locals.displayUser = displayUser
  locals.body = ctx.body
  locals.album = album
  locals.title = `${ctx.app.site}: ${displayUser.username}'s gallery, ${album.name}`
  await ctx.render('account/user-gallery-public', locals)
})

export { router as galleries }
