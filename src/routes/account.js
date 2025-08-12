/**
 * @summary Koa router for the account api endpoints.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/account.js
 */

import Router from '@koa/router'
import { ulid } from 'ulid'
// import { ObjectId } from 'mongodb'
import path from 'node:path'
import {
  mkdir, rename, writeFile, stat,
} from 'node:fs/promises'
import {
  // addIpToSession,
  doTokensMatch,
  processFormData,
  hasFlash,
} from './middlewares.js'
import { Album } from '@mattduffy/albums'
import { Albums } from '@mattduffy/albums/Albums'
import { Unpacker } from '@mattduffy/unpacker'
import { Blog, Blogs, slugify } from '@mattduffy/blogs'
import { _log, _error } from '../utils/logging.js'
import { Users, AdminUser } from '../models/users.js'
import { redis } from '../daos/impl/redis/redis-client.js'
import { ioredis } from '../daos/impl/redis/ioredis-client.js'

const USERS = 'users'
const accountLog = _log.extend('account')
const accountError = _error.extend('account')
const router = new Router()

function isAsyncRequest(ctx) {
  return (ctx.request.get('X-ASYNCREQUEST') === true)
}

/* eslint-disable-next-line no-unused-vars */
function capitalize(word) {
  return word[0].toUpperCase() + word.substring(1).toLowerCase()
}

function sanitize(param) {
  // fill in with some effective input scubbing logic
  return param
}

function sanitizeFilename(filename) {
  // Remove white space characters from filename.
  // Remove non-word characters from filename.
  /* eslint-disable-next-line */
  const cleanName = filename.replace(/[\s!@#\$%&*\(\)](?!(\.\w{1,4}$))/g, '_')
  console.info(`Sanitizing filename ${filename} to ${cleanName}`)
  return cleanName
}

//
// Middleware functions located in ./middlewares.js file:
// - doTokensMatch()
// - processFormData()
// - hasFlash()
//

router.get('accountPasswordGET', '/account/change/password', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-account-change-password')
  const error = accountError.extend('GET-account-change-password')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    log(`View ${ctx.state.sessionUser.username}'s account password.`)
    // const csrfToken = new ObjectId().toString()
    const csrfToken = ulid()
    ctx.session.csrfToken = csrfToken
    ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
    // if (isAsyncRequest(ctx.request)) {
    if (isAsyncRequest(ctx)) {
      // async request, send back json
      ctx.type = 'application/json; charset=utf-8'
      // ctx.body = ctx.headers
      ctx.body = { nopeeking: true }
    } else {
      // regular http request, send back view
      const locals = {
        csrfToken,
        username: ctx.state.sessionUser.username,
        body: ctx.body,
        sessionUser: ctx.state.sessionUser,
        flash: ctx.flash.edit ?? {},
        isAuthenticated: ctx.state.isAuthenticated,
        title: `${ctx.app.site}: View Account Password`,
      }
      ctx.status = 200
      await ctx.render('account/user-password', locals)
    }
  }
})

router.post(
  'accountPasswordPOST',
  '/account/change/password',
  hasFlash,
  processFormData,
  async (ctx) => {
  const log = accountLog.extend('POST-account-change-password')
  const error = accountError.extend('POST-account-change-password')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  }
  log(`View ${ctx.state.sessionUser.username}'s account password.`)
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  const sessionId = ctx.cookies.get('session')
  const [currentPassword] = ctx.request.body.currentPassword ?? ''
  const [newPassword1] = ctx.request.body.newPassword1 ?? ''
  const [newPassword2] = ctx.request.body.newPassword2 ?? ''
  if (!doTokensMatch(ctx)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    if (currentPassword === '') {
      error('currentPassword is missing.')
      ctx.flash = { edit: { error: 'Missing current password.' } }
      ctx.redirect('/account/change/password')
    } else if (newPassword1 === '' || newPassword2 === '' || newPassword1 !== newPassword2) {
      error('newPasswords are missing or don\'t match.')
      ctx.flash = { edit: { error: 'New passwords must match.' } }
      ctx.redirect('/account/change/password')
    } else {
      try {
        log('Have currentPassword and matching newPassword')
        const result = await ctx.state.sessionUser.updatePassword(currentPassword, newPassword1)
        // log(result)
        if (result.success) {
          ctx.state.sessionUser = await ctx.state.sessionUser.update()
          ctx.flash = { edit: { message: result.message } }
          ctx.redirect('/account/change/password')
        } else {
          ctx.flash = { edit: { error: 'Couldn\'t update password.' } }
          ctx.redirect('/account/change/password')
        }
      } catch (e) {
        ctx.flash = { edit: { error: e.message } }
        ctx.redirect('/account/change/password')
      }
    }
  }
})

router.get('accountTokens', '/account/tokens', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-account-tokens')
  const error = accountError.extend('GET-account-tokens')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    log(`View ${ctx.state.sessionUser.username}'s account tokens.`)
    if (isAsyncRequest(ctx)) {
      // async request, send back json
      ctx.type = 'application/json; charset=utf-8'
      ctx.body = ctx.state.sessionUser.jwts
    } else {
      // regular http request, send back view
      const locals = {
        body: ctx.body,
        view: ctx.flash.view ?? {},
        sessionUser: ctx.state.sessionUser,
        isAuthenticated: ctx.state.isAuthenticated,
        title: `${ctx.app.site}: View Account Tokens`,
      }
      ctx.status = 200
      await ctx.render('account/user-tokens', locals)
    }
  }
})

router.get(
  'accountCreateKeys',
  '/account/:username/createKeys/:type?',
  hasFlash,
  async (ctx) => {
  const log = accountLog.extend('GET-account-generateKeys')
  const error = accountError.extend('GET-account-generateKeys')
  let status
  let body
  log(ctx.headers)
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  }
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  // if (ctx.request.header.csrftoken !== ctx.session.csrfToken) {
  if (!doTokensMatch(ctx)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    const db = ctx.state.mongodb.client.db()
    const collection = db.collection(USERS)
    const users = new Users(collection, ctx)
    let username = sanitize(ctx.params.username)
    if (username[0] === '@') {
      username = username.slice(1)
    }
    let user = await users.getByUsername(username)
    const createTypes = { signing: false, encrypting: false }
    if (ctx.params.type === 'signing') {
      createTypes.signing = true
      log('Request to generate signing key type')
    } else if (ctx.params.type === 'encrypting') {
      createTypes.encrypting = true
      log('Request to generate encrypting key type')
    } else {
      createTypes.signing = true
      createTypes.encrypting = true
      log('Request to generate both signing and encrypting keypairs.')
    }
    let keys
    try {
      keys = await user.generateKeys(createTypes)
      user = await user.update()
      if (keys.status === 'success') {
        status = 200
        body = {
          status: 'success',
          // url: `${ctx.request.origin}/${user.url}/jwks.json`,
          url: `${ctx.state.origin}/${user.url}/jwks.json`,
          keys: await user.publicKeys(0, 'jwk'),
        }
      } else {
        status = 418
        body = { error: 'I\'m a teapot' }
      }
    } catch (e) {
      error(`Failed to generate key pair for ${ctx.state.sessionUser.username}`)
      error(e)
      status = 500
      body = { error: 'No webcrypto keys were created.' }
    }
    ctx.status = status
    ctx.type = 'application/json; charset=utf-8'
    ctx.body = body
  }
})

router.get('accountPublicKeys', '/account/pubkeys', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-account-publickeys')
  const error = accountError.extend('GET-account-publickeys')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    log(`is this an async api request? ${ctx.state.isAsyncRequest}`)
    if (ctx.state.isAsyncRequest) {
      ctx.status = 200
      ctx.type = 'application/json; charset=utf-8'
      ctx.body = await ctx.state.sessionUser.publicKeys()
    } else {
      // const csrfToken = new ObjectId().toString()
      const csrfToken = ulid()
      ctx.session.csrfToken = csrfToken
      const locals = {
        csrfToken,
        body: ctx.body,
        pageName: 'pubkeys',
        // nonce: ctx.app.nonce,
        view: ctx.flash.view ?? {},
        // origin: ctx.request.origin,
        sessionUser: ctx.state.sessionUser,
        title: `${ctx.app.site}: View Public Key`,
        isAuthenticated: ctx.state.isAuthenticated,
        jwtAccess: (ctx.state.sessionUser.jwts).token,
      }
      ctx.status = 200
      await ctx.render('account/user-pubkeys', locals)
    }
  }
})

router.get('accountSignData', '/account/sign/:data', hasFlash, async (ctx) => {
  console.log(ctx)
})

router.get('accountVerifyData', '/account/verify/:signature', hasFlash, async (ctx) => {
  console.log(ctx)
})

router.get('accountEncryptData', '/account/encrypt/:plaintext', hasFlash, async (ctx) => {
  console.log(ctx)
})
router.get('accountDecryptData', '/account/decrypt/:ciphertext', hasFlash, async (ctx) => {
  console.log(ctx)
})

router.get('accountBlog', '/account/blog', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-account-blog')
  const error = accountError.extend('GET-account-blog')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    log(`View ${ctx.state.sessionUser.username}'s account details.`)
    log('flash %O', ctx.flash)
    const db = ctx.state.mongodb.client.db()
    // Get list of blogs, if they exist
    const { username } = ctx.state.sessionUser
    log(`username for blog owner: ${username}`)
    const blog = await Blogs.getByUsername(db, username, ioredis) ?? {}
    log(`found ${username}'s blog: ${blog.title}`)
    const posts = await blog.posts(0, 'all')
    log(`found ${posts.length} posts. `, posts)
    const csrfToken = ulid()
    ctx.session.csrfToken = csrfToken
    ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
    const locals = {
      sessionUser: ctx.state.sessionUser,
      blog,
      posts,
      body: ctx.body,
      view: ctx.flash.view ?? {},
      edit: ctx.flash.edit ?? {},
      // origin: `${ctx.request.origin}`,
      jwtAccess: (ctx.state.sessionUser.jwts).token,
      csrfToken,
      // public: pub,
      // private: pri,
      isAuthenticated: ctx.state.isAuthenticated,
      title: `${ctx.app.site}: View Blog Details`,
    }
    ctx.status = 200
    await ctx.render('account/user-blog-edit', locals)
  }
})

router.post('accountBlogEdit', '/account/blog/edit', hasFlash, processFormData, async (ctx) => {
  const log = accountLog.extend('POST-account-blog-edit')
  const error = accountError.extend('POST-account-blog-edit')
  if (!isAsyncRequest(ctx)) {
    ctx.status = 400
    ctx.redirect('/')
  }
  let body
  let status
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  }
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  const sessionId = ctx.cookies.get('session')
  // if (ctx.cookies.get('csrfToken') !== ctx.session.csrfToken) {
  if (!doTokensMatch(ctx)) {
    error(`CSR-Token mismatch: header: ${csrfTokenCookie} - session:${csrfTokenSession}`)
    status = 401
    body = { error: 'csrf token mismatch' }
  } else {
    log(ctx.request.body)
    log(ctx.request.files)
    let blog
    const blogId = (!ctx.request.body.id?.[0]?.length) ? null : ctx.request.body.id[0]
    const blogTitle = ctx.request.body.title?.[0] ?? ''
    const blogDescription = ctx.request.body.description[0] ?? ''
    const blogPublic = (ctx.request.body?.public?.[0])
      ? ((ctx.request.body.public[0] === 'true') ? true : false)
      : false // eslint-disable-line
    log(`blog access: ${blogPublic}`)
    const blogKeywords = (ctx.request.body?.keywords)
      ? Array.from(ctx.request.body?.keywords?.[0]?.split(','))
      : []
    const blogDirPath = path.join(
      ctx.app.dirs.public.dir,
      ctx.state.sessionUser.publicDir,
      'blog',
    )
    let blogDir
    let smallImg
    let smallImgPath
    let bigImg
    let bigImgPath
    try {
      log(blogDirPath)
      blogDir = await mkdir(path.resolve(blogDirPath), { recursive: true })
      if (blogDir !== false) {
        log(`blogDir exists?: (${blogDir}) ${blogDirPath}`)
      }
      if (ctx.request?.files && ctx.request.files?.headerImageSmall) {
        const originalNameSmall = ctx.request.files.headerImageSmall[0].originalFilename
        smallImg = path.resolve(blogDirPath, originalNameSmall)
        await rename(ctx.request.files.headerImageSmall[0].filepath, smallImg)
        smallImgPath = `${ctx.state.sessionUser.publicDir}blog/${originalNameSmall}`
      }
      if (ctx.request?.files && ctx.request.files?.headerImageBig) {
        const originalNameBig = ctx.request.files.headerImageBig[0].originalFilename
        bigImg = path.resolve(blogDirPath, originalNameBig)
        bigImgPath = `${ctx.state.sessionUser.publicDir}blog/${originalNameBig}`
        await rename(ctx.request.files.headerImageBig[0].filepath, bigImg)
      }
    } catch (e) {
      const msg = `Failed to create (or it doesn't exist) ${blogDirPath}`
      error(msg)
      error(e)
      throw new Error(msg, { cause: e })
    }
    try {
      const db = ctx.state.mongodb.client.db()
      const o = {
        newBlog: (!blogId?.length),
        blogOwnerId: ctx.state.sessionUser.id,
        blogOwnerName: ctx.state.sessionUser.username,
        blogId,
        blogTitle,
        blogDescription,
        blogKeywords,
        public: blogPublic,
      }
      if (smallImgPath) {
        o.headerImageSmall = smallImgPath
      }
      if (bigImgPath) {
        o.headerImageBig = bigImgPath
      }
      if (!blogId) {
        blog = await Blogs.newBlog(db, o, ioredis)
        blog.url = blogTitle
      } else {
        blog = await Blogs.getById(db, blogId, ioredis)
        blog.public = blogPublic
        blog.title = blogTitle
        blog.url = blogTitle
        blog.description = blogDescription
        blog.keywords = blogKeywords
        if (smallImgPath) {
          blog.headerImageSmall = smallImgPath
        }
        if (bigImgPath) {
          blog.headerImageBig = bigImgPath
        }
      }
      const saved = await blog.save()
      log(`blog slug: ${blog.url}`)
      status = 200
      body = { status: 'ok', saved, blog }
    } catch (e) {
      error(e)
      status = 500
      body = { msg: 'failed to update blog.' }
    }
  }
  ctx.status = status
  ctx.type = 'application/json; charset=utf-8'
  ctx.body = body
})

router.get('accountListBlogPosts', '/account/blog/posts', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-account-blog-list')
  const error = accountError.extend('GET-account-blog-list')
  if (!isAsyncRequest(ctx)) {
    ctx.status = 400
    ctx.redirect('/')
  }
  let body
  let status
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  }
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  if (!doTokensMatch(ctx)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    const csrfToken = ulid()
    ctx.session.csrfToken = csrfToken
    ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
    try {
      const db = ctx.state.mongodb.client.db()
      //
      // TODO: implement Blogs.getByCreator() method
      //
      const blog = await Blogs.getByCreator(db, ctx.state.sessionUser.username, ioredis)
      const posts = await blog.getPosts()
      log(`blog slug: ${blog.url}`)
      status = 200
      body = { status: 'ok', posts }
    } catch (e) {
      error(e)
      status = 500
      body = { msg: 'failed to get blog posts.' }
    }
  }
  ctx.status = status
  ctx.type = 'application/json; charset=utf-8'
  ctx.body = body
})

router.post(
  'accountBlogPostNew-POST',
  '/account/blog/post/save',
  hasFlash,
  processFormData,
  async (ctx) => {
  const log = accountLog.extend('POST-account-blog-post-save')
  const error = accountError.extend('POST-account-blog-post-save')
  if (!ctx.state.isAsyncRequest) {
    error('Tried to directly access route rather than via async request.')
    ctx.status = 400
    ctx.redirect('/')
  }
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  }
  let status
  let body
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  if (!doTokensMatch(ctx)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.status = 401
  } else {
    log(ctx.request.body)
    log(ctx.request.files)
    let blog
    let post
    let createPostAlbum
    let album
    let smallImg
    const postId = ctx.request.body?.postId[0] ?? null
    const blogId = ctx.request.body?.blogId[0] ?? null
    const postTitle = ctx.request.body?.postTitle?.[0] ?? null
    const postSlug = (ctx.request.body?.postSlug?.[0] === '')
      ? slugify(postTitle)
      : slugify(ctx.request.body.postSlug[0])
    const postDescription = ctx.request.body?.postDescription?.[0] ?? null
    const postContent = ctx.request.body?.postContent?.[0] ?? null
    const postKeywords = (ctx.request.body?.postKeywords)
      ? Array.from(ctx.request.body.postKeywords[0].split(','))
      : []
    const postPublic = (ctx.request.body?.postPublic)
      ? ((ctx.request.body.postPublic[0] === 'true') ? true : false)
      : false
    if (ctx.request.files?.postPreviewImageSmall) {
      [smallImg] = ctx.request.files.postPreviewImageSmall
      const originalNameSmall = smallImg.originalFilename
      log(originalNameSmall)
      createPostAlbum = true
    }
    try {
      blog = await Blogs.getById(ctx.state.mongodb.client.db(), blogId, ioredis)
      log(`${blog}`)
      if (!postId) {
        const newPost = {
          postAuthors: [{
            author: ctx.state.sessionUser.username,
            id: ctx.state.sessionUser.id,
          }],
          postTitle,
          postDescription,
          postContent,
          postKeywords,
          postSlug,
        }
        if (createPostAlbum) {
          newPost.postAlbumName = postSlug
        }
        post = await blog.createPost(newPost)
        log('finally, newly created post: ', post.id)
        const c = {
          owner: ctx.state.sessionUser.username,
          rootDir: `${ctx.app.root}/public/${ctx.state.sessionUser.publicDir}galleries/`,
          collection: ctx.state.mongodb.client.db().collection('albums'),
        }
        log('creating post album config: ', c)
        album = await post.createAlbum(c)
        const save = await album.save()
        log(`first album save: ${album}`)
        log(save)
        log(`album id? ${album.id}`)
        post.albumId = album.id
        log(`${post}`)
        //
        // @TODO: either make image optional and test for its presence,
        // OR, enforce required image in browser and prevent form submission
        // if no image is selected.
        //
        // @see https://github.com/mattduffy/koa-stub/issues/8 for additional
        // problems.
        //
        const originalFilenameCleaned = sanitizeFilename(smallImg.originalFilename)
        const newImageAlbumDirPath = path.join(album.albumDir, originalFilenameCleaned)
        log('uploaded filepath:                 ', smallImg.filepath)
        log('uploaded originalFilename:         ', smallImg.originalFilename)
        log('uploeded originalFilename cleaned: ', originalFilenameCleaned)
        log('new img + album dir path:          ', newImageAlbumDirPath)
        try {
          await rename(smallImg.filepath, newImageAlbumDirPath)
          await stat(newImageAlbumDirPath)
        } catch (e) {
          const msg = `Failed to move ${smallImg.originalFilename} `
            + `into album dir: ${album.albumDir}`
          error(msg)
          error(e)
          ctx.type = 'application/json; charset=utf-8'
          status = 500
          body = { status: 500, msg, cause: e.message }
        }
        const skipSizes = true
        const result = await album.addImage(newImageAlbumDirPath, skipSizes)
        log('addImage result: ', result)
        const url = `${album.imageUrl}/${originalFilenameCleaned}`
        post.previewImg = url
        const saved = await post.save()
        log(saved)
        log(`${post}`)
        const update = {
          id: post.id,
          title: post.title,
          slug: post.slug,
          createOn: post.createdOn,
          editedOn: post.editedOn,
          public: post.public,
          img: post.previewImg,
        }
        const x = await blog.updatePostArray(update)
        log(`${x}`)
        log(await album.save())
      } else {
        log(`updating existing blog post: ${postId}, ${postTitle}`)
        const updatePost = {
          _id: postId,
          blogId,
          postTitle,
          postDescription,
          postContent,
          postKeywords,
          postSlug,
          postPublic,
        }
        log(updatePost)
        post = await blog.updatePost(updatePost)
        log('updated post: ', post.id, post.title, post.slug)
      }
      status = 200
      body = { msg: 'sucess', post: post.postJson }
    } catch (e) {
      error(e)
      status = 500
      body = { msg: 'Failed to create new post.' }
    }
  }
  ctx.status = status
  ctx.type = 'application/json; charset=utf-8'
  ctx.body = body
})

router.get('accountBlogPostNew', '/account/blog/post/new', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-account-blog-post-new')
  const error = accountError.extend('GET-account-blog-post-new')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    log(`Creating ${ctx.state.sessionUser.username}'s blog post.`)
    log('flash %O', ctx.flash)
    const db = ctx.state.mongodb.client.db()
    // Get list of blogs, if they exist
    const { username } = ctx.state.sessionUser
    log(`username for blog owner: ${username}`)
    const blog = await Blogs.getByUsername(db, username, ioredis) ?? {}
    log(`found ${username}'s blog: ${blog.name}`)
    const post = {}
    const csrfToken = ulid()
    ctx.session.csrfToken = csrfToken
    ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
    const locals = {
      sessionUser: ctx.state.sessionUser,
      blog,
      post,
      body: ctx.body,
      view: ctx.flash.view ?? {},
      edit: ctx.flash.edit ?? {},
      // origin: `${ctx.request.origin}`,
      jwtAccess: (ctx.state.sessionUser.jwts).token,
      csrfToken,
      isAuthenticated: ctx.state.isAuthenticated,
      title: `${ctx.app.site}: New Blog Post`,
    }
    ctx.status = 200
    await ctx.render('account/user-blog-post-new', locals)
  }
})

router.get('accountBlogPostNew', '/account/blog/post/:id', hasFlash, async (ctx) => {
  const log = accountLog.extend(`GET-account-blog-post-${ctx.params.id}`)
  const error = accountError.extend(`GET-account-blog-post-${ctx.params.id}`)
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    log(`Editing ${ctx.state.sessionUser.username}'s blog post.`)
    log('flash %O', ctx.flash)
    const db = ctx.state.mongodb.client.db()
    // Get list of blogs, if they exist
    const { username } = ctx.state.sessionUser
    const blog = await Blogs.getByUsername(db, username, ioredis) ?? {}
    log(`found ${username}'s blog: ${blog.title}`)
    const post = await blog.getPost(ctx.params.id)
    if (!post) {
      throw new Error()
    }
    const csrfToken = ulid()
    ctx.session.csrfToken = csrfToken
    ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
    const locals = {
      sessionUser: ctx.state.sessionUser,
      blog,
      post,
      body: ctx.body,
      view: ctx.flash.view ?? {},
      edit: ctx.flash.edit ?? {},
      // origin: `${ctx.request.origin}`,
      jwtAccess: (ctx.state.sessionUser.jwts).token,
      csrfToken,
      isAuthenticated: ctx.state.isAuthenticated,
      title: `${ctx.app.site}: New Blog Post`,
    }
    ctx.status = 200
    await ctx.render('account/user-blog-post-edit', locals)
  }
})

router.get('accountEditGallery', '/account/gallery/:id', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-account-galleries-edit')
  const error = accountError.extend('GET-account-galleries-edit')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else if (ctx.cookies.get('csrfToken') !== ctx.session.csrfToken) {
    error(
      `CSR-Token mismatch: header:${ctx.cookies.get('csrfToken')} - `
      + `session:${ctx.session.csrfToken}`
    )
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    const csrfToken = ulid()
    ctx.session.csrfToken = csrfToken
    ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
    const db = ctx.state.mongodb.client.db()
    const album = await Albums.getById(db, ctx.params.id, ioredis)
    log(album)
    log(`album keywords: ${album.keywords}`)
    const locals = {
      album,
      sesseionUser: ctx.state.sessionUser,
      body: ctx.body,
      view: ctx.flash.view ?? {},
      edit: ctx.flash.edit ?? {},
      // origin: `${ctx.request.origin}`,
      jwtAccess: (ctx.state.sessionUser.jwts).token,
      csrfToken,
      title: `${ctx.app.site}: View ALbum Details`,
    }
    await ctx.render('account/user-gallery-edit', locals)
  }
})

router.delete(
  'deleteGalleryImage',
  '/account/gallery/:id/image/delete',
  processFormData,
  async (ctx) => {
  const log = accountLog.extend('DELETE-account-gallery-image-delete')
  const error = accountError.extend('DELETE-account-gallery-image-delete')
  if (!ctx.state.isAsyncRequest) {
    ctx.status = 400
    ctx.redirect('/')
  }
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  }
  log(`album id: ${ctx.params.id}`)
  log(ctx.request.body)
  log(ctx.request.files)
  let status
  let body
  let album
  const albumId = ctx.params.id
  const image = ctx.request.body.image[0]
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  if (!doTokensMatch(ctx)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    try {
      const db = ctx.state.mongodb.client.db()
      album = await Albums.getById(db, albumId, ioredis)
      log(image)
      log(album)
      const deleted = await album.deleteImage(image)
      status = 200
      body = { deleted }
    } catch (e) {
      error(e)
      status = 500
      body = { status: 500, err: 'album failure.' }
    }
  }

  ctx.status = status
  ctx.type = 'application/json; charset=utf-8'
  ctx.body = body
})

router.put(
  'accountGalleryAddImage',
  '/account/gallery/:id/image/add',
  processFormData,
  async (ctx) => {
  const log = accountLog.extend('PUT-account-gallery-image-add')
  const error = accountError.extend('PUT-account-gallery-imageadd')
  if (!ctx.state.isAsyncRequest) {
    ctx.status = 400
    ctx.redirect('/')
  }
  let status
  let body
  let album
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    log(`album id: ${ctx.params.id}`)
    log(`image name: ${ctx.params.name}`)
    log(ctx.request.body)
    log(ctx.request.files)
    const albumId = ctx.params.id
    const image = ctx.request.files.image[0]
    // log(image)
    const originalFilenameCleaned = sanitizeFilename(image.originalFilename)
    const originalFilenamePath = path.resolve(
      ctx.app.dirs.private.uploads, originalFilenameCleaned
    )
    log('uploaded filepath:             ', image.filepath)
    log('uploaded originalFilename:     ', image.originalFilename)
    log('uploaded originalFilenamePath: ', originalFilenamePath)
    const csrfTokenCookie = ctx.cookies.get('csrfToken')
    const csrfTokenSession = ctx.session.csrfToken
    if (!doTokensMatch(ctx)) {
      error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
      ctx.status = 401
      ctx.body = { error: 'csrf token mismatch' }
    } else {
      let albumDir
      let newImageAlbumDirPath
      try {
        const db = ctx.state.mongodb.client.db().collection('albums')
        album = await Albums.getById(db, albumId, ioredis)
        albumDir = album.albumDir
        log(`albumDir: ${albumDir}`)
        newImageAlbumDirPath = path.join(albumDir, originalFilenameCleaned)
      } catch (e) {
        const err = `Failed to initialize album id: ${albumId}`
        error(err)
        ctx.type = 'application/json; charset=utf-8'
        status = 500
        body = { status: 500, err, cause: e.message }
        return
      }
      try {
        log(`newImageAlbumDirPath: ${newImageAlbumDirPath}`)
        await rename(image.filepath, newImageAlbumDirPath)
      } catch (e) {
        const err = `Failed to rename uploaded image back to its original name `
        + `${originalFilenamePath}, and move to album dir ${newImageAlbumDirPath}.`
        error(err)
        ctx.type = 'application/json; charset=utf-8'
        status = 500
        body = { status: 500, err, cause: e.message }
        return
      }
      let result
      try {
        result = await album.addImage(newImageAlbumDirPath)
        status = 200
        body = { result }
        log(body)
      } catch (e) {
        const err = 'Failed to add new iamge to album.'
        error(err)
        ctx.type = 'application/json; charset=utf-8'
        status = 500
        body = { status: 500, err, cause: e.message }
        return
      }
    }
  }
  ctx.status = status
  ctx.type = 'application/json; charset=utf-8'
  ctx.body = body
})

router.post(
  'accountEditGalleryImage',
  '/account/gallery/:id/image/:name',
  processFormData,
  async (ctx) => {
  const log = accountLog.extend('POST-account-gallery-image-edit')
  const error = accountError.extend('POST-account-gallery-image-edit')
  if (!ctx.state.isAsyncRequest) {
    ctx.status = 400
    ctx.redirect('/')
  }
  let status
  let body
  let album
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  }
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  if (!doTokensMatch(ctx)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    log(`album id: ${ctx.params.id}`)
    log(`image name: ${ctx.params.name}`)
    log(ctx.request.body)
    const albumId = ctx.params.id
    const fileName = ctx.params.name
    const imageName = ctx.request.body?.imageName?.[0] ?? null
    const imageRotateFullSize = ctx.request.body?.rotate_full_size_image?.[0] ?? null
    const thumbnailName = ctx.request.body?.thumbnailName?.[0] ?? null
    const imageRotateThumbnail = ctx.request.body?.rotate_thumbnail_image?.[0] ?? null
    const imageTitle = ctx.request.body?.imageTitle?.[0] ?? null
    const imageDescription = ctx.request.body?.imageDescription?.[0] ?? null
    let imageKeywords = null
    if (ctx.request.body?.imageKeywords) {
      imageKeywords = Array.from(ctx.request.body?.imageKeywords?.[0].split(', '))
    }
    let imageHide
    if (ctx.request.body?.imageHide[0] === 'false') {
      imageHide = false
    } else {
      imageHide = true
    }
    const csrfTokenCookie = ctx.cookies.get('csrfToken')
    const csrfTokenSession = ctx.session.csrfToken
    if (!doTokensMatch(ctx)) {
      error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
      ctx.status = 401
      ctx.body = { error: 'csrf token mismatch' }
    } else {
      try {
        const db = ctx.state.mongodb.client.db().collection('albums')
        album = await Albums.getById(db, albumId, ioredis)
        const i = {}
        i.name = imageName
        if (imageRotateFullSize) {
          log(`Rotate full size image ${imageName} counter-clockwise ${imageRotateFullSize}`)
          i.rotateFullSize = imageRotateFullSize
        }
        if (imageRotateThumbnail && thumbnailName) {
          log(
            `Rotate thumbnail image ${thumbnailName} counter-clockwise ${imageRotateThumbnail}`
          )
          i.thumbnailName = thumbnailName
          i.rotateThumbnail = imageRotateThumbnail
        }
        if (imageTitle) {
          i.title = imageTitle
        }
        if (imageDescription) {
          i.description = imageDescription
        }
        if (imageKeywords) {
          i.keywords = imageKeywords
        }
        i.hide = imageHide
        log('new image details: %o', i)
        const sizes = (!!imageRotateFullSize || !!imageRotateThumbnail)
        log(`sizes, if TRUE, remake thumbs: ${sizes}`)
        // const saved = await album.updateImage(i, sizes)
        const saved = await album.updateImage(i, false)
        log(saved)
        if (!saved) {
          status = 418
          body = { err: `Failed to update image: ${fileName}` }
        } else {
          status = 200
          body = saved
        }
      } catch (e) {
        error(e)
        status = 500
        body = { msg: `failed to find album with id: ${albumId}` }
      }
    }
  }
  // ctx.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  ctx.status = status
  ctx.type = 'application/json; charset=utf-8'
  ctx.body = body
})

router.post(
  'accountEditGallery',
  '/account/gallery/:id',
  hasFlash,
  processFormData,
  async (ctx) => {
  const log = accountLog.extend('POST-account-gallery-edit')
  const error = accountError.extend('POST-account-gallery-edit')
  if (!ctx.state.isAsyncRequest) {
    ctx.status = 400
    ctx.redirect('/')
  }
  let status
  let body
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else if (ctx.cookies.get('csrfToken') !== ctx.session.csrfToken) {
    error(
      `CSR-Token mismatch: header:${ctx.cookies.get('csrfToken')} - `
      + `session:${ctx.session.csrfToken}`
    )
    status = 401
    body = { error: 'csrf token mismatch' }
  } else {
    log(`album id: ${ctx.params.id}`)
    log(ctx.request.body)
    let album
    const albumId = ctx.params.id
    const albumName = ctx.request.body?.albumName?.[0] ?? null
    const albumSlug = ctx.request.body?.albumSlug?.[0] ?? slugify(albumName)
    const albumDescription = ctx.request.body?.albumDescription?.[0] ?? ''
    const albumPublic = (ctx.request.body?.albumPublic?.[0] === 'true') ?? false
    const albumKeywords = (ctx.request.body?.albumKeywords)
      ? Array.from(ctx.request.body?.albumKeywords?.[0]?.split(', '))
      : []
    const albumPreviewImage = ctx.request.body?.albumPreviewImage?.[0] ?? null
    const csrfTokenCookie = ctx.cookies.get('csrfToken')
    const csrfTokenSession = ctx.session.csrfToken
    if (!doTokensMatch(ctx)) {
      error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
      ctx.status = 401
      ctx.body = { error: 'csrf token mismatch' }
    } else {
      try {
        const db = ctx.state.mongodb.client.db().collection('albums')
        album = await Albums.getById(db, albumId, ioredis)
        if (album.name !== albumName) {
          log(`updating album name from: ${album.name} to: ${albumName}`)
          album.name = albumName
        }
        if (album.slug !== albumSlug) {
          log(`updating album slug from: ${album.slug} to: ${albumSlug}`)
          album.slug = albumSlug
        }
        if (album.description !== albumDescription) {
          log(`updating album description from: ${album.description} to: ${albumDescription}`)
          album.description = albumDescription
        }
        if (album.public !== albumPublic) {
          log(`updating album public from: ${album.public} to: ${albumPublic}`)
          album.public = albumPublic
        }
        if (album.keywords !== albumKeywords) {
          log(`updating album keywords from: ${album.keywords} to: ${albumKeywords}`)
          album.keywords = albumKeywords
        }
        if (album.previewImage !== albumPreviewImage) {
          log(`updating album preview image from: ${album.previewImage} to ${albumPreviewImage}`)
          album.previewImage = albumPreviewImage
        }
        const saved = await album.save()
        log(saved)
        if (!saved) {
          status = 500
          body = { huh: 'whut?', msg: `failed to update album id:${ctx.params.id}` }
        } else {
          status = 200
          body = saved
          try {
            const displayUser = ctx.state.sessionUser
            const locals = {
              caching: true,
              view: ctx.flash.view ?? {},
              // sessionUser: ctx.state.sessionUser,
              sessionUser: {},
              isAuthenticated: ctx.state.isAuthenticated,
              displayUser: displayUser ?? {},
              body: ctx.body,
              album,
              title: `${ctx.app.site}: ${displayUser.username}'s gallery, ${album.name}`,
            }
            log(locals)
            const renderedPage = await ctx.render('account/user-gallery-public', locals)
            const dir = path.join(ctx.app.dirs.cache.pages, `@${displayUser.username}/gallery`)
            log(dir)
            await mkdir(dir, { recursive: true })
            const written = await writeFile(`${dir}/${album.id}`, renderedPage)
            log('cached page was written to cache dir? ', written)
          } catch (e) {
            error('failed to create a cached version of gallery page after edit.')
            error(e)
          }
        }
      } catch (e) {
        error(e)
        status = 500
        body = { msg: `failed to find album with id: ${albumId}` }
      }
    }
  }
  ctx.status = status
  ctx.type = 'application/json; charset=utf-8'
  ctx.body = body
})

router.get('accountGalleries', '/account/galleries', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-account-galleries')
  const error = accountError.extend('GET-account-galleries')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    log(`View ${ctx.state.sessionUser.username}'s account details.`)
    log('flash %O', ctx.flash)
    const db = ctx.state.mongodb.client.db()
    // Get list of albums, if they exist
    const albumList = await Albums.list(db, ctx.state.sessionUser.username)
    log(albumList)
    let pub
    let pri
    albumList.forEach((list) => {
      if (list._id === 'public') {
        pub = list.albums
        log('public albums: ', pub[0])
      }
      if (list._id === false) {
        pri = list.albums
        log('private albums: ', pri)
      }
    })
    const csrfToken = ulid()
    ctx.session.csrfToken = csrfToken
    ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
    const locals = {
      sessionUser: ctx.state.sessionUser,
      body: ctx.body,
      view: ctx.flash.view ?? {},
      edit: ctx.flash.edit ?? {},
      // origin: `${ctx.request.origin}`,
      jwtAccess: (ctx.state.sessionUser.jwts).token,
      csrfToken,
      public: pub,
      private: pri,
      isAuthenticated: ctx.state.isAuthenticated,
      title: `${ctx.app.site}: View Account Details`,
    }
    ctx.status = 200
    await ctx.render('account/user-galleries', locals)
  }
})

router.delete(
  'deleteGallery',
  '/account/galleries/delete/:id',
  processFormData,
  async (ctx) => {
  const log = accountLog.extend('DELETE-account-galleries-delete')
  const error = accountError.extend('DELETE-account-galleries-delete')
  if (!isAsyncRequest(ctx)) {
    ctx.status = 400
    ctx.redirect('/')
  }
  let body
  let status
  let type
  if (!ctx.state?.isAuthenticated) {
    ctx.flash = {
      index: {
        message: null,
        error: 'You need to be logged in to make account changes.',
      },
    }
    error('Tried to delete an album archive without first being authenticated.')
    ctx.redirect('/')
  } else {
    log('ctx.fields: %o', ctx.request.body)
    log('ctx.files: %o', ctx.request.files)
    let album
    const albumId = ctx.request.body?.albumId?.[0] ?? ''
    const csrfTokenCookie = ctx.cookies.get('csrfToken')
    const csrfTokenSession = ctx.session.csrfToken
    if (!doTokensMatch(ctx)) {
      error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
      ctx.status = 401
      ctx.body = { error: 'csrf token mismatch' }
    } else {
      try {
        const db = ctx.state.mongodb.client.db().collection('albums')
        album = await Albums.getById(db, albumId, ioredis)
        const deleted = await album.deleteAlbum()
        status = 200
        if (deleted === undefined) {
          body = { msg: `Album ${albumId} was permanently deleted.`, deleted: true }
        } else {
          body = { msg: `Album ${albumId} was not deleted.`, deleted: false }
        }
      } catch (e) {
        error(`Failed to delete album ${albumId}`)
        error(e)
        status = 500
        type = 'application/json; charset=utf-8'
        body = { err: e }
      }
    }
  }
  ctx.status = status
  ctx.type = type
  ctx.body = body
})

router.put('accountGalleriesAdd', '/account/galleries/add', processFormData, async (ctx) => {
  const log = accountLog.extend('PUT-account-galleries-add')
  const error = accountError.extend('PUT-account-galleries-add')
  log(ctx.request.body)
  if (!ctx.state?.isAuthenticated) {
    ctx.flash = {
      index: {
        message: null,
        error: 'You need to be logged in to make account changes.',
      },
    }
    error('Tried to upload an album archive without first being authenticated.')
    ctx.redirect('/')
  }
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  if (!doTokensMatch(ctx)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    log('ctx.fields: %o', ctx.request.body)
    // log('ctx.files: %o', ctx.request.files)
    log('uploaded filepath: ', ctx.request.files?.PersistentFile?.filepath)
    log('uploaded originalFilename: ', ctx.request.files?.PersistentFile?.originalFilename)
    let albumName = ctx.request.body?.albumName?.[0] ?? null
    const albumNameDir = (albumName) ? slugify(albumName) : null
    const albumDescription = ctx.request.body?.albumDescription?.[0] ?? ''
    const albumPublic = (ctx.request.body?.albumPublic?.[0] === 'true') ?? false
    let unpacker
    let extracted
    let newPath
    let album
    const galleries = 'galleries'
    const db = ctx.state.mongodb.client.db()
    // const userPubDir = ctx.state.sessionUser.publicDir
    const archive = ctx.request.files.archive[0]
    const originalFilenameCleaned = sanitizeFilename(archive.originalFilename)
    const originalFilenamePath = path.resolve(
      ctx.app.dirs.private.uploads, originalFilenameCleaned
    )
    try {
      await rename(archive.filepath, originalFilenamePath)
    } catch (e) {
      error(e)
      throw new Error(
        'Failed to rename uploaded archive back to its original name.',
        { cause: e },
      )
    }
    log(archive)
    if (archive.size > 0) {
      let newName = null
      newPath = path.resolve(
        ctx.app.dirs.public.dir,
        ctx.state.sessionUser.publicDir,
        galleries,
      )
      try {
        log(`uploads: ${ctx.app.dirs.private.uploads}`)
        log(`username: ${ctx.state.sessionUser.username}`)
        log(`       |-publicDir: ${ctx.state.sessionUser.publicDir}`)
        log(`       |-privateDir: ${ctx.state.sessionUser.privateDir}`)
        log(`       |-newPath: ${newPath}`)
        log(`archive: ${archive.filepath}`)
        log(`archive: ${originalFilenamePath}`)
        log(`       |-originalFilename: ${originalFilenamePath}`)
        log(`albumName: ${albumName}`)
        log(`albumNameDir: ${albumNameDir}`)
        unpacker = new Unpacker()
        await unpacker.setPath(originalFilenamePath)
        if (albumNameDir) {
          newName = { rename: true, newName: albumNameDir }
          log('renaming the gallery directory name: ', newName)
        } else {
          albumName = unpacker.getFileBasename()
        }
      } catch (e) {
        ctx.status = 500
        ctx.type = 'application/json; charset=utf-8'
        ctx.body = { status: 500, step: 'unpack setup', _error: e.message }
      }
      try {
        extracted = await unpacker.unpack(newPath, null, newName)
        log('extraction results: ', extracted)
      } catch (e) {
        ctx.status = 500
        ctx.type = 'application/json; charset=utf-8'
        ctx.body = { status: 500, step: 'unpack extraction', _error: e.message }
      }
      try {
        const config = {
          new: true,
          ioredis,
          collection: db.collection('albums'),
          rootDir: newPath,
          albumUrl: `${ctx.state.sessionUser.url}/${galleries}/${albumNameDir}`,
          albumImageUrl: `${ctx.state.sessionUser.publicDir}${galleries}/${albumNameDir}/`,
          albumName,
          albumSlug: albumNameDir,
          albumOwner: ctx.state.sessionUser.username,
          albumDescription,
          public: albumPublic,
        }
        album = new Album(config)
        log(`init'ing album with ${extracted.finalPath}`)
        album = await album.init(extracted.finalPath)
      } catch (e) {
        log(e.message)
        ctx.status = 500
        ctx.type = 'application/json; charset=utf-8'
        ctx.body = { status: 500, step: 'album init', _error: e.message }
      }
      try {
        const saved = await album.save()
        log('was the album saved?: %o', saved)
        ctx.body = {
          albumId: album.id,
          albumName: album.name,
          albumSlug: album.slug,
          albumUrl: album.url,
          albumOwner: album.owner,
          albumDescription: album.description,
          public: album.public,
        }
      } catch (e) {
        log(e.message)
        ctx.status = 500
        ctx.type = 'application/json; charset=utf-8'
        ctx.body = { status: 500, step: 'album save', _error: e.message }
      }
    }
    ctx.status = 200
    ctx.type = 'application/json; charset=utf-8'
  }
})

router.get('accountUsernamePublicGalleries', '/:username/galleries', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-account-Username-Public-Galleries')
  const error = accountError.extend('GET-account-Username-Public-Galleries')
  let { username } = ctx.params
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
  let publicList
  try {
    const db = ctx.state.mongodb.client.db().collection('albums')
    const albumLists = await Albums.list(db, username)
    if (albumLists[0]._id === 'public') {
      publicList = albumLists[0].albums
    } else if (albumLists[1]._id === 'public') {
      publicList = albumLists[1].albums
    } else {
      publicList = []
    }
    log(publicList)
  } catch (e) {
    error(`Failed to find any public galleries for @${username}`)
    error(e)
  }
  const locals = {}
  locals.sessionUser = ctx.state.sessionUser
  locals.isAuthenticated = ctx.state.isAuthenticated
  locals.view = ctx.flash.view ?? {}
  locals.displayUser = displayUser
  locals.body = ctx.body
  locals.public = publicList
  locals.title = `${ctx.app.site}: ${displayUser.username}'s galleries`
  await ctx.render('account/user-galleries-public', locals)
})

router.get('accountView', '/account/view', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-account-view')
  const error = accountError.extend('GET-account-view')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    log(`View ${ctx.state.sessionUser.username}'s account details.`)
    log('flash %O', ctx.flash)
    const locals = {
      sessionUser: ctx.state.sessionUser,
      body: ctx.body,
      edit: ctx.flash.edit ?? {},
      // origin: `${ctx.request.origin}`,
      // csrfToken: new ObjectId().toString(),
      csrfToken: ulid(),
      isAuthenticated: ctx.state.isAuthenticated,
      defaultAvatar: '/i/accounts/avatars/missing.png',
      defaultHeader: '/i/accounts/headers/generic.png',
      title: `${ctx.app.site}: View Account Details`,
    }
    ctx.status = 200
    await ctx.render('account/user-details-view', locals)
  }
})

router.get('accountEdit', '/account/edit', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-account-edit')
  const error = accountError.extend('GET-account-edit')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    log(`Edit ${ctx.state.sessionUser.username}'s account details.`)
    // const csrfToken = new ObjectId().toString()
    const csrfToken = ulid()
    log(ctx.flash)
    const locals = {
      sessionUser: ctx.state.sessionUser,
      body: ctx.body,
      edit: ctx.flash.edit ?? {},
      csrfToken,
      isAuthenticated: ctx.state.isAuthenticated,
      title: `${ctx.app.site}: Edit Account Details`,
    }
    ctx.session.csrfToken = csrfToken
    ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
    ctx.status = 200
    await ctx.render('account/user-details-edit', locals)
  }
})

router.post('accountEditPost', '/account/edit', hasFlash, processFormData, async (ctx) => {
  const log = accountLog.extend('POST-account-edit')
  const error = accountError.extend('POST-account-edit')
  if (!isAsyncRequest(ctx)) {
    ctx.status = 400
    ctx.redirect('/')
  }
  if (!ctx.state?.isAuthenticated) {
    ctx.flash = {
      index: {
        message: null,
        error: 'You need to be logged in to make account changes.',
      },
    }
    error('Tried to edit account without being authenticated.')
    ctx.redirect('/')
  } else {
    log('ctx.fields: %O', ctx.request.body)
    log('ctx.files: %O', ctx.request.files)
    const csrfTokenCookie = ctx.cookies.get('csrfToken')
    const csrfTokenSession = ctx.session.csrfToken
    if (!doTokensMatch(ctx)) {
      error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
      ctx.status = 401
      ctx.body = { error: 'csrf token mismatch' }
    } else {
      // const { firstname } = ctx.request.body
      const [firstname] = ctx.request.body.firstname
      if (firstname !== '') ctx.state.sessionUser.firstName = firstname
      const [lastname] = ctx.request.body.lastname
      if (lastname !== '') ctx.state.sessionUser.lastName = lastname
      const [username] = ctx.request.body.username
      if (username !== '') {
        if (username !== ctx.state.sessionUser.username) {
          if (ctx.state.sessionUser.isUsernameAvailable(username)) {
            ctx.state.sessionUser.username = username
            ctx.state.sessionUser.url = `@${username}`
            // const { url } = ctx.request.body
            // if (url !== '') {
            //   ctx.state.sessionUser.url = url
            // }
          } else {
            ctx.flash = {
              edit: {
                info: null,
                message: null,
                error: `${username} is not available.`,
              },
            }
            ctx.redirect('/account/edit')
          }
        }
      }
      const [displayname] = ctx.request.body.displayname
      if (displayname !== '') ctx.state.sessionUser.displayName = displayname
      const [primaryEmail] = ctx.request.body.primaryEmail
      if (primaryEmail !== '') ctx.state.sessionUser.primarEmail = primaryEmail
      const [secondaryEmail] = ctx.request.body.secondaryEmail
      if (secondaryEmail !== '') ctx.state.sessionUser.secondaryEmail = secondaryEmail
      const [description] = ctx.request.body.description
      if (description !== '') ctx.state.sessionUser.description = description
      if (ctx.request.body.isLocked) {
        const [isLocked] = ctx.request.body.isLocked
        if (isLocked === 'on') {
          ctx.state.sessionUser.locked = true
        } else {
          ctx.state.sessionUser.locked = false
        }
      }
      if (ctx.request.body.isBot) {
        const [isBot] = ctx.request.body.isBot
        if (isBot === 'on') {
          ctx.state.sessionUser.bot = true
        } else {
          ctx.state.sessionUser.bot = false
        }
      }
      if (ctx.request.body.isGroup) {
        const [isGroup] = ctx.request.body.isGroup
        if (isGroup === 'on') {
          ctx.state.sessionUser.group = true
        } else {
          ctx.state.sessionUser.group = false
        }
      }
      if (ctx.request.body.isDiscoverable) {
        const [isDiscoverable] = ctx.request.body.isDiscoverable
        if (isDiscoverable === 'on') {
          ctx.state.sessionUser.discoverable = true
        } else {
          ctx.state.sessionUser.discoverable = false
        }
      }
      if (ctx.state.sessionUser.publicDir === '') {
        // log('users ctx: %O', ctx.state.sessionUser._ctx)
        log(`${ctx.state.sessionUser.username} - no upload directory set yet, setting it now.`)
        ctx.state.sessionUser.publicDir = 'a'
      }
      const [avatar] = ctx.request.files.avatar
      if (avatar.size > 0) {
        log('avatar file size:      %O', ctx.request.files.avatar[0].size)
        log('avatar file temp path: %O', ctx.request.files.avatar[0].filepath)
        const avatarOriginalFilenameCleaned = sanitizeFilename(avatar.originalFilename)
        const avatarSaved = path.resolve(
          `${ctx.app.dirs.public.dir}/${ctx.state.sessionUser.publicDir}`
          + `avatar-${avatarOriginalFilenameCleaned}`)
        try {
          await rename(avatar.filepath, avatarSaved)
        } catch (e) {
          error(e)
        }
        ctx.state.sessionUser.avatar = `${ctx.state.sessionUser.publicDir}`
          + `avatar-${avatarOriginalFilenameCleaned}`
      }
      const [header] = ctx.request.files.header
      if (header.size > 0) {
        log('header file size:      %O', ctx.request.files.header[0].size)
        log('header file temp path: %O', ctx.request.files.header[0].filepath)
        const headerOriginalFilenameCleaned = sanitizeFilename(header.originalFilename)
        const headerSaved = path.resolve(
          `${ctx.app.dirs.public.dir}/${ctx.state.sessionUser.publicDir}`
          + `header-${headerOriginalFilenameCleaned}`
        )
        try {
          log(headerSaved)
          await rename(header.filepath, headerSaved)
        } catch (e) {
          error(e)
        }
        ctx.state.sessionUser.header = `${ctx.state.sessionUser.publicDir}`
          + `header-${headerOriginalFilenameCleaned}`
      }
      try {
        ctx.state.sessionUser = await ctx.state.sessionUser.update()
        delete ctx.session.csrfToken
        ctx.cookies.set('csrfToken')
        ctx.cookies.set('csrfToken.sig')
        ctx.flash = {
          edit: {
            message: 'Account has been updated.',
            error: null,
          },
        }
        ctx.redirect('/account/view')
      } catch (e) {
        error(e)
        ctx.status = 304
        ctx.flash = {
          error: e,
          info: null,
          message: null,
        }
        ctx.redirect('/account/edit')
      }
    }
  }
})

router.get('account', '/account', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-account')
  const error = accountError.extend('GET-account')
  if (!ctx.state?.isAuthenticated) {
    ctx.flash = {
      index: {
        message: null,
        error: 'You need to be logged in to do that.',
      },
    }
    error('Tried to view something without being authenticated.')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    const locals = {
      sessionUser: ctx.state.sessionUser,
      body: ctx.body,
      // view: ctx.flash.view ?? {},
      flash: ctx.flash.index ?? {},
      // origin: `${ctx.request.origin}`,
      jwtAccess: (ctx.state.sessionUser.jwts).token,
      // csrfToken,
      isAuthenticated: ctx.state.isAuthenticated,
      title: `${ctx.app.site}: ${ctx.state.sessionUser.username}`,
    }
    log(locals)
    ctx.status = 200
    await ctx.render('account/user', locals)
  }
})

router.get('adminListUsers', '/admin/account/listusers', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-admin-listusers')
  const error = accountError.extend('GET-admin-listuers')
  if (!ctx.state?.isAuthenticated) {
    ctx.flash = {
      index: {
        message: null,
        error: 'You need to be logged in to do that.',
      },
    }
    error('Tried view something without being authenticated.')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    const locals = {}
    try {
      log(`Welcome admin level user: ${ctx.state.sessionUser.username}`)
      const db = ctx.state.mongodb.client.db()
      const collection = db.collection(USERS)
      const users = new Users(collection, ctx)
      const allUsers = await users.getAllUsers()
      // const csrfToken = new ObjectId().toString()
      const csrfToken = ulid()
      ctx.session.csrfToken = csrfToken
      ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
      locals.list = ctx.flash
      locals.jwtAccess = (ctx.state.sessionUser.jwts).token
      locals.csrfToken = csrfToken
      // locals.nonce = ctx.app.nonce
      // locals.origin = ctx.request.origin
      locals.title = `${ctx.app.site}: List Users`
      locals.isAuthenticated = ctx.state.isAuthenticated
      allUsers.map((u) => {
        locals[u._id] = u.users
        return undefined
      })
    } catch (e) {
      error('Error trying to retrieve list of all user accounts.')
      // ctx.throw('Error trying to retrieve list of all user accounts.')
      const err = new Error(
        'Error trying to retrieve list of all user accounts.',
        { cause: e }
      )
      ctx.throw(500, err)
    }
    await ctx.render('account/admin-listusers', locals)
  }
})

router.get('adminViewUser', '/admin/account/view/:username', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-admin-viewusers')
  const error = accountError.extend('GET-admin-viewusers')
  if (!ctx.state?.isAuthenticated) {
    ctx.flash = {
      index: {
        message: null,
        error: 'You need to be logged in to do that.',
      },
    }
    error('Tried view something without being authenticated.')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    const locals = {}
    try {
      let displayUser = ctx.params.username
      log(`Admin view of user: ${displayUser}`)
      // const db = ctx.state.mongodb.client.db()
      // const collection = db.collection(USERS)
      // const users = new Users(collection, ctx)
      log(ctx.state.mongodb.client.options.credentials)
      const users = new Users(ctx.state.mongodb, ctx)
      if (displayUser[0] === '@') {
        displayUser = displayUser.slice(1)
      }
      displayUser = await users.getByUsername(displayUser)
      const csrfToken = ulid()
      ctx.session.csrfToken = csrfToken
      ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
      // locals.nonce = ctx.app.nonce
      locals.csrfToken = csrfToken
      locals.displayUser = displayUser
      // log(displayUser)
      locals.view = ctx.flash.view ?? {}
      // locals.origin = ctx.request.origin
      locals.pageName = 'admin_account_view'
      // locals.privateDir = ctx.app.privateDir
      locals.privateDir = ctx.app.dirs.private.dir
      locals.isAuthenticated = ctx.state.isAuthenticated
      locals.jwtAccess = (ctx.state.sessionUser.jwts).token
      locals.title = `${ctx.app.site}: View ${ctx.params.username}`
      locals.defaultAvatar = '/i/missing.png'
      locals.defaultHeader = '/i/missing.png'
    } catch (e) {
      error(`Error trying to retrieve ${ctx.params.username}'s account.`)
      error(e)
      const err = new Error(
        `Error trying to retrieve ${ctx.params.username}'s account.`,
        { cause: e },
      )
      ctx.throw(500, err)
    }
    await ctx.render('account/admin-user-details-view', locals)
  }
})

router.get('adminEditUserGet', '/admin/account/edit/:username', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-admin-editusers')
  const error = accountError.extend('GET-admin-editusers')
  if (!ctx.state?.isAuthenticated) {
    ctx.flash = {
      index: {
        message: null,
        error: 'You need to be logged in to do that.',
      },
    }
    error('Tried to view something without being authenticated.')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    const locals = {}
    try {
      let displayUser = ctx.params.username
      log(`Admin edit of user ${displayUser}`)
      // const db = ctx.state.mongodb.client.db()
      // const collection = db.collection(USERS)
      // const users = new Users(collection, ctx)
      const users = new Users(ctx.state.mongodb, ctx)
      if (displayUser[0] === '@') {
        displayUser = displayUser.slice(1)
      }
      displayUser = await users.getByUsername(displayUser)
      locals.edit = ctx.flash.edit ?? {}
      locals.title = `${ctx.app.site}: Edit ${ctx.params.username}`
      // locals.origin = ctx.request.origin
      locals.isAuthenticated = ctx.state.isAuthenticated
      // const csrfToken = new ObjectId().toString()
      const csrfToken = ulid()
      ctx.session.csrfToken = csrfToken
      ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
      locals.csrfToken = csrfToken
      locals.displayUser = displayUser
    } catch (e) {
      error(`Error trying to retrieve ${ctx.params.username}'s account.`)
      error(e)
      // ctx.throw(500, `Error trying to retrieve ${ctx.params.username}'s account.`)
      const err = new Error(
        `Error trying to retrieve ${ctx.params.username}'s account.`,
        { cause: e }
      )
      ctx.throw(500, err)
    }
    await ctx.render('account/admin-user-details-edit', locals)
  }
})

router.post(
  'adminEditUserPost',
  '/admin/account/edit',
  hasFlash,
  processFormData,
  async (ctx) => {
  const log = accountLog.extend('POST-admin-editusers')
  const error = accountError.extend('POST-admin-editusers')
  if (!ctx.state?.isAuthenticated) {
    ctx.flash = {
      index: {
        info: null,
        message: null,
        error: 'You need to be logged in to do that.',
      },
    }
    error('Tried to edit an account without being authenticated.')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    try {
      const users = new Users(ctx.state.mongodb, ctx)
      const csrfTokenCookie = ctx.cookies.get('csrfToken')
      const csrfTokenSession = ctx.session.csrfToken
      if (!doTokensMatch(ctx)) {
        error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
        ctx.status = 401
        ctx.body = { error: 'csrf token mismatch' }
      } else {
        const [username] = ctx.request.body.username
        let displayUser = await users.getByUsername(username)
        if (username !== '') {
          if (username !== displayUser.username) {
            if (displayUser.isUsernameAvailable(username)) {
              displayUser.username = username
            } else {
              ctx.flash = {
                edit: {
                  info: null,
                  message: null,
                  error: `${username} is not available.`,
                },
              }
              ctx.redirect(`/admin/account/edit/@${displayUser.username}`)
            }
          }
        }
        log('ctx.request.body: %O', ctx.request.body)
        const [firstname] = ctx.request.body.firstname
        if (firstname !== '') displayUser.firstName = firstname
        const [lastname] = ctx.request.body.lastname
        if (lastname !== '') displayUser.lastName = lastname
        const [displayname] = ctx.request.body.displayname
        if (displayname !== '') displayUser.displayName = displayname
        const [primaryEmail] = ctx.request.body.primaryEmail
        if (primaryEmail !== '') displayUser.primarEmail = primaryEmail
        const [secondaryEmail] = ctx.request.body.secondaryEmail
        if (secondaryEmail !== '') displayUser.secondaryEmail = secondaryEmail
        const [description] = ctx.request.body.description
        if (description !== '') displayUser.description = description
        if (ctx.request.body?.userStatus) {
          const [userStatus] = ctx.request.body.userStatus
          if (userStatus === 'on') {
            displayUser.status = 'active'
          }
        } else {
          displayUser.status = 'inactive'
        }
        if (ctx.request.body.isLocked) {
          const [isLocked] = ctx.request.body.isLocked
          if (isLocked === 'on') {
            displayUser.locked = true
          }
        } else {
          displayUser.locked = false
        }
        if (ctx.request.body.isBot) {
          const [isBot] = ctx.request.body.isBot
          if (isBot === 'on') {
            displayUser.bot = true
          }
        } else {
          displayUser.bot = false
        }
        if (ctx.request.body.isGroup) {
          const [isGroup] = ctx.request.body.isGroup
          if (isGroup === 'on') {
            displayUser.group = true
          } else {
            displayUser.group = false
          }
        }
        if (ctx.request.body.isDiscoverable) {
          const [isDiscoverable] = ctx.request.body.isDiscoverable
          if (isDiscoverable === 'on') {
            ctx.state.sessionUser.discoverable = true
          } else {
            ctx.state.sessionUser.discoverable = false
          }
        }
        log('avatar file: %O', ctx.request.files.avatar.size)
        log('avatar file: %O', ctx.request.files.avatar.filepath)
        if (displayUser.publicDir === '') {
          // log('users ctx: %O', displayUser._ctx)
          log(`${displayUser.username} - no upload directory set yet, setting it now.`)
          displayUser.publicDir = 'a'
        }
        const { avatar } = ctx.request.files
        if (avatar.size > 0) {
          const avatarOriginalFilenameCleaned = sanitizeFilename(avatar.originalFilename)
          // const avatarSaved = path.resolve(
          //   `${ctx.app.dirs.public.dir}/${displayUser.publicDir}`
          //   + `avatar-${avatar.originalFilename}`
          // )
          const avatarSaved = path.resolve(
            `${ctx.app.dirs.public.dir}/${displayUser.publicDir}`
            + `avatar-${avatarOriginalFilenameCleaned}`)
          await rename(avatar.filepath, avatarSaved)
          // displayUser.avatar = `${displayUser.publicDir}avatar-${avatar.originalFilename}`
          displayUser.avatar = `${displayUser.publicDir}avatar-${avatarOriginalFilenameCleaned}`
        }
        // log('header file: %O', ctx.request.files.header)
        const { header } = ctx.request.files
        if (header.size > 0) {
          const headerOriginalFilenameCleaned = sanitizeFilename(header.originalFilename)
          // const headerSaved = path.resolve(
          //   `${ctx.app.dirs.public.dir}/${displayUser.publicDir}`
          //   + `header-${header.originalFilename}`
          // )
          const headerSaved = path.resolve(
            `${ctx.app.dirs.public.dir}/${displayUser.publicDir}`
            + `header-${headerOriginalFilenameCleaned}`
          )
          await rename(header.filepath, headerSaved)
          // displayUser.header = `${displayUser.publicDir}header-${header.originalFilename}`
          displayUser.header = `${displayUser.publicDir}header-${headerOriginalFilenameCleaned}`
        }
        const { url } = ctx.request.body
        if (url !== '') displayUser.url = url
        try {
          displayUser = await displayUser.update()
          ctx.flash = {
            view: {
              info: null,
              message: `${username}'s account has been updated.`,
              error: null,
            },
          }
        } catch (e) {
          error(e)
          // ctx.throw(400, e, 'Failed to update user account.')
          // const err = new Error('Failed to update user account.', { cause: e })
          // ctx.throw(400, err)
          ctx.flash = {
            view: {
              info: null,
              error: e,
              message: null,
            },
          }
        }
        delete ctx.session.csrfToken
        ctx.cookies.set('csrfToken')
        ctx.cookies.set('csrfToken.sig')
        ctx.redirect(`/admin/account/view/@${displayUser.username}`)
      }
    } catch (e) {
      error(e)
      // ctx.throw(500, 'Failed up update user\'s account.', e)
      const err = new Error('Failed up update user\'s account.', { cause: e })
      ctx.throw(500, err)
    }
  }
})

router.delete(
  'deleteUserAccount',
  '/admin/account/delete/:id',
  hasFlash,
  processFormData,
  async (ctx) => {
  const log = accountLog.extend('POST-account-delete')
  const error = accountError.extend('POST-account-delete')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    //
    // Check that route param :id and form field id values match
    //
    const csrfTokenCookie = ctx.cookies.get('csrfToken')
    const csrfTokenSession = ctx.session.csrfToken
    const [id] = ctx.request.body.id
    const [csrfTokenForm] = ctx.request.body.csrfTokenForm
    const db = ctx.state.mongodb.client.db()
    const collection = db.collection(USERS)
    const users = new Users(collection, ctx)
    if (!doTokensMatch(ctx)) {
      error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
      ctx.status = 401
      ctx.body = { error: 'csrf token mismatch' }
    } else {
      try {
        // let displayUser = await users.getById(id)
        const displayUser = await users.archiveUser(ctx, id)
        if (!displayUser) {
          ctx.flash.delete = {
            // some flash message
          }
          ctx.status = 404
          ctx.type = 'application/json'
          ctx.body = {
            status: 404,
            error: `User id: ${id} not found.`,
            message: null,
          }
        } else {
          ctx.flash.delete = {
            // some flash message
          }
          ctx.status = 200
          ctx.type = 'application/json'
          ctx.body = {
            status: 200,
            error: null,
            message: `User account: @${displayUser?.username} has been deleted.`,
            user: displayUser.username,
            id,
          }
        }
      } catch (e) {
        error(`Error from users.getById(${id})`)
      }
    }
  }
})

export { router as account }
