/*
 * ============================================================================
 * BENTO 3D — FIRMWARE ARDUINO UNO R3 (Master Kit) - ACIONADO POR EVENTOS (.noinit)
 * ============================================================================
 * Comportamento:
 *   - Ao ligar ou quando está em espera ("G:idle"): posiciona no centro (90°),
 *     desliga o PWM do servo (detach = 0 mA, totalmente parado e silencioso) e
 *     AGUARDA os comandos reais do projeto!
 *   - Quando ocorre uma ação no projeto ("G:nod", "G:talk", "G:care", "G:serious",
 *     "G:wave"): ativa o servo com torque total (Servo.h 50Hz + proteção .noinit),
 *     executa a sequência lateral de waypoints correspondente à ação, retorna para
 *     o centro (90°) e para novamente!
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
  MODE_IDLE    = 0,
  MODE_NOD     = 1,
  MODE_TALK    = 2,
  MODE_CARE    = 3,
  MODE_SERIOUS = 4,
  MODE_WAVE    = 5
};

// Estado persistente em SRAM (.noinit) para sobreviver a qualquer micro-oscilacao de 5V
// sem perder o waypoint atual da acao!
uint16_t noinitMagic   __attribute__((section(".noinit")));
uint8_t  activeMode    __attribute__((section(".noinit")));
int16_t  currentAngle  __attribute__((section(".noinit")));
uint8_t  waypointIndex __attribute__((section(".noinit")));
uint8_t  waypointCount __attribute__((section(".noinit")));
int16_t  waypoints[6]  __attribute__((section(".noinit")));
int16_t  stepInterval  __attribute__((section(".noinit")));
int8_t   stepDegrees   __attribute__((section(".noinit")));

unsigned long lastServoStepTime = 0;
unsigned long pauseUntilTime = 0;
unsigned long detachAtTime = 0;
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

void startActionSequence(uint8_t mode, const int16_t* pts, uint8_t count, int16_t intervalMs, int8_t stepDeg) {
  activeMode = mode;
  waypointCount = min((uint8_t)6, count);
  for (uint8_t i = 0; i < waypointCount; i++) {
    waypoints[i] = pts[i];
  }
  waypointIndex = 0;
  stepInterval = intervalMs;
  stepDegrees = stepDeg;
  pauseUntilTime = 0;
  detachAtTime = 0;
  applyModeLeds(mode);

  if (!neckServo.attached()) {
    neckServo.attach(PIN_SERVO_NECK);
    neckServo.write(currentAngle);
  }
}

void stopAndCenterIdle() {
  static const int16_t idlePts[1] = { 90 };
  if (currentAngle != 90) {
    startActionSequence(MODE_IDLE, idlePts, 1, 20, 2);
  } else {
    activeMode = MODE_IDLE;
    waypointCount = 0;
    waypointIndex = 0;
    applyModeLeds(MODE_IDLE);
    if (neckServo.attached()) {
      detachAtTime = millis() + 200;
    }
  }
}

void executeGesture(String cmd) {
  cmd.trim();
  int gIdx = cmd.lastIndexOf("G:");
  if (gIdx < 0) return;
  cmd = cmd.substring(gIdx);
  cmd.trim();

  if (cmd == "G:nod") {
    // Ouvindo / Confirmacao: 1 ciclo lateral expressivo (90 -> 118 -> 62 -> 90) e para
    playChime("listen");
    static const int16_t pts[3] = { 118, 62, 90 };
    startActionSequence(MODE_NOD, pts, 3, 18, 2);
  }
  else if (cmd == "G:talk") {
    // Falando (disparado em sincronia com o audio da voz do Bento):
    // Gesticulacao lateral expressiva (90 -> 122 -> 58 -> 116 -> 64 -> 90)
    static const int16_t pts[5] = { 122, 58, 116, 64, 90 };
    startActionSequence(MODE_TALK, pts, 5, 16, 3);
  }
  else if (cmd == "G:care") {
    // Acolhimento empatico (90 -> 120 -> 60 -> 90)
    playChime("care");
    static const int16_t pts[3] = { 120, 60, 90 };
    startActionSequence(MODE_CARE, pts, 3, 20, 2);
  }
  else if (cmd == "G:serious") {
    // Postura seria (90 -> 116 -> 64 -> 90)
    static const int16_t pts[3] = { 116, 64, 90 };
    startActionSequence(MODE_SERIOUS, pts, 3, 22, 2);
  }
  else if (cmd == "G:wave") {
    // Despedida: aceno amplo de despedida (90 -> 130 -> 50 -> 128 -> 52 -> 90) e para
    playChime("done");
    static const int16_t pts[5] = { 130, 50, 128, 52, 90 };
    startActionSequence(MODE_WAVE, pts, 5, 15, 3);
  }
  else if (cmd == "G:idle") {
    // Fim da fala / Espera: volta para 90 graus e fica parado aguardando a proxima acao
    stopAndCenterIdle();
  }

  Serial.print("ACK:");
  Serial.println(cmd);
}

void updateServoMotion() {
  unsigned long now = millis();

  // Desliga o PWM do servo 250ms apos terminar a acao e chegar em 90 graus (fica 100% parado em espera!)
  if (waypointIndex >= waypointCount) {
    if (neckServo.attached()) {
      if (detachAtTime == 0) {
        detachAtTime = now + 250;
      } else if (now >= detachAtTime) {
        neckServo.detach();
        digitalWrite(PIN_SERVO_NECK, LOW);
        detachAtTime = 0;
        activeMode = MODE_IDLE;
      }
    }
    return;
  }

  if (!neckServo.attached()) {
    neckServo.attach(PIN_SERVO_NECK);
  }

  if (now < pauseUntilTime) return;
  if (now - lastServoStepTime < (unsigned long)stepInterval) return;
  lastServoStepTime = now;

  int16_t target = waypoints[waypointIndex];
  if (currentAngle < target) {
    currentAngle = min((int16_t)(currentAngle + stepDegrees), target);
  } else if (currentAngle > target) {
    currentAngle = max((int16_t)(currentAngle - stepDegrees), target);
  }

  neckServo.write(currentAngle);

  if (currentAngle == target) {
    waypointIndex++;
    // Pausa suave de 120ms nas extremidades antes de inverter o sentido
    pauseUntilTime = now + 120;
    if (waypointIndex >= waypointCount) {
      activeMode = MODE_IDLE;
      applyModeLeds(MODE_IDLE);
      detachAtTime = now + 250;
    }
  }
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

  if (noinitMagic != 0xB372 || currentAngle < 35 || currentAngle > 145 || waypointCount > 6) {
    // Primeiro boot a frio: centraliza em 90 graus e fica PARADO aguardando acoes do projeto!
    noinitMagic = 0xB372;
    currentAngle = 90;
    activeMode = MODE_IDLE;
    waypointCount = 0;
    waypointIndex = 0;
    stepInterval = 20;
    stepDegrees = 2;
    applyModeLeds(MODE_IDLE);
    neckServo.attach(PIN_SERVO_NECK);
    neckServo.write(90);
    detachAtTime = millis() + 400;
  } else if (waypointIndex < waypointCount) {
    // Se ocorreu um micro-reset de 2ms no meio de uma acao (ex: G:talk ou G:nod),
    // continua imediatamente a acao do exato angulo atual ate terminar os waypoints!
    applyModeLeds(activeMode);
    neckServo.attach(PIN_SERVO_NECK);
    neckServo.write(currentAngle);
  } else {
    // Ja estava parado em IDLE (90 graus): permanece parado sem mexer o servo!
    activeMode = MODE_IDLE;
    applyModeLeds(MODE_IDLE);
    pinMode(PIN_SERVO_NECK, OUTPUT);
    digitalWrite(PIN_SERVO_NECK, LOW);
  }

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
