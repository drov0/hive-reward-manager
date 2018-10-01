var randy = require("randy");
var accounts = require('./config.js');
const moment = require("moment");

var dsteem = require('dsteem');

var client = new dsteem.Client('https://api.steemit.com');

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
            function() {
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

async function sell_sbd(account, reward_sbd, name)
{
    return new Promise(async resolve => {
        const price_data = await client.database.call("get_order_book");
        const seconds = Math.round(Date.now() / 1000) + 604800;
        const date = (new Date(seconds * 1000)).toISOString().slice(0, 19);
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


            const op = [
                "limit_order_create",
                {
                    amount_to_sell : reward_sbd,
                    expiration : date,
                    fill_or_kill : false,
                    min_to_receive : sell,
                    orderid : randy.getRandBits(32),
                    owner : name
                }
            ];

            const privateKey = dsteem.PrivateKey.fromString(account['wif']);

            client.broadcast.sendOperations([op], privateKey).then(
                function() {
                    console.log("sent buy order for " + name + " : " + sell);
                    return resolve("=");
                },
                function(error) {
                    console.error(error);
                    return resolve("-");
                }
            );

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

async function execute(times) {
    console.log("Execution minute : " + times);
    for (let account in accounts) {

        let response = await client.database.getAccounts([account]);
        const reward_sbd = response[0]['reward_sbd_balance']; // will be claimed as Steem Dollars (SBD)
        const reward_steem = response[0]['reward_steem_balance']; // this parameter is always '0.000 STEEM'
        const reward_vests = response[0]['reward_vesting_balance']; // this is the actual VESTS that will be claimed as SP

        const name = response[0].name;

        if (accounts[name].reset_power_down === true) {
            const current_date = moment();
            const power_down_date = moment(response[0].next_vesting_withdrawal);
            const duration = moment.duration(power_down_date.diff(current_date));

            if (duration._milliseconds > 0 && accounts[name].power_down_date === undefined) {
                accounts[name].power_down_date = response[0].next_vesting_withdrawal;
            } else if (accounts[name].power_down_date !== undefined && accounts[name].power_down_date !== response[0].next_vesting_withdrawal) {
                console.log("reset power down on " + name + "Powering down " + response[0].vesting_shares);
                await power_down(name, accounts[name]['wif'], response[0].vesting_shares);
                accounts[name].power_down_date = response[0].next_vesting_withdrawal;
            }
        }

        // Triggers every 5 minutes
        if (times % 5 === 0 || times === 0) {
            if (accounts[name].convert_sbd === true) {
                if (parseFloat(response[0].sbd_balance) > 0) {
                    console.log("Selling sbd and executing actions on it for account : " + name);
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
            console.log("Claiming rewards for account : " + name);
            if (parseFloat(reward_sbd) > 0 || parseFloat(reward_steem) > 0 || parseFloat(reward_vests) > 0) {

                const privateKey = dsteem.PrivateKey.fromString(accounts[name]['wif']);
                const op = [
                    'claim_reward_balance',
                    {
                        account: name,
                        reward_steem: reward_steem,
                        reward_sbd: reward_sbd,
                        reward_vests: reward_vests,
                    },
                ];
                await client.broadcast.sendOperations([op], privateKey).catch( function(error) {
                    console.error(error);
                });

                console.log(name + " reward : " + reward_sbd + " , " + reward_steem + " " + reward_vests);
                if (parseFloat(reward_sbd) > 0) {
                    await sell_sbd(accounts[name], reward_sbd, name)
                }
            }
        }

    }
}


async function run() {
    let i = 0;
    while (true) {
        await execute(i);
        await wait(60);
        i++;

        if (i > 60)
            i = 0;
    }
}

console.log("Running...");
run();



function power_up(Activekey, from, to, amount) {

    const privateKey = dsteem.PrivateKey.fromString(Activekey);

    const op = [
        'transfer_to_vesting',
        {
            from: from,
            to: to,
            amount: amount,
        },
    ];
    client.broadcast.sendOperations([op], privateKey).then(
        function(result) {

        },
        function(error) {
        }
    );
}

function transfer_to_savings(Activekey, from, to, amount) {

    const privateKey = dsteem.PrivateKey.fromString(Activekey);

    const op = [
        'transfer_to_savings',
        {
            from: from,
            to: to,
            amount: amount,
            memo : "",
            request_id : randy.getRandBits(32),

        },
    ];
    client.broadcast.sendOperations([op], privateKey).then(
        function(result) {

        },
        function(error) {
        }
    );

}


