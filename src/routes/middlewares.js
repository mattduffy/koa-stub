/**
 * @summary Useful router middleware functions.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/middlewares.js
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
  if (ctx.request?.body
    && (ctx.request.body?.['csrf-token'] || ctx.request.body?.csrfTokenHidden)) {
    if (ctx.request.body?.['csrf-token']) {
      [csrfTokenHidden] = ctx.request.body['csrf-token']
    }
    if (ctx.request.body?.csrfTokenHidden) {
      [csrfTokenHidden] = ctx.request.body.csrfTokenHidden
    }
  } else {
    log('Not a form submission, so no csrfTokenHidden to evaluate')
    csrfTokenHidden = null
  }
  if (csrfTokenHidden !== null
    && (csrfTokenCookie !== csrfTokenSession
    || csrfTokenSession !== csrfTokenHidden)) {
    error(`csrf token mismatch: header: ${csrfTokenCookie}`)
    error(`                     hidden: ${csrfTokenHidden}`)
    error(`                    session: ${csrfTokenSession}`)
    return false
  }
  log(`csrf tokens match: header: ${csrfTokenCookie}`)
  log(`                   hidden: ${csrfTokenHidden}`)
  log(`                  session: ${csrfTokenSession}`)
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
