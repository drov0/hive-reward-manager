var steem = require('steem');
var randy = require("randy");
var accounts = require('./config.js')
const moment = require("moment")

steem.api.setOptions({url: 'https://api.steemit.com'});

const dsteem = require('dsteem');
let opts = {};
//connect to production server
opts.addressPrefix = 'STM';
opts.chainId =
    '0000000000000000000000000000000000000000000000000000000000000000';
//connect to server which is connected to the network/production
const client = new dsteem.Client('https://api.steemit.com');

function power_down(account, wif, vesting)
{
    return new Promise(async resolve => {

        const privateKey = dsteem.PrivateKey.fromString(wif);
        const op = [
            'withdraw_vesting',
            {
                account: account,
                vesting_shares: vesting,
            },
        ];
        client.broadcast.sendOperations([op], privateKey).then(
            function(result) {
                console.log("Power down reset on "+account);
                return resolve("=");
            },
            function(error) {
                console.error(error);
                return resolve("=");
            }
        );

    });
}



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
                    return resolve("=");
                });
        } else
            return resolve("=")
    });
}

function wait(time)
{
    return new Promise(resolve => {
        setTimeout(() => resolve('☕'), time*1000); // miliseconds to seconds
    });
}

function execute(times) {
    console.log("Execution minute : " + times);
    for (let account in accounts) {

        steem.api.getAccounts([account], async  function (err, response) {
            const reward_sbd = response[0]['reward_sbd_balance']; // will be claimed as Steem Dollars (SBD)
            const reward_steem = response[0]['reward_steem_balance']; // this parameter is always '0.000 STEEM'
            const reward_vests = response[0]['reward_vesting_balance']; // this is the actual VESTS that will be claimed as SP

            const name = response[0].name;

            if (accounts[name].reset_power_down === true) {
                const current_date = moment();
                const power_down_date = moment(response[0].next_vesting_withdrawal);
                const duration = moment.duration(power_down_date.diff(current_date));

                if (duration._milliseconds > 0 && accounts[name].power_down_date === undefined)
                {
                    accounts[name].power_down_date = response[0].next_vesting_withdrawal;
                } else if (accounts[name].power_down_date !== undefined && accounts[name].power_down_date !== response[0].next_vesting_withdrawal)
                {
                    console.log("reset power down on "+name +"Powering down "+ response[0].vesting_shares);
                    await power_down(name, accounts[name]['wif'], response[0].vesting_shares);
                    accounts[name].power_down_date = response[0].next_vesting_withdrawal;
                }
            }

            // Triggers every 5 minutes
            if (times%5 === 0) {
                console.log("Selling sbd and executing actions on it.");
                if (accounts[name].convert_sbd === true) {
                    if (parseFloat(response[0].sbd_balance) > 0) {
                        await sell_sbd(accounts[name], response[0].sbd_balance, name);
                    }
                }

                if (accounts[name].liquid_action === "powerup") {
                    if (parseFloat(response[0].balance) > 0) {
                        power_up(accounts[name]['wif'], name, accounts[name].liquid_to_account, response[0].balance);
                        console.log(response[0].balance + " on " + name + ", powering it up to " + accounts[name].liquid_to_account)
                    }
                } else if (accounts[name].liquid_action === "put_in_savings") {
                    if (parseFloat(response[0].balance) > 0) {
                        transfer_to_savings(accounts[name]['wif'], name, accounts[name].liquid_to_account, response[0].balance);
                        console.log(response[0].balance + " on " + name + ", putting it in the savings to " + accounts[name].liquid_to_account)
                    }
                }
            }

            // if it's been an hour since the last execution.
            if (times === 60) {
                console.log("Claiming rewards");
                if (parseFloat(reward_sbd) > 0 || parseFloat(reward_steem) > 0 || parseFloat(reward_vests) > 0) {
                    steem.broadcast.claimRewardBalance(accounts[name]['wif'], name, reward_steem, reward_sbd, reward_vests, async function () {
                        console.log(name + " reward : " + reward_sbd + " , " + reward_steem + " " + reward_vests);
                        if (parseFloat(reward_sbd) > 0) {
                            await sell_sbd(accounts[name], reward_sbd, name)
                        }

                    });
                }
            }
        });
    }


async function run() {
    let i = 0;
    while (true) {
        await wait(60);
        await execute(i);
        i++;

        if (i > 60)
            i = 0;
    }
}

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


