# Aggregate experiment CSVs (one row per run) into one row per (instance, periods): the report tables.
#
#   julia --project=. scripts/summarize_results.jl results/remote [--latex report/results-table.tex]
#
# Averages are over the finished runs (10 seeds per instance when complete); status column counts
# OPTIMAL runs / all runs. SKIPPED_TOO_LARGE rows give only the instance size.
using Printf, Statistics

function read_rows(dir)
    rows = Dict{String,String}[]
    for f in sort(readdir(dir; join = true))
        endswith(f, ".csv") || continue
        lines = readlines(f)
        isempty(lines) && continue
        header = split(lines[1], ",")
        header[1] == "instance" || continue
        for l in lines[2:end]
            isempty(l) || push!(rows, Dict(String.(header) .=> String.(split(l, ","))))
        end
    end
    return rows
end

num(r, k) = parse(Float64, r[k])
# U ≥ 0 is always a valid lower bound: a run that stops before HiGHS has any bound (-Inf) counts as LB = 0,
# i.e. gap = 1 − max(LB, 0)/UB = 100 %.
lower_bound(r) = max(num(r, "bound"), 0.0)
run_gap(r) = (ub = num(r, "objective"); ub > 0 ? 1 - lower_bound(r) / ub : 0.0)

function summarize(rows)
    # rows written before the --presolve option existed ran with HiGHS presolve on
    groups = Dict{Tuple{String,String,String},Vector{Dict{String,String}}}()
    for r in rows
        push!(get!(groups, (r["instance"], r["periods"], get(r, "presolve", "on")), Dict{String,String}[]), r)
    end
    out = []
    for key in sort(collect(keys(groups)); by = k -> (k[2], k[3], k[1]))
        g = groups[key]
        # a size-only SKIPPED row is superseded by real runs of the same instance (larger --max-vars)
        runs = filter(r -> r["status"] != "SKIPPED_TOO_LARGE", g)
        skipped = isempty(runs)
        r1 = skipped ? g[1] : runs[1]
        avg(k) = isempty(runs) ? NaN : mean(num(r, k) for r in runs)
        push!(out, (instance = key[1], periods = key[2], presolve = key[3], n = r1["n"], m = r1["m"], demands = r1["demands"],
            vars = parse(Int, r1["vars"]), runs = length(runs),
            optimal = count(r -> r["status"] == "OPTIMAL", runs),
            objective = avg("objective"), best = isempty(runs) ? NaN : minimum(num(r, "objective") for r in runs),
            bound = isempty(runs) ? NaN : maximum(lower_bound(r) for r in runs),
            gap = isempty(runs) ? NaN : mean(run_gap(r) for r in runs), time = avg("solve_time"), nodes = avg("nodes"), baseline = avg("baseline"),
            skipped))
    end
    return out
end

fmt(x, d = 4) = isnan(x) ? "–" : @sprintf("%.*f", d, x)

function print_markdown(io, s)
    println(io, "| Inst | T | presolve | n | m | |D| | vars | runs | opt | avg MLU | best | best bound | avg gap | avg time (s) | avg nodes | no-waypoint MLU |")
    println(io, "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for r in s
        println(io, "| ", join((r.instance, r.periods, r.presolve, r.n, r.m, r.demands, r.vars,
            r.skipped ? "too large" : r.runs, r.optimal, fmt(r.objective), fmt(r.best), fmt(r.bound),
            fmt(r.gap, 3), fmt(r.time, 1), fmt(r.nodes, 1), fmt(r.baseline)), " | "), " |")
    end
end

function print_latex(io, s, periods, presolve)
    println(io, "\\begin{tabular}{lrrrrrrrrrr}\n\\toprule")
    println(io, "Inst & \$n\$ & \$m\$ & \$|D|\$ & vars & opt/runs & MLU & no-wp & gap (\\%) & CPU (s) & nodes \\\\\n\\midrule")
    for r in filter(r -> r.periods == periods && r.presolve == presolve, s)
        name = replace(r.instance, "setA-" => "")
        vars = @sprintf("%.2fM", r.vars / 1e6)
        if r.skipped
            println(io, "$name & $(r.n) & $(r.m) & $(r.demands) & $vars & \\multicolumn{6}{c}{model too large} \\\\")
        else
            println(io, join((name, r.n, r.m, r.demands, vars, "$(r.optimal)/$(r.runs)", fmt(r.objective, 3),
                fmt(r.baseline, 3), fmt(100r.gap, 1), fmt(r.time, 1), fmt(r.nodes, 1)), " & "), " \\\\")
        end
    end
    println(io, "\\bottomrule\n\\end{tabular}")
end

function main(args)
    dir = isempty(args) ? "results/remote" : args[1]
    s = summarize(read_rows(dir))
    print_markdown(stdout, s)
    i = findfirst(==("--latex"), args)
    if i !== nothing
        base = args[i+1]
        mkpath(dirname(abspath(base)))
        # period 0: presolve on; periods 0+1: presolve off (main table) and on (comparison table)
        for (p, pre, suffix) in (("0", "on", "period0"), ("0+1", "off", "period01"), ("0+1", "on", "period01-presolve-on"))
            open(io -> print_latex(io, s, p, pre), replace(base, ".tex" => "-$suffix.tex"), "w")
        end
    end
end

main(ARGS)
