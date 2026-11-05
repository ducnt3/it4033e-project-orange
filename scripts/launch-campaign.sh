#!/usr/bin/env bash
# Launch one experiment job detached from the terminal (survives closing the session).
#   scripts/launch-campaign.sh <job-name> <run_experiments.jl options...>
# Output: results/<job-name>.csv, log: results/logs/<job-name>.log
# Each job runs HiGHS single-threaded, so several jobs can run side by side (watch memory:
# roughly 3 GB per million binary variables).
set -euo pipefail
cd "$(dirname "$0")/.."
job="$1"; shift
mkdir -p results/logs
# non-interactive ssh shells do not load ~/.bashrc, so fall back to juliaup's default location
JULIA="$(command -v julia || echo "$HOME/.juliaup/bin/julia")"
nohup "$JULIA" --project=. scripts/run_experiments.jl "$@" --out "results/$job.csv" \
    > "results/logs/$job.log" 2>&1 &
echo "started $job (pid $!)"
