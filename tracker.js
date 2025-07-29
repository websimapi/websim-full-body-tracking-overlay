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

// Add smoothing variables
let previousLandmarks = {
  pose: null,
  face: null,
  leftHand: null,
  rightHand: null
};
const SMOOTHING_FACTOR = 0.7; // Higher = more smoothing (0-1)
const NOISE_THRESHOLD = 0.005; // Minimum movement to register

// Optimized color schemes with reduced complexity
const BODY_PARTS = {
  pose: { color: '#00FFFF', size: 4 },
  face: { color: '#FF6B9D', size: 1.5 },
  leftHand: { color: '#4ECDC4', size: 3 },
  rightHand: { color: '#FECA57', size: 3 }
};

// Add detailed face mesh connections for better face tracking
const FACE_MESH_CONNECTIONS = [
  // Face outline
  [10, 338], [338, 297], [297, 332], [332, 284], [284, 251], [251, 389], [389, 356], [356, 454], [454, 323], [323, 361], [361, 288], [288, 397], [397, 365], [365, 379], [379, 378], [378, 400], [400, 377], [377, 152], [152, 148], [148, 176], [176, 149], [149, 150], [150, 136], [136, 172], [172, 58], [58, 132], [132, 93], [93, 234], [234, 127], [127, 162], [162, 21], [21, 54], [54, 103], [103, 67], [67, 109], [109, 10],
  // Left eye
  [33, 7], [7, 163], [163, 144], [144, 145], [145, 153], [153, 154], [154, 155], [155, 133], [133, 173], [173, 157], [157, 158], [158, 159], [159, 160], [160, 161], [161, 246], [246, 33],
  // Right eye  
  [362, 382], [382, 381], [381, 380], [380, 374], [374, 373], [373, 390], [390, 249], [249, 263], [263, 466], [466, 388], [388, 387], [387, 386], [386, 385], [385, 384], [384, 398], [398, 362],
  // Eyebrows
  [46, 53], [53, 52], [52, 51], [51, 48], [48, 115], [115, 131], [131, 134], [134, 102], [102, 48], [276, 283], [283, 282], [282, 295], [295, 285], [285, 336], [336, 296], [296, 334], [334, 293], [293, 300], [300, 276],
  // Nose
  [1, 2], [2, 5], [5, 4], [4, 6], [6, 168], [168, 8], [8, 9], [9, 10], [10, 151], [151, 195], [195, 197], [197, 196], [196, 3], [3, 51], [51, 48], [48, 115], [115, 131], [131, 134], [134, 102], [102, 49], [49, 220], [220, 305], [305, 281], [281, 275], [275, 274], [274, 4],
  // Mouth
  [61, 84], [84, 17], [17, 314], [314, 405], [405, 320], [320, 307], [307, 375], [375, 321], [321, 308], [308, 324], [324, 318], [318, 402], [402, 317], [317, 14], [14, 87], [87, 178], [178, 88], [88, 95], [95, 78], [78, 191], [191, 80], [80, 81], [81, 82], [82, 13], [13, 312], [312, 311], [311, 310], [310, 415], [415, 308], [308, 324], [324, 318], [318, 402], [402, 317], [317, 14], [14, 87], [87, 178], [178, 88], [88, 95], [95, 61]
];

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

// Add smoothing function
function smoothLandmarks(currentLandmarks, previousLandmarks, smoothingFactor = SMOOTHING_FACTOR) {
  if (!currentLandmarks || !previousLandmarks || currentLandmarks.length !== previousLandmarks.length) {
    return currentLandmarks;
  }
  
  return currentLandmarks.map((current, index) => {
    const previous = previousLandmarks[index];
    if (!previous) return current;
    
    // Calculate distance to determine if we should smooth
    const distance = Math.sqrt(
      Math.pow(current.x - previous.x, 2) + 
      Math.pow(current.y - previous.y, 2)
    );
    
    // Only smooth if movement is above noise threshold
    if (distance < NOISE_THRESHOLD) {
      return previous; // Keep previous position for very small movements
    }
    
    // Apply exponential smoothing
    return {
      x: previous.x * smoothingFactor + current.x * (1 - smoothingFactor),
      y: previous.y * smoothingFactor + current.y * (1 - smoothingFactor),
      z: current.z !== undefined ? 
          (previous.z !== undefined ? previous.z * smoothingFactor + current.z * (1 - smoothingFactor) : current.z) : 
          undefined,
      visibility: current.visibility !== undefined ? current.visibility : undefined
    };
  });
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

    // Initialize MediaPipe Holistic with optimized settings for maximum detail
    holistic = new Holistic({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/${file}`;
      }
    });

    // Optimized settings for maximum detail and best tracking
    holistic.setOptions({
      modelComplexity: 2, // Increased for better accuracy
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: false,
      refineFaceLandmarks: true, // Enable for better face tracking
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.8
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
  
  // Apply smoothing to landmarks
  let smoothedResults = { ...results };
  
  if (results.poseLandmarks) {
    smoothedResults.poseLandmarks = smoothLandmarks(
      results.poseLandmarks, 
      previousLandmarks.pose,
      SMOOTHING_FACTOR
    );
    previousLandmarks.pose = [...smoothedResults.poseLandmarks];
  }
  
  if (results.faceLandmarks) {
    smoothedResults.faceLandmarks = smoothLandmarks(
      results.faceLandmarks, 
      previousLandmarks.face,
      SMOOTHING_FACTOR * 0.8 // Less smoothing for face for responsiveness
    );
    previousLandmarks.face = [...smoothedResults.faceLandmarks];
  }
  
  if (results.leftHandLandmarks) {
    smoothedResults.leftHandLandmarks = smoothLandmarks(
      results.leftHandLandmarks, 
      previousLandmarks.leftHand,
      SMOOTHING_FACTOR * 0.6 // Less smoothing for hands
    );
    previousLandmarks.leftHand = [...smoothedResults.leftHandLandmarks];
  }
  
  if (results.rightHandLandmarks) {
    smoothedResults.rightHandLandmarks = smoothLandmarks(
      results.rightHandLandmarks, 
      previousLandmarks.rightHand,
      SMOOTHING_FACTOR * 0.6 // Less smoothing for hands
    );
    previousLandmarks.rightHand = [...smoothedResults.rightHandLandmarks];
  }
  
  // Clear offscreen canvas
  offscreenCtx.fillStyle = '#000000';
  offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
  
  let totalLandmarks = 0;
  
  // Draw pose
  if (smoothedResults.poseLandmarks && smoothedResults.poseLandmarks.length > 0) {
    totalLandmarks += smoothedResults.poseLandmarks.filter(lm => lm.visibility > 0.5).length;
    drawConnections(smoothedResults.poseLandmarks, POSE_CONNECTIONS, BODY_PARTS.pose.color, 3);
    drawLandmarks(smoothedResults.poseLandmarks, BODY_PARTS.pose.color, BODY_PARTS.pose.size);
  }
  
  // Draw full detailed face landmarks with mesh connections
  if (smoothedResults.faceLandmarks && smoothedResults.faceLandmarks.length > 0) {
    totalLandmarks += smoothedResults.faceLandmarks.length;
    // Draw face mesh connections for detailed face tracking
    drawConnections(smoothedResults.faceLandmarks, FACE_MESH_CONNECTIONS, BODY_PARTS.face.color, 1);
    // Draw all face landmarks without simplification
    drawLandmarks(smoothedResults.faceLandmarks, BODY_PARTS.face.color, BODY_PARTS.face.size);
  }
  
  // Draw hands with full detail
  if (smoothedResults.leftHandLandmarks && smoothedResults.leftHandLandmarks.length > 0) {
    totalLandmarks += smoothedResults.leftHandLandmarks.length;
    drawConnections(smoothedResults.leftHandLandmarks, HAND_CONNECTIONS, BODY_PARTS.leftHand.color, 2);
    drawLandmarks(smoothedResults.leftHandLandmarks, BODY_PARTS.leftHand.color, BODY_PARTS.leftHand.size);
  }
  
  if (smoothedResults.rightHandLandmarks && smoothedResults.rightHandLandmarks.length > 0) {
    totalLandmarks += smoothedResults.rightHandLandmarks.length;
    drawConnections(smoothedResults.rightHandLandmarks, HAND_CONNECTIONS, BODY_PARTS.rightHand.color, 2);
    drawLandmarks(smoothedResults.rightHandLandmarks, BODY_PARTS.rightHand.color, BODY_PARTS.rightHand.size);
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