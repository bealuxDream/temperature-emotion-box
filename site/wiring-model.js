const model = document.querySelector('.wiring-model');
const canvas = model.querySelector('.wiring-solid');
const labelCanvas = model.querySelector('.wiring-labels');
const stage = model.querySelector('.wiring-stage');
const scene = canvas.getContext('2d');
const ink = labelCanvas.getContext('2d');

const DEFAULT_YAW = -0.19;
const DEFAULT_PITCH = 0.79;
const targetZ = 5;
const targetY = 5;
const pitchDistance = 3.2;
const boardPinX = (index) => -36.8 + index * pitchDistance;
const headerZ = -1.4;
const connectorZ = 1.8;
const modulePinZ = 43;

const wires = [
  { id: 'power', color: '#b54433', top: '① 3V3', bottom: '① VCC', pin: 0, x: 14.8, height: 24,
    description: '① 供电，把 DS18B20 的 VCC 接到 ESP32-S3 的 3V3。' },
  { id: 'data', color: '#2273aa', top: '② GPIO16', bottom: '② DQ', pin: 8, x: 18, height: 29,
    description: '② 数据，把 DS18B20 的 DQ 接到 ESP32-S3 的 GPIO16。这个针脚在 15 和 17 中间。' },
  { id: 'ground', color: '#36734b', top: '③ G', bottom: '③ GND', pin: 21, x: 21.2, height: 20,
    description: '③ 共地，把 DS18B20 的 GND 接到 ESP32-S3 的 G。紧挨着的 5Vin 留空。' },
];

function color(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

function triangle(mesh, a, b, c, shade) {
  mesh.push(...a, ...shade, ...b, ...shade, ...c, ...shade);
}

function quad(mesh, a, b, c, d, base, light = 1) {
  const shade = base.map((component) => component * light);
  triangle(mesh, a, b, c, shade);
  triangle(mesh, a, c, d, shade);
}

function block(mesh, x, y, z, width, height, depth, hex) {
  const left = x - width / 2, right = x + width / 2;
  const back = z - depth / 2, front = z + depth / 2;
  const low = y, high = y + height;
  const a = [left, low, back], b = [right, low, back], c = [right, low, front], d = [left, low, front];
  const e = [left, high, back], f = [right, high, back], g = [right, high, front], h = [left, high, front];
  const base = color(hex);
  quad(mesh, e, f, g, h, base);
  quad(mesh, d, c, g, h, base, 0.83);
  quad(mesh, a, d, h, e, base, 0.74);
  quad(mesh, b, c, g, f, base, 0.86);
  quad(mesh, a, b, f, e, base, 0.69);
  quad(mesh, a, b, c, d, base, 0.65);
}

function flat(mesh, x, y, z, width, depth, shade) {
  const w = width / 2, d = depth / 2;
  quad(mesh, [x - w, y, z - d], [x + w, y, z - d], [x + w, y, z + d], [x - w, y, z + d], shade);
}

function breadboard(mesh) {
  block(mesh, 0, -3.6, -11, 110, 3.2, 60, '#cbd0c3');
  block(mesh, 0, -0.4, -11, 108, 0.4, 58, '#f5f2e8');
  const holes = color('#807e71');
  const gap = color('#c4c1b4');
  flat(mesh, 0, 0.006, -11, 106, 2.4, gap);
  for (let column = 0; column < 32; column += 1) {
    const x = -49.6 + column * pitchDistance;
    for (const z of [-27, -23.8, -20.6, -17.4, -14.2, -7.8, -4.6, -1.4, 1.8, 5]) {
      flat(mesh, x, 0.012, z, 1.05, 1.05, holes);
    }
    if (column !== 15 && column !== 16) {
      for (const z of [-35.4, -32.2, 10.9, 14.1]) flat(mesh, x, 0.012, z, 0.88, 0.88, holes);
    }
  }
  for (const [z, hex] of [[-37, '#bf6458'], [-30.6, '#6995af'], [9.3, '#bf6458'], [15.7, '#6995af']]) {
    flat(mesh, 0, 0.022, z, 104, 0.45, color(hex));
  }
}

function esp32(mesh) {
  block(mesh, -3.2, 1.8, -11, 74.5, 1.6, 23.3, '#27342e');
  block(mesh, -35, 3.45, -11, 11, 0.22, 14.1, '#242822');
  for (let i = 0; i < 4; i += 1) {
    flat(mesh, -36.4 + (i % 2) * 2, 3.71, -16.1 + i * 3.3, 4.8, 0.55, color('#bc985b'));
  }
  block(mesh, -21, 3.45, -11, 17, 2.75, 16, '#a8b2ab');
  flat(mesh, -21, 6.22, -11, 12.5, 5.5, color('#929e94'));
  block(mesh, 3.7, 3.45, -9.4, 7.2, 1.3, 6.2, '#1c2622');
  block(mesh, 14.6, 3.45, -15.3, 6, 1.1, 5.5, '#1f2925');
  for (const x of [-2.5, 3.9]) {
    block(mesh, x, 3.45, -16.1, 3.8, 1.2, 3.8, '#c1c1ac');
    block(mesh, x, 4.65, -16.1, 1.6, 0.45, 1.6, '#343d35');
  }
  for (const z of [-16.6, -6.4]) {
    block(mesh, 34.2, 3.42, z, 6.9, 2.8, 6.25, '#d0d7ce');
    block(mesh, 37.65, 4.08, z, 0.15, 1.2, 4.4, '#444d45');
  }
  for (let i = 0; i < 22; i += 1) {
    const x = boardPinX(i);
    for (const z of [headerZ, -20.6]) {
      block(mesh, x, 0, z, 0.6, 3.58, 0.6, '#b7a477');
      flat(mesh, x, 3.46, z, 1.42, 1.42, color('#c6ac72'));
    }
  }
}

function ds18b20(mesh) {
  block(mesh, 18, 0.4, 36.9, 16.2, 1.5, 15.9, '#27362d');
  block(mesh, 18, 1.9, 33.2, 4.9, 5, 3.7, '#263029');
  block(mesh, 18, 6.9, 33, 4.15, 0.5, 3.0, '#39463b');
  for (const { x } of wires) {
    block(mesh, x, 2, modulePinZ, 0.68, 2.3, 0.68, '#bea671');
    flat(mesh, x, 1.94, modulePinZ, 1.7, 1.7, color('#cfbb87'));
  }
}

function cubic(a, b, c, d, t) {
  const s = 1 - t;
  return a.map((value, i) => s ** 3 * value + 3 * s ** 2 * t * b[i] + 3 * s * t ** 2 * c[i] + t ** 3 * d[i]);
}

function cable(wire) {
  const mesh = [];
  const x = boardPinX(wire.pin);
  const start = [x, 7.8, connectorZ], end = [wire.x, 7.5, modulePinZ];
  const outgoing = [x, wire.height, 12], incoming = [wire.x, wire.height + 1, 35];
  const base = color(wire.color);
  const points = Array.from({ length: 37 }, (_, i) => cubic(start, outgoing, incoming, end, i / 36));
  const rings = points.map((point, i) => {
    const previous = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    const dx = next[0] - previous[0], dz = next[2] - previous[2];
    const distance = Math.hypot(dx, dz) || 1;
    const side = [dz / distance, 0, -dx / distance];
    const dy = next[1] - previous[1];
    const length = Math.hypot(distance, dy);
    const up = [-dx * dy / distance / length, distance / length, -dz * dy / distance / length];
    return Array.from({ length: 8 }, (_, j) => {
      const angle = j * Math.PI / 4;
      return point.map((value, k) => value + 0.82 * (Math.cos(angle) * side[k] + Math.sin(angle) * up[k]));
    });
  });
  for (let i = 0; i < rings.length - 1; i += 1) {
    for (let j = 0; j < 8; j += 1) {
      const k = (j + 1) % 8;
      quad(mesh, rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j], base, 0.81 + 0.19 * Math.sin(j * Math.PI / 4));
    }
  }

  // The plug and board pin use neighboring holes in the same terminal strip.
  flat(mesh, x, 0.033, (headerZ + connectorZ) / 2, 0.65, connectorZ - headerZ, base);
  block(mesh, x, 0.18, connectorZ, 1.82, 6.9, 1.82, '#354039');
  block(mesh, x, 6.5, connectorZ, 1.82, 1.0, 1.82, wire.color);
  block(mesh, wire.x, 2.55, modulePinZ, 1.82, 4.75, 1.82, '#354039');
  block(mesh, wire.x, 6.5, modulePinZ, 1.82, 1.0, 1.82, wire.color);
  return mesh;
}

function camera(width, height, unit, yaw, pitch) {
  const sinYaw = Math.sin(yaw), cosYaw = Math.cos(yaw);
  const sinPitch = Math.sin(pitch), cosPitch = Math.cos(pitch);
  return ([x, y, z]) => {
    y -= targetY;
    z -= targetZ;
    const travel = sinYaw * x + cosYaw * z;
    return [width / 2 + (cosYaw * x - sinYaw * z) * unit,
      height / 2 + (sinPitch * travel - cosPitch * y) * unit,
      cosPitch * travel + sinPitch * y];
  };
}

function packVertices(vertices) {
  return { vertices, projected: new Float32Array(vertices.length / 2) };
}

// Rasterize the model into a transparent canvas with per-pixel depth, so
// pins and cables occlude each other correctly even without WebGL.
function paintTriangle(pixels, depth, width, height, points, i, shade) {
  const ax = points[i], ay = points[i + 1], az = points[i + 2];
  const bx = points[i + 3], by = points[i + 4], bz = points[i + 5];
  const cx = points[i + 6], cy = points[i + 7], cz = points[i + 8];
  const abx = bx - ax, aby = by - ay, acx = cx - ax, acy = cy - ay;
  const determinant = abx * acy - aby * acx;
  if (Math.abs(determinant) < 0.001) return;

  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const x1 = Math.min(width, Math.ceil(Math.max(ax, bx, cx)));
  const y1 = Math.min(height, Math.ceil(Math.max(ay, by, cy)));

  const uStep = acy / determinant, vStep = -aby / determinant;
  const dzU = bz - az, dzV = cz - az;
  const dzStep = uStep * dzU + vStep * dzV;
  for (let y = y0; y < y1; y += 1) {
    const dy = y + 0.5 - ay, dx = x0 + 0.5 - ax;
    let u = (acy * dx - acx * dy) / determinant;
    let v = (abx * dy - aby * dx) / determinant;
    let z = az + u * dzU + v * dzV;
    for (let x = x0, k = y * width + x0; x < x1; x += 1, k += 1) {
      if (u >= -0.0001 && v >= -0.0001 && u + v <= 1.0001 && z > depth[k]) {
        depth[k] = z;
        pixels[k] = shade;
      }
      u += uStep;
      v += vStep;
      z += dzStep;
    }
  }
}

function renderModel(objects, target, project, focus) {
  const { width, height, pixels, depth, image } = target;
  pixels.fill(0);
  depth.fill(-Infinity);
  for (const object of objects) {
    const { vertices, projected } = object;
    const faded = Boolean(object.id && focus !== 'all' && object.id !== focus);
    for (let i = 0, j = 0; i < vertices.length; i += 6, j += 3) {
      const [x, y, z] = project([vertices[i], vertices[i + 1], vertices[i + 2]]);
      projected[j] = x;
      projected[j + 1] = y;
      projected[j + 2] = z;
    }
    const channel = (v, base) => Math.round(255 * (faded ? v * 0.21 + base * 0.79 : v));
    for (let i = 0, j = 0; i < vertices.length; i += 18, j += 9) {
      const shade = 0xff000000 | channel(vertices[i + 5], 0.76) << 16 |
        channel(vertices[i + 4], 0.80) << 8 | channel(vertices[i + 3], 0.77);
      paintTriangle(pixels, depth, width, height, projected, j, shade);
    }
  }
  scene.putImageData(image, 0, 0);
}

function drawAnnotations(width, height, project, focus) {
  ink.font = '700 12px system-ui, "Microsoft YaHei", sans-serif';
  ink.textAlign = 'center';
  ink.textBaseline = 'middle';
  const used = [];
  function tag(position, label, theme, dx, dy) {
    const [x, y] = project(position);
    const w = ink.measureText(label).width + 16, h = 24;
    const tx = Math.max(w / 2 + 5, Math.min(width - w / 2 - 5, x + dx));
    let ty = Math.max(h / 2 + 5, Math.min(height - h / 2 - 5, y + dy));
    if (used.some(([u, v, span]) => Math.abs(u - tx) < (span + w) / 2 + 3 && Math.abs(v - ty) < h + 3)) {
      ty = Math.max(h / 2 + 5, Math.min(height - h / 2 - 5, ty + (dy < 0 ? -1 : 1) * (h + 4)));
    }
    used.push([tx, ty, w]);
    ink.beginPath();
    ink.moveTo(x, y);
    ink.lineTo(tx, ty);
    ink.strokeStyle = '#fdfdf2';
    ink.lineWidth = 3;
    ink.stroke();
    ink.strokeStyle = theme;
    ink.lineWidth = 1.4;
    ink.stroke();
    dot(x, y, theme);
    ink.fillStyle = theme;
    ink.beginPath();
    ink.roundRect(tx - w / 2, ty - h / 2, w, h, 9);
    ink.fill();
    ink.fillStyle = '#fffdf5';
    ink.fillText(label, tx, ty);
  }
  function dot(x, y, theme) {
    ink.fillStyle = theme;
    ink.strokeStyle = '#fffdf5';
    ink.lineWidth = 1.5;
    ink.beginPath();
    ink.arc(x, y, 3.7, 0, Math.PI * 2);
    ink.fill();
    ink.stroke();
  }

  for (const [i, wire] of wires.entries()) {
    if (focus !== 'all' && focus !== wire.id) continue;
    const x = boardPinX(wire.pin);
    tag([x, 3.59, headerZ], wire.top, wire.color, (i - 1) * 24, -31);
    if (focus === 'all') {
      dot(...project([wire.x, 7.7, modulePinZ]), wire.color);
    } else {
      tag([wire.x, 7.7, modulePinZ], wire.bottom, wire.color, 30, 28);
    }
  }
  if (focus === 'all') tag([18, 1.91, 38], 'DS18B20 模块', '#394d3b', 6, 38);
  if (focus === 'ground') tag([boardPinX(20), 3.6, headerZ], '5Vin 留空', '#634d39', -41, -38);
}

function modelScale(width, height, yaw, pitch) {
  const project = camera(0, 0, 1, yaw, pitch);
  // Include the corner points of the breadboard and the module, as well as the cable arches.
  const positions = [[-55, -3.6, -41], [55, -3.6, -41], [-55, -3.6, 19], [55, -3.6, 19],
    [-55, 0, -41], [55, 0, -41], [-55, 0, 19], [55, 0, 19],
    [26, 0, 45], [10, 0, 45], [-36.8, 24, 11], [18, 25, 25], [30.4, 20, 11]];
  const screen = positions.map(project);
  const halfX = Math.max(...screen.map(([x]) => Math.abs(x)));
  const halfY = Math.max(...screen.map(([, y]) => Math.abs(y)));
  return Math.min(width / (2 * halfX + 30), height / (2 * halfY + 30));
}

function setup() {
  const solid = [];
  breadboard(solid);
  esp32(solid);
  ds18b20(solid);
  const objects = [packVertices(solid), ...wires.map((wire) => ({ ...packVertices(cable(wire)), id: wire.id }))];
  let target;
  let yaw = DEFAULT_YAW, pitch = DEFAULT_PITCH, focus = 'all', drag, pending = 0;

  function redraw() {
    pending = 0;
    const { width, height } = stage.getBoundingClientRect();
    if (!width || !height) return;
    const pixelsX = Math.round(width), pixelsY = Math.round(height);
    if (!target || target.width !== pixelsX || target.height !== pixelsY) {
      canvas.width = pixelsX;
      canvas.height = pixelsY;
      const image = scene.createImageData(pixelsX, pixelsY);
      target = { width: pixelsX, height: pixelsY, image,
        pixels: new Uint32Array(image.data.buffer), depth: new Float32Array(pixelsX * pixelsY) };
    }
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const overlayX = Math.round(width * density), overlayY = Math.round(height * density);
    if (labelCanvas.width !== overlayX || labelCanvas.height !== overlayY) {
      labelCanvas.width = overlayX;
      labelCanvas.height = overlayY;
    }
    const unit = modelScale(width, height, yaw, pitch);
    renderModel(objects, target, camera(pixelsX, pixelsY, unit, yaw, pitch), focus);
    ink.setTransform(overlayX / width, 0, 0, overlayY / height, 0, 0);
    ink.clearRect(0, 0, width, height);
    drawAnnotations(width, height, camera(width, height, unit, yaw, pitch), focus);
  }

  const invalidate = () => { if (!pending) pending = requestAnimationFrame(redraw); };
  const rotate = (dx, dy) => {
    yaw += dx;
    pitch = Math.max(0.19, Math.min(Math.PI / 2, pitch + dy));
    invalidate();
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (drag || event.button !== 0) return;
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    rotate((event.clientX - drag.x) * 0.009, (event.clientY - drag.y) * 0.008);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(event, (e) => { if (drag?.pointerId === e.pointerId) drag = null; });
  }

  canvas.addEventListener('keydown', (event) => {
    const steps = { ArrowLeft: [-0.14, 0], ArrowRight: [0.14, 0], ArrowUp: [0, 0.12], ArrowDown: [0, -0.12] };
    const delta = steps[event.key];
    if (delta) {
      event.preventDefault();
      rotate(...delta);
    }
  });

  for (const button of model.querySelectorAll('[data-view]')) {
    button.addEventListener('click', () => {
      const top = button.dataset.view === 'top';
      yaw = top ? 0 : DEFAULT_YAW;
      pitch = top ? Math.PI / 2 : DEFAULT_PITCH;
      invalidate();
    });
  }

  const reading = model.querySelector('#model-reading');
  const allDescription = reading.textContent;
  const controls = Array.from(model.querySelectorAll('[data-wire]'));
  for (const button of controls) {
    button.addEventListener('click', () => {
      focus = button.dataset.wire;
      reading.textContent = wires.find((wire) => wire.id === focus)?.description ?? allDescription;
      controls.forEach((control) => control.setAttribute('aria-pressed', String(control === button)));
      invalidate();
    });
  }

  for (const element of model.querySelectorAll('[hidden]')) element.hidden = false;
  new ResizeObserver(invalidate).observe(stage);
  invalidate();
}

function usePhotos() {
  for (const element of model.querySelectorAll('.wiring-stage, .wiring-views, .wiring-model-tools')) element.hidden = true;
  model.querySelector('#model-title').textContent = '从实拍图找针脚';
  model.querySelector('#model-help').textContent = '当前环境未能显示三维模型。可以按下方照片和对照表连接。';
}

if (scene && ink) {
  try {
    setup();
  } catch (error) {
    console.error('Wiring model could not start', error);
    usePhotos();
  }
} else {
  usePhotos();
}
