
# 손가락 슬라이더로 LED 밝기 조절 (p5.js + ml5 + Arduino)

202601527김주영

## 개요

웹캠으로 손을 인식한 뒤 **엄지와 집게손가락 사이의 간격**으로 p5 화면의 슬라이더를 조절합니다.
조절한 슬라이더 값은 Web Serial로 아두이노에 전송하고, 아두이노는 이 값을 이용해 PWM 핀(D9)에 연결된 LED의 밝기를 바꿉니다.

```
엄지-검지 간격 --(ml5 handPose)--> 슬라이더 0~100 --(0~255로 변환, Web Serial)--> Arduino analogWrite(D9) --> LED 밝기
```

## 미션 조건과 구현 위치

| 조건 | 구현 |
|---|---|
| 엄지와 집게손가락 간격으로 슬라이더 조절 | `sketch.js`의 `draw()`에서 `keypoints[4]`(엄지 끝), `keypoints[8]`(검지 끝) 사이 거리를 계산해 `slider.value()`에 반영 |
| 슬라이더 값을 아두이노로 전송 | `sketch.js`의 `sendBrightness()`에서 슬라이더 값을 0~255로 변환해 `"값\n"` 형식으로 전송 |
| 아두이노에 연결된 LED 밝기 조절 | `finger_led_pwm.ino`에서 받은 값을 `analogWrite(9, 값)`으로 출력 |

## 동작영상과 Fritzing 회로 사진

https://github.com/user-attachments/assets/92d5e6c0-7e05-4297-9647-14cf0bd39645

<img width="1767" height="702" alt="PotButtonLCD (1)_bb" src="https://github.com/user-attachments/assets/a0c10744-bfa5-4f73-a4c1-f8834116e308" />






## 회로

| Arduino | 연결 |
|---|---|
| D9 (PWM, `~` 표시) | 220Ω 저항 → LED 긴 다리(+) |
| GND | LED 짧은 다리(-) |

D9를 사용하는 이유는 `~` 표시가 있는 PWM 핀이어야 `analogWrite()`로 밝기를 단계적으로 조절할 수 있기 때문입니다.
저항을 연결하는 이유는 LED에 전류가 너무 많이 흘러 LED나 핀이 손상되는 것을 막기 위해서입니다.

## 전체 코드

### finger_led_pwm/finger_led_pwm.ino

```cpp
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
```

### index.html

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <script src="https://cdn.jsdelivr.net/npm/p5@2.3.4/lib/p5.js"></script>
  <script src="https://unpkg.com/ml5@1/dist/ml5.min.js"></script>
</head>
<body>
  <script src="sketch.js"></script>
</body>
</html>
```

### sketch.js

```javascript
let video, handPose;
let hands = [];
let connections = [];
let slider, connectButton;

let port, writer;
let connected = false;
let sending = false;
let lastSent = -1;
let sliderValue = 50;
let statusText = "Arduino를 연결해 주세요.";

async function setup() {
  createCanvas(640, 480);

  slider = createSlider(0, 100, 50, 1);
  slider.style('writing-mode', 'vertical-rl');
  slider.style('height', '440px');
  slider.style('transform', 'rotate(180deg)');
  slider.position(10, 20);
  slider.input(() => {
    sliderValue = Number(slider.value());
  });

  connectButton = createButton("Arduino 연결 / 해제");
  connectButton.position(20, 500);
  connectButton.mousePressed(connectArduino);

  video = createCapture(VIDEO, { flipped: true });
  video.size(640, 480);
  video.hide();

  handPose = await ml5.handPose({ flipped: true });
  connections = handPose.getConnections();
  handPose.detectStart(video, gotHands);
}

function draw() {
  background(20);
  image(video, 0, 0, width, height);

  for (let hand of hands) {
    stroke(0, 255, 0);
    strokeWeight(2);

    for (let [a, b] of connections) {
      let p1 = hand.keypoints[a];
      let p2 = hand.keypoints[b];
      line(p1.x, p1.y, p2.x, p2.y);
    }

    noStroke();
    fill(255, 0, 0);

    for (let p of hand.keypoints) {
      circle(p.x, p.y, 10);
    }
  }

  if (hands.length > 0) {
    let points = hands[0].keypoints;

    let thumb = points[4];
    let index = points[8];
    let wrist = points[0];
    let palm = points[9];

    stroke(255, 140, 0);
    strokeWeight(4);
    line(thumb.x, thumb.y, index.x, index.y);

    let fingerDist = dist(
      thumb.x, thumb.y, index.x, index.y
    );

    let palmDist = dist(
      wrist.x, wrist.y, palm.x, palm.y
    );

    if (palmDist > 0) {
      let value = constrain(
        100 * fingerDist / palmDist - 15, 0, 100
      );

      sliderValue += 0.2 * (value - sliderValue);
      slider.value(round(sliderValue));
    }
  }

  sendBrightness();

  noStroke();
  fill(0, 170);
  rect(50, 430, 570, 40, 8);

  fill(255);
  textSize(16);
  text(
    "밝기: " + round(map(slider.value(), 0, 100, 0, 255))
    + " / 255  |  " + statusText,
    60, 455
  );
}

function gotHands(results) {
  hands = results;
}

async function connectArduino() {
  try {
    if (port) {
      if (sending) return;

      connected = false;
      writer.releaseLock();
      writer = null;
      await port.close();
      port = null;
      statusText = "연결 해제됨";
      return;
    }

    if (!("serial" in navigator)) {
      statusText = "Web Serial을 지원하지 않습니다.";
      return;
    }

    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    writer = port.writable.getWriter();

    statusText = "Arduino 연결 중...";

    await new Promise(resolve => setTimeout(resolve, 2000));

    lastSent = -1;
    connected = true;
    statusText = "연결됨";
  } catch (error) {
    statusText = "연결 오류: " + error.message;
  }
}

async function sendBrightness() {
  if (!connected || sending) return;

  let brightness = round(
    map(Number(slider.value()), 0, 100, 0, 255)
  );

  if (brightness === lastSent) return;

  sending = true;

  try {
    await writer.write(
      new TextEncoder().encode(brightness + "\n")
    );

    lastSent = brightness;
  } catch (error) {
    statusText = "전송 오류: " + error.message;
  } finally {
    sending = false;
  }
}
```


## 동작 원리

### 1. 손 인식 (p5.js + ml5)

- `ml5.handPose()`는 손의 관절 21개를 `keypoints` 배열로 반환합니다.
  - `keypoints[0]`: 손목
  - `keypoints[4]`: 엄지 끝
  - `keypoints[8]`: 검지 끝
  - `keypoints[9]`: 중지 시작 부분(손바닥 중심 근처)
- `getConnections()`로 관절 연결 정보를 받아 손 모양을 초록색 선으로 그립니다.
- 영상과 인식 결과를 모두 `flipped: true`로 설정해 거울처럼 보이게 합니다.
  이렇게 하면 손을 오른쪽으로 움직였을 때 화면에서도 오른쪽으로 움직이기 때문입니다.

### 2. 손가락 간격을 슬라이더 값으로 변환

```
value = constrain(100 * fingerDist / palmDist - 15, 0, 100)
```

- `fingerDist`: 엄지 끝과 검지 끝 사이 거리
- `palmDist`: 손목과 손바닥 중심 사이 거리
- 손가락 간격을 손바닥 크기로 나누는 이유는 손이 카메라에 가까워지거나 멀어져도 같은 손 모양이면 비슷한 값이 나오게 하기 위해서입니다.
  손이 카메라에 가까워지면 화면 속 픽셀 거리 자체가 커지기 때문에, 단순한 픽셀 거리만 사용하면 손 모양이 같아도 값이 달라집니다.
- `- 15`는 손가락을 오므렸을 때 0에 가까운 값이 나오도록 보정한 것이고, `constrain()`은 값을 0~100 범위로 제한합니다.

```
sliderValue += 0.2 * (value - sliderValue);
```

- 목표값으로 한 번에 바꾸지 않고 차이의 20%씩만 따라가게 합니다.
  손 인식 좌표는 매 프레임 조금씩 흔들리기 때문에, 이렇게 해야 LED가 깜빡이지 않고 부드럽게 변합니다.

### 3. 슬라이더 값 전송 (Web Serial)

- `navigator.serial.requestPort()`로 포트를 선택하고 9600 baud로 엽니다.
  아두이노의 `Serial.begin(9600)`과 속도가 같아야 데이터를 올바르게 읽을 수 있기 때문입니다.
- 포트를 연 뒤 2초를 기다리고 나서 전송을 시작합니다.
  Uno는 시리얼 포트가 열리면 자동으로 리셋되기 때문에, 부팅되는 동안 보낸 값은 사라질 수 있습니다.
- 슬라이더 값(0~100)을 `map()`으로 0~255로 변환해 `"128\n"`처럼 줄바꿈을 붙여 보냅니다.
  `analogWrite()`의 범위가 0~255이고, 아두이노가 줄바꿈까지를 하나의 값으로 읽기 때문입니다.
- 값이 바뀌었을 때만 전송하고(`lastSent`), 이전 전송이 끝나기 전에는 새로 보내지 않습니다(`sending`).
  매 프레임 같은 값을 계속 보내면 시리얼 버퍼가 쌓여 반응이 느려지기 때문입니다.

### 4. LED 밝기 조절 (Arduino)

```
String data = Serial.readStringUntil('\n');
data.trim();
int brightness = constrain(data.toInt(), 0, 255);
analogWrite(LED_PIN, brightness);
```

- 줄바꿈 전까지 문자열을 읽고, `trim()`으로 공백과 `\r`을 지운 뒤 정수로 변환합니다.
- `constrain()`으로 0~255 범위를 보장한 다음 `analogWrite()`로 PWM 듀티비를 바꿉니다.
  PWM은 핀을 아주 빠르게 켜고 끄며 켜져 있는 시간의 비율을 바꾸는 방식이라서, 듀티비가 클수록 LED가 더 밝게 보입니다.

