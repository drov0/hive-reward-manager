module.exports =
    {
        "howo" : {
            "wif":"activewif",
            "posting_wif":"postingwif", // required for claiming rewards (HF28+)
            "max_ratio" : 1.3,
            "convert_hbd" : true,
            "liquid_action" : "powerup", // power up the liquid hive
            "liquid_to_account" : "howo", // to the account howo
            "reset_power_down" : false // Do not reset the power down every week, if you don't power down and actively earn rewards, no need to set this to true
        },
        "account2" : {
            "wif":"activewif",
            "posting_wif":"postingwif", // required for claiming rewards (HF28+)
            "max_ratio" : 1.3,
            "sell_hbd" : true,
            "liquid_action" : "put_in_savings", // put in savings the liquid hive
            "liquid_hbd_action" : "transfer", // transfer the liquid hbd to an account
            "liquid_hbd_action_min" : 200, // minimum value before executing the liquid hbd action
            "liquid_hbd_to_account" : "howo", // where to transfer the liquid hbd
            "liquid_hbd_memo" : "here you go :)", // what memo to attach to the hbd
            "liquid_to_account" : "howo", // to the account howo which is another account
            "reset_power_down" : false
        }// etc
    };
