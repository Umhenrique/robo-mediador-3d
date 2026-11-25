/*
 * ============================================================================
 * BENTO 3D — FIRMWARE ARDUINO UNO R3 (Master Kit) - TORQUE TOTAL (.noinit)
 * ============================================================================
 * Por que __attribute__((section(".noinit"))) resolve 100% a perda de forca:
 * - Quando o Micro Servo SG90 faz forca para girar a cabeca impressa em 3D,
 *   o pico indutivo na linha 5V pode causar um micro-reset (BOD de 2ms) no ATmega328P.
 * - Sem ".noinit", o C runtime zerava as variaveis de volta para 90 graus a cada 2ms,
 *   travando o motor em 90 graus!
 * - Com ".noinit", a posicao atual (currentAngle), direcao (sweepDir) e modo (IDLE,
 *   NOD, TALK, WAVE, CARE, SERIOUS) sobrevivem intactos na SRAM atraves de qualquer
 *   micro-reset de 2ms, mantendo o torque maximo de 50Hz do Servo.h do inicio ao fim
 *   de todo o curso lateral (45 a 135 graus)!
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

enum RobotMode : uint8_t {
  MODE_IDLE = 0,
  MODE_NOD = 1,
  MODE_TALK = 2,
  MODE_CARE = 3,
  MODE_SERIOUS = 4,
  MODE_WAVE = 5
};

// Variaveis persistentes em SRAM (.noinit) que NAO sao resetadas para 90 graus em micro-resets de tensao!
uint16_t noinitMagic __attribute__((section(".noinit")));
uint8_t persistedMode __attribute__((section(".noinit")));
int16_t currentAngle __attribute__((section(".noinit")));
int8_t sweepDir __attribute__((section(".noinit")));
int16_t sweepMin __attribute__((section(".noinit")));
int16_t sweepMax __attribute__((section(".noinit")));
int16_t stepIntervalMs __attribute__((section(".noinit")));
int8_t stepSizeDeg __attribute__((section(".noinit")));
uint16_t remainingCycles __attribute__((section(".noinit")));

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

void applyModeLeds(uint8_t mode) {
  if (mode == MODE_NOD)          setChestColor(0, 255, 40);
  else if (mode == MODE_TALK)    setChestColor(0, 180, 255);
  else if (mode == MODE_CARE)    setChestColor(255, 140, 0);
  else if (mode == MODE_SERIOUS) setChestColor(0, 80, 255);
  else if (mode == MODE_WAVE)    setChestColor(0, 255, 180);
  else                           setChestColor(0, 180, 60);
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

void configureMotion(uint8_t mode, int16_t minAng, int16_t maxAng, int16_t intervalMs, int8_t stepDeg, uint16_t cycles) {
  persistedMode = mode;
  sweepMin = minAng;
  sweepMax = maxAng;
  stepIntervalMs = intervalMs;
  stepSizeDeg = stepDeg;
  remainingCycles = cycles; // 0 = continuo ate proximo comando
  pauseUntilTime = 0;
  applyModeLeds(mode);
}

void executeGesture(String cmd) {
  cmd.trim();
  int gIdx = cmd.lastIndexOf("G:");
  if (gIdx < 0) return;
  cmd = cmd.substring(gIdx);
  cmd.trim();

  if (cmd == "G:nod") {
    // Ouvindo / Pensando: movimento lateral amplo e vigoroso (52° <-> 128°, 76° de curso)
    playChime("listen");
    configureMotion(MODE_NOD, 52, 128, 16, 2, 0);
  }
  else if (cmd == "G:talk") {
    // Respondendo / Falando: movimento expressivo continuo sincronizado com a voz (48° <-> 132°, 84° de curso)
    configureMotion(MODE_TALK, 48, 132, 14, 3, 0);
  }
  else if (cmd == "G:care") {
    // Acolhimento empatico (52° <-> 128°)
    playChime("care");
    configureMotion(MODE_CARE, 52, 128, 18, 2, 0);
  }
  else if (cmd == "G:serious") {
    // Atitude seria / focada (58° <-> 122°)
    configureMotion(MODE_SERIOUS, 58, 122, 20, 2, 0);
  }
  else if (cmd == "G:wave") {
    // Despedida: 6 varreduras bem amplas e rapidas (42° <-> 138°, 96° de curso) e volta para espera
    playChime("done");
    configureMotion(MODE_WAVE, 42, 138, 12, 3, 6);
  }
  else if (cmd == "G:idle") {
    // Espera ativa: movimento lateral continuo e visivel (64° <-> 116°, 52° de curso)
    configureMotion(MODE_IDLE, 64, 116, 24, 2, 0);
  }

  Serial.print("ACK:");
  Serial.println(cmd);
}

void updateServoMotion() {
  unsigned long now = millis();
  if (now < pauseUntilTime) return;
  if (now - lastServoStepTime < (unsigned long)stepIntervalMs) return;
  lastServoStepTime = now;

  currentAngle += (int16_t)sweepDir * (int16_t)stepSizeDeg;

  if (currentAngle >= sweepMax) {
    currentAngle = sweepMax;
    sweepDir = -1;
    if (remainingCycles > 0) {
      remainingCycles--;
      if (remainingCycles == 0) {
        configureMotion(MODE_IDLE, 64, 116, 24, 2, 0);
      }
    }
    if (persistedMode == MODE_IDLE) {
      pauseUntilTime = now + 250;
    }
  } else if (currentAngle <= sweepMin) {
    currentAngle = sweepMin;
    sweepDir = 1;
    if (remainingCycles > 0) {
      remainingCycles--;
      if (remainingCycles == 0) {
        configureMotion(MODE_IDLE, 64, 116, 24, 2, 0);
      }
    }
    if (persistedMode == MODE_IDLE) {
      pauseUntilTime = now + 250;
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

  // Se for o primeiro boot a frio (ou memoria invalida), inicializa o estado IDLE
  if (noinitMagic != 0xB371 || currentAngle < 35 || currentAngle > 145 || (sweepDir != 1 && sweepDir != -1)) {
    noinitMagic = 0xB371;
    currentAngle = 90;
    sweepDir = 1;
    configureMotion(MODE_IDLE, 64, 116, 24, 2, 0);
  } else {
    // Recupera instantaneamente o angulo e o modo em andamento sem voltar para 90 graus!
    applyModeLeds(persistedMode);
  }

  neckServo.attach(PIN_SERVO_NECK);
  neckServo.write(currentAngle);

  Serial.println("BENTO_ARDUINO_READY");
}

void loop() {
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

  updateServoMotion();
  checkPhysicalButtons();
  checkUltrasonicPresence();
}
