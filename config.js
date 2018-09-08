module.exports =
    {
        "howo" : {
            "wif":"activewif",
            "powerup" : true,
            "max_ratio" : 1.3,
            "convert_action" : "powerup", // power up the liquid steem
            "convert_to_account" : "howo" // to the account howo
        },
        "account2" : {
            "wif":"activewif",
            "powerup" : true,
            "max_ratio" : 1.3,
            "convert_action" : "put_in_savings", // put in savings the liquid steem
            "convert_to_account" : "howo" // to the account howo which is another account
        }// etc
    };