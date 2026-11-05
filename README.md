# Project Orange: T-Adaptive Segment Routing (MILP)

IT4033E capstone project, HUST.
Authors: Nguyễn Tiến Đức (20252076M), Hoàng Huy Chiến (20261069M).

This repository holds a MILP model for the T-Adaptive Segment Routing problem (ROADEF/EURO Challenge 2026, Orange subject). The model is written in Julia with JuMP and solved with HiGHS. The objective is to choose waypoints for each demand so that the maximum link utilisation (MLU) is as small as possible, for period 0 alone and for periods 0 and 1 together, under a budget on routing changes.

## Deliverables

| File | Content |
|---|---|
| [`report/report_orange-NguyenTienDuc_HoangHuyChien.pdf`](report/report_orange-NguyenTienDuc_HoangHuyChien.pdf) | Report: model, implementation, numerical results, trial-and-error log |
| [`slides/slides_orange-NguyenTienDuc_HoangHuyChien.pdf`](slides/slides_orange-NguyenTienDuc_HoangHuyChien.pdf) | Presentation slides (Beamer) |
| [`slides/slides-notes.pdf`](slides/slides-notes.pdf) | Slides with English speaker notes |
| [`slides/slides.pptx`](slides/slides.pptx) | The same deck as PowerPoint, with speaker notes |
| [`results/summary.md`](results/summary.md) | All aggregated results (one row per instance and horizon) |

## Layout

```
src/        model code: instance loading, split coefficients r, MILP builder, solve and report
scripts/    experiment runner, result aggregation, campaign queue
test/       checks against the toy instance of the subject (brute force versus MILP)
results/    raw CSVs and solver logs of every run
report/     LaTeX source of the report; the tables are generated from results/
slides/     LaTeX source of the slides, plus the generator for the .pptx version
```

## Requirements

- Julia 1.13. The exact package versions are in `Manifest.toml` (JuMP 1.32.1, HiGHS.jl 1.26.0, HiGHS 1.15.1).
- The `setA` instances from the course repository [vhnguyen97/SOICT_mathematical_modelling](https://github.com/vhnguyen97/SOICT_mathematical_modelling) (folder `project/setA`). They are not copied here.

```bash
git clone https://github.com/vhnguyen97/SOICT_mathematical_modelling.git   # next to this repository
julia --project=. -e 'using Pkg; Pkg.instantiate()'
```

## Running

Test on the toy instance. The MILP optimum must match a brute-force enumeration for period 0 and for periods 0+1.

```bash
julia --project=. test/runtests.jl
```

Experiments write one CSV row per (instance, seed). The default `--data` path is `../SOICT_mathematical_modelling/project/setA`, relative to this repository.

```bash
# period 0, instances 1-5, 10 seeds, 30 min each
julia --project=. scripts/run_experiments.jl --periods 0 --instances 1:5 --runs 10 \
      --time-limit 1800 --out results/period0.csv

# periods 0+1 with presolve off (see the report for the reason)
julia --project=. scripts/run_experiments.jl --periods 0,1 --instances 1:3 --presolve off \
      --out results/period01.csv --data /path/to/setA
```

Other options: `--seeds 6:10` runs a subset of the seeds. `--max-vars N` records larger instances as `SKIPPED_TOO_LARGE` without building them (default 2,000,000 binary variables).

Aggregate the results into the summary and the LaTeX tables:

```bash
julia --project=. scripts/summarize_results.jl results/remote --latex report/tables/results.tex > results/summary.md
cd report && pdflatex report.tex && pdflatex report.tex
```

The campaign ran on one machine: Ubuntu 24.04, Intel i9-14900K, 125 GB RAM. Each HiGHS solve was single-threaded. `scripts/run-queue.sh` starts the queued jobs (`results/queue.txt`) as memory becomes free. `scripts/refresh-report.sh` (needs `REMOTE_HOST=user@host`) pulls the results back and rebuilds the report.

## Results in brief

- **Period 0:** instances 01–12, 14 and 15 were run with 10 seeds each. Instances 13 and 16–20 need between 79.6M and 957.6M binary variables, so the model cannot be built in 125 GB of RAM. They are reported as too large.
- **Periods 0+1:** these runs use presolve off. On instance 04, HiGHS presolve stalled for more than 3 hours. Instances 01–06, 08 and 09 were run.
- **Other result folders:** `results/remote/discarded-presolve-stall/` and `results/mac-preliminary/` hold the earlier attempts that the report's trial-and-error table refers to.

The full tables and their discussion are in the report.

## Rebuilding the slides

```bash
cd slides && pdflatex slides.tex && pdflatex slides.tex             # Beamer deck
pdflatex slides-notes.tex && pdflatex slides-notes.tex              # deck with speaker notes
npm install && npm run build                                        # slides.pptx
```
