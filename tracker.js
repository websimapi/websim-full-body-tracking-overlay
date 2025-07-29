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

// Enhanced face landmark groups for better aesthetics
const FACE_LANDMARKS = {
  // Face contour
  faceOval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
  
  // Left eye (from viewer's perspective - model's right eye)
  leftEye: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  leftEyebrow: [46, 53, 52, 51, 48, 115, 131, 134, 102, 49, 220, 305, 285, 336],
  
  // Right eye (from viewer's perspective - model's left eye)  
  rightEye: [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
  rightEyebrow: [276, 283, 282, 295, 285, 336, 296, 334, 293, 300, 276, 334, 296, 285],
  
  // Nose
  noseTip: [1, 2, 5, 4, 6, 168, 8, 9, 10, 151],
  noseBridge: [6, 51, 48, 115, 131, 134, 102, 49, 220, 305, 285, 336, 296, 334, 293, 300],
  nostrils: [236, 3, 51, 48, 115, 131, 134, 102, 49, 220, 305, 285, 336, 296, 334],
  
  // Lips
  outerLips: [61, 84, 17, 314, 405, 320, 307, 375, 321, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318],
  innerLips: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]
};

// Enhanced color scheme for face features
const FACE_COLORS = {
  faceOval: '#00FFFF',
  leftEye: '#4ECDC4',
  rightEye: '#4ECDC4', 
  leftEyebrow: '#FF6B9D',
  rightEyebrow: '#FF6B9D',
  noseTip: '#FECA57',
  noseBridge: '#FFA726',
  nostrils: '#FF8A65',
  outerLips: '#E74C3C',
  innerLips: '#C0392B'
};

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

function drawFaceLandmarks(faceLandmarks) {
  if (!faceLandmarks || faceLandmarks.length === 0) return;
  
  const width = canvasElement.width;
  const height = canvasElement.height;
  
  // Draw face contour with connected lines
  drawFaceFeature(faceLandmarks, FACE_LANDMARKS.faceOval, FACE_COLORS.faceOval, 1.5, true);
  
  // Draw eyes with subtle glow effect
  drawFaceFeature(faceLandmarks, FACE_LANDMARKS.leftEye, FACE_COLORS.leftEye, 2, true);
  drawFaceFeature(faceLandmarks, FACE_LANDMARKS.rightEye, FACE_COLORS.rightEye, 2, true);
  
  // Draw eyebrows
  drawFaceFeature(faceLandmarks, FACE_LANDMARKS.leftEyebrow, FACE_COLORS.leftEyebrow, 1.5, false);
  drawFaceFeature(faceLandmarks, FACE_LANDMARKS.rightEyebrow, FACE_COLORS.rightEyebrow, 1.5, false);
  
  // Draw nose features
  drawFaceFeature(faceLandmarks, FACE_LANDMARKS.noseTip, FACE_COLORS.noseTip, 2.5, false);
  drawFaceFeature(faceLandmarks, FACE_LANDMARKS.noseBridge, FACE_COLORS.noseBridge, 1, false);
  
  // Draw lips with connected outline
  drawFaceFeature(faceLandmarks, FACE_LANDMARKS.outerLips, FACE_COLORS.outerLips, 2, true);
  drawFaceFeature(faceLandmarks, FACE_LANDMARKS.innerLips, FACE_COLORS.innerLips, 1.5, true);
}

function drawFaceFeature(landmarks, indices, color, size, connected = false) {
  if (!landmarks || !indices || indices.length === 0) return;
  
  const width = canvasElement.width;
  const height = canvasElement.height;
  
  // Set up drawing style with glow effect
  offscreenCtx.fillStyle = color;
  offscreenCtx.strokeStyle = color;
  offscreenCtx.shadowColor = color;
  offscreenCtx.shadowBlur = 3;
  
  if (connected && indices.length > 2) {
    // Draw connected lines for features like eyes, lips, face contour
    offscreenCtx.lineWidth = 1;
    offscreenCtx.beginPath();
    
    let validPoints = [];
    indices.forEach(idx => {
      if (landmarks[idx]) {
        const x = landmarks[idx].x * width;
        const y = landmarks[idx].y * height;
        validPoints.push({x, y});
      }
    });
    
    if (validPoints.length > 1) {
      offscreenCtx.moveTo(validPoints[0].x, validPoints[0].y);
      for (let i = 1; i < validPoints.length; i++) {
        offscreenCtx.lineTo(validPoints[i].x, validPoints[i].y);
      }
      // Close the path for eyes and lips
      if (indices === FACE_LANDMARKS.leftEye || indices === FACE_LANDMARKS.rightEye || 
          indices === FACE_LANDMARKS.outerLips || indices === FACE_LANDMARKS.innerLips) {
        offscreenCtx.closePath();
      }
      offscreenCtx.stroke();
    }
  }
  
  // Draw landmark points
  indices.forEach(idx => {
    if (landmarks[idx]) {
      const x = landmarks[idx].x * width;
      const y = landmarks[idx].y * height;
      
      offscreenCtx.beginPath();
      offscreenCtx.arc(x, y, size, 0, 2 * Math.PI);
      offscreenCtx.fill();
    }
  });
  
  // Reset shadow
  offscreenCtx.shadowBlur = 0;
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
  
  // Draw enhanced face landmarks
  if (smoothedResults.faceLandmarks && smoothedResults.faceLandmarks.length > 0) {
    totalLandmarks += Math.min(smoothedResults.faceLandmarks.length, 100); // Limit for performance
    drawFaceLandmarks(smoothedResults.faceLandmarks);
  }
  
  // Draw hands
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