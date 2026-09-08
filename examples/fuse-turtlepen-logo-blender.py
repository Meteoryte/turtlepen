"""Explicit fabrication derivative: voxel-union the native colored assembly.

This does not add curved boolean support to TurtlePen. The editable TPF and
colored GLB remain the native originals; this STL records its 0.5 mm resolution.
"""
import bpy
import bmesh
import hashlib
import json
import sys
import argparse
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('directory')
parser.add_argument('--source', default='full-logo.glb')
parser.add_argument('--output', default='full-logo-solid.stl')
parser.add_argument('--voxel-size', type=float, default=.5)
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
root = Path(args.directory).resolve()
assert .2 <= args.voxel_size <= 1, 'voxel size must be 0.2-1 mm'
source = (root / args.source).resolve()
path = (root / args.output).resolve()
assert source.parent == root and path.parent == root and path.suffix == '.stl' and source.suffix == '.glb'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for obj in objects:
    world = obj.matrix_world.copy()
    for v in obj.data.vertices:
        v.co = (world @ v.co) * 1000
    obj.matrix_world.identity()
    obj.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
bpy.ops.object.join()
obj = bpy.context.object
obj.name = 'TurtlePen joined fabrication model'
obj.data.remesh_voxel_size = args.voxel_size
obj.data.remesh_voxel_adaptivity = 0
bpy.ops.object.voxel_remesh()

bm = bmesh.new()
bm.from_mesh(obj.data)
bmesh.ops.triangulate(bm, faces=list(bm.faces))
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
lowest = min(v.co.z for v in bm.verts)
for v in bm.verts:
    v.co.z -= lowest
edges = sum(not e.is_manifold for e in bm.edges)
vertices = sum(not v.is_manifold for v in bm.verts)
volume = bm.calc_volume(signed=True)
components = []
unseen = set(bm.verts)
while unseen:
    seed = unseen.pop()
    stack = [seed]
    component = []
    while stack:
        v = stack.pop()
        component.append(v)
        for edge in v.link_edges:
            other = edge.other_vert(v)
            if other in unseen:
                unseen.remove(other)
                stack.append(other)
    components.append(component)
assert edges == 0 and vertices == 0 and volume > 0, (edges, vertices, volume)
components.sort(key=len, reverse=True)
removed = []
for component in components[1:]:
    component_faces = {face for v in component for face in v.link_faces}
    origin = component[0].co.copy()
    fragment_volume = abs(sum((f.verts[0].co - origin).dot((f.verts[1].co - origin).cross(f.verts[2].co - origin)) / 6 for f in component_faces))
    fragment_bounds = {'min': [min(v.co[i] for v in component) for i in range(3)], 'max': [max(v.co[i] for v in component) for i in range(3)]}
    print('REMESH_FRAGMENT', len(component), fragment_volume, fragment_bounds)
    # A remesh cell spans adjacent sample planes; bound debris to two 0.5 mm cells.
    assert len(component) <= 12 and fragment_volume < .02 and all(fragment_bounds['max'][i] - fragment_bounds['min'][i] <= 2*args.voxel_size+1e-5 for i in range(3)), 'disconnected geometry is too large to classify as voxel debris'
    removed.append({'vertices': len(component), 'volumeCubicMillimeters': fragment_volume, 'boundsMillimeters': fragment_bounds})
    bmesh.ops.delete(bm, geom=component, context='VERTS')
volume = bm.calc_volume(signed=True)
assert all(e.is_manifold for e in bm.edges) and all(v.is_manifold for v in bm.verts)
bound = {'min': [min(v.co[i] for v in bm.verts) for i in range(3)], 'max': [max(v.co[i] for v in bm.verts) for i in range(3)]}
triangles = len(bm.faces)
bm.to_mesh(obj.data)
bm.free()
bpy.ops.wm.stl_export(filepath=str(path), export_selected_objects=True, apply_modifiers=True)
report = {'source': source.name, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'blender': bpy.app.version_string, 'operation': f'explicit {args.voxel_size} mm voxel union of native TurtlePen assembly', 'units': 'mm', 'voxelSizeMillimeters': args.voxel_size, 'bedTranslationZ': -lowest, 'triangles': triangles, 'connectedComponents': 1, 'removedVoxelDebris': removed, 'nonManifoldEdges': edges, 'nonManifoldVertices': vertices, 'volumeCubicMillimeters': volume, 'boundsMillimeters': bound, 'physicalPrint': 'not_tested', 'slicerAcceptance': 'not_tested'}
(root / 'fabrication-verification.json').write_text(json.dumps(report, indent=2) + '\n')
print('TURTLEPEN_FULL_STL_VERIFIED', triangles, volume)
