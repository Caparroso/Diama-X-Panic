const canvas = document.querySelector('#sceneCanvas');
const loadingState = document.querySelector('#loadingState');
const loadingLabel = document.querySelector('#loadingLabel');
const errorState = document.querySelector('#errorState');
const statusText = document.querySelector('#statusText');
const modelName = document.querySelector('#modelName');
const modelRole = document.querySelector('#modelRole');
const modelCode = document.querySelector('#modelCode');

const MODEL_LIBRARY = {
  kameo: {
    name: 'Kameo',
    role: 'Elemental warrior',
    code: '01',
    poseMode: 1,
    parts: [
      { obj: './assets/models/kameo/Kai.obj', mtl: './assets/models/kameo/Kai.mtl' },
    ],
  },
  kalus: {
    name: 'Kalus',
    role: 'Shadow boss',
    code: '02',
    poseMode: 2,
    parts: [
      { obj: './assets/models/kalus/kalus.obj', mtl: './assets/models/kalus/kalus.mtl' },
    ],
  },
  dragon: {
    name: 'Dragon',
    role: 'Airborne enemy',
    code: '03',
    parts: [
      { obj: './assets/models/dragon/dragon_cheaper.obj', mtl: './assets/models/dragon/dragon_cheaper.mtl' },
    ],
  },
  moon: {
    name: 'Moon',
    role: "Majora's Mask",
    code: '04',
    glb: './assets/models/moon/majoras-mask-moon.glb',
    fit: 'width',
    targetSize: 3.18,
    centerY: 1.76,
    startAngle: 325,
    cameraDistance: 1.4,
    mobileCameraDistance: 1.58,
  },
  diama: {
    name: 'Diama',
    role: '3D identity',
    code: 'D',
    glb: './assets/models/diama/Diama3D.glb',
    fit: 'width',
    targetSize: 3.85,
    centerY: 1.58,
    cameraDistance: 1.24,
    mobileCameraDistance: 1.7,
  },
};

const state = {
  activeKey: 'moon',
  activeModel: null,
  angle: 0,
  accent: '#78ff68',
  camera: { yaw: 0.18, pitch: 0.08, radius: 6.1 },
  pointer: null,
  lastTime: performance.now(),
};

const modelCache = new Map();
const textureCache = new Map();

const gl = canvas.getContext('webgl2', {
  alpha: true,
  antialias: true,
  premultipliedAlpha: false,
  powerPreference: 'high-performance',
});

if (!gl) {
  loadingState.hidden = true;
  errorState.hidden = false;
  errorState.querySelector('strong').textContent = 'Este navegador no puede mostrar la sala 3D';
  throw new Error('WebGL 2 is unavailable');
}

const vertexShaderSource = `#version 300 es
  precision highp float;
  layout(location = 0) in vec3 aPosition;
  layout(location = 1) in vec3 aNormal;
  layout(location = 2) in vec2 aUv;

  uniform mat4 uModel;
  uniform mat4 uViewProjection;
  uniform float uEdgeOffset;
  uniform float uPoseMode;
  uniform float uPoseGroup;
  uniform float uArmMotion;
  uniform float uTime;

  out vec3 vWorldPosition;
  out vec3 vNormal;
  out vec2 vUv;

  void main() {
    vec3 posedPosition = aPosition;
    vec3 posedNormal = aNormal;

    if (uPoseMode > 0.5 && uPoseGroup > 0.5) {
      float side = aPosition.x < 0.0 ? -1.0 : 1.0;
      float secondPose = step(1.5, uPoseMode);
      float shoulderX = mix(0.25, 0.24, secondPose);
      float shoulderY = mix(2.27, 2.34, secondPose);
      float lowerStart = mix(1.58, 2.02, secondPose);
      float lowerFull = mix(1.95, 2.2, secondPose);
      float upperStart = mix(2.72, 2.56, secondPose);
      float upperEnd = mix(2.95, 2.78, secondPose);
      float baseAngle = mix(0.88, 0.82, secondPose);
      float armMask = smoothstep(0.26, 0.5, abs(aPosition.x));
      armMask *= smoothstep(lowerStart, lowerFull, aPosition.y);
      armMask *= 1.0 - smoothstep(upperStart, upperEnd, aPosition.y);
      float armAngle = -side * (baseAngle + sin(uTime * 1.7 + side * 0.8) * 0.11 * uArmMotion);
      float cosine = cos(armAngle);
      float sine = sin(armAngle);
      vec2 shoulder = vec2(side * shoulderX, shoulderY);
      vec2 localPosition = aPosition.xy - shoulder;
      vec2 rotatedPosition = vec2(
        cosine * localPosition.x - sine * localPosition.y,
        sine * localPosition.x + cosine * localPosition.y
      ) + shoulder;
      vec2 rotatedNormal = vec2(
        cosine * aNormal.x - sine * aNormal.y,
        sine * aNormal.x + cosine * aNormal.y
      );
      posedPosition.xy = mix(aPosition.xy, rotatedPosition, armMask);
      posedNormal.xy = mix(aNormal.xy, rotatedNormal, armMask);
    }

    vec3 displaced = posedPosition + normalize(posedNormal) * uEdgeOffset;
    vec4 world = uModel * vec4(displaced, 1.0);
    vWorldPosition = world.xyz;
    vNormal = normalize(mat3(uModel) * posedNormal);
    vUv = aUv;
    gl_Position = uViewProjection * world;
  }
`;

const fragmentShaderSource = `#version 300 es
  precision highp float;

  in vec3 vWorldPosition;
  in vec3 vNormal;
  in vec2 vUv;

  uniform sampler2D uMap;
  uniform sampler2D uAlphaMap;
  uniform bool uUseMap;
  uniform bool uUseAlphaMap;
  uniform bool uOutline;
  uniform vec3 uBaseColor;
  uniform vec3 uAccent;
  uniform vec3 uCameraPosition;
  uniform vec3 uLightOne;
  uniform vec3 uLightTwo;
  uniform float uOpacity;

  out vec4 outColor;

  void main() {
    if (uOutline) {
      outColor = vec4(uAccent, uOpacity);
      return;
    }

    vec4 texel = uUseMap ? texture(uMap, vUv) : vec4(1.0);
    float alpha = texel.a * uOpacity;
    if (uUseAlphaMap) alpha *= texture(uAlphaMap, vUv).r;
    if (alpha < 0.055) discard;

    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(uCameraPosition - vWorldPosition);
    vec3 lightDirectionOne = normalize(uLightOne - vWorldPosition);
    vec3 lightDirectionTwo = normalize(uLightTwo - vWorldPosition);

    float key = max(dot(normal, lightDirectionOne), 0.0);
    float fill = max(dot(normal, lightDirectionTwo), 0.0);
    float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.45);
    vec3 halfVector = normalize(lightDirectionOne + viewDirection);
    float specular = pow(max(dot(normal, halfVector), 0.0), 28.0);

    vec3 albedo = texel.rgb * uBaseColor;
    vec3 color = albedo * (0.13 + key * 0.88 + fill * 0.28);
    color += uAccent * (fresnel * 1.42 + specular * 0.48);
    color += vec3(0.11, 0.14, 0.18) * fill;
    color = color / (color + vec3(1.0));
    color = pow(color, vec3(1.0 / 2.2));
    outColor = vec4(color, alpha);
  }
`;

const program = createProgram(vertexShaderSource, fragmentShaderSource);
const uniforms = {
  model: gl.getUniformLocation(program, 'uModel'),
  viewProjection: gl.getUniformLocation(program, 'uViewProjection'),
  edgeOffset: gl.getUniformLocation(program, 'uEdgeOffset'),
  poseMode: gl.getUniformLocation(program, 'uPoseMode'),
  poseGroup: gl.getUniformLocation(program, 'uPoseGroup'),
  armMotion: gl.getUniformLocation(program, 'uArmMotion'),
  time: gl.getUniformLocation(program, 'uTime'),
  map: gl.getUniformLocation(program, 'uMap'),
  alphaMap: gl.getUniformLocation(program, 'uAlphaMap'),
  useMap: gl.getUniformLocation(program, 'uUseMap'),
  useAlphaMap: gl.getUniformLocation(program, 'uUseAlphaMap'),
  outline: gl.getUniformLocation(program, 'uOutline'),
  baseColor: gl.getUniformLocation(program, 'uBaseColor'),
  accent: gl.getUniformLocation(program, 'uAccent'),
  cameraPosition: gl.getUniformLocation(program, 'uCameraPosition'),
  lightOne: gl.getUniformLocation(program, 'uLightOne'),
  lightTwo: gl.getUniformLocation(program, 'uLightTwo'),
  opacity: gl.getUniformLocation(program, 'uOpacity'),
};

gl.useProgram(program);
gl.uniform1i(uniforms.map, 0);
gl.uniform1i(uniforms.alphaMap, 1);
gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LEQUAL);

function createShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
}

function createProgram(vertexSource, fragmentSource) {
  const result = gl.createProgram();
  gl.attachShader(result, createShader(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(result, createShader(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(result);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(result));
  }
  return result;
}

function parseMtl(text) {
  const materials = new Map();
  let current = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const space = line.indexOf(' ');
    const keyword = space === -1 ? line : line.slice(0, space);
    const value = space === -1 ? '' : line.slice(space + 1).trim();
    if (keyword === 'newmtl') {
      current = { name: value, color: [1, 1, 1], opacity: 1, map: null, alphaMap: null };
      materials.set(value, current);
    } else if (!current) {
      continue;
    } else if (keyword === 'Kd') {
      current.color = value.split(/\s+/).slice(0, 3).map(Number);
    } else if (keyword === 'd') {
      current.opacity = Number(value);
    } else if (keyword === 'Tr') {
      current.opacity = 1 - Number(value);
    } else if (keyword === 'map_Kd') {
      current.map = value.split(/\s+/).at(-1);
    } else if (keyword === 'map_d') {
      current.alphaMap = value.split(/\s+/).at(-1);
      current.opacity = 1;
    }
  }
  return materials;
}

function parseObj(text) {
  const sourcePositions = [[0, 0, 0]];
  const sourceUvs = [[0, 0]];
  const sourceNormals = [[0, 1, 0]];
  const groups = new Map();
  let materialName = 'default';

  function getGroup() {
    if (!groups.has(materialName)) {
      groups.set(materialName, { materialName, positions: [], normals: [], uvs: [] });
    }
    return groups.get(materialName);
  }

  function resolveIndex(index, length) {
    const number = Number(index);
    return number >= 0 ? number : length + number;
  }

  function vertexData(token) {
    const [positionIndex, uvIndex, normalIndex] = token.split('/');
    return {
      position: sourcePositions[resolveIndex(positionIndex, sourcePositions.length)],
      uv: uvIndex ? sourceUvs[resolveIndex(uvIndex, sourceUvs.length)] : [0, 0],
      normal: normalIndex ? sourceNormals[resolveIndex(normalIndex, sourceNormals.length)] : null,
    };
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const pieces = line.split(/\s+/);
    const keyword = pieces.shift();
    if (keyword === 'v') sourcePositions.push(pieces.slice(0, 3).map(Number));
    else if (keyword === 'vt') sourceUvs.push(pieces.slice(0, 2).map(Number));
    else if (keyword === 'vn') sourceNormals.push(pieces.slice(0, 3).map(Number));
    else if (keyword === 'usemtl') materialName = pieces.join(' ');
    else if (keyword === 'f') {
      const vertices = pieces.map(vertexData);
      for (let i = 1; i < vertices.length - 1; i += 1) {
        const triangle = [vertices[0], vertices[i], vertices[i + 1]];
        let faceNormal = null;
        if (triangle.some((vertex) => !vertex.normal)) {
          faceNormal = triangleNormal(triangle[0].position, triangle[1].position, triangle[2].position);
        }
        const group = getGroup();
        for (const vertex of triangle) {
          group.positions.push(...vertex.position);
          group.normals.push(...(vertex.normal || faceNormal));
          group.uvs.push(...vertex.uv);
        }
      }
    }
  }
  return [...groups.values()];
}

function triangleNormal(a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return normalize3([
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ]);
}

function parseGlb(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
    throw new Error('Unsupported GLB file');
  }

  let offset = 12;
  let document;
  let binaryChunk;
  while (offset < arrayBuffer.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    offset += 8;
    const chunk = arrayBuffer.slice(offset, offset + chunkLength);
    if (chunkType === 0x4e4f534a) {
      document = JSON.parse(new TextDecoder().decode(chunk).replace(/\0+$/g, '').trim());
    } else if (chunkType === 0x004e4942) {
      binaryChunk = chunk;
    }
    offset += chunkLength;
  }

  if (!document || !binaryChunk) throw new Error('Incomplete GLB file');

  const identity = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);

  function nodeMatrix(node) {
    if (node.matrix) return new Float32Array(node.matrix);
    const [x, y, z, w] = node.rotation || [0, 0, 0, 1];
    const [sx, sy, sz] = node.scale || [1, 1, 1];
    const [tx, ty, tz] = node.translation || [0, 0, 0];
    return new Float32Array([
      (1 - 2 * y * y - 2 * z * z) * sx,
      (2 * x * y + 2 * z * w) * sx,
      (2 * x * z - 2 * y * w) * sx,
      0,
      (2 * x * y - 2 * z * w) * sy,
      (1 - 2 * x * x - 2 * z * z) * sy,
      (2 * y * z + 2 * x * w) * sy,
      0,
      (2 * x * z + 2 * y * w) * sz,
      (2 * y * z - 2 * x * w) * sz,
      (1 - 2 * x * x - 2 * y * y) * sz,
      0,
      tx, ty, tz, 1,
    ]);
  }

  function transformPosition(position, matrix) {
    const [x, y, z] = position;
    return [
      matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
      matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
      matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    ];
  }

  function transformNormal(normal, matrix) {
    const [x, y, z] = normal;
    return normalize3([
      matrix[0] * x + matrix[4] * y + matrix[8] * z,
      matrix[1] * x + matrix[5] * y + matrix[9] * z,
      matrix[2] * x + matrix[6] * y + matrix[10] * z,
    ]);
  }

  function readAccessor(index) {
    const accessor = document.accessors[index];
    const bufferView = document.bufferViews[accessor.bufferView];
    const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
    const componentBytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType];
    const stride = bufferView.byteStride || components * componentBytes;
    const start = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const source = new DataView(binaryChunk);
    const values = [];
    const readers = {
      5121: (byteOffset) => source.getUint8(byteOffset),
      5123: (byteOffset) => source.getUint16(byteOffset, true),
      5125: (byteOffset) => source.getUint32(byteOffset, true),
      5126: (byteOffset) => source.getFloat32(byteOffset, true),
    };
    const read = readers[accessor.componentType];
    for (let item = 0; item < accessor.count; item += 1) {
      const itemOffset = start + item * stride;
      for (let component = 0; component < components; component += 1) {
        values.push(read(itemOffset + component * componentBytes));
      }
    }
    return { values, components };
  }

  function imageSource(textureInfo) {
    if (!textureInfo) return null;
    const texture = document.textures?.[textureInfo.index];
    const image = texture && document.images?.[texture.source];
    if (!image) return null;
    if (image.uri) return image.uri;
    if (image.bufferView === undefined) return null;
    const imageView = document.bufferViews[image.bufferView];
    const start = imageView.byteOffset || 0;
    const bytes = binaryChunk.slice(start, start + imageView.byteLength);
    return URL.createObjectURL(new Blob([bytes], { type: image.mimeType || 'image/png' }));
  }

  function materialFor(primitive) {
    const source = document.materials?.[primitive.material] || {};
    const pbr = source.pbrMetallicRoughness || {};
    const baseColor = pbr.baseColorFactor || [1, 1, 1, 1];
    return {
      color: baseColor.slice(0, 3),
      opacity: source.alphaMode === 'BLEND' ? baseColor[3] : 1,
      map: imageSource(pbr.baseColorTexture || source.emissiveTexture),
      flipY: false,
    };
  }

  const meshInstances = [];
  function visitNode(nodeIndex, parentMatrix) {
    const node = document.nodes?.[nodeIndex];
    if (!node) return;
    const worldMatrix = multiply4(parentMatrix, nodeMatrix(node));
    if (node.mesh !== undefined) meshInstances.push({ meshIndex: node.mesh, matrix: worldMatrix });
    for (const child of node.children || []) visitNode(child, worldMatrix);
  }

  const activeScene = document.scenes?.[document.scene || 0];
  for (const root of activeScene?.nodes || []) visitNode(root, identity);
  if (!meshInstances.length) {
    (document.meshes || []).forEach((mesh, meshIndex) => meshInstances.push({ meshIndex, matrix: identity }));
  }

  const groups = [];
  for (const instance of meshInstances) {
    const mesh = document.meshes[instance.meshIndex];
    for (const primitive of mesh.primitives || []) {
      if (primitive.mode !== undefined && primitive.mode !== 4) continue;
      const positionAccessor = readAccessor(primitive.attributes.POSITION);
      const normalAccessor = primitive.attributes.NORMAL === undefined ? null : readAccessor(primitive.attributes.NORMAL);
      const uvAccessor = primitive.attributes.TEXCOORD_0 === undefined ? null : readAccessor(primitive.attributes.TEXCOORD_0);
      const indices = primitive.indices === undefined
        ? Array.from({ length: positionAccessor.values.length / 3 }, (_, index) => index)
        : readAccessor(primitive.indices).values;
      const group = {
        materialName: document.materials?.[primitive.material]?.name || `glb-material-${primitive.material || 0}`,
        material: materialFor(primitive),
        positions: [],
        normals: [],
        uvs: [],
      };
      for (let index = 0; index < indices.length; index += 3) {
        const vertexIndices = indices.slice(index, index + 3);
        const triangle = vertexIndices.map((vertexIndex) => {
          const startIndex = vertexIndex * positionAccessor.components;
          return transformPosition(positionAccessor.values.slice(startIndex, startIndex + 3), instance.matrix);
        });
        const faceNormal = triangleNormal(triangle[0], triangle[1], triangle[2]);
        for (let vertex = 0; vertex < triangle.length; vertex += 1) {
          const vertexIndex = vertexIndices[vertex];
          const position = triangle[vertex];
          const normalStart = normalAccessor ? vertexIndex * normalAccessor.components : 0;
          const uvStart = uvAccessor ? vertexIndex * uvAccessor.components : 0;
          const normal = normalAccessor
            ? transformNormal(normalAccessor.values.slice(normalStart, normalStart + 3), instance.matrix)
            : faceNormal;
          const uv = uvAccessor ? uvAccessor.values.slice(uvStart, uvStart + 2) : [0, 0];
          group.positions.push(...position);
          group.normals.push(...normal);
          group.uvs.push(...uv);
        }
      }
      groups.push(group);
    }
  }
  return groups;
}

async function loadModel(key) {
  if (modelCache.has(key)) return modelCache.get(key);
  const definition = MODEL_LIBRARY[key];
  const promise = (async () => {
    let rawGroups = [];
    if (definition.glb) {
      const response = await fetch(definition.glb);
      if (!response.ok) throw new Error(`Missing model files for ${key}`);
      rawGroups = parseGlb(await response.arrayBuffer()).map((group) => ({
        ...group,
        material: group.material || { color: [0.82, 0.85, 0.88], opacity: 1 },
        directory: new URL('.', new URL(definition.glb, location.href)),
      }));
    } else {
      for (const part of definition.parts) {
        const [objResponse, mtlResponse] = await Promise.all([fetch(part.obj), fetch(part.mtl)]);
        if (!objResponse.ok || !mtlResponse.ok) throw new Error(`Missing model files for ${key}`);
        const [objText, mtlText] = await Promise.all([objResponse.text(), mtlResponse.text()]);
        const materials = parseMtl(mtlText);
        const directory = new URL('.', new URL(part.obj, location.href));
        for (const group of parseObj(objText)) {
          rawGroups.push({ ...group, material: materials.get(group.materialName) || { color: [0.72, 0.72, 0.72], opacity: 1 }, directory });
        }
      }
    }

    normalizeGeometry(rawGroups, definition);
    const gpuGroups = [];
    for (const group of rawGroups) {
      const material = group.material;
      const [mapTexture, alphaTexture] = await Promise.all([
        material.map ? loadTexture(new URL(material.map, group.directory).href, material.flipY !== false) : null,
        material.alphaMap ? loadTexture(new URL(material.alphaMap, group.directory).href, material.flipY !== false) : null,
      ]);
      const visibleColor = material.map ? [1, 1, 1] : material.color;
      gpuGroups.push(createGeometryGroup(group, {
        color: visibleColor,
        opacity: Number.isFinite(material.opacity) ? material.opacity : 1,
        mapTexture,
        alphaTexture,
        transparent: Boolean(material.alphaMap) || material.opacity < 0.999,
        poseGroup: key === 'kameo' || (
          key === 'kalus' && !['texturefile_135', 'texturefile_137', 'texturefile_138'].includes(group.materialName)
        ) ? 1 : 0,
      }));
    }
    gpuGroups.sort((a, b) => Number(a.material.transparent) - Number(b.material.transparent));
    return { groups: gpuGroups, poseMode: definition.poseMode || 0 };
  })();
  modelCache.set(key, promise);
  return promise;
}

function normalizeGeometry(groups, definition = {}) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const group of groups) {
    for (let i = 0; i < group.positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], group.positions[i + axis]);
        max[axis] = Math.max(max[axis], group.positions[i + axis]);
      }
    }
  }
  const dimensions = max.map((value, axis) => value - min[axis]);
  const centerX = (min[0] + max[0]) / 2;
  const centerY = (min[1] + max[1]) / 2;
  const centerZ = (min[2] + max[2]) / 2;
  const dominantSize = definition.fit === 'width'
    ? Math.max(dimensions[0], 0.0001)
    : Math.max(dimensions[1], dimensions[0] * 0.72, dimensions[2] * 0.72, 0.0001);
  const scale = (definition.targetSize || 3.18) / dominantSize;
  for (const group of groups) {
    for (let i = 0; i < group.positions.length; i += 3) {
      group.positions[i] = (group.positions[i] - centerX) * scale;
      group.positions[i + 1] = definition.fit === 'width'
        ? (group.positions[i + 1] - centerY) * scale + (definition.centerY || 1.55)
        : (group.positions[i + 1] - min[1]) * scale + 0.24;
      group.positions[i + 2] = (group.positions[i + 2] - centerZ) * scale;
    }
  }
}

function createGeometryGroup(group, material) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  bindAttribute(0, group.positions, 3);
  bindAttribute(1, group.normals, 3);
  bindAttribute(2, group.uvs, 2);
  gl.bindVertexArray(null);
  return { vao, count: group.positions.length / 3, material };
}

function bindAttribute(location, values, size) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
}

function loadTexture(url, flipY = true) {
  const cacheKey = `${url}::${flipY}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);
  const promise = new Promise((resolve) => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    const image = new Image();
    image.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      resolve(texture);
    };
    image.onerror = () => resolve(texture);
    image.src = url;
  });
  textureCache.set(cacheKey, promise);
  return promise;
}

async function switchModel(key) {
  if (!MODEL_LIBRARY[key]) return;
  state.activeKey = key;
  const definition = MODEL_LIBRARY[key];
  document.querySelectorAll('.model-select-button').forEach((button) => {
    const active = button.dataset.model === key;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  modelName.textContent = definition.name;
  modelRole.textContent = definition.role;
  modelCode.textContent = definition.code;
  loadingLabel.textContent = `Preparando a ${definition.name}`;
  loadingState.hidden = false;
  loadingState.classList.remove('is-hidden');
  errorState.hidden = true;
  canvas.classList.add('is-switching');
  statusText.textContent = 'CARGANDO MODELO';
  try {
    const model = await loadModel(key);
    if (state.activeKey !== key) return;
    state.activeModel = model;
    state.angle = definition.startAngle || 0;
    statusText.textContent = `${definition.name.toUpperCase()} // EN LÍNEA`;
    canvas.classList.remove('is-switching');
    loadingState.classList.add('is-hidden');
    window.setTimeout(() => { loadingState.hidden = true; }, 320);
  } catch (error) {
    console.error(error);
    loadingState.hidden = true;
    errorState.hidden = false;
    statusText.textContent = 'ERROR DE CARGA';
  }
}

function render(time) {
  resizeCanvas();
  const delta = Math.min((time - state.lastTime) / 1000, 0.05);
  state.lastTime = time;
  state.angle = (state.angle + delta * 22) % 360;

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  if (state.activeModel) {
    const aspect = canvas.width / canvas.height;
    const projection = perspective(Math.PI / 4.6, aspect, 0.1, 100);
    const target = [0, 1.48, 0];
    const responsiveDistance = canvas.clientWidth < 600 ? 1.22 : canvas.clientWidth < 900 ? 1.08 : 1;
    const activeDefinition = MODEL_LIBRARY[state.activeKey];
    const modelDistance = canvas.clientWidth < 600
      ? (activeDefinition.mobileCameraDistance || activeDefinition.cameraDistance || 1)
      : (activeDefinition.cameraDistance || 1);
    const cameraRadius = state.camera.radius * responsiveDistance * modelDistance;
    const cameraPosition = [
      target[0] + cameraRadius * Math.sin(state.camera.yaw) * Math.cos(state.camera.pitch),
      target[1] + cameraRadius * Math.sin(state.camera.pitch),
      target[2] + cameraRadius * Math.cos(state.camera.yaw) * Math.cos(state.camera.pitch),
    ];
    const view = lookAt(cameraPosition, target, [0, 1, 0]);
    const viewProjection = multiply4(projection, view);
    const bob = Math.sin(time * 0.0013) * 0.045;
    const model = rotationYTranslation((state.angle * Math.PI) / 180, bob);
    const accent = hexToRgb(state.accent);

    gl.useProgram(program);
    gl.uniformMatrix4fv(uniforms.model, false, model);
    gl.uniformMatrix4fv(uniforms.viewProjection, false, viewProjection);
    gl.uniform3fv(uniforms.accent, accent);
    gl.uniform3fv(uniforms.cameraPosition, cameraPosition);
    gl.uniform3f(uniforms.lightOne, 0, 6.6, 2.6);
    gl.uniform3f(uniforms.lightTwo, -3.1, 2.1, -2.5);
    gl.uniform1f(uniforms.poseMode, state.activeModel.poseMode);
    gl.uniform1f(uniforms.armMotion, 1);
    gl.uniform1f(uniforms.time, time * 0.001);

    drawOutline(state.activeModel.groups);
    drawSurface(state.activeModel.groups);
  }

  requestAnimationFrame(render);
}

function drawOutline(groups) {
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.depthMask(false);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.FRONT);
  gl.uniform1i(uniforms.outline, 1);
  gl.uniform1i(uniforms.useMap, 0);
  gl.uniform1i(uniforms.useAlphaMap, 0);
  for (const [offset, opacity] of [[0.115, 0.022], [0.068, 0.046], [0.024, 0.58]]) {
    gl.uniform1f(uniforms.edgeOffset, offset);
    gl.uniform1f(uniforms.opacity, opacity);
    for (const group of groups) {
      gl.uniform1f(uniforms.poseGroup, group.material.poseGroup);
      gl.bindVertexArray(group.vao);
      gl.drawArrays(gl.TRIANGLES, 0, group.count);
    }
  }
  gl.disable(gl.CULL_FACE);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

function drawSurface(groups) {
  gl.uniform1i(uniforms.outline, 0);
  gl.uniform1f(uniforms.edgeOffset, 0);
  for (const group of groups) {
    const material = group.material;
    gl.uniform1f(uniforms.poseGroup, material.poseGroup);
    if (material.transparent) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
    } else {
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    }
    gl.uniform3fv(uniforms.baseColor, material.color);
    gl.uniform1f(uniforms.opacity, material.opacity);
    gl.uniform1i(uniforms.useMap, Boolean(material.mapTexture));
    gl.uniform1i(uniforms.useAlphaMap, Boolean(material.alphaTexture));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, material.mapTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, material.alphaTexture);
    gl.bindVertexArray(group.vao);
    gl.drawArrays(gl.TRIANGLES, 0, group.count);
  }
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);
}

function resizeCanvas() {
  const density = Math.min(window.devicePixelRatio || 1, 1.75);
  const width = Math.max(1, Math.floor(canvas.clientWidth * density));
  const height = Math.max(1, Math.floor(canvas.clientHeight * density));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function updateAccent(hex) {
  state.accent = hex;
  const [r, g, b] = hexToRgb(hex).map((value) => Math.round(value * 255));
  document.documentElement.style.setProperty('--accent', hex);
  document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  document.querySelectorAll('.swatch').forEach((button) => {
    const active = button.dataset.color.toLowerCase() === hex.toLowerCase();
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

document.querySelectorAll('.model-select-button').forEach((button) => {
  button.addEventListener('click', () => switchModel(button.dataset.model));
});

document.querySelectorAll('.swatch').forEach((button) => {
  button.addEventListener('click', () => updateAccent(button.dataset.color));
});

document.querySelector('#retryButton').addEventListener('click', () => switchModel(state.activeKey));

canvas.addEventListener('pointerdown', (event) => {
  state.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
  if (!state.pointer || state.pointer.id !== event.pointerId) return;
  const dx = event.clientX - state.pointer.x;
  const dy = event.clientY - state.pointer.y;
  state.camera.yaw -= dx * 0.007;
  state.camera.pitch = clamp(state.camera.pitch + dy * 0.006, -0.22, 0.62);
  state.pointer.x = event.clientX;
  state.pointer.y = event.clientY;
});

canvas.addEventListener('pointerup', (event) => {
  if (state.pointer?.id === event.pointerId) state.pointer = null;
});

canvas.addEventListener('pointercancel', () => { state.pointer = null; });
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  state.camera.radius = clamp(state.camera.radius + event.deltaY * 0.004, 3.8, 9.2);
}, { passive: false });

window.addEventListener('keydown', (event) => {
  if (event.key === '1') switchModel('kameo');
  if (event.key === '2') switchModel('kalus');
  if (event.key === '3') switchModel('dragon');
  if (event.key === '4') switchModel('diama');
});

function hexToRgb(hex) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalize3(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return vector.map((value) => value / length);
}

function perspective(fieldOfView, aspect, near, far) {
  const f = 1 / Math.tan(fieldOfView / 2);
  const rangeInverse = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * rangeInverse, -1,
    0, 0, near * far * 2 * rangeInverse, 0,
  ]);
}

function lookAt(eye, target, up) {
  const z = normalize3([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = normalize3([
    up[1] * z[2] - up[2] * z[1],
    up[2] * z[0] - up[0] * z[2],
    up[0] * z[1] - up[1] * z[0],
  ]);
  const y = [
    z[1] * x[2] - z[2] * x[1],
    z[2] * x[0] - z[0] * x[2],
    z[0] * x[1] - z[1] * x[0],
  ];
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1,
  ]);
}

function multiply4(a, b) {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let index = 0; index < 4; index += 1) {
        sum += a[row + index * 4] * b[index + column * 4];
      }
      result[row + column * 4] = sum;
    }
  }
  return result;
}

function rotationYTranslation(angle, verticalOffset) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return new Float32Array([
    cosine, 0, -sine, 0,
    0, 1, 0, 0,
    sine, 0, cosine, 0,
    0, verticalOffset, 0, 1,
  ]);
}

switchModel('moon');
requestAnimationFrame(render);
