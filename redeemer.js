const randy = require("randy");
const accounts = require('./config.js');
const moment = require("moment");
const dhive = require('@hiveio/dhive');
const client = new dhive.Client('https://api.hive.blog', {rebrandedApi: true});

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
 * @param {float} num - Number to be analyzed
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

/**
 * Get the median HIVE price in USD from the blockchain
 * @return {Promise<number>} median HIVE price in USD
 */
async function get_median_hive_price() {
    const feedHistory = await client.database.call('get_feed_history');
    const base = parseFloat(feedHistory.current_median_history.base);
    const quote = parseFloat(feedHistory.current_median_history.quote);
    // current_median_history is HBD/HIVE price, so HIVE price in USD = base (HBD assumed $1)
    return base / quote;
}

/**
 * Get the best available market price for selling HBD
 * Checks the orderbook to see what price we can actually get
 * @param {number} hbd_amount - Amount of HBD to sell
 * @return {Promise<number>} HIVE amount we'd receive at market price
 */
async function get_market_price_for_hbd(hbd_amount) {
    try {
        // Get orderbook - we want to see buy orders (people buying HBD with HIVE)
        const orderbook = await client.database.call('get_order_book', [50]);

        // We're selling HBD, so we look at the "bids" (buy orders for HBD)
        // Each bid shows: someone wants to buy X HBD and will pay Y HIVE
        const bids = orderbook.bids;

        if (!bids || bids.length === 0) {
            console.log('No buy orders in orderbook, will use fallback pricing');
            return null;
        }

        let hbd_remaining = hbd_amount;
        let total_hive = 0;

        // Walk through the orderbook to see how much HIVE we'd get
        for (const bid of bids) {
            // bid.hbd: amount of HBD they want to buy
            // bid.hive: amount of HIVE they're offering
            // bid.real_price: HBD price in HIVE (e.g., 0.112 means 1 HBD = 0.112 HIVE)
            const bid_hbd = bid.hbd;
            const bid_hive = bid.hive;

            if (hbd_remaining <= 0) break;

            const hbd_to_fill = Math.min(hbd_remaining, bid_hbd);
            const hive_received = hbd_to_fill * (bid_hive / bid_hbd);

            total_hive += hive_received;
            hbd_remaining -= hbd_to_fill;
        }

        if (hbd_remaining > 0) {
            // Orderbook doesn't have enough depth
            console.log(`Orderbook only has depth for ${hbd_amount - hbd_remaining} HBD of ${hbd_amount} HBD`);
            return null;
        }

        return total_hive;

    } catch (error) {
        console.error('Error fetching orderbook:', error);
        return null;
    }
}

/**
 * Cancel all open orders for an account
 * @param {string} wif - Active key for the account
 * @param {string} account - Account name
 * @return {Promise<number>} number of orders cancelled
 */
async function cancel_all_orders(wif, account) {
    return new Promise(async resolve => {
        try {
            const openOrders = await client.database.call('get_open_orders', [account]);

            if (openOrders.length === 0) {
                return resolve(0);
            }

            const privateKey = dhive.PrivateKey.fromString(wif);
            const operations = openOrders.map(order => [
                'limit_order_cancel',
                {
                    owner: account,
                    orderid: order.orderid
                }
            ]);

            await client.broadcast.sendOperations(operations, privateKey);
            console.log(`Cancelled ${openOrders.length} orders for ${account}`);
            return resolve(openOrders.length);
        } catch (error) {
            console.error(`Error cancelling orders for ${account}:`, error);
            return resolve(0);
        }
    });
}

/**
 * Sell HBD on the internal market at best available price with 2% max slippage
 * Only sells if there's at least 10 HBD and price is acceptable
 * @param {object} account - Account config object
 * @param {string} reward_hbd - HBD balance as string (e.g., "10.000 HBD")
 * @param {string} name - Account name
 * @return {Promise<string>} status
 */
async function sell_hbd(account, reward_hbd, name)
{
    return new Promise(async resolve => {
        try {
            // Extract numeric value from HBD balance
            const hbd_amount = parseFloat(reward_hbd);

            // Only sell if we have at least 10 HBD
            if (hbd_amount < 10) {
                console.log(`${name}: HBD balance ${hbd_amount} is below 10 HBD minimum, skipping sale`);
                return resolve("=");
            }

            // Get median HIVE price in USD for calculating floor price
            const hive_price_usd = await get_median_hive_price();

            // Calculate minimum acceptable HIVE (floor at $0.98 per HBD)
            const min_hive_floor = (hbd_amount * 0.98) / hive_price_usd;

            // Try to get actual market price from orderbook
            let hive_to_receive = await get_market_price_for_hbd(hbd_amount);

            let price_source = 'market';
            let effective_hbd_price = null;

            if (hive_to_receive === null) {
                // Fallback to floor price if we can't get market price
                hive_to_receive = min_hive_floor;
                price_source = 'floor (no market data)';
                effective_hbd_price = 0.98;
            } else {
                // Calculate what price we're actually getting
                effective_hbd_price = (hive_to_receive * hive_price_usd) / hbd_amount;

                // If market price is below our floor, use the floor instead
                if (hive_to_receive < min_hive_floor) {
                    console.log(`${name}: Market price $${effective_hbd_price.toFixed(4)} is below $0.98 floor, using floor price`);
                    hive_to_receive = min_hive_floor;
                    price_source = 'floor (market below threshold)';
                    effective_hbd_price = 0.98;
                }
            }

            // Format HIVE amount to 3 decimal places
            let hive_amount_str = hive_to_receive.toFixed(3) + " HIVE";

            console.log(`${name}: Selling ${reward_hbd} for minimum ${hive_amount_str} (HIVE price: $${hive_price_usd.toFixed(4)}, effective HBD price: $${effective_hbd_price.toFixed(4)}, source: ${price_source})`);

            // Create the limit order
            const seconds = Math.round(Date.now() / 1000) + 604800; // 1 week expiry
            const date = (new Date(seconds * 1000)).toISOString().slice(0, 19);

            const op = [
                "limit_order_create",
                {
                    amount_to_sell: reward_hbd,
                    expiration: date,
                    fill_or_kill: false,
                    min_to_receive: hive_amount_str,
                    orderid: randy.getRandBits(32),
                    owner: name
                }
            ];

            const privateKey = dhive.PrivateKey.fromString(account['wif']);

            await client.broadcast.sendOperations([op], privateKey);
            console.log(`${name}: Created sell order for ${reward_hbd} -> ${hive_amount_str}`);
            return resolve("=");

        } catch (error) {
            console.error(`${name}: Error selling HBD:`, error);
            return resolve("-");
        }
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
                console.log("reset power down on " + name + " Powering down " + current_available_shares);
                await power_down(name, accounts[name]['wif'], current_available_shares);
                let updated_account = await client.database.getAccounts([account]);
                accounts[name].power_down_date = updated_account[0].next_vesting_withdrawal;
            }
        }

        // Triggers every 5 minutes
        if (times % 5 === 0 || times === 0) {
            // Handle HBD balance
            if (parseFloat(response[0].hbd_balance) > 0) {
                if (accounts[name].convert_hbd === true) {
                    console.log("converting hbd " + name);
                    await convert_hbd(accounts[name]['wif'], name, parseFloat(response[0].hbd_balance))
                } else if (accounts[name].sell_hbd === true) {
                    console.log("Selling hbd and executing actions on it for account : " + name);
                    await sell_hbd(accounts[name], response[0].hbd_balance, name);
                } else if (accounts[name].liquid_hbd_action === "transfer") {
                    if (accounts[name].liquid_hbd_to_account !== "") {
                        // TODO: don't duplicate this code
                        if (accounts[name].liquid_hbd_action_min !== undefined) {
                            if (accounts[name].liquid_hbd_action_min <= parseFloat(response[0].hbd_balance)) {
                                console.log(`Transferring ${response[0].hbd_balance} hbd from ${name} to ${accounts[name].liquid_hbd_to_account}`);
                                await transfer(accounts[name]['wif'], name, accounts[name].liquid_hbd_to_account, response[0].hbd_balance, accounts[name].liquid_hbd_memo);
                            }
                        } else {
                            console.log(`Transferring ${response[0].hbd_balance} hbd from ${name} to ${accounts[name].liquid_hbd_to_account}`);
                            await transfer(accounts[name]['wif'], name, accounts[name].liquid_hbd_to_account, response[0].hbd_balance, accounts[name].liquid_hbd_memo);
                        }
                    } else {
                        console.log(`cannot transfer hbd from ${name}: liquid_hbd_to_account is not defined`)
                    }
                } else if (accounts[name].liquid_hbd_action === "put_in_savings") {
                    if (accounts[name].liquid_hbd_action_min !== undefined) {
                        if (accounts[name].liquid_hbd_action_min <= parseFloat(response[0].hbd_balance)) {
                            if (parseFloat(response[0].hbd_balance) > 0) {
                                transfer_to_savings(accounts[name]['wif'], name, accounts[name].liquid_to_account, response[0].hbd_balance);
                                console.log(response[0].hbd_balance + " on " + name + ", putting it in the savings to " + accounts[name].liquid_to_account)
                            }
                        }
                    }
                }
            }

            // Handle liquid HIVE balance (independent of HBD balance)
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
            } else if (accounts[name].liquid_action === "transfer") {
                if (accounts[name].liquid_to_account !== "") {
                    const hive_balance = parseFloat(response[0].balance);
                    const min_threshold = accounts[name].liquid_action_min || 0;

                    if (hive_balance >= min_threshold) {
                        console.log(`Transferring ${response[0].balance} HIVE from ${name} to ${accounts[name].liquid_to_account}`);
                        await transfer(accounts[name]['wif'], name, accounts[name].liquid_to_account, response[0].balance, accounts[name].liquid_memo || "");
                    }
                } else {
                    console.log(`cannot transfer HIVE from ${name}: liquid_to_account is not defined`)
                }
            }

            // if it's been an hour since the last execution.
            if (times === 60) {
                console.log("Claiming rewards for account : " + name);

                // Cancel any existing orders before creating new ones
                if (accounts[name].sell_hbd === true) {
                    console.log(`${name}: Cancelling any existing HBD sell orders`);
                    await cancel_all_orders(accounts[name]['wif'], name);
                }

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
                            await convert_hbd(accounts[name]['wif'], name, parseFloat(reward_hbd))
                        }
                        else if (accounts[name].sell_hbd === true) {
                            console.log("Selling hbd for account : " + name);
                            await sell_hbd(accounts[name], parseFloat(reward_hbd), name);
                        }
                    }
                }

                // After claiming, check if there's HBD balance to sell
                if (accounts[name].sell_hbd === true && parseFloat(response[0].hbd_balance) >= 10) {
                    console.log(`${name}: Selling existing HBD balance after hourly check`);
                    await sell_hbd(accounts[name], response[0].hbd_balance, name);
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

async function convert_hbd(activekey, owner, amount, tries = 0) {

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
                return convert_hbd(activekey, owner, amount, ++tries);
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

function transfer(Activekey, from, to, amount, memo) {
    const privateKey = dhive.PrivateKey.fromString(Activekey);
    client.broadcast.transfer({from, to, amount, memo}, privateKey).then(
        function(result) {
        },
        function(error) {
            console.error(error)
        }
    );
}

