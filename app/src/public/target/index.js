import DrawingShape from '../drawing-shape.js';
import WebsocketClient from '../websocket-client.mjs';

class Vector {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
  clone() {
    return new Vector(this.x, this.y);
  }
  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }
  add(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }
  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }
  mul(s) {
    this.x *= s;
    this.y *= s;
    return this;
  }
  length() {
    return Math.hypot(this.x, this.y);
  }
  normalize() {
    const len = this.length();
    if (len > 0) {
      this.x /= len;
      this.y /= len;
    }
    return this;
  }
  lerpTo(v, t) {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    return this;
  }
  static sub(a, b) {
    return new Vector(a.x - b.x, a.y - b.y);
  }
}

class Entity {
  // 엔티티의 초기 위치는 정규화된 [-1,1] 범위
  constructor(x, y) {
    this.pos = new Vector(x, y);
    const angle = Math.random() * Math.PI * 2;
    // 초기 속도도 정규화된 범위에서 작게 설정
    const speed = 0.001 + Math.random() * 0.001;
    this.vel = new Vector(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.target = null;
    this.size = 3 + Math.random() * 20;
    this.color = `hsla(0deg, 0%, ${Math.random() * 100}%, 0.9)`;
  }
  setTarget(vec) {
    this.target = vec.clone();
  }
  clearTarget() {
    this.target = null;
  }
  update(mode) {
    if (mode === 'wander' || !this.target) {
      this.updateWander();
    } else {
      this.updateAlign();
    }
  }
  updateWander() {
    // 작은 무작위 변화로 속도 조절 (정규화 좌표에 맞춰 축소)
    this.vel.x += (Math.random() - 0.5) * 0.001;
    this.vel.y += (Math.random() - 0.5) * 0.001;
    // 최대 속도 제한 (정규화 범위에 맞게)
    const maxSpeed = 0.001;
    const speed = this.vel.length();
    if (speed > maxSpeed) {
      this.vel.normalize().mul(maxSpeed);
    }
    this.pos.add(this.vel);
    // 경계 [-1, 1]을 넘으면 반사
    if (this.pos.x < -1 || this.pos.x > 1) {
      this.vel.x *= -1;
    }
    if (this.pos.y < -1 || this.pos.y > 1) {
      this.vel.y *= -1;
    }
    // 약간의 마진을 두고 클램핑
    const margin = 0.05;
    this.pos.x = Math.max(-1 - margin, Math.min(1 + margin, this.pos.x));
    this.pos.y = Math.max(-1 - margin, Math.min(1 + margin, this.pos.y));
  }
  updateAlign() {
    this.pos.lerpTo(this.target, Math.random() * 0.1);
    // 정렬 상태에서도 약간의 흔들림을 유지
    this.pos.x += (Math.random() - 0.5) * 0.005;
    this.pos.y += (Math.random() - 0.5) * 0.005;
  }
  draw(ctx) {
    // 정규화된 위치를 픽셀 좌표로 변환하여 그리기
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const x = ((this.pos.x + 1) / 2) * w;
    const y = ((this.pos.y + 1) / 2) * h;
    ctx.beginPath();
    ctx.fillStyle = this.color;
    ctx.arc(x, y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

let wsc;
let shapes = [];
const ENT_COUNT = 1000;
let entities = [];
let mode = 'wander';
const canvas = document.querySelector('#canvas');
canvas.width = canvas.offsetWidth * 2;
canvas.height = canvas.offsetHeight * 2;
const ctx = canvas.getContext('2d');

function frame() {
  draw();
  window.requestAnimationFrame(frame);
}
window.requestAnimationFrame(frame);

function draw() {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.clearRect(0, 0, w, h);
  // 도형은 정규화된 좌표를 픽셀로 변환하여 그림

  /*
  shapes.forEach((shape) => {
    if (shape.length > 1) {
      shape.strokes.forEach((stroke) => {
        const f = stroke.from;
        const fx = ((f.x + 1) / 2) * w;
        const fy = ((f.y + 1) / 2) * h;
        const t = stroke.to;
        const tx = ((t.x + 1) / 2) * w;
        const ty = ((t.y + 1) / 2) * h;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 20;
        ctx.lineCap = 'round';
        ctx.stroke();
      });
    }
  });
  */

  entities.forEach((ent) => {
    ent.update(mode);
    ent.draw(ctx);
  });
}

// 새로 추가: 스트로크 하나당 할당할 점 개수
const POINTS_PER_STROKE = 2;

function applyShapeToEntities() {
  if (!shapes || shapes.length == 0) {
    for (let i = 0; i < entities.length; i++) {
      const x = Math.random() * 2 - 1;
      const y = Math.random() * 2 - 1;
      entities[i].setTarget(new Vector(x, y));
    }
    mode = 'align';
    return;
  }

  // 각 도형별 전체 길이(거리) 계산
  const shapeDistances = shapes.map((shape) => shape.distance || 0);
  const totalDist = shapeDistances.reduce((sum, d) => sum + d, 0);
  if (totalDist <= 0) return;

  const targets = [];

  // 모든 엔티티 수(ENT_COUNT)만큼 도형 전체에 균등하게 포인트를 샘플링
  for (let i = 0; i < entities.length; i++) {
    // 도형 전체 길이에 대한 누적 거리값
    const d = (i / (entities.length - 1)) * totalDist;
    let accDist = 0;
    let pos = null;

    for (let sIndex = 0; sIndex < shapes.length; sIndex++) {
      const shapeDist = shapeDistances[sIndex];
      if (d <= accDist + shapeDist) {
        // 해당 도형에서의 거리(localDist)를 구함
        const localDist = d - accDist;
        const shape = shapes[sIndex];

        // 도형 내부에서 원하는 지점을 찾기 위해 스트로크를 순회
        let accStrokeDist = 0;
        for (const stroke of shape.strokes) {
          const sLen = stroke.length || 0;
          if (localDist <= accStrokeDist + sLen) {
            // 현재 스트로크 내에서 비율(rel)을 계산하여 좌표를 얻음
            const rel = (localDist - accStrokeDist) / (sLen || 1);
            const p = stroke.posAt(rel);
            pos = p;
            break;
          }
          accStrokeDist += sLen;
        }

        // 혹시 못 찾았다면 마지막 스트로크의 끝점 사용
        if (!pos && shape.strokes.length > 0) {
          const lastStroke = shape.strokes[shape.strokes.length - 1];
          pos = lastStroke.to;
        }
        break;
      }
      accDist += shapeDist;
    }

    // 마지막 도형도 없다면 기본값
    if (!pos) {
      const lastShape = shapes[shapes.length - 1];
      if (lastShape.strokes && lastShape.strokes.length > 0) {
        pos = lastShape.strokes[0].from;
      } else {
        pos = { x: 0, y: 0 };
      }
    }

    // 각 엔티티에 정규화된 좌표를 직접 할당
    targets.push(new Vector(pos.x, pos.y));
  }

  // 필요하다면 targets 배열을 섞어 자연스럽게 보이도록 할 수 있습니다.
  const shuffled = targets.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // 모든 엔티티에 타깃 좌표 할당
  for (let i = 0; i < entities.length; i++) {
    entities[i].setTarget(shuffled[i]);
  }
  mode = 'align';
}

function init() {
  wsc = new WebsocketClient('/target');
  wsc.on('open', () => {
    wsc.event('sync');
  });
  wsc.on('json', (con, event, data) => {
    if (event === 'sync') {
      shapes = [];
      data.forEach((shape) => {
        const ds = new DrawingShape(shape);
        shapes.push(ds);
      });
    } else if (event === 'newshape') {
      const ds = new DrawingShape();
      shapes.push(ds);
    } else if (event === 'addpoint') {
      // 추가되는 점도 이미 정규화된 좌표라고 가정
      shapes[shapes.length - 1].addPoint(data.x, data.y, data.r);
    }
    // 도형 변경 시에만 타깃 업데이트
    applyShapeToEntities();
  });
  wsc.open();

  function initEntities() {
    entities.length = 0;
    for (let i = 0; i < ENT_COUNT; i++) {
      // 정규화된 [-1, 1] 범위에서 무작위 초기 위치
      const x = Math.random() * 2 - 1;
      const y = Math.random() * 2 - 1;
      entities.push(new Entity(x, y));
    }
  }
  initEntities();
}
init();
