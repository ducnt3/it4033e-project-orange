# Split coefficients r(i, j, a, t) following the teacher's note project/calculating_r.pdf:
#
#   r(i,j,a,t) = σ_iu(t) σ_vj(t) / σ_ij(t)   if d_iu(t) + c_a + d_vj(t) = d_ij(t), a = (u,v)
#              = 0                            otherwise,
#
# where d is the shortest-path distance and σ the number of shortest paths in G(t) = (V, A \ q(t)).
# This is the fraction of shortest i→j paths that use arc a (path counting). Note that it differs
# from the per-node even split (ECMP) drawn in Figure 1 of the subject when shortest paths branch
# at different depths; we follow the teacher's definition, as required by project/readme step 3.

using Graphs

"""
Sparse split coefficients for one period.

- `reachable[i, j]` is true when j can be reached from i (i ≠ j) in G(t);
  only those ordered pairs can be used as segments.
- `terms[i, j]` lists `(a, r)` with r = r(i,j,a,t) > 0.
"""
struct SplitCoefficients
    reachable::BitMatrix
    terms::Matrix{Vector{Tuple{Int,Float64}}}
end

"All-pairs shortest distances and path counts on the arcs `arcs` (Dijkstra from every source)."
function all_pairs_shortest_data(inst::Instance, arcs::AbstractVector{Int})
    n = inst.n
    g = SimpleDiGraph(n)
    distmx = zeros(n, n)
    for a in arcs
        add_edge!(g, inst.arc_from[a], inst.arc_to[a])
        distmx[inst.arc_from[a], inst.arc_to[a]] = inst.arc_metric[a]
    end
    d = fill(Inf, n, n)
    sigma = zeros(n, n)
    for i in 1:n
        state = dijkstra_shortest_paths(g, i, distmx; allpaths = true)
        d[i, :] .= state.dists
        sigma[i, :] .= state.pathcounts
    end
    return d, sigma
end

"Split coefficients r(·,·,·,t) for period `t` (0-based)."
function split_coefficients(inst::Instance, t::Int; rtol = 1e-9)
    n = inst.n
    arcs = active_arcs(inst, t)
    d, sigma = all_pairs_shortest_data(inst, arcs)

    reachable = falses(n, n)
    terms = [Tuple{Int,Float64}[] for _ in 1:n, _ in 1:n]
    for i in 1:n, j in 1:n
        reachable[i, j] = i != j && isfinite(d[i, j])
    end

    for i in 1:n, a in arcs
        u, v, c = inst.arc_from[a], inst.arc_to[a], inst.arc_metric[a]
        isfinite(d[i, u]) || continue
        for j in 1:n
            reachable[i, j] || continue
            # arc a = (u,v) lies on a shortest i→j path iff d_iu + c_a + d_vj = d_ij
            if isapprox(d[i, u] + c + d[v, j], d[i, j]; rtol = rtol)
                push!(terms[i, j], (a, sigma[i, u] * sigma[v, j] / sigma[i, j]))
            end
        end
    end
    return SplitCoefficients(reachable, terms)
end
