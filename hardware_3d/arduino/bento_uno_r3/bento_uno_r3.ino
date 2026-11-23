/*
 * ============================================================================
 * BENTO 3D — FIRMWARE ARDUINO UNO R3 (Master Kit)
 * ============================================================================
 * Componentes usados do Master Kit para Arduino UNO R3:
 *   1. Placa Arduino UNO R3 + Cabo USB (conectado ao PC rodando o Bento 3D)
 *   2. Micro Servo SG90 (9g) -> Pino Digital 9 (PWM) [Movimento da Cabeca: Sim/Aceno]
 *   3. LED RGB (ou 2 LEDs comuns) -> Pinos Digitais 10 (Verde/Calmo) e 11 (Azul/Falando)
 *      com resistores de 220 ohms no GND.
 *
 * Protocolo Serial USB (9600 bps) enviado automaticamente pelo servidor Node.js:
 *   "G:nod\n"     -> Faz aceno afirmativo suave com a cabeca (Idoso falando / Pausa)
 *   "G:serious\n" -> Inclina a cabeca para frente em atitude seria (Opcao 9 - Tanaka)
 *   "G:care\n"    -> Movimento acolhedor de preocupacao solidaria (Opcao 11 - Tanaka)
 *   "G:wave\n"    -> Aceno de despedida ao encerrar a conversa
 *   "G:talk\n"    -> Movimento sutil sincronizado enquanto o Bento fala no PC
 *   "G:idle\n"    -> Volta suavemente para a posicao neutra (90 graus) e fica parado
 * ============================================================================
 */

#include <Servo.h>

Servo neckServo;

const int PIN_SERVO_NECK = 9;
const int PIN_LED_LISTEN = 10; // LED aceso quando esta ouvindo / calmo
const int PIN_LED_SPEAK  = 11; // LED piscando suave quando esta falando

// Angulo neutro do servo SG90 (cabeca reta)
const int ANGLE_NEUTRAL = 90;
int currentAngle = ANGLE_NEUTRAL;

String inputBuffer = "";

// Move o servo SG90 suavemente sem trancos bruscos (simulando o servo Kondo do artigo)
void moveSmooth(int targetAngle, int stepDelayMs) {
  targetAngle = constrain(targetAngle, 55, 125);
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
    // Aceno afirmativo de cabeca (Nodding a cada pausa na fala do idoso)
    digitalWrite(PIN_LED_LISTEN, HIGH);
    digitalWrite(PIN_LED_SPEAK, LOW);
    moveSmooth(108, 12);
    moveSmooth(82, 12);
    moveSmooth(104, 12);
    moveSmooth(ANGLE_NEUTRAL, 14);
  }
  else if (cmd == "G:serious") {
    // Opcao 9 (Seriously / Weight Shift): Inclina para frente com seriedade
    digitalWrite(PIN_LED_LISTEN, HIGH);
    digitalWrite(PIN_LED_SPEAK, HIGH);
    moveSmooth(112, 18);
  }
  else if (cmd == "G:care") {
    // Opcao 11 (Anxious Care): Acolhimento empatico
    digitalWrite(PIN_LED_LISTEN, HIGH);
    digitalWrite(PIN_LED_SPEAK, HIGH);
    moveSmooth(102, 15);
    delay(200);
    moveSmooth(84, 15);
    moveSmooth(98, 15);
  }
  else if (cmd == "G:talk") {
    // Gesticulacao leve enquanto a voz do Bento sai nas caixas de som do PC
    digitalWrite(PIN_LED_LISTEN, LOW);
    digitalWrite(PIN_LED_SPEAK, HIGH);
    moveSmooth(98, 14);
    moveSmooth(85, 14);
    moveSmooth(95, 14);
    moveSmooth(ANGLE_NEUTRAL, 14);
  }
  else if (cmd == "G:wave") {
    // Despedida ao encerrar a conversa
    for (int i = 0; i < 3; i++) {
      digitalWrite(PIN_LED_SPEAK, HIGH);
      moveSmooth(110, 10);
      digitalWrite(PIN_LED_SPEAK, LOW);
      moveSmooth(75, 10);
    }
    moveSmooth(ANGLE_NEUTRAL, 15);
    digitalWrite(PIN_LED_LISTEN, HIGH);
  }
  else if (cmd == "G:idle") {
    // Parado e calmo (quando termina de falar)
    digitalWrite(PIN_LED_SPEAK, LOW);
    digitalWrite(PIN_LED_LISTEN, HIGH);
    moveSmooth(ANGLE_NEUTRAL, 16);
  }
}

void setup() {
  Serial.begin(9600);
  pinMode(PIN_LED_LISTEN, OUTPUT);
  pinMode(PIN_LED_SPEAK, OUTPUT);

  neckServo.attach(PIN_SERVO_NECK);
  neckServo.write(ANGLE_NEUTRAL);

  // Teste rapido de inicializacao (1 aceno curto mostrando que ligou)
  digitalWrite(PIN_LED_LISTEN, HIGH);
  moveSmooth(102, 15);
  moveSmooth(ANGLE_NEUTRAL, 15);

  Serial.println("BENTO_ARDUINO_READY");
}

void loop() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n') {
      executeGesture(inputBuffer);
      inputBuffer = "";
    } else if (c != '\r') {
      inputBuffer += c;
    }
  }
}
