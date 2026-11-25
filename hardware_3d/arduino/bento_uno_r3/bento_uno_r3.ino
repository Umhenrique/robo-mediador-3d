/*
 * ============================================================================
 * BENTO 3D — FIRMWARE ARDUINO UNO R3 (Master Kit) - SINCRONIZADO & CONTINUO
 * ============================================================================
 * Motor Micro Servo 9g (SG90) montado no pescoco (giro lateral esquerda/direita):
 *   - Pino 9  (PWM) : Fio Laranja do Micro Servo SG90
 *   - 5V            : Fio Vermelho do Micro Servo SG90
 *   - GND           : Fio Marrom do Micro Servo SG90
 *
 * Arquitetura de Maquina de Estados Nao-Bloqueante (Servo.h 50Hz continuo):
 *   - "G:idle\n"    -> Movimento continuo e suave de ESPERA (68° <-> 112°, 44° de amplitude)
 *   - "G:nod\n"     -> Movimento atento OUVINDO / PROCESSANDO (56° <-> 124°, 68° de amplitude)
 *   - "G:talk\n"    -> Movimento expressivo continuo SINCRONIZADO COM A FALA (50° <-> 130°, 80° de amplitude)
 *   - "G:care\n"    -> Movimento acolhedor empatico (54° <-> 126°, 72° de amplitude)
 *   - "G:serious\n" -> Movimento focado e serio (62° <-> 118°, 56° de amplitude)
 *   - "G:wave\n"    -> Giro amplo e rapido de DESPEDIDA (45° <-> 135°, 90° de amplitude)
 * ============================================================================
 */

#include <Servo.h>

Servo neckServo;

// Pinos Principais
const int PIN_SERVO_NECK = 9;
const int PIN_LED_GREEN  = 10;
const int PIN_LED_BLUE   = 11;
const int PIN_LED_RED    = 6;

// Pinos Extras Opcionais na Protoboard (Master Kit)
const int PIN_BTN_TALK   = 2;
const int PIN_BTN_TONE   = 3;
const int PIN_BUZZER     = 8;
const int PIN_ULTRA_TRIG = 4;
const int PIN_ULTRA_ECHO = 5;

enum RobotMode {
  MODE_IDLE,
  MODE_NOD,
  MODE_TALK,
  MODE_CARE,
  MODE_SERIOUS,
  MODE_WAVE
};

RobotMode currentMode = MODE_IDLE;
unsigned long modeStartTime = 0;
unsigned long modeDurationMs = 0; // 0 = continuo ate proximo comando

// Estado do servo (100% nao-bloqueante via millis)
int currentAngle = 90;
int sweepDir = 1;
int sweepMin = 68;
int sweepMax = 112;
int stepIntervalMs = 26;
int stepSizeDeg = 1;
unsigned long lastServoStepTime = 0;
unsigned long pauseUntilTime = 0;

String inputBuffer = "";

// Controle de debounce dos botoes fisicos
unsigned long lastBtnTalkTime = 0;
unsigned long lastBtnToneTime = 0;
int lastBtnTalkState = HIGH;
int lastBtnToneState = HIGH;

// Controle do sensor ultrassonico opcional
unsigned long lastUltraCheck = 0;
bool elderPresent = false;
unsigned long lastPresenceTrigger = 0;

void setChestColor(int r, int g, int b) {
  analogWrite(PIN_LED_RED, r);
  digitalWrite(PIN_LED_GREEN, g > 100 ? HIGH : LOW);
  analogWrite(PIN_LED_BLUE, b);
}

void playChime(String type) {
  if (type == "listen") {
    tone(PIN_BUZZER, 587, 60);
  } else if (type == "done") {
    tone(PIN_BUZZER, 880, 70);
  } else if (type == "care") {
    tone(PIN_BUZZER, 659, 65);
  }
}

void configureMotion(RobotMode mode, int minAng, int maxAng, int intervalMs, int stepDeg, unsigned long durationMs) {
  currentMode = mode;
  sweepMin = minAng;
  sweepMax = maxAng;
  stepIntervalMs = intervalMs;
  stepSizeDeg = stepDeg;
  modeStartTime = millis();
  modeDurationMs = durationMs;
  pauseUntilTime = 0;
}

void executeGesture(String cmd) {
  cmd.trim();
  int gIdx = cmd.lastIndexOf("G:");
  if (gIdx < 0) return;
  cmd = cmd.substring(gIdx);
  cmd.trim();

  if (cmd == "G:nod") {
    // Ouvindo / Pensando: movimento lateral amplo e atento (56° <-> 124°)
    setChestColor(0, 255, 40);
    playChime("listen");
    configureMotion(MODE_NOD, 56, 124, 15, 2, 0);
  }
  else if (cmd == "G:talk") {
    // Respondendo / Falando: movimento expressivo continuo sincronizado com a voz (50° <-> 130°)
    setChestColor(0, 180, 255);
    configureMotion(MODE_TALK, 50, 130, 14, 2, 0);
  }
  else if (cmd == "G:care") {
    // Acolhimento empatico (54° <-> 126°)
    setChestColor(255, 140, 0);
    playChime("care");
    configureMotion(MODE_CARE, 54, 126, 18, 2, 0);
  }
  else if (cmd == "G:serious") {
    // Atitude seria / focada (62° <-> 118°)
    setChestColor(0, 80, 255);
    configureMotion(MODE_SERIOUS, 62, 118, 20, 1, 0);
  }
  else if (cmd == "G:wave") {
    // Despedida: giro bem amplo e animado (45° <-> 135°) por 4.5s e depois volta para espera
    setChestColor(0, 255, 180);
    playChime("done");
    configureMotion(MODE_WAVE, 45, 135, 12, 3, 4500);
  }
  else if (cmd == "G:idle") {
    // Espera ativa: movimento suave e visivel de um lado para o outro (68° <-> 112°)
    setChestColor(0, 180, 60);
    configureMotion(MODE_IDLE, 68, 112, 26, 1, 0);
  }

  Serial.print("ACK:");
  Serial.println(cmd);
}

void updateServoMotion() {
  unsigned long now = millis();

  // Se um modo temporario (como wave) terminou, volta automaticamente para espera ativa (IDLE)
  if (modeDurationMs > 0 && (now - modeStartTime >= modeDurationMs)) {
    setChestColor(0, 180, 60);
    configureMotion(MODE_IDLE, 68, 112, 26, 1, 0);
  }

  if (now < pauseUntilTime) return;
  if (now - lastServoStepTime < (unsigned long)stepIntervalMs) return;
  lastServoStepTime = now;

  currentAngle += sweepDir * stepSizeDeg;

  if (currentAngle >= sweepMax) {
    currentAngle = sweepMax;
    sweepDir = -1;
    // Pequena pausa natural nas extremidades no modo de espera ou cuidado
    if (currentMode == MODE_IDLE) {
      pauseUntilTime = now + 350;
    } else if (currentMode == MODE_CARE || currentMode == MODE_SERIOUS) {
      pauseUntilTime = now + 180;
    }
  } else if (currentAngle <= sweepMin) {
    currentAngle = sweepMin;
    sweepDir = 1;
    if (currentMode == MODE_IDLE) {
      pauseUntilTime = now + 350;
    } else if (currentMode == MODE_CARE || currentMode == MODE_SERIOUS) {
      pauseUntilTime = now + 180;
    }
  }

  neckServo.write(currentAngle);
}

void checkPhysicalButtons() {
  unsigned long now = millis();

  int talkReading = digitalRead(PIN_BTN_TALK);
  if (talkReading == LOW && lastBtnTalkState == HIGH && (now - lastBtnTalkTime > 450)) {
    lastBtnTalkTime = now;
    playChime("listen");
    setChestColor(255, 160, 0);
    Serial.println("BTN:TALK");
  }
  lastBtnTalkState = talkReading;

  int toneReading = digitalRead(PIN_BTN_TONE);
  if (toneReading == LOW && lastBtnToneState == HIGH && (now - lastBtnToneTime > 450)) {
    lastBtnToneTime = now;
    playChime("care");
    Serial.println("BTN:TONE");
  }
  lastBtnToneState = toneReading;
}

void checkUltrasonicPresence() {
  unsigned long now = millis();
  if (now - lastUltraCheck < 800) return;
  lastUltraCheck = now;

  digitalWrite(PIN_ULTRA_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_ULTRA_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_ULTRA_TRIG, LOW);

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

  pinMode(PIN_BTN_TALK, INPUT_PULLUP);
  pinMode(PIN_BTN_TONE, INPUT_PULLUP);

  pinMode(PIN_ULTRA_TRIG, OUTPUT);
  pinMode(PIN_ULTRA_ECHO, INPUT);

  neckServo.attach(PIN_SERVO_NECK);
  neckServo.write(currentAngle);

  setChestColor(0, 200, 80);
  configureMotion(MODE_IDLE, 68, 112, 26, 1, 0);

  Serial.println("BENTO_ARDUINO_READY");
}

void loop() {
  // 1. Le comandos seriais instantaneamente (0ms de bloqueio!)
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (inputBuffer.length() > 0) {
        executeGesture(inputBuffer);
        inputBuffer = "";
      }
    } else if (c >= 32 && c <= 126) {
      if (inputBuffer.length() >= 32) {
        inputBuffer = "";
      }
      inputBuffer += c;
    }
  }

  // 2. Atualiza movimento continuo do servo de acordo com o estado atual (Espera, Ouvindo, Falando, Despedida)
  updateServoMotion();

  // 3. Le botoes fisicos e sensor de presenca opcionais
  checkPhysicalButtons();
  checkUltrasonicPresence();
}
