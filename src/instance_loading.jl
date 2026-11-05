# Reading one T-ASR instance (three JSON files: -net, -tm, -scenario) into plain Julia arrays.
#
# Conventions
# - JSON node ids may start at 0; they are mapped to Julia vertices 1:n in file order
#   (same convention as the teacher's notebook project/json_to_graph_pluto_v2.jl).
# - Arcs are numbered 1:m in the order of the "links" array; `arc_link_id[a]` keeps the JSON id.
# - Time periods are 0-based in the files and in the subject; Julia arrays indexed by period
#   use `t + 1`.

using JSON3

struct Instance
    name::String
    n::Int                               # number of vertices
    node_name::Vector{String}
    arc_from::Vector{Int}                # arc a goes arc_from[a] -> arc_to[a]
    arc_to::Vector{Int}
    arc_metric::Vector{Float64}          # ω(a), used for shortest paths
    arc_capacity::Vector{Float64}        # c(a)
    arc_link_id::Vector{Int}             # JSON link id of arc a
    demand_source::Vector{Int}
    demand_target::Vector{Int}
    volume::Matrix{Float64}              # volume[d, t+1] = ν(d, t)
    num_periods::Int                     # h = |T|
    max_segments::Int                    # maxSeg
    budget::Vector{Int}                  # budget[t+1] = κ(t); budget[1] unused (period 0 is unbounded)
    arcs_down::Vector{Vector{Int}}       # arcs_down[t+1] = arc indices in q(t); empty for t = 0
end

num_arcs(inst::Instance) = length(inst.arc_from)
num_demands(inst::Instance) = length(inst.demand_source)

"Load instance `prefix` from `prefix-net.json`, `prefix-tm.json`, `prefix-scenario.json`."
function load_instance(prefix::AbstractString)
    net = JSON3.read(read(prefix * "-net.json", String))
    tm = JSON3.read(read(prefix * "-tm.json", String))
    scen = JSON3.read(read(prefix * "-scenario.json", String))

    Bool(get(net, :directed, true)) || error("Only directed networks are supported.")
    # Several setA files declare "multigraph": true but contain no parallel arcs; only real
    # parallel arcs are rejected (checked below), since Graphs.SimpleDiGraph cannot hold them.

    # ---------- nodes ----------
    node_ids = [Int(nd[:id]) for nd in net[:nodes]]
    allunique(node_ids) || error("Duplicate node ids in $prefix-net.json")
    vertex_of = Dict(id => k for (k, id) in enumerate(node_ids))
    node_name = [String(nd[:name]) for nd in net[:nodes]]

    # ---------- arcs ----------
    links = net[:links]
    arc_from = [vertex_of[Int(l[:from])] for l in links]
    arc_to = [vertex_of[Int(l[:to])] for l in links]
    arc_metric = [Float64(l[:metric]) for l in links]
    arc_capacity = [Float64(l[:capacity]) for l in links]
    arc_link_id = [Int(l[:id]) for l in links]
    all(>(0), arc_metric) || error("Arc metrics must be strictly positive.")
    allunique(zip(arc_from, arc_to)) || error("Parallel arcs are not supported ($prefix-net.json).")
    arc_of_link = Dict(id => a for (a, id) in enumerate(arc_link_id))

    # ---------- demands and traffic matrix ----------
    h = Int(tm[:num_time_slots])
    demands = tm[:demands]
    demand_source = [vertex_of[Int(dm[:s])] for dm in demands]
    demand_target = [vertex_of[Int(dm[:t])] for dm in demands]
    volume = zeros(length(demands), h)
    for (d, dm) in enumerate(demands)
        length(dm[:v]) == h || error("Demand $(d-1) has $(length(dm[:v])) volumes, expected $h.")
        volume[d, :] .= Float64.(dm[:v])
    end

    # ---------- scenario: maxSeg, budgets, interventions ----------
    budget = fill(typemax(Int), h)               # κ(0) is infinite by convention
    for b in scen[:budget]
        budget[Int(b[:t])+1] = Int(b[:value])
    end
    arcs_down = [Int[] for _ in 1:h]
    for iv in scen[:interventions]
        t = Int(iv[:t])
        t >= 1 || error("Interventions at period 0 are not allowed.")
        append!(arcs_down[t+1], (arc_of_link[Int(id)] for id in iv[:links]))
    end

    return Instance(basename(prefix), length(node_ids), node_name,
        arc_from, arc_to, arc_metric, arc_capacity, arc_link_id,
        demand_source, demand_target, volume, h, Int(scen[:max_segments]),
        budget, arcs_down)
end

"Indices of the arcs available at period `t` (0-based), i.e. A \\ q(t)."
active_arcs(inst::Instance, t::Int) = setdiff(1:num_arcs(inst), inst.arcs_down[t+1])
