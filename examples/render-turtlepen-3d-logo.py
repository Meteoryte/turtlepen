"""Import native TurtlePen exports, verify geometry and render both logo concepts.

blender --background --python examples/render-turtlepen-3d-logo.py -- artifacts/turtlepen-3d-logo
"""
import bpy
import bmesh
import hashlib
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

root = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
results = []

def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

def load(filename):
    before = set(bpy.context.scene.objects)
    if filename.endswith('.stl'):
        bpy.ops.wm.stl_import(filepath=str(root / filename), global_scale=.001)
    else:
        bpy.ops.import_scene.gltf(filepath=str(root / filename))
    return [o for o in set(bpy.context.scene.objects) - before if o.type == 'MESH']

def check(objects):
    details = []
    points = []
    for obj in objects:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.transform(obj.matrix_world)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-9)
        edges = sum(not e.is_manifold for e in bm.edges)
        vertices = sum(not v.is_manifold for v in bm.verts)
        volume = bm.calc_volume(signed=True)
        assert edges == 0 and vertices == 0 and volume > 0, (obj.name, edges, vertices, volume)
        details.append({'object': obj.name, 'triangles': len(bm.faces), 'nonManifoldEdges': edges, 'nonManifoldVertices': vertices, 'volumeCubicMeters': volume})
        points.extend(v.co.copy() for v in bm.verts)
        bm.free()
    return details, {'min': [min(p[i] for p in points) for i in range(3)], 'max': [max(p[i] for p in points) for i in range(3)]}

for receipt in json.loads((root / 'receipts.json').read_text())['artifacts']:
    if receipt['format'] == 'tpf':
        continue
    clear()
    objects = load(receipt['file'])
    details, bounds = check(objects)
    expected = receipt['inspection']
    for key in ['min', 'max']:
        assert all(abs(bounds[key][i] - expected['bounds'][key][i] * .001) < 2e-7 for i in range(3)), receipt['file']
    volume = sum(d['volumeCubicMeters'] for d in details)
    assert abs(volume - expected['volume'] * 1e-9) < max(1e-12, abs(volume) * 3e-5), receipt['file']
    results.append({'file': receipt['file'], 'sha256': hashlib.sha256((root / receipt['file']).read_bytes()).hexdigest(), 'passed': True, 'boundsMeters': bounds, 'meshes': details})

def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = .62
    return mat

def stage(filename, offset=(0, 0, 0), scale=1):
    objects = load(filename)
    for obj in objects:
        world = obj.matrix_world.copy()
        for vertex in obj.data.vertices:
            vertex.co = (world @ vertex.co) * (1000 * scale) + Vector(offset)
        obj.matrix_world.identity()
        # Preserve the source triangles; smooth only the curved character parts.
        if filename == 'full-logo.glb' and not any(word in obj.name for word in ['base', 'board', 'paper', 'tray', 'nib', 'wordmark']):
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
            bm.to_mesh(obj.data)
            bm.free()
            for face in obj.data.polygons:
                face.use_smooth = True
    return objects

def render(name, camera_position, target, span, resolution=(1400, 1300)):
    bpy.ops.mesh.primitive_plane_add(size=2000, location=(0, 0, -.12))
    bpy.context.object.data.materials.append(material('Warm studio paper', (.84, .86, .84)))
    bpy.ops.object.camera_add(location=camera_position)
    camera = bpy.context.object
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = span
    bpy.context.scene.camera = camera
    for position, energy, size in [((-80, -120, 230), 900000, 150), ((150, 50, 160), 550000, 130)]:
        bpy.ops.object.light_add(type='AREA', location=position)
        light = bpy.context.object
        light.data.energy = energy
        light.data.shape = 'DISK'
        light.data.size = size
        light.rotation_euler = (Vector(target) - light.location).to_track_quat('-Z', 'Y').to_euler()
    scene = bpy.context.scene
    scene.world.color = (.24, .24, .24)
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(root / name)
    bpy.ops.render.render(write_still=True)

clear()
stage('full-logo.glb')
render('full-logo-front.png', (145, -250, 160), (3, 0, 40), 160)
clear()
stage('full-logo.glb')
render('full-logo-back.png', (-155, 240, 140), (0, 1, 41), 158)
clear()
stage('raised-brand-badge-color.glb')
render('raised-brand-badge.png', (115, -85, 160), (42, 42, 2), 110)
clear()
stage('full-logo.glb', (-62, 15, 0), .94)
stage('raised-brand-badge-color.glb', (24, -45, 0), .95)
render('collection.png', (150, -330, 260), (2, 0, 28), 245, (1800, 1250))
bpy.ops.wm.save_as_mainfile(filepath=str(root / 'logo-collection.blend'))

(root / 'blender-verification.json').write_text(json.dumps({'blender': bpy.app.version_string, 'passed': True, 'scope': 'Independent imports, component topology, physical bounds and volume. No slicer or printer acceptance.', 'results': results, 'renders': ['full-logo-front.png', 'full-logo-back.png', 'raised-brand-badge.png', 'collection.png']}, indent=2) + '\n')
print('TURTLEPEN_LOGOS_VERIFIED', len(results))
