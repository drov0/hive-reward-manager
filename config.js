module.exports =
    {
        "howo" : {
            "wif":"activewif",
            "powerup" : true,
            "max_ratio" : 1.3,
            "convert_action" : "powerup", // power up the liquid steem
            "convert_to_account" : "howo", // to the account howo
            "reset_power_down" : false // Do not reset the power down every week, if you don't power down and actively earn rewards, no need to set this to true
        },
        "account2" : {
            "wif":"activewif",
            "powerup" : true,
            "max_ratio" : 1.3,
            "convert_action" : "put_in_savings", // put in savings the liquid steem
            "convert_to_account" : "howo", // to the account howo which is another account
            "reset_power_down" : false
        }// etc
    };