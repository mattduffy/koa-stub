/**
 * @summary App model.
 * @exports @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file ./src/models/app.js
 */

import path from 'node:path'
import {
  stat,
  readFile,
  writeFile,
  mkdir,
} from 'node:fs/promises'
import { CryptoKeys } from './cryptoKeys.js'
import { _log, _error } from '../utils/logging.js'

const appLog = _log.extend('App_class')
const appError = _error.extend('App_class')
// const DATABASE = process.env.MONGODB_DBNAME ?? 'koastub'
const COLLECTION = 'app'

class App {
  #cryptoKeys

  #sigPubKeyPath

  #sigPriKeyPath

  #sigJWKKeyPath

  #encPubKeyPath

  #encPriKeyPath

  #encJWKKeyPath

  constructor(config = {}) {
    this.log = appLog.extend('constructor')
    // const error = appError.extend('constructor')
    this.log('The App model constructor.')
    //

    this._keyDir = config.keyDir ?? './keys'
    this._dbHandle = config?.db
    this._db = config?.db.collection(COLLECTION)
    this._siteName = config?.siteName ?? config?.SITE_NAME ?? process.env.SITE_NAME ?? 'website'
    this._keys = config.keys ?? { signing: [], encrypting: [] }

    this.RSA_SIG_KEY_FILENAME = config.appEnv.RSA_SIG_KEY_FILENAME
    this.RSA_ENC_KEY_FILENAME = config.appEnv.RSA_ENC_KEY_FILENAME
    this.#cryptoKeys = new CryptoKeys({ dirs: { public: this._keyDir, private: this._keyDir } })
  }

  async init() {
    const log = appLog.extend('init')
    const error = appError.extend('init')
    let dirExists
    try {
      stat(this._keyDir)
      log(`keyDir exists: ${path.resolve(this._keyDir)}`)
      dirExists = true
    } catch (e) {
      error(`Missing app key dir: ${path.resolve(this._keyDir)}`)
      log(`Need to create app key dir at: ${this._keyDir}`)
      dirExists = false
    }
    if (!dirExists) {
      // Create the missing app keys directory.
      try {
        log(`Creating app key dir at: ${this._keyDir}`)
        mkdir(path.resolve(this._keyDir, { recursive: true }))
      } catch (e) {
        error('Failed to create the required app key dir.')
        throw new Error('App init Failed: ', { cause: e })
      }
    }
    // Okay to continue init procedure.
    // Check that db app collection is created with properties set.
    try {
      const isAppCollectionSetup = await this._db.findOne({ name: this._siteName })
      if (isAppCollectionSetup === null) {
        // Populate the app collection with this app's info.
        const doc = {
          keys: this._keys,
          name: this._siteName,
          schemaVer: 1,
        }
        const result = await this._db.insertOne(doc)
        log(result)
      }
    } catch (e) {
      error(e)
      throw new Error('DB setup failed.', { cause: e })
    }
  }

  async keys() {
    const log = appLog.extend('keys')
    const error = appError.extend('keys')
    this._keys = (await this._db.findOne(
      { name: this._siteName },
      { projection: { keys: 1 } },
    ))?.keys
    let needToUpdate = false
    const numSigKeys = this._keys.signing?.length ?? 0
    const numEncKeys = this._keys.encrypting?.length ?? 0
    // log(this._keys, numSigKeys, numEncKeys)
    try {
      if (numSigKeys < 1) {
        // await this.#createRSASigningKey()
        this.#cryptoKeys = await this.#cryptoKeys.generateKey({ alg: 'RSA', use: 'sig' })
        needToUpdate = true
      }
      if (numEncKeys < 1) {
        // await this.#createRSAEncryptingKey()
        this.#cryptoKeys = await this.#cryptoKeys.generateKey({ alg: 'RSA', use: 'enc' })
        needToUpdate = true
      }
    } catch (e) {
      error('Failed to create crypto keys.')
      error(e)
      return false
    }
    if (needToUpdate) {
      const keyResults = await this.#cryptoKeys.export()
      if (keyResults.details.signing !== null) {
        // set filename and path for keys
        // save keys to file system
        const keyIndex = numSigKeys
        //
        const filename = `app-${keyIndex}-${this.RSA_SIG_KEY_FILENAME}`
        const pubKeyPath = path.resolve(this._keyDir, `${filename}-public.pem`)
        const jwkeyPath = path.resolve(this._keyDir, `${filename}.jwk`)
        const priKeyPath = path.resolve(this._keyDir, `${filename}-private.pem`)
        try {
          await writeFile(pubKeyPath, keyResults.sig.public)
          keyResults.details.signing.publicKey = pubKeyPath
          log(`Saving ${pubKeyPath}`)
          await writeFile(priKeyPath, keyResults.sig.private)
          keyResults.details.signing.privateKey = priKeyPath
          log(`Saving ${priKeyPath}`)
          await writeFile(jwkeyPath, JSON.stringify(keyResults.sig.jwk))
          keyResults.details.signing.jwk = jwkeyPath
          log(`Saving ${jwkeyPath}`)
        } catch (e) {
          error('Failed to save key files.')
          error(e)
          throw new Error(e)
        }
        this._keys.signing.unshift(keyResults.details.signing)
      }
      if (keyResults.details.encrypting !== null) {
        // set filename and path for keys
        // save keys to file system
        const keyIndex = numEncKeys
        const filename = `app-${keyIndex}-${this.RSA_ENC_KEY_FILENAME}`
        const pubKeyPath = path.resolve(this._keyDir, `${filename}-public.pem`)
        const jwkeyPath = path.resolve(this._keyDir, `${filename}.jwk`)
        const priKeyPath = path.resolve(this._keyDir, `${filename}-private.pem`)
        try {
          await writeFile(pubKeyPath, keyResults.enc.public)
          keyResults.details.encrypting.publicKey = pubKeyPath
          log(`Saving ${pubKeyPath}`)
          await writeFile(priKeyPath, keyResults.enc.private)
          keyResults.details.encrypting.privateKey = priKeyPath
          log(`Saving ${priKeyPath}`)
          await writeFile(jwkeyPath, JSON.stringify(keyResults.enc.jwk))
          keyResults.details.encrypting.jwk = jwkeyPath
          log(`Saving ${jwkeyPath}`)
        } catch (e) {
          error('Failed to save key files.')
          error(e)
          throw new Error(e)
        }
        this._keys.encrypting.unshift(keyResults.details.encrypting)
      }
      // log('keys: ', this._keys)
      const filter = { name: this._siteName }
      const update = {
        $set: {
          keys: this._keys,
        },
      }
      const options = { writeConcern: { w: 'majority' }, upsert: false, returnDocument: 'after' }
      try {
        const result = await this._db.findOneAndUpdate(filter, update, options)
        if (result.ok !== 1) {
          throw new Error('Updating keys property failed.')
        }
        // log(result)
      } catch (e) {
        error('Failed to update db after creating new keys.')
        error(e)
        return false
      }
    }
    this.#sigPubKeyPath = this._keys.signing[0].publicKey
    this.#sigPriKeyPath = this._keys.signing[0].privateKey
    this.#sigJWKKeyPath = this._keys.signing[0].jwk
    this.#encPubKeyPath = this._keys.encrypting[0].publicKey
    this.#encPriKeyPath = this._keys.encrypting[0].privateKey
    this.#encJWKKeyPath = this._keys.encrypting[0].jwk
    return this._keys
  }

  /**
   * Rotate a new RSA key pair into use.
   * @summary Rotate a new RSA key pair into use.
   * @async
   * @return { undefined }
   */
  async rotate() {
    const log = appLog.extend('rotate')
    // const error = appLog.extend('rotate')
    this.log('help')
    log(`Rotating server ${this._siteName} keys.`)
  }

  get signingPublicKey() {
    return this.#openKey(this.#sigPubKeyPath)
  }

  get signingPrivateKey() {
    return this.#openKey(this.#sigPriKeyPath)
  }

  get signingJwkPP() {
    return this.#prettyPrintJwk(this.#sigJWKKeyPath, true)
  }

  get signingJwk() {
    console.log(this.#sigJWKKeyPath)
    return this.#openKey(this.#sigJWKKeyPath)
  }

  get encryptingPublicKey() {
    return this.#openKey(this.#encPubKeyPath)
  }

  get encryptinPrivateKey() {
    return this.#openKey(this.#encPriKeyPath)
  }

  get encryptingJwkPP() {
    return this.#prettyPrintJwk(this.#encJWKKeyPath, true)
  }

  get encryptingJwk() {
    return this.#openKey(this.#encJWKKeyPath)
  }

  async #prettyPrintJwk(j, open = false) {
    let jwk = j
    if (open) {
      jwk = (await this.#openKey(j)).toString()
    }
    // eslint-disable-next-line
    const matches = jwk.match(/"key_ops":(?<key_ops>\[.*\]),"ext":(?<ext>(true|false)),"kty":(?<kty>".*"),"n":(?<n>".*"),"e":(?<e>".*"),"alg":(?<alg>".*"),"kid":(?<kid>".*"(?=,)),?(?:"use":(?<use>".*"))?/)
    const groups = matches?.groups
    const indent = '  '
    const string = '{\n'
      + `${indent}"key_ops": ${groups.key_ops},\n`
      // + `${indent}"ext": ${groups.ext},\n`
      + `${indent}"kty": ${groups.kty},\n`
      // + `${indent}"n":"${groups.n_val.match(/.{1,64}/g).join(`\n${indent}`)}",\n`
      + `${indent}"n": ${groups.n.match(/.{1,64}/g).join(`\n${indent}`)},\n`
      + `${indent}"e": ${groups.e},\n`
      + `${indent}"alg": ${groups.alg}\n`
      + `${indent}"kid": ${groups.kid},\n`
      + `${indent}"use": ${groups.use}\n`
      + '}'
    return string
  }

  async jwksjson(keyIndex = 0) {
    console.log((keyIndex).toString().match(/\d/))
    if ((keyIndex).toString()?.match(/(?<all>all)/i)?.groups?.all === 'all') {
      return { keys: 'All keys not functional yet.' }
    }
    const jwks = { keys: [] }
    try {
      const sig = JSON.parse(await this.signingJwk)
      if (sig) {
        jwks.keys.push(sig)
      }
    } catch (e) {
      console.error(e)
      throw new Error(e)
    }
    try {
      const enc = JSON.parse(await this.encryptingJwk)
      if (enc) {
        jwks.keys.push(enc)
      }
    } catch (e) {
      throw new Error(e)
    }
    return jwks
  }

  async #openKey(keyPath) {
    if (!keyPath) {
      this.error('help')
      throw new Error('Missing required path to key file.')
    }
    try {
      return await readFile(keyPath)
    } catch (e) {
      throw new Error(e)
    }
  }
}

export {
  App,
}
