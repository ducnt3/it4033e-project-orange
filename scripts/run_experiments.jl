# Numerical experiments on setA (project/readme steps 6 and 9).
#
#   julia --project=. scripts/run_experiments.jl --periods 0 --instances 1:5 --runs 10 --time-limit 1800 \
#         --out results/period0.csv
#   --seeds 6:10 overrides --runs (run a subset of the seeds, e.g. in a parallel process)
#   --presolve off disables HiGHS presolve (used for the two-period runs, see solve_instance)
#
# One CSV row per (instance, run); rows are appended as soon as a run finishes, so an interrupted
# campaign keeps its finished runs. Instances whose model would exceed --max-vars binary variables
# are recorded with status SKIPPED_TOO_LARGE instead of being built (memory guard).

include(joinpath(@__DIR__, "..", "src", "orange_segment_routing.jl"))
using Printf

function parse_args(args)
    opt = Dict("--periods" => "0", "--instances" => "1:20", "--runs" => "10", "--time-limit" => "1800",
               "--out" => "results/experiments.csv", "--max-vars" => "2000000",
               "--seeds" => "", "--presolve" => "on",
               "--data" => joinpath(@__DIR__, "..", "..", "SOICT_mathematical_modelling", "project", "setA"))
    for k in 1:2:length(args)
        haskey(opt, args[k]) || error("Unknown option $(args[k])")
        opt[args[k]] = args[k+1]
    end
    periods = parse.(Int, split(opt["--periods"], ","))
    instances = collect(eval(Meta.parse(opt["--instances"])))
    runs = parse(Int, opt["--runs"])
    seeds = isempty(opt["--seeds"]) ? collect(1:runs) : collect(eval(Meta.parse(opt["--seeds"])))
    return periods, instances, seeds, parse(Float64, opt["--time-limit"]),
           opt["--out"], parse(Int, opt["--max-vars"]), opt["--data"], opt["--presolve"] == "on"
end

const COLUMNS = [:instance, :periods, :seed, :n, :m, :demands, :vars, :constraints, :status,
                 :objective, :bound, :gap, :solve_time, :build_time, :nodes, :mlu_check, :baseline, :presolve]

function append_row(out, row)
    isfile(out) || open(io -> println(io, join(COLUMNS, ",")), out, "w")
    open(out, "a") do io
        println(io, join((getproperty(row, c) for c in COLUMNS), ","))
    end
end

function main(args)
    periods, instances, seeds, time_limit, out, max_vars, data, presolve = parse_args(args)
    mkpath(dirname(abspath(out)))
    for k in instances
        inst = load_instance(joinpath(data, @sprintf("setA-%02d", k)))
        coefs = Dict(t => split_coefficients(inst, t) for t in periods)
        # all variables of build_model: x for every period, y for every period with a predecessor, and U
        dk = num_demands(inst) * length(usable_segments(coefs, periods))
        est_vars = dk * (2 * length(periods) - 1) + 1
        if est_vars > max_vars
            append_row(out, (instance = inst.name, periods = join(periods, "+"), seed = -1, n = inst.n,
                m = num_arcs(inst), demands = num_demands(inst), vars = est_vars, constraints = -1,
                status = "SKIPPED_TOO_LARGE", objective = NaN, bound = NaN, gap = NaN,
                solve_time = NaN, build_time = NaN, nodes = -1, mlu_check = NaN, baseline = NaN,
                presolve = presolve ? "on" : "off"))
            println("$(inst.name): skipped ($est_vars variables > --max-vars $max_vars)")
            continue
        end
        for seed in seeds
            res = solve_instance(inst, periods; time_limit, seed, coefs, presolve)
            append_row(out, res)
            @printf("%s run %d: %s obj=%.4f gap=%.4f time=%.1fs nodes=%d\n", inst.name, seed,
                    res.status, res.objective, res.gap, res.solve_time, res.nodes)
            res = nothing; GC.gc()
        end
    end
end

main(ARGS)
