# BC-250 Local AI Compute Atlas — Research + Architecture Notes

Date: 2026-08-29

Source video: https://www.youtube.com/watch?v=Ztkh2UfSUxw

This document is the research companion to `examples/bc250-local-ai-atlas.js`. The generator builds six TurtlePen diagrams through the MCP tool layer and writes the rendered/serialized outputs under `diagrams/bc250-local-ai/`.

## Executive conclusion

The most interesting way to think about the AMD BC-250 is not “a weird cheap gaming PC.” It is a **low-cost, high-bandwidth, Linux-first local inference appliance** built around 16 GB of shared GDDR6.

The architecture should therefore optimize for:

- headless operation;
- sustained cooling rather than desktop cosmetics;
- Linux + Mesa/RADV + Vulkan;
- llama.cpp or Ollama as the inference runtime;
- an OpenAI-compatible LAN endpoint;
- per-board telemetry and qualification;
- request-level routing across independent nodes for concurrency;
- llama.cpp RPC only when a specific model genuinely needs to span multiple boards.

A two-node distributed-model configuration is no longer merely theoretical. A recent community deployment documents a working coordinator + RPC-worker setup over a dedicated 2.5 GbE point-to-point link, with management traffic kept separate.

---

## 1. What the hardware gives us

Community documentation currently describes the BC-250 as a Linux-capable single-board computer with:

- 16 GB GDDR6 shared by CPU and GPU;
- 6 active Zen 2 CPU cores in stock form;
- 24 active GPU compute units in stock form;
- M.2 storage;
- DisplayPort;
- 1 GbE onboard networking;
- USB 2/3 ports;
- PCIe 8-pin power input;
- a thermal design that requires serious airflow under sustained workloads.

The unusual part for local AI is the shared GDDR6 pool. Unlike a conventional CPU + discrete-GPU machine, the model and CPU do not have to be divided across two physically separate memory pools in the same way. In practice, software/kernel allocation limits still matter, so “16 GB installed” does not automatically mean “16 GB available to Vulkan inference.”

### Important qualification

Do not treat a bare board as production-ready. The BC-250 community repeatedly emphasizes cooling, memory thermals, power delivery and board-to-board variation. A configuration that benchmarks for a few minutes is not automatically safe for unattended service.

---

## 2. How to make it better

### 2.1 Cooling is the first performance modification

Before chasing clocks or unlocks:

1. use high-static-pressure fans;
2. force air through the heatsink rather than merely across the board;
3. pay attention to GDDR6, VRM and rear-side hotspots;
4. expose temperature and fan telemetry;
5. configure fan-control fail-safes;
6. validate sustained compute, not just boot stability.

A recent two-node community build uses ARCTIC P12 Pro fans, custom ducts/mounts, improved interface materials, rear heatsinks and managed fan telemetry. Their post-preparation nodes remained in the mid-60 °C range under their validated moderate profile instead of approaching throttling temperatures.

### 2.2 Remove software memory ceilings

Single-board LLM testing has shown that TTM/GTT limits can become the actual blocker before physical memory is exhausted. Current community recipes tune the kernel memory limits so Vulkan can allocate substantially more of the shared pool.

This matters because model fit is:

`weights + KV cache + context + runtime buffers + OS headroom`

—not just parameter count.

### 2.3 Use Vulkan as the practical compute path

The current BC-250 local-LLM work is centered on Mesa/RADV + Vulkan. ROCm support for this GFX1013 configuration is not the straightforward path that it is on supported AMD datacenter/consumer GPUs.

Practical software choices:

- `llama.cpp` Vulkan;
- Ollama with Vulkan/iGPU enablement;
- Open WebUI for a browser UI;
- an OpenAI-compatible HTTP endpoint for agents and applications.

### 2.4 Optional 40-CU GPU unlock

Community research has demonstrated a path from the stock 24 active CUs to all 40 physical CUs on tested boards. The unlock is not something the architecture should assume by default.

Treat it as a **qualification branch**:

1. establish a stock baseline;
2. qualify thermals and power;
3. apply the community kernel path;
4. verify the CU mask independently;
5. run correctness/stress testing;
6. re-measure prompt throughput, generation throughput, power and temperature;
7. keep a rollback path.

The 40-CU research reports large prefill/compute gains, but power and thermal load rise as well. Generation speed is often more memory-bandwidth-bound, so extra compute does not translate 1:1 into output-token improvement.

### 2.5 Optional 8-core CPU unlock

Community tooling also exists to expose the two additional Zen 2 cores on tested BC-250 boards. One published 7-Zip measurement improved about 27% in that CPU benchmark.

That does **not** mean local LLM generation will improve by 27%. The extra cores are more likely to help with CPU-side work, services, decompression, orchestration, preprocessing and mixed workloads. It should be measured separately from the GPU unlock.

### 2.6 Prefer efficiency profiles over headline clocks

Recent two-node testing compared moderate, strong and aggressive profiles using the same model/workload. The aggressive profile improved generation throughput only modestly relative to its additional power and cooling burden. The authors kept the moderate profile as the 24/7 recommendation.

The design rule is therefore:

> Optimize for **tokens per watt, error-free sustained runtime and useful task latency**, not maximum reported core clock.

---

## 3. How to make it cheaper

The biggest cost mistake would be turning a cheap compute board into an expensive boutique PC.

### 3.1 Minimum useful node

Use:

- BC-250 board;
- known-good reused ATX/PCIe PSU if available;
- inexpensive or reused M.2 SSD;
- two quality pressure fans;
- simple open-frame / printed mount;
- basic ducting;
- onboard 1 GbE for management/API traffic.

Skip at first:

- display;
- premium case;
- RGB;
- oversized SSD;
- desktop peripherals;
- cosmetic cable work;
- unnecessary USB accessories.

### 3.2 Spend money where it protects the board

The first optional dollars should go to:

1. better cooling;
2. thermal interface materials if needed;
3. fan mounting/ducting;
4. power quality;
5. telemetry;
6. only then enclosure polish.

### 3.3 Reuse the network you already have until RPC requires more

A one-node appliance does not need special networking.

For a two-node **distributed-model** setup, the strongest current reference uses a dedicated 2.5 GbE point-to-point backend implemented with USB 3.x 2.5 GbE adapters on both boards. That is a cheap upgrade compared with building a full high-speed switched fabric.

### 3.4 Buy the second board only when it solves a measured problem

Do not add boards merely because aggregate memory looks attractive on paper.

A second BC-250 should solve one of two measured constraints:

- a target model does not fit on one node, and RPC splitting produces worthwhile quality/latency;
- concurrency is limited, and a second independent worker improves throughput.

If neither is true, a second node only adds watts, cooling, networking and maintenance.

---

## 4. DIY architecture

### Stage A — hardware baseline

- inspect board condition;
- install storage;
- use known-good power;
- mount the board safely;
- design forced airflow;
- confirm fan and temperature telemetry.

### Stage B — software baseline

- install a modern Linux distribution;
- enable SSH;
- establish a management LAN;
- confirm Mesa/RADV and Vulkan;
- run stock stability tests.

### Stage C — local LLM baseline

- install llama.cpp or Ollama;
- start with a small known-good model;
- record memory usage and output speed;
- move upward in model size only after the baseline is reliable.

### Stage D — memory tuning

- tune TTM/GTT according to current community guidance;
- verify actual Vulkan-visible memory;
- repeat the model-fit tests.

### Stage E — optional silicon qualification

- 40-CU path if desired;
- 8-core path if desired;
- never assume a disabled unit is healthy merely because another board unlocked cleanly;
- rerun correctness, thermal and power tests after every hardware-visible change.

### Stage F — appliance service

- run the inference service under systemd/container supervision;
- bind the API only where intended;
- firewall unauthenticated endpoints;
- expose health checks;
- add Open WebUI if wanted;
- connect local clients and agents.

---

## 5. Local LLM use cases

A single BC-250 can be useful for much more than a chat window.

### Fast local service

- small general model;
- coding helper;
- command/tool router;
- structured extraction;
- local summarization;
- lightweight RAG;
- private API fallback.

### Background worker

- document ingestion;
- embeddings;
- reranking;
- classification;
- batch transforms;
- transcription/voice pipelines where supported;
- agent subtask execution.

### Specialist node in an AI fabric

A BC-250 can have a permanent role:

- `fast-general`;
- `coding`;
- `RAG-batch`;
- `speech`;
- `vision/image` where the selected stack is workable;
- `evaluation`;
- `background-agent`.

The front-end application does not need to know which physical board performs the job. A model router can expose one logical OpenAI-compatible endpoint.

---

## 6. Single-node model sizing

Community single-board benchmarks show a wide useful range depending on quantization, context and tuning. Examples published in 2026 include small models with very high generation rates, 8B–14B-class models at useful interactive speeds, and some much larger MoE/low-bit models fitting because only a fraction of the total parameters are active per token.

Do not hard-code a permanent model list into the architecture. Model releases move too quickly.

Instead define model classes:

- **Fast:** smallest model that reliably handles routing/simple tools;
- **General:** best quality that fits with comfortable context headroom;
- **Code:** best practical coding/tool-use model for the node;
- **Large/MoE:** highest-quality quantized model that fits without pathological swapping;
- **Batch:** model optimized for throughput rather than interaction.

The router can then map tasks to classes rather than model names.

---

## 7. Two-node distributed inference

A recent reference deployment validates this pattern:

```text
Client / Agent
      |
      | OpenAI-compatible API
      v
BC-250 Node 1
llama-server
  |        \
  |         \ dedicated 2.5 GbE RPC
local GPU    \
              v
          BC-250 Node 2
          ggml-rpc-server
          Vulkan GPU
```

Important details from that design:

- management LAN and RPC backend are separate;
- the backend is point-to-point;
- the RPC worker is not exposed to the internet;
- USB 3.x 2.5 GbE adapters are used for the dedicated backend;
- both nodes are individually qualified for cooling/CU configuration;
- Ansible drives a reproducible configuration;
- model/API health is validated after deployment.

The project reports a Qwen 35B-class MoE model split across the two boards with a large context window and useful generation speed. Those figures are community measurements on two specific machines, not guarantees for arbitrary boards.

### Architectural consequence

The earlier assumption that “distributed inference will obviously be bad because the board only has 1 GbE” is now too simplistic.

The better rule is:

> **Do not send RPC over the management NIC if a cheap dedicated backend can remove that bottleneck.**

---

## 8. Three or more boards

There are now community projects describing four-worker BC-250 llama.cpp RPC clusters as well as two-node validated deployments.

For a larger fleet, keep two scaling modes distinct.

### Mode A — request-level sharding

```text
             +--> worker: fast
client -> router --> worker: code
             +--> worker: RAG
             +--> worker: batch
```

Advantages:

- model memory stays local;
- requests can run concurrently;
- failures are isolated;
- network traffic is lower;
- nodes can run different models;
- easier rolling upgrades.

This should be the default fleet architecture.

### Mode B — distributed-model groups

```text
router -> coordinator -> RPC worker(s)
```

Use when:

- model quality materially improves by spanning nodes;
- memory capacity is the actual constraint;
- network benchmarks show acceptable latency;
- the workload is worth dedicating several boards to one request.

Do not treat twelve boards as one magical 192 GB GPU. Their memory is still physically distributed and synchronization still matters.

---

## 9. More hardware options

The BC-250 should always be compared against alternatives at the **whole-node** level.

### Existing conventional GPU

Best when:

- you already own it;
- CUDA/software compatibility matters;
- simplicity matters more than experiment value.

### Used high-VRAM accelerator

Best when:

- memory capacity is the dominant requirement;
- you accept older architecture, cooling and software constraints;
- the current used-market price is favorable.

### Newer unified-memory mini AI systems

Best when:

- efficiency/support/form factor matter;
- you want a polished appliance rather than a salvage-compute project;
- higher acquisition cost is acceptable.

### BC-250

Best when:

- board price is unusually low;
- you enjoy Linux/DIY work;
- 16 GB high-bandwidth shared memory is useful for your target models;
- you want many cheap network workers;
- experimentation itself has value.

---

## 10. Decision metric

Never compare only sticker price.

For every candidate node record:

- acquisition cost;
- required PSU/cooling/network accessories;
- idle watts;
- inference watts;
- usable memory for the actual runtime;
- prompt tokens/s;
- generation tokens/s;
- TTFT;
- model quality on the target task;
- context size;
- thermal headroom;
- software maintenance burden;
- failure rate / resets / inference errors;
- concurrency;
- noise;
- physical space.

Then calculate:

- useful tasks per dollar;
- generation tokens/s per watt;
- prompt tokens/s per watt;
- concurrent requests per dollar;
- highest-quality model that meets the latency requirement.

---

## 11. Recommended build roadmap

### Phase 0 — research + sourcing

Goal: one board, no assumptions.

Deliverables:

- board/firmware inventory;
- actual total cost;
- cooling plan;
- rollback notes.

### Phase 1 — stock node

Goal: boring, repeatable single-board LLM server.

Deliverables:

- stock benchmark suite;
- thermals;
- power;
- model-fit table;
- OpenAI-compatible endpoint.

### Phase 2 — tuning

Goal: improve usable memory and efficiency without destabilizing the service.

Deliverables:

- TTM/GTT before/after;
- cooling before/after;
- optional CU/core qualification;
- tokens/W and error-rate comparison.

### Phase 3 — two-node experiment

Goal: determine whether the second board is more useful as an independent worker or as RPC memory/compute for a larger model.

Deliverables:

- dedicated 2.5 GbE backend;
- one-node vs two-node latency;
- one-node vs two-node quality;
- request-sharding throughput;
- RPC split throughput;
- power delta.

### Phase 4 — router

Goal: one logical local-AI endpoint backed by specialist workers.

Deliverables:

- model registry;
- health-aware routing;
- task classes;
- fallback behavior;
- metrics.

### Phase 5 — fleet

Only expand if the economics remain favorable against simpler hardware.

A rack full of cheap boards is not automatically cheap once power, adapters, fans, storage, switch ports, maintenance and operator time are counted.

---

## 12. TurtlePen output set

The generator produces:

1. `01-overview.svg` / `.turtlepen.json`
2. `02-single-node.svg` / `.turtlepen.json`
3. `03-cluster.svg` / `.turtlepen.json`
4. `04-diy-build.svg` / `.turtlepen.json`
5. `05-cost-options.svg` / `.turtlepen.json`
6. `06-roadmap.svg` / `.turtlepen.json`

Each diagram is built through the MCP handlers:

`measure -> new_diagram -> plan -> connect -> configure_theme -> attach_resource -> layout -> validate -> accept deliberate schematic composition findings -> validate -> render`

Structural findings are not force-rendered. The generator stops if any non-adjudicated final finding remains.

---

## Sources

- Original video: https://www.youtube.com/watch?v=Ztkh2UfSUxw
- BC-250 hardware/Linux documentation: https://github.com/H6-Technologies/BC-250
- Ollama + Open WebUI guide: https://github.com/thelamer/bc250-ollama-openwebui
- Single-board LLM tuning/benchmarks: https://github.com/akandr/bc250
- 40-CU research: https://github.com/duggasco/bc250-40cu-unlock
- 8-core + CU helper tooling: https://github.com/GabriWar/bc250-core-cu-unlock
- Two-node distributed LLM reference: https://github.com/4claps/bc250-llama-cluster
- Four-worker cluster reference: https://github.com/Cirius1792/bc250-cluster-ansible

All performance figures referenced from community projects should be treated as configuration-specific measurements and revalidated on the exact boards, software revisions and cooling solution used in a new build.
