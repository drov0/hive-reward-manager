##  Steem reward manager or srm for short

Srm is a tool to automatically redeem your steem rewards, and if they contain sbd, go to the internal market to buy steem with it at the current market price. It will check every minute if there is pending rewards or not.

To use it, update the file "config.example.js" and put as many account as you want. Just don't forget that the script needs your active key (because I execute some market calls).

This means that you will always have liquid steem, never again will you see the "redeem reward" button nor sbd.  

Please check https://steemit.com/@howo to check for updates, I blog about it occasionally 

## Config options 

Current supported options are as follow : 


>max_ratio : (number eg 1.3) maximum STEEM to SBD ratio, this is to set a hard cap to not sell sbd if it hits that limit

>sell_sbd : (true/false) Whether to sell liquid sbd or not, uses max_ratio

>convert_sbd : (true/false) Whether to convert liquid sbd or not

>liquid_action :(put_in_savings/powerup) what to do with liquid STEEM, available options are : "powerup" (power it up), or "put_in_savings"

>liquid_to_account :(accountname eg : "howo") it is possible to power the liquid STEEM  or to put it in the savings of another account using this option 

>reset_power_down :(true/false) wether to reset the power down ever week or not if your steem power keeps climbing 

### Technology Stack

The script is made in nodejs and uses [Steem-js](https://github.com/steemit/steem-js). The easiest way to run it is to use [pm2](http://pm2.keymetrics.io/) 

ideally this is what you would do :

> git clone git@github.com:drov0/Steem-reward-manager.git
> cd Steem-reward-manager/
> npm install --save 
> nano config.example.js # Edit to put your account(s) and active key(s)
> pm2 start redeemer.js

### Future developments 

In the future I might adapt this script to add some more options :

- Place limit orders instead of market

### How to contribute?

If you have questions, feel free to hit me up : @howo on https://steemit.chat 

If you feel like working on your own directly, feel free, just submit a pull request and we'll go from there. There are no specific rules, try to follow the coding style and put comments on unclear functions but that's it. 


An app by @howo.
