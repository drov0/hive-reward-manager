var steem = require('steem');
var randy = require("randy");
var wifs = require('./config.js')

steem.api.setOptions({url: 'https://api.steemit.com'});

var powerup = true; // set to false if you don't want the redeemed steem to be powered up

/**
 * @param {float} num - Number to be analyzedgit
 * @return {int}  number of decimals
 */
function decimalPlaces(num) {
    var match = ('' + num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
    if (!match) {
        return 0;
    }
    return Math.max(
        0,
        // Number of digits right of decimal point.
        (match[1] ? match[1].length : 0)
        // Adjust for scientific notation.
        - (match[2] ? +match[2] : 0));
}



function execute() {
    console.log("Getting the rewards...");
    for (var i = 0; i < wifs[0].length; i++) {

        steem.api.getAccounts([wifs[0][i]], function (err, response) {
            var reward_sbd = response[0]['reward_sbd_balance']; // will be claimed as Steem Dollars (SBD)
            var reward_steem = response[0]['reward_steem_balance']; // this parameter is always '0.000 STEEM'
            var reward_vests = response[0]['reward_vesting_balance']; // this is the actual VESTS that will be claimed as SP

            var name = response[0].name;

            if (parseFloat(reward_sbd) > 0 || parseFloat(reward_steem) > 0
                || parseFloat(reward_vests) > 0) {
                steem.broadcast.claimRewardBalance(wifs[1][name], name, reward_steem, reward_sbd, reward_vests, function (err, result) {
                    console.log(name + " reward : " + reward_sbd + " SBD, " + reward_steem + " STEEM " + reward_vests + " vests");
                    if (parseFloat(reward_sbd) > 0) {
                        var seconds = Math.round(Date.now() / 1000);
                        steem.api.getOrderBook(1, function (err, price) {
                            var price = price.asks[0].real_price;
                            var sell = Math.round((parseFloat(reward_sbd) * ((1 - parseFloat(price)) + 1)) * 1000) / 1000;

                            var decimals = decimalPlaces(sell)

                            if (decimals === 0)
                                sell += ".000 STEEM";
                            else if (decimals === 1)
                                sell += "00 STEEM";
                            else if (decimals === 2)
                                sell += "0 STEEM";
                            else
                                sell += " STEEM"

                            steem.broadcast.limitOrderCreate(wifs[1][name], name, randy.getRandBits(32),
                                reward_sbd, sell, false, seconds + 604800, function (err, result) {
                                    console.log("sent buy order for " + name + " : " + sell);
                                    if (powerup) {
                                        setTimeout(function () { // waiting 20 seconds for the order to go through
                                            powerup(wifs[1][name], name, sell)
                                        }, 20000);
                                    }
                                });
                        });
                    }

                });
            }
        });
    }
    console.log("Done");
}


function run() {
    execute();
    setInterval(execute, 60000);
};

run();


function powerup(Activekey, username, amount) {
    steem.broadcast.transferToVesting(Activekey, username, username, amount, function(err, result) {
        console.log(err, result);
    });
}


