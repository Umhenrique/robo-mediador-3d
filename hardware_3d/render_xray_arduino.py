"""
Gera um diagrama 3D em Raio-X (Corte/Transparencia) mostrando exatamente:
1. Onde o Micro Servo SG90 e o LED 5mm se encaixam DENTRO do Bento;
2. Por onde os fios descem e saem pelo tunel traseiro da base;
3. Como a placa Arduino UNO R3 fica conectada logo atras do robo (como no setup experimental do artigo)
   E tambem gera uma Base Pedestal Expansora opcional (05_Base_Gaveta_Arduino_UNO.stl) caso queira embutir
   o Arduino UNO R3 inteiramente embaixo do robo!
"""

import os
import numpy as np
import trimesh
from trimesh.creation import cylinder, box
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

BASE_DIR = os.path.dirname(__file__)
STL_DIR = os.path.join(BASE_DIR, "stl")
OUT_IMG = os.path.join(BASE_DIR, "diagrama_onde_encaixa_arduino_e_servo.png")


def build_arduino_dock_base():
    """
    Cria a peca opcional 05_Base_Pedestal_Arduino_UNO.stl:
    Uma base redonda que fica embaixo do Bento e possui a gaveta exata para a placa
    Arduino UNO R3 (69 x 54 mm) entrar por tras e ficar 100% escondida dentro do pedestal do robo!
    """
    # Pedestal cilindrico de 102mm de diametro e 30mm de altura
    outer_dock = cylinder(radius=51.0, height=30.0, sections=64)
    outer_dock.apply_translation([0, 0, 15.0])

    # Rebaixo superior de 2mm (raio 39.6mm) onde a base do Bento (01_Corpo_Base_SG90) assenta perfeitamente
    top_seat = cylinder(radius=39.6, height=4.0, sections=64)
    top_seat.apply_translation([0, 0, 29.0])

    # Gaveta interna para a placa Arduino UNO R3 (placa mede 68.6 x 53.4 mm -> gaveta de 56 x 74 x 23 mm)
    # Entra por tras (+Y) com abertura para o cabo USB azul e os jumpers
    uno_slot = box(extents=[56.5, 82.0, 23.0])
    uno_slot.apply_translation([0, 14.0, 14.5])

    # Furo central no teto do pedestal para os fios do Servo SG90 e LED descerem direto do corpo do Bento para o Arduino UNO
    wire_pass = cylinder(radius=16.0, height=20.0, sections=36)
    wire_pass.apply_translation([0, 0, 26.0])

    dock_final = trimesh.boolean.difference([outer_dock, top_seat, uno_slot, wire_pass], engine="manifold")
    dock_path = os.path.join(STL_DIR, "05_Base_Gaveta_Arduino_UNO.stl")
    dock_final.export(dock_path)
    print(f"[OK] Base Gaveta para embutir o Arduino UNO gerada: {dock_path}")
    return dock_final


def add_transparent_mesh(ax, mesh, color_rgb=(0.85, 0.88, 0.92), alpha=0.22):
    verts = mesh.vertices
    faces = mesh.faces
    triangles = verts[faces]

    v0, v1, v2 = triangles[:, 0, :], triangles[:, 1, :], triangles[:, 2, :]
    normals = np.cross(v1 - v0, v2 - v0)
    norms = np.linalg.norm(normals, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    normals = normals / norms

    light_dir = np.array([0.4, -0.7, 0.6])
    light_dir /= np.linalg.norm(light_dir)
    shade = 0.45 + 0.55 * np.clip(np.dot(normals, light_dir), 0, 1)

    fc = np.zeros((len(faces), 4))
    fc[:, 0] = np.clip(color_rgb[0] * shade, 0, 1)
    fc[:, 1] = np.clip(color_rgb[1] * shade, 0, 1)
    fc[:, 2] = np.clip(color_rgb[2] * shade, 0, 1)
    fc[:, 3] = alpha

    poly = Poly3DCollection(triangles, facecolors=fc, edgecolors="none")
    ax.add_collection3d(poly)


def render_xray_diagram(dock_mesh):
    mesh_body = trimesh.load(os.path.join(STL_DIR, "01_Corpo_Base_SG90.stl"))
    mesh_head = trimesh.load(os.path.join(STL_DIR, "02_Cabeca_Bento_SG90.stl"))
    mesh_head.apply_translation([0, 0, 91.5])

    # Cria blocos 3D coloridos representando os componentes reais do Master Kit:
    # 1. Micro Servo SG90 (Azul Royal) encaixado no pescoco (Z=66 a Z=90)
    servo_box = box(extents=[23.0, 12.4, 24.0])
    servo_box.apply_translation([5.5, 0, 78.0])
    servo_ears = box(extents=[32.5, 12.4, 2.5])
    servo_ears.apply_translation([5.5, 0, 88.5])
    servo_shaft = cylinder(radius=2.5, height=8.0, sections=20)
    servo_shaft.apply_translation([0, 0, 93.0])
    servo_mesh = trimesh.boolean.union([servo_box, servo_ears, servo_shaft], engine="manifold")

    # 2. LED 5mm (Vermelho/Laranja brilhante) no furo do peito (Y=-32, Z=52)
    led_mesh = cylinder(radius=2.5, height=9.0, sections=20)
    led_mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    led_mesh.apply_translation([0, -34.0, 52.0])

    # 3. Placa Arduino UNO R3 (Azul Turquesa Oficial: 53.4 x 68.6 x 12 mm)
    uno_board = box(extents=[53.4, 68.6, 3.0])
    uno_usb = box(extents=[12.0, 16.0, 11.0])
    uno_usb.apply_translation([-15.0, 32.0, 6.0])
    uno_headers = box(extents=[48.0, 50.0, 9.0])
    uno_headers.apply_translation([0, -4.0, 5.5])
    uno_mesh = trimesh.boolean.union([uno_board, uno_usb, uno_headers], engine="manifold")

    fig = plt.figure(figsize=(14.5, 6.5), dpi=200, facecolor="#F5F5F2")
    fig.suptitle(
        "RAIO-X 3D: ONDE CADA PEÇA DO KIT ARDUINO UNO R3 SE ENCAIXA NO ROBÔ BENTO",
        fontsize=13.5,
        fontweight="bold",
        color="#141413",
        y=0.97,
    )

    # =========================================================================
    # PAINEL ESQUERDO: MODO 1 (PADRÃO) — Servo e LED dentro do Bento + Arduino atrás
    # =========================================================================
    ax1 = fig.add_subplot(1, 2, 1, projection="3d")
    add_transparent_mesh(ax1, mesh_body, color_rgb=(0.82, 0.86, 0.90), alpha=0.22)
    add_transparent_mesh(ax1, mesh_head, color_rgb=(0.90, 0.88, 0.84), alpha=0.18)

    # Componentes sólidos destacados lá dentro
    add_transparent_mesh(ax1, servo_mesh, color_rgb=(0.10, 0.45, 0.95), alpha=0.95)
    add_transparent_mesh(ax1, led_mesh, color_rgb=(0.95, 0.25, 0.15), alpha=0.95)

    # Placa Arduino UNO R3 posicionada logo atrás da base (+Y) conectada pelos fios
    uno_ext = uno_mesh.copy()
    uno_ext.apply_translation([0, 88.0, 2.0])
    add_transparent_mesh(ax1, uno_ext, color_rgb=(0.0, 0.55, 0.60), alpha=0.92)

    # Linha grossa representando o chicote de 3 fios do Servo descendo pelo corpo oco e saindo pelo túnel traseiro
    wire_y = [0, 0, 28, 60]
    wire_z = [68, 10, 7, 10]
    wire_x = [0, 0, 0, 0]
    ax1.plot(wire_x, wire_y, wire_z, color="#D97706", linewidth=3.2, label="Fios do Servo SG90 (Pinos 5V, GND, D9)")

    # Rótulos explicativos com setas/pontos
    ax1.text(0, -5, 105, "1. Eixo do Servo SG90\nencaixa embaixo da Cabeça", color="#0B3B8C", fontsize=8.5, fontweight="bold")
    ax1.text(14, 0, 75, "2. Micro Servo SG90 (Azul)\ndentro do pescoço", color="#0B3B8C", fontsize=8.5, fontweight="bold")
    ax1.text(-35, -45, 48, "3. LED 5mm\nno furo do peito", color="#B91C1C", fontsize=8.5, fontweight="bold")
    ax1.text(10, 25, 4, "4. Túnel Traseiro\nsaída dos fios", color="#92400E", fontsize=8.5, fontweight="bold")
    ax1.text(-28, 72, 26, "5. Placa Arduino UNO R3\n(Atrás do robô ligada no USB do PC)", color="#005F66", fontsize=8.5, fontweight="bold")

    ax1.set_xlim(-75, 75)
    ax1.set_ylim(-55, 130)
    ax1.set_zlim(0, 165)
    ax1.set_box_aspect([1, 1.15, 1.05])
    ax1.view_init(elev=18, azim=-38)
    ax1.set_facecolor("#F5F5F2")
    ax1.set_title(
        "OPÇÃO A (Mais Fácil): Servo e LED dentro do Bento\n+ Placa Arduino UNO na mesa atrás dele",
        fontsize=10.5,
        fontweight="bold",
        color="#141413",
    )
    ax1.set_xlabel("X (mm)", fontsize=8)
    ax1.set_ylabel("Y (mm) [Frente -> Costas]", fontsize=8)
    ax1.set_zlabel("Z (mm)", fontsize=8)

    # =========================================================================
    # PAINEL DIREITO: MODO 2 (COM A NOVA BASE GAVETA 05_Base_Gaveta_Arduino_UNO.stl)
    # =========================================================================
    ax2 = fig.add_subplot(1, 2, 2, projection="3d")

    # Levanta o corpo e a cabeça 28mm para assentar sobre a Base Gaveta
    b_up = mesh_body.copy()
    b_up.apply_translation([0, 0, 28.0])
    h_up = mesh_head.copy()
    h_up.apply_translation([0, 0, 28.0])
    s_up = servo_mesh.copy()
    s_up.apply_translation([0, 0, 28.0])
    l_up = led_mesh.copy()
    l_up.apply_translation([0, 0, 28.0])

    # Placa Arduino UNO R3 embutida DENTRO da Base Gaveta (Z=4mm)
    uno_inside = uno_mesh.copy()
    uno_inside.apply_translation([0, 8.0, 5.0])

    add_transparent_mesh(ax2, dock_mesh, color_rgb=(0.55, 0.72, 0.60), alpha=0.30)
    add_transparent_mesh(ax2, b_up, color_rgb=(0.82, 0.86, 0.90), alpha=0.22)
    add_transparent_mesh(ax2, h_up, color_rgb=(0.90, 0.88, 0.84), alpha=0.18)

    add_transparent_mesh(ax2, s_up, color_rgb=(0.10, 0.45, 0.95), alpha=0.95)
    add_transparent_mesh(ax2, l_up, color_rgb=(0.95, 0.25, 0.15), alpha=0.95)
    add_transparent_mesh(ax2, uno_inside, color_rgb=(0.0, 0.55, 0.60), alpha=0.95)

    # Fio descendo reto por dentro do corpo direto para a gaveta inferior
    ax2.plot([0, 0], [0, 0], [96, 15], color="#D97706", linewidth=3.2)

    ax2.text(14, 0, 103, "Micro Servo SG90\nno topo do pescoço", color="#0B3B8C", fontsize=8.5, fontweight="bold")
    ax2.text(-35, -45, 76, "LED 5mm\nno peito", color="#B91C1C", fontsize=8.5, fontweight="bold")
    ax2.text(12, -10, 52, "Fios descem reto\npelo interior oco", color="#92400E", fontsize=8.5, fontweight="bold")
    ax2.text(-42, 18, 12, "Arduino UNO R3 EMBUTIDO\ndentro da Base Gaveta\n(05_Base_Gaveta_Arduino_UNO.stl)", color="#005F66", fontsize=8.5, fontweight="bold")

    ax2.set_xlim(-75, 75)
    ax2.set_ylim(-65, 85)
    ax2.set_zlim(0, 190)
    ax2.set_box_aspect([1, 1.0, 1.15])
    ax2.view_init(elev=18, azim=-42)
    ax2.set_facecolor("#F5F5F2")
    ax2.set_title(
        "OPÇÃO B (Tudo Embutido): Base Gaveta Inferior\nesconde a Placa Arduino UNO R3 embaixo do Bento",
        fontsize=10.5,
        fontweight="bold",
        color="#141413",
    )
    ax2.set_xlabel("X (mm)", fontsize=8)
    ax2.set_ylabel("Y (mm)", fontsize=8)
    ax2.set_zlabel("Z (mm)", fontsize=8)

    plt.tight_layout(rect=[0, 0, 1, 0.93])
    fig.savefig(OUT_IMG, dpi=200)
    plt.close(fig)
    print(f"[OK] Diagrama Raio-X salvo em: {OUT_IMG}")


if __name__ == "__main__":
    dock = build_arduino_dock_base()
    render_xray_diagram(dock)
