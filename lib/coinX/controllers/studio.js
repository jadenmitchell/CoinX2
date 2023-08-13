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

class Studio extends WebPageController {
    register() {
        this.app.get('/studio', this.isLoggedIn, (req, res) => {
            res.render('studio', {
                user: req.session.passport.user
            })
        })
    }
}

module.exports = Studio