# BC-250 Local AI Compute Atlas

Generated through TurtlePen's MCP tool handlers by `examples/bc250-local-ai-atlas.js`.

- **BC-250 Local AI Compute — System Overview** — [SVG](./01-overview.svg) · [TurtlePen JSON](./01-overview.turtlepen.json) · 11 nodes / 10 relationships · `2665ad04ab962ae1`
- **BC-250 Local AI Compute — Single Node Stack** — [SVG](./02-single-node.svg) · [TurtlePen JSON](./02-single-node.turtlepen.json) · 11 nodes / 10 relationships · `cde35e3a134b7480`
- **BC-250 Local AI Compute — Cluster Topology** — [SVG](./03-cluster.svg) · [TurtlePen JSON](./03-cluster.turtlepen.json) · 13 nodes / 12 relationships · `dc5238e96bbce21c`
- **BC-250 Local AI Compute — DIY Build Flow** — [SVG](./04-diy-build.svg) · [TurtlePen JSON](./04-diy-build.turtlepen.json) · 15 nodes / 14 relationships · `325e12837ef73a1d`
- **BC-250 Local AI Compute — Cost and Alternatives** — [SVG](./05-cost-options.svg) · [TurtlePen JSON](./05-cost-options.turtlepen.json) · 14 nodes / 13 relationships · `92e4d1db97359d43`
- **BC-250 Local AI Compute — Research and Build Roadmap** — [SVG](./06-roadmap.svg) · [TurtlePen JSON](./06-roadmap.turtlepen.json) · 16 nodes / 15 relationships · `6fa4eab938c51434`

## Core architecture

Start with one stock, reliable board. Qualify cooling and memory behavior before optional silicon unlocks. Scale concurrency with independent specialist workers first. Use distributed-model llama.cpp RPC when one model genuinely needs to span boards; the strongest current reference uses a dedicated 2.5 GbE backend.

## Sources

- [Original BC-250 video](https://www.youtube.com/watch?v=Ztkh2UfSUxw) — Starting point for this research.
- [H6 BC-250 docs](https://github.com/H6-Technologies/BC-250) — Community hardware and Linux documentation.
- [BC-250 Ollama + Open WebUI](https://github.com/thelamer/bc250-ollama-openwebui) — Headless Vulkan/Ollama deployment.
- [BC-250 LLM benchmarks](https://github.com/akandr/bc250) — Single-board Vulkan and memory tuning notes.
- [40-CU unlock research](https://github.com/duggasco/bc250-40cu-unlock) — Optional GPU CU qualification research.
- [8-core / CU helper tooling](https://github.com/GabriWar/bc250-core-cu-unlock) — Optional CPU/GPU qualification tooling.
- [Two-node llama.cpp cluster](https://github.com/4claps/bc250-llama-cluster) — Validated two-node RPC design with dedicated 2.5 GbE backend.
- [Four-node cluster reference](https://github.com/Cirius1792/bc250-cluster-ansible) — Reference multi-worker RPC deployment.
