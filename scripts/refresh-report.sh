#!/usr/bin/env bash
# Pull the campaign results from the experiment machine, regenerate the report tables and the PDF,
# and print a short campaign status (queue progress, running jobs, memory, errors in logs).
#   REMOTE_HOST=user@host scripts/refresh-report.sh
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="${REMOTE_HOST:?set REMOTE_HOST=user@host of the experiment machine}"

rsync -az --delete "$HOST:IT4033E/orange-project/results/" results/remote/
julia --project=. scripts/summarize_results.jl results/remote --latex report/tables/results.tex \
    > results/summary.md
(cd report && pdflatex -interaction=nonstopmode report.tex > /dev/null \
           && pdflatex -interaction=nonstopmode report.tex | grep -E "Output written|^!" || true)
(cd slides && pdflatex -interaction=nonstopmode slides.tex > /dev/null \
           && pdflatex -interaction=nonstopmode slides.tex | grep -E "Output written|^!" || true)

echo "== remote status"
ssh "$HOST" 'cd IT4033E/orange-project
  date; free -g | sed -n 2p
  # pending = queue jobs (2nd field) not yet in the launched list
  echo "queue pending: $(grep -v "^#" results/queue.txt | cut -d" " -f2 | grep -cvxFf results/queue-launched.txt)"
  echo "runner: $(pgrep -f "[s]cripts/run-queue.sh" > /dev/null && echo alive || echo NOT RUNNING)"
  echo "running jobs:"; pgrep -af "[s]cripts/run_experiments.jl" | sed "s/.*--out results\///" | sort
  tail -1 results/logs/queue.log
  echo "errors:"; grep -l -iE "error|killed|out of memory" results/logs/*.log || echo none
  dmesg 2>/dev/null | grep -i "killed process" | tail -3 || true'
