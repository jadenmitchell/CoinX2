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

const WebPageController = require('../../net/route/webPageController')
const https = require('https')

const validator = require('validator')
const valid = (input) => input.split(' ').every(function (str) { return validator.isAlphanumeric(str) })
// can include this in the webPageController in the future?
const ObjectId = require('mongoose').Types.ObjectId
const BitcoinGateway = require('../../api/bitcoinReceivePayments')
const Schema = require('mongoose').Schema

class Payment extends WebPageController {
    register() {
        const User = this._db.model('User')

        this.app.get('/balance', this.isLoggedIn, (req, res) => {
            res.render('payment', {
                user: req.session.passport.user
            })
        })

        this.io.on('connection', (socket) => {
            socket.on('create bitcoin deposit', async (settings) => {
                const user = socket.handshake.session.passport?.user

                if (!user)
                    return
                    
                if (settings.gateway == 'native') {
                    console.log(settings.fee)
                    if (!validator.isCurrency(settings.fee, { allow_negatives: false, digits_after_decimal: [1, 2, 3, 4, 5, 6, 7, 8] })) {
                        console.log('not valid bitcoin amount')
                        return
                    }

                    const newTransaction = new BitcoinGateway.Transaction(settings.fee, BitcoinGateway.TransactionType.Bitcoin)

                    const status = await this._gateway.link(newTransaction)
                    if (status === 'error-maxgap') {
                        // handle dis shit
                    }

                    const address = newTransaction.address.toString()

                    if (validator.isBtcAddress(address))
                        console.log('valid')

                    socket.roomStep = 'awaiting-payment'
                    socket.emit('bitcoin deposit created', { address: address, fee: settings.fee, expire: 15 })

                    this._gateway.on(address,  async (transaction) => {
                        socket.emit('bitcoin deposit status', transaction.status)
                        
                        if (transaction.paid && !transaction.completed) {
                            user.wallet = +parseFloat(+user.wallet + +transaction.total).toFixed(8)

                            /* double loop ? */
                            transaction.completed = true
                            socket.emit('akert', transaction.fee + ' has been deposited into your account successfully.')
                        }

                        if (transaction.expired && !transaction.paid) {
                            //fuck u
                        }
                    })
                }
                else if (settings.gateway == 'open-node') {
                    // not working as of rn.
                }
            })
        })
    }
}

module.exports = Payment