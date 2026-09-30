let store = {};
globalThis.localStorage = {
  getItem: k => k in store ? store[k] : null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
  clear: () => { store = {}; }
};

let last2D = null;
export function last2DContext() { return last2D; }

export function make2D(w, h) {
  const ops = { fill: 0, stroke: 0, text: 0, save: 0, restore: 0, strings: [] };
  const g = { addColorStop() {} };
  const ctx = {
    canvas: { width: w, height: h },
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left',
    createLinearGradient: () => g, createRadialGradient: () => g, createPattern: () => g,
    beginPath() {}, moveTo() {}, lineTo() {}, arcTo() {}, arc() {}, ellipse() {}, rect() {}, closePath() {},
    fill() { ops.fill++; }, stroke() { ops.stroke++; }, fillRect() { ops.fill++; }, strokeRect() { ops.stroke++; }, clearRect() {},
    fillText(t) { ops.text++; ops.strings.push(String(t)); }, strokeText() { ops.text++; }, measureText: () => ({ width: 10 }),
    save() { ops.save++; }, restore() { ops.restore++; }, translate() {}, rotate() {}, scale() {}, setTransform() {}, clip() {}, drawImage() { ops.fill++; },
    getImageData: (x, y, dw, dh) => ({ data: new Uint8ClampedArray(Math.max(4, dw * dh * 4)).fill(255), width: dw, height: dh }),
    putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), isPointInPath: () => false,
    __ops: ops
  };
  return ctx;
}

const mkEl = (tag) => ({
  tagName: tag, style: {}, children: [], clientWidth: 390, clientHeight: 844, parentElement: null, width: 300, height: 150,
  appendChild(c) { this.children.push(c); c.parentElement = this; return c; },
  removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
  addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
  getContext(kind) {
    if (kind === '2d') { last2D = make2D(this.width, this.height); return last2D; }
    return makeGL();
  },
  toBlob(cb) { cb({ size: 1024, type: 'image/png' }); }, focus() {}, remove() {}, click() {},
});

function makeGL() {
  const nums = { VERSION: 7938, SHADING_LANGUAGE_VERSION: 35724, VENDOR: 7936, RENDERER: 7937, MAX_TEXTURE_SIZE: 4096 };
  const t = {
    getParameter(p) {
      if (p === nums.VERSION) return 'WebGL 2.0 (stub)';
      if (p === nums.SHADING_LANGUAGE_VERSION) return 'WebGL GLSL ES 3.00';
      if (p === nums.VENDOR || p === nums.RENDERER) return 'stub';
      return 4096;
    },
    getExtension() { return { loseContext() {}, drawBuffersWEBGL() {}, MAX_TEXTURE_MAX_ANISOTROPY_EXT: 1 }; },
    getSupportedExtensions() { return []; },
    getShaderPrecisionFormat() { return { rangeMin: 127, rangeMax: 127, precision: 23 }; },
    getProgramParameter() { return true; }, getShaderParameter() { return true; },
    getProgramInfoLog() { return ''; }, getShaderInfoLog() { return ''; },
    getUniformLocation() { return {}; }, getAttribLocation() { return 0; }, getActiveUniform() { return null; },
    createShader() { return {}; }, createProgram() { return {}; }, createBuffer() { return {}; },
    createTexture() { return {}; }, createFramebuffer() { return {}; }, createRenderbuffer() { return {}; },
    createVertexArray() { return {}; }, isContextLost() { return false; },
    getContextAttributes() { return { antialias: true, alpha: false, depth: true, stencil: true }; },
  };
  return new Proxy(t, {
    get(o, p) {
      if (p in o) return o[p];
      if (typeof p === 'string' && /^[A-Z0-9_]+$/.test(p)) {
        if (!(p in nums)) nums[p] = Math.floor(Math.random() * 1e5) + 1000;
        return nums[p];
      }
      return () => undefined;
    }
  });
}

export function installStubs() {
  globalThis.btoa = s => Buffer.from(s, 'binary').toString('base64');
  globalThis.atob = s => Buffer.from(s, 'base64').toString('binary');
  globalThis.window = {
    devicePixelRatio: 2, innerWidth: 390, innerHeight: 844,
    addEventListener() {}, removeEventListener() {},
    setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: id => clearTimeout(id),
    cancelAnimationFrame: id => clearTimeout(id), requestAnimationFrame: f => setTimeout(f, 16)
  };
  globalThis.document = {
    createElement: mkEl, createElementNS: (_n, t) => mkEl(t),
    addEventListener() {}, removeEventListener() {}, hidden: false, body: mkEl('body')
  };
  globalThis.navigator = { userAgent: 'node', vibrate() {} };
  globalThis.self = globalThis.window;
  globalThis.HTMLCanvasElement = function () {};
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
}

export { mkEl };
