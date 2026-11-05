const int LED_PIN = 9;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  if (Serial.available() > 0) {
    String data = Serial.readStringUntil('\n');
    data.trim();

    if (data.length() > 0) {
      int brightness = constrain(data.toInt(), 0, 255);
      analogWrite(LED_PIN, brightness);
    }
  }
}
