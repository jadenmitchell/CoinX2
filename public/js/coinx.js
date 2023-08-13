function escapeOutput(toOutput) {
    return toOutput?.replace(/\&/g, '&amp;')
        .replace(/\</g, '&lt;')
        .replace(/\>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/\'/g, '&#x27')
        .replace(/\//g, '&#x2F')
}

function showAlert(container, message, type, closeDelay) {
    var $cont = $("#" + container);

    if ($cont.length == 0) {
        // alerts-container does not exist, create it
        $cont = $(`<div id="${container}">`)
            .css({
                position: "fixed"
                , width: "50%"
                , left: "25%"
                , top: "10%"
            })
            .appendTo($("body"));
    }

    // default to alert-info; other options include success, warning, danger
    type = type || "info";

    // create the alert div
    var alert = $('<div>')
        .addClass("fade in show alert alert-" + type)
        /*.append(
            $('<button type="button" class="close" data-dismiss="alert">')
                .append("&times;")
        )*/
        .append(message);

    // add the alert div to top of alerts-container, use append() to add to bottom
    $cont.prepend(alert);

    // if closeDelay was passed - set a timeout to close the alert
    if (closeDelay)
        window.setTimeout(function () { alert.alert("close") }, closeDelay);
}

/**
 * Validates a given string input.
 * The input must be a number with up to one comma and up to one decimal point with up to two decimal places.
 * @param value The value to be validated
 * @return Returns a string of the valid number if it is valid or null if not valid.
 */
const validate = function (value) {
    //var value= $("#field1").val();
    var regex = /^[1-9]\d*(((,\d{3}){1})?(\.\d{0,2})?)$/
    if (regex.test(value)) {
        //Input is valid, check the number of decimal places
        var twoDecimalPlaces = /\.\d{2}$/g
        var oneDecimalPlace = /\.\d{1}$/g
        var noDecimalPlacesWithDecimal = /\.\d{0}$/g

        if (value.match(twoDecimalPlaces)) {
            //all good, return as is
            return value
        }
        if (value.match(noDecimalPlacesWithDecimal)) {
            //add two decimal places
            return value + '00'
        }
        if (value.match(oneDecimalPlace)) {
            //ad one decimal place
            return value + '0'
        }
        //else there is no decimal places and no decimal
        return value + ".00"
    }
    return null
};

var socket
$(function () {
    socket = io.connect()

    function updateBtcConversion() {
        const wager = escapeOutput($('#depositAmount').val())
        if (!validate(wager)) return

        $.get("https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=USD", function (data) {
            const amount = wager / data["USD"],
                final = amount.toFixed(6)

            $('#convertedCurrency').text($('<div>').html('&asymp;').text() + ` ${final} BTC`)
        })
    }

    $('#generateQrCode').on('click', function (evt) {
        const depositAmount = escapeOutput($("#depositAmount").val())
        if (depositAmount) {
            const transaction = {
                gateway: 'native',
                fee: escapeOutput($('#convertedCurrency').text().replace(' BTC', '').split(' ')[1])
            }
            console.log(transaction.fee)
            $(this).prop("disabled", true);
            $(this).html(
                `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Generating...`
                );
            socket.emit('create bitcoin deposit', transaction)
        }
    })

    $('#depositAmount').on('input',function(e) {
        updateBtcConversion()
    })

    socket.on('tooltip alert', function(alert) {

    })

    socket.on('server deposit error', function (error) {

    })

    socket.on('bitcoin deposit status', function(status) {
        if (status == 'paid') {
            $('#generatedQrCode').fadeOut(function() {
                showAlert('depositAlert', 'Payment has been completed.', 'success')
            })
        }
    })

    socket.on('bitcoin deposit created', function(opts) {
        $("#generateQrCode").fadeOut(function () {
            console.log('woop')
            const qrCode  = $('<img />', {
                src     : 'https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=bitcoin:' + opts.address + '?amount=' + opts.fee,
                'class' : 'img-fluid rounded mt-3 mx-auto d-block'
            })

            // set timeout using expire variable

            $('#generatedQrCode').html(qrCode).show()
        })
    })
})