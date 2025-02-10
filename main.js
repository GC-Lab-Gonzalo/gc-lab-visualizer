import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GlitchPass } from 'three/addons/postprocessing/GlitchPass.js';

let scene, camera, renderer, composer, analyser, audioSource;
let plane, audioContext;
let particles, particlesGeometry;
let glitchPass;
let watermark;
let time = 0;
let lastBeatTime = 0;
const beatThreshold = 0.7;
const WATERMARK_SIZE = 1;

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uBeat;
  
  void main() {
    vUv = uv;
    vPosition = position;
    
    vec3 newPosition = position;
    
    // Efecto de onda expansiva en beats
    float beatWave = uBeat * sin(length(position.xy) * 4.0 - uTime * 8.0) * 0.3;
    
    // Distorsión basada en frecuencias
    float bassWave = uBass * sin(position.x * 5.0 + uTime * 2.0) * 0.4;
    float midWave = uMid * cos(position.y * 4.0 + uTime * 1.5) * 0.3;
    float trebleWave = uTreble * sin(position.z * 6.0 + uTime) * 0.2;
    
    // Combinar efectos
    newPosition += normal * (beatWave + bassWave + midWave + trebleWave);
    
    // Efecto de explosión en beats fuertes
    if(uBeat > 0.8) {
      float explosionWave = sin(length(position.xy) * 10.0 - uTime * 20.0);
      newPosition += normal * explosionWave * uBeat * 0.5;
    }
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

const fragmentShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uBeat;
  
  void main() {
    vec2 uv = vUv;
    
    // Efecto de zoom pulsante
    float zoomPulse = 1.0 + uBass * 0.2 * sin(uTime * 2.0);
    uv = (uv - 0.5) * zoomPulse + 0.5;
    
    // Distorsión de ondas
    float waveDistortion = 
      sin(uv.y * 10.0 + uTime) * uBass * 0.1 +
      cos(uv.x * 8.0 - uTime) * uTreble * 0.05;
    uv += waveDistortion;
    
    // RGB Split dinámico con preservación de alfa
    float rgbOffset = (uBass * 0.02 + uBeat * 0.03) * sin(uTime * 10.0);
    vec4 r = texture2D(uTexture, uv + vec2(rgbOffset, 0.0));
    vec4 g = texture2D(uTexture, uv);
    vec4 b = texture2D(uTexture, uv - vec2(rgbOffset, 0.0));
    vec4 color = vec4(r.r, g.g, b.b, texture2D(uTexture, uv).a);
    
    // Efecto de brillo pulsante
    float brightness = 1.0 + uBeat * sin(uTime * 20.0) * 0.3;
    color.rgb *= brightness;
    
    // Efecto de kaleidoscopio mejorado con preservación de transparencia
    if(uBeat > 0.7) {
      vec2 center = vec2(0.5);
      vec2 p = uv - center;
      float angle = atan(p.y, p.x);
      float radius = length(p);
      float segments = 8.0 + uBass * 4.0;
      angle = mod(angle, 3.14159 * 2.0 / segments);
      p = vec2(cos(angle), sin(angle)) * radius;
      vec2 kaleidoUV = p + center;
      vec4 kaleidoColor = texture2D(uTexture, kaleidoUV);
      color = mix(color, kaleidoColor, (uBeat - 0.7) * kaleidoColor.a);
    }
    
    gl_FragColor = color;
  }
`;

function createWatermark() {
    const watermarkMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { value: new THREE.Texture() }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D uTexture;
            varying vec2 vUv;
            void main() {
                vec4 color = texture2D(uTexture, vUv);
                gl_FragColor = color;
            }
        `,
        transparent: true,
        blending: THREE.NormalBlending
    });

    const watermarkGeometry = new THREE.PlaneGeometry(WATERMARK_SIZE, WATERMARK_SIZE);
    watermark = new THREE.Mesh(watermarkGeometry, watermarkMaterial);
    
    updateWatermarkPosition();
    
    scene.add(watermark);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('/path/to/your/logo.png', function(texture) {
        texture.premultiplyAlpha = false;
        watermarkMaterial.uniforms.uTexture.value = texture;
    });
}

function updateWatermarkPosition() {
    if (watermark) {
        const aspectRatio = window.innerWidth / window.innerHeight;
        const distanceFromCamera = Math.abs(camera.position.z);
        const vFov = camera.fov * Math.PI / 180;
        const height = 2 * Math.tan(vFov / 2) * distanceFromCamera;
        const width = height * aspectRatio;

        watermark.position.x = width/2 - WATERMARK_SIZE * 0.6;
        watermark.position.y = -height/2 + WATERMARK_SIZE * 0.6;
        watermark.position.z = 0;
    }
}

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: true
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.5, 0.4, 0.85
    );
    composer.addPass(bloomPass);
    
    glitchPass = new GlitchPass();
    glitchPass.enabled = false;
    composer.addPass(glitchPass);

    const uniforms = {
        uTexture: { value: new THREE.Texture() },
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uTreble: { value: 0 },
        uBeat: { value: 0 }
    };

    const material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        side: THREE.DoubleSide,
        transparent: true,
        blending: THREE.NormalBlending
    });

    const geometry = new THREE.PlaneGeometry(5, 5, 50, 50);
    plane = new THREE.Mesh(geometry, material);
    scene.add(plane);

    createParticles();
    createWatermark();

    camera.position.z = 5;

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
}

function createParticles() {
    const particleCount = 3000;
    particlesGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    
    for(let i = 0; i < particleCount * 3; i += 3) {
        const radius = 5 + Math.random() * 2;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        
        positions[i] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i + 2] = radius * Math.cos(phi);
        
        colors[i] = Math.random();
        colors[i + 1] = Math.random();
        colors[i + 2] = Math.random();
        
        sizes[i/3] = Math.random() * 0.1 + 0.02;
    }
    
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    particlesGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    const particlesMaterial = new THREE.PointsMaterial({
        size: 0.05,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthTest: false
    });
    
    particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);
}

function handleImageSelect(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const width = img.width;
                const height = img.height;
                const aspectRatio = width / height;
                const baseHeight = 5;
                const baseWidth = baseHeight * aspectRatio;
                
                const newGeometry = new THREE.PlaneGeometry(baseWidth, baseHeight, 50, 50);
                plane.geometry.dispose();
                plane.geometry = newGeometry;

                const textureLoader = new THREE.TextureLoader();
                textureLoader.load(e.target.result, function(texture) {
                    texture.premultiplyAlpha = false;
                    plane.material.uniforms.uTexture.value = texture;
                });
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function handleAudioSelect(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            if (audioSource) {
                audioSource.disconnect();
            }
            
            audioContext.decodeAudioData(e.target.result, function(buffer) {
                audioSource = audioContext.createBufferSource();
                audioSource.buffer = buffer;
                audioSource.connect(analyser);
                analyser.connect(audioContext.destination);
                audioSource.start(0);
            });
        };
        reader.readAsArrayBuffer(file);
    }
}

function detectBeat(dataArray) {
    const bass = average(dataArray.slice(0, 10)) / 255.0;
    const currentTime = performance.now();
    
    if (bass > beatThreshold && currentTime - lastBeatTime > 100) {
        lastBeatTime = currentTime;
        return true;
    }
    return false;
}

function average(array) {
    return array.reduce((a, b) => a + b) / array.length;
}

function updateParticles(bass, mid, treble, isBeat) {
    const positions = particles.geometry.attributes.position.array;
    const colors = particles.geometry.attributes.color.array;
    const sizes = particles.geometry.attributes.size.array;
    
    for(let i = 0; i < positions.length; i += 3) {
        positions[i] += Math.sin(time + i) * bass * 0.01;
        positions[i + 1] += Math.cos(time + i) * mid * 0.01;
        positions[i + 2] += Math.sin(time * 0.5 + i) * treble * 0.01;
        
        const colorIndex = i;
        const hue = (time * 0.1 + i * 0.001) % 1;
        const color = new THREE.Color().setHSL(hue, 0.7, 0.5 + treble * 0.5);
        colors[colorIndex] = color.r;
        colors[colorIndex + 1] = color.g;
        colors[colorIndex + 2] = color.b;
        
        const sizeIndex = i / 3;
        sizes[sizeIndex] = 0.05 + bass * 0.1;
    }
    
    particles.geometry.attributes.position.needsUpdate = true;
    particles.geometry.attributes.color.needsUpdate = true;
    particles.geometry.attributes.size.needsUpdate = true;
    
    particles.rotation.y += 0.002 + (bass * 0.003);
    particles.rotation.x += 0.001 + (treble * 0.002);
}

function animate() {
    requestAnimationFrame(animate);
    time += 0.01;

    if (analyser) {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);

        const bass = average(dataArray.slice(0, 10)) / 255.0;
        const mid = average(dataArray.slice(10, 100)) / 255.0;
        const treble = average(dataArray.slice(100, 256)) / 255.0;

        const isBeat = detectBeat(dataArray);
        if (isBeat) {
            glitchPass.enabled = true;
            setTimeout(() => {
                glitchPass.enabled = false;
            }, 100);
        }

        const beatValue = isBeat ? 1.0 : Math.max(0, plane.material.uniforms.uBeat.value - 0.1);

        // Actualizar uniforms
        plane.material.uniforms.uTime.value = time;
        plane.material.uniforms.uBass.value = bass;
        plane.material.uniforms.uMid.value = mid;
        plane.material.uniforms.uTreble.value = treble;
        plane.material.uniforms.uBeat.value = beatValue;

        // Actualizar partículas
        if (particles) {
            updateParticles(bass, mid, treble, isBeat);
        }
    }

    composer.render();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    updateWatermarkPosition();
}

// Inicializar
init();
animate();

// Event listeners
window.addEventListener('resize', onWindowResize, false);
document.getElementById('imageInput').addEventListener('change', handleImageSelect);
document.getElementById('audioInput').addEventListener('change', handleAudioSelect);