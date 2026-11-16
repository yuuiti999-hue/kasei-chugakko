(function(){
'use strict';
var T = window.THREE;
var $ = function(id){ return document.getElementById(id); };
var canvas = $('view');
var renderer;
try {
  if (!T) throw new Error('no three');
  renderer = new T.WebGLRenderer({canvas:canvas, antialias:true, powerPreference:'high-performance'});
} catch(e){ $('err').hidden = false; return; }

/* ---------- constants ---------- */
var DAY_SECONDS = 60;                 // 1 sol = 60 s
var EARTH_G = 9.81;
var V0 = Math.sqrt(2*EARTH_G*0.5);    // take-off speed of a 50 cm jump on Earth
var gravity = 3.73;

/* ---------- noise ---------- */
function hash2(ix, iz, seed){
  var h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z, seed){
  var ix = Math.floor(x), iz = Math.floor(z);
  var fx = x-ix, fz = z-iz;
  var u = fx*fx*fx*(fx*(fx*6-15)+10), v = fz*fz*fz*(fz*(fz*6-15)+10);
  var a = hash2(ix,iz,seed), b = hash2(ix+1,iz,seed), c = hash2(ix,iz+1,seed), d = hash2(ix+1,iz+1,seed);
  return (a + (b-a)*u + (c-a)*v + (a-b-c+d)*u*v)*2 - 1;
}
function lodW(lam, sp){ var t = (lam/sp - 2)/2; return t <= 0 ? 0 : t >= 1 ? 1 : t; }
/* rotated value noise: no axis-aligned square blotches when seen from above */
function rnoise(x, z, sc, ang, seed){ var c=Math.cos(ang), s=Math.sin(ang); return vnoise((x*c - z*s)/sc + .37, (x*s + z*c)/sc + .71, seed); }
function sstep(a, b, x){ var t = (x-a)/(b-a); t = t<0?0:t>1?1:t; return t*t*(3-2*t); }

/* ---------- terrain height (metres) ---------- */
var OCT = [[1600,55,1],[700,22,2],[300,9,3],[120,3.5,4],[50,1.4,5],[20,.5,6],[8,.16,7],[3,.05,8]];
function craters(x, z, sp, C, seed, rmin, rmax, prob){
  var cx = Math.floor(x/C), cz = Math.floor(z/C), h = 0;
  for (var i=-1;i<=1;i++) for (var j=-1;j<=1;j++){
    var gx = cx+i, gz = cz+j;
    if (hash2(gx,gz,seed) > prob) continue;
    var R = rmin + (rmax-rmin)*Math.pow(hash2(gx,gz,seed+1), 2.5);
    var w = lodW(R, sp); if (w <= 0) continue;
    var ox = (gx+.25+.5*hash2(gx,gz,seed+2))*C, oz = (gz+.25+.5*hash2(gx,gz,seed+3))*C;
    var dx = x-ox, dz = z-oz, d2 = dx*dx+dz*dz;
    if (d2 > R*R*4) continue;
    var d = Math.sqrt(d2)/R;
    var c = d < 1 ? R*0.16*(d*d-1) : 0;
    c += R*0.045*Math.exp(-((d-1)*(d-1))/0.06);
    h += c*w;
  }
  return h;
}
function Hraw(x, z, sp){
  var h = 0, i, o, w;
  for (i=0;i<OCT.length;i++){
    o = OCT[i]; w = lodW(o[0], sp);
    if (w > 0) h += vnoise(x/o[0], z/o[0], o[2])*o[1]*w;
  }
  // distant ridged highlands
  var m = vnoise(x/2600+.37, z/2600+.61, 20) - 0.15;
  if (m > 0){ var r = 1-Math.abs(vnoise(x/900, z/900, 21)); h += m*r*r*r*300; }
  // wind ripples / small dunes in sandy patches
  var dm = vnoise(x/400+.5, z/400+.5, 30) - 0.1;
  if (dm > 0){
    w = lodW(7, sp);
    if (w > 0) h += Math.min(dm,.5)*0.7*w*Math.sin((x*.8+z*.6)/7*6.2832 + vnoise(x/60,z/60,31)*4);
  }
  h += craters(x, z, sp, 160, 60, 6, 45, 0.55);
  h += craters(x, z, sp, 1500, 70, 120, 420, 0.5);
  return h;
}
var BASE = {x:-25, z:-37, y:0, rot:0.59};
BASE.y = Hraw(BASE.x, BASE.z, 0.4);
var LANDER = {x:BASE.x+40, z:BASE.z-30, y:0};          // 50 m from the base
var OPPY = {x:BASE.x-70, z:BASE.z+90, y:0};            // the stranded rover, a ~30 s walk away
LANDER.y = Hraw(LANDER.x, LANDER.z, 0.4);
function H(x, z, sp){
  var h = Hraw(x, z, sp), dx = x-BASE.x, dz = z-BASE.z, d2 = dx*dx+dz*dz;
  if (d2 < 3600) h += (BASE.y-h)*(1-sstep(30, 60, Math.sqrt(d2)));   // level pad for the base
  dx = x-LANDER.x; dz = z-LANDER.z; d2 = dx*dx+dz*dz;
  if (d2 < 900) h += (LANDER.y-h)*(1-sstep(10, 30, Math.sqrt(d2)));  // landing pad
  return h;
}
var INT = {x:BASE.x, z:BASE.z, y:600};                 // the interior lives far above the terrain, in its own pocket
var IND = { on:false, d:2.4, fade:1, zoom:1, rc:null };
function indoorY(lx, lz){                     // local coords inside the habitat
  if (lx > 1.7 && lx < 3.9 && lz < -2.0){      // the stairwell trench
    if (lz <= -10.0) return -5;
    return (lz + 2.0) / 8.0 * 5;
  }
  if (lz <= -10.8) return -5;                  // the farm level
  return 0;                                    // ground floor
}
function indoorCeil(lx, lz){                  // local y of the ceiling above a point
  if (lz <= -10.8) return -1.6;
  if (lx > 1.7 && lx < 3.9 && lz < -2.6) return lz > -5.0 ? 2.85 : indoorY(lx, lz) + 2.35;
  var r2 = lx*lx + lz*lz;
  return r2 < 9 ? 2.85 : 2.55;
}
/* 1F furniture + stairwell rails: oriented boxes {x,z,rot,half-width,half-depth} the player can't walk through */
var IND_OBS = [[-2.7,-3.5,.18,2.2,.55],[-4.0,1.9,-.55,1.2,.62],[-2.4,3.4,.3,1.4,.55],[4.7,-.4,-1.25,1.14,.33],
  [4.37,3.17,.94,1.14,.36],[4.73,-2.8,2.1,.65,.32],[-4.96,-1.56,-1.875,.2,.66],[-3.3,-5.0,.3,.25,.25],[-2.7,-5.4,-.2,.2,.2],
  [-2.1,5.2,0,.3,.3],
  [1.68,-6.4,0,.12,4.3],[3.92,-6.4,0,.12,4.3]];
function inObstacle(lx, lz){
  for (var i=0;i<IND_OBS.length;i++){
    var o = IND_OBS[i], dx = lx-o[0], dz = lz-o[1], c = Math.cos(o[2]), sn = Math.sin(o[2]);
    var u = dx*c - dz*sn, v = dx*sn + dz*c;
    if (Math.abs(u) < o[3]+.28 && Math.abs(v) < o[4]+.28) return true;
  }
  return false;
}
function inBed(lx, lz){                               // the three planting beds are solid (walk in the aisles)
  if (lz > -12.3 || lz < -21.7 || Math.abs(lx) > 5.95) return false;
  return Math.abs(lz+13.6) < 1.3 || Math.abs(lz+17.0) < 1.3 || Math.abs(lz+20.4) < 1.3;
}
function insideIndoor(lx, lz){ if (inBed(lx, lz) || inObstacle(lx, lz)) return false;
  if (lx*lx + lz*lz < 6.35*6.35) return true;                          // round room
  if (lx > 1.75 && lx < 3.85 && lz <= -2.0 && lz > -11.2) return true; // stairwell
  if (lx > -8.4 && lx < 8.4 && lz <= -10.8 && lz > -25.2) return true; // farm
  return false;
}
/* where the indoor camera may sit: the walkable rooms shrunk by a margin, so the lens never pokes through a wall */
function camInside(lx, lz){
  var ol = IND_OBS[3], odx = lx-ol[0], odz = lz-ol[1], oc = Math.cos(ol[2]), os = Math.sin(ol[2]);   // tall lockers
  if (Math.abs(odx*oc - odz*os) < ol[3]+.2 && Math.abs(odx*os + odz*oc) < ol[4]+.2) return false;
  if (lz > -10.6 && lx*lx+lz*lz < 5.7*5.7) return true;                      // 1F dome (hatch face is at r≈6.0)
  if (lx > 1.98 && lx < 3.62 && lz <= -1.9 && lz > -11.4) return true;      // stairwell between its side walls
  if (lx > -8.1 && lx < 8.1 && lz < -11.15 && lz > -24.85) return true;    // farm room
  return false;
}
function camCeil(lx, lz){ return lz < -11.0 ? -2.95 : indoorCeil(lx, lz) - .24; }   // farm: stay below the grow-light bars
function groundAt(x, z){
  if (IND.on) return INT.y + indoorY(x-INT.x, z-INT.z);
  return H(x, z, 0.4);
}

/* ---------- renderer / scene ---------- */
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.outputEncoding = T.sRGBEncoding;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;

var scene = new T.Scene();
scene.fog = new T.FogExp2(0xd8ab80, 0.0011);
var camera = new T.PerspectiveCamera(58, 1, 0.1, 14000);

/* ---------- sky ---------- */
var skyUni = { sunDir:{ value:new T.Vector3(0,1,0) }, storm:{value:0}, cloud:{value:0}, cloudOff:{ value:new T.Vector2() } };
var sky = new T.Mesh(new T.SphereGeometry(9000, 32, 16), new T.ShaderMaterial({
  uniforms: skyUni, side: T.BackSide, depthWrite:false, depthTest:false, fog:false,
  vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: [
    'precision highp float; varying vec3 vDir; uniform vec3 sunDir; uniform float storm; uniform float cloud; uniform vec2 cloudOff;',
    'float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
    'float ns(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);',
    '  return mix(mix(hsh(i), hsh(i+vec2(1,0)), f.x), mix(hsh(i+vec2(0,1)), hsh(i+vec2(1,1)), f.x), f.y); }',
    'float fbm(vec2 p){ float a = .5, s = 0.0; for (int i=0;i<4;i++){ s += a*ns(p); p = p*2.03+7.1; a *= .5; } return s; }',
    'void main(){',
    '  vec3 d = normalize(vDir); float h = sunDir.y;',
    '  float hz = pow(1.0-clamp(d.y,0.0,1.0), 3.0);',
    '  vec3 dayC = mix(vec3(.60,.45,.32), vec3(.86,.68,.50), hz);',   // butterscotch dust sky
    '  vec3 twC  = mix(vec3(.15,.15,.18), vec3(.37,.31,.28), hz);',   // dusky grey-brown
    '  vec3 ngC  = mix(vec3(.010,.012,.028), vec3(.030,.028,.040), hz);',
    '  vec3 col = mix(ngC, mix(twC, dayC, smoothstep(0.0,0.35,h)), smoothstep(-0.25,0.05,h));',
    '  float c = max(dot(d, sunDir), 0.0);',
    '  float tw = smoothstep(-0.30,-0.03,h)*(1.0-smoothstep(0.08,0.42,h));',
    '  col += vec3(.22,.48,.95)*tw*(pow(c,5.0)*.50 + pow(c,36.0)*.65);', // blue glow around the low sun
    '  col += vec3(1.0,.93,.82)*smoothstep(0.1,0.5,h)*pow(c,48.0)*.28;',
    '  float ang = length(d - sunDir);',
    '  float disc = smoothstep(0.0085, 0.0055, ang)*step(-0.01, d.y)*smoothstep(-0.06,0.0,h);',
    '  if (cloud > 0.01 && d.y > 0.02){',                                // thin, wind-drawn ice clouds
    '    vec2 uv = d.xz/(d.y+0.18)*1.3 + cloudOff;',
    '    float w = smoothstep(.42,.74, fbm(vec2(uv.x*.7+uv.y*.3, uv.y*1.05)))*smoothstep(0.02,0.28,d.y);',
    '    vec3 cc = mix(vec3(.06,.07,.10), mix(vec3(.62,.72,.92), vec3(.97,.92,.86), smoothstep(0.05,0.4,h)), smoothstep(-0.28,0.02,h));',
    '    col = mix(col, cc, w*cloud*.62);',
    '  }',
    '  float lum = .05 + .95*smoothstep(-0.2,0.25,h);',
    '  col = mix(col, vec3(.56,.36,.22)*lum, storm*.92);',                // airborne dust swallows the sky
    '  disc *= 1.0 - storm*.8;',
    '  col = mix(col, mix(vec3(.85,.93,1.0), vec3(1.0,.98,.93), smoothstep(0.1,0.4,h)), disc);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'].join('\n')
}));
sky.renderOrder = -2; sky.frustumCulled = false;
scene.add(sky);

var starGeo = new T.BufferGeometry();
(function(){
  var n = 1800, p = new Float32Array(n*3);
  for (var i=0;i<n;i++){
    var u = hash2(i,1,90)*2-1, a = hash2(i,2,90)*6.2832, s = Math.sqrt(1-u*u);
    p[i*3] = s*Math.cos(a)*8000; p[i*3+1] = u*8000; p[i*3+2] = s*Math.sin(a)*8000;
  }
  starGeo.setAttribute('position', new T.BufferAttribute(p, 3));
})();
var starMat = new T.PointsMaterial({color:0xffffff, size:1.7, sizeAttenuation:false, transparent:true, opacity:0, fog:false, depthWrite:false});
var stars = new T.Points(starGeo, starMat);
stars.renderOrder = -1; stars.frustumCulled = false;
scene.add(stars);
var SKY_AXIS = new T.Vector3(0,-0.47,0.88).normalize();

/* ---------- lights ---------- */
var sun = new T.DirectionalLight(0xffffff, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
var sc = sun.shadow.camera; sc.left=-45; sc.right=45; sc.top=45; sc.bottom=-45; sc.near=10; sc.far=400;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06;
scene.add(sun); scene.add(sun.target);
var hemi = new T.HemisphereLight(0xf2c08c, 0x5a3320, 0.6);
scene.add(hemi);

/* ---------- terrain mesh (dense near the player, coarse far away) ---------- */
var N = 224, HALF = N/2, RANGE = 2600, NEAR = 0.75, SNAP = 6;
var A = NEAR*HALF/RANGE;
var gx = new Float32Array(N+1), gs = new Float32Array(N+1);
(function(){
  for (var i=0;i<=N;i++){
    var u = (i-HALF)/HALF;
    gx[i] = RANGE*(A*u + (1-A)*u*u*u*u*u);
    gs[i] = RANGE*(A + 5*(1-A)*u*u*u*u)/HALF;
  }
})();
var VC = (N+1)*(N+1);
var tPos = new Float32Array(VC*3), tCol = new Float32Array(VC*3), tUv = new Float32Array(VC*2);
var tIdx = new Uint32Array(N*N*6);
(function(){
  var k = 0, i, j;
  for (j=0;j<=N;j++) for (i=0;i<=N;i++){ var v=(j*(N+1)+i)*3; tPos[v]=gx[i]; tPos[v+2]=gx[j]; }
  for (j=0;j<N;j++) for (i=0;i<N;i++){
    var a=j*(N+1)+i, b=a+1, c=a+N+1, d=c+1;
    tIdx[k++]=a; tIdx[k++]=c; tIdx[k++]=b; tIdx[k++]=b; tIdx[k++]=c; tIdx[k++]=d;
  }
})();
var tGeo = new T.BufferGeometry();
tGeo.setAttribute('position', new T.BufferAttribute(tPos,3));
tGeo.setAttribute('color', new T.BufferAttribute(tCol,3));
tGeo.setAttribute('uv', new T.BufferAttribute(tUv,2));
tGeo.setIndex(new T.BufferAttribute(tIdx,1));

function grainTexture(){
  var c = document.createElement('canvas'); c.width = c.height = 256;
  var g = c.getContext('2d'), im = g.createImageData(256,256), d = im.data;
  for (var y=0;y<256;y++) for (var x=0;x<256;x++){
    var n = 0.5*hash2(x,y,101) + 0.3*(vnoise(x/6,y/6,102)*.5+.5) + 0.2*(vnoise(x/24,y/24,103)*.5+.5);
    var v = 150 + n*105;
    if (hash2(x,y,104) > 0.992) v *= 0.55;           // scattered dark grit
    var k=(y*256+x)*4; d[k]=v; d[k+1]=v*.985; d[k+2]=v*.97; d[k+3]=255;
  }
  g.putImageData(im,0,0);
  var t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4;
  return t;
}
var grain = grainTexture(); grain.encoding = T.sRGBEncoding;
var grainBump = grainTexture();
var terrain = new T.Mesh(tGeo, new T.MeshStandardMaterial({
  vertexColors:true, roughness:1, metalness:0, map:grain, bumpMap:grainBump, bumpScale:0.014
}));
terrain.receiveShadow = true; terrain.castShadow = true; terrain.frustumCulled = false;
scene.add(terrain);

function lin(hex){ return new T.Color(hex).convertSRGBToLinear(); }
var C_OCHRE = lin(0xb9703f), C_DUST = lin(0xd39a66), C_DARK = lin(0x6a4030), C_ROCK = lin(0x4d362c);
var tCx = 1e9, tCz = 1e9;
/* stylised craters painted into the ground colours: a pale floor with a darker crescent on one side (no geometry) */
function craterTone(x, z){
  var cs = 13, ix = Math.floor(x/cs), iz = Math.floor(z/cs), t = 0;
  for (var a=-1;a<=1;a++) for (var b=-1;b<=1;b++){
    var cx = ix + a, cz = iz + b;
    if (hash2(cx, cz, 901) > .74) continue;
    var ox = (cx + .2 + .6*hash2(cx, cz, 902))*cs, oz = (cz + .2 + .6*hash2(cx, cz, 903))*cs, r = 1.1 + 2.5*hash2(cx, cz, 904)*hash2(cx, cz, 905) + .9*hash2(cx, cz, 904);
    var dx = x - ox, dz = z - oz, d = Math.sqrt(dx*dx + dz*dz);
    if (d < r) t = Math.max(t, Math.min(1, (r - d)/.35));
    else { var side = (dx*.7 + dz*.7)/d, w = r*(.12 + .22*Math.max(0, side)) + .25; if (d < r + w) t = Math.min(t, -Math.min(1, (r + w - d)/.3)); }
  }
  return t;
}
function rebuildTerrain(cx, cz){
  tCx = cx; tCz = cz;
  var i, j, v, x, z, sp, k;
  for (j=0;j<=N;j++){ z = cz+gx[j];
    for (i=0;i<=N;i++){
      k = j*(N+1)+i; x = cx+gx[i]; sp = gs[i] > gs[j] ? gs[i] : gs[j];
      tPos[k*3+1] = H(x, z, sp);
      tUv[k*2] = x/3; tUv[k*2+1] = z/3;
    }
  }
  tGeo.attributes.position.needsUpdate = true;
  tGeo.attributes.uv.needsUpdate = true;
  tGeo.computeVertexNormals();
  var nrm = tGeo.attributes.normal.array;
  for (j=0;j<=N;j++){ z = cz+gx[j];
    for (i=0;i<=N;i++){
      k = j*(N+1)+i; x = cx+gx[i]; v = k*3;
      var wx_ = x + 9*vnoise(x/45,z/45,47), wz_ = z + 9*vnoise(x/45+7.1,z/45,48);  // domain warp: breaks up the noise grid
      var a = sstep(-.25,.45, rnoise(wx_,wz_,260,.61,40) + .35*rnoise(wx_,wz_,37,1.13,41));   // dark basaltic sand
      var b = sstep(.0,.7, rnoise(wx_,wz_,520,.29,42) + .3*rnoise(wx_,wz_,14,2.03,43)); // pale settled dust
      var s = sstep(.93,.78, nrm[v+1]);                                               // steep = bare rock
      var r = C_OCHRE.r + (C_DARK.r-C_OCHRE.r)*a, g = C_OCHRE.g + (C_DARK.g-C_OCHRE.g)*a, bl = C_OCHRE.b + (C_DARK.b-C_OCHRE.b)*a;
      r += (C_DUST.r-r)*b*.7; g += (C_DUST.g-g)*b*.7; bl += (C_DUST.b-bl)*b*.7;
      r += (C_ROCK.r-r)*s; g += (C_ROCK.g-g)*s; bl += (C_ROCK.b-bl)*s;
      var ct = s > .5 ? 0 : craterTone(x, z);
      if (ct > 0){ r *= 1 + .06*ct; g *= 1 + .36*ct; bl *= 1 + .7*ct; } else if (ct < 0){ r *= 1 + .5*ct; g *= 1 + .55*ct; bl *= 1 + .55*ct; }   // floor: paler sand (red is already near its maximum, so lift green and blue)
      tCol[v]=r; tCol[v+1]=g; tCol[v+2]=bl;
    }
  }
  tGeo.attributes.color.needsUpdate = true;
  terrain.position.set(cx, 0, cz);
  placeRocks(cx, cz);
}

/* ---------- rocks ---------- */
var rockGeo = new T.IcosahedronGeometry(1, 1);
(function(){
  var p = rockGeo.attributes.position;
  for (var i=0;i<p.count;i++){
    var x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    var k = 1 + 0.22*Math.sin(x*5.1+y*3.3) + 0.18*Math.sin(y*6.7+z*4.1) + 0.15*Math.sin(z*5.9+x*2.7);
    p.setXYZ(i, x*k, y*k*.8, z*k);
  }
  rockGeo.computeVertexNormals();
})();
var MAX_ROCKS = 2400;
var rocks = new T.InstancedMesh(rockGeo, new T.MeshStandardMaterial({roughness:1, metalness:0, flatShading:true}), MAX_ROCKS);
rocks.castShadow = true; rocks.receiveShadow = true; rocks.frustumCulled = false;
scene.add(rocks);
var bigRocks = [], dummy = new T.Object3D(), rc = new T.Color();
function placeRocks(px, pz){
  var S = 5, RR = 115, n = 0;
  bigRocks.length = 0;
  var x0 = Math.floor((px-RR)/S), x1 = Math.floor((px+RR)/S), z0 = Math.floor((pz-RR)/S), z1 = Math.floor((pz+RR)/S);
  for (var a=x0;a<=x1 && n<MAX_ROCKS;a++) for (var b=z0;b<=z1 && n<MAX_ROCKS;b++){
    var x = (a+hash2(a,b,51))*S, z = (b+hash2(a,b,52))*S;
    var dx = x-px, dz = z-pz; if (dx*dx+dz*dz > RR*RR) continue;
    var bx = x-BASE.x, bz = z-BASE.z; if (bx*bx+bz*bz < 900) continue;
    bx = x-OPPY.x; bz = z-OPPY.z; if (bx*bx+bz*bz < 100) continue;
    bx = x-LANDER.x; bz = z-LANDER.z; if (bx*bx+bz*bz < 36) continue;
    var field = vnoise(x/150, z/150, 56)*.5+.5;
    if (hash2(a,b,50) > 0.12 + 0.6*field) continue;
    var s = 0.07 + 0.5*Math.pow(hash2(a,b,53), 3);
    if (hash2(a,b,54) < 0.035) s = 0.8 + 1.5*hash2(a,b,55);
    var y = groundAt(x, z) - s*0.25;
    dummy.position.set(x, y, z);
    dummy.rotation.set(hash2(a,b,57)*6.28, hash2(a,b,58)*6.28, hash2(a,b,59)*.6);
    dummy.scale.set(s*(.75+.6*hash2(a,b,61)), s*(.55+.4*hash2(a,b,62)), s*(.75+.6*hash2(a,b,63)));
    dummy.updateMatrix();
    rocks.setMatrixAt(n, dummy.matrix);
    var t = hash2(a,b,64);
    rc.setRGB(.10+.07*t, .065+.04*t, .05+.03*t);
    rocks.setColorAt(n, rc);
    if (s > 0.6) bigRocks.push({x:x, z:z, r:s*0.8, top:y+s*0.6});
    n++;
  }
  rocks.count = n;
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
}

/* ---------- characters: the meshes are made in Blender (tools/make_chara.py -> js/chara.js) ---------- */
var M_BLUE = new T.MeshStandardMaterial({color:0x3b8cff, emissive:0x2a7cff, emissiveIntensity:.9, roughness:.3});
function part(geo, mat){ var m = new T.Mesh(geo, mat); m.castShadow = true; return m; }
function decodeParts(C){
  var parts = {};
  function dec(b64){ var b = atob(b64), u = new Uint8Array(b.length); for (var i=0;i<b.length;i++) u[i] = b.charCodeAt(i); return u.buffer; }
  var P = new Int16Array(dec(C.P)), N = new Int8Array(dec(C.N)), I = new Uint16Array(dec(C.I));
  C.parts.forEach(function(p){
    parts[p.n] = { pivot:p.p, prims:p.g.map(function(g){
      var geo = new T.BufferGeometry(), pos = new Float32Array(g.vn*3), nor = new Float32Array(g.vn*3);
      for (var k=0;k<g.vn*3;k++){ pos[k] = P[g.v*3+k]/C.scale; nor[k] = N[g.v*3+k]/127; }
      geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setIndex(new T.BufferAttribute(I.slice(g.i, g.i + g['in']), 1));
      return { m:g.m, geo:geo };
    }) };
  });
  return parts;
}
var CHARA = decodeParts(window.CHARA), PROPS = window.PROPS ? decodeParts(window.PROPS) : {};
var CH_COL = { suit:0xfbf8f1, line:0x2fb5a8, pack:0x2fb5a8, grey:0xa9afbd, hand:0xa9afbd, skin:0xf7d2ad, hair:0x4a3226, eye:0x2a1c14, white:0xffffff,
  blush:0xf59a94, boot:0x7a8191, panel:0x39445c, red:0xff7a3a, yel:0xffd45a, glasses:0x30343f };
var SUIT_WHITE = 0xfbf8f1, SUIT_GOLD = 0xe9b530, CHARAS = [];
/* chest badges (drawn here, no image files): star / rocket / planet / school crest */
var EMBLEMS = [0, 1, 2, 3].map(function(i){
  var c = document.createElement('canvas'); c.width = c.height = 96; var g = c.getContext('2d');
  g.fillStyle = ['#2d4a9c', '#d9534f', '#3a3a44', '#2f8f6a'][i]; g.beginPath(); g.arc(48, 48, 46, 0, 7); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.arc(48, 48, 42, 0, 7); g.stroke(); g.fillStyle = '#ffd94a'; g.strokeStyle = '#fff';
  if (i === 0){ g.beginPath(); for (var k=0;k<10;k++){ var r = k%2 ? 13 : 30, a = -Math.PI/2 + k*Math.PI/5; g.lineTo(48 + Math.cos(a)*r, 50 + Math.sin(a)*r); } g.fill(); }
  if (i === 1){ g.fillStyle = '#fff'; g.beginPath(); g.moveTo(48, 16); g.quadraticCurveTo(66, 38, 60, 64); g.lineTo(36, 64); g.quadraticCurveTo(30, 38, 48, 16); g.fill();
    g.fillStyle = '#ffd94a'; g.beginPath(); g.moveTo(40, 64); g.lineTo(48, 82); g.lineTo(56, 64); g.fill(); g.fillStyle = '#3f9fd9'; g.beginPath(); g.arc(48, 40, 7, 0, 7); g.fill(); }
  if (i === 2){ g.fillStyle = '#e8743a'; g.beginPath(); g.arc(48, 48, 20, 0, 7); g.fill(); g.lineWidth = 5; g.strokeStyle = '#ffd94a'; g.beginPath(); g.ellipse(48, 48, 34, 10, -.4, 0, 7); g.stroke(); }
  if (i === 3){ g.fillStyle = '#fff'; g.font = '900 52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M', 48, 51); }
  var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.userData = { url:c.toDataURL() }; return t;
});
function makeChara(o){
  o = o || {};
  var mats = {}, k;
  for (k in CH_COL) mats[k] = new T.MeshStandardMaterial({ color:CH_COL[k], roughness:(k === 'eye' || k === 'glasses') ? .3 : .72 });
  mats.glass = new T.MeshStandardMaterial({ color:0xffffff, roughness:.05, transparent:true, opacity:.1, depthWrite:false }); mats.glass.userData.op = .1;
  mats.shine = new T.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:.6, depthWrite:false }); mats.shine.userData.op = .6;
  var root = new T.Group(), body = new T.Group(); root.add(body);
  function grp(name, parent, atZero){
    var p = CHARA[name], g = new T.Group(); if (!atZero) g.position.set(p.pivot[0], p.pivot[1], p.pivot[2]);
    p.prims.forEach(function(q){
      var me = new T.Mesh(q.geo, mats[q.m]); me.castShadow = q.m !== 'glass' && q.m !== 'shine';
      if (q.m === 'glass') me.renderOrder = 2; if (q.m === 'shine') me.renderOrder = 3; g.add(me);
    });
    (parent || body).add(g); return g;
  }
  var ch = { root:root, body:body, mats:mats, torso:grp('torso'), suitTop:grp('suitTop'), pack:grp('pack'),
    armL:grp('armL'), armR:grp('armR'), legL:grp('legL'), legR:grp('legR'), head:grp('head'), hair:{}, suitOn:true, gold:false, cloth:0x2fb5a8, blinkT:1 + Math.random()*3, face:'' };
  ch.eyes = grp('eyes', ch.head, true); ch.eyesShut = grp('eyesShut', ch.head, true); ch.mouth = grp('mouth', ch.head, true); ch.mouthO = grp('mouthO', ch.head, true);
  ch.glasses = grp('glasses', ch.head, true); ch.lash = grp('lash', ch.head, true); ch.lash.visible = false; ch.cap = grp('cap', ch.head, true); ch.cap.visible = false;
  ['bob', 'short', 'pony', 'spiky'].forEach(function(h){ ch.hair[h] = grp('hair_' + h, ch.head, true); });
  ch.helmet = new T.Group(); ch.helmet.position.copy(ch.head.position); body.add(ch.helmet); grp('glass', ch.helmet, true); grp('shine', ch.helmet, true);
  ch.eyesShut.visible = ch.mouthO.visible = false;
  ch.col = {}; for (k in CH_COL) ch.col[k] = CH_COL[k];
  ch.dim = 1;                                          // outdoors the sun is strong (intensity 2.4 + ACES), so mid-tone colours are darkened to stay saturated
  ch.paint = function(){
    for (var q in ch.col){
      var keep = q === 'white' || (q === 'suit' && ch.suitOn);
      mats[q].color.setHex(ch.col[q]).convertSRGBToLinear(); if (!keep) mats[q].color.multiplyScalar(ch.dim);   // colours are picked as sRGB
    }
  };
  ch.refresh = function(){
    var on = ch.suitOn;
    ch.helmet.visible = ch.pack.visible = ch.suitTop.visible = on; if (ch.emb) ch.emb.visible = on && ch.embOn;
    ch.col.suit = on ? (ch.gold ? SUIT_GOLD : SUIT_WHITE) : ch.cloth;
    mats.suit.metalness = on && ch.gold ? .3 : 0; mats.suit.roughness = on && ch.gold ? .35 : .72;
    ch.col.hand = on ? CH_COL.grey : ch.col.skin; ch.col.boot = on ? CH_COL.boot : 0xffffff;
    ch.paint();
  };
  ch.setDim = function(f){ if (ch.dim !== f){ ch.dim = f; ch.paint(); } };
  ch.setSuit = function(on){ ch.suitOn = on; ch.refresh(); };
  ch.setGold = function(b){ ch.gold = !!b; ch.refresh(); };
  ch.setCloth = function(hex){ ch.cloth = hex; ch.refresh(); };
  ch.setLine = function(hex){ ch.col.line = ch.col.pack = hex; ch.paint(); };
  ch.setSkin = function(hex){ ch.col.skin = hex; ch.refresh(); };
  ch.setHair = function(style, hex){ for (var h in ch.hair) ch.hair[h].visible = h === style; if (hex != null){ ch.col.hair = hex; ch.paint(); } };
  ch.setGlasses = function(b){ ch.glasses.visible = !!b; };
  ch.setLash = function(b){ ch.lash.visible = !!b; };
  ch.setCap = function(b){ ch.cap.visible = !!b; };
  ch.emb = new T.Mesh(new T.CircleGeometry(.075, 24), new T.MeshBasicMaterial({ map:EMBLEMS[0], transparent:true }));   // badge on the chest of the suit
  ch.emb.position.set(-.185, .81, .212); ch.emb.rotation.set(-.42, -.55, 0); ch.torso.add(ch.emb); ch.embOn = false;
  ch.setEmblem = function(i){ ch.embOn = i != null && i >= 0; if (ch.embOn) ch.emb.material.map = EMBLEMS[i]; ch.emb.visible = ch.embOn && ch.suitOn; };
  ch.setFace = function(f){ ch.face = f || ''; ch.mouth.visible = f !== 'o'; ch.mouthO.visible = f === 'o'; if (f === 'shut'){ ch.eyes.visible = false; ch.eyesShut.visible = true; } else { ch.eyes.visible = true; ch.eyesShut.visible = false; } };
  ch.setMouth = function(open){ ch.mouth.visible = !open; ch.mouthO.visible = !!open; };
  ch.blink = function(dt){
    if (ch.face === 'shut') return;
    ch.blinkT -= dt;
    var shut = ch.blinkT < .11; ch.eyes.visible = !shut; ch.eyesShut.visible = shut;
    if (ch.blinkT < 0) ch.blinkT = 1.6 + Math.random()*3.6;
  };
  ch.setHair(o.hair || 'bob', o.hairCol); ch.setGlasses(o.glasses); if (o.skin != null) ch.col.skin = o.skin;
  if (o.line != null) ch.setLine(o.line); if (o.cloth != null) ch.cloth = o.cloth;
  ch.refresh(); CHARAS.push(ch); return ch;
}
/* head-and-shoulders picture of a character, rendered from the same model (used for the dialogue icons and the character maker) */
var PORT = null;
function portrait(o, size){
  if (!PORT){
    var cv = document.createElement('canvas'), r = new T.WebGLRenderer({ canvas:cv, alpha:true, antialias:true, preserveDrawingBuffer:true });
    r.outputEncoding = T.sRGBEncoding; r.setPixelRatio(1);
    var sc = new T.Scene(), cm = new T.PerspectiveCamera(22, 1, .1, 20); cm.position.set(0, 1.3, 3.7); cm.lookAt(0, 1.21, 0);
    sc.add(new T.HemisphereLight(0xffffff, 0xb9a898, 1.0)); var dl = new T.DirectionalLight(0xffffff, .55); dl.position.set(-1.5, 2.5, 3); sc.add(dl);
    var c = makeChara({}); CHARAS.pop(); c.root.rotation.y = .2; sc.add(c.root);
    PORT = { cv:cv, r:r, sc:sc, cm:cm, c:c };
  }
  var hex = function(v){ return typeof v === 'string' ? parseInt(v.slice(1), 16) : v; }, c2 = PORT.c;
  c2.setHair(o.style, hex(o.hair)); c2.setGlasses(o.glasses); c2.setLash(o.lash); c2.setCap(o.cap); c2.setLine(hex(o.line || o.shirt)); c2.cloth = hex(o.shirt); c2.gold = !!o.gold; c2.setSkin(hex(o.skin)); c2.setSuit(!!o.suit); c2.setEmblem(o.emblem);
  if (o.wide){ PORT.cm.position.set(0, 1.12, 5.0); PORT.cm.lookAt(0, 1.02, 0); } else { PORT.cm.position.set(0, 1.3, 3.7); PORT.cm.lookAt(0, 1.21, 0); }
  PORT.r.setSize(size, size, false); PORT.r.render(PORT.sc, PORT.cm);
  return PORT.cv.toDataURL('image/png');
}
/* small picture of any object (used for the furniture buttons); shares the portrait renderer */
function thumb(obj, size){
  if (!PORT) portrait({ style:'bob', hair:0x4a3226, skin:0xf7d2ad, shirt:0x2fb5a8 }, 64);
  if (!PORT.ts){ PORT.ts = new T.Scene(); PORT.ts.add(new T.HemisphereLight(0xffffff, 0xcfc4b8, 1.75)); var d = new T.DirectionalLight(0xffffff, .7); d.position.set(-2, 4, 3); PORT.ts.add(d); PORT.tc = new T.PerspectiveCamera(24, 1, .05, 40); }
  var par = obj.parent; PORT.ts.add(obj); obj.updateMatrixWorld(true);
  var bb = new T.Box3().setFromObject(obj), c = bb.getCenter(new T.Vector3()), sz = bb.getSize(new T.Vector3()), r = Math.max(sz.x, sz.y, sz.z)*.5 + .06, dist = r/Math.tan(12*Math.PI/180)*1.08;
  PORT.tc.position.set(c.x + dist*.42, c.y + dist*.42, c.z + dist*.8); PORT.tc.lookAt(c);
  PORT.r.setSize(size, size, false); PORT.r.render(PORT.ts, PORT.tc);
  var url = PORT.cv.toDataURL('image/png'); PORT.ts.remove(obj); if (par) par.add(obj); return url;
}
var player = makeChara({ hair:'bob' });
var astro = player.root, body = player.body, armL = player.armL, armR = player.armR, legL = player.legL, legR = player.legR, helmet = player.helmet, back = player.pack;
var M_SUIT = player.mats.suit, M_GREY = player.mats.grey;
var lamp = new T.PointLight(0xfff0d8, 0, 16, 2); lamp.position.set(0,2.3,-.9); astro.add(lamp);
scene.add(astro);


/* ---------- surface base (habitat, solar field, rover, comms, ascent vehicle) ---------- */
var solids = [];
var M_CANVAS = new T.MeshStandardMaterial({color:0xe6dfd2, roughness:.92});
var M_FRAME = new T.MeshStandardMaterial({color:0x8d939c, roughness:.5, metalness:.6});
var M_ORANGE = new T.MeshStandardMaterial({color:0xdc6f28, roughness:.7});
var M_DARKM = new T.MeshStandardMaterial({color:0x22252c, roughness:.6, metalness:.3});
var M_SOLAR = new T.MeshStandardMaterial({color:0x14285a, roughness:.22, metalness:.75});
var M_SOLAR_FIELD = new T.MeshStandardMaterial({color:0x7a5a40, roughness:.95, metalness:0});   // starts dusty
var M_WIN = new T.MeshStandardMaterial({color:0x403528, emissive:0xffcf8a, emissiveIntensity:0, roughness:.4});
var M_BEACON = new T.MeshStandardMaterial({color:0x401010, emissive:0xff3020, emissiveIntensity:0});
var M_DISH = new T.MeshStandardMaterial({color:0xd9d9d6, roughness:.6, metalness:.2, side:T.DoubleSide});
var base = new T.Group();
base.position.set(BASE.x, BASE.y, BASE.z); base.rotation.y = BASE.rot;
scene.add(base);
function bm(parent, geo, mat, x, y, z){
  var m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function solid(lx, lz, r){
  var c = Math.cos(BASE.rot), s = Math.sin(BASE.rot);
  solids.push({x:BASE.x + lx*c + lz*s, z:BASE.z - lx*s + lz*c, r:r});
}
function dome(parent, R, wallH, x, z){
  bm(parent, new T.CylinderGeometry(R, R*1.04, wallH, 28), M_CANVAS, x, wallH/2, z);
  var roof = bm(parent, new T.SphereGeometry(R, 28, 10, 0, 6.2832, 0, 1.5708), M_CANVAS, x, wallH, z); roof.scale.y = .4;
  var ring = bm(parent, new T.TorusGeometry(R*1.045, .16, 8, 36), M_FRAME, x, .16, z); ring.rotation.x = 1.5708;
  var ring2 = bm(parent, new T.TorusGeometry(R*1.005, .1, 8, 36), M_FRAME, x, wallH, z); ring2.rotation.x = 1.5708;
  var n = Math.round(R*1.7);
  for (var i=0;i<n;i++){
    var a = i/n*6.2832;
    var rib = bm(parent, new T.BoxGeometry(.16, wallH, .26), M_FRAME, x+Math.sin(a)*R*1.02, wallH/2, z+Math.cos(a)*R*1.02); rib.rotation.y = a;
    if (i < n/2){ var arc = bm(parent, new T.TorusGeometry(R*1.003, .07, 6, 24, 3.1416), M_FRAME, x, wallH, z); arc.scale.y = .4; arc.rotation.y = a; }
    var win = bm(parent, new T.CylinderGeometry(.36, .36, .14, 16), M_WIN, x+Math.sin(a+.26)*R*1.0, wallH*.62, z+Math.cos(a+.26)*R*1.0);
    win.rotation.x = 1.5708; win.rotation.z = -(a+.26); win.castShadow = false;
  }
}
// main habitat + annex, joined by a tunnel
dome(base, 7, 3, 0, 0);           solid(0, 0, 7.7);
dome(base, 3.6, 2.6, 17, 0);      solid(17, 0, 4.2);
var tun = bm(base, new T.CylinderGeometry(1.2, 1.2, 7, 16), M_CANVAS, 10.4, 1.35, 0); tun.rotation.z = 1.5708;
for (var ti=0; ti<3; ti++){ var tr = bm(base, new T.TorusGeometry(1.24, .08, 6, 20), M_FRAME, 8.6+ti*1.8, 1.35, 0); tr.rotation.y = 1.5708; }
solid(9.5, 0, 1.5); solid(11.8, 0, 1.5);
// airlock facing the landing site
bm(base, new T.BoxGeometry(2.8, 2.7, 3.6), M_CANVAS, 0, 1.35, 8.4);
bm(base, new T.BoxGeometry(3.0, .14, 3.7), M_FRAME, 0, 2.76, 8.4);
bm(base, new T.BoxGeometry(1.7, 2.25, .1), M_ORANGE, 0, 1.2, 10.2);
bm(base, new T.BoxGeometry(1.2, 1.9, .1), M_DARKM, 0, 1.1, 10.25);
var port = bm(base, new T.CylinderGeometry(.24, .24, .06, 14), M_WIN, 0, 1.55, 10.31); port.rotation.x = 1.5708;
var ramp = bm(base, new T.BoxGeometry(1.7, .1, 1.5), M_FRAME, 0, .1, 11.0); ramp.rotation.x = .13;
bm(base, new T.BoxGeometry(.5, .16, .2), M_WIN, 0, 2.5, 10.25);
solid(0, 8.8, 2.3);
var doorLight = new T.PointLight(0xffd9a8, 0, 26, 2); doorLight.position.set(0, 3.1, 11.2); base.add(doorLight);
// solar field
var panelGeo = new T.BoxGeometry(2.3, .07, 1.35), postGeo = new T.CylinderGeometry(.06, .06, 1.1, 8), frameGeo = new T.BoxGeometry(2.4, .05, .08);
for (var pr=0; pr<3; pr++) for (var pc=0; pc<5; pc++){
  var px = -24 + pc*2.7, pz = -3 + pr*3.4;
  bm(base, postGeo, M_FRAME, px, .55, pz);
  var pn = bm(base, panelGeo, M_SOLAR_FIELD, px, 1.2, pz); pn.rotation.x = .45;
  var pf = bm(base, frameGeo, M_FRAME, px, 1.2, pz); pf.rotation.x = .45;
}
bm(base, new T.BoxGeometry(.9, .8, .7), M_FRAME, -10.5, .4, 0.4); solid(-10.5, 0.4, .9);
var cable = bm(base, new T.BoxGeometry(3, .06, .08), M_DARKM, -8.7, .03, 0.4); cable.castShadow = false;
// rover
var R = (function(){
  var c = Math.cos(BASE.rot), s = Math.sin(BASE.rot), lx = 9.5, lz = 14;
  return { x:BASE.x + lx*c + lz*s, z:BASE.z - lx*s + lz*c, heading:BASE.rot-.7, speed:0, driving:false, view:'over',
           moved:false, declined:false, saveDist:6.5, pitch:0, roll:0, puffT:0, prevBrk:false };
})();
var VMAX = 30/3.6;                                  // 30 km/h
var rover = new T.Group(); rover.rotation.order = 'YXZ'; scene.add(rover);
var roverLight = new T.PointLight(0xfff2dc, 0, 32, 2); roverLight.position.set(0, 1.7, 4.6); rover.add(roverLight);
bm(rover, new T.BoxGeometry(2.3, 1.25, 4.4), M_CANVAS, 0, 1.45, 0);
bm(rover, new T.BoxGeometry(2.34, .22, 4.44), M_ORANGE, 0, 1.0, 0);
bm(rover, new T.BoxGeometry(2.0, .55, .06), M_DARKM, 0, 1.72, 2.21);
bm(rover, new T.BoxGeometry(.06, .45, 1.3), M_DARKM, 1.16, 1.7, 1.2);
bm(rover, new T.BoxGeometry(.06, .45, 1.3), M_DARKM, -1.16, 1.7, 1.2);
bm(rover, new T.BoxGeometry(1.9, .12, 2.2), M_SOLAR, 0, 2.16, -.8);
bm(rover, new T.BoxGeometry(2.0, .3, 4.0), M_FRAME, 0, .75, 0);
var wheelGeo = new T.CylinderGeometry(.58, .58, .46, 18);
[-1.55, 0, 1.55].forEach(function(wz){ [-1.3, 1.3].forEach(function(wx){
  var w = bm(rover, wheelGeo, M_DARKM, wx, .58, wz); w.rotation.z = 1.5708;
  var hub = bm(rover, new T.CylinderGeometry(.26, .26, .48, 12), M_FRAME, wx, .58, wz); hub.rotation.z = 1.5708;
}); });
bm(rover, new T.BoxGeometry(.3, .16, .05), M_WIN, .75, 1.2, 2.22); bm(rover, new T.BoxGeometry(.3, .16, .05), M_WIN, -.75, 1.2, 2.22);
bm(rover, new T.CylinderGeometry(.02, .02, 1.6, 6), M_FRAME, .8, 2.9, -1.6);
// comms: dish + beacon mast
bm(base, new T.CylinderGeometry(.12, .16, 2.6, 10), M_FRAME, -9, 1.3, -9);
var dish = bm(base, new T.SphereGeometry(2.6, 24, 8, 0, 6.2832, 0, .62), M_DISH, -9, 3.2, -9);
dish.rotation.set(2.3, 0, .3); dish.position.y = 4.9;
bm(base, new T.CylinderGeometry(.03, .03, 1.5, 6), M_FRAME, -9, 3.4, -9).rotation.x = -.84;
solid(-9, -9, .6);
bm(base, new T.CylinderGeometry(.07, .1, 10, 8), M_FRAME, 5, 5, -10.5);
bm(base, new T.BoxGeometry(.9, .06, .06), M_FRAME, 5, 8.6, -10.5);
bm(base, new T.SphereGeometry(.16, 10, 8), M_BEACON, 5, 10.1, -10.5).castShadow = false;
solid(5, -10.5, .5);
var flood = new T.PointLight(0xdfe8ff, 0, 45, 2); flood.position.set(5, 8.4, -10.5); base.add(flood);
// tanks + cargo
var tankGeo = new T.CylinderGeometry(.75, .75, 3.2, 18), capGeo = new T.SphereGeometry(.75, 18, 10);
[0, 1.9, 3.8].forEach(function(o, i){
  var tk = bm(base, tankGeo, i === 1 ? M_ORANGE : M_CANVAS, 14, .95, -9-o); tk.rotation.z = 1.5708;
  bm(base, capGeo, i === 1 ? M_ORANGE : M_CANVAS, 15.6, .95, -9-o); bm(base, capGeo, i === 1 ? M_ORANGE : M_CANVAS, 12.4, .95, -9-o);
  bm(base, new T.BoxGeometry(2.4, .3, .5), M_FRAME, 14, .15, -9-o);
  solid(13, -9-o, 1.1); solid(15, -9-o, 1.1);
});
[[-4,12.5,1.1,.4],[-5.4,12.2,.8,-.3],[-4.3,13.9,.7,.9],[4.6,-12.6,1.0,.2]].forEach(function(c){
  bm(base, new T.BoxGeometry(c[2], c[2]*.8, c[2]), c[3] > .5 ? M_ORANGE : M_FRAME, c[0], c[2]*.4, c[1]).rotation.y = c[3];
  solid(c[0], c[1], c[2]*.75);
});
// ascent vehicle, parked well away from the habitat
var lander = new T.Group(); lander.position.set(LANDER.x, groundAt(LANDER.x, LANDER.z)-.15, LANDER.z); scene.add(lander);
bm(lander, new T.CylinderGeometry(1.5, 2.5, 5, 16), M_CANVAS, 0, 4.6, 0);
bm(lander, new T.CylinderGeometry(2.52, 2.55, .5, 16), M_ORANGE, 0, 2.4, 0);
bm(lander, new T.ConeGeometry(1.5, 2.6, 16), M_CANVAS, 0, 8.4, 0);
bm(lander, new T.CylinderGeometry(.6, 1.1, 1.2, 14, 1, true), M_DISH, 0, 1.5, 0);
bm(lander, new T.CylinderGeometry(.3, .3, .1, 12), M_WIN, 0, 5.4, 1.86).rotation.x = 1.5708;
// landing legs: each one hangs from under the skirt and splays out to a foot pad, braced by a strut from the hull
function rod(parent, ax, ay, az, bx, by, bz, r, mat){
  var dx = bx-ax, dy = by-ay, dz = bz-az, L = Math.hypot(dx, dy, dz);
  var m = bm(parent, new T.CylinderGeometry(r, r, L, 10), mat, (ax+bx)/2, (ay+by)/2, (az+bz)/2);
  m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0), new T.Vector3(dx/L, dy/L, dz/L));
  return m;
}
for (var lg=0; lg<4; lg++){
  var la = lg*1.5708+.785, sx = Math.sin(la), sz = Math.cos(la);
  rod(lander, sx*2.2, 2.3, sz*2.2, sx*3.85, .3, sz*3.85, .11, M_FRAME);            // main leg
  rod(lander, sx*1.0, 1.0, sz*1.0, sx*3.0, 1.25, sz*3.0, .06, M_FRAME);            // brace from the hull to mid-leg
  bm(lander, new T.CylinderGeometry(.18, .18, .4, 10), M_DISH, sx*2.3, 2.05, sz*2.3);  // hinge / shock absorber
  var pad = bm(lander, new T.CylinderGeometry(.5, .58, .14, 16), M_FRAME, sx*3.9, .17, sz*3.9);
  pad.rotation.set(0, 0, 0);
}
solids.push({x:LANDER.x, z:LANDER.z, r:3.2});
var flame = new T.Mesh(new T.ConeGeometry(1.0, 5.5, 14), new T.MeshBasicMaterial({color:0xffb45e, transparent:true, opacity:.85, fog:false, depthWrite:false}));
flame.rotation.x = Math.PI; flame.position.y = -1.6; flame.visible = false; lander.add(flame);
// the three candidate landing sites shown from orbit
var SITES = [null, {x:LANDER.x, z:LANDER.z}, {x:LANDER.x+95, z:LANDER.z+105}];
(function(){
  var best = -1, bx = LANDER.x-150, bz = LANDER.z-120;
  for (var a=0;a<24;a++) for (var r=130;r<=250;r+=40){
    var an = a/24*6.2832, x = LANDER.x+Math.sin(an)*r, z = LANDER.z+Math.cos(an)*r;
    if (Math.hypot(x-BASE.x, z-BASE.z) < 90 || Math.hypot(x-SITES[2].x, z-SITES[2].z) < 120) continue;
    var sl = Math.hypot(H(x+6,z,6)-H(x-6,z,6), H(x,z+6,6)-H(x,z-6,6));
    if (sl > best){ best = sl; bx = x; bz = z; }
  }
  SITES[0] = {x:bx, z:bz};
  var bm2 = new T.MeshStandardMaterial({color:0x3a2a22, roughness:1, flatShading:true});
  for (var i=0;i<11;i++){
    var sc = 2.6 + 4*hash2(i,1,400), x2 = SITES[2].x + (hash2(i,2,400)-.5)*46, z2 = SITES[2].z + (hash2(i,3,400)-.5)*46;
    var b = new T.Mesh(rockGeo, bm2); b.position.set(x2, groundAt(x2,z2)-sc*.25, z2);
    b.rotation.set(hash2(i,4,400)*6, hash2(i,5,400)*6, 0); b.scale.set(sc, sc*.8, sc*1.1);
    b.castShadow = true; b.receiveShadow = true; scene.add(b);
    solids.push({x:x2, z:z2, r:sc*.85});
  }
  for (i=0;i<3;i++){
    SITES[i].y = groundAt(SITES[i].x, SITES[i].z);
    var ring = new T.Mesh(new T.TorusGeometry(26, 1.1, 8, 48), new T.MeshBasicMaterial({color:0xff7a2a, fog:false, toneMapped:false}));
    ring.rotation.x = Math.PI/2; ring.position.set(SITES[i].x, SITES[i].y+3, SITES[i].z); ring.visible = false; scene.add(ring);
    SITES[i].ring = ring;
  }
})();


/* ---------- life-support stations for missions 7-11 ---------- */
function baseToWorld(lx, lz){
  var c = Math.cos(BASE.rot), s2 = Math.sin(BASE.rot);
  return { x:BASE.x + lx*c + lz*s2, z:BASE.z - lx*s2 + lz*c };
}
var M_GLASS_O2 = new T.MeshStandardMaterial({color:0x6fb8ff, roughness:.15, metalness:.1, transparent:true, opacity:.6, emissive:0x1d4f80, emissiveIntensity:0});
var M_GLASS_H2 = new T.MeshStandardMaterial({color:0xe8f0ff, roughness:.15, metalness:.1, transparent:true, opacity:.55, emissive:0x40506a, emissiveIntensity:0});
var M_WATER    = new T.MeshStandardMaterial({color:0x3f8fd8, roughness:.1, metalness:.1, transparent:true, opacity:.7, emissive:0x10345a, emissiveIntensity:0});
var M_RUNLAMP  = new T.MeshStandardMaterial({color:0x123018, emissive:0x3dff6a, emissiveIntensity:0});
var M_HEAT     = new T.MeshStandardMaterial({color:0x3a1a0a, emissive:0xff6a1e, emissiveIntensity:0, roughness:.4});
// water electrolysis unit (next to the tank farm)
var electro = new T.Group(); electro.position.set(8.6, 0, -6.4); base.add(electro);
bm(electro, new T.BoxGeometry(1.5, 1.0, 1.0), M_CANVAS, 0, .5, 0);
bm(electro, new T.BoxGeometry(1.54, .14, 1.04), M_ORANGE, 0, .95, 0);
var o2col = bm(electro, new T.CylinderGeometry(.16, .16, .95, 18), M_GLASS_O2, -.35, 1.5, 0);
var h2col = bm(electro, new T.CylinderGeometry(.16, .16, .95, 18), M_GLASS_H2, .35, 1.5, 0);
bm(electro, new T.CylinderGeometry(.2,.2,.06,18), M_FRAME, -.35, 1.98, 0); bm(electro, new T.CylinderGeometry(.2,.2,.06,18), M_FRAME, .35, 1.98, 0);
bm(electro, new T.SphereGeometry(.06,10,8), M_RUNLAMP, .55, .82, .52).castShadow = false;
bm(electro, new T.BoxGeometry(.5,.3,.04), M_DARKM, -.2, .62, .52);
var M_GAS_O2 = new T.MeshStandardMaterial({color:0x2f8cff, emissive:0x1b5fd0, emissiveIntensity:.8, roughness:.4});
var M_GAS_H2 = new T.MeshStandardMaterial({color:0xf4f8ff, emissive:0x9fb2d0, emissiveIntensity:.5, roughness:.4});
var o2fill = bm(electro, new T.CylinderGeometry(.13, .13, .9, 16), M_GAS_O2, -.35, 1.05, 0); o2fill.castShadow = false;
var h2fill = bm(electro, new T.CylinderGeometry(.13, .13, .9, 16), M_GAS_H2, .35, 1.05, 0); h2fill.castShadow = false;
o2fill.geometry.translate(0, .45, 0); h2fill.geometry = o2fill.geometry;   // grow upward from the bottom of each tube
o2fill.scale.y = h2fill.scale.y = .001;
var EL_POS = baseToWorld(8.6, -6.4); solid(8.6, -6.4, 1.1);
// water maker (hydrogen + CO2 -> water + methane)
var sabat = new T.Group(); sabat.position.set(8.6, 0, -12.6); base.add(sabat);
var reactor = bm(sabat, new T.CylinderGeometry(.42, .42, 1.6, 22), M_FRAME, 0, .75, 0); reactor.rotation.z = 1.5708;
for (var hc=0; hc<4; hc++){ var coil = bm(sabat, new T.TorusGeometry(.45, .04, 8, 22), M_HEAT, -.55 + hc*.36, .75, 0); coil.rotation.y = 1.5708; coil.castShadow = false; }
bm(sabat, new T.BoxGeometry(1.8, .12, .9), M_FRAME, 0, .06, 0);
var wtank = bm(sabat, new T.CylinderGeometry(.38, .38, 1.0, 22), M_WATER, 0, .62, 1.0);
bm(sabat, new T.CylinderGeometry(.06,.06,.9,10), M_FRAME, 0, .9, .5).rotation.x = 1.5708;
bm(sabat, new T.SphereGeometry(.06,10,8), M_RUNLAMP.clone(), .85, .5, .45).castShadow = false;
var SB_POS = baseToWorld(8.6, -12.6); solid(8.6, -12.6, 1.2); solid(8.6, -11.6, .6);
var SOLAR_POS = baseToWorld(-18.6, .4);
var COMMS_POS = baseToWorld(-9, -9);
var DISH_ROT0 = dish.rotation.x;
// seed case waiting in the rocket
var seedCase = new T.Group();
bm(seedCase, new T.BoxGeometry(.6, .4, .45), M_ORANGE, 0, .2, 0);
bm(seedCase, new T.BoxGeometry(.62, .06, .47), M_FRAME, 0, .41, 0);
bm(seedCase, new T.BoxGeometry(.22, .04, .02), M_CANVAS, 0, .22, .235);
seedCase.position.set(0, .12, 3.3); lander.add(seedCase);
var ROCKET_POS = {x:LANDER.x, z:LANDER.z + 3.3};
var carryCase = seedCase.clone(); carryCase.scale.setScalar(.55); carryCase.position.set(.36, .3, .18); carryCase.visible = false;
var LETTUCE_BEDS = [];

/* ---------- the stranded rover (Opportunity-like), half buried in dust ---------- */
var oppyMats = {
  panel: new T.MeshStandardMaterial({color:0x6a5340, roughness:.95}),              // dust-covered
  body:  new T.MeshStandardMaterial({color:0xb8a98f, roughness:.8}),
  dark:  new T.MeshStandardMaterial({color:0x2b2d33, roughness:.6, metalness:.4}),
  lamp:  new T.MeshStandardMaterial({color:0x3a1210, emissive:0xff4422, emissiveIntensity:0})
};
var oppy = new T.Group();
OPPY.y = groundAt(OPPY.x, OPPY.z);
oppy.position.set(OPPY.x, OPPY.y - .35, OPPY.z);
oppy.rotation.set(.1, 2.2, .07);
scene.add(oppy);
(function(){
  function om(geo, mat, x, y, z){ var m = new T.Mesh(geo, mat); m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true; oppy.add(m); return m; }
  om(new T.BoxGeometry(1.1,.5,1.5), oppyMats.body, 0, .72, 0);
  om(new T.BoxGeometry(2.3,.07,2.0), oppyMats.panel, 0, 1.0, 0);                   // main solar wing
  om(new T.BoxGeometry(1.0,.06,1.3), oppyMats.panel, -1.5, .98, .1).rotation.z = .12;
  om(new T.BoxGeometry(1.0,.06,1.3), oppyMats.panel, 1.5, .98, -.1).rotation.z = -.12;
  om(new T.CylinderGeometry(.05,.05,1.0,8), oppyMats.dark, 0, 1.5, -.5);           // camera mast
  om(new T.BoxGeometry(.5,.16,.14), oppyMats.dark, 0, 2.0, -.5);
  var wg = new T.CylinderGeometry(.26,.26,.2,14);
  [-.9,0,.9].forEach(function(wz){ [-.72,.72].forEach(function(wx){
    om(wg, oppyMats.dark, wx, .26, wz).rotation.z = 1.5708;
  }); });
  om(new T.SphereGeometry(.07,10,8), oppyMats.lamp, .3, .99, .7);
})();
var oppyDust = new T.Mesh(new T.SphereGeometry(2.2, 20, 10, 0, 6.2832, 0, 1.2),
  new T.MeshStandardMaterial({color:0x8a5a35, roughness:1}));
oppyDust.scale.set(1, .42, 1); oppyDust.position.set(OPPY.x, OPPY.y - .25, OPPY.z);
oppyDust.receiveShadow = true; scene.add(oppyDust);
solids.push({x:OPPY.x, z:OPPY.z, r:2.4});

/* ---------- habitat interior: ground floor + stairs + underground farm ---------- */
var interior = new T.Group();
interior.position.set(INT.x, INT.y, INT.z);
interior.visible = false;
scene.add(interior);
var intLights = [], lettuce = [], tomato = [], growT = 0, intShadow = [];
var M_TOMATO = new T.MeshStandardMaterial({color:0xe0301e, roughness:.35});

/* ---------- interior materials: canvas textures so nothing reads as a bare box ---------- */
function cvs(n, draw){
  var c = document.createElement('canvas'); c.width = c.height = n;
  draw(c.getContext('2d'), n);
  var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; return t;
}
function speckle(g, n, amt, base){
  var im = g.getImageData(0,0,n,n), d = im.data;
  for (var i=0;i<d.length;i+=4){
    var v = (Math.random()-.5)*amt;
    d[i] = Math.max(0,Math.min(255,d[i]+v)); d[i+1] = Math.max(0,Math.min(255,d[i+1]+v)); d[i+2] = Math.max(0,Math.min(255,d[i+2]+v));
  }
  g.putImageData(im,0,0);
}
var TEX_FLOOR = cvs(256, function(g,n){
  g.fillStyle = '#767c84'; g.fillRect(0,0,n,n);
  g.strokeStyle = '#5b6168'; g.lineWidth = 5;
  g.strokeRect(2.5,2.5,n-5,n-5);
  g.strokeStyle = '#868d95'; g.lineWidth = 2;
  for (var i=1;i<4;i++){ g.beginPath(); g.moveTo(i*n/4,6); g.lineTo(i*n/4,n-6); g.stroke(); }
  g.fillStyle = '#4e535a';
  [[18,18],[n-18,18],[18,n-18],[n-18,n-18]].forEach(function(p){ g.beginPath(); g.arc(p[0],p[1],4.5,0,6.3); g.fill(); });
  speckle(g,n,16);
});
var TEX_FLOOR_B = cvs(256, function(g,n){                       // bump: the panel seams
  g.fillStyle = '#b0b0b0'; g.fillRect(0,0,n,n);
  g.strokeStyle = '#303030'; g.lineWidth = 6; g.strokeRect(3,3,n-6,n-6);
  speckle(g,n,26);
});
var TEX_WALL = cvs(256, function(g,n){
  g.fillStyle = '#ddd7cb'; g.fillRect(0,0,n,n);
  for (var y=0;y<n;y+=32){
    g.fillStyle = y % 64 ? 'rgba(0,0,0,.035)' : 'rgba(255,255,255,.05)';
    g.fillRect(0,y,n,32);
    g.strokeStyle = 'rgba(120,112,98,.45)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0,y+.5); g.lineTo(n,y+.5); g.stroke();
  }
  g.fillStyle = 'rgba(120,112,98,.5)';
  for (y=8;y<n;y+=32) for (var x=8;x<n;x+=16) g.fillRect(x,y,3,1.6);
  speckle(g,n,10);
});
var TEX_SOIL = cvs(256, function(g,n){
  g.fillStyle = '#4b3527'; g.fillRect(0,0,n,n);
  for (var i=0;i<2600;i++){
    var r = 1+Math.random()*3.4, l = 30+Math.random()*55;
    g.fillStyle = 'rgba('+Math.round(l+28)+','+Math.round(l+8)+','+Math.round(l-6)+',.75)';
    g.beginPath(); g.arc(Math.random()*n, Math.random()*n, r, 0, 6.3); g.fill();
  }
  speckle(g,n,22);
});
var TEX_GRATE = cvs(256, function(g,n){
  g.fillStyle = '#3f444b'; g.fillRect(0,0,n,n);
  g.strokeStyle = '#767d86'; g.lineWidth = 7;
  for (var i=0;i<n;i+=32){ g.beginPath(); g.moveTo(i+16,0); g.lineTo(i+16,n); g.stroke(); }
  g.strokeStyle = '#5a6069'; g.lineWidth = 4;
  for (i=0;i<n;i+=64){ g.beginPath(); g.moveTo(0,i+32); g.lineTo(n,i+32); g.stroke(); }
  speckle(g,n,16);
});
var TEX_HAZ = cvs(128, function(g,n){
  g.fillStyle = '#e8b22a'; g.fillRect(0,0,n,n);
  g.fillStyle = '#2a2622'; g.lineWidth = 0;
  for (var i=-n;i<n*2;i+=36){ g.beginPath(); g.moveTo(i,0); g.lineTo(i+18,0); g.lineTo(i+18-n,n); g.lineTo(i-n,n); g.fill(); }
  speckle(g,n,14);
});
function tex(t, rx, ry){ var c = t.clone(); c.needsUpdate = true; c.wrapS = c.wrapT = T.RepeatWrapping; c.repeat.set(rx, ry); return c; }
TEX_FLOOR.encoding = TEX_WALL.encoding = TEX_SOIL.encoding = TEX_GRATE.encoding = TEX_HAZ.encoding = T.sRGBEncoding;

var M_PANEL   = new T.MeshStandardMaterial({map:tex(TEX_WALL,3,1.4), color:0xffffff, roughness:.92});
var M_PANEL_IN= new T.MeshStandardMaterial({map:tex(TEX_WALL,7,1.1), color:0xffffff, roughness:.92, side:T.BackSide});
var M_PANEL_2 = new T.MeshStandardMaterial({map:tex(TEX_WALL,5,4), color:0xeae4d8, roughness:.95, side:T.DoubleSide});
var M_FLOOR   = new T.MeshStandardMaterial({map:tex(TEX_FLOOR,4,4), bumpMap:tex(TEX_FLOOR_B,4,4), bumpScale:.03, roughness:.66, metalness:.09});
var M_STEP    = new T.MeshStandardMaterial({map:tex(TEX_GRATE,1.6,.5), roughness:.55, metalness:.35});
var M_GRATE   = new T.MeshStandardMaterial({map:tex(TEX_GRATE,10,9), roughness:.55, metalness:.35});
var M_SOIL    = new T.MeshStandardMaterial({map:tex(TEX_SOIL,7,1), roughness:1});
var M_HAZ     = new T.MeshStandardMaterial({map:tex(TEX_HAZ,8,1), roughness:.8});
var M_LEAF    = new T.MeshStandardMaterial({color:0x72c247, roughness:.62});
var M_LEAF2   = new T.MeshStandardMaterial({color:0x4e9a31, roughness:.66});
var M_GROW    = new T.MeshStandardMaterial({color:0x2a1030, emissive:0xff4fce, emissiveIntensity:.6, roughness:.4});
var M_STRIP   = new T.MeshStandardMaterial({color:0x50483c, emissive:0xfff0d8, emissiveIntensity:1.25, roughness:.5});
var M_SCREEN  = new T.MeshStandardMaterial({color:0x0d1a24, emissive:0x2e6f8f, emissiveIntensity:.75, roughness:.25});
var M_METAL   = new T.MeshStandardMaterial({color:0x9aa1ab, roughness:.42, metalness:.65});
var M_RUBBER  = new T.MeshStandardMaterial({color:0x262a30, roughness:.85});
var M_GLASSY  = new T.MeshPhysicalMaterial ? new T.MeshStandardMaterial({color:0xbfe4ff, roughness:.12, metalness:.1, transparent:true, opacity:.45}) : M_METAL;
/* colour pass for the rounded, friendly look: pale floor and walls, light metal */
M_FLOOR.color.setRGB(2.3, 2.15, 1.95); M_FLOOR.bumpScale = .008; M_FLOOR.metalness = 0; M_FLOOR.roughness = .85;
M_PANEL.color.setRGB(.96, .9, .8); M_PANEL_IN.color.setRGB(1.06, 1.02, .95); M_PANEL_2.color.setRGB(.98, .92, .82);
M_GRATE.color.setRGB(1.7, 1.65, 1.6); M_GRATE.metalness = .1; M_STEP.color.setRGB(1.7, 1.65, 1.6); M_STEP.metalness = .1;
M_METAL.color.setHex(0xb4bcc9); M_METAL.metalness = .15; M_METAL.roughness = .55; M_RUBBER.color.setHex(0x565c68);
M_SOIL.color.setRGB(1.5, 1.35, 1.2); M_STRIP.emissiveIntensity = .8;

/* rounded-edge primitives, so nothing shows a hard CG corner */
function rrect(w, h, r){
  var sh = new T.Shape(), x = -w/2, y = -h/2;
  sh.moveTo(x+r, y);
  sh.lineTo(x+w-r, y); sh.quadraticCurveTo(x+w, y, x+w, y+r);
  sh.lineTo(x+w, y+h-r); sh.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  sh.lineTo(x+r, y+h); sh.quadraticCurveTo(x, y+h, x, y+h-r);
  sh.lineTo(x, y+r); sh.quadraticCurveTo(x, y, x+r, y);
  return sh;
}
function slabG(w, h, d, r){
  var g = new T.ExtrudeGeometry(rrect(w, h, Math.min(r || .05, Math.min(w,h)/2.2)),
    {depth:d, bevelEnabled:true, bevelSize:.014, bevelThickness:.014, bevelSegments:2, curveSegments:5, steps:1});
  g.translate(0, 0, -d/2); g.computeVertexNormals(); return g;
}
function boxG(w, h, d, r){ var g = slabG(w, d, h, r); g.rotateX(-Math.PI/2); return g; }
function im(geo, mat, x, y, z, parent){
  var m = new T.Mesh(geo, mat); m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true;
  (parent||interior).add(m); return m;
}
/* Blender-made props (tools/make_props.py): plain rounded shapes in a small friendly palette */
var PROP_HEX = { wood:0xd0a56c, woodDark:0xb58a52, white:0xf6f1e8, cream:0xf3e8d4, blue:0x5b8fd9, orange:0xff8a1e, grey:0x9aa0ad, black:0x30343f, pot:0xd97b4a, green:0x4caf6a, green2:0x63c47e, green3:0x3f9a5a,
  metal:0xc9cfd8, skyblue:0x86c5ee, red:0xe2384a, yellow:0xf2c230, steel:0xc5d0dc, soil:0x6b4a35 }, PROP_MAT = {};
function propMat(n){
  if (!PROP_MAT[n]) PROP_MAT[n] = n === 'screen' ? M_SCREEN : new T.MeshStandardMaterial({ color:new T.Color(PROP_HEX[n] != null ? PROP_HEX[n] : 0xff00ff).convertSRGBToLinear().multiplyScalar(.7), roughness:n === 'metal' ? .4 : .8, metalness:n === 'metal' ? .3 : 0 });
  return PROP_MAT[n];
}
function propIn(parent, name, x, y, z, ry){
  var o = new T.Group(); PROPS[name].prims.forEach(function(q){ var m = new T.Mesh(q.geo, propMat(q.m)); m.castShadow = q.m !== 'screen'; m.receiveShadow = true; o.add(m); });
  o.position.set(x || 0, y || 0, z || 0); if (ry) o.rotation.y = ry; parent.add(o); return o;
}
function ptLight(x, y, z, power, col, dist){
  var pl = new T.PointLight(col || 0xffeedb, 0, dist || 20, 2);
  pl.position.set(x,y,z); pl.userData.base = power; interior.add(pl); intLights.push(pl); return pl;
}
function spot(x, y, z, tx, tz, power, col, ang){
  var sp = new T.SpotLight(col || 0xfff3e2, 0, 26, ang || 1.0, .7, 1.4);
  sp.position.set(x,y,z);
  sp.target.position.set(tx, y-4, tz); interior.add(sp.target);
  sp.castShadow = true; sp.shadow.mapSize.set(768,768);
  sp.shadow.camera.near = .4; sp.shadow.camera.far = 20; sp.shadow.bias = -.0012; sp.shadow.normalBias = .03;
  sp.userData.base = power; interior.add(sp); intLights.push(sp); intShadow.push(sp); return sp;
}
(function(){
  /* ========== ground floor ========== */
  var R0 = 6.5;
  var sh = new T.Shape();
  sh.moveTo(1.7, Math.sqrt(R0*R0 - 1.7*1.7));
  sh.absarc(0, 0, R0, Math.atan2(Math.sqrt(R0*R0-1.7*1.7), 1.7), Math.atan2(Math.sqrt(R0*R0-3.9*3.9), 3.9) + 6.2832, false);
  sh.lineTo(3.9, 2.0); sh.lineTo(1.7, 2.0);
  var fg = new T.ShapeGeometry(sh, 72);
  fg.rotateX(-1.5708);
  (function(){                                     // planar UVs so the floor texture tiles properly
    var p = fg.attributes.position, uv = [];
    for (var i=0;i<p.count;i++) uv.push(p.getX(i)/3.2, p.getZ(i)/3.2);
    fg.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  })();
  var fl = new T.Mesh(fg, M_FLOOR); fl.receiveShadow = true; interior.add(fl);
  // skirting + hazard stripe around the stairwell opening
  im(boxG(2.4,.1,.16,.03), M_HAZ, 2.8, .055, 1.98);
  im(boxG(.16,.1,4.6,.03), M_HAZ, 1.62, .055, -.3);
  im(boxG(.16,.1,4.6,.03), M_HAZ, 3.98, .055, -.3);
  // shell
  im(new T.CylinderGeometry(R0, R0, 3.0, 64, 1, true), M_PANEL_IN, 0, 1.5, 0).castShadow = false;
  var dm = im(new T.SphereGeometry(R0, 64, 20, 0, 6.2832, 0, 1.5708), M_PANEL_IN, 0, 3.0, 0);
  dm.scale.y = .44; dm.castShadow = false;
  im(new T.TorusGeometry(R0-.04, .07, 10, 64), M_METAL, 0, 3.0, 0).rotation.x = 1.5708;
  im(new T.TorusGeometry(R0-.02, .09, 10, 64), M_METAL, 0, .05, 0).rotation.x = 1.5708;
  for (var a2=0; a2<14; a2++){
    var an = a2/14*6.2832;
    im(boxG(.13, 3.0, .2, .04), M_METAL, Math.sin(an)*(R0-.09), 1.5, Math.cos(an)*(R0-.09)).rotation.y = an;
    var arc = im(new T.TorusGeometry(R0-.06, .05, 8, 40, 3.1416), M_METAL, 0, 3.0, 0);
    arc.scale.y = .44; arc.rotation.y = an;
  }
  // porthole windows with a hint of the red sky outside
  for (a2=0; a2<5; a2++){
    var aw = -1.0 + a2*.5;
    im(new T.CylinderGeometry(.34,.34,.1,24), M_METAL, Math.sin(aw)*(R0-.06), 1.85, Math.cos(aw)*(R0-.06)).rotation.set(1.5708,0,-aw);
    var gl = im(new T.CylinderGeometry(.27,.27,.04,24), new T.MeshStandardMaterial({color:0xc06a3c, emissive:0x97502a, emissiveIntensity:.8, roughness:.3}),
      Math.sin(aw)*(R0-.12), 1.85, Math.cos(aw)*(R0-.12));
    gl.rotation.set(1.5708,0,-aw); gl.castShadow = false;
  }
  // ceiling light ring + fittings
  var ring = im(new T.TorusGeometry(4.4, .055, 10, 72), M_STRIP, 0, 2.62, 0);
  ring.rotation.x = 1.5708; ring.castShadow = false;
  for (a2=0; a2<6; a2++){ var ar = a2/6*6.2832; im(new T.CylinderGeometry(.03,.03,.5,8), M_METAL, Math.sin(ar)*4.4, 2.86, Math.cos(ar)*4.4); }
  /* ---- airlock hatch ---- */
  var hatch = new T.Group(); hatch.position.set(0, 0, 6.24); interior.add(hatch);
  im(boxG(2.5, 2.6, .22, .08), M_METAL, 0, 1.3, .06, hatch);
  im(boxG(2.1, 2.2, .14, .06), M_ORANGE, 0, 1.2, -.02, hatch);
  im(boxG(1.45, 1.95, .1, .05), M_DARKM, 0, 1.08, -.1, hatch);
  var port = im(new T.CylinderGeometry(.26,.26,.12,24), M_METAL, 0, 1.55, -.14, hatch); port.rotation.x = 1.5708;
  var portg = im(new T.CylinderGeometry(.2,.2,.05,24), new T.MeshStandardMaterial({color:0xb5572c, emissive:0x8a441f, emissiveIntensity:.9, roughness:.3}), 0, 1.55, -.2, hatch);
  portg.rotation.x = 1.5708; portg.castShadow = false;
  im(new T.TorusGeometry(.2,.035,8,20), M_METAL, .62, 1.0, -.16, hatch).rotation.y = 1.5708;
  im(boxG(.9,.16,.1,.03), M_HAZ, 0, 2.72, -.02, hatch);
  im(boxG(1.1,.02,.6,.01), M_HAZ, 0, .02, -.6);
  /* ---- work station ---- */
  var wk = new T.Group(); wk.position.set(-2.7, 0, -3.5); wk.rotation.y = .18; interior.add(wk);
  propIn(wk, 'ws');
  /* ---- bunk ---- */
  var bk = new T.Group(); bk.position.set(-4.0, 0, 1.9); bk.rotation.y = -.55; interior.add(bk);
  propIn(bk, 'sofa');                                  // this corner is re-dressed for each lesson (school.js: dress())
  interior.userData.spot = bk;
  /* ---- table + stools ---- */
  var tb = new T.Group(); tb.position.set(-2.4, 0, 3.4); tb.rotation.y = .3; interior.add(tb);
  propIn(tb, 'rtable');
  /* ---- lockers and supply crates ---- */
  var lk = new T.Group(); lk.position.set(4.7, 0, -.4); lk.rotation.y = -1.25; interior.add(lk);
  propIn(lk, 'lockers');
  /* ---- galley (kitchen): counter, sink, water dispenser, food warmer ---- */
  var gl2 = new T.Group(); gl2.position.set(4.37, 0, 3.17); gl2.rotation.y = .94; interior.add(gl2);
  propIn(gl2, 'galley');
  /* ---- life-support rack (makes / cleans the air and recycles water) ---- */
  var ls = new T.Group(); ls.position.set(4.73, 0, -2.8); ls.rotation.y = 2.1; interior.add(ls);
  propIn(ls, 'lifesup');
  /* ---- exercise bike (bones and muscles weaken in low gravity) ---- */
  var bkx = new T.Group(); bkx.position.set(-4.96, 0, -1.56); bkx.rotation.y = -1.875; interior.add(bkx);
  propIn(bkx, 'bike');
  /* ---- supply crates ---- */
  [[-3.3,-5.0,.5,.3,1],[-2.7,-5.4,.4,-.2,0]].forEach(function(c){
    var cr = im(boxG(c[2],c[2]*.82,c[2],.04), c[4] ? M_ORANGE : M_FRAME, c[0], c[2]*.41, c[1]);
    cr.rotation.y = c[3];
    im(boxG(c[2]*.55,.03,c[2]*.1,.01), M_PANEL, c[0]+Math.cos(c[3])*.02, c[2]*.6, c[1]+Math.sin(c[3])*.02).rotation.y = c[3];
  });
  /* ---- plumbing overhead ---- */
  for (var p2=0; p2<3; p2++){
    var pipe = im(new T.CylinderGeometry(.11,.11,11.6,16), M_METAL, -4.4+p2*.42, 2.46 - p2*.05, 0);
    pipe.rotation.x = 1.5708; pipe.castShadow = false;
    for (var cl=0; cl<4; cl++) im(new T.TorusGeometry(.14,.03,8,16), M_FRAME, -4.4+p2*.42, 2.46 - p2*.05, -4.5+cl*3).rotation.y = 1.5708;
  }
  im(new T.CylinderGeometry(.28,.28,1.3,20), M_METAL, -4.9, 2.0, 2.6).rotation.z = .2;
  /* ========== stairwell ========== */
  var tread = boxG(1.95,.1,.62,.02), riser = boxG(1.95,.46,.07,.02);
  for (var st2=0; st2<13; st2++){
    var t1 = (st2+1)/13, z0 = -2.0 - (st2/13)*8, y0 = -t1*5;
    im(tread, M_STEP, 2.8, y0, z0-.3);
    im(riser, M_PANEL, 2.8, y0+.23, z0-.62);
  }
  im(boxG(.2, 5.6, 9.0, .05), M_PANEL, 1.68, -2.7, -6.3);
  im(boxG(.2, 5.6, 9.0, .05), M_PANEL, 3.92, -2.7, -6.3);
  [1.86, 3.74].forEach(function(rx){
    var rail = im(new T.CylinderGeometry(.045,.045,9.5,12), M_METAL, rx, -1.52, -6.2);
    rail.rotation.x = 1.5708 - .558;
    for (var pz=0; pz<5; pz++){
      var zz = -2.6 - pz*1.9, yy = -(zz+2.0)/8*5;
      im(new T.CylinderGeometry(.035,.035,.95,10), M_METAL, rx, yy+.48, zz);
    }
  });
  ptLight(2.8, -1.3, -4.6, .5, 0xffeedb, 10);
  ptLight(2.8, -4.2, -9.2, .45, 0xffeedb, 10);
  /* ========== farm level ========== */
  var fy = -5;
  var ffl = im(boxG(17.0, .25, 14.6), M_GRATE, 0, fy-.12, -18.0); ffl.castShadow = false;
  im(new T.BoxGeometry(17.0,.16,14.6), M_PANEL_2, 0, fy+3.42, -18.0).castShadow = false;
  im(boxG(.22,3.55,14.6,.04), M_PANEL, -8.5, fy+1.75, -18.0).castShadow = false;
  im(boxG(.22,3.55,14.6,.04), M_PANEL, 8.5, fy+1.75, -18.0).castShadow = false;
  im(boxG(17.0,3.55,.22,.04), M_PANEL, 0, fy+1.75, -25.2).castShadow = false;
  im(boxG(10.2,3.55,.22,.04), M_PANEL, -3.4, fy+1.75, -10.8).castShadow = false;
  im(boxG(4.6,3.55,.22,.04), M_PANEL, 6.2, fy+1.75, -10.8).castShadow = false;
  im(boxG(17.0,.12,.2,.03), M_HAZ, 0, fy+.06, -10.72);
  // ribs across the ceiling
  for (var rb=0; rb<7; rb++) im(boxG(17.0,.14,.16,.03), M_METAL, 0, fy+3.3, -11.4 - rb*2.2).castShadow = false;
  // water tank + pumps
  propIn(interior, 'tank', -7.0, fy, -23.3);
  im(new T.CylinderGeometry(.07,.07,5.4,12), M_METAL, -7.0, fy+2.4, -20.6).rotation.x = 1.5708;
  propIn(interior, 'pump', 7.1, fy, -23.4); propIn(interior, 'barrel', 6.6, fy, -21.6);
  // planting beds
  var bedTray = boxG(11.2,.46,1.9,.07), bedSoil = boxG(10.7,.16,1.45,.03), bar = boxG(10.7,.12,.72,.05);
  for (var b2=0; b2<3; b2++){
    var bz = -13.6 - b2*3.4;
    propIn(interior, 'planter', 0, fy, bz); propIn(interior, 'planterPosts', 0, fy, bz);
    im(bedSoil, M_SOIL, 0, fy+.52, bz);
    im(bar, M_GROW, 0, fy+2.45, bz).castShadow = false;
    ptLight(0, fy+2.25, bz, .32, 0xff79da, 6);
    for (var c2=0; c2<7; c2++){
      var lx2 = -4.5 + c2*1.5, g2 = new T.Group();
      if (b2 === 2){                                     // mini tomato plants brought down from the rocket
        g2.position.set(lx2, fy+.6, bz); g2.scale.setScalar(.001); g2.visible = false; interior.add(g2);
        var stem = new T.Mesh(new T.CylinderGeometry(.025, .035, .75, 8), M_LEAF2); stem.position.y = .37; g2.add(stem);
        for (var tf=0; tf<9; tf++){
          var ta = tf/9*6.2832, th = .25 + (tf%3)*.2;
          var fol = new T.Mesh(new T.SphereGeometry(.15, 10, 8), tf%2 ? M_LEAF2 : M_LEAF);
          fol.position.set(Math.sin(ta)*.17, th, Math.cos(ta)*.17); fol.scale.set(1.2,.7,1.2); fol.castShadow = false;   // 63 leaf blobs: skip shadows to keep the farm fast g2.add(fol);
        }
        for (var tr=0; tr<6; tr++){
          var tra = tr/6*6.2832 + .4;
          var fr = new T.Mesh(new T.SphereGeometry(.06, 12, 10), M_TOMATO);
          fr.position.set(Math.sin(tra)*.24, .22 + (tr%3)*.17, Math.cos(tra)*.24); g2.add(fr);
        }
        tomato.push(g2);
        continue;
      }
      g2.position.set(lx2, fy+.6, bz); g2.scale.setScalar(.001); g2.visible = false;
      interior.add(g2);
      // layered lettuce head: darker outer leaves, pale heart
      for (var ly=0; ly<3; ly++){
        var cnt = [8,6,4][ly], rr0 = [.36,.23,.11][ly], hh = [.05,.16,.25][ly], sz = [.27,.22,.16][ly];
        for (var le=0; le<cnt; le++){
          var ang = le/cnt*6.2832 + ly*.7;
          var leaf = new T.Mesh(new T.SphereGeometry(sz, 12, 9), ly ? M_LEAF : M_LEAF2);
          leaf.position.set(Math.sin(ang)*rr0, hh, Math.cos(ang)*rr0);
          leaf.scale.set(1.3, .62 + ly*.14, 1.05);
          leaf.rotation.set(-.25 + ly*.12, ang, .2 - ly*.06);
          leaf.castShadow = true;
          g2.add(leaf);
        }
      }
      lettuce.push(g2);
    }
    LETTUCE_BEDS.push({x:INT.x, z:INT.z + bz});
  }
  // seedling trays and tools by the wall
  propIn(interior, 'seedtray', -7.2, fy, -12.6); propIn(interior, 'seedtray', 7.2, fy, -12.6);
  /* ---- lighting ---- */
  spot(0, 2.7, 0, 0, 0, 1.5, 0xfff3e2, 1.05);
  ptLight(-3.2, 2.0, -2.4, .35);
  ptLight(2.6, 2.0, 2.6, .3);
  spot(0, fy+3.25, -17.0, 0, -17.0, 1.2, 0xf2f6ff, 1.1);
  ptLight(0, fy+2.7, -23.0, .45, 0xfff0dc, 13);
  ptLight(0, fy+2.7, -11.6, .35, 0xfff0dc, 13);
})();
var FARM = {x:INT.x, z:INT.z - 13.6};
var DOOR = {x:BASE.x + Math.sin(BASE.rot)*11.6, z:BASE.z + Math.cos(BASE.rot)*11.6};
var INDOOR_DOOR = {x:INT.x, z:INT.z + 5.6};

/* ---------- dust puffs ---------- */
var puffTex = (function(){
  var c = document.createElement('canvas'); c.width = c.height = 64;
  var g = c.getContext('2d'), gr = g.createRadialGradient(32,32,2,32,32,32);
  gr.addColorStop(0,'rgba(255,255,255,.9)'); gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0,0,64,64);
  return new T.CanvasTexture(c);
})();
var puffs = [], puffI = 0;
for (var pi=0; pi<28; pi++){
  var sp = new T.Sprite(new T.SpriteMaterial({map:puffTex, transparent:true, opacity:0, depthWrite:false}));
  sp.visible = false; scene.add(sp);
  puffs.push({s:sp, life:0, max:1, vx:0, vy:0, vz:0, size:.3});
}
function puff(x, y, z, size, spread){
  var p = puffs[puffI++ % puffs.length];
  p.s.position.set(x, y+.05, z); p.life = p.max = .9 + Math.random()*.7; p.size = size;
  p.vx = (Math.random()-.5)*spread; p.vz = (Math.random()-.5)*spread; p.vy = .25 + Math.random()*.4;
  p.s.visible = true;
}


/* ---------- weather ---------- */
var wx = { mode:'auto', storm:0, cloud:0, wind:4, dir:1, wvx:0, wvz:0, temp:-60, pres:7.6, clk:0, hud:0, devils:0 };
function solPlan(n){                       // 0 clear, 1 thin cloud, 2 dust storm
  if (n <= 3) return n-1;
  var r = hash2(n, 7, 300); return r < .22 ? 2 : r < .55 ? 1 : 0;
}
// wind-blown dust near the ground
var DN = 1400, dPos = new Float32Array(DN*3), dH = new Float32Array(DN);
for (var di=0; di<DN; di++){ dPos[di*3] = (Math.random()-.5)*60; dPos[di*3+2] = (Math.random()-.5)*60; dH[di] = .1 + Math.pow(Math.random(),1.6)*9; }
var dGeo = new T.BufferGeometry(); dGeo.setAttribute('position', new T.BufferAttribute(dPos, 3));
var dMat = new T.PointsMaterial({map:puffTex, size:.16, transparent:true, opacity:0, depthWrite:false});
var dustPts = new T.Points(dGeo, dMat); dustPts.frustumCulled = false; scene.add(dustPts);
// dust devils
var devilTex = (function(){
  var c = document.createElement('canvas'); c.width = 128; c.height = 256;
  var g = c.getContext('2d'), im = g.createImageData(128,256), d = im.data;
  for (var y=0;y<256;y++) for (var x=0;x<128;x++){
    var n = .5+.5*vnoise(x/128*6 + y/40, y/26, 320), n2 = .5+.5*vnoise(x/128*14 - y/30, y/9, 321);
    var edge = Math.sin(y/255*Math.PI);                                   // fade at foot and top
    var a = Math.pow(n*.65+n2*.35, 1.6)*Math.pow(edge,.5);
    var k = (y*128+x)*4; d[k]=255; d[k+1]=255; d[k+2]=255; d[k+3]=Math.min(255, a*330);
  }
  // make the noise wrap horizontally
  g.putImageData(im,0,0);
  var t = new T.CanvasTexture(c); t.wrapS = T.MirroredRepeatWrapping; t.repeat.x = 2; return t;
})();
function devilGeo(rt, rb){
  var g = new T.CylinderGeometry(rt, rb, 46, 18, 10, true); g.translate(0, 23, 0);
  var p = g.attributes.position;
  for (var i=0;i<p.count;i++){ var y = p.getY(i); p.setX(i, p.getX(i) + Math.sin(y/46*2.6)*2.2); }
  return g;
}
var devils = [];
for (var dv=0; dv<3; dv++){
  var dg = new T.Group(), mats = [];
  [[3.6,.7],[2.3,.4]].forEach(function(r){
    var m = new T.MeshBasicMaterial({map:devilTex, transparent:true, opacity:0, depthWrite:false, side:T.DoubleSide});
    var me = new T.Mesh(devilGeo(r[0], r[1]), m); dg.add(me); mats.push(m);
  });
  dg.visible = false; scene.add(dg);
  devils.push({g:dg, mats:mats, life:0, max:1, scale:1});
}
var COMPASS = ['北','北東','東','南東','南','南西','西','北西'];
function updateWeather(dt){
  wx.clk += dt;
  var ts = 0, tc = 0, plan = solPlan(sol), h = sunDir.y, twi = 1 - sstep(.1,.45,Math.abs(h));
  if (wx.mode === 'auto'){
    if (plan === 2) ts = sstep(.3,.4,tDay)*(1-sstep(.82,.92,tDay));
    tc = plan === 1 ? .45+.45*twi : .12*twi;
  } else if (wx.mode === 'storm') ts = 1;
  else if (wx.mode === 'cloud') tc = .9;
  var k = 1 - Math.exp(-dt/3);
  wx.storm += (ts-wx.storm)*k; wx.cloud += (tc-wx.cloud)*k;
  var aft = Math.max(0, Math.sin((tDay-.3)*Math.PI/.5));                 // afternoon convection
  wx.wind = Math.max(.5, 3.2 + 1.6*vnoise(wx.clk/6, 0, 310) + 2.2*aft + wx.storm*(19 + 6*vnoise(wx.clk/2.5, 0, 311)));
  wx.dir = 1.0 + 1.6*vnoise(wx.clk/45, 0, 312);
  wx.wvx = Math.sin(wx.dir)*wx.wind; wx.wvz = Math.cos(wx.dir)*wx.wind;
  // air temperature: coldest just before sunrise, warmest mid-afternoon; dust flattens the swing
  var tmin = -89 + 19*wx.storm, tmax = -31 - 19*wx.storm, sh;
  if (tDay >= .25 && tDay <= .58) sh = Math.sin(1.5708*(tDay-.25)/.33);
  else { var u = ((tDay-.58+1)%1)/.67; sh = (1-u)*(1-u); }
  wx.temp = tmin + (tmax-tmin)*sh;
  wx.pres = 7.6 + .3*Math.cos(6.2832*(tDay-.3));
  skyUni.storm.value = wx.storm; skyUni.cloud.value = wx.cloud;
  skyUni.cloudOff.value.x += wx.wvx*dt*.004; skyUni.cloudOff.value.y += wx.wvz*dt*.004;

  // blowing dust
  var n = Math.floor(DN*(.12 + .88*wx.storm)), cxp = camera.position.x, czp = camera.position.z;
  for (var i=0;i<n;i++){
    var j = i*3, x = dPos[j] + wx.wvx*dt, z = dPos[j+2] + wx.wvz*dt;
    if (x-cxp > 30) x -= 60; else if (x-cxp < -30) x += 60;
    if (z-czp > 30) z -= 60; else if (z-czp < -30) z += 60;
    dPos[j] = x; dPos[j+2] = z; dPos[j+1] = P.y + dH[i] + Math.sin(wx.clk*1.7+i)*.15;
  }
  dGeo.setDrawRange(0, n); dGeo.attributes.position.needsUpdate = true;
  var lit = .12 + .88*dayF;
  dMat.opacity = Math.min(.5, wx.wind/30)*(.3+.7*dayF); dMat.size = .07 + .09*wx.storm;
  dMat.color.setRGB(.5*lit, .27*lit, .14*lit);

  // dust devils: clear, warm afternoons only
  var canSpawn = !IND.on && wx.storm < .15 && tDay > .38 && tDay < .68 && wx.mode !== 'storm';   // never indoors: a dust devil must not show beyond a room's walls
  wx.devils = 0;
  for (i=0;i<devils.length;i++){
    var d = devils[i];
    if (d.life <= 0){
      if (canSpawn && Math.random() < dt*.09){
        var a = Math.random()*6.2832, r = 70 + Math.random()*110;
        d.g.position.set(P.x+Math.sin(a)*r, 0, P.z+Math.cos(a)*r);
        d.life = d.max = 28 + Math.random()*20; d.scale = .6 + Math.random()*.9;
        d.g.scale.set(d.scale, d.scale*(.8+Math.random()*.5), d.scale); d.g.visible = true;
      }
      continue;
    }
    d.life -= dt;
    if (IND.on) d.life = 0;                                  // one that was alive when we came inside ends here
    if (d.life <= 0){ d.g.visible = false; continue; }
    wx.devils++;
    d.g.position.x += (wx.wvx*.7 + Math.sin(wx.clk*.3+i*2)*1.5)*dt; d.g.position.z += (wx.wvz*.7 + Math.cos(wx.clk*.23+i)*1.5)*dt;
    d.g.position.y = groundAt(d.g.position.x, d.g.position.z) - .3;
    d.g.children[0].rotation.y += dt*2.6; d.g.children[1].rotation.y += dt*4.1;
    var uu = 1 - d.life/d.max, fade = Math.min(1, uu*8, (1-uu)*6)*(1-wx.storm);
    for (var m=0;m<2;m++){ d.mats[m].opacity = fade*(m ? .5 : .38); d.mats[m].color.setRGB(.9*lit, .66*lit, .46*lit); }
  }

  wx.hud -= dt;
  if (wx.hud <= 0){
    wx.hud = .3;
    var name = wx.storm > .5 ? '砂嵐' : wx.storm > .15 ? '砂ぼこり' : wx.cloud > .4 ? 'うす雲' : '晴れ';
    if (wx.devils) name += '・つむじ風';
    var wsub = document.querySelector('#wx .sub');
    if (IND.on){
      // inside the habitat: heated and pressurised like the ISS (about 21-22℃, 1013 hPa); outside shown for comparison
      $('wname').textContent = '基地の中（外 ' + Math.round(wx.temp) + '℃）';
      $('wtemp').textContent = '21';
      $('m-temp').textContent = '21℃';
      $('m-wind').textContent = '0 m/s';
      $('wwind').textContent = '0.0'; $('wdir').textContent = '換気のみ';
      wsub.textContent = '空気は機械で作っています';
      $('wpres').textContent = '1013';
    } else {
    $('wname').textContent = name;
    $('wtemp').textContent = Math.round(wx.temp);
    $('m-temp').textContent = Math.round(wx.temp)+'℃';
    $('m-wind').textContent = wx.wind.toFixed(0)+' m/s';
    $('wwind').textContent = wx.wind.toFixed(1);
    if (!$('wearth')) wsub.innerHTML = '押す力は地球の風 <span id="wearth">0.5</span> m/s ぶん';
    $('wearth').textContent = (wx.wind*0.128).toFixed(1);
    var brg = Math.atan2(-wx.wvx, wx.wvz);                                // direction the wind comes from; north = -z
    $('wdir').textContent = COMPASS[((Math.round(brg/0.7854)%8)+8)%8] + 'の風';
    $('wpres').textContent = wx.pres.toFixed(1);
    }
  }
}

/* ---------- state ---------- */
var boot0 = (window.claude && window.claude.hot && window.claude.hot.data) || {};
var SPAWN = { x: BASE.x + Math.sin(BASE.rot)*17, z: BASE.z + Math.cos(BASE.rot)*17 };   // just outside the airlock
var resumed = typeof boot0.x === 'number';
var P = { x: resumed ? boot0.x : LANDER.x, z: resumed ? boot0.z : LANDER.z, y: 0, vx:0, vz:0, vy:0, ground:true, face:BASE.rot, walk:0 };
var isPhone = Math.min(window.innerWidth, window.innerHeight) < 600;
var cam = { yaw: boot0.yaw || BASE.rot, pitch: 0.16, dist: isPhone ? 10.5 : 6.5, tx:0, ty:0, tz:0, off:0, cp:0 };
var btn = { accel:false, brake:false };
/* school mode (js/school.js drives the day): input override + hooks */
var SCH = { on:false, ix:0, iz:0, run:false, speed:0, jump:false, touch:false, look:false, pose:null, tick:null, camFn:null, onStorm:null, onLanded:null };
var ask = { open:false, type:null };
var tmpV = new T.Vector3(), toastT = 0;
function toast(msg){ var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function(){ t.hidden = true; }, 3200); }
function showAsk(type){
  sfx('pop');
  ask.open = true; ask.type = type;
  $('asktext').textContent = type === 'drive' ? '運転する？'
    : type === 'place' ? 'ここに酸素製造装置を設置する？'
    : type === 'enterbase' ? '基地に入る？'
    : type === 'exitbase' ? '外に出る？'
    : type === 'plant' ? 'レタスの苗を植える？'
    : type === 'station' ? STATIONS[G.st].ask
    : '降車しますか？';
  $('ask').hidden = false;
}
function hideAsk(){ ask.open = false; $('ask').hidden = true; }
function setView(v){
  R.view = v; cam.off = 0; cam.cp = 0;
  $('cockpit').hidden = !(R.driving && v === 'cockpit');
  $('viewbtn').textContent = v === 'cockpit' ? '視点：運転席' : '視点：俯瞰';
}
function enterRover(){
  R.driving = true; R.speed = 0; R.moved = false; R.saveDist = cam.dist;
  cam.dist = isPhone ? 20 : 15; cam.pitch = .62;
  astro.visible = false; keys = {}; btn.accel = btn.brake = false;
  document.body.classList.add('driving');
  $('drive').hidden = $('accel').hidden = $('brake').hidden = false;
  setView('over');
  if (!isPhone) toast('W／↑ アクセル・S／↓ ブレーキ・A D ハンドル・V 視点');
}
function exitRover(){
  R.driving = false; R.speed = 0; R.declined = true;
  P.x = R.x + Math.cos(R.heading)*2.6; P.z = R.z - Math.sin(R.heading)*2.6;
  P.vx = P.vz = P.vy = 0; P.ground = true; P.face = R.heading;
  cam.yaw = R.heading + Math.PI + cam.off; cam.dist = R.saveDist; cam.pitch = .16;
  astro.visible = true; keys = {};
  document.body.classList.remove('driving');
  $('drive').hidden = $('accel').hidden = $('brake').hidden = true; $('cockpit').hidden = true;
}
function answer(yes){
  var t = ask.type; hideAsk();
  if (t === 'drive'){ if (yes) enterRover(); else R.declined = true; }
  else if (t === 'place'){ if (yes) installMoxie(); else G.placeNo = true; }
  else if (t === 'enterbase'){ if (yes) enterBase(); else G.doorNo = true; }
  else if (t === 'exitbase'){ if (yes) exitBase(); else G.doorNo = true; }
  else if (t === 'plant'){ if (yes) plantLettuce(); else G.doorNo = true; }
  else if (t === 'station'){ if (yes) runStation(); else G.stNo = true; }
  else if (yes) exitRover();
  canvas.focus();
}
function poseRover(dt){
  var sh = Math.sin(R.heading), ch = Math.cos(R.heading);
  var g0 = groundAt(R.x, R.z);
  var hf = groundAt(R.x+sh*1.6, R.z+ch*1.6), hb = groundAt(R.x-sh*1.6, R.z-ch*1.6);
  var hl = groundAt(R.x+ch*1.3, R.z-sh*1.3), hr = groundAt(R.x-ch*1.3, R.z+sh*1.3);
  var k = 1 - Math.exp(-8*dt);
  R.pitch += (-Math.atan2(hf-hb, 3.2) - R.pitch)*k; R.roll += (Math.atan2(hl-hr, 2.6) - R.roll)*k;
  rover.position.set(R.x, (g0+hf+hb+hl+hr)/5, R.z);
  rover.rotation.set(R.pitch, R.heading, R.roll);
}
function driveUpdate(dt){
  var acc = keys.f || btn.accel, brk = keys.b || btn.brake;
  var steer = (keys.l?1:0) - (keys.r?1:0) - joy.x;
  var slip = SCH.on ? (SCH.slip || 0) : 0, vcap = VMAX*(SCH.on && SCH.vmaxK ? SCH.vmaxK : 1);
  if (acc){ R.speed = Math.min(VMAX, R.speed + 2.6*dt); if (ask.open) hideAsk(); }
  else if (brk) R.speed = Math.max(0, R.speed - (slip ? 3.2 : 7)*dt);     // weak gravity: the tyres grip less, so braking is slow
  else R.speed = Math.max(0, R.speed - .5*dt);
  if (R.speed > vcap) R.speed = Math.max(vcap, R.speed - 9*dt);          // sand
  R.heading += steer*(.45 + .55*Math.min(R.speed/4, 1))*.9*dt;
  var mv = R.heading;
  if (slip){                                                             // ...and the rover keeps sliding the old way for a moment when you steer
    if (R.vdir == null) R.vdir = R.heading;
    var dv = R.heading - R.vdir; while (dv > Math.PI) dv -= 6.28318; while (dv < -Math.PI) dv += 6.28318;
    R.vdir += dv*(1 - Math.exp(-slip*dt)); mv = R.vdir;
  } else R.vdir = null;
  R.x += Math.sin(mv)*R.speed*dt; R.z += Math.cos(mv)*R.speed*dt;
  var i, o, dx, dz, d, min;
  for (i=0;i<solids.length;i++){
    o = solids[i]; dx = R.x-o.x; dz = R.z-o.z; d = Math.hypot(dx,dz); min = o.r+2.1;
    if (d < min && d > 1e-4){ R.x = o.x+dx/d*min; R.z = o.z+dz/d*min; R.speed = Math.min(R.speed, 1.5); }
  }
  for (i=0;i<bigRocks.length;i++){
    o = bigRocks[i]; dx = R.x-o.x; dz = R.z-o.z; d = Math.hypot(dx,dz); min = o.r+1.9;
    if (d < min && d > 1e-4){ R.x = o.x+dx/d*min; R.z = o.z+dz/d*min; R.speed = Math.min(R.speed, 2.5); }
  }
  if (R.speed > .6) R.moved = true;
  if (!SCH.on && R.speed === 0 && !ask.open && (R.moved || (brk && !R.prevBrk))){ showAsk('exit'); R.moved = false; }
  R.prevBrk = brk;
  R.puffT -= dt;
  if (R.speed > 1.5 && R.puffT <= 0){
    R.puffT = .12;
    var side = Math.random() < .5 ? 1.3 : -1.3;
    puff(R.x - Math.sin(R.heading)*2 + Math.cos(R.heading)*side, rover.position.y, R.z - Math.cos(R.heading)*2 - Math.sin(R.heading)*side, .5 + R.speed*.05, 1.2);
  }
  P.x = R.x; P.z = R.z; P.y = groundAt(R.x, R.z); P.vx = P.vz = 0;
  cam.yaw = R.heading + Math.PI + cam.off;
  $('kmh').textContent = Math.round(SCH.on ? R.speed/VMAX*10 : R.speed*3.6);   // school mode: the story says 10 km/h (NASA SEV concept); on-screen pace is unchanged
  $('accel').classList.toggle('on', !!acc); $('brake').classList.toggle('on', !!brk);
  wantJump = false;
}
var tDay = typeof boot0.t === 'number' ? boot0.t : 0.37;
var sol = boot0.sol || 1, paused = false;
var jump = { y0:0, max:0, air:0, active:false };
var keys = {}, joy = {x:0, y:0, id:null, ox:0, oy:0}, look = {id:null, x:0, y:0}, wantJump = false, moved = false;
if (window.claude && window.claude.hot && window.claude.hot.snapshot){
  window.claude.hot.snapshot(function(){ return {x:P.x, z:P.z, yaw:cam.yaw, t:tDay, sol:sol}; });
}

/* ---------- input ---------- */
var KEYMAP = {KeyW:'f',ArrowUp:'f',KeyS:'b',ArrowDown:'b',KeyA:'l',ArrowLeft:'l',KeyD:'r',ArrowRight:'r',ShiftLeft:'run',ShiftRight:'run'};
window.addEventListener('keydown', function(e){
  if (e.target && e.target.tagName === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) { e.target.blur(); }
  if (ask.open && (e.code === 'KeyY' || e.code === 'Enter')){ answer(true); e.preventDefault(); return; }
  if (ask.open && (e.code === 'KeyN' || e.code === 'Escape')){ answer(false); e.preventDefault(); return; }
  if (e.code === 'KeyV' && R.driving){ setView(R.view === 'over' ? 'cockpit' : 'over'); return; }
  if (e.code === 'Space'){ wantJump = true; e.preventDefault(); return; }
  var k = KEYMAP[e.code]; if (k){ keys[k] = true; e.preventDefault(); }
});
window.addEventListener('keyup', function(e){ var k = KEYMAP[e.code]; if (k) keys[k] = false; });
window.addEventListener('blur', function(){ keys = {}; });
var stick = $('stick'), knob = $('knob');
canvas.addEventListener('pointerdown', function(e){
  canvas.focus();
  if (SCH.on && !SCH.touch) return;
  try { canvas.setPointerCapture(e.pointerId); } catch(_){}
  if (e.pointerType === 'touch' && e.clientX < window.innerWidth*0.45 && joy.id === null){
    joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0;
    stick.hidden = false; stick.style.left = (e.clientX-55)+'px'; stick.style.top = (e.clientY-55)+'px';
    knob.style.transform = 'translate(0,0)';
  } else if (look.id === null){
    look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY;
  }
});
canvas.addEventListener('pointermove', function(e){
  if (e.pointerId === joy.id){
    var dx = e.clientX-joy.ox, dy = e.clientY-joy.oy, l = Math.hypot(dx,dy), m = 46;
    if (l > m){ dx *= m/l; dy *= m/l; }
    joy.x = dx/m; joy.y = dy/m;
    knob.style.transform = 'translate('+dx+'px,'+dy+'px)';
  } else if (e.pointerId === look.id){
    if (R.driving){
      cam.off -= (e.clientX-look.x)*0.006;
      if (R.view === 'cockpit') cam.cp = Math.max(-.5, Math.min(1.45, cam.cp - (e.clientY-look.y)*0.005));
      else cam.pitch = Math.max(.08, Math.min(1.4, cam.pitch + (e.clientY-look.y)*0.005));
    } else {
      cam.yaw -= (e.clientX-look.x)*0.006;
      cam.pitch = Math.max(IND.on ? .7 : -1.5, Math.min(IND.on ? 1.35 : 1.25, cam.pitch + (e.clientY-look.y)*0.005));
    }
    look.x = e.clientX; look.y = e.clientY;
  }
});
function pointerEnd(e){
  if (e.pointerId === joy.id){ joy.id = null; joy.x = joy.y = 0; stick.hidden = true; }
  if (e.pointerId === look.id) look.id = null;
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);
canvas.addEventListener('wheel', function(e){
  if (IND.on){ IND.zoom = Math.max(.55, Math.min(1.4, IND.zoom*(e.deltaY > 0 ? 1.1 : 0.9))); e.preventDefault(); return; }
  cam.dist = Math.max(2.5, Math.min(40, cam.dist*(e.deltaY > 0 ? 1.1 : 0.9))); e.preventDefault();
}, {passive:false});
canvas.addEventListener('contextmenu', function(e){ e.preventDefault(); });
$('jumpbtn').addEventListener('pointerdown', function(e){ wantJump = true; e.preventDefault(); });
['accel','brake'].forEach(function(id){
  var el = $(id), off = function(){ btn[id] = false; };
  el.addEventListener('pointerdown', function(e){ btn[id] = true; try { el.setPointerCapture(e.pointerId); } catch(_){} e.preventDefault(); });
  el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
  el.addEventListener('contextmenu', function(e){ e.preventDefault(); });
});
$('askyes').addEventListener('click', function(){ answer(true); });
$('askno').addEventListener('click', function(){ answer(false); });
$('viewbtn').addEventListener('click', function(){ setView(R.view === 'over' ? 'cockpit' : 'over'); canvas.focus(); });
function setCompact(v){ document.body.classList.toggle('compact', v); }
$('hudclose').addEventListener('click', function(){ setCompact(true); canvas.focus(); });
$('m-open').addEventListener('click', function(){ setCompact(false); canvas.focus(); });
setCompact(window.innerWidth < 760);
$('pause').addEventListener('click', function(){
  paused = !paused;
  this.setAttribute('aria-pressed', String(paused));
  this.textContent = paused ? '時間を動かす' : '時間を止める';
  canvas.focus();
});
Array.prototype.forEach.call(document.querySelectorAll('#wx .seg button'), function(b){
  b.addEventListener('click', function(){
    wx.mode = b.dataset.w;
    Array.prototype.forEach.call(document.querySelectorAll('#wx .seg button'), function(o){ o.setAttribute('aria-pressed', String(o === b)); });
    canvas.focus();
  });
});
Array.prototype.forEach.call(document.querySelectorAll('#jump .seg button'), function(b){
  b.addEventListener('click', function(){
    gravity = parseFloat(b.dataset.g);
    Array.prototype.forEach.call(document.querySelectorAll('#jump .seg button'), function(o){ o.setAttribute('aria-pressed', String(o === b)); });
    canvas.focus();
  });
});

/* ---------- day / night ---------- */
var sunDir = new T.Vector3(), cDay = new T.Color(), cTmp = new T.Color();
var FOG_N = [.030,.028,.040], FOG_T = [.37,.31,.28], FOG_D = [.86,.68,.50];
var dayF = 1;
function applySky(){
  var a = 6.28318*(tDay-0.25);
  sunDir.set(Math.cos(a), Math.sin(a)*0.88, Math.sin(a)*0.47).normalize();
  var h = sunDir.y;
  skyUni.sunDir.value.copy(sunDir);
  var k1 = sstep(0,.35,h), k2 = sstep(-.25,.05,h);
  var f = [0,0,0];
  for (var i=0;i<3;i++){ var m = FOG_T[i] + (FOG_D[i]-FOG_T[i])*k1; f[i] = FOG_N[i] + (m-FOG_N[i])*k2; }
  var lum = .05 + .95*sstep(-.2,.25,h), SC = [.56*lum, .36*lum, .22*lum];
  for (i=0;i<3;i++) f[i] += (SC[i]-f[i])*wx.storm*.92;
  scene.fog.color.setRGB(f[0], f[1], f[2]);
  scene.fog.density = .0011 + .0105*wx.storm;
  dayF = sstep(-.2,.2,h);
  var low = 1 - sstep(.05,.42,h);
  sun.color.setRGB(1+(.60-1)*low, .94+(.74-.94)*low, .84+(1-.84)*low);   // light near the horizon turns blue
  sun.intensity = sstep(-.03,.12,h)*(2.4 - 1.1*low)*(1 - .82*wx.storm);
  hemi.intensity = .22 + .38*dayF;
  hemi.color.setRGB(.25+.7*dayF, .3+.45*dayF, .5+.05*dayF);
  hemi.groundColor.setRGB(.1+.25*dayF, .08+.12*dayF, .1+.02*dayF);
  starMat.opacity = (1 - sstep(-.22,-.02,h))*(1-wx.storm)*(1-.5*wx.cloud);
  stars.visible = !IND.on && starMat.opacity > 0.01;      // never through the habitat walls
  stars.setRotationFromAxisAngle(SKY_AXIS, a);
  lamp.intensity = (1-dayF)*2.2;
  var nt = 1-dayF;
  M_WIN.emissiveIntensity = .15 + nt*1.3;
  doorLight.intensity = nt*2.2; flood.intensity = nt*1.6;
  roverLight.intensity = R.driving ? nt*2.6 : 0;
  M_BEACON.emissiveIntensity = (performance.now()%1600 < 260) ? 2.5 : .05;
  var mins = Math.floor(tDay*1440);
  $('time').textContent = $('m-time').textContent = 'Sol '+sol+' '+('0'+Math.floor(mins/60)).slice(-2)+':'+('0'+(mins%60)).slice(-2);
  var am = tDay < .5;
  $('phase').textContent = $('m-phase').textContent = h > .3 ? '昼' : h > -.02 ? (am ? '朝焼け' : '夕焼け') : h > -.22 ? (am ? '夜明け前' : 'たそがれ') : '夜';
  $('daymark').style.left = (tDay*100)+'%';
}

/* ---------- missions ---------- */
var QUIZ = {
  site: { num:1, title:'着陸地点を探せ！', q:'着陸船をどこに降ろす？', opts:['山の斜面','平坦な場所','大きな岩があるところ'], ans:1,
    why:['斜面に降りると、着陸船がかたむいて倒れたり、すべり落ちたりします。',
         '岩や斜面のない平らな場所なら、着陸船がまっすぐ安定して立てます。',
         '大きな岩に脚が乗り上げると、着陸船がかたむいたり、こわれたりします。'],
    tip:'実際の探査でも、着陸地点は岩や斜面が少ない平らな場所から選ばれます。探査車パーサヴィアランスは、降下中に地面を撮影し、危ない場所を自動でよけて着陸しました。' },
  storm: { num:2, title:'着陸直前に大規模な砂嵐が発生！', q:'どうする？', opts:['そのまま着陸','着陸を延期','エンジンを停止'], ans:1,
    why:['砂で地面が見えず、岩や斜面をよけられません。無理に降りるのは危険です。',
         '砂嵐が弱まるまで上空で待つのが安全です。',
         'エンジンを止めると減速できず、地面に激突します。火星は空気がうすく、パラシュートだけでは止まれません。'],
    tip:'火星では、地域的な砂嵐だけでなく、惑星全体をおおうほど大規模な砂嵐が発生することがあります。' },
  oppy: { num:5, title:'起動していない火星探査機を救え！', q:'砂をかぶって止まっている探査機。どうする？',
    opts:['パネルの砂をはらう','新しい電池につなぐ','基地へ持ち帰る'], ans:0,
    why:['太陽光パネルの砂を落とせば、また日光で発電できます。',
         '探査機の電気は太陽光パネルで作ります。持ってきていない電池をつなぐことはできません。',
         '探査機は重く、運ぶ道具もありません。その場で直すのが現実的です。'],
    tip:'探査車オポチュニティは太陽光パネルで動いていました。パネルに砂が積もると発電が落ちますが、火星の風がときどき砂を吹き飛ばしてくれました。' },
  lettuce: { num:6, title:'レタスを育てよう', q:'地下シェルターの畑で、レタスを育てるのに必要なものは？',
    opts:['太陽の光をそのまま当てる','LEDの光と、空気と水','火星の砂をそのまま使う'], ans:1,
    why:['地下には日光が届きません。そもそも火星の日光は地球の約半分の強さです。',
         '光はLEDで作り、空気（二酸化炭素）と水をあたえます。ISSでも同じ方法でレタスを育てています。',
         '火星の砂には過塩素酸塩という有害な成分がふくまれているので、そのままでは使えません。'],
    tip:'ISSの装置「Veggie」では、赤と青のLEDの光でレタスを育て、宇宙飛行士が実際に食べています。' },
  oxygen: { num:4, title:'酸素を作れ！', q:'火星で酸素を手に入れる方法は？', opts:['大気から酸素だけを取り出す','大気中の二酸化炭素から酸素を作る','火星の砂を燃やして酸素を取り出す'], ans:1,
    why:['火星の大気に酸素は約0.1〜0.2％しかなく、集めてもまったく足りません。',
         '火星の大気は約95％が二酸化炭素です。ここから酸素を取り出します。',
         '火星には物を燃やすための酸素がほとんどないので、火がつきません。'],
    tip:'NASAの探査車パーサヴィアランスにのせた装置「MOXIE」は、火星の二酸化炭素から酸素を作る実験に成功しました。作れた量は1時間あたり約6グラムです。',
    src:['出典：Business Insider Japan（2022年9月）','https://www.businessinsider.jp/article/258792/'] }
};
var beacon = new T.Mesh(new T.CylinderGeometry(1.2, 1.2, 160, 12, 1, true),
  new T.MeshBasicMaterial({color:0xff8a3a, transparent:true, opacity:.4, fog:false, toneMapped:false, depthWrite:false, side:T.DoubleSide}));
beacon.position.set(BASE.x, BASE.y+80, BASE.z); beacon.visible = false; scene.add(beacon);
var SPOT = (function(){ var c = Math.cos(BASE.rot), s2 = Math.sin(BASE.rot), lx = 4, lz = 14.5;
  return { x:BASE.x + lx*c + lz*s2, z:BASE.z - lx*s2 + lz*c, y:BASE.y }; })();
var spotRing = new T.Mesh(new T.TorusGeometry(1.1, .07, 8, 40), new T.MeshBasicMaterial({color:0xff7a2a, fog:false, toneMapped:false}));
spotRing.rotation.x = Math.PI/2; spotRing.position.set(SPOT.x, SPOT.y+.08, SPOT.z); spotRing.visible = false; scene.add(spotRing);
var moxie = new T.Group(); moxie.position.set(SPOT.x, SPOT.y, SPOT.z); moxie.rotation.y = BASE.rot+.5; moxie.visible = false; scene.add(moxie);
(function(){
  var c = document.createElement('canvas'); c.width = c.height = 256;
  var g = c.getContext('2d');
  g.fillStyle = '#d6aa4a'; g.fillRect(0,0,256,256);
  function ribs(col, w){                               // isogrid ribs like the real housing
    g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round';
    g.strokeRect(10,10,236,236);
    g.beginPath();
    g.moveTo(128,10); g.lineTo(128,246); g.moveTo(10,128); g.lineTo(246,128);
    [[10,10],[128,10],[10,128],[128,128]].forEach(function(o){
      g.moveTo(o[0],o[1]); g.lineTo(o[0]+118,o[1]+118); g.moveTo(o[0]+118,o[1]); g.lineTo(o[0],o[1]+118);
    });
    g.stroke();
  }
  ribs('#8f6a22', 9); ribs('#f0cf7a', 3);
  g.fillStyle = '#3b3b40';
  [[128,20],[236,60],[128,128],[60,236],[200,200],[236,128],[20,128],[128,236]].forEach(function(b){ g.beginPath(); g.arc(b[0],b[1],5,0,6.3); g.fill(); });
  var tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding; tex.anisotropy = 4;
  var gold = new T.MeshStandardMaterial({map:tex, metalness:.75, roughness:.38, emissive:0x3a2a08, emissiveIntensity:.5});
  var dark = new T.MeshStandardMaterial({color:0x4a4d55, metalness:.5, roughness:.6});
  var st = new T.Mesh(new T.BoxGeometry(.5,.42,.5), dark); st.position.y = .21; st.castShadow = true; st.receiveShadow = true; moxie.add(st);
  var box = new T.Mesh(new T.BoxGeometry(.24,.31,.24), gold); box.position.y = .42+.02+.155; box.castShadow = true; moxie.add(box);       // 24 x 24 x 31 cm
  var plate = new T.Mesh(new T.BoxGeometry(.28,.02,.28), dark); plate.position.y = .43; moxie.add(plate);
  var cap = new T.Mesh(new T.BoxGeometry(.1,.035,.08), new T.MeshStandardMaterial({color:0xe2b93e, metalness:.9, roughness:.25})); cap.position.set(.03,.42+.02+.31+.017,0); moxie.add(cap);
  var lamp2 = new T.Mesh(new T.SphereGeometry(.018,8,6), M_BLUE); lamp2.position.set(-.08,.42+.02+.31+.02,.08); moxie.add(lamp2);
})();
function setGuide(t, label){                           // arrow + beacon toward the current goal, or off
  G.target = t; $('guide').hidden = !t; beacon.visible = !!t;
  if (t){ $('glabel').textContent = label; beacon.position.set(t.x, BASE.y+80, t.z); }
}
function installMoxie(){
  G.phase = 'o2steps'; setGuide(null); spotRing.visible = false; moxie.visible = true; G.moxieSet = true; addPts(100);
  for (var i=0;i<8;i++) puff(SPOT.x+(Math.random()-.5), SPOT.y, SPOT.z+(Math.random()-.5), .4, 1.2);
  G.keepDist = cam.dist; G.keepPitch = cam.pitch; cam.dist = 2.4; cam.pitch = .3; cam.yaw = BASE.rot;
  // stand the astronaut beside the machine, out of the camera's line of sight
  P.x = SPOT.x + Math.cos(cam.yaw)*1.0 - Math.sin(cam.yaw)*.35; P.z = SPOT.z - Math.sin(cam.yaw)*1.0 - Math.cos(cam.yaw)*.35;
  P.vx = P.vz = 0; P.face = cam.yaw - 1.1;
  G.focus = { x:SPOT.x, y:SPOT.y+.6, z:SPOT.z };
  banner('ミッション 4/'+NTOTAL, '酸素を作れ！', false);
  $('qfig').hidden = false;
  showInfo('酸素製造装置を設置しました！ +100 pt', '大きさは約24×24×31cm。この小さな箱が、火星の空気から酸素を作ります。動かしてみましょう。', '', function(){ $('qfig').hidden = true; oxygenSteps(0); });
}
function resetMoxie(){
  moxie.visible = false; spotRing.visible = false; G.placeNo = false; G.doorNo = false; G.moxieSet = false; $('qfig').hidden = true;
  if (IND.on) setIndoor(false);
  oppyDust.visible = true; oppyMats.panel.color.setHex(0x6a5340); oppyMats.panel.roughness = .95; oppyMats.panel.metalness = 0;
  oppyMats.lamp.emissiveIntensity = 0;
  for (var li=0; li<lettuce.length; li++){ lettuce[li].visible = false; lettuce[li].scale.setScalar(.001); }
  resetStations();
  if (G.focus){ G.focus = null; cam.dist = G.keepDist; cam.pitch = G.keepPitch; }
  setGuide(null);
}
var G = { annT:0, target:null, focus:null, placeNo:false, doorNo:false, moxieSet:false, phase:'free', cine:false, freeze:false, alt:0, pts:0, t:0, after:null, quiz:null, answered:false,
          cp:new T.Vector3(), cl:new T.Vector3(), camInit:false, bannerT:0 };
var PAD_Y = groundAt(LANDER.x, LANDER.z) - .15;
function banner(num, text, skippable){
  $('mission').hidden = false; $('mnum').textContent = num; $('mnum').hidden = !num; $('mtext').textContent = text;
  $('mpts').textContent = G.pts+' pt'; $('mskip').hidden = !skippable;
}
function announce(num, text, then){                     // show the mission large once, then leave the small banner
  var a = $('announce'); $('annnum').textContent = num; $('annnum').hidden = !num; $('anntext').textContent = text;
  a.hidden = true; void a.offsetWidth; a.hidden = false; sfx('fanfare');
  clearTimeout(G.annT);
  G.annT = setTimeout(function(){ a.hidden = true; if (then) then(); }, 2600);
}
function cancelAnnounce(){ clearTimeout(G.annT); $('announce').hidden = true; }
function addPts(n, quiet){ G.pts += n; $('mpts').textContent = G.pts+' pt'; if (!quiet) sfx('coin'); }
function esc(t){ return t.replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); }
function showQuiz(key, after){
  var q = QUIZ[key]; G.quiz = q; G.after = after; G.answered = false;
  banner('ミッション '+q.num+'/'+NTOTAL, q.title, G.cine);
  $('qtitle').textContent = q.title; $('qbody').textContent = q.q;
  var box = $('qopts'); box.textContent = ''; box.hidden = false;
  q.opts.forEach(function(o, i){
    var b = document.createElement('button'); b.type = 'button'; b.id = 'qopt'+i;
    var n = document.createElement('span'); n.textContent = 'ABC'[i]; b.appendChild(n); b.appendChild(document.createTextNode(o));
    b.addEventListener('click', function(){ choose(i); }); box.appendChild(b);
  });
  $('qtip').hidden = true; $('qnext').hidden = true; $('quiz').hidden = false;
}
function choose(i){
  var q = G.quiz; if (!q || G.answered) return; G.answered = true;
  var ok = i === q.ans, html;
  sfx(ok ? 'ok' : 'bad');
  if (ok){ addPts(100, true); html = '<span class="ok">正解！ +100 pt</span><br>'+esc(q.why[i]); }
  else html = '<span class="bad">ざんねん。「'+esc(q.opts[i])+'」は不正解</span><br>'+esc(q.why[i])+
              '<br><span class="ok">正解は「'+esc(q.opts[q.ans])+'」</span><br>'+esc(q.why[q.ans]);
  $('qbody').innerHTML = html; $('qopts').hidden = true;
  showTip(q);
}
function showTip(q){
  $('qtiptext').textContent = q.tip; $('qtip').hidden = false;
  var a = $('qsrc');
  if (q.src){ a.textContent = q.src[0]; a.href = q.src[1]; a.hidden = false; } else a.hidden = true;
  $('qnext').hidden = false;
}
function showInfo(title, body, tip, after){
  G.quiz = null; G.after = after; G.answered = true;
  $('qtitle').textContent = title; $('qbody').innerHTML = body; $('qopts').hidden = true;
  if (tip) showTip({tip:tip}); else { $('qtip').hidden = true; $('qnext').hidden = false; }
  $('quiz').hidden = false;
}
var O2_STEPS = [
  ['空気を吸い込む', 'フィルターで砂ぼこりを取りのぞきます。'],
  ['圧縮する', 'ポンプで、地球の気圧と同じくらい（約1気圧）まで押しちぢめます。火星の空気は地球の約0.6％の濃さしかないためです。'],
  ['加熱する', '約800℃まで温めます。約90分かかります。'],
  ['電気で分解する', '二酸化炭素を、酸素と一酸化炭素に分けます（2CO₂ → 2CO + O₂）。'],
  ['確かめて、捨てる', '酸素の純度を測り、一酸化炭素などは外へ出します。純度は98％以上です。']
];
function oxygenSteps(i){
  i = i || 0;
  if (i < O2_STEPS.length){
    showInfo('酸素を作る工程 '+(i+1)+'/'+O2_STEPS.length+'　'+O2_STEPS[i][0], esc(O2_STEPS[i][1]), '', function(){ oxygenSteps(i+1); });
    return;
  }
  showInfo('酸素を生成できました！', '<span class="ok">これでずっと活動できます！</span>',
    '実際のMOXIEが作れた酸素は、1時間に最大12グラムほどでした。人が火星で暮らすには、約200倍の大きさの装置が必要だと考えられています。',
    function(){
      if (G.focus){ G.focus = null; cam.dist = G.keepDist; cam.pitch = G.keepPitch; }
      G.phase = 'rescue'; setGuide(OPPY, '探査機');
      banner('ミッション 5/'+NTOTAL, '起動していない火星探査機を救え！', false);
      announce('ミッション 5/'+NTOTAL, '起動していない火星探査機を救え！');
    });
}
function nextStep(){ $('quiz').hidden = true; var f = G.after; G.after = null; if (f) f(); canvas.focus(); }
function siteMarks(on){ for (var i=0;i<3;i++){ SITES[i].ring.visible = on; if (!on) $('site'+i).hidden = true; } G.marks = on; }
function setWeatherMode(m){
  wx.mode = m;
  Array.prototype.forEach.call(document.querySelectorAll('#wx .seg button'), function(o){ o.setAttribute('aria-pressed', String(o.dataset.w === m)); });
}
function beginIntro(){
  G.phase = 'title'; G.cine = true; G.freeze = true; G.alt = 230; G.camInit = false;
  document.body.classList.add('intro'); astro.visible = false; setWeatherMode('clear');
  P.x = LANDER.x; P.z = LANDER.z; P.y = groundAt(P.x, P.z);
  $('titlecard').hidden = false; siteMarks(false);
  if (BGM) bgmPlay('title');
}
function startMissions(){
  $('titlecard').hidden = true; G.phase = 'site'; siteMarks(true);
  banner('ミッション 1/'+NTOTAL, QUIZ.site.title, true);
  announce('ミッション 1/'+NTOTAL, QUIZ.site.title, function(){
    showQuiz('site', function(){ siteMarks(false); G.phase = 'approach'; banner('ミッション 1/'+NTOTAL, '着陸地点へ降下中…', true); });
  });
  canvas.focus();
}
function stepOut(){                                    // leave the lander and hand control to the player
  G.cine = false; G.freeze = false; G.alt = 0; flame.visible = false;
  lander.position.y = PAD_Y;
  document.body.classList.remove('intro'); astro.visible = true; siteMarks(false);
  $('titlecard').hidden = true; $('quiz').hidden = true;
  if (BGM) bgmPlay('main'); else window.__bgmFirst = 'main';
}
function landed(){
  stepOut();
  P.x = LANDER.x+6; P.z = LANDER.z+4.5; P.y = groundAt(P.x, P.z); P.vx = P.vz = P.vy = 0; P.ground = true;
  cam.yaw = Math.atan2(P.x-LANDER.x, P.z-LANDER.z); P.face = cam.yaw; cam.pitch = .16;
  cam.tx = P.x; cam.ty = P.y+1.05; cam.tz = P.z;
  setWeatherMode('auto'); G.phase = 'jump'; jump.air = 0;
  banner('ミッション 3/'+NTOTAL, 'ジャンプしてみよう！（'+(isPhone ? 'ジャンプボタン' : 'Spaceキー')+'）', false);
  announce('ミッション 3/'+NTOTAL, 'ジャンプしてみよう！');
}
function jumpDone(){
  G.phase = 'jumpinfo'; addPts(100);
  showInfo('ジャンプ成功！ +100 pt',
    'いまのジャンプは <span class="ok">'+jump.max.toFixed(2)+' m</span>。同じ力で地球で跳ぶと約0.5 mです。',
    '火星の重力は地球の約38％！ 同じ力でジャンプすると、地球の約2.6倍の高さまで跳べます。',
    function(){ G.phase = 'tobase'; banner('ミッション 4/'+NTOTAL, '酸素を作れ！ まず基地へ向かおう', false); announce('ミッション 4/'+NTOTAL, '酸素を作れ！ まず基地へ向かおう'); setGuide(BASE, '基地'); });
}
function finishMissions(){
  if (G.focus){ G.focus = null; cam.dist = G.keepDist; cam.pitch = G.keepPitch; }
  G.phase = 'free'; banner('', 'ミッション完了！ 自由に探索しよう', false); G.bannerT = 8;
  announce('', 'ミッション完了！');
}
function skipToFree(){
  stepOut(); setWeatherMode('auto'); G.phase = 'free'; $('mission').hidden = true; cancelAnnounce(); resetMoxie(); hideAsk();
  P.x = SPAWN.x; P.z = SPAWN.z; P.y = groundAt(P.x, P.z); P.vx = P.vz = P.vy = 0; P.ground = true; P.face = BASE.rot;
  cam.yaw = BASE.rot; cam.pitch = .16; cam.tx = P.x; cam.ty = P.y+1.05; cam.tz = P.z;
  canvas.focus();
}
function introUpdate(dt){
  G.t += dt;
  var ph = G.phase;
  if (ph === 'approach'){
    G.alt = Math.max(120, G.alt - 20*dt);
    if (G.alt <= 120){
      G.phase = 'stormq'; setWeatherMode('storm'); wx.storm = Math.max(wx.storm, .5);
      if (SCH.on){ if (SCH.onStorm) SCH.onStorm(); } else {
      banner('ミッション 2/'+NTOTAL, QUIZ.storm.title, true);
      announce('ミッション 2/'+NTOTAL, QUIZ.storm.title, function(){ showQuiz('storm', function(){ G.phase = 'wait'; G.t = 0; setWeatherMode('clear'); banner('ミッション 2/'+NTOTAL, '上空で砂嵐が弱まるのを待っています…', true); }); });
      }
    }
  } else if (ph === 'wait'){
    wx.storm *= Math.exp(-dt*.9);
    if (G.t > 4.5){ G.phase = 'descend'; if (!SCH.on) banner('ミッション 2/'+NTOTAL, '砂嵐が弱まった。着陸します', true); }
  } else if (ph === 'descend'){
    G.alt -= Math.max(4, G.alt*.45)*dt;
    if (G.alt < 30 && Math.random() < dt*14) puff(LANDER.x+(Math.random()-.5)*7, PAD_Y, LANDER.z+(Math.random()-.5)*7, 1.6, 9);
    if (G.alt <= 0){ G.alt = 0; G.phase = 'touch'; G.t = 0; sfx('touchdown'); for (var i=0;i<16;i++) puff(LANDER.x+(Math.random()-.5)*8, PAD_Y, LANDER.z+(Math.random()-.5)*8, 2, 10); }
  } else if (ph === 'touch'){
    if (G.t > 1.6){ if (SCH.on){ stepOut(); G.phase = 'school'; if (SCH.onLanded) SCH.onLanded(); } else landed(); return; }
  }
  var hover = G.alt > 0 ? Math.sin(performance.now()/700)*.6 : 0;
  lander.position.y = PAD_Y + G.alt + hover;
  flame.visible = G.alt > .05; flame.scale.set(1, .8+Math.random()*.5, 1);
  if (ph === 'title' || ph === 'site'){ P.x = (SITES[0].x+SITES[1].x+SITES[2].x)/3; P.z = (SITES[0].z+SITES[1].z+SITES[2].z)/3; }
  else { P.x = LANDER.x; P.z = LANDER.z; }
  P.y = groundAt(P.x, P.z); wantJump = false;
}
function introCamera(dt){
  var px, py, pz, lx, ly, lz;
  if (G.phase === 'title' || G.phase === 'site'){
    var cx = (SITES[0].x+SITES[1].x+SITES[2].x)/3, cz = (SITES[0].z+SITES[1].z+SITES[2].z)/3, tt = performance.now()/1000;
    px = cx + Math.sin(tt*.05)*40; py = PAD_Y + 300; pz = cz + 330; lx = cx; ly = PAD_Y; lz = cz + 75;
  } else {
    px = LANDER.x + 27; py = lander.position.y + 7 + G.alt*.06; pz = LANDER.z + 31;
    py = Math.max(py, groundAt(px, pz) + 2.5);
    lx = LANDER.x; ly = lander.position.y + 4.5; lz = LANDER.z;
  }
  var k = G.camInit ? 1 - Math.exp(-1.8*dt) : 1; G.camInit = true;
  G.cp.x += (px-G.cp.x)*k; G.cp.y += (py-G.cp.y)*k; G.cp.z += (pz-G.cp.z)*k;
  G.cl.x += (lx-G.cl.x)*k; G.cl.y += (ly-G.cl.y)*k; G.cl.z += (lz-G.cl.z)*k;
  camera.position.copy(G.cp); camera.lookAt(G.cl); camera.updateMatrixWorld(true);
  if (G.marks) for (var i=0;i<3;i++){
    var el = $('site'+i); tmpV.set(SITES[i].x, SITES[i].y+3, SITES[i].z).project(camera);
    el.hidden = tmpV.z > 1;
    el.style.left = ((tmpV.x*.5+.5)*window.innerWidth)+'px'; el.style.top = ((-tmpV.y*.5+.5)*window.innerHeight)+'px';
  }
}
function setIndoor(on){
  IND.on = on;
  interior.visible = on;
  terrain.visible = rocks.visible = base.visible = lander.visible = sky.visible = !on;
  oppy.visible = oppyDust.visible = dustPts.visible = !on;
  if (moxie.visible !== undefined && on) moxie.visible = false;
  else if (!on && G.moxieSet) moxie.visible = true;
  if (!on) stars.visible = false;
  for (var i=0;i<devils.length;i++) devils[i].g.visible = devils[i].g.visible && !on;
  for (i=0;i<puffs.length;i++) if (on) puffs[i].s.visible = false;
  sun.castShadow = !on;
  for (i=0;i<intShadow.length;i++) intShadow[i].castShadow = on;
  if (!on){ IND.fade = 1; setAstroOpacity(1); }
  IND.d = on ? 2.4 : 0;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(on ? 0x202842 : 0x000000, 1);          // outside the room: deep navy instead of black
}
var ASTRO_MATS = Object.keys(player.mats).map(function(k){ return player.mats[k]; });
function setAstroOpacity(o){
  for (var i=0;i<ASTRO_MATS.length;i++){
    var m = ASTRO_MATS[i];
    var op = m.userData.op || 1; m.transparent = o < .999 || op < 1; m.opacity = op*o; m.depthWrite = op < 1 ? false : o > .5;
  }
  astro.visible = o > .02;
}
function applyIndoorLights(){
  sun.intensity = 0;
  hemi.intensity = .86; hemi.color.setRGB(1,.97,.92); hemi.groundColor.setRGB(.74,.68,.62);      // bright, warm and soft (was a dim grey .27)
  scene.fog.density = .004; scene.fog.color.setRGB(.13,.15,.24);
  lamp.intensity = 0;
  for (var i=0;i<intLights.length;i++) intLights[i].intensity = intLights[i].userData.base*.45;
}
function enterBase(){
  sfx('door');
  setIndoor(true);
  P.x = INT.x; P.z = INT.z + 2.5; P.y = groundAt(P.x, P.z); P.vx = P.vz = P.vy = 0; P.ground = true;
  cam.yaw = 0; P.face = Math.PI; cam.pitch = .95; IND.rc = null; IND.zoom = 1;   // fixed room view looking into the dome from the hatch side
  G.outDist = cam.dist; cam.dist = isPhone ? 10 : 8.5; IND.d = 2.0; setAstroOpacity(1); IND.fade = 1;
  cam.tx = P.x; cam.ty = P.y + 1.05; cam.tz = P.z;
  G.doorNo = true;      // don't ask "外に出る？" until the player walks away from the hatch
  if (G.phase === 'toshelter'){
    G.phase = 'tofarm'; setGuide(FARM, '畑');
    banner('ミッション 6/'+NTOTAL, '階段を降りて畑へ行こう', false);
  }
}
function exitBase(){
  sfx('door');
  setIndoor(false);
  P.x = DOOR.x + Math.sin(BASE.rot)*1.3; P.z = DOOR.z + Math.cos(BASE.rot)*1.3; P.y = groundAt(P.x, P.z); P.vx = P.vz = P.vy = 0; P.ground = true;
  cam.yaw = BASE.rot; P.face = BASE.rot; cam.pitch = .16;     // step out of the hatch, facing away from the base
  cam.dist = G.outDist || (isPhone ? 10.5 : 6.5);
  cam.tx = P.x; cam.ty = P.y + 1.05; cam.tz = P.z;
  G.doorNo = true;
}
function wakeOppy(){
  G.phase = 'oppywake'; addPts(100);
  oppyDust.visible = false;
  oppyMats.panel.color.setHex(0x1b3a73); oppyMats.panel.roughness = .35; oppyMats.panel.metalness = .5;
  oppyMats.lamp.emissiveIntensity = 2.2;
  for (var i=0;i<10;i++) puff(OPPY.x+(Math.random()-.5)*4, OPPY.y, OPPY.z+(Math.random()-.5)*4, .6, 1.6);
  setGuide(null);
  showInfo('探査機が目を覚ました！ +100 pt',
    'パネルの砂をはらうと、太陽の光でまた発電できるようになりました。',
    '探査車オポチュニティは、90日の予定が約14年半も動き続けました。火星の風がときどきパネルの砂を吹き飛ばしてくれたおかげです。2018年の惑星全体をおおう砂嵐で日光が届かなくなり、通信が途絶えました。',
    startFarmMission);
}
function startFarmMission(){
  G.phase = 'toshelter'; setGuide(BASE, '基地の入口');
  banner('ミッション 6/'+NTOTAL, '地下シェルターでレタスを育てよう', false);
  announce('ミッション 6/'+NTOTAL, '地下シェルターでレタスを育てよう');
}
function plantLettuce(){
  G.phase = 'lettuceq'; setGuide(null); addPts(100);
  showQuiz('lettuce', function(){
    G.phase = 'growing'; growT = 0;
    for (var i=0;i<lettuce.length;i++) lettuce[i].visible = true;
    banner('ミッション 6/'+NTOTAL, 'レタスが育っています…', false);
  });
}

/* ---------- missions 7-11: life support built step by step ---------- */
var NTOTAL = 11;
astro.add(carryCase);
var STATIONS = [];
function infoSeq(cards, done){
  var i = 0;
  (function nx(){
    if (i >= cards.length){ if (done) done(); return; }
    var c = cards[i++]; showInfo(c[0], c[1], c[2] || '', nx);
  })();
}
function startStation(i){
  G.st = i; var S = STATIONS[i];
  if (!S){ finishMissions(); return; }
  G.phase = 'st'; G.stNo = false; G.target = null;
  banner('ミッション '+S.num+'/'+NTOTAL, S.title, false);
  if (!S.cont) announce('ミッション '+S.num+'/'+NTOTAL, S.title);
}
function nextStation(){ startStation(G.st + 1); }
function runStation(){
  var S = STATIONS[G.st]; G.phase = 'strun'; setGuide(null);
  if (S.focusY){                                      // look at the machine while it is explained
    G.keepDist = cam.dist; G.keepPitch = cam.pitch;
    cam.yaw = Math.atan2(P.x - S.pos.x, P.z - S.pos.z); cam.dist = 3.6; cam.pitch = .34;
    var sx = Math.cos(cam.yaw), sz = -Math.sin(cam.yaw);           // step the astronaut aside
    P.x = S.pos.x + Math.sin(cam.yaw)*1.3 + sx*1.7; P.z = S.pos.z + Math.cos(cam.yaw)*1.3 + sz*1.7; P.vx = P.vz = 0;
    P.face = cam.yaw + Math.PI - .9;
    G.focus = { x:S.pos.x, y:groundAt(S.pos.x, S.pos.z) + S.focusY, z:S.pos.z };
  }
  S.run(function(){
    if (G.focus){ G.focus = null; cam.dist = G.keepDist; cam.pitch = G.keepPitch; }
    nextStation();
  });
}
STATIONS.push({ num:7, title:'ソーラーパネルで電力を生み出せ！', label:'ソーラーパネル', pos:SOLAR_POS, r:7,
  ask:'パネルの砂をはらって発電する？',
  run:function(done){
    addPts(100);
    M_SOLAR_FIELD.color.setHex(0x1a3470); M_SOLAR_FIELD.roughness = .25; M_SOLAR_FIELD.metalness = .7;
    for (var i=0;i<14;i++) puff(SOLAR_POS.x+(Math.random()-.5)*10, groundAt(SOLAR_POS.x, SOLAR_POS.z)+.8, SOLAR_POS.z+(Math.random()-.5)*8, .7, 1.4);
    infoSeq([
      ['電力が戻った！ +100 pt', 'パネルに積もった砂をはらうと、発電量が回復しました。この電気で、基地の機械を動かします。',
       '火星に届く太陽の光の強さは、地球の約43％しかありません。砂嵐の日はさらに弱くなります。']
    ], done);
  }});
STATIONS.push({ num:8, title:'水を電気分解して空気を作れ！', label:'電気分解装置', pos:EL_POS, r:3.4, focusY:1.2,
  ask:'水を電気分解する？',
  run:function(done){
    addPts(100);
    M_RUNLAMP.emissiveIntensity = 2.5; M_GLASS_O2.emissiveIntensity = .9; M_GLASS_H2.emissiveIntensity = .6; G.elT = 0;
    infoSeq([
      ['水を電気分解する 1/3　水を用意する', '火星の地下や北極・南極にある氷をとかして、水にします。'],
      ['水を電気分解する 2/3　電気を流す', 'ソーラーパネルの電気を水に流すと、水が<span class="ok">酸素</span>と<span class="ok">水素</span>に分かれます（2H₂O → 2H₂ + O₂）。'],
      ['水を電気分解する 3/3　空気にする', '酸素を基地の空気に加えて、呼吸できるようにします。いっしょにできた水素は、次のミッションで使います。'],
      ['空気ができた！ +100 pt', '青い筒に酸素、白い筒に水素がたまりました。水素は酸素の<span class="ok">2倍</span>の量ができます（2H₂O → 2H₂ + O₂）。',
       'ISS（国際宇宙ステーション）でも、水を電気分解して宇宙飛行士が吸う酸素を作っています。']
    ], done);
  }});
STATIONS.push({ num:9, title:'水素を使って水を作れ！', label:'水の製造装置', pos:SB_POS, r:3.4, focusY:1.1,
  ask:'水素から水を作る？',
  run:function(done){
    addPts(100);
    M_HEAT.emissiveIntensity = 1.6; M_WATER.emissiveIntensity = .7;
    sabat.children.forEach(function(m){ if (m.material && m.material.emissive && m.material !== M_HEAT && m.material !== M_WATER && m.material.emissive.getHex() === 0x3dff6a) m.material.emissiveIntensity = 2.5; });
    infoSeq([
      ['水を作る 1/2　材料を入れる', '電気分解でできた<span class="ok">水素</span>と、火星の大気の<span class="ok">二酸化炭素</span>を反応装置に入れます。'],
      ['水を作る 2/2　熱して反応させる', '熱すると、水とメタンができます（CO₂ + 4H₂ → 2H₂O + CH₄）。この反応を「サバティエ反応」といいます。'],
      ['水ができた！ +100 pt', 'タンクに水がたまりました。飲み水や、畑の水に使えます。',
       'ISSでもこの反応で水を取り戻しています。できたメタンを、地球に帰るロケットの燃料にする計画もあります。']
    ], done);
  }});
STATIONS.push({ num:10, title:'ロケットの種と苗で栽培しよう！', label:'ロケット', pos:ROCKET_POS, r:3.6,
  ask:'ロケットから種と苗を降ろす？',
  run:function(done){
    addPts(50);
    G.seedTaken = true; carryCase.visible = true;
    infoSeq([
      ['種と苗を手に入れた！ +50 pt', 'ロケットで地球から運んできた<span class="ok">ミニトマト</span>の種と苗です。地下の畑へ運びましょう。',
       '種は眠った状態なので、長いロケットの旅でも運びやすい「食料のもと」です。']
    ], done);
  }});
STATIONS.push({ num:10, cont:true, title:'地下の畑にミニトマトを植えよう', label:'畑', indoor:true, pos:{x:INT.x, z:INT.z - 20.4}, r:3.2,
  ask:'ミニトマトの苗を植える？',
  run:function(done){
    carryCase.visible = false;
    G.tomDone = done; G.phase = 'tomgrow'; growT = 0;
    for (var i=0;i<tomato.length;i++) tomato[i].visible = true;
    banner('ミッション 10/'+NTOTAL, 'ミニトマトが育っています…', false);
  }});
STATIONS.push({ num:11, title:'地球と交信せよ！', label:'通信アンテナ', pos:COMMS_POS, r:4.6,
  ask:'アンテナを地球に向けて交信する？',
  run:function(done){
    G.commsDone = done; G.phase = 'commsaim'; G.t = 0;
    banner('ミッション 11/'+NTOTAL, 'アンテナを地球に向けています…', false);
  }});
function stationTick(dt){
  if (G.elT != null && G.elT < 1){                    // H2 fills twice as fast as O2 (2H2O -> 2H2 + O2)
    G.elT = Math.min(1, G.elT + dt/9);
    h2fill.scale.y = Math.max(.001, Math.min(1, G.elT*1.6)); o2fill.scale.y = Math.max(.001, G.elT*.8);
  }
  if (G.phase === 'st'){
    var S = STATIONS[G.st], want = !!S.indoor, tgt, lab;
    if (want === IND.on){ tgt = S.pos; lab = S.label; }
    else if (IND.on){ tgt = INDOOR_DOOR; lab = '出口'; }
    else { tgt = DOOR; lab = '基地の入口'; }
    if (G.target !== tgt) setGuide(tgt, lab);
    if (want === IND.on && !R.driving){
      var sd = Math.hypot(P.x-S.pos.x, P.z-S.pos.z);
      if (sd < S.r && !ask.open && !G.stNo) showAsk('station');
      if (sd > S.r + 2.5){ G.stNo = false; if (ask.open && ask.type === 'station') hideAsk(); }
    }
  }
  if (G.phase === 'tomgrow'){
    growT += dt;
    var g = Math.min(1, growT/3.4);
    for (var ti=0; ti<tomato.length; ti++) tomato[ti].scale.setScalar((.05 + .95*g)*(.9 + .25*((ti*3)%5)/5));
    if (growT > 3.8){
      G.phase = 'strun'; addPts(100);
      showInfo('ミニトマトが実った！ +100 pt', '地下の畑で、赤いミニトマトが実りました。',
        'ISSでも小型のトマトを育てる実験が行われています。実がなる野菜は、葉物の野菜より育てるのがむずかしいとされています。', G.tomDone);
    }
  }
  if (G.phase === 'commsaim'){
    G.t += dt;
    var k = Math.min(1, G.t/2.2);
    dish.rotation.x = DISH_ROT0 + (2.95 - DISH_ROT0)*(k*k*(3-2*k));
    if (G.t > 2.4){
      G.phase = 'strun';
      showInfo('地球へ送信！', 'これまでの成果を地球に報告しました。<br>返事が届くまで待ちましょう。', '', function(){
        G.phase = 'commswait'; G.t = 0;
      });
    }
  }
  if (G.phase === 'commswait'){
    G.t += dt;
    var left = Math.max(0, Math.ceil(8 - G.t));
    banner('ミッション 11/'+NTOTAL, '地球からの返信を待っています… あと '+left+' 秒', false);
    if (G.t > 8){
      G.phase = 'strun'; addPts(100);
      showInfo('地球から返信が届いた！ +100 pt', '「よくやった！ 引き続き火星で生き抜いてくれ。」',
        '電波が火星から地球に届くまで、ふたつの星の位置によって約3分から22分かかります。ゲームでは8秒に縮めています。', G.commsDone);
    }
  }
}
function resetStations(){
  M_SOLAR_FIELD.color.setHex(0x7a5a40); M_SOLAR_FIELD.roughness = .95; M_SOLAR_FIELD.metalness = 0;
  M_RUNLAMP.emissiveIntensity = 0; M_GLASS_O2.emissiveIntensity = 0; M_GLASS_H2.emissiveIntensity = 0;
  o2fill.scale.y = h2fill.scale.y = .001; G.elT = null;
  M_HEAT.emissiveIntensity = 0; M_WATER.emissiveIntensity = 0;
  sabat.children.forEach(function(m){ if (m.material && m.material.emissive && m.material.emissive.getHex() === 0x3dff6a) m.material.emissiveIntensity = 0; });
  G.seedTaken = false; carryCase.visible = false;
  for (var i=0;i<tomato.length;i++){ tomato[i].visible = false; tomato[i].scale.setScalar(.001); }
  dish.rotation.x = DISH_ROT0;
  G.st = 0; G.stNo = false;
}
function missionTick(dt){
  stationTick(dt);
  if (G.phase === 'tobase' && Math.hypot(P.x-BASE.x, P.z-BASE.z) < 24){
    G.phase = 'oxq'; setGuide(null); cancelAnnounce();
    showQuiz('oxygen', function(){
      G.phase = 'place'; G.placeNo = false; spotRing.visible = true; setGuide(SPOT, '設置場所');
      banner('ミッション 4/'+NTOTAL, '光る輪の場所に酸素製造装置を設置しよう', false);
    });
  }
  if (G.phase === 'place'){
    var sd = Math.hypot(P.x-SPOT.x, P.z-SPOT.z);
    if (sd < 1.8 && !ask.open && !G.placeNo && !R.driving) showAsk('place');
    if (sd > 3.2){ G.placeNo = false; if (ask.open && ask.type === 'place') hideAsk(); }
  }
  if (G.phase === 'rescue' && Math.hypot(P.x-OPPY.x, P.z-OPPY.z) < 5 && !R.driving){
    G.phase = 'oppyq'; cancelAnnounce(); setGuide(null);
    showQuiz('oppy', wakeOppy);
  }
  if (G.phase === 'tofarm' && IND.on && Math.hypot(P.x-FARM.x, P.z-FARM.z) < 3.4 && !ask.open){
    showAsk('plant');
  }
  if (G.phase === 'growing'){
    growT += dt;
    var g = Math.min(1, growT/3.2);
    for (var li=0; li<lettuce.length; li++) lettuce[li].scale.setScalar((.05 + .95*g)*(.9 + .25*((li*7)%5)/5));
    if (growT > 3.6){
      G.phase = 'grown';
      showInfo('レタスが育った！', '地下の畑で、火星で初めての<span class="ok">収穫</span>ができました。',
        'ISSでは2015年から、宇宙飛行士がVeggieという装置でレタスを育てて実際に食べています。光は赤と青のLEDを使います。',
        function(){ startStation(0); });
    }
  }
  if (!G.cine && !R.driving && (G.phase === 'free' || G.phase === 'toshelter' || G.phase === 'st')){
    if (!IND.on){
      var dd = Math.hypot(P.x-DOOR.x, P.z-DOOR.z);
      if (dd < 2.2 && !ask.open && !G.doorNo) showAsk('enterbase');
      if (dd > 4){ G.doorNo = false; if (ask.open && ask.type === 'enterbase') hideAsk(); }
    } else {
      var ed = Math.hypot(P.x-INDOOR_DOOR.x, P.z-INDOOR_DOOR.z);
      if (ed < 1.8 && !ask.open && !G.doorNo) showAsk('exitbase');
      if (ed > 2.6){ G.doorNo = false; if (ask.open && ask.type === 'exitbase') hideAsk(); }
    }
  }
  if (G.bannerT > 0){ G.bannerT -= dt; if (G.bannerT <= 0) $('mission').hidden = true; }
}
var R0 = { x:R.x, z:R.z, heading:R.heading };
function restartGame(){
  if (R.driving) exitRover();
  hideAsk(); R.x = R0.x; R.z = R0.z; R.heading = R0.heading; R.speed = 0; R.declined = false;
  G.pts = 0; G.t = 0; G.bannerT = 0; G.after = null; sol = 1; tDay = .37; wx.storm = 0; wx.cloud = 0;
  jump.max = 0; jump.air = 0;
  $('mission').hidden = true; $('quiz').hidden = true; $('toast').hidden = true;
  cancelAnnounce(); resetMoxie();
  beginIntro();
}
Array.prototype.forEach.call(document.querySelectorAll('.rst'), function(b){
  var label = b.textContent, timer = 0;
  b.addEventListener('click', function(){
    if (b.classList.contains('sure')){ clearTimeout(timer); b.classList.remove('sure'); b.textContent = label; restartGame(); return; }
    b.classList.add('sure'); b.textContent = 'もう一度押す';      // two taps, so a slip does not wipe progress
    timer = setTimeout(function(){ b.classList.remove('sure'); b.textContent = label; }, 3000);
  });
});
/* ---------- BGM: title theme on the title screen + landing, main theme once on the ground; seamless crossfade loop ---------- */
var BGM = { ctx:null, gain:null, buf:{}, want:(window.__bgmFirst || 'title'), cur:null, srcs:[], timer:0, on:true, vol:.8 };
function bgmInit(){
  if (BGM.ctx) { if (BGM.ctx.state === 'suspended') BGM.ctx.resume(); return; }
  var AC = window.AudioContext || window.webkitAudioContext; if (!AC || !window.MARS_BGM) return;
  BGM.ctx = new AC(); BGM.gain = BGM.ctx.createGain(); BGM.gain.gain.value = BGM.on ? BGM.vol : 0;
  BGM.an = BGM.ctx.createAnalyser(); BGM.an.fftSize = 512; BGM.gain.connect(BGM.an); BGM.an.connect(BGM.ctx.destination);   // analyser = proof the music is really sounding (debug meter)
  bgmPlay(BGM.want); sfxInit();
}
function bgmLoad(name, cb){
  if (BGM.buf[name]) return cb(BGM.buf[name]);
  // decode the embedded base64 ourselves (no fetch of a data: URL, which the page's security policy can block)
  setTimeout(function(){
    try {
      var src = window.MARS_BGM[name];
      var done = function(ab){ BGM.ctx.decodeAudioData(ab, function(b){ BGM.buf[name] = b; cb(b); }, function(e){ console.warn('BGM decode failed', e); }); };
      if (src.indexOf('data:') === 0){                     // single-file build: base64 embedded in the page
        var b64 = src.slice(src.indexOf(',') + 1), bin = atob(b64), n = bin.length, u = new Uint8Array(n);
        for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
        done(u.buffer);
      } else {                                             // folder version: a normal file next to the page (needs a local web server)
        fetch(src).then(function(r){ return r.arrayBuffer(); }).then(done).catch(function(e){ console.warn('BGM fetch failed', e); });
      }
    } catch(e){ console.warn('BGM load failed', e); }
  }, 0);
}
function bgmStopAll(fade){
  var t = BGM.ctx.currentTime;
  BGM.srcs.forEach(function(o){ try { o.g.gain.cancelScheduledValues(t); o.g.gain.setValueAtTime(o.g.gain.value, t); o.g.gain.linearRampToValueAtTime(0, t + fade); o.s.stop(t + fade + .05); } catch(_){} });
  BGM.srcs = []; clearTimeout(BGM.timer);
}
function bgmPlay(name){
  BGM.want = name;
  if (!BGM.ctx || !name || BGM.cur === name) return;
  bgmStopAll(1.2); BGM.cur = name;
  bgmLoad(name, function(buf){ if (BGM.cur === name) bgmQueue(name, buf, BGM.ctx.currentTime + .05, 1.2); });
}
function bgmQueue(name, buf, at, fadeIn){
  var XF = 3.5, ctx = BGM.ctx, s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = buf; s.connect(g); g.connect(BGM.gain);
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(1, at + fadeIn);
  var end = at + buf.duration;
  g.gain.setValueAtTime(1, end - XF); g.gain.linearRampToValueAtTime(0, end);   // fade out while the next copy fades in
  s.start(at); s.stop(end + .05);
  var o = {s:s, g:g}; BGM.srcs.push(o);
  s.onended = function(){ var k = BGM.srcs.indexOf(o); if (k >= 0) BGM.srcs.splice(k, 1); };
  BGM.timer = setTimeout(function(){ if (BGM.cur === name) bgmQueue(name, buf, end - XF, XF); }, Math.max(0, (end - XF - ctx.currentTime - 1)*1000));
}
function bgmLevel(){ if (!BGM.an) return '-'; var d = new Float32Array(BGM.an.fftSize); BGM.an.getFloatTimeDomainData(d); var m = 0; for (var i=0;i<d.length;i++) m = Math.max(m, Math.abs(d[i])); return Math.round(m*100) + '%'; }
function bgmSetOn(on){
  BGM.on = on;                                          // not remembered: every visit starts with music on
  $('bgmbtn').setAttribute('aria-pressed', String(on)); $('bgmtitle').textContent = on ? '♪ BGM オン（押すと消す）' : '♪ BGM オフ（押すと流す）';
  if (BGM.ctx){ var t = BGM.ctx.currentTime; BGM.gain.gain.cancelScheduledValues(t); BGM.gain.gain.setValueAtTime(BGM.gain.gain.value, t); BGM.gain.gain.linearRampToValueAtTime(on ? BGM.vol : 0, t + .4); }
}
$('bgmbtn').addEventListener('click', function(){ bgmInit(); bgmSetOn(!BGM.on); });
$('bgmtitle').addEventListener('click', function(){ bgmInit(); bgmSetOn(!BGM.on); });
bgmSetOn(BGM.on);
['pointerdown','keydown','touchstart'].forEach(function(ev){ window.addEventListener(ev, bgmInit, {passive:true}); });
document.addEventListener('pointerdown', function(e){ if (e.target.closest && e.target.closest('button') && !e.target.closest('#qopts')) sfx('click'); });   // browsers only allow sound after a tap / key
document.addEventListener('visibilitychange', function(){ if (!BGM.ctx) return; if (document.hidden) BGM.ctx.suspend(); else BGM.ctx.resume(); });
/* ---------- sound effects: all synthesised with Web Audio (no files): wind / dust storm, thrusters, rover, steps, UI ---------- */
var SFX = { ready:false, bus:null, noise:null, loops:{} };
function sfxInit(){
  if (SFX.ready || !BGM.ctx) return;
  var ctx = BGM.ctx; SFX.ready = true;
  SFX.bus = ctx.createGain(); SFX.bus.gain.value = .9; SFX.bus.connect(BGM.an || ctx.destination);   // through the meter, so the debug readout shows effects too
  var len = ctx.sampleRate*2, nb = ctx.createBuffer(1, len, ctx.sampleRate), d = nb.getChannelData(0), b0 = 0;
  for (var i=0;i<len;i++){ var w = Math.random()*2-1; b0 = .97*b0 + .03*w; d[i] = w*.55 + b0*2.2; }   // white + a little brown
  SFX.noise = nb;
  function loop(name, ftype, freq, q){
    var src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
    var f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q || .7;
    var g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(SFX.bus); src.start();
    SFX.loops[name] = {f:f, g:g};
  }
  loop('wind', 'bandpass', 420, .6);       // Martian wind; louder and brighter in a dust storm
  loop('gust', 'bandpass', 1200, 3);       // whistling gusts on top
  loop('thrust', 'lowpass', 520, .8);      // lander engines during the descent
  loop('vent', 'lowpass', 180, .5);        // habitat ventilation indoors
  var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
  var of = ctx.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 380;
  var og = ctx.createGain(); og.gain.value = 0; o.connect(of); of.connect(og); og.connect(SFX.bus); o.start();
  SFX.loops.engine = {o:o, f:of, g:og};
}
function sfxSet(name, gain, freq, tc){
  var L = SFX.loops[name]; if (!L) return; var t = BGM.ctx.currentTime;
  L.g.gain.setTargetAtTime(gain, t, tc || .25);
  if (freq != null){ if (L.o) L.o.frequency.setTargetAtTime(freq, t, .15); else L.f.frequency.setTargetAtTime(freq, t, .3); }
}
var sfxT = 0;
function sfxTick(dt){
  if (!SFX.ready) return;
  sfxT -= dt; if (sfxT > 0) return; sfxT = .1;
  var storm = wx.storm || 0, wind = wx.wind || 0, ind = IND.on;
  var thrusting = G.cine && G.alt > 0 && (G.phase === 'descend' || G.phase === 'approach' || G.phase === 'wait' || G.phase === 'stormq');
  sfxSet('wind', ind ? .015 : .05 + wind*.006 + storm*.8, ind ? 160 : 300 + storm*700 + wind*12);
  sfxSet('gust', ind ? 0 : storm*.12 + (wx.devils ? .03 : 0), 900 + Math.sin(performance.now()/900)*300 + storm*600);
  sfxSet('thrust', thrusting ? (G.phase === 'descend' ? .55 : .25) : 0, G.phase === 'descend' ? 700 : 450, .4);
  sfxSet('vent', ind ? .09 : 0, 180);
  var sp = Math.abs(R.speed || 0);
  sfxSet('engine', R.driving ? .05 + sp*.012 : 0, 48 + sp*9);
}
function sfxNoise(dur, ftype, freq, vol, at){
  var ctx = BGM.ctx, t = ctx.currentTime + (at || 0), s = ctx.createBufferSource(); s.buffer = SFX.noise;
  var f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq;
  var g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(f); f.connect(g); g.connect(SFX.bus); s.start(t, Math.random()*1.5); s.stop(t + dur + .05);
}
function sfxTone(freq, dur, type, vol, at, slideTo){
  var ctx = BGM.ctx, t = ctx.currentTime + (at || 0), o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .012); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g); g.connect(SFX.bus); o.start(t); o.stop(t + dur + .05);
}
function sfx(name){
  if (!SFX.ready) return;
  switch (name){
    case 'click':  sfxTone(880, .07, 'triangle', .12); break;
    case 'pop':    sfxTone(520, .12, 'sine', .25, 0, 990); break;
    case 'step':   sfxNoise(.09, 'lowpass', IND.on ? 900 : 520, IND.on ? .22 : .16); break;
    case 'jump':   sfxNoise(.18, 'lowpass', 700, .22); sfxTone(260, .25, 'sine', .12, 0, 520); break;
    case 'land':   sfxNoise(.3, 'lowpass', 300, .45); break;
    case 'touchdown': sfxNoise(1.2, 'lowpass', 180, .9); sfxTone(70, .6, 'sine', .5, 0, 40); break;
    case 'ok':     [784, 988, 1175, 1568].forEach(function(f, i){ sfxTone(f, .35, 'triangle', .22, i*.08); }); break;
    case 'bad':    sfxTone(330, .32, 'square', .08, 0, 220); sfxTone(262, .4, 'square', .07, .16, 175); break;
    case 'coin':   sfxTone(988, .1, 'square', .08); sfxTone(1319, .3, 'square', .08, .08); break;
    case 'fanfare':[523, 659, 784, 1047].forEach(function(f, i){ sfxTone(f, i === 3 ? .6 : .18, 'triangle', .2, i*.11); }); break;
    case 'door':   sfxNoise(.9, 'highpass', 1800, .35); sfxTone(140, .5, 'sine', .15, .1, 90); break;
    case 'stairs': [0, .12, .24, .36].forEach(function(a){ sfxNoise(.08, 'lowpass', 900, .2, a); }); break;
  }
}
$('qnext').addEventListener('click', nextStep);
$('startbtn').addEventListener('click', function(){ if (window.MARS_SCHOOL_START) window.MARS_SCHOOL_START(); else startMissions(); });
$('freebtn').addEventListener('click', skipToFree);
$('mskip').addEventListener('click', skipToFree);
window.addEventListener('keydown', function(e){
  if ($('quiz').hidden) return;
  if (!G.answered && /^Digit[123]$/.test(e.code)) choose(+e.code.slice(5)-1);
  else if (G.answered && e.code === 'Enter'){ nextStep(); e.preventDefault(); }
});

/* ---------- update ---------- */
/* ---------- stairs: step onto them and you are carried to the other floor (with a quick fade) ---------- */
var STAIR = { busy:false, armX:null, armZ:null };
function stairGo(up){
  sfx('stairs');
  STAIR.busy = true; $('fade').style.opacity = 1;
  setTimeout(function(){
    if (up){ P.x = INT.x + 2.8; P.z = INT.z - 1.1; P.face = 0; }         // top of the stairs, stepping away from them
    else   { P.x = INT.x + 2.8; P.z = INT.z - 11.9; P.face = Math.PI; }  // foot of the stairs, facing the farm
    P.y = groundAt(P.x, P.z); P.vx = P.vz = P.vy = 0; P.ground = true;
    STAIR.armX = P.x; STAIR.armZ = P.z; IND.rc = null;
    setTimeout(function(){ $('fade').style.opacity = 0; STAIR.busy = false; }, 90);
  }, 210);
}
function stairTick(){
  if (!IND.on || STAIR.busy || G.cine) return;
  if (STAIR.armX !== null){                                   // must step away from the arrival spot before the stairs work again
    if (Math.hypot(P.x - STAIR.armX, P.z - STAIR.armZ) < 1.0) return;
    STAIR.armX = STAIR.armZ = null;
  }
  var lx = P.x - INT.x, lz = P.z - INT.z, ly = P.y - INT.y;
  if (lx < 1.85 || lx > 3.75) return;
  if (ly > -1.0 && lz < -2.3) stairGo(false);                  // walked into the stairwell from the dome
  else if (ly < -4.0 && lz > -11.25 && lz < -9.0) stairGo(true); // stepped onto the bottom stair from the farm
}
/* ---------- room cutaway: which interior meshes to hide for the room view ---------- */
var ROOM_1F   = { x:0, y:.4,  z:-.2,  w:12.9, d:12.9, h:2.2, cap:15 };   // dome, seen whole
var ROOM_FARM = { x:0, y:-4.6, z:-17.6, w:17.2, d:15.0, h:2.4, cap:19 };  // underground farm
var CUT = null;
function buildCut(){
  CUT = [];
  var box = new T.Box3();
  interior.updateMatrixWorld(true);
  interior.traverse(function(o){
    if (!o.isMesh) return;
    var m = o.material;
    if (m === M_LEAF || m === M_LEAF2 || m === M_TOMATO) return;       // plants are never cut
    box.setFromObject(o);
    var minY = box.min.y - INT.y, maxY = box.max.y - INT.y;
    var up = minY > -.35, floor = up ? 0 : -5;
    var size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    CUT.push({ o:o, x:(box.min.x+box.max.x)/2, z:(box.min.z+box.max.z)/2, up:up, farm:(box.min.z+box.max.z)/2 - INT.z < -10.7,
      ceil: (minY - floor) > 2.2,                                     // everything overhead: ceilings, pipes, light bars                         // ceilings, roof, ceiling ribs, light ring
      side: (maxY - floor) > 1.0 && m !== M_PANEL_IN, vis:true });     // tall things that could stand in the way
  });
}
function roomCut(cx, cz, ox, oz){
  if (!CUT) buildCut();
  var dx = cx - ox, dz = cz - oz, L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  var low = P.y - INT.y < -2.0;                                       // on the lower stairs / in the farm: drop the whole 1F
  for (var i=0;i<CUT.length;i++){
    var c = CUT[i], v = true;
    if (c.up && low) v = false;
    else if (c.farm && !low) v = false;                                 // on 1F: the farm below would peek over the walls
    else if (c.ceil) v = false;
    else if (c.side && (c.x - ox)*dx + (c.z - oz)*dz > 1.2) v = false;
    if (v !== c.vis){ c.vis = v; c.o.visible = v; }
  }
}
var OUTC = {o:null};                                   // smoothed outdoor camera distance (occlusion)
function update(dt){
  if (!paused && !G.freeze){ tDay += dt/DAY_SECONDS; if (tDay >= 1){ tDay -= 1; sol++; } }

  if (G.cine) introUpdate(dt);
  else if (!R.driving){
  var ix = (keys.r?1:0) - (keys.l?1:0) + joy.x;
  var iz = (keys.f?1:0) - (keys.b?1:0) - joy.y;
  if (G.focus){ ix = 0; iz = 0; wantJump = false; }
  if (STAIR.busy){ ix = 0; iz = 0; wantJump = false; }      // hold still while the machine is explained
  if (SCH.on){ ix = SCH.ix; iz = SCH.iz; if (!SCH.jump) wantJump = false; }
  var il = Math.hypot(ix, iz); if (il > 1){ ix /= il; iz /= il; il = 1; }
  if (il > 0.05 && !moved){ moved = true; setTimeout(function(){ $('hint').classList.add('off'); }, 2500); }
  var speed = SCH.on ? (SCH.speed || (SCH.run ? 7.5 : 3.8)) : (keys.run ? 7.5 : 3.8);
  var sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  var tvx = (-sy*iz + cy*ix)*speed, tvz = (-cy*iz - sy*ix)*speed;
  var k = 1 - Math.exp(-(P.ground ? 10 : 1.2)*dt);
  P.vx += (tvx-P.vx)*k; P.vz += (tvz-P.vz)*k;
  var oldX = P.x, oldZ = P.z;
  P.x += P.vx*dt; P.z += P.vz*dt;
  if (IND.on && !(SCH.on && SCH.free) && !insideIndoor(P.x-INT.x, P.z-INT.z)){
    if (insideIndoor(P.x-INT.x, oldZ-INT.z)) P.z = oldZ;
    else if (insideIndoor(oldX-INT.x, P.z-INT.z)) P.x = oldX;
    else { P.x = oldX; P.z = oldZ; }
    P.vx *= .2; P.vz *= .2;
  }

  for (var i=0;(IND.on || SCH.on) ? false : i<bigRocks.length;i++){
    var r = bigRocks[i], dx = P.x-r.x, dz = P.z-r.z, d = Math.hypot(dx,dz), min = r.r+.28;
    if (d < min && P.y < r.top && d > 1e-4){ P.x = r.x+dx/d*min; P.z = r.z+dz/d*min; }
  }

  for (i=0;(IND.on || SCH.on) ? false : i<solids.length;i++){
    r = solids[i]; dx = P.x-r.x; dz = P.z-r.z; d = Math.hypot(dx,dz); min = r.r+.3;
    if (d < min && d > 1e-4){ P.x = r.x+dx/d*min; P.z = r.z+dz/d*min; }
  }
  var touching = false, rd = Math.hypot(P.x-R.x, P.z-R.z);
  if (rd < 5 && !SCH.on) for (i=-1;i<=1;i++){
    var ox = R.x+Math.sin(R.heading)*1.5*i, oz = R.z+Math.cos(R.heading)*1.5*i;
    dx = P.x-ox; dz = P.z-oz; d = Math.hypot(dx,dz);
    if (d < 1.78 && d > 1e-4){ P.x = ox+dx/d*1.78; P.z = oz+dz/d*1.78; touching = true; }
  }
  if (touching && !ask.open && !R.declined) showAsk('drive');
  if (!touching && rd > 3.6){ R.declined = false; if (ask.open && ask.type === 'drive') hideAsk(); }
  var g = groundAt(P.x, P.z);
  if (P.ground){
    P.y = g;
    if (wantJump){
      P.vy = V0; P.ground = false;
      jump.y0 = g; jump.max = 0; jump.air = 0; jump.active = true;
      puff(P.x, g, P.z, .35, .8); sfx('jump');
    }
  } else {
    P.y += P.vy*dt - 0.5*gravity*dt*dt; P.vy -= gravity*dt; jump.air += dt;
    if (P.y-jump.y0 > jump.max) jump.max = P.y-jump.y0;
    if (P.y <= g && P.vy <= 0){
      P.y = g; P.vy = 0; P.ground = true; jump.active = false;
      for (var q=0;q<6;q++) puff(P.x, g, P.z, .45, 1.6);
      sfx('land');
      if (G.phase === 'jump' && jump.max > .2) jumpDone();
      else if (!SCH.on && document.body.classList.contains('compact')) toast('ジャンプ '+jump.max.toFixed(2)+' m・'+jump.air.toFixed(2)+' 秒');
    }
  }
  wantJump = false;

  var hs = Math.hypot(P.vx, P.vz);
  if (hs > 0.3){
    var want = Math.atan2(P.vx, P.vz), df = want-P.face;
    while (df > Math.PI) df -= 6.28318; while (df < -Math.PI) df += 6.28318;
    P.face += df*(1-Math.exp(-12*dt));
  }
  var prev = P.walk;
  if (P.ground) P.walk += hs*dt*2.4;
  if (P.ground && hs > 1 && Math.floor(prev/Math.PI) !== Math.floor(P.walk/Math.PI)){ puff(P.x, P.y, P.z, .22, .5); sfx('step'); }
  var amt = P.ground ? Math.min(hs/3.8, 1.3) : 0, sw = Math.sin(P.walk)*.75*amt;
  var now = performance.now()/1000;
  legL.rotation.x = sw; legR.rotation.x = -sw;
  armL.rotation.x = -sw*.9; armR.rotation.x = sw*.9;
  var up = P.ground ? 0 : 1;
  armL.rotation.z += ((-.12 - up*1.9) - armL.rotation.z)*(1-Math.exp(-10*dt));
  armR.rotation.z += ((.12 + up*1.9) - armR.rotation.z)*(1-Math.exp(-10*dt));
  if (!P.ground){ legL.rotation.x = .35; legR.rotation.x = -.25; }
  body.position.y = Math.abs(Math.sin(P.walk))*.05*amt + Math.sin(now*2)*.008;
  body.rotation.x = amt*.08;
  astro.position.set(P.x, P.y, P.z);
  astro.rotation.y = P.face;
  for (var ci=0;ci<CHARAS.length;ci++) if (CHARAS[ci].root.visible){ CHARAS[ci].blink(dt); CHARAS[ci].setDim(IND.on ? (SCH.on && SCH.dimIn ? SCH.dimIn : .82) : .62); }
  if (SCH.pose) SCH.pose(dt);
  } else driveUpdate(dt);
  if (SCH.tick) SCH.tick(dt);
  poseRover(dt);

  for (i=0;i<puffs.length;i++){
    var p = puffs[i]; if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0){ p.s.visible = false; continue; }
    var u = 1 - p.life/p.max;
    p.s.position.x += (p.vx+wx.wvx*.3)*dt; p.s.position.z += (p.vz+wx.wvz*.3)*dt; p.s.position.y += p.vy*dt;
    var sz = p.size*(1+u*3); p.s.scale.set(sz, sz, 1);
    p.s.material.opacity = (1-u)*.4;
    var b = .08 + .75*dayF; p.s.material.color.setRGB(.8*b, .52*b, .34*b);
  }

  if (!IND.on && (Math.abs(P.x-tCx) > 12 || Math.abs(P.z-tCz) > 12)) rebuildTerrain(Math.round(P.x/SNAP)*SNAP, Math.round(P.z/SNAP)*SNAP);

  var ck = 1 - Math.exp(-9*dt);
  var fx = P.x, fy = P.y+(R.driving ? 1.9 : IND.on ? .8 : 1.05), fz = P.z;
  if (G.focus){ fx = G.focus.x; fy = G.focus.y; fz = G.focus.z; }
  cam.tx += (fx-cam.tx)*ck; cam.ty += (fy-cam.ty)*ck; cam.tz += (fz-cam.tz)*ck;
  var op = Math.max(cam.pitch, 0), cp = Math.cos(op);   // below 0 the camera stays put and tilts its gaze up
  var cx = cam.tx + Math.sin(cam.yaw)*cp*cam.dist, cz = cam.tz + Math.cos(cam.yaw)*cp*cam.dist;
  var cyy = Math.max(cam.ty + Math.sin(op)*cam.dist, groundAt(cx, cz)+.45);
  if (!IND.on && !G.cine && !(R.driving && R.view === 'cockpit')){
    // outdoors: if a dome / tunnel / big machine sits between the player and the camera,
    // rise over it and look down (or, if it is too tall, move in closer)
    var vx0 = cx - cam.tx, vz0 = cz - cam.tz, L0 = Math.hypot(vx0, vz0), tmin = 1e9, topY = -1e9;
    if (L0 > .01){
      var ux = vx0/L0, uz = vz0/L0;
      for (var si=0; si<solids.length; si++){
        var so = solids[si]; if (so.r < 1.0) continue;
        var top = groundAt(so.x, so.z) + (so.r > 6 ? 6.2 : so.r > 3 ? 4.4 : 3.4);
        var ox = cam.tx - so.x, oz = cam.tz - so.z, rr = so.r + .35;
        var bq = ox*ux + oz*uz, cq = ox*ox + oz*oz - rr*rr;
        if (cq < 0) continue;                              // standing right at the wall: ignore that one
        var disc = bq*bq - cq; if (disc < 0) continue;
        var th = -bq - Math.sqrt(disc);
        if (th > 0 && th < L0){
          var yAt = cam.ty + (cyy - cam.ty)*(th/L0);     // height of the sight line where it meets the solid
          if (yAt < top){ tmin = Math.min(tmin, th); topY = Math.max(topY, top); }
        }
      }
    }
    var hW = L0, yW = cyy - cam.ty;                         // wanted horizontal distance and height above the pivot
    if (tmin < 1e9){
      var dist3 = Math.hypot(L0, yW), dy = topY + .7 - cam.ty;
      if (dy < dist3*.93){ hW = Math.sqrt(dist3*dist3 - dy*dy); yW = dy; }
      else { var f1 = Math.max(1.6, tmin - .3)/L0; hW *= f1; yW *= f1; }
    }
    if (!OUTC.o) OUTC.o = {h:hW, y:yW};
    var kk = 1 - Math.exp(-5*dt);
    OUTC.o.h += (hW-OUTC.o.h)*kk; OUTC.o.y += (yW-OUTC.o.y)*kk;
    if (L0 > .01){
      cx = cam.tx + ux*OUTC.o.h; cz = cam.tz + uz*OUTC.o.h;
      cyy = Math.max(cam.ty + OUTC.o.y, groundAt(cx, cz) + .45);
    }
  } else OUTC.o = null;
  if (IND.on){
    // fixed room camera (like a life-sim game): it frames the whole room the player is in and does not chase them.
    // drag orbits around the room centre, the wheel zooms; walls / ceilings on the camera side are cut away.
    var rm = (P.y - INT.y < -2.0) ? ROOM_FARM : ROOM_1F;
    var rp = Math.min(1.35, Math.max(.7, cam.pitch));
    var vf = camera.fov*Math.PI/360, hf = Math.atan(Math.tan(vf)*camera.aspect);
    var ay = Math.abs(Math.sin(cam.yaw)), ax = Math.abs(Math.cos(cam.yaw));
    var rw = rm.w*ax + rm.d*ay, rdp = rm.d*ax + rm.w*ay;            // room size as seen from this side
    var needV = (rdp*Math.sin(rp) + rm.h*Math.cos(rp))/2/Math.tan(vf), needH = rw/2/Math.tan(hf);
    var D = Math.max(needV, needH)*1.06*IND.zoom, cap = rm.cap*IND.zoom;
    var gx2 = INT.x + rm.x, gz2 = INT.z + rm.z, gy2 = INT.y + rm.y;
    if (D > cap){                                                    // narrow (portrait phone) screen: drift toward the player
      var f2 = Math.min(.85, (D - cap)/D*1.6); D = cap;
      gx2 += (P.x - gx2)*f2; gz2 += (P.z - gz2)*f2;
    }
    var kr = IND.rc ? 1 - Math.exp(-4*dt) : 1;
    if (!IND.rc) IND.rc = {x:gx2, y:gy2, z:gz2, d:D};
    IND.rc.x += (gx2-IND.rc.x)*kr; IND.rc.y += (gy2-IND.rc.y)*kr; IND.rc.z += (gz2-IND.rc.z)*kr; IND.rc.d += (D-IND.rc.d)*kr;
    cx = IND.rc.x + Math.sin(cam.yaw)*Math.cos(rp)*IND.rc.d;
    cz = IND.rc.z + Math.cos(cam.yaw)*Math.cos(rp)*IND.rc.d;
    cyy = IND.rc.y + Math.sin(rp)*IND.rc.d;
    roomCut(cx, cz, IND.rc.x, IND.rc.z);
  }
  camera.position.set(cx, cyy, cz);
  if (R.driving && R.view === 'cockpit'){
    rover.updateMatrixWorld();
    tmpV.set(0, 1.78, 2.45).applyMatrix4(rover.matrixWorld);
    camera.position.copy(tmpV);
    var cel = cam.cp - R.pitch, cce = Math.cos(cel);
    camera.lookAt(tmpV.x - Math.sin(cam.yaw)*cce*10, tmpV.y + Math.sin(cel)*10, tmpV.z - Math.cos(cam.yaw)*cce*10);
  }
  else if (IND.on) camera.lookAt(IND.rc.x, IND.rc.y, IND.rc.z);
  else if (cam.pitch >= 0) camera.lookAt(cam.tx, cam.ty+.25, cam.tz);
  else {
    var el = -cam.pitch, ce = Math.cos(el);
    camera.lookAt(cx - Math.sin(cam.yaw)*ce*cam.dist, cam.ty + .25*ce + Math.sin(el)*cam.dist, cz - Math.cos(cam.yaw)*ce*cam.dist);
  }
  stairTick();
  if (G.cine) introCamera(dt); else missionTick(dt);
  if (SCH.on && SCH.camFn && !G.cine) SCH.camFn(camera, dt);
  var bdx = BASE.x-P.x, bdz = BASE.z-P.z;
  $('bd').textContent = Math.round(Math.hypot(bdx, bdz));
  var bang = Math.atan2(bdx*Math.cos(cam.yaw) - bdz*Math.sin(cam.yaw), -bdx*Math.sin(cam.yaw) - bdz*Math.cos(cam.yaw));
  $('ba').style.transform = 'rotate('+bang+'rad)';
  if (G.target){
    var tdx = G.target.x-P.x, tdz = G.target.z-P.z;
    $('garrow').style.transform = 'rotate('+Math.atan2(tdx*Math.cos(cam.yaw) - tdz*Math.sin(cam.yaw), -tdx*Math.sin(cam.yaw) - tdz*Math.cos(cam.yaw))+'rad)';
    $('gdist').textContent = Math.round(Math.hypot(tdx, tdz));
  }
  sky.position.copy(camera.position); stars.position.copy(camera.position);

  updateWeather(dt);
  applySky();
  if (IND.on) applyIndoorLights();
  sun.target.position.set(P.x, P.y, P.z);
  sun.position.set(P.x+sunDir.x*160, P.y+Math.max(sunDir.y,.02)*160, P.z+sunDir.z*160);
}

function resize(){
  var w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w/h; camera.fov = w < h ? 72 : 58; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

/* ---------- go ---------- */
resize();
rebuildTerrain(Math.round(P.x/SNAP)*SNAP, Math.round(P.z/SNAP)*SNAP);
P.y = groundAt(P.x, P.z);
cam.tx = P.x; cam.ty = P.y+1.05; cam.tz = P.z;
if (!resumed) beginIntro();
var last = performance.now();
/* ---------- frame-rate meter (#debug) and automatic quality step-down ---------- */
var PERF = { n:0, acc:0, fps:60, level:0, low:0, show:/(^|#)debug$/.test(location.hash) };
var fpsEl = document.createElement('div');
fpsEl.style.cssText = 'position:fixed;z-index:9;left:50%;bottom:calc(8px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);font:12px/1.4 var(--pop);color:#4a2e1c;background:#fffaf0;border:2px solid #fff;border-radius:4px;padding:3px 8px;pointer-events:none';
fpsEl.hidden = !PERF.show; document.body.appendChild(fpsEl);
window.addEventListener('keydown', function(e){ if (e.code === 'KeyF' && e.shiftKey){ PERF.show = !PERF.show; fpsEl.hidden = !PERF.show; } });
/* debug-only helpers (#debug): G = auto-walk, 7 = outside the door, 8 = 1F, 9 = farm */
window.addEventListener('keydown', function(e){
  if (!PERF.show || !$('quiz').hidden || ask.open || R.driving) return;
  if (e.code === 'KeyG'){ keys.f = !keys.f; }
  else if (e.code === 'Digit7'){ if (IND.on) exitBase(); else { P.x = DOOR.x; P.z = DOOR.z; P.y = groundAt(P.x,P.z); P.vx=P.vz=P.vy=0; } }
  else if (e.code === 'Digit8'){ if (!IND.on) enterBase(); else { P.x = INT.x; P.z = INT.z+2.5; P.y = groundAt(P.x,P.z); } }
  else if (e.code === 'Digit0'){ startStation(G.phase === 'st' || G.phase === 'strun' ? G.st + 1 : 0); }
  else if (e.code === 'Digit6' && G.phase === 'st'){
    var S6 = STATIONS[G.st];
    if (S6.indoor && !IND.on) enterBase(); if (!S6.indoor && IND.on) exitBase();
    P.x = S6.pos.x + (S6.indoor ? 0 : 1.5); P.z = S6.pos.z + (S6.indoor ? 1.75 : S6.r*.8); P.y = groundAt(P.x,P.z); P.vx=P.vz=P.vy=0;
    cam.yaw = 0; P.face = Math.PI; IND.d = 2;
  }
  else if (e.code === 'Digit9'){ if (!IND.on) enterBase(); P.x = INT.x+2.8; P.z = INT.z-12.4; P.y = groundAt(P.x,P.z); P.vx=P.vz=P.vy=0; cam.yaw = 0; P.face = Math.PI; IND.d = 2; }
});
function perfStep(){                                  // only ever steps down, so it never flickers back and forth
  PERF.level++;
  if (PERF.level === 1){ renderer.setPixelRatio(1); resize(); }
  else if (PERF.level === 2){
    sun.shadow.mapSize.set(1024,1024); if (sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; }
    for (var i=0;i<intShadow.length;i++){ intShadow[i].castShadow = false; }
    intShadow.length = 0;
  }
  else if (PERF.level === 3){ sun.castShadow = false; SUN_SHADOW_OFF = true; renderer.setPixelRatio(.75); resize(); }
}
var SUN_SHADOW_OFF = false;
function perfTick(rawDt){
  if (document.hidden || rawDt > .5) return;
  PERF.n++; PERF.acc += rawDt;
  if (PERF.acc >= 1){
    PERF.fps = PERF.n / PERF.acc; PERF.n = 0; PERF.acc = 0;
    if (PERF.fps < 28 && PERF.level < 3 && !G.cine){ if (++PERF.low >= 3){ PERF.low = 0; perfStep(); } } else PERF.low = 0;
    if (PERF.show) fpsEl.textContent = Math.round(PERF.fps) + ' fps ・ 画質 ' + ['高','中','低','最低'][PERF.level]
      + ' ・ BGM ' + (BGM.ctx ? BGM.ctx.state + '/' + (BGM.cur||'-') + ' 音量' + bgmLevel() : 'なし');
  }
}
function frame(t){
  var raw = (t-last)/1000, dt = Math.min(raw, 0.05); last = t;
  perfTick(raw);
  update(dt); sfxTick(dt);
  seedCase.visible = !G.cine && !G.seedTaken;          // the seed box sits on the ground by the lander, never rides down with it
  if (SUN_SHADOW_OFF) sun.castShadow = false;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
/* a spare spacesuit standing by the hatch (copy of the player's suit) */
(function(){
  var spc = makeChara({}), sp = spc.root; sp.position.set(-2.1, 0, 5.2); sp.rotation.y = Math.atan2(-2.1, 5.2) + Math.PI;
  spc.head.visible = false; CHARAS.pop();                // an empty suit: no head inside, no blinking
  sp.visible = true;                                   // the player's suit is hidden during the title, so the copy starts hidden
  interior.add(sp);
  im(boxG(.9,.06,.6,.03), M_HAZ, -2.1, .03, 5.2).castShadow = false;
})();
/* ---------- school mode API (used by js/school.js) ---------- */
if (window.MARS_SCHOOL) window.MARS_SCHOOL({
  T:T, scene:scene, camera:camera, canvas:canvas, SCH:SCH, G:G, P:P, cam:cam, R:R, IND:IND, INT:INT, BASE:BASE, LANDER:LANDER, SPAWN:SPAWN, DOOR:DOOR,
  SOLAR_POS:SOLAR_POS, COMMS_POS:COMMS_POS, wx:wx, BGM:BGM, SFX:SFX, PERF:PERF, V0:V0, VMAX:VMAX, jumpInfo:jump, keys:function(){ return keys; },
  astro:astro, body:body, helmet:helmet, backpack:back, player:player, makeChara:makeChara, portrait:portrait, thumb:thumb, PROPS:PROPS, EMBLEMS:EMBLEMS, armL:armL, armR:armR, legL:legL, legR:legR, M_SUIT:M_SUIT, M_GREY:M_GREY, part:part,
  lettuce:lettuce, tomato:tomato, dish:dish, DISH_ROT0:DISH_ROT0, M_SOLAR_FIELD:M_SOLAR_FIELD, rover:rover, lander:lander, seedCase:seedCase,
  b2w:baseToWorld, groundAt:groundAt, solids:solids, bigRocks:bigRocks, puff:puff, sfx:sfx, sfxTone:sfxTone, sfxNoise:sfxNoise, setGuide:setGuide, setWeatherMode:setWeatherMode,
  setIndoor:setIndoor, enterRover:enterRover, exitRover:exitRover, setView:setView, siteMarks:siteMarks, bgmPlay:bgmPlay, bgmInit:bgmInit,
  sunDir:sunDir, interior:interior, propIn:propIn,
  setTime:function(v){ tDay = v; }, setGravity:function(g){ gravity = g; }, jump:function(){ wantJump = true; },
  setPhase:function(ph){ G.phase = ph; G.t = 0; }, restart:restartGame, freeRoam:skipToFree
});
window.__mars = { SFX:SFX, BGM:BGM, PERF:PERF, setTime:function(v){ tDay = v; }, P:P, cam:cam, wx:wx, devils:devils, R:R, enterRover:enterRover, setView:setView, SPOT:SPOT, OPPY:OPPY, IND:IND, startStation:function(i){startStation(i)}, STATIONS:STATIONS, INT:INT, FARM:FARM, DOOR:DOOR, enterBase:enterBase, G:G, LANDER:LANDER, BASE:BASE };
requestAnimationFrame(frame);
})();
