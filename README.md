# Bento 3D — Robô Mediador Social entre Idoso e Família (Brasil)

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Umhenrique/robo-mediador-3d/blob/main/Bento_3D_Google_Colab.ipynb)

Protótipo de **Interação Humano-Robô (HRI)** e **Mediação Familiar Assistida por LLM Local (até 6 GB de VRAM)**, desenvolvido com base no artigo científico de referência:

> **NOGUCHI, Yohei; KAMIDE, Hiroko; TANAKA, Fumihide.** *How Should a Social Mediator Robot Convey Messages About the Self-Disclosures of Elderly People to Recipients?* **International Journal of Social Robotics**, v. 15, p. 1079–1099, 2023. DOI: `10.1007/s12369-023-01016-x`.

---

## Funcionalidades Implementadas

1. **Integração com LLM Local (até 6 GB de VRAM) e Voz (STT e TTS em Português Brasileiro)**:
   - **LLM Local:** `Qwen2.5-7B-Instruct-Q4_K_M.gguf` (~4.5 GB de VRAM) rodando localmente via KoboldCpp na porta `5001`.
   - **Speech-to-Text (STT Local):** `Whisper Small (ggml-small-q5_1.bin)` integrado ao KoboldCpp (`/api/extra/transcribe`), transcrevendo a fala do idoso diretamente do microfone com detecção automática de silêncio (VAD).
   - **Text-to-Speech (TTS Neural PT-BR):** Voz neural em português brasileiro (`pt-BR-ThalitaMultilingualNeural`, 0 MB de VRAM) sincronizada com os movimentos do robô 3D.

2. **Diálogo Empático Não-Invasivo e Detecção Automática de Encerramento**:
   - O robô **Bento** conversa com o idoso validando seus sentimentos e investigando com delicadeza (no máximo uma pergunta aberta por turno) as 4 categorias de **Experiências de Perda (*Loss Experiences*)** do artigo:
     1. **Saúde** (*Health*)
     2. **Finanças** (*Finance*)
     3. **Isolamento Social** (*Isolation*)
     4. **Razões para Viver / Propósito** (*Reasons to live*)
   - **Gatilho Automático de Despedida:** Quando o idoso demonstra que terminou de desabafar ou se despede, a IA identifica o ponto de encerramento (`shouldEndConversation: true`), executa o gesto 3D de despedida e inicia automaticamente a análise do log completo.

3. **Análise Estruturada do Log e Opções de Modulação de Mensagem (*Messaging Options*)**:
   - Diagnóstico automático das **Aversões Intrapessoais** (receio de parecer frágil ou ferir o próprio orgulho) e **Aversões Interpessoais / FNE** (receio de incomodar os filhos ou receber avaliação negativa).
   - Geração de mensagens para a família nas **3 Categorias Fatoriais (EFA)** propostas por Tanaka et al. (2023):
     - **Factor II — *Concealing Type* (Opção 1: Especulação do Robô e Opção 2: Problema Comum de Idosos):** Oculta que o idoso reclamou, apresentando o problema como uma percepção cuidadosa do próprio robô.
     - **Factor I — *Requesting-Support Type* (Opções 4, 5, 9 e 11):** Pede apoio prático e emocional à família com atitude séria (*Option 9*) ou expressando preocupação solidária do robô (*Option 11*).
     - **Factor III — *Recording / Direct Type* (Opções 13 e 14):** Transmite o relato fidedigno do idoso.
   - **Recomendação baseada na ANOVA (Tabela 5 do artigo):** Sugere a opção mais adequada cruzando **Tópico x Gênero do Idoso x Traço de Neuroticismo (Alto/Baixo) x Destinatário (Família/Amigo)**.

4. **Aprovação do Idoso e Mudança de Tom por Voz ou Seleção Direta**:
   - O idoso ouve o rascunho da mensagem em voz alta e pode aprová-lo ou pedir alterações no tom (*Sutil*, *Pedir Apoio com Cuidado*, *Indireto e Leve*, *Direto e Sincero*, ou qualquer instrução livre falada no microfone).

5. **Ambiente Virtual 3D Interativo (Plataforma *Type-B* com 6 DOFs)**:
   - Modelagem 3D em Three.js inspirada no robô de mesa **Type-B** (Figura 6 do artigo).
   - **6 Graus de Liberdade (6 DOFs):**
     - `Neck Pitch` (Aceno afirmativo de cabeça a cada pausa na fala — *Nodding*),
     - `Neck Roll` (Inclinação lateral empática — *Head Tilt*),
     - `Neck Yaw` (Giro horizontal — *Head Swing*),
     - `Left Arm` e `Right Arm` (Servos dos braços esquerdo e direito),
     - `Body Rotation & Weight Shift` (Deslocamento de centro de massa para frente para transmitir **Seriedade — Opção 9**, conforme Noguchi et al., 2022/2023).

---

## Como Executar Localmente

Execute o script `start-all.bat` ou rode no terminal:

```powershell
npm install
npm start
```

Em seguida, acesse `http://localhost:3030` no navegador.

## Como Executar no Google Colab

Clique no selo **Open in Colab** no topo deste documento para abrir o notebook `Bento_3D_Google_Colab.ipynb` configurado para rodar na GPU Tesla T4 gratuita com túnel HTTPS via Cloudflared.
