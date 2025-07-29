let videoElement = null;
let canvasElement = null;
let canvasCtx = null;
let pose = null;
let camera = null;
let lastFrameTime = 0;
let frameCount = 0;

// Enhanced color schemes for different body parts
const BODY_PARTS = {
  face: { color: '#FF6B9D', size: 3, connections: [[0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8]] },
  leftArm: { color: '#4ECDC4', size: 6, connections: [[11, 13], [13, 15], [15, 17], [17, 19], [19, 21]] },
  rightArm: { color: '#45B7D1', size: 6, connections: [[12, 14], [14, 16], [16, 18], [18, 20], [20, 22]] },
  torso: { color: '#96CEB4', size: 8, connections: [[11, 12], [11, 23], [12, 24], [23, 24]] },
  leftLeg: { color: '#FECA57', size: 7, connections: [[23, 25], [25, 27], [27, 29], [29, 31]] },
  rightLeg: { color: '#FF9FF3', size: 7, connections: [[24, 26], [26, 28], [28, 30], [30, 32]] },
  hips: { color: '#54A0FF', size: 9, connections: [[23, 25], [24, 26]] }
};

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
  const canvas = document.createElement('canvas');
  const contextTypes = ['webgl2', 'webgl', 'experimental-webgl'];
  let gl = null;
  
  for (const type of contextTypes) {
    try {
      gl = canvas.getContext(type, {
        failIfMajorPerformanceCaveat: false,
        powerPreference: 'high-performance',
        antialias: false,
        stencil: false,
        depth: false
      });
      if (gl) break;
    } catch (e) {
      continue;
    }
  }
  
  return !!gl;
}

async function setupCamera() {
  try {
    const constraints = {
      video: {
        width: { ideal: 720 },
        height: { ideal: 540 },
        facingMode: 'user',
        frameRate: { ideal: 30, max: 60 }
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

  canvasElement.width = 720;
  canvasElement.height = 540;
}

function drawAdvancedSkeleton(landmarks) {
  const width = canvasElement.width;
  const height = canvasElement.height;

  // Draw connections with gradients
  Object.entries(BODY_PARTS).forEach(([part, config]) => {
    canvasCtx.strokeStyle = config.color;
    canvasCtx.lineWidth = 3;
    canvasCtx.shadowColor = config.color;
    canvasCtx.shadowBlur = 10;
    
    config.connections.forEach(([startIdx, endIdx]) => {
      const start = landmarks[startIdx];
      const end = landmarks[endIdx];
      
      if (start && end && start.visibility > 0.3 && end.visibility > 0.3) {
        // Create gradient for each line
        const gradient = canvasCtx.createLinearGradient(
          start.x * width, start.y * height,
          end.x * width, end.y * height
        );
        gradient.addColorStop(0, config.color);
        gradient.addColorStop(1, config.color + '80');
        
        canvasCtx.strokeStyle = gradient;
        canvasCtx.beginPath();
        canvasCtx.moveTo(start.x * width, start.y * height);
        canvasCtx.lineTo(end.x * width, end.y * height);
        canvasCtx.stroke();
      }
    });
  });
  
  canvasCtx.shadowBlur = 0;
}

function drawAdvancedLandmarks(landmarks) {
  const width = canvasElement.width;
  const height = canvasElement.height;

  // Draw landmarks with glow effects
  landmarks.forEach((landmark, index) => {
    if (landmark.visibility > 0.3) {
      let partConfig = null;
      
      // Determine which body part this landmark belongs to
      Object.entries(BODY_PARTS).forEach(([part, config]) => {
        const ranges = {
          face: [0, 10],
          leftArm: [11, 22],
          rightArm: [11, 22],
          torso: [11, 24],
          leftLeg: [23, 32],
          rightLeg: [23, 32],
          hips: [23, 24]
        };
        
        if (ranges[part] && index >= ranges[part][0] && index <= ranges[part][1]) {
          partConfig = config;
        }
      });
      
      if (partConfig) {
        const x = landmark.x * width;
        const y = landmark.y * height;
        
        // Outer glow
        canvasCtx.shadowColor = partConfig.color;
        canvasCtx.shadowBlur = 20;
        canvasCtx.fillStyle = partConfig.color;
        canvasCtx.beginPath();
        canvasCtx.arc(x, y, partConfig.size * 1.5, 0, 2 * Math.PI);
        canvasCtx.fill();
        
        // Inner dot
        canvasCtx.shadowBlur = 0;
        canvasCtx.fillStyle = '#FFFFFF';
        canvasCtx.beginPath();
        canvasCtx.arc(x, y, partConfig.size * 0.5, 0, 2 * Math.PI);
        canvasCtx.fill();
      }
    }
  });
}

function drawConfidenceRing(landmarks) {
  const centerX = canvasElement.width / 2;
  const centerY = canvasElement.height / 2;
  const avgConfidence = landmarks.reduce((sum, lm) => sum + lm.visibility, 0) / landmarks.length;
  
  // Draw confidence ring
  canvasCtx.strokeStyle = `rgba(0, 255, 255, ${avgConfidence})`;
  canvasCtx.lineWidth = 3;
  canvasCtx.beginPath();
  canvasCtx.arc(centerX, centerY, 100, 0, Math.PI * 2 * avgConfidence);
  canvasCtx.stroke();
  
  // Draw confidence text
  canvasCtx.fillStyle = '#00FFFF';
  canvasCtx.font = '16px monospace';
  canvasCtx.textAlign = 'center';
  canvasCtx.fillText(`${Math.round(avgConfidence * 100)}%`, centerX, centerY + 120);
}

async function initializePose() {
  try {
    // Check WebGL support
    if (!checkWebGLSupport()) {
      throw new Error('WebGL not properly supported');
    }
    
    // Initialize elements
    await initializeElements();

    // Setup camera
    await setupCamera();

    // Initialize MediaPipe Pose with enhanced configuration
    pose = new Pose({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`;
      }
    });

    pose.setOptions({
      modelComplexity: 2,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    pose.onResults(onResults);

    // Start camera
    camera = new Camera(videoElement, {
      onFrame: async () => {
        if (pose && videoElement) {
          try {
            await pose.send({image: videoElement});
          } catch (error) {
            console.error('Error in pose detection:', error);
          }
        }
      },
      width: 720,
      height: 540
    });
    
    await camera.start();
    
    // Remove loading indicator
    document.querySelector('.container').classList.add('loaded');
    
  } catch (error) {
    console.error('Error initializing:', error);
    showError(`Error: ${error.message || 'Failed to initialize body tracking'}`);
  }
}

function onResults(results) {
  if (!canvasCtx || !canvasElement) return;

  updateFPS();
  
  // Clear canvas with trail effect
  canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.05)';
  canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
  
  // Draw pose
  if (results.poseLandmarks) {
    document.getElementById('landmarks').textContent = results.poseLandmarks.filter(lm => lm.visibility > 0.3).length;
    
    drawAdvancedSkeleton(results.poseLandmarks);
    drawAdvancedLandmarks(results.poseLandmarks);
    drawConfidenceRing(results.poseLandmarks);
    
    // Add scan line effect
    const scanY = (performance.now() / 10) % canvasElement.height;
    canvasCtx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    canvasCtx.moveTo(0, scanY);
    canvasCtx.lineTo(canvasElement.width, scanY);
    canvasCtx.stroke();
  }
}

// Start the application
window.addEventListener('load', () => {
  setTimeout(initializePose, 500);
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