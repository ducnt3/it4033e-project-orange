# Solve one instance once with HiGHS and collect the statistics requested by project/readme:
# status, best objective, best bound, gap = 1 − LB/UB, CPU time of optimize! only, B&B node count.

using JuMP, HiGHS

"Arc loads λ(a,t) of a solution, computed from scratch (independent check of the model's objective)."
function solution_loads(inst::Instance, coefs, x, segments, t::Int)
    load = zeros(num_arcs(inst))
    for (k, (i, j)) in enumerate(segments), d in 1:num_demands(inst)
        value(x[d, k, t]) > 0.5 || continue
        for (a, r) in coefs[t].terms[i, j]
            load[a] += r * inst.volume[d, t+1]
        end
    end
    return load ./ inst.arc_capacity
end

"""
MIP start = the routing without waypoints (every demand uses the single segment (s_d, t_d) at every
period). It is feasible whenever the model is: (1)-(2) hold, it makes no change between periods
(so (4) holds), and if t_d were unreachable from s_d in G(t) no segment path could exist at all.
"""
function set_no_waypoint_start!(inst::Instance, model, x, U, segments, coefs, periods)
    set_start_value.(all_variables(model), 0.0)
    index_of = Dict(seg => k for (k, seg) in enumerate(segments))
    mlu = 0.0
    for t in periods
        load = zeros(num_arcs(inst))
        for d in 1:num_demands(inst)
            i, j = inst.demand_source[d], inst.demand_target[d]
            k = get(index_of, (i, j), nothing)
            k === nothing && return NaN
            set_start_value(x[d, k, t], 1.0)
            for (a, r) in coefs[t].terms[i, j]
                load[a] += r * inst.volume[d, t+1]
            end
        end
        mlu = max(mlu, maximum(load ./ inst.arc_capacity))
    end
    set_start_value(U, mlu)
    return mlu          # MLU of the no-waypoint routing, reported as a baseline
end

"""
Build and solve the model for `periods` (e.g. [0] or [0, 1]). `seed` is passed to HiGHS
(`random_seed`) so that repeated runs explore the tree differently. `presolve = false` switches HiGHS
presolve off: on two-period models its presolve stalls on the dense budget row (4) far beyond the time limit.
"""
function solve_instance(inst::Instance, periods::Vector{Int}; time_limit = 1800.0, seed = 0,
                        threads = 1, verbose = false, coefs = nothing, warm_start = true,
                        presolve = true)
    t_build = @elapsed begin
        coefs = something(coefs, Dict(t => split_coefficients(inst, t) for t in periods))
        model, x, U, segments = build_model(inst, coefs, periods; optimizer = HiGHS.Optimizer)
        baseline = set_no_waypoint_start!(inst, model, x, U, segments, coefs, periods)
        warm_start || set_start_value.(all_variables(model), nothing)
    end
    set_time_limit_sec(model, time_limit)
    set_attribute(model, "random_seed", seed)
    set_attribute(model, "threads", threads)
    set_attribute(model, "presolve", presolve ? "choose" : "off")
    verbose || set_silent(model)

    t_solve = @elapsed optimize!(model)        # "CPU time of the optimize! call only"

    status = termination_status(model)
    has_sol = primal_status(model) == MOI.FEASIBLE_POINT
    ub = has_sol ? objective_value(model) : NaN
    lb = try objective_bound(model) catch; NaN end
    gap = has_sol && ub > 0 ? 1.0 - lb / ub : (has_sol ? 0.0 : NaN)
    nodes = try MOI.get(model, MOI.NodeCount()) catch; -1 end
    mlu_check = has_sol ? maximum(maximum(solution_loads(inst, coefs, x, segments, t)) for t in periods) : NaN

    return (instance = inst.name, periods = join(periods, "+"), seed = seed,
            n = inst.n, m = num_arcs(inst), demands = num_demands(inst),
            vars = num_variables(model), constraints = num_constraints(model; count_variable_in_set_constraints = false),
            status = string(status), objective = ub, bound = lb, gap = gap,
            solve_time = t_solve, build_time = t_build, nodes = nodes, mlu_check = mlu_check, baseline = baseline,
            presolve = presolve ? "on" : "off",
            model = model, x = x, segments = segments, coefs = coefs)
end
