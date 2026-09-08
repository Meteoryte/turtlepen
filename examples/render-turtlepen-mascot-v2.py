"""Independently inspect the native GLB and render its actual geometry/normals."""
import bpy, bmesh, json, hashlib, sys
from pathlib import Path
from mathutils import Vector, Matrix

root = Path(sys.argv[sys.argv.index('--')+1]).resolve()
preview = '--preview' in sys.argv
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
source = root / 'mascot.glb'
bpy.ops.import_scene.gltf(filepath=str(source))
objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
details=[]
points=[]
for obj in objects:
    bm=bmesh.new(); bm.from_mesh(obj.data); bm.transform(obj.matrix_world)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-9)
    edges=sum(not e.is_manifold for e in bm.edges)
    vertices=sum(not v.is_manifold for v in bm.verts)
    volume=bm.calc_volume(signed=True)
    assert edges == 0 and vertices == 0 and volume > 0, (obj.name, edges, vertices, volume)
    details.append({'object':obj.name,'triangles':len(bm.faces),'nonManifoldEdges':edges,'nonManifoldVertices':vertices,'volumeCubicMeters':volume})
    points.extend(v.co.copy() for v in bm.verts); bm.free()
    # Use the exported normals. No smooth modifiers, geometry repair, or sculpting in the preview.
    obj.matrix_world = Matrix.Scale(1000,4) @ obj.matrix_world
    for mat in obj.data.materials:
        if mat.use_nodes:
            bsdf=mat.node_tree.nodes.get('Principled BSDF')
            bsdf.inputs['Roughness'].default_value=.46 if 'eye' in obj.name or 'pupil' in obj.name else .58

expected=json.loads((root/'receipts.json').read_text())['artifacts'][1]['inspection']
bounds={k:[f(p[i] for p in points) for i in range(3)] for k,f in [('min',min),('max',max)]}
for k in bounds:
    assert all(abs(bounds[k][i]-expected['bounds'][k][i]*.001)<2e-7 for i in range(3)),(k,bounds,expected['bounds'])
volume=sum(d['volumeCubicMeters'] for d in details)
assert abs(volume-expected['volume']*1e-9)<max(1e-12,abs(volume)*3e-5)

def mat(name,color):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);return m
bpy.ops.mesh.primitive_plane_add(size=2000, location=(0,0,-.15))
bpy.context.object.data.materials.append(mat('Warm neutral studio',(.67,.70,.67)))
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=16 if preview else 48
scene.cycles.use_denoising=True
scene.world.color=(.32,.32,.32)
scene.view_settings.view_transform='AgX'
for position,energy,size in [((-90,-130,210),850000,150),((130,-20,120),400000,110),((-20,110,180),700000,100)]:
    bpy.ops.object.light_add(type='AREA',location=position)
    light=bpy.context.object;light.data.energy=energy;light.data.shape='DISK';light.data.size=size
    light.rotation_euler=(Vector((0,0,40))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add()
camera=bpy.context.object;scene.camera=camera;camera.data.type='ORTHO'
def render(name,position,target,span,resolution):
    camera.location=position;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=span
    scene.render.resolution_x,scene.render.resolution_y=resolution;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(root/name)
    bpy.ops.render.render(write_still=True)

render('preview.png' if preview else 'mascot-front.png',(-65,-235,135),(0,0,39),152,(1000,1000) if preview else (1600,1500))
if not preview:
    render('mascot-back.png',(-115,210,125),(-2,1,39),153,(1600,1500))
    render('mascot-face.png',(25,-200,110),(-15,-10,62),74,(1400,1400))
    render('mascot-side.png',(160,-170,105),(0,0,39),148,(1600,1500))
    camera.location=(-65,-235,135);camera.rotation_euler=(Vector((0,0,39))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=152
    bpy.ops.wm.save_as_mainfile(filepath=str(root/'mascot.blend'))
    (root/'blender-verification.json').write_text(json.dumps({'passed':True,'blender':bpy.app.version_string,'source':source.name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'boundsMeters':bounds,'parts':details,'previewGeometry':'native GLB triangles and normals; only stage, camera, lights, roughness added','slicerAcceptance':'not_tested','physicalPrint':'not_tested'},indent=2)+'\n')
print('MASCOT_V2_NATIVE_IMPORT_PASS',len(details))
