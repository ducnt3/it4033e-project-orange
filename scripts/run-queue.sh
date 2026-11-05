#!/usr/bin/env bash
# Memory-aware job queue for the experiment campaign (runs detached on the experiment machine).
#   nohup scripts/run-queue.sh > results/logs/queue.log 2>&1 &
#
# results/queue.txt holds one job per line: "<peak_GB> <job-name> <run_experiments.jl options...>".
# The file is re-read every poll, so lines can be appended or removed while the runner is alive.
# Jobs start in file order (FIFO, no overtaking) as soon as
#     MemAvailable - RESERVE_GB - (memory still to be claimed by queue jobs that are growing) >= peak_GB
# and fewer than MAX_JOBS experiment processes are running.
# A job is started once: its name is appended to results/queue-launched.txt.
set -uo pipefail
cd "$(dirname "$0")/.."
QUEUE=results/queue.txt
LAUNCHED=results/queue-launched.txt
RESERVE_GB=${RESERVE_GB:-12}   # left free for the other users of the shared machine
POLL_S=${POLL_S:-120}
MAX_JOBS=${MAX_JOBS:-16}       # single-threaded solves; keep CPUs free so wall-clock times stay comparable
touch "$LAUNCHED"

# resident memory (GB, rounded up) of the julia process writing results/<job>.csv, empty if not running
job_rss_gb() {
    local pid
    pid=$(pgrep -f -- "--out results/$1.csv" | head -1)
    [ -n "$pid" ] && ps -o rss= -p "$pid" | awk '{print int($1/1048576)+1}'
}

while true; do
    avail=$(awk '/MemAvailable/ {print int($2/1048576)}' /proc/meminfo)
    # memory that already-started queue jobs will still allocate (estimate minus current RSS)
    pending_growth=0
    while read -r peak job _; do
        [ -z "${job:-}" ] && continue
        grep -qx "$job" "$LAUNCHED" || continue
        rss=$(job_rss_gb "$job")
        [ -n "$rss" ] && [ "$peak" -gt "$rss" ] && pending_growth=$((pending_growth + peak - rss))
    done < "$QUEUE"
    free_for_queue=$((avail - RESERVE_GB - pending_growth))

    next=""
    while read -r line; do
        [[ -z "$line" || "$line" == \#* ]] && continue
        job=$(awk '{print $2}' <<< "$line")
        grep -qx "$job" "$LAUNCHED" || { next="$line"; break; }
    done < "$QUEUE"

    if [ -z "$next" ]; then
        echo "$(date '+%F %T') queue empty, runner exits"; exit 0
    fi
    read -r peak job opts <<< "$next"
    running=$(pgrep -fc "[s]cripts/run_experiments.jl")
    if [ "$running" -ge "$MAX_JOBS" ]; then
        echo "$(date '+%F %T') waiting: $job, $running experiment jobs running (max $MAX_JOBS)"
    elif [ "$free_for_queue" -ge "$peak" ]; then
        # shellcheck disable=SC2086  # opts must be word-split into separate arguments
        scripts/launch-campaign.sh "$job" $opts
        echo "$job" >> "$LAUNCHED"
        echo "$(date '+%F %T') launched $job (needs ${peak}G, free for queue ${free_for_queue}G)"
    else
        echo "$(date '+%F %T') waiting: $job needs ${peak}G, free for queue ${free_for_queue}G"
    fi
    sleep "$POLL_S"
done
