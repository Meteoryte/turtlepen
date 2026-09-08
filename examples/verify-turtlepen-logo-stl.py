"""Independent binary STL reader: verifies the exported bytes without Blender."""
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'artifacts/turtlepen-3d-logo').resolve()
results = []
for filename in sys.argv[2:] or ['full-logo-solid.stl', 'raised-brand-badge.stl']:
    data = (root / filename).read_bytes()
    count = struct.unpack_from('<I', data, 80)[0]
    assert len(data) == 84 + 50 * count
    vertices, lookup, parents, edges = [], {}, [], {}
    volume = 0
    degenerate = 0
    def vertex(p):
        if p not in lookup:
            lookup[p] = len(vertices)
            parents.append(len(vertices))
            vertices.append(p)
        return lookup[p]
    def component(v):
        while parents[v] != v:
            parents[v] = parents[parents[v]]
            v = parents[v]
        return v
    def sub(a, b):
        return tuple(a[i] - b[i] for i in range(3))
    def cross(a, b):
        return (a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0])
    for n in range(count):
        values = struct.unpack_from('<12fH', data, 84 + n * 50)
        points = [values[i:i+3] for i in [3, 6, 9]]
        assert all(math.isfinite(v) for p in points for v in p)
        ids = [vertex(p) for p in points]
        normal = cross(sub(points[1], points[0]), sub(points[2], points[0]))
        degenerate += len(set(ids)) < 3 or sum(v*v for v in normal) < 1e-28
        relative = [sub(p, vertices[0]) for p in points]
        product = cross(relative[1], relative[2])
        volume += sum(relative[0][i] * product[i] for i in range(3)) / 6
        for a, b in zip(ids, [ids[1], ids[2], ids[0]]):
            key = (min(a,b), max(a,b))
            old = edges.get(key, (0, 0))
            edges[key] = (old[0]+1, old[1]+(1 if a < b else -1))
            parents[component(a)] = component(b)
    bad_edges = sum(n != 2 for n, balance in edges.values())
    bad_winding = sum(balance != 0 for n, balance in edges.values())
    components = len({component(v) for v in range(len(vertices))})
    assert bad_edges == 0 and bad_winding == 0 and degenerate == 0 and components == 1 and volume > 0, (filename, bad_edges, bad_winding, degenerate, components)
    bounds = {'min': [min(p[i] for p in vertices) for i in range(3)], 'max': [max(p[i] for p in vertices) for i in range(3)]}
    results.append({'file': filename, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'triangles': count, 'vertices': len(vertices), 'nonManifoldEdges': bad_edges, 'inconsistentEdges': bad_winding, 'degenerateTriangles': degenerate, 'connectedComponents': components, 'volumeCubicMillimeters': volume, 'boundsMillimeters': bounds, 'passed': True})
(root / 'stl-byte-verification.json').write_text(json.dumps({'passed': True, 'scope': 'Independent binary STL structure, finite coordinates, edge incidence, winding, area, connected components and volume; no slicing or physical printing', 'results': results}, indent=2) + '\n')
print(json.dumps([{'file': r['file'], 'triangles': r['triangles'], 'components': r['connectedComponents'], 'passed': r['passed']} for r in results], indent=2))
