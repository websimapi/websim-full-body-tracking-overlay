let videoElement = null;
let canvasElement = null;
let canvasCtx = null;
let holistic = null;
let camera = null;
let lastFrameTime = 0;
let frameCount = 0;
let isProcessing = false;
let offscreenCanvas = null;
let offscreenCtx = null;

// Optimized color schemes with reduced complexity
const BODY_PARTS = {
  pose: { color: '#00FFFF', size: 4 },
  face: { color: '#FF6B9D', size: 2 },
  leftHand: { color: '#4ECDC4', size: 3 },
  rightHand: { color: '#FECA57', size: 3 }
};

// Simplified hand connections for better performance
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // Index
  [5, 9], [9, 10], [10, 11], [11, 12], // Middle
  [9, 13], [13, 14], [14, 15], [15, 16], // Ring
  [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
  [0, 17] // Palm
];

// Pose connections (simplified)
const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [11, 23],
  [12, 24], [23, 24], [23, 25], [25, 27], [27, 29], [27, 31],
  [24, 26], [26, 28], [28, 30], [28, 32]
];

function showError(message) {
  const errorElement = document.getElementById('error-message');
  errorElement.innerHTML = `
    <h3>Tracking Error</h3>
    <p>${message}</p>
    <small>Trying to recover... Please wait.</small>
  `;
  errorElement.style.display = 'block';
  
  // Auto-hide error after 5 seconds
  setTimeout(() => {
    errorElement.style.display = 'none';
  }, 5000);
}

function updateFPS() {
  frameCount++;
  const now = performance.now();
  if (now - lastFrameTime >= 1000) {
    document.getElementById('fps').textContent = Math.round(frameCount);
    frameCount = 0;
    lastFrameTime = now;
  }
}

async function setupCamera() {
  try {
    const constraints = {
      video: {
        width: { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 720 },
        facingMode: 'user',
        frameRate: { ideal: 30, max: 30 }
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
    throw new Error(`Camera access failed: ${error.message}`);
  }
}

async function initializeElements() {
  videoElement = document.getElementById('video');
  canvasElement = document.getElementById('output');
  canvasCtx = canvasElement.getContext('2d', {
    alpha: false,
    desynchronized: true,
    willReadFrequently: false
  });

  if (!videoElement || !canvasElement || !canvasCtx) {
    throw new Error('Required elements not found');
  }

  // Set canvas size
  canvasElement.width = 640;
  canvasElement.height = 480;
  
  // Create offscreen canvas for better performance
  offscreenCanvas = new OffscreenCanvas(640, 480);
  offscreenCtx = offscreenCanvas.getContext('2d');
}

function drawConnections(landmarks, connections, color, lineWidth = 2) {
  if (!landmarks || !connections || landmarks.length === 0) return;
  
  const width = canvasElement.width;
  const height = canvasElement.height;
  
  offscreenCtx.strokeStyle = color;
  offscreenCtx.lineWidth = lineWidth;
  offscreenCtx.globalCompositeOperation = 'source-over';
  
  connections.forEach(([startIdx, endIdx]) => {
    const start = landmarks[startIdx];
    const end = landmarks[endIdx];
    
    if (start && end) {
      const startVisible = start.visibility !== undefined ? start.visibility > 0.5 : true;
      const endVisible = end.visibility !== undefined ? end.visibility > 0.5 : true;
      
      if (startVisible && endVisible) {
        offscreenCtx.beginPath();
        offscreenCtx.moveTo(start.x * width, start.y * height);
        offscreenCtx.lineTo(end.x * width, end.y * height);
        offscreenCtx.stroke();
      }
    }
  });
}

function drawLandmarks(landmarks, color, size = 2) {
  if (!landmarks || landmarks.length === 0) return;
  
  const width = canvasElement.width;
  const height = canvasElement.height;
  
  offscreenCtx.fillStyle = color;
  
  landmarks.forEach((landmark) => {
    const visible = landmark.visibility !== undefined ? landmark.visibility > 0.5 : true;
    
    if (visible) {
      const x = landmark.x * width;
      const y = landmark.y * height;
      
      offscreenCtx.beginPath();
      offscreenCtx.arc(x, y, size, 0, 2 * Math.PI);
      offscreenCtx.fill();
    }
  });
}

async function initializeHolistic() {
  try {
    // Initialize elements first
    await initializeElements();
    
    // Setup camera
    await setupCamera();

    // Initialize MediaPipe Holistic with optimized settings
    holistic = new Holistic({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/${file}`;
      }
    });

    // Optimized settings for better performance
    holistic.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: false,
      refineFaceLandmarks: false,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });

    holistic.onResults(onResults);

    // Initialize camera with throttled frame rate
    camera = new Camera(videoElement, {
      onFrame: async () => {
        if (!isProcessing && holistic && videoElement && videoElement.readyState === 4) {
          isProcessing = true;
          try {
            await holistic.send({image: videoElement});
          } catch (error) {
            console.warn('Frame processing error:', error);
          } finally {
            // Add small delay to prevent overwhelming the system
            setTimeout(() => {
              isProcessing = false;
            }, 16); // ~60fps max
          }
        }
      },
      width: 640,
      height: 480
    });
    
    await camera.start();
    
    // Remove loading indicator
    document.querySelector('.container').classList.add('loaded');
    
  } catch (error) {
    console.error('Initialization error:', error);
    showError(`Error: ${error.message || 'Failed to initialize body tracking'}`);
    
    // Retry after delay
    setTimeout(() => {
      if (!holistic) {
        console.log('Retrying initialization...');
        initializeHolistic();
      }
    }, 3000);
  }
}

function onResults(results) {
  if (!canvasCtx || !offscreenCtx || !canvasElement) return;

  updateFPS();
  
  // Clear offscreen canvas
  offscreenCtx.fillStyle = '#000000';
  offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
  
  let totalLandmarks = 0;
  
  // Draw pose
  if (results.poseLandmarks && results.poseLandmarks.length > 0) {
    totalLandmarks += results.poseLandmarks.filter(lm => lm.visibility > 0.5).length;
    drawConnections(results.poseLandmarks, POSE_CONNECTIONS, BODY_PARTS.pose.color, 3);
    drawLandmarks(results.poseLandmarks, BODY_PARTS.pose.color, BODY_PARTS.pose.size);
  }
  
  // Draw face landmarks (simplified)
  if (results.faceLandmarks && results.faceLandmarks.length > 0) {
    totalLandmarks += Math.min(results.faceLandmarks.length, 50); // Limit for performance
    // Only draw every 3rd face landmark for performance
    const simplifiedFace = results.faceLandmarks.filter((_, i) => i % 3 === 0);
    drawLandmarks(simplifiedFace, BODY_PARTS.face.color, BODY_PARTS.face.size);
  }
  
  // Draw hands
  if (results.leftHandLandmarks && results.leftHandLandmarks.length > 0) {
    totalLandmarks += results.leftHandLandmarks.length;
    drawConnections(results.leftHandLandmarks, HAND_CONNECTIONS, BODY_PARTS.leftHand.color, 2);
    drawLandmarks(results.leftHandLandmarks, BODY_PARTS.leftHand.color, BODY_PARTS.leftHand.size);
  }
  
  if (results.rightHandLandmarks && results.rightHandLandmarks.length > 0) {
    totalLandmarks += results.rightHandLandmarks.length;
    drawConnections(results.rightHandLandmarks, HAND_CONNECTIONS, BODY_PARTS.rightHand.color, 2);
    drawLandmarks(results.rightHandLandmarks, BODY_PARTS.rightHand.color, BODY_PARTS.rightHand.size);
  }
  
  // Copy offscreen canvas to main canvas in one operation
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(offscreenCanvas, 0, 0);
  
  // Update landmark count
  document.getElementById('landmarks').textContent = totalLandmarks;
}

// Start the application with error recovery
window.addEventListener('load', () => {
  setTimeout(initializeHolistic, 100);
});

// Cleanup with better error handling
window.addEventListener('beforeunload', () => {
  try {
    if (camera) {
      camera.stop();
    }
    if (videoElement && videoElement.srcObject) {
      videoElement.srcObject.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Error stopping track:', e);
        }
      });
    }
  } catch (error) {
    console.warn('Cleanup error:', error);
  }
});

// Error recovery
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  if (event.error && event.error.message && event.error.message.includes('MediaPipe')) {
    showError('MediaPipe error detected. Reloading...');
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  }
});