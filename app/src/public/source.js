import DrawingShape from './drawing-shape.js';
import WebSocketClient from './websocket-client.mjs';

const wsc = new WebSocketClient('/source');
wsc.on('open', () => {
  console.log('open');
});
wsc.open();

const canvas = document.querySelector('canvas');
canvas.width = canvas.offsetWidth * 2;
canvas.height = canvas.offsetHeight * 2;
const ctx = canvas.getContext('2d');

let shapes = [];
let pointT = 0;

let m = 1;
let si = 0;
let sip = 0;
function frame() {
  const w = canvas.width;
  const h = canvas.height;

  if (m === 1) {
    ctx.clearRect(0, 0, w, h);
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
  }

  if (m === 2) {
    if (si == 0 && sip == 0) {
      ctx.clearRect(0, 0, w, h);
    }

    if (sip == 0) {
      sip++;
    }

    const block = 1000 / 60;

    const shape = shapes[si];
    if (shape.length > 1) {
      let slice = 10;
      for (let i = 0; i < slice; i++) {
        const pos = shape.posAtTime(sip + (block / slice) * i);
        const x = ((pos.x + 1) / 2) * w;
        const y = ((pos.y + 1) / 2) * h;

        const cr = 50;
        ctx.beginPath();
        ctx.arc(x, y, cr, 0, 2 * Math.PI);
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    sip += block;

    if (sip >= shape.duration) {
      sip = 0;
      si++;
    }
    if (si >= shapes.length) {
      si = 0;
      sip = 0;
    }
  }

  /*
        const cpos = shape.posAt(c / 100);
        const cx = cpos[0] * w;
        const cy = cpos[1] * h;
        const cr = 50;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, 2 * Math.PI);
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 5;
        ctx.stroke();
        */

  window.requestAnimationFrame(frame);
}
window.requestAnimationFrame(frame);

function newStroke() {
  shapes.push(new DrawingShape());
  pointT === 0;
}
function toStroke(x, y) {
  if (pointT === 0) {
    shapes[shapes.length - 1].addPoint(x, y);
  } else {
    const t = Date.now() - pointT;
    shapes[shapes.length - 1].addPoint(x, y, t);
    wsc.event('point', [x, y, t]);
  }
  pointT = Date.now();
}
function toPoint(px, py) {
  const rect = canvas.getBoundingClientRect();
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  let tx = px - rect.left;
  let ty = py - rect.top;
  let x = (tx / w) * 2 - 1;
  let y = (ty / h) * 2 - 1;
  //let rp = this.rotatePoint([x, y], this.offsetDeg);
  //x = rp[0];
  //y = rp[1];
  return { x, y };
}
function updateShape() {}

let mouse = false;
canvas.addEventListener('mousedown', (event) => {
  mouse = true;
  const point = toPoint(event.pageX, event.pageY);
  toStroke(point.x, point.y);
});
canvas.addEventListener('mousemove', (event) => {
  if (mouse) {
    const point = toPoint(event.pageX, event.pageY);
    toStroke(point.x, point.y);
  }
});
canvas.addEventListener('mouseup', (event) => {
  mouse = false;
  newStroke();
});
canvas.addEventListener('mouseleave', (event) => {
  mouse = false;
  newStroke();
});
newStroke();

document.querySelector('#button-clear').addEventListener('click', () => {
  m = 1;
  shapes = [];
  newStroke();
});
document.querySelector('#button-rp').addEventListener('click', () => {
  if (m === 1) {
    m = 2;
    si = 0;
    sip = 0;
    document.querySelector('#button-rp').innerHTML = '기록';
  } else if (m === 2) {
    m = 1;
    document.querySelector('#button-rp').innerHTML = '재생';
  }
});
