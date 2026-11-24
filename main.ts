// Pump.fun Paper Sprint: Any Bot Can Win — paper bot, agent-fun/replay/v2.
// Strategy (deterministic, stdlib only, no clock / no randomness):
//  1. completion-chaser: a pump.fun curve migrates at 85 SOL real reserve, so when a
//     curve's real SOL first reaches 55, buy 0.20 SOL, then ride it with a 35% trailing
//     stop from the peak price, or exit after 300 slots, whichever comes first.
//  2. spray: buy 0.01 SOL in each fresh curve once its real SOL reaches 1 (the 1%
//     per-order cap then allows exactly 0.01 SOL), up to 22 spray entries and at most
//     1 open at once, exit on a 10% trailing stop or after 30 slots. The spray exists
//     only to clear the guardrail: >=20 distinct mints with a >=0.01 SOL round trip,
//     so it exits fast and cheap instead of pretending to be a profit leg.
//  3. never more than 5 open positions (harness cap); chaser entries take priority.
// Prices are virtual-reserve ratios (virtual_quote / virtual_token), compared with
// BigInt cross-multiplication so no float ever enters a decision.
import { runBot, LAMPORTS_PER_SOL } from './vendor/makefun-bot.ts';

const SOL = LAMPORTS_PER_SOL;
const CHASER_REAL = 55n * SOL; // enter the chaser when real SOL first hits 55
const CHASER_BUY = 200_000_000n; // 0.20 SOL
const CHASER_STOP = 1500n; // 15% trailing stop, in bps — variant V2 check
const CHASER_MAX_SLOTS = 300;
const SPRAY_BUY = 10_000_000n; // 0.01 SOL
const SPRAY_MIN_REAL = 1n * SOL; // 1% cap allows 0.01 SOL once real SOL >= 1
const SPRAY_STOP = 1000n; // 10% trailing stop, in bps
const SPRAY_MAX_SLOTS = 30; // spray exits fast on purpose: it is guardrail only, not a profit leg
const SPRAY_MAX_ENTRIES = 22; // guardrail needs 20 round trips; 22 leaves room for a failed buy
const SPRAY_MAX_OPEN = 1; // spray must not crowd out the chaser, which is the money leg
const SLIPPAGE = 500; // 5% max slippage on every order
const BPS = 10_000n;

type Kind = 'chaser' | 'spray';

interface Track {
  kind: Kind;
  buySlot: number;
  filled: boolean; // true once the buy fill has shown up in state.positions
  peakQ: bigint; // virtual quote reserves at the peak price
  peakT: bigint; // virtual token reserves at the peak price
}

const tracks = new Map<string, Track>();
const chaserTried = new Set<string>();
const sprayTried = new Set<string>();
let sprayEntries = 0;

function priceWorseThanPeak(
  q: bigint, t: bigint, peakQ: bigint, peakT: bigint, stopBps: bigint,
): boolean {
  // current price q/t < peak price * (1 - stop)  <=>  q * peakT * 10000 < peakQ * t * (10000-stop)
  return q * peakT * BPS < peakQ * t * (BPS - stopBps);
}

function priceAbovePeak(q: bigint, t: bigint, peakQ: bigint, peakT: bigint): boolean {
  return q * peakT > peakQ * t;
}

await runBot({
  onBatch(state, batch) {
    const orders: { side: 'buy' | 'sell'; mint: string; quote_lamports?: bigint; token_amount?: bigint; max_slippage_bps: number }[] = [];
    const slot = batch.slot;

    // Drop tracks whose position is gone — but a track created at buy-decision time
    // has no position until its fill lands 2 slots later, so keep unfilled tracks
    // while their buy is still pending, and drop them only once the fill window has
    // passed with no position (the buy was rejected or failed). Without this, the
    // first 5 fills would sit unexited forever and block every later entry.
    const pendingBuy = new Set<string>();
    for (const p of state.pending.values()) if (p.order.side === 'buy') pendingBuy.add(p.order.mint);
    for (const [mint, tr] of [...tracks.entries()]) {
      if (state.positions.has(mint)) {
        tr.filled = true;
        continue;
      }
      if (!tr.filled && (pendingBuy.has(mint) || slot - tr.buySlot <= 10)) continue;
      tracks.delete(mint);
    }

    // 1. Manage open positions: update peaks, exit on trailing stop or age.
    for (const [mint, tr] of tracks) {
      if (!tr.filled) continue;
      const curve = state.curves.get(mint);
      const pos = state.positions.get(mint);
      if (!curve || curve.complete || !pos || pos.token_amount <= 0n) continue;
      const q = curve.virtual_quote_reserves;
      const t = curve.virtual_token_reserves;
      if (t <= 0n) continue;
      if (priceAbovePeak(q, t, tr.peakQ, tr.peakT)) {
        tr.peakQ = q;
        tr.peakT = t;
      }
      const stop = tr.kind === 'chaser' ? CHASER_STOP : SPRAY_STOP;
      const maxSlots = tr.kind === 'chaser' ? CHASER_MAX_SLOTS : SPRAY_MAX_SLOTS;
      if (priceWorseThanPeak(q, t, tr.peakQ, tr.peakT, stop) || slot - tr.buySlot >= maxSlots) {
        orders.push({ side: 'sell', mint, token_amount: pos.token_amount, max_slippage_bps: SLIPPAGE });
        tracks.delete(mint);
      }
    }

    // 2. Entries, in two passes so the chaser (the money leg) always gets the
    // free position slots before the spray (which exists only for the guardrail).
    const free = () => state.freeCashLamports();
    let planned = state.committedPositionCount();
    const canBuy = (amount: bigint, mint: string) =>
      planned < 5 &&
      free() >= amount + state.txFeeLamports() &&
      state.maxBuyLamports(mint) >= amount;
    const noteBuy = (mint: string, kind: Kind, curve: { virtual_quote_reserves: bigint; virtual_token_reserves: bigint }) => {
      // filled flips true once the buy's fill shows in state.positions (2 slots later).
      tracks.set(mint, { kind, buySlot: slot, filled: false, peakQ: curve.virtual_quote_reserves, peakT: curve.virtual_token_reserves });
      planned++;
    };
    // Pass 1 — chaser: real SOL crossed 55, one attempt per mint, 0.20 SOL.
    for (const curve of state.curves.values()) {
      if (orders.length >= 14) break;
      if (curve.complete) continue;
      const mint = curve.mint;
      if (tracks.has(mint) || state.positions.has(mint) || chaserTried.has(mint)) continue;
      if (curve.real_quote_reserves < CHASER_REAL) continue;
      chaserTried.add(mint);
      if (!canBuy(CHASER_BUY, mint)) continue;
      orders.push({ side: 'buy', mint, quote_lamports: CHASER_BUY, max_slippage_bps: SLIPPAGE });
      noteBuy(mint, 'chaser', curve);
    }
    // Pass 2 — spray: fresh curve with 1 <= real SOL < 55, one 0.01 SOL buy per mint.
    for (const curve of state.curves.values()) {
      if (orders.length >= 14) break;
      if (curve.complete) continue;
      const mint = curve.mint;
      if (tracks.has(mint) || state.positions.has(mint) || sprayTried.has(mint)) continue;
      const real = curve.real_quote_reserves;
      if (real < SPRAY_MIN_REAL || real >= CHASER_REAL) continue;
      sprayTried.add(mint);
      if (sprayEntries >= SPRAY_MAX_ENTRIES) continue;
      let sprayOpen = 0;
      for (const tr of tracks.values()) if (tr.kind === 'spray') sprayOpen++;
      if (sprayOpen >= SPRAY_MAX_OPEN) continue;
      if (!canBuy(SPRAY_BUY, mint)) continue;
      orders.push({ side: 'buy', mint, quote_lamports: SPRAY_BUY, max_slippage_bps: SLIPPAGE });
      noteBuy(mint, 'spray', curve);
      sprayEntries++;
    }
    return orders;
  },
});
