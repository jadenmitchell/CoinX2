/* Copyright 2016 Jaden M.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
* http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
'use strict'

const assert = require('assert')
const { HDPublicKey, Address, Networks } = require('bitcore-lib')

const EventEmitter = require('events')
const Socket = require('blockchain.info/Socket')
const axios = require('axios').default
const bjs = require('bitcoinjs-lib')
const b58 = require('bs58check')
const network = bjs.networks.bitcoin

function zpubToXpub(zpub) {
  let data = b58.decode(zpub)
  data = data.slice(4)
  data = Buffer.concat([Buffer.from('0488b21e','hex'), data])
  return b58.encode(data)
}

/**
 * sleep a function.
 * @param {number} ms  time in milliSeconds
 */
const sleep = ms => {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * loop a function.
 * @param {number} ms  time in milliSeconds
 */
const loop = ms => {
    return new Promise(resolve => setInterval(resolve, ms))
}

/**
 * Refactored.
 */

class BitcoinGateway extends EventEmitter {

    /**
     * create a Bitcoin gateway to process payments and confirm transactions.
     * 
     * @param {object} opts    **must contain redis and xpub wallet key**
     * @constructor
     */
    constructor(opts) {
        super()

        assert.notEqual(typeof opts.redis, null, 'A redis instance must be configured in order to use the Bitcoin gateway.')
        assert.equal(typeof opts.xpub, 'string', 'xpub value must be a string value cannot be null.')

        // support multiple wallets for one instance in the future?

        this._redis = opts.redis
        this._xpub = new HDPublicKey(opts.xpub)

        if (opts.xpub.startsWith('zpub')) {
            this._zpub = true
           this._xpub = zpubToXpub(opts.xpub)
        }

        this._cache = []
        // todo; config for large and small transaction
        this._predictNetworkConfidence = false
        this._minConfirmations = 6
        this._confidenceLevel = 0.50

        this._socket = new Socket() /* nts: API only works with livenet blockchain ***testnet deprecated *** */

       /* this._socket.onTransaction(() => {
            console.log('new transaction detected')
        }, { addresses: [this._address.toString()] })*/

        // 30 mins.
        loop(60000 * 30).then(this.updateCache())
        // 15 mins.
        loop(60000 * 15).then(this.checkGap())
    }

    /**
     * synchronize the redis database with our server memory.
     * @see {@link this._cache}
     */
    updateCache() {
        (async () => {

        })()
    }

    /**
     * checks for timeout gaps from our active addresses and destroys them.
     * Also check for completion of payment and emits appropriate event.
     */
    checkGap() {
        if (this._cache.length >= 6) {
            (async () => {
                const newCache = []
                // redis get expired-addresses and loop through and delete them
                for await (let [index, transaction] of this._cache) {
                    await this.checkAddress(transaction)
                    if (transaction.status === 'waiting' && transaction.expired) {
                        continue
                    }
                    newCache.push(transaction)
                }

                console.log(`server performed a gap sweep resulting in the disposal of ${this._cache.length - newCache.length} transactions`)

                this._cache = newCache
            })()
        }
    }

    /**
     * links a transaction to the bitcoin gateway.
     * 
     * @param {GatewayTransaction} transaction  new transaction data
     */
    async link(transaction) {
        const address = await this.getOrCreateAddress()

        transaction.address = address
        transaction.status = 'waiting'

        this._cache[address] = transaction

        console.log(`server is scraping the network for transaction data for hash ${address}`)
        
        // 5 3 min intervals.
        transaction.loop = setInterval(() => this.checkAddress(transaction), 60000 * 1)
    }

    async getConfirmations(transactionId) {
        try {
          const response = await axios.get(`https://blockchain.info/rawtx/${transactionId}`)
          const blockHeight = response.data.block_height
          const currentBlockHeight = await axios.get(`https://blockchain.info/latestblock`)
            .then(res => res.data.height)
      
          const confirmations = currentBlockHeight - blockHeight + 1
          return confirmations
        } catch (error) {
          console.error(error)
        }
      }

    /**
     * checks the blockchain in order to update our server data monitoring
     * the integrity of the transaction, the confidence of the network,
     * and whether the payment can be considered confirmed/completed.
     * 
     * @param {GatewayTransaction} transaction  bitcoin transaction data
     */
    async checkAddress(transaction) {
        if (!transaction.loop) /* an error has occured? */
            return false

            /**
             *  check if we got paid.
             */
            transaction.status = 'paid'
            transaction.paid = true

            clearInterval(transaction.loop)
            this.emit(transaction.address.toString(), transaction)
    }

    /**
     * checks the blockchain and our redis cache to see if the bitcoin
     * address was used or not and verifies the structural integrity of the address.
     * 
     * @param {any} address     the address to be validated
     */
    async unusedValidAddress(address) {
        const exists = await this._redis.getAsync('address-' + address)

        if (!exists) {
            const tx = await axios.get(
                `https://blockchain.info/q/addressfirstseen/${address}`
            )

            if (tx.data != '0' || tx.data.error) {
                return false
            }
        }

        return true
    }

    async getOrCreateAddress() {
        const expired = await this._redis.lpopAsync('expired-addresses')

        if (expired && await this.unusedValidAddress(expired))
            return expired

        return await this.createAddress()
    }

    async createAddress(increment) {
        if (this._cache.length >= 20) {
            // L
            return
        }

        let address
        if (this._zpub) {
            const payment = bjs.payments.p2sh({ 
                redeem: bjs.payments.p2wpkh({ 
                    pubkey: bjs.bip32.fromBase58(this._xpub, network).derive(0).derive(increment ?? 0).publicKey 
                })
            })
            address = payment.address
        }
        else {
            const derived = this._xpub.derive(0).derive(increment ?? 0)
            address = new Address(derived.publicKey, Networks.testnet)
        }

        if (this._cache[address]) {
            increment++
            return await this.createAddress(increment)
        }

        if (await !this.unusedValidAddress(address)) {
            increment++
            return await this.createAddress(increment)
        }

        // 15 mins.
        sleep(60000 * 15).then(this.destroyAddress(address, true))

        return address
    }

    async destroyAddress(address, expired) {
        if (expired) {
            //this._redis.setAsync('expired-addresses', address)
            //this._redis.sadd('expired-addresses' + this._xpub, address)

            const transaction = this._cache[address]
            if (transaction) {
                transaction.status = 'expired'
                transaction.expired = true
                this.emit(address, transaction)
                delete this._cache[address]
            }
        }
        /*
        const exists = await this._redis.lremAsync('address-' + address, this._xpub, 0, address)

        if (!exists) {
            // address already expired.
            // what to do when an address already doesn't exists?
            return
        }*/
    }
}

/**
 * GatewayTransaction.
 * @class
 * @classdesc   used to store payment gateway transaction details
 */
class GatewayTransaction {

    /**
     * used to store Bitcoin transaction data includes helper functions.
     * 
     * @param {string} total            payment amount
     * @param {TransactionType} type    method of payment
     */
    constructor(total, type) {
        this.total = total
        this.type = type
    }

    /**
     *  current BTC rates can be used for conversion.
     */
    static getBtcRates() {
        return {}
    }

    /**
     * convert a currency it's BTC equivalent in real-time using a websocket API.
     *
     * @param {string} currency        type of currency
     * @param {string} expectedPayment amount expected to covert
     */
    static getBtcFromCurrency(currency, expectedPayment) {
        const rates = this.getBtcRates()
        return 0
    }
}

/**
 * transaction type enum.
 */
const TransactionType = {
    CashApp: Symbol('cashapp'),
    Bitcoin: Symbol('bitcoin')
}

module.exports = BitcoinGateway
module.exports.Transaction = GatewayTransaction
module.exports.TransactionType = TransactionType