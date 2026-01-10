/**
 * @summary Crypto keys model.
 * @exports @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file ./src/models/cryptoKesy.js
 */

import path from 'node:path'
import { subtle } from 'node:crypto'
import { ulid } from 'ulid'
import { _log, _error } from '../utils/logging.js'

const keysLog = _log.extend('Keys_class')
const keysError = _error.extend('Keys_class')
// const DATABASE = process.env.MONGODB_DBNAME ?? 'koastub'
const COLLECTION = 'app'

class CryptoKeys {
  #db

  #siteName

  #keys

  #rsaSig

  #sigBits

  #sigHash

  #rsaEnc

  #encBits

  #encHash

  #namedCurve

  #publicKeyDir

  #privateKeyDir

  #signing

  #exportedSigning

  #encrypting

  #exportedEncrypting

  _sigPubKey

  _sigPriKey

  _sigJwk

  _encPubKey

  _encPriKey

  _encJwk

  _exports

  constructor(config) {
    const log = keysLog.extend('constructor')
    this.log = log
    const error = keysError.extend('constructor')
    this.error = error
    this._format = config?.format ?? 'pem'
    this._sigKid = ulid()
    this._encKid = ulid()
    this.#publicKeyDir = config?.dirs?.public ?? process.env.KEY_DIR ?? './keys'
    this.#privateKeyDir = config?.dirs?.private ?? process.env.KEY_DIR ?? './keys'
    this.#db = config?.db?.db().collection(COLLECTION) ?? null
    this.#siteName = process.env.SITE_NAME ?? 'website'
    this.#keys = config.keys ?? { signing: null, encrypting: null }
    // RSA Signing key options
    this.#rsaSig = process.env.RSA_SIG_KEY_NAME ?? 'RSASSA-PKCS1-v1_5'
    this.#sigBits = parseInt(process.env.RSA_SIG_KEY_MOD, 10) ?? 2048
    this.#sigHash = process.env.RSA_ENC_KEY_TYPE ?? 'SHA-256'
    // RSA Encrypting key options
    this.#rsaEnc = process.env.RSA_ENC_KEY_NAME ?? 'RSA-OAEP'
    this.#encBits = parseInt(process.env.RSA_SIG_KEY_MOD, 10) ?? 2048
    this.#encHash = process.env.RSA_ENC_KEY_TYPE ?? 'SHA-256'
    // ECDSA Signing key options
    this.#namedCurve = process.env.ECDSA_SIG_KEY_NAMEDCURVE ?? 'P-521'
  }

  async generateKey(o) {
    // const log = keysLog.extend('generateKey')
    const error = keysError.extend('generateKey')
    const options = { use: 'sig', alg: 'RSA', ...o }
    let keys
    if (options.alg.toLowerCase() === 'rsa') {
      if (options.use === 'sig') {
        keys = await this.#signRSA()
        this.#signing = keys
      } else if (options.use === 'enc') {
        keys = await this.#encRSA()
        this.#encrypting = keys
      } else {
        const errorMessage = `Invalid key use: ${options.use} specified in parameters.`
        error(errorMessage)
        throw new Error(errorMessage)
      }
    } else if (options.alg.toLowerCase() === 'ecdsa') {
      keys = await this.#sigECDSA()
      this.#signing = keys
    } else {
      const errorMessage = 'Missing required key algorith.'
      error(errorMessage)
      throw new Error(errorMessage)
    }
    // return keys
    // For fluent interface, return whole instance.
    return this
  }

  async export() {
    const log = keysLog.extend('export')
    log('exporting keys')
    const error = keysError.extend('export')
    if (this.#keys.signing === null && this.#keys.encrypting === null) {
      error('No keys to export.')
      // error(e)
      throw new Error('No keys to export.')
    }
    try {
      if (this.#keys.signing !== null) {
        await this.#exportSigning()
        // log('exported signing: ', this.#exportedSigning)
      }
    } catch (e) {
      error('Failed to export siging key components.')
      error(e)
      throw new Error(e)
    }
    try {
      if (this.#keys.encrypting !== null) {
        await this.#exportEncrypting()
        // log('exported encrypting: ', this.#exportedEncrypting)
      }
    } catch (e) {
      error('Failed to export encrypting key components.')
      error(e)
      throw new Error(e)
    }
    // return this
    return {
      details: this.#keys,
      sig: this.#exportedSigning,
      enc: this.#exportedEncrypting,
    }
  }

  async #exportSigning() {
    const log = keysLog.extend('#exportSigning')
    const error = keysError.extend('#exportSigning')
    log('exportSigning')
    try {
      this.#exportedSigning = {}
      this.#exportedSigning.jwk = await subtle.exportKey('jwk', this.#signing.publicKey)
      this.#exportedSigning.jwk.kid = this._sigKid
      this.#exportedSigning.jwk.use = 'sig'
      this._sigJwk = this.#exportedSigning.jwk
    } catch (e) {
      error('Failed to export JWK from signing public key.')
      error(e)
      throw new Error(e)
    }
    try {
      this.#exportedSigning.public = this.#pubToPem(
        await subtle.exportKey('spki', this.#signing.publicKey),
      )
    } catch (e) {
      error('Failed to export signing public key.')
      error(e)
      throw new Error(e)
    }
    try {
      this.#exportedSigning.private = this.#priToPem(
        await subtle.exportKey('pkcs8', this.#signing.privateKey),
      )
    } catch (e) {
      error('Failed to export signing private key.')
      error(e)
      throw new Error(e)
    }
  }

  async #exportEncrypting() {
    const log = keysLog.extend('#exportEncrypting')
    log('exporting encryption keys')
    const error = keysError.extend('#exportEncrypting')
    // log('export encrypyting: ', this.#encrypting)
    try {
      this.#exportedEncrypting = {}
      this.#exportedEncrypting.jwk = await subtle.exportKey('jwk', this.#encrypting.publicKey)
      this.#exportedEncrypting.jwk.kid = this._encKid
      this.#exportedEncrypting.jwk.use = 'enc'
      this._encJwk = this.#exportedEncrypting.jwk
    } catch (e) {
      error('Failed to export JWK from encrypting public key.')
      error(e)
      throw new Error(e)
    }
    try {
      this.#exportedEncrypting.public = this.#pubToPem(
        await subtle.exportKey('spki', this.#encrypting.publicKey),
      )
    } catch (e) {
      error('Failed to export encrypting public key.')
      error(e)
      throw new Error(e)
    }
    try {
      this.#exportedEncrypting.private = this.#priToPem(
        await subtle.exportKey('pkcs8', this.#encrypting.privateKey),
      )
    } catch (e) {
      error('Failed to export encrypting private key.')
      error(e)
      throw new Error(e)
    }
  }

  #pubToPem(pub) {
    this.log('pubToPem')
    let pubToPem = Buffer.from(String.fromCharCode(...new Uint8Array(pub)), 'binary')
      .toString('base64')
    pubToPem = pubToPem.match(/.{1,64}/g).join('\n')
    pubToPem = '-----BEGIN PUBLIC KEY-----\n'
      + `${pubToPem}\n`
      + '-----END PUBLIC KEY-----'
    return pubToPem
  }

  #priToPem(pri) {
    this.log('priToPem')
    let priToPem = Buffer.from(String.fromCharCode(...new Uint8Array(pri)), 'binary')
      .toString('base64')
    priToPem = priToPem.match(/.{1,64}/g).join('\n')
    priToPem = '-----BEGIN PRIVATE KEY-----\n'
      + `${priToPem}\n`
      + '-----BEGIN PRIVATE KEY-----'
    return priToPem
  }

  async #signRSA() {
    const log = keysLog.extend('signRSA')
    log('signRSA')
    const error = keysError.extend('signRSA')
    let keys
    try {
      keys = await subtle.generateKey(
        {
          name: this.#rsaSig,
          modulusLength: this.#sigBits,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: this.#sigHash,
        },
        true,
        ['sign', 'verify'],
      )
      this._sigKeyType = this.#rsaSig
      this._sigPubKey = keys.publicKey
      this._sigPriKey = keys.privateKey
      this.#keys.signing = {}
      this.#keys.signing.name = keys.publicKey.algorithm.name
      this.#keys.signing.hash = keys.publicKey.algorithm.hash.name
      this.#keys.signing.bits = keys.publicKey.algorithm.modulusLength
      this.#keys.signing.kid = this._sigKid
      this.#keys.signing.publicKey = ''
      this.#keys.signing.privateKey = ''
      this.#keys.signing.jwk = ''
    } catch (e) {
      error(e)
      throw new Error(e)
    }
    return keys
    // return this
  }

  async #encRSA() {
    let keys
    try {
      keys = await subtle.generateKey(
        {
          name: this.#rsaEnc,
          modulusLength: this.#encBits,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: this.#encHash,
        },
        true,
        ['encrypt', 'decrypt'],
      )
      this._encKeyType = this.#rsaEnc
      this._encPubKey = keys.publicKey
      this._encPriKey = keys.privateKey
      this.#keys.encrypting = {}
      this.#keys.encrypting.name = keys.publicKey.algorithm.name
      this.#keys.encrypting.hash = keys.publicKey.algorithm.hash.name
      this.#keys.encrypting.bits = keys.publicKey.algorithm.modulusLength
      this.#keys.encrypting.kid = this._encKid
      this.#keys.encrypting.publicKey = ''
      this.#keys.encrypting.privateKey = ''
      this.#keys.encrypting.jwk = ''
    } catch (e) {
      throw new Error(e)
    }
    return keys
    // return this
  }

  async #sigECDSA() {
    let keys
    try {
      keys = await subtle.generateKey(
        {
          name: 'ECDSA',
          namedCurve: this.#namedCurve,
        },
        true,
        ['sign', 'verify'],
      )
      this._sigKeyType = 'ECDSA'
      this._sigPubKey = keys.publicKey
      this._sigPriKey = keys.privateKey
      this.#keys.signing = {}
      this.#keys.signing.name = keys.publicKey.algorithm.name
      this.#keys.signing.namedCurve = keys.publicKey.algorithm.namedCurve
      this.#keys.signing.kid = this._sigKid
      this.#keys.signing.publicKey = ''
      this.#keys.signing.privateKey = ''
      this.#keys.signing.jwk = ''
    } catch (e) {
      throw new Error(e)
    }
    return keys
    // return this
  }

  get publicKeyDir() {
    return this.#publicKeyDir
  }

  set publicKeyDir(dir) {
    this.#publicKeyDir = path.resolve(dir)
  }

  get privateKeyDir() {
    return this.#privateKeyDir
  }

  set privateKeyDir(dir) {
    this.#privateKeyDir = path.resolve(dir)
  }

  get keys() {
    return this.#keys
  }
}

export {
  CryptoKeys,
}
