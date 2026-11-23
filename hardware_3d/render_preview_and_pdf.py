"""
Renderiza imagens 3D de alta definicao das malhas STL reais (para conferencia visual)
e gera o PDF diagramado completo "GUIA_IMPRESSAO_3D_E_ARDUINO_BENTO.pdf".
"""

import os
import numpy as np
import trimesh
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from matplotlib.colors import LightSource

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Image as RLImage,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether,
)

BASE_DIR = os.path.dirname(__file__)
STL_DIR = os.path.join(BASE_DIR, "stl")
IMG_ASSEMBLED = os.path.join(BASE_DIR, "preview_3d_bento_montado.png")
IMG_PARTS = os.path.join(BASE_DIR, "preview_3d_pecas_separadas.png")
PDF_OUT = os.path.join(BASE_DIR, "GUIA_IMPRESSAO_3D_E_ARDUINO_BENTO.pdf")


def render_mesh_subplot(ax, mesh, title, azim=-60, elev=22, base_color=(0.94, 0.94, 0.92), show_dimensions=True):
    # Simplifica levemente apenas para o rasterizador matplotlib ficar rapido e nitido
    verts = mesh.vertices
    faces = mesh.faces
    triangles = verts[faces]

    # Calcula normais das faces e sombreamento direcional realista
    v0 = triangles[:, 0, :]
    v1 = triangles[:, 1, :]
    v2 = triangles[:, 2, :]
    normals = np.cross(v1 - v0, v2 - v0)
    norms = np.linalg.norm(normals, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    normals = normals / norms

    # Fonte de luz frontal-superior-direita (lembrando que a frente do robo esta em -Y)
    light_dir = np.array([0.45, -0.75, 0.65])
    light_dir = light_dir / np.linalg.norm(light_dir)

    intensity = np.clip(np.dot(normals, light_dir), 0.0, 1.0)
    ambient = 0.35
    shade = ambient + (1.0 - ambient) * intensity

    face_colors = np.zeros((len(faces), 4))
    face_colors[:, 0] = np.clip(base_color[0] * shade, 0, 1)
    face_colors[:, 1] = np.clip(base_color[1] * shade, 0, 1)
    face_colors[:, 2] = np.clip(base_color[2] * shade, 0, 1)
    face_colors[:, 3] = 1.0

    poly = Poly3DCollection(triangles, facecolors=face_colors, edgecolors="none", linewidths=0.0)
    ax.add_collection3d(poly)

    bmin, bmax = mesh.bounds
    center = (bmin + bmax) / 2.0
    ext = bmax - bmin
    max_range = np.max(ext) * 0.56

    ax.set_xlim(center[0] - max_range, center[0] + max_range)
    ax.set_ylim(center[1] - max_range, center[1] + max_range)
    ax.set_zlim(center[2] - max_range, center[2] + max_range)
    ax.set_box_aspect([1, 1, 1])
    ax.view_init(elev=elev, azim=azim)

    ax.set_facecolor("#F4F4F1")
    ax.grid(True, linestyle=":", alpha=0.35)
    ax.set_xlabel("X (mm)", fontsize=8, labelpad=-4)
    ax.set_ylabel("Y (mm)", fontsize=8, labelpad=-4)
    ax.set_zlabel("Z (mm)", fontsize=8, labelpad=-4)
    ax.tick_params(axis="both", which="major", labelsize=7, pad=-2)

    dim_str = f"\n({ext[0]:.0f} x {ext[1]:.0f} x {ext[2]:.0f} mm)" if show_dimensions else ""
    ax.set_title(f"{title}{dim_str}", fontsize=10.5, fontweight="bold", color="#1A1A19", pad=8)


def generate_3d_renders():
    print("Renderizando visualizacoes 3D dos arquivos STL...")
    mesh_assembled = trimesh.load(os.path.join(STL_DIR, "04_Bento_Montado_Preview.stl"))
    mesh_body = trimesh.load(os.path.join(STL_DIR, "01_Corpo_Base_SG90.stl"))
    mesh_head = trimesh.load(os.path.join(STL_DIR, "02_Cabeca_Bento_SG90.stl"))
    mesh_arms = trimesh.load(os.path.join(STL_DIR, "03_Par_Bracos_Encaixe.stl"))

    # Imagem 1: Bento Montado em 3 Angulos (Frente, 3/4 Perspectiva, Lateral/Costas)
    fig1 = plt.figure(figsize=(13.5, 4.8), dpi=200, facecolor="#F4F4F1")
    fig1.suptitle(
        "MODELO 3D STL DO ROBÔ BENTO (04_Bento_Montado_Preview.stl — 105 x 81 x 160.5 mm)",
        fontsize=13,
        fontweight="bold",
        color="#141413",
        y=0.97,
    )

    ax1 = fig1.add_subplot(1, 3, 1, projection="3d")
    render_mesh_subplot(ax1, mesh_assembled, "1. Vista Frontal (-Y)", azim=-90, elev=12, show_dimensions=False)

    ax2 = fig1.add_subplot(1, 3, 2, projection="3d")
    render_mesh_subplot(ax2, mesh_assembled, "2. Perspectiva 3/4", azim=-58, elev=20, show_dimensions=False)

    ax3 = fig1.add_subplot(1, 3, 3, projection="3d")
    render_mesh_subplot(ax3, mesh_assembled, "3. Vista Traseira (Saída de Cabos)", azim=65, elev=22, show_dimensions=False)

    plt.tight_layout(rect=[0, 0, 1, 0.92])
    fig1.savefig(IMG_ASSEMBLED, dpi=200)
    plt.close(fig1)

    # Imagem 2: As 3 Pecas Separadas para Impressao na Bambu Lab
    fig2 = plt.figure(figsize=(13.5, 4.8), dpi=200, facecolor="#F4F4F1")
    fig2.suptitle(
        "PEÇAS SEPARADAS PARA IMPRESSÃO NA BAMBU LAB (Encaixe para Servo SG90 e LED 5mm)",
        fontsize=13,
        fontweight="bold",
        color="#141413",
        y=0.97,
    )

    bx1 = fig2.add_subplot(1, 3, 1, projection="3d")
    render_mesh_subplot(
        bx1,
        mesh_body,
        "01_Corpo_Base_SG90.stl\n(Berço SG90 no topo + Furo LED)",
        azim=-55,
        elev=28,
        base_color=(0.88, 0.92, 0.96),
    )

    bx2 = fig2.add_subplot(1, 3, 2, projection="3d")
    render_mesh_subplot(
        bx2,
        mesh_head,
        "02_Cabeca_Bento_SG90.stl\n(Rosto esculpido + Encaixe Horn)",
        azim=-62,
        elev=18,
        base_color=(0.95, 0.93, 0.88),
    )

    bx3 = fig2.add_subplot(1, 3, 3, projection="3d")
    render_mesh_subplot(
        bx3,
        mesh_arms,
        "03_Par_Bracos_Encaixe.stl\n(Pinos laterais de encaixe)",
        azim=-50,
        elev=32,
        base_color=(0.89, 0.95, 0.90),
    )

    plt.tight_layout(rect=[0, 0, 1, 0.91])
    fig2.savefig(IMG_PARTS, dpi=200)
    plt.close(fig2)
    print(f"[OK] Imagens 3D salvas:\n  - {IMG_ASSEMBLED}\n  - {IMG_PARTS}")


def build_pdf_guide():
    print("Gerando PDF diagramado do Guia de Impressao 3D e Arduino...")
    doc = SimpleDocTemplate(
        PDF_OUT,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title="Guia de Impressão 3D (Bambu Lab) e Montagem Arduino UNO R3 - Robô Bento",
        author="Matheus Henrique & Lucas Denner",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#141413"),
        spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "DocSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor("#575653"),
        spaceAfter=12,
    )
    h2_style = ParagraphStyle(
        "SectionH2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13.5,
        leading=17,
        textColor=colors.HexColor("#2D5A3C"),
        spaceBefore=12,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14.5,
        textColor=colors.HexColor("#1F1F1D"),
        spaceAfter=6,
    )
    bullet_style = ParagraphStyle(
        "BulletItem",
        parent=body_style,
        leftIndent=14,
        firstLineIndent=-8,
        spaceAfter=4,
    )
    code_style = ParagraphStyle(
        "CodeBox",
        parent=styles["Code"],
        fontName="Courier",
        fontSize=8.5,
        leading=11.5,
        textColor=colors.HexColor("#141413"),
        backColor=colors.HexColor("#F4F4F1"),
        borderPadding=8,
        leftIndent=6,
        rightIndent=6,
        spaceAfter=8,
    )

    story = []

    # CABEÇALHO DO PDF
    story.append(Paragraph("Guia Prático: Impressão 3D (Bambu Lab) e Montagem com Arduino UNO R3", title_style))
    story.append(
        Paragraph(
            "<b>Projeto:</b> Robô Mediador Social Bento 3D (Idoso e Família) &nbsp;|&nbsp; "
            "<b>Referência:</b> Noguchi, Kamide &amp; Tanaka (2023) &nbsp;|&nbsp; "
            "<b>Kit:</b> Master Kit Arduino UNO R3",
            subtitle_style,
        )
    )

    story.append(
        Paragraph(
            "Este guia passo a passo foi preparado para quem <b>nunca utilizou uma impressora 3D nem montou circuitos em Arduino</b>. "
            "Todas as peças 3D (arquivos <b>.STL</b>) já foram modeladas sob medida para o <b>Micro Servo 9g (SG90)</b> e os <b>LEDs de 5mm</b> "
            "que vêm dentro da maleta do seu <i>Master Kit para Arduino UNO R3</i>.",
            body_style,
        )
    )

    # IMAGEM 1: MODELO MONTADO
    if os.path.exists(IMG_ASSEMBLED):
        story.append(Spacer(1, 4))
        story.append(RLImage(IMG_ASSEMBLED, width=174 * mm, height=62 * mm))
        story.append(Spacer(1, 6))

    # SEÇÃO 1: ARQUIVOS STL
    story.append(Paragraph("1. Os 4 Arquivos 3D Prontos para Imprimir (Pasta hardware_3d/stl/)", h2_style))
    stl_items = [
        "• <b>01_Corpo_Base_SG90.stl (82 x 78 x 90 mm):</b> Corpo oco com base 100% plana. No topo do pescoço já possui o berço retangular exato (23,8 x 13,2 mm) para encaixar o Micro Servo SG90 sem precisar de suporte extra, além de um furo frontal de 5,3 mm no peito para 1 LED de 5mm e túnel traseiro na base para saída dos fios.",
        "• <b>02_Cabeca_Bento_SG90.stl (89 x 81 x 69 mm):</b> Cabeça arredondada com olhos circulares, bochechas e sorriso esculpidos em relevo na frente (basta pintar o fundo dos olhos de preto com caneta permanente após imprimir em PLA branco). Embaixo possui a cavidade sob medida para a hélice plástica branca (<i>cruzeta / horn</i>) do servo SG90.",
        "• <b>03_Par_Bracos_Encaixe.stl (61 x 17 x 48,5 mm):</b> Par de braços com pinos laterais que encaixam diretamente nos furos das laterais do corpo.",
        "• <b>04_Bento_Montado_Preview.stl (105 x 81 x 160,5 mm):</b> O robô completo montado em peça única para visualização ou impressão estática.",
    ]
    for item in stl_items:
        story.append(Paragraph(item, bullet_style))

    # IMAGEM 2: PEÇAS SEPARADAS
    if os.path.exists(IMG_PARTS):
        story.append(Spacer(1, 4))
        story.append(RLImage(IMG_PARTS, width=174 * mm, height=62 * mm))
        story.append(Spacer(1, 6))

    # SEÇÃO 2: COMO IMPRIMIR NA BAMBU LAB
    story.append(Paragraph("2. Como Imprimir na Impressora Bambu Lab da Faculdade (5 Minutos)", h2_style))
    bambu_steps = [
        "1. Abra o programa <b>Bambu Studio</b> no computador do laboratório.",
        "2. Arraste os 3 arquivos separados (<b>01_Corpo_Base_SG90.stl</b>, <b>02_Cabeca_Bento_SG90.stl</b> e <b>03_Par_Bracos_Encaixe.stl</b>) para cima da mesa virtual. Eles cabem todos juntos na mesma bandeja em uma única impressão.",
        "3. Na barra lateral esquerda do Bambu Studio, selecione:",
        "&nbsp;&nbsp;&nbsp;&nbsp;– <b>Filamento:</b> PLA Basic ou PLA Matte (Cor: Branco).",
        "&nbsp;&nbsp;&nbsp;&nbsp;– <b>Altura de Camada (Profile):</b> 0.20mm Standard.",
        "&nbsp;&nbsp;&nbsp;&nbsp;– <b>Preenchimento (Sparse Infill):</b> 15% (Gyroid ou Grid).",
        "&nbsp;&nbsp;&nbsp;&nbsp;– <b>Suportes (Support):</b> Marque <i>Enable Support</i> -> Tipo: <i>Tree (Auto)</i> -> Marque <i>On build plate only</i> (sai facilmente com a mão).",
        "4. Clique no botão <b>Slice Plate (Fatiar)</b> no canto superior direito e depois em <b>Print Plate (Imprimir)</b>. Em cerca de 2h30 a 3h15 as peças estarão prontas!",
    ]
    for step in bambu_steps:
        story.append(Paragraph(step, bullet_style))

    story.append(PageBreak())

    # SEÇÃO 3: PEÇAS DO MASTER KIT ARDUINO UNO R3
    story.append(Paragraph("3. O Que Pegar na Maleta do Master Kit Arduino UNO R3", h2_style))
    story.append(
        Paragraph(
            "Você <b>não precisa soldar nenhum fio</b>. Tudo é feito apenas espetando os cabinhos (jumpers) nos conectores. Separe na maleta do kit:",
            body_style,
        )
    )
    kit_items = [
        "• <b>1x Placa Arduino UNO R3</b> + <b>1x Cabo USB Azul</b> (para conectar na porta USB do computador).",
        "• <b>1x Micro Servo 9g (SG90)</b> (motorzinho azul transparente com 3 fios presos: Marrom, Vermelho e Laranja) + 1x hélice plástica branca (<i>horn</i>) que vem no saquinho dele.",
        "• <b>3x a 5x Cabos Jumper Macho-Macho</b> (fios coloridos com pontinha metálica nas duas pontas).",
        "• <i>(Opcional)</i> <b>1x LED 5mm</b> (Azul ou Verde) + <b>1x Resistor de 220 ohms</b> para iluminar o peito do robô.",
    ]
    for item in kit_items:
        story.append(Paragraph(item, bullet_style))

    # SEÇÃO 4: TABELA DE LIGAÇÃO DOS FIOS
    story.append(Paragraph("4. Mapa de Ligação dos Fios (Servo SG90 -> Arduino UNO R3)", h2_style))
    story.append(
        Paragraph(
            "Pegue 3 fios Jumper Macho-Macho, espete no conector triplo do Micro Servo SG90 e ligue diretamente nos furinhos da placa Arduino UNO R3 seguindo esta tabela:",
            body_style,
        )
    )

    wiring_data = [
        ["Fio do Micro Servo SG90", "Função Elétrica", "Onde Espetar na Placa Arduino UNO R3"],
        ["Fio Marrom (ou Preto)", "Terra (Negativo / GND)", "Pino escrito GND"],
        ["Fio Vermelho (Meio)", "Alimentação 5 Volts", "Pino escrito 5V"],
        ["Fio Laranja (ou Amarelo)", "Sinal de Controle PWM", "Pino Digital 9 (escrito ~9)"],
        ["LED Peito (Perna Maior +)", "Luz de Status (Opcional)", "Pino Digital 10 (e perna menor no GND c/ resistor)"],
    ]

    t = Table(wiring_data, colWidths=[52 * mm, 48 * mm, 72 * mm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2D5A3C")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 9.5),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 7),
                ("TOPPADDING", (0, 0), (-1, 0), 7),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F8F8F6")),
                ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#141413")),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 1), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#D4D3CE")),
                ("TOPPADDING", (0, 1), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
            ]
        )
    )
    story.append(Spacer(1, 4))
    story.append(t)
    story.append(Spacer(1, 8))

    # SEÇÃO 5: ENCAIXE MECÂNICO DAS PEÇAS IMPRESSAS
    story.append(Paragraph("5. Montagem Física das Peças Impressas em 3D", h2_style))
    mech_steps = [
        "1. Passe o cabo do Servo SG90 por cima do buraco do pescoço da peça <b>01_Corpo_Base_SG90</b> e puxe o fio para fora pelo túnel traseiro na base.",
        "2. Encaixe o corpo azul do Servo SG90 dentro do pescoço até as abas laterais dele apoiarem no topo.",
        "3. Encaixe a hélice plástica branca (<i>horn</i>) na cavidade embaixo da peça <b>02_Cabeca_Bento_SG90</b> (se quiser deixar bem firme, pingue uma gota de cola quente na hélice branca).",
        "4. Encaixe a cabeça sobre a engrenagem dentada do Servo SG90 e espete os 2 bracinhos (<b>03_Par_Bracos_Encaixe</b>) nos furos laterais do corpo.",
    ]
    for step in mech_steps:
        story.append(Paragraph(step, bullet_style))

    # SEÇÃO 6: GRAVANDO O CÓDIGO E RODANDO COM O PC
    story.append(Paragraph("6. Gravando o Código no Arduino UNO e Rodando Tudo Junto", h2_style))
    run_steps = [
        "1. Instale e abra o programa gratuito <b>Arduino IDE</b> no PC e conecte o Arduino UNO R3 no USB.",
        "2. Abra o arquivo <b>hardware_3d/arduino/bento_uno_r3/bento_uno_r3.ino</b>.",
        "3. Selecione a placa <b>Arduino Uno</b> e a porta <b>COM</b> correspondente e clique no botão <b>Upload (Seta ->)</b>. O Bento físico fará 1 aceno suave com a cabeça assim que o código subir!",
        "4. <b>Importante:</b> Feche o programa Arduino IDE após o upload (para deixar a porta USB livre para o nosso servidor Node.js).",
        "5. Execute o <b>start-all.bat</b> no PC para abrir o Bento 3D em <b>http://localhost:3030</b>. O módulo <b>src/arduinoBridge.js</b> detecta o Arduino UNO automaticamente na USB e faz o robô físico na sua mesa acenar e reagir em tempo real junto com a voz e o modelo 3D da tela!",
    ]
    for step in run_steps:
        story.append(Paragraph(step, bullet_style))

    doc.build(story)
    print(f"[OK] PDF gerado com sucesso: {PDF_OUT}")


if __name__ == "__main__":
    generate_3d_renders()
    build_pdf_guide()
