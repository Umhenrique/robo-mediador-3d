"""
Gerador CAD Paramétrico dos Arquivos STL para Impressão 3D (Bambu Lab)
Robô Mediador Social "Bento" (Inspirado no Type-B de Noguchi, Kamide & Tanaka, 2023)
Projetado especificamente para o Micro Servo SG90 (9g) e LEDs 5mm do Master Kit Arduino UNO R3.

Gera 4 arquivos STL 100% sólidos (watertight / manifold) prontos para o Bambu Studio:
  1. 01_Corpo_Base_SG90.stl    -> Corpo oco com base plana, berço exato para 1 Servo SG90 no topo
                                  e túnel traseiro para passar os fios até o Arduino UNO R3.
  2. 02_Cabeca_Bento_SG90.stl  -> Cabeça arredondada fofa (com cavidades dos olhos, sorriso e
                                  furos internos para 2 LEDs de 5mm do Master Kit) + encaixe
                                  inferior para o braço (horn) do servo SG90.
  3. 03_Par_Bracos_Encaixe.stl -> Par de braços laterais com pino de encaixe rápido no corpo.
  4. 04_Bento_Montado_Preview.stl -> Modelo completo montado para visualização ou impressão única.
"""

import os
import numpy as np
import trimesh
from trimesh.creation import cylinder, icosphere, box, capsule

OUT_DIR = os.path.join(os.path.dirname(__file__), "stl")
os.makedirs(OUT_DIR, exist_ok=True)


def union_all(meshes):
    return trimesh.boolean.union(meshes, engine="manifold")


def diff(base_mesh, cutters):
    return trimesh.boolean.difference([base_mesh] + list(cutters), engine="manifold")


def build_body_base():
    """
    1. CORPO + BASE + SUPORTE DO SERVO SG90 (Altura: ~88 mm, Largura: ~84 mm)
    Base plana na cota Z=0 para imprimir na Bambu Lab SEM precisar de suportes!
    """
    # Corpo principal em formato de cápsula suave truncada na base (Z=0 até Z=88)
    outer_sphere_bottom = icosphere(subdivisions=4, radius=41.0)
    outer_sphere_bottom.apply_scale([1.0, 0.92, 1.05])
    outer_sphere_bottom.apply_translation([0, 0, 38.0])

    outer_sphere_top = icosphere(subdivisions=4, radius=36.0)
    outer_sphere_top.apply_scale([1.0, 0.92, 1.0])
    outer_sphere_top.apply_translation([0, 0, 60.0])

    body_hull = trimesh.convex.convex_hull(
        np.vstack([outer_sphere_bottom.vertices, outer_sphere_top.vertices])
    )

    # Anel de pedestal na base
    pedestal = cylinder(radius=39.0, height=8.0, sections=64)
    pedestal.apply_translation([0, 0, 4.0])

    # Colar do pescoço no topo (Z=84 a Z=92)
    neck_collar = cylinder(radius=21.0, height=10.0, sections=64)
    neck_collar.apply_translation([0, 0, 87.0])

    outer = union_all([body_hull, pedestal, neck_collar])

    # Corta tudo abaixo de Z=0 para garantir base 100% plana na mesa da Bambu Lab
    bottom_cutoff = box(extents=[200, 200, 100])
    bottom_cutoff.apply_translation([0, 0, -50.0])
    outer = diff(outer, [bottom_cutoff])

    # Corta o topo plano em Z=90 para assentar as abas do servo SG90
    top_cutoff = box(extents=[200, 200, 100])
    top_cutoff.apply_translation([0, 0, 90.0 + 50.0])
    outer = diff(outer, [top_cutoff])

    # Cavidade interna oca (parede de ~3.5mm super resistente) para passar os cabos
    inner_void = cylinder(radius=28.0, height=74.0, sections=48)
    inner_void.apply_translation([0, 0, 37.0])

    # Berço exato para o Micro Servo SG90 (corpo do SG90: 23.2 x 12.6 mm + folga de 0.4mm = 23.6 x 13.0 mm)
    # O eixo do SG90 é deslocado ~5.5mm para um lado; deslocamos o bolso em X para o eixo ficar no centro (0,0)!
    sg90_pocket = box(extents=[23.8, 13.2, 28.0])
    sg90_pocket.apply_translation([5.5, 0, 80.0])

    # Rebaixo para as abas (orelhas) do SG90 (32.8 x 13.2 x 2.6 mm)
    sg90_ears = box(extents=[33.2, 13.2, 3.0])
    sg90_ears.apply_translation([5.5, 0, 89.0])

    # Furos guia de 1.8mm para os 2 parafusos do SG90
    screw_l = cylinder(radius=0.95, height=16.0, sections=24)
    screw_l.apply_translation([5.5 - 14.0, 0, 86.0])
    screw_r = cylinder(radius=0.95, height=16.0, sections=24)
    screw_r.apply_translation([5.5 + 14.0, 0, 86.0])

    # Furo vertical para descer o cabo do servo SG90 e os fios dos LEDs da cabeça
    cable_drop = cylinder(radius=8.5, height=40.0, sections=32)
    cable_drop.apply_translation([-8.0, 0, 76.0])

    # Saída traseira (Y positivo = costas, Y negativo = frente) na base para o cabo USB / Jumpers irem ao Arduino UNO
    rear_cable_tunnel = cylinder(radius=7.5, height=60.0, sections=32)
    rear_cable_tunnel.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    rear_cable_tunnel.apply_translation([0, 28.0, 7.5])

    # Furo frontal no peito para encaixar 1 LED de 5mm (raio 2.65mm com folga) do Master Kit
    chest_led_hole = cylinder(radius=2.65, height=30.0, sections=32)
    chest_led_hole.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    chest_led_hole.apply_translation([0, -32.0, 52.0])

    # Furos laterais (esquerdo e direito) de 8.4mm de diâmetro para encaixar os braços
    arm_socket_l = cylinder(radius=4.25, height=22.0, sections=32)
    arm_socket_l.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    arm_socket_l.apply_translation([-36.0, 0, 56.0])

    arm_socket_r = cylinder(radius=4.25, height=22.0, sections=32)
    arm_socket_r.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    arm_socket_r.apply_translation([36.0, 0, 56.0])

    body_final = diff(
        outer,
        [
            inner_void,
            sg90_pocket,
            sg90_ears,
            screw_l,
            screw_r,
            cable_drop,
            rear_cable_tunnel,
            chest_led_hole,
            arm_socket_l,
            arm_socket_r,
        ],
    )
    return body_final


def build_head():
    """
    2. CABEÇA DO BENTO (Largura: ~86 mm, Altura: ~68 mm)
    Base inferior plana em Z=0 com encaixe para a engrenagem/cruzeta (horn) do Servo SG90.
    Olhos circulares em baixo-relevo (com furo opcional central de 5.2mm caso queira colocar LED 5mm nos olhos)
    e sorriso amigável esculpido na frente (Y negativo).
    """
    head_sphere = icosphere(subdivisions=4, radius=42.0)
    head_sphere.apply_scale([1.06, 0.96, 0.88])
    head_sphere.apply_translation([0, 0, 32.0])

    # Corta a base inferior em Z=0 para assentar perfeitamente na mesa da Bambu Lab sem suportes
    bottom_cut = box(extents=[200, 200, 100])
    bottom_cut.apply_translation([0, 0, -50.0])
    head_solid = diff(head_sphere, [bottom_cut])

    # Cavidade interna leve para reduzir peso no servo SG90
    head_hollow = icosphere(subdivisions=3, radius=31.0)
    head_hollow.apply_scale([1.04, 0.94, 0.82])
    head_hollow.apply_translation([0, 0, 32.0])

    # Pilar central interno onde o eixo/cruzeta do servo SG90 se encaixa
    center_boss = cylinder(radius=12.0, height=24.0, sections=48)
    center_boss.apply_translation([0, 0, 12.0])

    head_shell = union_all([diff(head_solid, [head_hollow]), center_boss])
    head_shell = diff(head_shell, [bottom_cut])

    # Rebaixo inferior para o braço plástico (horn) do servo SG90:
    # Canaleta de 22 x 5.6 x 4.5 mm + furo central de 7.4 mm para o cubo do horn
    horn_hub = cylinder(radius=3.75, height=12.0, sections=32)
    horn_hub.apply_translation([0, 0, 4.0])

    horn_arm_slot = box(extents=[22.5, 5.8, 4.5])
    horn_arm_slot.apply_translation([0, 0, 2.0])

    # Olhos amigáveis na frente (Y negativo, Z=34, X = +-15.5)
    eye_l = cylinder(radius=6.8, height=12.0, sections=36)
    eye_l.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    eye_l.apply_translation([-15.5, -39.0, 34.0])

    eye_r = cylinder(radius=6.8, height=12.0, sections=36)
    eye_r.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    eye_r.apply_translation([15.5, -39.0, 34.0])

    # Sorriso curvo amigável (arco esculpido entre os olhos em Z=23)
    smile_outer = cylinder(radius=6.5, height=12.0, sections=36)
    smile_inner = cylinder(radius=4.2, height=14.0, sections=36)
    smile_cut_top = box(extents=[20.0, 20.0, 10.0])
    smile_cut_top.apply_translation([0, 0, 5.0])
    smile_arch = diff(smile_outer, [smile_inner, smile_cut_top])
    smile_arch.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    smile_arch.apply_translation([0, -39.5, 25.5])

    # Bochechas suaves em leve baixo-relevo lateral
    cheek_l = cylinder(radius=4.5, height=8.0, sections=32)
    cheek_l.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    cheek_l.apply_translation([-25.0, -36.5, 25.0])

    cheek_r = cylinder(radius=4.5, height=8.0, sections=32)
    cheek_r.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    cheek_r.apply_translation([25.0, -36.5, 25.0])

    head_final = diff(
        head_shell,
        [horn_hub, horn_arm_slot, eye_l, eye_r, smile_arch, cheek_l, cheek_r],
    )
    return head_final


def build_arms_pair():
    """
    3. PAR DE BRAÇOS COM PINO DE ENCAIXE (Imprime deitado na mesa sem suporte)
    """
    arms = []
    for idx, x_offset in enumerate([-22.0, 22.0]):
        arm_body = capsule(height=28.0, radius=8.5, count=[24, 24])
        # Deitado no eixo Z para base plana
        peg = cylinder(radius=4.0, height=13.0, sections=32)
        peg.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
        peg.apply_translation([8.0 if idx == 0 else -8.0, 0, 22.0])

        single_arm = union_all([arm_body, peg])
        # Achata levemente a parte de trás (Y positivo) para assentar na mesa de impressão
        single_arm.apply_translation([x_offset, 0, 8.5])
        arms.append(single_arm)

    pair = union_all(arms)
    # Posiciona Z mínimo em 0
    pair.apply_translation([0, 0, -pair.bounds[0][2]])
    return pair


def build_assembled_preview(body_mesh, head_mesh):
    """
    4. MODELO COMPLETO MONTADO (Para preview 3D ou impressão em peça única)
    """
    b = body_mesh.copy()
    h = head_mesh.copy()
    h.apply_translation([0, 0, 91.5])

    arm_l = capsule(height=28.0, radius=8.5, count=[24, 24])
    arm_l.apply_translation([-44.0, 0, 38.0])

    arm_r = capsule(height=28.0, radius=8.5, count=[24, 24])
    arm_r.apply_translation([44.0, 0, 38.0])

    return union_all([b, h, arm_l, arm_r])


if __name__ == "__main__":
    print("Gerando malhas 3D STL para Bambu Lab...")
    body = build_body_base()
    body_path = os.path.join(OUT_DIR, "01_Corpo_Base_SG90.stl")
    body.export(body_path)
    print(f"[OK] {body_path} | Watertight: {body.is_watertight} | Dimensoes (mm): {np.round(body.extents, 1)}")

    head = build_head()
    head_path = os.path.join(OUT_DIR, "02_Cabeca_Bento_SG90.stl")
    head.export(head_path)
    print(f"[OK] {head_path} | Watertight: {head.is_watertight} | Dimensoes (mm): {np.round(head.extents, 1)}")

    arms = build_arms_pair()
    arms_path = os.path.join(OUT_DIR, "03_Par_Bracos_Encaixe.stl")
    arms.export(arms_path)
    print(f"[OK] {arms_path} | Watertight: {arms.is_watertight} | Dimensoes (mm): {np.round(arms.extents, 1)}")

    preview = build_assembled_preview(body, head)
    preview_path = os.path.join(OUT_DIR, "04_Bento_Montado_Preview.stl")
    preview.export(preview_path)
    print(f"[OK] {preview_path} | Watertight: {preview.is_watertight} | Dimensoes (mm): {np.round(preview.extents, 1)}")
