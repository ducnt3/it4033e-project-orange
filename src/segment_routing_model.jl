# MILP for T-Adaptive Segment Routing (subject §3), restricted to the periods in `periods`.
#
#   x[d,i,j,t] ∈ {0,1}   demand d uses segment (i,j) at period t     (only reachable pairs i ≠ j)
#   U ≥ 0                maximum link utilization over all arcs and periods
#
#   min U
#   (1) Σ_j x[d,i,j,t] − Σ_j x[d,j,i,t] = 1 / −1 / 0   (i = s_d / i = t_d / otherwise)
#   (2) Σ_{i,j} x[d,i,j,t] ≤ maxSeg
#   (3) Σ_d Σ_{i,j} r(i,j,a,t) ν(d,t) x[d,i,j,t] ≤ U · c(a)       ∀ a ∈ A \ q(t)
#   (4) Σ_d Σ_{i≠j} y[d,i,j,t] ≤ κ(t),  y ≥ x[·,t] − x[·,t−1],  y ≥ x[·,t−1] − x[·,t]   (t ≥ 1)
#
# Objective: the subject asks for a lexicographic minimisation of all loads; its first (dominant)
# criterion is the maximum load, which is what this model minimises (single-objective MLU).
# In (4), y only appears in "Σ y ≤ κ", so y ≥ |x_t − x_{t−1}| describes exactly the feasible x.

using JuMP

"Segments (i,j) reachable in G(t) for at least one t in `periods`; x is fixed to 0 where unreachable."
usable_segments(coefs::Dict{Int,SplitCoefficients}, periods) =
    Tuple.(findall(reduce(.|, (coefs[t].reachable for t in periods))))

"""
Build the model. `coefs[t]` holds r(·,·,·,t) for every t in `periods` (0-based, sorted).
Returns (model, x, U) with x indexed as x[d, k, t] where k indexes `segments`.
"""
function build_model(inst::Instance, coefs::Dict{Int,SplitCoefficients}, periods::Vector{Int};
                     optimizer, segments = usable_segments(coefs, periods))
    model = Model(optimizer)
    D = 1:num_demands(inst)
    K = eachindex(segments)
    seg_from = first.(segments)
    seg_to = last.(segments)

    @variable(model, x[D, K, periods], Bin)
    @variable(model, U >= 0)
    @objective(model, Min, U)

    # A segment whose endpoints are disconnected in G(t) (links down) cannot be used at period t.
    for t in periods, k in K
        coefs[t].reachable[seg_from[k], seg_to[k]] || fix.(x[:, k, t], 0; force = true)
    end

    # Outgoing / incoming segment indices of every node, to write (1) sparsely.
    out_segs = [Int[] for _ in 1:inst.n]
    in_segs = [Int[] for _ in 1:inst.n]
    for k in K
        push!(out_segs[seg_from[k]], k)
        push!(in_segs[seg_to[k]], k)
    end

    for t in periods, d in D
        s, dst = inst.demand_source[d], inst.demand_target[d]
        for i in 1:inst.n
            rhs = i == s ? 1 : (i == dst ? -1 : 0)
            @constraint(model, sum(x[d, k, t] for k in out_segs[i]; init = 0) -
                               sum(x[d, k, t] for k in in_segs[i]; init = 0) == rhs)       # (1)
        end
        @constraint(model, sum(x[d, k, t] for k in K) <= inst.max_segments)               # (2)
    end

    # (3) load of every available arc, built arc-by-arc from the sparse split coefficients
    for t in periods
        load = Dict(a => AffExpr(0.0) for a in active_arcs(inst, t))
        for k in K, (a, r) in coefs[t].terms[seg_from[k], seg_to[k]], d in D
            v = inst.volume[d, t+1]
            v > 0 && add_to_expression!(load[a], r * v, x[d, k, t])
        end
        for (a, expr) in load
            @constraint(model, expr <= inst.arc_capacity[a] * U)
        end
    end

    # (4) budget on the number of segment changes between consecutive periods
    for t in periods
        t >= 1 && (t - 1) in periods || continue
        y = @variable(model, [D, K], lower_bound = 0)
        @constraint(model, [d in D, k in K], y[d, k] >= x[d, k, t] - x[d, k, t-1])
        @constraint(model, [d in D, k in K], y[d, k] >= x[d, k, t-1] - x[d, k, t])
        # generator form: Base.sum over a DenseAxisArray of variables is quadratic in its length
        @constraint(model, sum(y[d, k] for d in D, k in K) <= inst.budget[t+1])
    end

    return model, x, U, segments
end

"Waypoints of demand d at period t, read from a solution by walking the chosen segments from s_d."
function extract_waypoints(inst::Instance, x, segments, d::Int, t::Int)
    next = Dict{Int,Vector{Int}}()
    for (k, (i, j)) in enumerate(segments)
        value(x[d, k, t]) > 0.5 && push!(get!(next, i, Int[]), j)
    end
    node, target, path = inst.demand_source[d], inst.demand_target[d], Int[]
    while node != target
        node = pop!(next[node])
        node != target && push!(path, node)
    end
    return path            # Julia vertex numbers; any leftover cycles (no effect on the walk) are ignored
end
