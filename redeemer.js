var steem = require('steem');
var randy = require("randy");
var accounts = require('./config.js')

steem.api.setOptions({url: 'https://api.steemit.com'});

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

function getprice()
{
    return new Promise(async resolve => {
        steem.api.getOrderBook(1, function (err, price) {
            return resolve(price);
        });
    });
}


async function sell_sbd(account, reward_sbd, name)
{
    return new Promise(async resolve => {
        const price_data = await getprice();
        const seconds = Math.round(Date.now() / 1000);
        const price = price_data.asks[0].real_price;
        if (parseFloat(price) <= account['max_ratio']) {
            console.log(reward_sbd + " on the account, price is "+ price +" sbd per steem, selling it ");
            let sell = Math.round((parseFloat(reward_sbd) * ((1 - parseFloat(price)) + 1)) * 1000) / 1000;

            const decimals = decimalPlaces(sell);

            if (decimals === 0)
                sell += ".000 STEEM";
            else if (decimals === 1)
                sell += "00 STEEM";
            else if (decimals === 2)
                sell += "0 STEEM";
            else
                sell += " STEEM";

            steem.broadcast.limitOrderCreate(account['wif'], name, randy.getRandBits(32),
                reward_sbd, sell, false, seconds + 604800, function (err, result) {
                    console.log("sent buy order for " + name + " : " + sell);
                    if (account['power_up']) {
                        setTimeout(function () { // waiting 2 minutes for the order to go through
                            power_up(account['wif'], name, name, sell);
                            return resolve("=");
                        }, 120000);
                    } else
                        return resolve("=");
                });
        } else
            return resolve("=")
    });
}


function execute() {
    console.log("Getting the rewards...");
    for (var account in accounts) {

        steem.api.getAccounts([account], async  function (err, response) {
            var reward_sbd = response[0]['reward_sbd_balance']; // will be claimed as Steem Dollars (SBD)
            var reward_steem = response[0]['reward_steem_balance']; // this parameter is always '0.000 STEEM'
            var reward_vests = response[0]['reward_vesting_balance']; // this is the actual VESTS that will be claimed as SP

            var name = response[0].name;
            if (accounts[name].always_convert === true) {
                if (parseFloat(response[0].sbd_balance) > 0)
                {
                    await sell_sbd(accounts[name], response[0].sbd_balance, name);
                }
            }

            if (accounts[name].convert_action === "powerup") {
                if (parseFloat(response[0].balance) > 0)
                {
                    power_up(accounts[name]['wif'], name, accounts[name].convert_to_account, response[0].balance);
                    console.log(response[0].balance + " on "+name+", powering it up to "+ accounts[name].convert_to_account)
                }
            } else if (accounts[name].convert_action === "put_in_savings") {
                if (parseFloat(response[0].balance) > 0)
                {
                    transfer_to_savings(accounts[name]['wif'],name, accounts[name].convert_to_account, response[0].balance);
                    console.log(response[0].balance + " on "+name+", putting it in the savings to "+ accounts[name].convert_to_account)
                }
            }

            if (parseFloat(reward_sbd) > 0 || parseFloat(reward_steem) > 0 || parseFloat(reward_vests) > 0) {
                steem.broadcast.claimRewardBalance(accounts[name]['wif'], name, reward_steem, reward_sbd, reward_vests, async function (err, result) {
                    console.log(name + " reward : " + reward_sbd + " SBD, " + reward_steem + " STEEM " + reward_vests + " vests");
                    if (parseFloat(reward_sbd) > 0) {
                        await sell_sbd(accounts[name], reward_sbd, name)
                    }

                });
            }
        });
    }
}


function run() {
    execute();
    setInterval(execute, 300000);
};

console.log("Running...");
run();



function power_up(Activekey, from, to, amount) {
    steem.broadcast.transferToVesting(Activekey, from, to, amount, "",function(err, result) {

    });
}

function transfer_to_savings(Activekey, from, to, amount) {
    steem.broadcast.transferToSavings(Activekey, from, to, amount, "",function(err, result) {

    });
}


