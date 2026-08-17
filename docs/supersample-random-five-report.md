# Five seeded-random supersampling trials

Generated through real TurtlePen MCP stdio with master seed `0x8f31c2d7`.
The inputs are random but reproducible; their SHA-256 hashes and saved run hashes make each result auditable.

## Loop contract

- Loop: `SWE-05 Edge Case Expansion`, five attempts total.
- Success: requested factor honored; final output remains 48x32 quadrants; near-binary strategy; weighted coverage survives; 4x has lower effective edge transitions without inflating effective ink; clean save/reopen/render.
- Mutation between attempts: source seed, dimensions, alpha mode, fit, detail, and generated structure.
- Stop: all five pass, or stop immediately on geometry drift, busy output, semantic ambiguity, persistence failure, or MCP error.

## Evidence ledger

| Attempt | Seed | Source | Pixels | Fit | Detail | Direct 1x: effective ink / transitions | 4x->1x: effective ink / transitions | Partial samples / levels | Output changed |
|---:|---|---:|---|---|---|---|---|---|---|
| 1 | `278c87ba` | 768x512 | RGB | cover | medium | 336 / 15.37% | 188 / 8.33% | 372 / 16 | yes |
| 2 | `8d5b7ce6` | 640x480 | RGB | contain | high | 298 / 9.49% | 181.875 / 8.13% | 303 / 17 | yes |
| 3 | `95fd70aa` | 1024x640 | RGB | cover | low | 281 / 11.50% | 201 / 10.52% | 217 / 17 | yes |
| 4 | `07cb439f` | 512x768 | RGBA | cover | medium | 208 / 9.69% | 153.9375 / 7.87% | 235 / 16 | yes |
| 5 | `c499476e` | 900x600 | RGB | contain | high | 276 / 10.90% | 180.75 / 7.99% | 292 / 17 | yes |

All five structural attempts passed. 5/5 produced different final run geometry at 4x. Every 4x result retained more than two coverage levels, reduced weighted neighbor transitions, and avoided the earlier bold/blocky ink inflation. The full document validated without S0-S2 findings after save and reopen.

## Visual review boundary

The checked-in contact sheet is the review surface, not an automated claim of identity. Browser inspection on 2026-08-17 at 1440x900 and 390x844 confirmed that the coverage-resolved 4x column has softer edges at intended reading size, remains recognizable beside its source, creates no horizontal overflow, and logs no console error or warning. At 200% the integer lattice is deliberately visible; supersampling improves the normal-size resolve but does not turn a 48x32-quadrant drawing into source-resolution evidence.

## Source receipts

- Case 1: source `fc37fc321b86b50aac9db8608b63665acd83891bf21faefb59ce7fda997ff13f`; direct runs `bae54fab4ea6c79eaad8942c7808c0ff37b84baa16805187f700fc24713a4ad4`; 4x runs `d887b1d7037d8581993d3973cabe6d8e42252bac97d49a0edbe03b4e273e95e6`.
- Case 2: source `3eee2e7a79fd47a8fcc91df7e639d9b417b3b62a6555fe5ab0e307935f40a32c`; direct runs `8c746763cba178c58d228ce78b226000b1596de97b6b4de640a3be6d47a64e94`; 4x runs `15fef6b0e8cbb5841ea0a457bde3819c1c15c69353b267cf08fbbb203b8a7e89`.
- Case 3: source `8761141ef54aaa7a005e473c996f14cc909ef5372382e4c031527301b4159298`; direct runs `6f2dafb675fffca58dbc546096b7850e78c8f4cc84d89bfe971c13e9c1c6c562`; 4x runs `25c1c4175d1873918fea16a152529fac46e6233f915f336d89785bb707104479`.
- Case 4: source `441efa3326077068f0dfa3cfd87e00043a09f820e3c000d0763e3e4b595ae67a`; direct runs `94841019a63290d1910bc39d2955b75a4337b5d4a78d84f8d1a5c57bf837976c`; 4x runs `46afb32964e7f78a82c0861c0d8518da3bd8fb50fbb3cd120f4689a775564470`.
- Case 5: source `b5ec56f8e313b4c452cb61f3a0e50520b2592f67d7ad44308d971350954f9b1b`; direct runs `96d0133a3bc6e091247dc29aa0e500e28efa1ec81496212f76682db39661ce43`; 4x runs `af5da75e1eda0ef653fde92e60252de81d9fecc745bb3c645ad68f1ba0497345`.
