# Mexy fee hold (rider + delivery dashboard)

**Date:** 2026-09-08

## Goal

When an out-of-coverage quote has a Mexy tariff (`mexy_cents > 0`), persist that fixed commission, show it to the rider and Mexy dashboard, hold it against rider credit on assign (any payment method), and let Mexy release it. Restaurants never see or release it.

## Rules

- Same split as the quote simulator: Mexy amount is fixed with or without rain; if `mexy_cents == 0`, no Mexy UI and no Mexy hold.
- Hold kind `mexy_fee` is independent of `restaurant_cash`.
- Restaurant `confirm-rider-cash` only releases `restaurant_cash`.
- Mexy dashboard releases `mexy_fee`.
- Both holds count against `credit_held_cents` / credit limit.
- Assignment engine requires available credit ≥ cash collect (if cash) + mexy fee.

## Visibility

- Rider app: offer, active job, history, credit holds.
- Delivery dashboard: monitor credit list + history.
- Restaurant panel and public quote: total delivery fee only.
