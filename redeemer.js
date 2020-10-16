const randy = require("randy");
const accounts = require('./config.js');
const moment = require("moment");
const dhive = require('@hiveio/dhive');
const client = new dhive.Client('https://anyx.io', {rebrandedApi: true});

function power_down(account, wif, vesting)
{
    return new Promise(async resolve => {

        const privateKey = dhive.PrivateKey.fromString(wif);
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

async function sell_hbd(account, reward_hbd, name)
{
    return new Promise(async resolve => {
        const price_data = await client.database.call("get_order_book");
        const seconds = Math.round(Date.now() / 1000) + 604800;
        const date = (new Date(seconds * 1000)).toISOString().slice(0, 19);
        const price = price_data.asks[0].real_price;
        if (parseFloat(price) <= account['max_ratio']) {
            console.log(reward_hbd + " on the account, price is "+ price +" hbd per hive, selling it ");
            let sell = Math.round((parseFloat(reward_hbd) * ((1 - parseFloat(price)) + 1)) * 1000) / 1000;

            const decimals = decimalPlaces(sell);

            if (decimals === 0)
                sell += ".000 HIVE";
            else if (decimals === 1)
                sell += "00 HIVE";
            else if (decimals === 2)
                sell += "0 HIVE";
            else
                sell += " HIVE";


            const op = [
                "limit_order_create",
                {
                    amount_to_sell : reward_hbd,
                    expiration : date,
                    fill_or_kill : false,
                    min_to_receive : sell,
                    orderid : randy.getRandBits(32),
                    owner : name
                }
            ];

            const privateKey = dhive.PrivateKey.fromString(account['wif']);

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
        const reward_hbd = response[0]['reward_hbd_balance']; // will be claimed as hive Dollars (HBD)
        const reward_hive = response[0]['reward_hive_balance']; // this parameter is always '0.000 HIVE'
        const reward_vests = response[0]['reward_vesting_balance']; // this is the actual VESTS that will be claimed as SP

        const name = response[0].name;

        if (accounts[name].reset_power_down === true) {
            const current_date = moment();
            const power_down_date = moment(response[0].next_vesting_withdrawal);
            const duration = moment.duration(power_down_date.diff(current_date));

            if (duration._milliseconds > 0 && accounts[name].power_down_date === undefined) {
                accounts[name].power_down_date = response[0].next_vesting_withdrawal;
            } else if (accounts[name].power_down_date !== undefined && accounts[name].power_down_date !== response[0].next_vesting_withdrawal) {
                // Reason for this is that you can't power down all your sp if you voting power isn't 100%
                // 100 is one extra 0.1%  just to be sure that the power down will work
                let current_available_shares = Math.floor((response[0].voting_power - 100) / 10000 * parseFloat(response[0].vesting_shares)) + ".000000 VESTS";
                console.log("reset power down on " + name + "Powering down " + current_available_shares);
                await power_down(name, accounts[name]['wif'], current_available_shares);
                let updated_account = await client.database.getAccounts([account]);
                accounts[name].power_down_date = updated_account[0].next_vesting_withdrawal;
            }
        }

        // Triggers every 5 minutes
        if (times % 5 === 0 || times === 0) {
            if (parseFloat(response[0].hbd_balance) > 0) {
                if (accounts[name].convert_hbd === true) {
                    console.log("converting hbd " + name);
                    convert_hbd(accounts[name]['wif'], name, parseFloat(response[0].hbd_balance))
                }
                else if (accounts[name].sell_hbd === true) {
                    console.log("Selling hbd and executing actions on it for account : " + name);
                    await sell_hbd(accounts[name], response[0].hbd_balance, name);
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
            if (parseFloat(reward_hbd) > 0 || parseFloat(reward_hive) > 0 || parseFloat(reward_vests) > 0) {

                const privateKey = dhive.PrivateKey.fromString(accounts[name]['wif']);
                const op = [
                    'claim_reward_balance',
                    {
                        account: name,
                        reward_hive: reward_hive,
                        reward_hbd: reward_hbd,
                        reward_vests: reward_vests,
                    },
                ];
                await client.broadcast.sendOperations([op], privateKey).catch( function(error) {
                    console.error(error);
                });

                console.log(name + " reward : " + reward_hbd + " , " + reward_hive + " " + reward_vests);
                if (parseFloat(reward_hbd) > 0) {
                  if (accounts[name].convert_hbd === true) {
                     console.log("converting hbd " + name);
                     convert_hbd(accounts[name]['wif'], name, parseFloat(reward_hbd))
                 }
                 else if (accounts[name].sell_hbd === true) {
                     console.log("Selling hbd for account : " + name);
                     await sell_hbd(accounts[name], parseFloat(reward_hbd), name);
                 }
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

function convert_hbd(activekey, owner, amount, tries = 0) {

    const privateKey = dhive.PrivateKey.fromString(activekey);

    const op = [
        'convert',
        {
            amount: new dhive.Asset(amount, "HBD"),
            owner: owner,
            requestid: Math.floor(Math.random() * 4294967294), // 4294967294 is the max request id possible
        },
    ];

    client.broadcast.sendOperations([op], privateKey).then(
        function(result) {
        },
        function(error) {
            if (error.message === "could not insert object, most likely a uniqueness constraint was violated: " && tries < 10)
                return convert_hbd(activekey, owner, amount, tries++);
            console.error(error.message);
        }
    );
}


function power_up(Activekey, from, to, amount) {

    const privateKey = dhive.PrivateKey.fromString(Activekey);

    const op = [
        'transfer_to_vesting',
        {
            from: from,
            to: to,
            amount: amount,
        },
    ];
    client.broadcast.sendOperations([op], privateKey).then(
        function(result) {},
        function(error) {}
    );
}

function transfer_to_savings(Activekey, from, to, amount) {

    const privateKey = dhive.PrivateKey.fromString(Activekey);

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
        function(result) {},
        function(error) {}
    );

}


