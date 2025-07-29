let videoElement = null;
let canvasElement = null;
let canvasCtx = null;
let holistic = null;
let camera = null;
let lastFrameTime = 0;
let frameCount = 0;

// Enhanced color schemes for different body parts with more detail
const BODY_PARTS = {
  face: { 
    color: '#FF6B9D', 
    size: 2, 
    connections: [
      // Face oval
      [10, 338], [338, 297], [297, 332], [332, 284], [284, 251], [251, 389], [389, 356], [356, 454],
      [454, 323], [323, 361], [361, 288], [288, 397], [397, 365], [365, 379], [379, 378], [378, 400],
      [400, 377], [377, 152], [152, 148], [148, 176], [176, 149], [149, 150], [150, 136], [136, 172],
      [172, 58], [58, 132], [132, 93], [93, 234], [234, 127], [127, 162], [162, 21], [21, 54],
      [54, 103], [103, 67], [67, 109], [109, 10]
    ]
  },
  leftEye: { color: '#4ECDC4', size: 1.5, connections: [[33, 7], [7, 163], [163, 144], [144, 145], [145, 153], [153, 154], [154, 155], [155, 133], [33, 246], [246, 161], [161, 160], [160, 159], [159, 158], [158, 157], [157, 173], [173, 133]] },
  rightEye: { color: '#45B7D1', size: 1.5, connections: [[362, 382], [382, 381], [381, 380], [380, 374], [374, 373], [373, 390], [390, 249], [249, 263], [362, 398], [398, 384], [384, 385], [385, 386], [386, 387], [387, 388], [388, 466], [466, 263]] },
  lips: { color: '#FF9FF3', size: 2, connections: [[61, 84], [84, 17], [17, 314], [314, 405], [405, 320], [320, 307], [307, 375], [375, 321], [321, 308], [308, 324], [324, 318], [318, 402], [402, 317], [317, 14], [14, 87], [87, 178], [178, 88], [88, 95], [95, 78], [78, 191], [191, 80], [80, 81], [81, 82], [82, 13], [13, 312], [312, 311], [311, 310], [310, 415], [415, 308]] },
  leftArm: { 
    color: '#4ECDC4', 
    size: 6, 
    connections: [[11, 13], [13, 15], [15, 17], [17, 19], [19, 21], [15, 21]]
  },
  rightArm: { 
    color: '#45B7D1', 
    size: 6, 
    connections: [[12, 14], [14, 16], [16, 18], [18, 20], [20, 22], [16, 22]]
  },
  leftHand: { color: '#96CEB4', size: 3, connections: [] }, // Will be populated with detailed hand connections
  rightHand: { color: '#FECA57', size: 3, connections: [] },
  torso: { 
    color: '#96CEB4', 
    size: 8, 
    connections: [[11, 12], [11, 23], [12, 24], [23, 24], [11, 24], [12, 23]]
  },
  leftLeg: { 
    color: '#FECA57', 
    size: 7, 
    connections: [[23, 25], [25, 27], [27, 29], [29, 31], [27, 31]]
  },
  rightLeg: { 
    color: '#FF9FF3', 
    size: 7, 
    connections: [[24, 26], [26, 28], [28, 30], [30, 32], [28, 32]]
  },
  spine: { 
    color: '#54A0FF', 
    size: 9, 
    connections: [[11, 23], [12, 24], [(11+12)/2, (23+24)/2]]
  }
};

// Add detailed hand connections
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // Index
  [5, 9], [9, 10], [10, 11], [11, 12], // Middle
  [9, 13], [13, 14], [14, 15], [15, 16], // Ring
  [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
  [0, 17] // Palm
];

BODY_PARTS.leftHand.connections = HAND_CONNECTIONS;
BODY_PARTS.rightHand.connections = HAND_CONNECTIONS;

function showError(message) {
  const errorElement = document.getElementById('error-message');
  errorElement.innerHTML = `
    <h3>Tracking Error</h3>
    <p>${message}</p>
    <small>Please ensure camera permissions are granted and you're using a supported browser (Chrome 91+, Firefox 90+, Safari 15+)</small>
  `;
  errorElement.style.display = 'block';
}

function updateFPS() {
  frameCount++;
  const now = performance.now();
  if (now - lastFrameTime >= 1000) {
    document.getElementById('fps').textContent = frameCount;
    frameCount = 0;
    lastFrameTime = now;
  }
}

function checkWebGLSupport() {
  try {
    const canvas = document.createElement('canvas');
    const contextTypes = ['webgl2', 'webgl', 'experimental-webgl'];
    
    for (const type of contextTypes) {
      try {
        const gl = canvas.getContext(type, {
          failIfMajorPerformanceCaveat: false,
          powerPreference: 'high-performance',
          antialias: false,
          stencil: false,
          depth: false,
          preserveDrawingBuffer: false,
          premultipliedAlpha: false
        });
        if (gl) {
          // Test WebGL functionality
          gl.clearColor(0, 0, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          return true;
        }
      } catch (e) {
        console.warn(`Failed to create ${type} context:`, e);
        continue;
      }
    }
    return false;
  } catch (error) {
    console.error('WebGL support check failed:', error);
    return false;
  }
}

async function setupCamera() {
  try {
    const constraints = {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
        frameRate: { ideal: 60, max: 60 }
      }
    };
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = stream;
    
    return new Promise((resolve) => {
      videoElement.onloadedmetadata = () => {
        videoElement.play();
        resolve();
      };
    });
  } catch (error) {
    throw new Error(`Camera access denied or not available: ${error.message}`);
  }
}

async function initializeElements() {
  videoElement = document.getElementById('video');
  canvasElement = document.getElementById('output');
  canvasCtx = canvasElement.getContext('2d', {
    alpha: true,
    desynchronized: true,
    willReadFrequently: false
  });

  if (!videoElement || !canvasElement || !canvasCtx) {
    throw new Error('Required elements not found');
  }

  canvasElement.width = 1280;
  canvasElement.height = 720;
}

function drawConnections(landmarks, connections, color, lineWidth = 3) {
  if (!landmarks || !connections) return;
  
  const width = canvasElement.width;
  const height = canvasElement.height;
  
  canvasCtx.strokeStyle = color;
  canvasCtx.lineWidth = lineWidth;
  canvasCtx.shadowColor = color;
  canvasCtx.shadowBlur = 8;
  
  connections.forEach(([startIdx, endIdx]) => {
    const start = landmarks[startIdx];
    const end = landmarks[endIdx];
    
    if (start && end) {
      const startVisible = start.visibility !== undefined ? start.visibility > 0.3 : true;
      const endVisible = end.visibility !== undefined ? end.visibility > 0.3 : true;
      
      if (startVisible && endVisible) {
        canvasCtx.beginPath();
        canvasCtx.moveTo(start.x * width, start.y * height);
        canvasCtx.lineTo(end.x * width, end.y * height);
        canvasCtx.stroke();
      }
    }
  });
  
  canvasCtx.shadowBlur = 0;
}

function drawLandmarks(landmarks, color, size = 3, minVisibility = 0.3) {
  if (!landmarks) return;
  
  const width = canvasElement.width;
  const height = canvasElement.height;
  
  landmarks.forEach((landmark, index) => {
    const visible = landmark.visibility !== undefined ? landmark.visibility > minVisibility : true;
    
    if (visible) {
      const x = landmark.x * width;
      const y = landmark.y * height;
      
      // Outer glow
      canvasCtx.shadowColor = color;
      canvasCtx.shadowBlur = 15;
      canvasCtx.fillStyle = color;
      canvasCtx.beginPath();
      canvasCtx.arc(x, y, size * 1.5, 0, 2 * Math.PI);
      canvasCtx.fill();
      
      // Inner dot
      canvasCtx.shadowBlur = 0;
      canvasCtx.fillStyle = '#FFFFFF';
      canvasCtx.beginPath();
      canvasCtx.arc(x, y, size * 0.5, 0, 2 * Math.PI);
      canvasCtx.fill();
    }
  });
}

async function initializeHolistic() {
  try {
    // Check WebGL support first
    if (!checkWebGLSupport()) {
      throw new Error('WebGL not properly supported. Please update your browser or enable hardware acceleration.');
    }
    
    // Initialize elements
    await initializeElements();

    // Setup camera
    await setupCamera();

    // Initialize MediaPipe Holistic for comprehensive tracking
    holistic = new Holistic({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/${file}`;
      }
    });

    holistic.setOptions({
      modelComplexity: 2,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: false,
      refineFaceLandmarks: true,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7
    });

    holistic.onResults(onResults);

    // Start camera with optimized settings
    camera = new Camera(videoElement, {
      onFrame: async () => {
        if (holistic && videoElement && videoElement.readyState === 4) {
          try {
            await holistic.send({image: videoElement});
          } catch (error) {
            console.error('Error in holistic detection:', error);
          }
        }
      },
      width: 1280,
      height: 720
    });
    
    await camera.start();
    
    // Remove loading indicator
    document.querySelector('.container').classList.add('loaded');
    
  } catch (error) {
    console.error('Error initializing:', error);
    showError(`Error: ${error.message || 'Failed to initialize comprehensive body tracking'}`);
  }
}

function onResults(results) {
  if (!canvasCtx || !canvasElement) return;

  updateFPS();
  
  // Clear canvas with subtle trail effect for smoother visuals
  canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.03)';
  canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
  
  let totalLandmarks = 0;
  
  // Draw face mesh with detailed tracking
  if (results.faceLandmarks) {
    totalLandmarks += results.faceLandmarks.length;
    
    // Draw face outline
    drawConnections(results.faceLandmarks, BODY_PARTS.face.connections, BODY_PARTS.face.color, 2);
    
    // Draw detailed facial features
    drawConnections(results.faceLandmarks, BODY_PARTS.leftEye.connections, BODY_PARTS.leftEye.color, 1.5);
    drawConnections(results.faceLandmarks, BODY_PARTS.rightEye.connections, BODY_PARTS.rightEye.color, 1.5);
    drawConnections(results.faceLandmarks, BODY_PARTS.lips.connections, BODY_PARTS.lips.color, 2);
    
    // Draw face landmarks
    drawLandmarks(results.faceLandmarks, BODY_PARTS.face.color, 1, 0);
  }
  
  // Draw pose with enhanced detail
  if (results.poseLandmarks) {
    totalLandmarks += results.poseLandmarks.filter(lm => lm.visibility > 0.3).length;
    
    // Draw body connections
    drawConnections(results.poseLandmarks, BODY_PARTS.torso.connections, BODY_PARTS.torso.color, 4);
    drawConnections(results.poseLandmarks, BODY_PARTS.leftArm.connections, BODY_PARTS.leftArm.color, 3);
    drawConnections(results.poseLandmarks, BODY_PARTS.rightArm.connections, BODY_PARTS.rightArm.color, 3);
    drawConnections(results.poseLandmarks, BODY_PARTS.leftLeg.connections, BODY_PARTS.leftLeg.color, 3);
    drawConnections(results.poseLandmarks, BODY_PARTS.rightLeg.connections, BODY_PARTS.rightLeg.color, 3);
    
    // Draw pose landmarks
    drawLandmarks(results.poseLandmarks, '#00FFFF', 4, 0.3);
  }
  
  // Draw detailed hand tracking
  if (results.leftHandLandmarks) {
    totalLandmarks += results.leftHandLandmarks.length;
    drawConnections(results.leftHandLandmarks, BODY_PARTS.leftHand.connections, BODY_PARTS.leftHand.color, 2);
    drawLandmarks(results.leftHandLandmarks, BODY_PARTS.leftHand.color, 2, 0);
  }
  
  if (results.rightHandLandmarks) {
    totalLandmarks += results.rightHandLandmarks.length;
    drawConnections(results.rightHandLandmarks, BODY_PARTS.rightHand.connections, BODY_PARTS.rightHand.color, 2);
    drawLandmarks(results.rightHandLandmarks, BODY_PARTS.rightHand.color, 2, 0);
  }
  
  // Update landmark count
  document.getElementById('landmarks').textContent = totalLandmarks;
  
  // Add subtle scan line effect
  const scanY = (performance.now() / 15) % canvasElement.height;
  canvasCtx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
  canvasCtx.lineWidth = 1;
  canvasCtx.beginPath();
  canvasCtx.moveTo(0, scanY);
  canvasCtx.lineTo(canvasElement.width, scanY);
  canvasCtx.stroke();
}

// Start the application
window.addEventListener('load', () => {
  setTimeout(initializeHolistic, 500);
});

// Cleanup
window.addEventListener('beforeunload', () => {
  if (camera) {
    camera.stop();
  }
  if (videoElement && videoElement.srcObject) {
    videoElement.srcObject.getTracks().forEach(track => track.stop());
  }
});