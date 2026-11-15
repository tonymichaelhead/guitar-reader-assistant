# 3. Seeded randomness and a pure music core

Date: 2026-11-15
Status: Accepted

## Context

A generator built on `Math.random` cannot be tested for more than "it did not crash": the same call gives different music each time. The musical generator has many rules whose effect only shows in the output, and some of them are statistical (most motion should be stepwise, a small share of notes chromatic).

## Decision

Everything under `src/music/` is pure. Generators take an `rng` function and use nothing else for randomness; `generateScore(settings, seed)` builds that function from the seed with `mulberry32`. Only `src/main.js` picks seeds. The seed is shown to the user as the study's number.

## Consequences

- The same settings and seed always give the same score, so tests can assert exact properties of specific studies and statistics over ranges of seeds.
- A study can be reproduced from its number, as long as the settings and the generator code are the same. Changing a rule or a weight changes what a given number produces.
- Every new generator function must accept and pass on `rng`. One stray `Math.random` call breaks reproducibility without any error.
- `mulberry32` is small and fast, and is not suitable for anything that needs unpredictability. Nothing here does.
