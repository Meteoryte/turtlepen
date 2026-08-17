# Five seeded-random supersampling trials

Generated through real TurtlePen MCP stdio with master seed `0x8f31c2d7`.
The inputs are random but reproducible; their SHA-256 hashes and saved run hashes make each result auditable.

## Loop contract

- Loop: `SWE-05 Edge Case Expansion`, five attempts total.
- Success: requested factor honored; final output remains 48x32 quadrants; near-binary strategy; readable output; clean save/reopen/render.
- Mutation between attempts: source seed, dimensions, alpha mode, fit, detail, and generated structure.
- Stop: all five pass, or stop immediately on geometry drift, busy output, semantic ambiguity, persistence failure, or MCP error.

## Evidence ledger

| Attempt | Seed | Source | Pixels | Fit | Detail | Direct 1x: ink / transitions / runs | 4x->1x: ink / transitions / runs | Output changed |
|---:|---|---:|---|---|---|---|---|---|
| 1 | `278c87ba` | 768x512 | RGB | cover | medium | 336 / 15.37% / 43 | 368 / 15.24% / 44 | yes |
| 2 | `8d5b7ce6` | 640x480 | RGB | contain | high | 298 / 9.49% / 66 | 327 / 9.76% / 62 | yes |
| 3 | `95fd70aa` | 1024x640 | RGB | cover | low | 281 / 11.50% / 67 | 238 / 11.63% / 67 | yes |
| 4 | `07cb439f` | 512x768 | RGBA | cover | medium | 208 / 9.69% / 126 | 269 / 10.06% / 125 | yes |
| 5 | `c499476e` | 900x600 | RGB | contain | high | 276 / 10.90% / 78 | 315 / 10.76% / 75 | yes |

All five attempts passed. 5/5 produced different final run geometry at 4x; unchanged cases still verified a distinct 192x128 working canvas and 16-to-1 box reduction. The full document validated without S0-S2 findings after save and reopen.

## Source receipts

- Case 1: source `fc37fc321b86b50aac9db8608b63665acd83891bf21faefb59ce7fda997ff13f`; direct runs `bae54fab4ea6c79eaad8942c7808c0ff37b84baa16805187f700fc24713a4ad4`; 4x runs `56b365d96176d7150ff2563df45818179998263325649c0a35a66e359ee40e10`.
- Case 2: source `3eee2e7a79fd47a8fcc91df7e639d9b417b3b62a6555fe5ab0e307935f40a32c`; direct runs `8c746763cba178c58d228ce78b226000b1596de97b6b4de640a3be6d47a64e94`; 4x runs `4232ed0bccf19573e08c7f487140057572e63969ad4e76da9b4b210d903e24ba`.
- Case 3: source `8761141ef54aaa7a005e473c996f14cc909ef5372382e4c031527301b4159298`; direct runs `6f2dafb675fffca58dbc546096b7850e78c8f4cc84d89bfe971c13e9c1c6c562`; 4x runs `89195374fb1a1c098060627ef0f47a8d363d57ab6c60351a166aabae04ad2e61`.
- Case 4: source `441efa3326077068f0dfa3cfd87e00043a09f820e3c000d0763e3e4b595ae67a`; direct runs `94841019a63290d1910bc39d2955b75a4337b5d4a78d84f8d1a5c57bf837976c`; 4x runs `e8aa854ecfd02ef4af62bdcdfef76eec15044720a1505b085683eb2b35020438`.
- Case 5: source `b5ec56f8e313b4c452cb61f3a0e50520b2592f67d7ad44308d971350954f9b1b`; direct runs `96d0133a3bc6e091247dc29aa0e500e28efa1ec81496212f76682db39661ce43`; 4x runs `482923e46987e2b0bcec74a64f48b732ecce0e7e6992347200bece6da11df44e`.
