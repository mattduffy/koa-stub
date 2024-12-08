/**
 * @summary Useful router middleware functions.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/middlewares.js A small library of useful router middleware funtions.
 */

import formidable from 'formidable'
import { _log, _error } from '../utils/logging.js'

export async function addIpToSession(ctx, next) {
  const log = _log.extend('addIpToSession')
  const err = _error.extend('addIpToSession')
  log('adding logEntry IP to session: ', ctx.state.logEntry)
  ctx.session.ip = ctx.state.logEntry
  try {
    await next()
  } catch (e) {
    err('failed after adding client ip to session.')
    err(e)
  }
}

export function doTokensMatch(ctx) {
  const log = _log.extend('doTokensMatch')
  const error = _error.extend('doTokensMatch')
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  let csrfTokenHidden
  if (ctx.request.body?.['csrf-token']) {
    [csrfTokenHidden] = ctx.request.body['csrf-token']
  }
  if (ctx.request.body?.csrfTokenHidden) {
    [csrfTokenHidden] = ctx.request.body.csrfTokenHidden
  }
  if (csrfTokenCookie === csrfTokenSession) {
    log(`cookie  ${csrfTokenCookie} === session ${csrfTokenSession}`)
  }
  if (csrfTokenCookie === csrfTokenHidden) {
    log(`cookie  ${csrfTokenCookie} === hidden ${csrfTokenHidden}`)
  }
  if (csrfTokenSession === csrfTokenHidden) {
    log(`session ${csrfTokenSession} === hidden ${csrfTokenHidden}`)
  }
  if (!(csrfTokenCookie === csrfTokenSession && csrfTokenSession === csrfTokenHidden)) {
    error(`csrf token mismatch: header: ${csrfTokenCookie}`)
    error(`                     hidden: ${csrfTokenHidden}`)
    error(`                    session: ${csrfTokenSession}`)
    ctx.status = 403
    ctx.type = 'application/json; charset=utf-8'
    ctx.body = { status: 'Error, csrf tokens do not match' }
  }
  return true
}

export async function processFormData(ctx, next) {
  const log = _log.extend('processFormData')
  const error = _error.extend('processFormData')
  const form = formidable({
    encoding: 'utf-8',
    allowEmptyFiles: true,
    minFileSize: 0,
    maxFileSize: (200 * 1024 * 1024),
    uploadDir: ctx.app.dirs.private.uploads,
    keepExtensions: true,
    multipart: true,
  })
  await new Promise((resolve, reject) => {
    form.parse(ctx.req, (err, fields, files) => {
      if (err) {
        error('There was a problem parsing the multipart form data.')
        error(err)
        reject(err)
        return
      }
      log('Multipart form data was successfully parsed.')
      ctx.request.body = fields
      ctx.request.files = files
      resolve()
    })
  })
  await next()
}

export async function hasFlash(ctx, next) {
  const log = _log.extend('hasFlash')
  const error = _error.extend('hasFlash')
  if (ctx.flash) {
    log('ctx.flash is present: %o', ctx.flash)
  } else {
    error('ctx.flash is missing.')
  }
  await next()
}
