##  Steem reward manager or srm for short

Srm is a tool to automatically redeem your steem rewards, and if they contain sbd, go to the internal market to buy steem with it at the current market price. It will check every minute if there is pending rewards or not.

To use it, update the file "config.js" and put as many account as you want. Just don't forget that the script needs your active key (because I execute some market calls).

This means that you will always have liquid steem, never again will you see the "redeem reward" button nor sbd.  

### Technology Stack

The script is made in nodejs and uses [Steem-js](https://github.com/steemit/steem-js). The easiest way to run it is to use [pm2](http://pm2.keymetrics.io/) 

ideally this is what you would do :

> git clone git@github.com:drov0/Steem-reward-manager.git
> cd Steem-reward-manager/
> npm install --save 
> nano config.js # Edit to put your account(s) and active key(s)
> pm2 start redeemer.js

### Future developments 

In the future I might adapt this script to add some more options :

- Place limit orders instead of market

### How to contribute?

If you have questions, feel free to hit me up : @howo on https://steemit.chat 

If you feel like working on your own directly, feel free, just submit a pull request and we'll go from there. There are no specific rules, try to follow the coding style and put comments on unclear functions but that's it. 


An app by @howo.
