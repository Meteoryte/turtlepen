"""Independent STL/GLB imports, physical-size checks and a rendered review sheet.

Run: blender --background --python examples/verify-geometry3d-blender.py -- artifacts/geometry3d-prototype
"""
import bpy
import bmesh
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

root = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
receipts = json.loads((root / 'receipts.json').read_text())['artifacts']
results = []
for receipt in receipts:
    if receipt['format'] == 'tpf':
        continue
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    if receipt['format'] == 'stl':
        bpy.ops.wm.stl_import(filepath=str(root / receipt['file']), global_scale=0.001)
    else:
        bpy.ops.import_scene.gltf(filepath=str(root / receipt['file']))
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    assert objects, receipt['file']
    points = [o.matrix_world @ v.co for o in objects for v in o.data.vertices]
    low = [min(p[i] for p in points) for i in range(3)]
    high = [max(p[i] for p in points) for i in range(3)]
    expected = receipt['inspection']['bounds']
    for actual, target in [(low, expected['min']), (high, expected['max'])]:
        assert all(abs(actual[i] - target[i] * .001) < 2e-7 for i in range(3)), (receipt['file'], actual, target)
    meshes = []
    for obj in objects:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.transform(obj.matrix_world)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-9)
        invalid_edges = sum(not e.is_manifold for e in bm.edges)
        invalid_vertices = sum(not v.is_manifold for v in bm.verts)
        volume = bm.calc_volume(signed=True)
        assert invalid_edges == 0 and invalid_vertices == 0 and volume > 0, (receipt['file'], obj.name, invalid_edges, invalid_vertices, volume)
        meshes.append({'object': obj.name, 'triangles': len(bm.faces), 'nonManifoldEdges': invalid_edges, 'nonManifoldVertices': invalid_vertices, 'volumeCubicMeters': volume})
        bm.free()
    volume = sum(m['volumeCubicMeters'] for m in meshes)
    expected_volume = receipt['inspection']['volume'] * 1e-9
    assert abs(volume - expected_volume) < max(1e-12, abs(expected_volume) * 2e-5), (receipt['file'], volume, expected_volume)
    results.append({'file': receipt['file'], 'passed': True, 'boundsMeters': {'min': low, 'max': high}, 'meshes': meshes})

# Review four independent GLB imports, enlarged to a convenient Blender scene scale.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for filename, x, y, size in [
    ('stacked-cubes.glb', -48, 40, 1.4),
    ('curved-robot.glb', 42, 40, .8),
    ('extruded-drawing.glb', -48, -48, 1.3),
    ('castle.glb', 42, -48, 1.0),
]:
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(root / filename))
    objects = [o for o in set(bpy.context.scene.objects) - before if o.type == 'MESH']
    points = [o.matrix_world @ v.co for o in objects for v in o.data.vertices]
    center = Vector(((min(p.x for p in points) + max(p.x for p in points)) / 2, (min(p.y for p in points) + max(p.y for p in points)) / 2, min(p.z for p in points)))
    for obj in objects:
        for v in obj.data.vertices:
            v.co = (obj.matrix_world @ v.co - center) * (1000 * size) + Vector((x, y, 1))
        obj.matrix_world.identity()
    bpy.ops.object.text_add(location=(x - 27, y - 27, 1))
    label = bpy.context.object
    label.data.body = filename.replace('.glb', '').replace('-', ' ').upper()
    label.data.size = 3
    label.data.extrude = .01
    mat = bpy.data.materials.new('Label ink')
    mat.diffuse_color = (.025, .05, .075, 1)
    mat.use_nodes = True
    mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (.025, .05, .075, 1)
    label.data.materials.append(mat)

bpy.ops.mesh.primitive_plane_add(size=1000, location=(0, 0, 0))
paper = bpy.data.materials.new('Warm paper')
paper.diffuse_color = (.82, .84, .82, 1)
paper.use_nodes = True
paper.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (.82, .84, .82, 1)
bpy.context.object.data.materials.append(paper)
bpy.ops.object.camera_add(location=(190, -260, 310))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, 15)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 230
bpy.context.scene.camera = camera
for position, energy, size in [((10, -100, 230), 600000, 160), ((-160, 30, 160), 300000, 140)]:
    bpy.ops.object.light_add(type='AREA', location=position)
    light = bpy.context.object
    light.data.energy = energy
    light.data.shape = 'DISK'
    light.data.size = size
    light.rotation_euler = (Vector((0, 0, 0)) - light.location).to_track_quat('-Z', 'Y').to_euler()
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.world.color = (.3, .3, .3)
scene.render.resolution_x = 1400
scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(root / 'blender-review.png')
bpy.ops.render.render(write_still=True)
(root / 'blender-verification.json').write_text(json.dumps({'blender': bpy.app.version_string, 'scope': 'Independent import, topology, winding, physical bounds and volume. No slicing or physical print.', 'passed': all(r['passed'] for r in results), 'results': results}, indent=2) + '\n')
print('TURTLEPEN_BLENDER_VERIFIED', len(results))
