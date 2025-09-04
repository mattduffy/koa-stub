/**
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary Koa router for the blogs level pages.
 * @file src/routes/main.js
 */

import Router from '@koa/router'
// import { ObjectId } from 'mongodb'
import { Albums } from '@mattduffy/albums/Albums'
import { Blogs } from '@mattduffy/blogs'
// import { Users } from '../models/users.js'
import { _log, _error } from '../utils/logging.js'
import { redis } from '../daos/impl/redis/redis-client.js'

const blogsLog = _log.extend('blogs')
const blogsError = _error.extend('blogs')
/* eslint-disable-next-line no-unused-vars */
function sanitize(param) {
  // fill in with some effective input scubbing logic
  return param
}
const router = new Router()
async function hasFlash(ctx, next) {
  const log = blogsLog.extend('hasFlash')
  const error = blogsError.extend('hasFlash')
  if (ctx.flash) {
    log('ctx.flash is present: %o', ctx.flash)
  } else {
    error('ctx.flash is missing.')
  }
  await next()
}

router.get('userBlog', '/:username/blog', hasFlash, async (ctx) => {
  const log = blogsLog.extend('user-blog')
  const error = blogsError.extend('user-blog')
  let blog
  let posts
  const username = ctx.params.username.slice(1)
  log(`inside main router: /@${username}/blog`)
  try {
    blog = await Blogs.getByUsername(ctx.state.mongodb.client.db(), username)
    log(`${blog}`)
    posts = await blog.getPosts(0, 'all', 'desc', 'public')
    log(posts)
  } catch (e) {
    const msg = `Failed to get blog for ${username}.`
    error(msg)
    error(e)
    posts = false
  }
  const locals = {
    blog,
    posts,
    body: ctx.body,
    // origin: ctx.request.origin,
    flash: ctx.flash?.blogs ?? {},
    title: `${ctx.app.site}: Blog: @${username}`,
    username,
    sessionUser: ctx.state.sessionUser ?? null,
    isAuthenticated: ctx.state.isAuthenticated,
  }
  // await ctx.render('blog-user', locals)
  await ctx.render('blog/user-gog', locals)
})

router.get('userBlogPost', '/:username/blog/:slug', hasFlash, async (ctx) => {
  const log = blogsLog.extend('user-blog-post')
  const error = blogsError.extend('user-blog-post')
  let blog
  let post
  const username = ctx.params.username.slice(1)
  const { slug } = ctx.params
  try {
    blog = await Blogs.getByUsername(ctx.state.mongodb.client.db(), username)
    post = await blog.getPostBySlug(slug)
    log(post.id)
    log(post.title)
    log(post.slug)
    log(post.authors)
    log(post.createdOn)
  } catch (e) {
    const msg = `Failed to retrieve post by slug: ${slug}`
    error(msg)
    error(e)
    post = false
  }
  const locals = {
    blog,
    post,
    body: ctx.body,
    title: `${ctx.app.site}: Blog: @${username}: ${post.title}`,
    flash: ctx.flash?.blogPost ?? {},
    username,
    sessionUser: ctx.state.sessionUser ?? null,
    isAuthenticated: ctx.state.isAuthenticated,
  }
  await ctx.render('blog/user-posts', locals)
})

export { router as blogs }
