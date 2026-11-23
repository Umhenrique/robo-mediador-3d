# 🤖 Bento 3D — Robô Mediador Social entre Idoso e Família (Brasil)

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Umhenrique/robo-mediador-3d/blob/main/Bento_3D_Google_Colab.ipynb)

Protótipo completo de **Interação Humano-Robô (HRI)** e **Mediação Familiar Assistida por LLM Local ($\le 6\text{ GB}$ de VRAM)**, desenvolvido com base no artigo científico de referência:

> **NOGUCHI, Yohei; KAMIDE, Hiroko; TANAKA, Fumihide.** *How Should a Social Mediator Robot Convey Messages About the Self-Disclosures of Elderly People to Recipients?* **International Journal of Social Robotics**, v. 15, p. 1079–1099, 2023. DOI: `10.1007/s12369-023-01016-x`.

---

## 🎯 Funcionalidades Implementadas

1. **Integração 100% com LLM Local ($\le 6\text{ GB}$ VRAM) + Voz (STT e TTS em Português Brasileiro)**:
   - **LLM Local:** `Qwen2.5-7B-Instruct-Q4_K_M.gguf` (~4.5 GB de VRAM) rodando localmente via KoboldCpp na porta `5001`.
   - **Speech-to-Text (STT Local):** `Whisper Small (ggml-small-q5_1.bin)` integrado ao KoboldCpp (`/api/extra/transcribe`), transcrevendo a fala do idoso diretamente do microfone sem enviar áudio de saúde/família para nuvens externas.
   - **Text-to-Speech (TTS Neural PT-BR):** Voz neural em português brasileiro (`pt-BR-ThalitaMultilingualNeural`, 0 MB de VRAM) sincronizada com os movimentos labiais e corporais do robô 3D.

2. **Diálogo Empático Não-Invasivo e Detecção Automática de Encerramento**:
   - O robô **Bento** conversa com o idoso validando seus sentimentos e investigando com delicadeza (no máximo uma pergunta aberta por turno) as 4 categorias de **Experiências de Perda (*Loss Experiences*)** do artigo:
     1. **Saúde** (*Health*)
     2. **Finanças** (*Finance*)
     3. **Isolamento Social** (*Isolation*)
     4. **Razões para Viver / Propósito** (*Reasons to live*)
   - **Gatilho Automático de Despedida:** Quando o idoso demonstra que terminou de desabafar ou se despede (por voz ou texto), a IA identifica o ponto de encerramento (`shouldEndConversation: true`), faz o gesto 3D de despedida e inicia automaticamente a análise do log completo.

3. **Análise Estruturada do Log e Opções de Modulação de Mensagem (*Messaging Options*)**:
   - Diagnóstico automático das **Aversões Intrapessoais** (medo de parecer inútil ou ferir o próprio orgulho) e **Aversões Interpessoais / FNE** (medo de incomodar os filhos ou receber avaliação negativa).
   - Geração de mensagens para a família nas **3 Categorias Fatoriais (EFA)** descobertas por Tanaka et al. (2023):
     - **Factor II — *Concealing Type* (Opção 1: Especulação do Robô & Opção 2: Problema Comum de Idosos):** Oculta que o idoso reclamou, apresentando o problema como uma percepção cuidadosa do próprio robô.
     - **Factor I — *Requesting-Support Type* (Opções 4, 5, 9 e 11):** Pede apoio prático e emocional à família com atitude séria (*Option 9*) ou expressando preocupação solidária do robô (*Option 11*).
     - **Factor III — *Recording / Direct Type* (Opções 13 e 14):** Transmite o relato fidedigno do idoso.
   - **Recomendação Inteligente baseada na ANOVA (Tabela 5 do artigo):** Sugere a melhor opção cruzando **Tópico $\times$ Gênero do Idoso $\times$ Traço de Neuroticismo (Alto/Baixo) $\times$ Destinatário (Família/Amigo)**.

4. **Aprovação do Idoso e Mudança de Tom por Voz ou 1 Clique**:
   - O idoso ouve o rascunho da mensagem em voz alta e pode aprová-lo ou pedir alterações no tom (ex.: *"Deixe mais suave"*, *"Oculte que fui eu quem reclamou"*, *"Deixe mais afetuoso"*, ou qualquer instrução livre falada no microfone).

5. **Bônus: Ambiente Virtual 3D Interativo (Plataforma *Type-B* com 6 DOFs)**:
   - Modelagem 3D em Three.js fiel ao robô de mesa **Type-B** da Figura 6 e ao setup experimental com **iPad/Tablet auxiliar** da Figura 7 do artigo.
   - **6 Graus de Liberdade (6 DOFs) com telemetria em tempo real:**
     - `Neck Pitch` (Aceno afirmativo de cabeça a cada pausa na fala — *Nodding*),
     - `Neck Roll` (Inclinação lateral empática — *Head Tilt*),
     - `Neck Yaw` (Giro horizontal — *Head Swing*),
     - `Left Arm` & `Right Arm` (Servos dos braços esquerdo e direito),
     - `Body Rotation & Weight Shift` (Deslocamento de centro de massa para frente para transmitir **Seriedade — Opção 9**, conforme Noguchi et al., 2022/2023).

---

## 🚀 Como Executar

Basta dar duplo-clique em [`start-all.bat`](file:///d:/AI/text/help/robo-mediador-3d/start-all.bat) ou rodar:

```powershell
cd d:\AI\text\help\robo-mediador-3d
npm start
```

E acessar **`http://localhost:3030`** no navegador.
