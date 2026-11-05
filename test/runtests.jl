# Checks on the 'toy' instance of the subject (§4–5), copied into test/toy/.
#   julia --project=. test/runtests.jl
using Test
include(joinpath(@__DIR__, "..", "src", "orange_segment_routing.jl"))

const TOY = load_instance(joinpath(@__DIR__, "toy", "toy"))
arc(from_id, to_id) = findfirst(a -> TOY.arc_from[a] == from_id + 1 && TOY.arc_to[a] == to_id + 1, 1:num_arcs(TOY))
rvalue(c, i, j, a) = (k = findfirst(p -> p[1] == a, c.terms[i+1, j+1]); k === nothing ? 0.0 : c.terms[i+1, j+1][k][2])

"MLU of a routing given as waypoint lists (0-based JSON ids) for each demand at period t."
function mlu_of(waypoints, c, t)
    load = zeros(num_arcs(TOY))
    for (d, w) in enumerate(waypoints)
        seq = [TOY.demand_source[d]; w .+ 1; TOY.demand_target[d]]
        for (i, j) in zip(seq[1:end-1], seq[2:end]), (a, r) in c.terms[i, j]
            load[a] += r * TOY.volume[d, t+1]
        end
    end
    return maximum(load ./ TOY.arc_capacity)
end

"Brute force over all waypoint sequences with ≤ maxSeg segments and no repeated segment."
function brute_force_mlu(c, t)
    n, L = TOY.n, TOY.max_segments - 1
    seqs(d) = begin
        out = Vector{Vector{Int}}()
        function rec(w)
            full = [TOY.demand_source[d] - 1; w; TOY.demand_target[d] - 1]
            segs = collect(zip(full[1:end-1], full[2:end]))
            ok = all(p -> p[1] != p[2] && c.reachable[p[1]+1, p[2]+1], segs) && allunique(segs)
            ok && push!(out, copy(w))
            length(w) < L && for v in 0:n-1
                push!(w, v); rec(w); pop!(w)
            end
        end
        rec(Int[]); out
    end
    S1, S2 = seqs(1), seqs(2)
    return minimum(mlu_of([w1, w2], c, t) for w1 in S1, w2 in S2)
end

@testset "toy instance" begin
    @test TOY.n == 7 && num_arcs(TOY) == 22 && num_demands(TOY) == 2
    @test sort(TOY.arcs_down[2]) == sort([arc(1, 3), arc(1, 4)])

    c0 = split_coefficients(TOY, 0)
    # demand (v0,v5): 3 shortest paths 0-1-3-5, 0-1-4-3-5, 0-1-4-6-5 (all of length 400)
    @test rvalue(c0, 0, 5, arc(0, 1)) ≈ 1
    @test rvalue(c0, 0, 5, arc(1, 3)) ≈ 1 / 3
    @test rvalue(c0, 0, 5, arc(1, 4)) ≈ 2 / 3
    @test rvalue(c0, 0, 5, arc(3, 5)) ≈ 2 / 3
    @test rvalue(c0, 0, 5, arc(6, 5)) ≈ 1 / 3
    @test rvalue(c0, 0, 5, arc(0, 2)) == 0
    # demand (v2,v5): the subject's Table 2 values (path counting and ECMP agree here)
    for (u, v, r) in [(2, 4, 1.0), (4, 6, 0.5), (6, 5, 0.5), (4, 3, 0.5), (3, 5, 0.5), (4, 5, 0.0)]
        @test rvalue(c0, 2, 5, arc(u, v)) ≈ r
    end
    # r sums to 1 on the arcs leaving the source of every reachable pair
    @test all(sum(r for (a, r) in c0.terms[i, j] if TOY.arc_from[a] == i; init = 0.0) ≈ 1
              for i in 1:7, j in 1:7 if c0.reachable[i, j])

    # period 0: no-waypoint routing, then MILP optimum == brute force optimum
    @test mlu_of([Int[], Int[]], c0, 0) ≈ (50 * 2 / 3 + 100 * 0.5) / 200     # arc (3,5)
    res0 = solve_instance(TOY, [0]; time_limit = 60)
    @test res0.status == "OPTIMAL"
    @test res0.objective ≈ brute_force_mlu(c0, 0) atol = 1e-6
    @test res0.mlu_check ≈ res0.objective atol = 1e-6

    # period 1: arcs (1,3),(1,4) down; two-period model with budget 20 vs no-budget lower bound
    c1 = split_coefficients(TOY, 1)
    @test all(a ∉ TOY.arcs_down[2] for i in 1:7, j in 1:7 for (a, _) in c1.terms[i, j])
    @test rvalue(c1, 0, 5, arc(0, 2)) ≈ 1          # v0 must now leave through v2
    res01 = solve_instance(TOY, [0, 1]; time_limit = 60)
    @test res01.status == "OPTIMAL"
    @test res01.objective ≈ max(brute_force_mlu(c0, 0), brute_force_mlu(c1, 1)) atol = 1e-6
    @test res01.mlu_check ≈ res01.objective atol = 1e-6
    println("toy: MLU t0 = ", res0.objective, ", MLU t0+t1 = ", res01.objective,
            ", waypoints d0@t0 = ", extract_waypoints(TOY, res0.x, res0.segments, 1, 0) .- 1)
end
