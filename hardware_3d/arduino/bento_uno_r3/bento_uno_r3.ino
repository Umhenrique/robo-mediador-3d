/*
 * ============================================================================
 * BENTO 3D — FIRMWARE ARDUINO UNO R3 (Master Kit) - VERSAO EXPANDIDA & SEGURA
 * ============================================================================
 * 100% COMPATIVEL COM O MODELO 3D JA EM IMPRESSAO (NAO MUDA NENHUMA PECA 3D!).
 * Se voce ligar APENAS os 3 fios do Servo SG90 (Pino 9), tudo ja funciona 100%!
 * Os demais componentes do Master Kit sao PLUG-AND-PLAY OPCIONAIS (pode ligar na
 * protoboard ao lado ou no furo de 5mm que ja existe no peito do Bento):
 *
 * MAPA DE PINOS NO ARDUINO UNO R3:
 * ----------------------------------------------------------------------------
 * [OBRIGATORIO - DENTRO DO PESCOCO DO BENTO 3D]
 *   - Pino 9  (PWM) : Fio Laranja do Micro Servo SG90 (Movimento da Cabeca)
 *                     (Fio Vermelho no 5V | Fio Marrom no GND)
 *
 * [OPCIONAIS DO MASTER KIT - NAO AFETAM A IMPRESSAO 3D]
 *   - Pino 2  (IN)  : Botao Fisico "Apertar para Falar" (Push Button do Kit)
 *                     -> Ligue um lado do botao no Pino 2 e o outro lado no GND!
 *                     (Usa INPUT_PULLUP interno: nao precisa nem de resistor!).
 *                     Quando o idoso aperta esse botao fisico, o navegador no
 *                     Google Colab abre o microfone sozinho!
 *
 *   - Pino 3  (IN)  : Botao Fisico 2 "Mudar Tom / Aprovar" (Opcional)
 *                     -> Ligue um lado do botao no Pino 3 e o outro no GND.
 *
 *   - Pino 8  (OUT) : Buzzer Passivo do Kit (Sons fofos estilo robo quando ouve/envia)
 *                     -> Pino positivo (+) do Buzzer no Pino 8 | Negativo no GND.
 *
 *   - Pinos 10, 11 e 6 (PWM) : LED do Peito (Encaixa no furo de 5mm que ja existe no peito!)
 *                     -> Funciona tanto com 1 LED simples (no Pino 10) quanto com o
 *                        LED RGB de 4 pernas do Master Kit:
 *                        * Pino 10 = Verde (Ouvindo / Calmo)
 *                        * Pino 11 = Azul  (Falando / Atitude Seria Opcao 9)
 *                        * Pino 6  = Vermelho (Mistura com Verde para fazer Ambar na Opcao 11!)
 *
 *   - Pinos 4 (TRIG) e 5 (ECHO) : Sensor Ultrassonico HC-SR04 (Presenca do Idoso)
 *                     -> Se voce espetar o sensor HC-SR04 na protoboard, quando o
 *                        idoso sentar a menos de 50cm, o Arduino avisa o navegador
 *                        ("EVT:PRESENCE") e o Bento cumprimenta o idoso!
 *                        (Se o sensor nao estiver conectado, o codigo detecta timeout
 *                        em 3 milissegundos e ignora automaticamente sem travar nada!).
 * ============================================================================
 */

#include <Servo.h>

Servo neckServo;

// Pinos Principais
const int PIN_SERVO_NECK = 9;
const int PIN_LED_GREEN  = 10; // LED simples ou perna Verde do LED RGB
const int PIN_LED_BLUE   = 11; // Segundo LED ou perna Azul do LED RGB
const int PIN_LED_RED    = 6;  // Perna Vermelha do LED RGB (opcional)

// Pinos Extras Opcionais na Protoboard (Master Kit)
const int PIN_BTN_TALK   = 2;  // Botao fisico para falar (entre Pino 2 e GND)
const int PIN_BTN_TONE   = 3;  // Botao fisico para mudar tom (entre Pino 3 e GND)
const int PIN_BUZZER     = 8;  // Buzzer do kit (entre Pino 8 e GND)
const int PIN_ULTRA_TRIG = 4;  // Sensor HC-SR04 Trig (opcional)
const int PIN_ULTRA_ECHO = 5;  // Sensor HC-SR04 Echo (opcional)

const int ANGLE_NEUTRAL = 90;
int currentAngle = ANGLE_NEUTRAL;

String inputBuffer = "";

// Controle de debounce dos botoes fisicos (evita falsos cliques)
unsigned long lastBtnTalkTime = 0;
unsigned long lastBtnToneTime = 0;
int lastBtnTalkState = HIGH;
int lastBtnToneState = HIGH;

// Controle do sensor ultrassonico opcional
unsigned long lastUltraCheck = 0;
bool elderPresent = false;
unsigned long lastPresenceTrigger = 0;

// Define a cor do LED (funciona tanto para LED simples no pino 10/11 quanto para LED RGB)
void setChestColor(int r, int g, int b) {
  analogWrite(PIN_LED_RED, r);
  analogWrite(PIN_LED_GREEN, g);
  analogWrite(PIN_LED_BLUE, b);
}

// Toca bipes melodicos curtos e suaves no Buzzer (se estiver espetado no pino 8)
void playChime(String type) {
  if (type == "listen") {
    tone(PIN_BUZZER, 587, 70); // Re5
    delay(75);
    tone(PIN_BUZZER, 880, 90); // La5 (subindo = pronto para ouvir)
  } else if (type == "done") {
    tone(PIN_BUZZER, 880, 70);
    delay(75);
    tone(PIN_BUZZER, 1046, 110); // Do6
  } else if (type == "care") {
    tone(PIN_BUZZER, 659, 80);
    delay(85);
    tone(PIN_BUZZER, 784, 100);
  }
}

// Move o servo SG90 suavemente sem trancos (ativa o PWM apenas durante o movimento para evitar pico de corrente/queda da USB no boot)
void moveSmooth(int targetAngle, int stepDelayMs) {
  targetAngle = constrain(targetAngle, 55, 125);
  if (!neckServo.attached()) {
    neckServo.attach(PIN_SERVO_NECK);
    neckServo.write(currentAngle);
    delay(20);
  }
  while (currentAngle != targetAngle) {
    if (currentAngle < targetAngle) {
      currentAngle++;
    } else {
      currentAngle--;
    }
    neckServo.write(currentAngle);
    delay(stepDelayMs);
  }
}

void executeGesture(String cmd) {
  cmd.trim();

  if (cmd == "G:nod") {
    // Ouvindo o idoso / Aceno afirmativo suave (Verde)
    setChestColor(0, 255, 40);
    playChime("listen");
    moveSmooth(108, 12);
    moveSmooth(82, 12);
    moveSmooth(104, 12);
    moveSmooth(ANGLE_NEUTRAL, 14);
  }
  else if (cmd == "G:serious") {
    // Opcao 9 (Seriously / Weight Shift): Azul profundo e inclinacao seria
    setChestColor(0, 80, 255);
    moveSmooth(112, 18);
  }
  else if (cmd == "G:care") {
    // Opcao 11 (Anxious Care / Empatia): Ambar acolhedor
    setChestColor(255, 140, 0);
    playChime("care");
    moveSmooth(102, 15);
    delay(160);
    moveSmooth(84, 15);
    moveSmooth(98, 15);
  }
  else if (cmd == "G:talk") {
    // Bento falando (Ciano / Azul claro)
    setChestColor(0, 180, 255);
    moveSmooth(98, 14);
    moveSmooth(85, 14);
    moveSmooth(95, 14);
    moveSmooth(ANGLE_NEUTRAL, 14);
  }
  else if (cmd == "G:wave") {
    // Despedida / Recado enviado
    playChime("done");
    for (int i = 0; i < 3; i++) {
      setChestColor(0, 255, 180);
      moveSmooth(110, 10);
      setChestColor(255, 180, 0);
      moveSmooth(75, 10);
    }
    moveSmooth(ANGLE_NEUTRAL, 15);
    setChestColor(0, 200, 80);
  }
  else if (cmd == "G:idle") {
    // Repouso calmo
    setChestColor(0, 180, 60);
    moveSmooth(ANGLE_NEUTRAL, 16);
  }

  if (neckServo.attached()) {
    delay(60);
    neckServo.detach();
  }
}

// Verifica os botoes fisicos opcionais (Pinos 2 e 3 com INPUT_PULLUP)
void checkPhysicalButtons() {
  unsigned long now = millis();

  // Botao 1 (Pino 2 -> GND): Apertar para Falar com o Bento
  int talkReading = digitalRead(PIN_BTN_TALK);
  if (talkReading == LOW && lastBtnTalkState == HIGH && (now - lastBtnTalkTime > 450)) {
    lastBtnTalkTime = now;
    playChime("listen");
    setChestColor(255, 160, 0);
    Serial.println("BTN:TALK");
  }
  lastBtnTalkState = talkReading;

  // Botao 2 (Pino 3 -> GND): Mudar Tom da Mensagem
  int toneReading = digitalRead(PIN_BTN_TONE);
  if (toneReading == LOW && lastBtnToneState == HIGH && (now - lastBtnToneTime > 450)) {
    lastBtnToneTime = now;
    playChime("care");
    Serial.println("BTN:TONE");
  }
  lastBtnToneState = toneReading;
}

// Verifica o sensor ultrassonico HC-SR04 opcional (Pinos 4 e 5) a cada 800ms
void checkUltrasonicPresence() {
  unsigned long now = millis();
  if (now - lastUltraCheck < 800) return;
  lastUltraCheck = now;

  digitalWrite(PIN_ULTRA_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_ULTRA_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_ULTRA_TRIG, LOW);

  // Timeout curto de 4000 us (~68 cm max) para nunca atrasar o loop se o sensor nao estiver conectado!
  long duration = pulseIn(PIN_ULTRA_ECHO, HIGH, 4000);
  if (duration > 100) {
    int distanceCm = duration * 0.034 / 2;
    if (distanceCm >= 8 && distanceCm <= 48) {
      if (!elderPresent && (now - lastPresenceTrigger > 25000)) {
        elderPresent = true;
        lastPresenceTrigger = now;
        Serial.println("EVT:PRESENCE");
      }
    } else if (distanceCm > 55) {
      elderPresent = false;
    }
  }
}

void setup() {
  Serial.begin(9600);

  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_BLUE, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  // INPUT_PULLUP mantem o pino em HIGH mesmo sem nada conectado (nunca gera clique fantasma!)
  pinMode(PIN_BTN_TALK, INPUT_PULLUP);
  pinMode(PIN_BTN_TONE, INPUT_PULLUP);

  pinMode(PIN_ULTRA_TRIG, OUTPUT);
  pinMode(PIN_ULTRA_ECHO, INPUT);

  // Evita acionar o motor SG90 durante a enumeracao USB do boot (previne queda de tensao / desconexao da porta USB)
  setChestColor(0, 220, 80);

  Serial.println("BENTO_ARDUINO_READY");
}

void loop() {
  // 1. Le comandos enviados pelo Navegador (Web Serial do Colab) ou pelo Servidor Local
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n') {
      executeGesture(inputBuffer);
      inputBuffer = "";
    } else if (c != '\r') {
      inputBuffer += c;
    }
  }

  // 2. Le botoes fisicos e sensor de presenca opcionais na protoboard
  checkPhysicalButtons();
  checkUltrasonicPresence();
}
