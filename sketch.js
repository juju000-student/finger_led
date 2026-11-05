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
