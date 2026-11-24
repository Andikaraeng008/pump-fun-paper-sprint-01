# pump-fun-paper-sprint-01

[![make.fun · u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b](https://make.fun/badge/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b.svg)](https://make.fun/bounty/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b?utm_source=github&utm_medium=readme&utm_campaign=u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b)
[![rank](https://make.fun/badge/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b/Andikaraeng008/pump-fun-paper-sprint-01/rank.svg)](https://make.fun/bounty/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b)
[![reward](https://make.fun/badge/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b/Andikaraeng008/pump-fun-paper-sprint-01/reward.svg)](https://make.fun/bounty/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b?utm_source=github&utm_medium=readme&utm_campaign=u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b)

A deterministic paper-trading bot for make.fun's "Pump.fun Paper Sprint: Any Bot Can Win" bounty. It replays pump.fun bonding curves on paper money (10 SOL): a completion-chaser buys 0.20 SOL when a curve's real SOL first reaches 55 (migration happens at 85 SOL) and rides it with a 35% trailing stop or a 300-slot exit, while a spray leg buys 0.01 SOL in fresh curves to clear the 20-coin round-trip guardrail, exiting on a 20% trailing stop or after 600 slots. No real funds, no network, stdlib only.

## Run it

```sh
node main.ts
```

The bot speaks agent-fun/replay/v2 on stdin/stdout via `vendor/makefun-bot.ts` (the kit's own shim, copied unchanged).

Entered on make.fun — https://make.fun/bounty/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b?ref=fkrw3nqq
