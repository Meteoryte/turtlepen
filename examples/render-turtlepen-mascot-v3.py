"""Render and independently inspect TurtlePen's native GLB; never sculpt imported geometry."""
import bpy, bmesh, json, hashlib, sys
from pathlib import Path
from mathutils import Vector, Matrix

root = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
preview = '--preview' in sys.argv
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
source = root / 'mascot.glb'
bpy.ops.import_scene.gltf(filepath=str(source))
objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
receipt = next(r['result'] for r in json.loads((root / 'mcp-export-receipts.json').read_text()) if r['result']['format'] == 'glb')
assert hashlib.sha256(source.read_bytes()).hexdigest() == receipt['sha256']
details, points = [], []
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
    # Unit conversion for camera convenience only, with original triangle positions/normals intact.
    obj.matrix_world = Matrix.Scale(1000, 4) @ obj.matrix_world
    for mat in obj.data.materials:
        if mat.use_nodes:
            bsdf = mat.node_tree.nodes.get('Principled BSDF')
            bsdf.inputs['Roughness'].default_value = .3 if 'pupil' in obj.name else .53
            if 'nib' in obj.name or 'gold' in obj.name:
                bsdf.inputs['Metallic'].default_value = .65
                bsdf.inputs['Roughness'].default_value = .3

bounds = {k: [f(p[i] for p in points) for i in range(3)] for k, f in [('min', min), ('max', max)]}
expected = receipt['inspection']
for k in bounds:
    assert all(abs(bounds[k][i] - expected['bounds'][k][i] * .001) < 2e-7 for i in range(3)), (k, bounds)
volume = sum(d['volumeCubicMeters'] for d in details)
assert abs(volume - expected['volume'] * 1e-9) < max(1e-12, abs(volume) * 3e-5)
names = {o.name for o in objects}
toe_counts = {side: sum(name.startswith(side + '-toe-') for name in names) for side in ['near', 'far']}
assert toe_counts == {'near': 3, 'far': 3}, toe_counts
assert len(objects) == len(expected['parts'])

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 20 if preview else 64
scene.cycles.use_denoising = True
device = 'CPU'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'
    prefs.get_devices()
    gpu = [d for d in prefs.devices if d.type == 'OPTIX']
    if gpu:
        for d in prefs.devices:
            d.use = d.type == 'OPTIX'
        scene.cycles.device = 'GPU'
        device = ', '.join(d.name for d in gpu)
except Exception as error:
    print('GPU unavailable; CPU rendering:', error)
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.75, .77, .8, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .25
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'

bpy.ops.mesh.primitive_plane_add(size=2500, location=(0, 0, -.1))
floor = bpy.context.object
floor.name = 'STAGE - ground (not part of exported model)'
material = bpy.data.materials.new('Warm ivory studio')
material.diffuse_color = (.8, .79, .76, 1)
floor.data.materials.append(material)
for position, energy, size in [((-140,-160,260),900000,220),((180,-80,170),350000,160),((-30,150,240),700000,160)]:
    bpy.ops.object.light_add(type='AREA', location=position)
    light = bpy.context.object
    light.data.energy = energy
    light.data.shape = 'DISK'
    light.data.size = size
    light.rotation_euler = (Vector((0,0,72)) - light.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.object.camera_add()
camera = bpy.context.object
scene.camera = camera
camera.data.type = 'ORTHO'

renders = []
def render(name, position, target, span, resolution):
    camera.location = position
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = span
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(root / name)
    bpy.ops.render.render(write_still=True)
    renders.append({'file': name, 'sha256': hashlib.sha256((root / name).read_bytes()).hexdigest(), 'camera': list(position), 'target': list(target)})

front = ((-110,-340,165), (10,8,70), 224)
render('preview.png' if preview else 'mascot-front.png', *front, (1100,1000) if preview else (1800,1600))
if not preview:
    render('mascot-back.png', (-140,290,170), (10,8,70), 225, (1500,1400))
    render('mascot-side.png', (-300,-60,150), (-40,4,71), 170, (1300,1400))
    render('mascot-detail.png', (-70,-360,160), (-40,-8,98), 106, (1500,1500))
    camera.location = front[0]
    camera.rotation_euler = (Vector(front[1]) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = front[2]
    scene.render.resolution_x, scene.render.resolution_y = (1800,1600)
    bpy.ops.wm.save_as_mainfile(filepath=str(root / 'mascot.blend'))

verification = {'passed': True, 'blender': bpy.app.version_string, 'device': device, 'source': source.name, 'sha256': receipt['sha256'], 'boundsMeters': bounds, 'toeCounts': toe_counts, 'parts': details, 'renders': renders, 'previewGeometry': 'Unmodified native TurtlePen GLB positions/normals; staging, lighting and material roughness only', 'assembly': 'Intentional overlapping colored components; not a fused solid', 'slicerAcceptance': 'not_tested', 'physicalPrint': 'not_tested'}
(root / ('preview-verification.json' if preview else 'blender-verification.json')).write_text(json.dumps(verification, indent=2) + '\n')
print('MASCOT_V3_NATIVE_IMPORT_PASS', len(details), toe_counts, device)
