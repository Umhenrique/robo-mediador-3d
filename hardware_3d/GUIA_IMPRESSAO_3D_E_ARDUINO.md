# Guia Passo a Passo: Impressao 3D (Bambu Lab) e Montagem com Arduino UNO R3 (Master Kit)

Este guia foi feito para quem **nunca usou uma impressora 3D nem montou nada em Arduino**. Tudo foi desenhado sob medida para as pecas que ja vem dentro do **Master Kit para Arduino com Placa UNO R3** e para a impressora **Bambu Lab** da sua faculdade.

---

## Parte 1: Os Arquivos 3D Prontos para Imprimir (`.stl`)

Na pasta `hardware_3d/stl/` estao os 4 arquivos gerados em CAD parametrico (100% solidos/watertight e com base plana para nao precisar de suportes dificeis):

1. `01_Corpo_Base_SG90.stl` (**82 x 78 x 90 mm**):
   - Corpo oco do Bento com base reta.
   - No topo do pescoco ja tem a cavidade retangular com a medida exata (**23.8 x 13.2 mm**) para encaixar o **Micro Servo 9g (SG90)** que vem no seu Master Kit.
   - No peito tem um furo de **5.3 mm** para encaixar um **LED de 5mm** de dentro para fora.
   - Atras na base tem um tunel para sair os fios que vao ate o Arduino UNO R3.
2. `02_Cabeca_Bento_SG90.stl` (**89 x 81 x 69 mm**):
   - Cabeca arredondada com os olhos, bochechas e sorriso esculpidos em relevo (voce pode pintar o fundo dos olhos de preto com caneta permanente Posca/Pilot depois de imprimir em PLA branco).
   - Embaixo da cabeca ja tem o encaixe exato para a pecinha branca em formato de helice (**cruzeta / horn**) que vem no saquinho do Servo SG90.
3. `03_Par_Bracos_Encaixe.stl` (**61 x 17 x 48.5 mm**):
   - Os dois bracinhos com pino lateral que encaixam direto nos furos das laterais do corpo.
4. `04_Bento_Montado_Preview.stl` (**105 x 81 x 160.5 mm**):
   - O robo inteiro em uma peca unica, caso voce queira ver como ele fica montado ou imprimir uma versao estatica de exibicao.

---

## Parte 2: Como Imprimir na Bambu Lab da Faculdade (5 Minutos de Configuracao)

As impressoras da **Bambu Lab** (A1, P1P, P1S ou X1C) sao as mais faceis do mundo de usar. Basta levar um pendrive (ou abrir o GitHub no PC do laboratorio) com os arquivos `.stl`:

1. Abra o programa **Bambu Studio** no computador da faculdade.
2. Arraste os arquivos `01_Corpo_Base_SG90.stl`, `02_Cabeca_Bento_SG90.stl` e `03_Par_Bracos_Encaixe.stl` para cima da mesa virtual no programa (cabem todos juntos na mesma bandeja de uma vez so!).
3. Escolha as seguintes configuracoes basicas na barra lateral esquerda:
   - **Filamento:** `PLA Basic` ou `PLA Matte` (cor recomendada: **Branco**).
   - **Preset de Camada:** `0.20mm Standard`.
   - **Preenchimento (Infill):** `15%` (Padrao *Grid* ou *Gyroid*).
   - **Suporte (Support):** Marque `Enable Support -> Tipo: Tree (Auto) -> On build plate only` (apenas para garantir que o teto interno e os pinos dos bracos saiam perfeitos e faceis de destacar com a mao).
4. Clique em **Slice Plate (Fatiar)** no canto superior direito e depois em **Print Plate (Imprimir)**.
   - Tempo estimado na Bambu Lab: **cerca de 2h30 a 3h15** para o robo inteiro!

---

## Parte 3: Quais Pecas Pegar na Caixa do "Master Kit Arduino UNO R3"

Voce nao precisa soldar nada! Abra a maleta do Master Kit e separe apenas estas **6 pecinhas**:

1. **1x Placa Arduino UNO R3** + **1x Cabo USB Azul** (para ligar no PC).
2. **1x Micro Servo 9g (SG90)** (caixinha azul transparente com 3 fios grudados: Marrom, Vermelho e Laranja) + a pecinha plastica branca de encaixar no eixo dele.
3. **1x Protoboard** (a placa branca cheia de furinhos, opcional se quiser ligar o LED).
4. **1x LED de 5mm** (Azul ou Verde) + **1x Resistor de 220 ohms ou 330 ohms** (para o peito do Bento brilhar).
5. **5x Fios Jumper Macho-Macho** (aqueles cabinhos coloridos com pontinha metalica nos dois lados).

---

## Parte 4: Como Ligar os Fios (Sem Solda, So Encaixar)

### 1. Ligando o Micro Servo SG90 (Pescoco do Bento) direto no Arduino UNO:
O cabo do Servo SG90 tem 3 furinhos na ponta. Espete 3 fios Jumper Macho-Macho nele e ligue na placa Arduino UNO R3 assim:

| Cor do Fio do Servo SG90 | Funcao | Onde espetar no Arduino UNO R3 |
| :--- | :--- | :--- |
| **Marrom** (ou Preto) | Terra (GND) | Pino escrito **`GND`** |
| **Vermelho** | Energia 5V | Pino escrito **`5V`** |
| **Laranja** (ou Amarelo) | Sinal Motor | Pino Digital **`9`** (ou `~9`) |

### 2. Ligando o LED do Peito (Opcional):
- Encaixe o LED de 5mm por dentro do corpo do Bento no furo do peito.
- A **perninha menor** do LED vai ligada no **`GND`** do Arduino (passando pelo resistor de 220 ohms na protoboard).
- A **perninha maior** do LED vai ligada no Pino Digital **`10`** (ou **`11`**) do Arduino.

### 3. Encaixando o Servo no Corpo Impresso em 3D:
1. Passe o fio do servo por cima do buraco do pescoco (`01_Corpo_Base_SG90.stl`) e tire o fio pelo tunel de tras da base.
2. Encaixe o corpo azul do servo dentro do buraco do pescoco (ele entra justinho!).
3. Encaixe a helice branca (`horn`) embaixo da cabeca (`02_Cabeca_Bento_SG90.stl` — pode colocar uma gotinha de cola quente ou super bonder na helice branca, nunca no eixo do motor) e depois pressione a cabeca sobre o eixo dentado do servo.

---

## Parte 5: Como Gravar o Codigo no Arduino UNO R3 (2 Minutos)

1. Baixe e abra o programa gratuito **Arduino IDE** no PC.
2. Plugue o cabo USB do Arduino UNO R3 no PC.
3. No Arduino IDE, va em **Arquivo -> Abrir** e selecione o arquivo:
   `hardware_3d/arduino/bento_uno_r3/bento_uno_r3.ino`
4. No topo do Arduino IDE, selecione a placa **Arduino Uno** e a porta **COM** (ex: `COM3` ou `COM4`).
5. Clique no botao **Upload (Seta para a direita `->`)**.
   - Assim que terminar de carregar (leva 5 segundos), o Bento vai fazer **1 aceno suave com a cabeca** confirmando que esta vivo!

---

## Parte 6: Rodando o Projeto Completo (PC + Robo Fisico)

1. Feche a janela do Arduino IDE (para liberar a porta USB COM para o nosso servidor Node.js).
2. De dois cliques no `start-all.bat` para abrir o projeto no PC (`http://localhost:3030`).
3. O servidor Node.js (`src/arduinoBridge.js`) **detecta automaticamente a porta COM do Arduino UNO R3**!
4. A partir desse momento:
   - O microfone e as caixas de som do seu PC captam sua voz e reproduzem a voz do Bento;
   - A LLM local roda na placa de video do PC;
   - E **o robo fisico impresso em 3D na sua mesa mexe a cabeca e acena em sincronia** com o robo 3D da tela!
