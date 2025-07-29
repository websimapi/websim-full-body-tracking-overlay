let videoElement = null;
let canvasElement = null;
let canvasCtx = null;
let pose = null;
let camera = null;

function showError(message) {
  const errorElement = document.getElementById('error-message');
  errorElement.textContent = message;
  errorElement.style.display = 'block';
}

function checkWebGLSupport() {
  const canvas = document.createElement('canvas');
  const contextTypes = ['webgl2', 'webgl', 'experimental-webgl'];
  let gl = null;
  
  for (const type of contextTypes) {
    try {
      gl = canvas.getContext(type, {
        failIfMajorPerformanceCaveat: false,
        powerPreference: 'high-performance'
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
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user'
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
    desynchronized: false
  });

  if (!videoElement || !canvasElement || !canvasCtx) {
    throw new Error('Required elements not found');
  }

  canvasElement.width = 640;
  canvasElement.height = 480;
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

    // Initialize MediaPipe Pose
    pose = new Pose({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
      }
    });

    pose.setOptions({
      modelComplexity: 2,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: true,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7
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
      width: 640,
      height: 480
    });
    
    await camera.start();
    
  } catch (error) {
    console.error('Error initializing:', error);
    showError(`Error: ${error.message || 'Failed to initialize body tracking'}. Please make sure you have granted camera permissions and are using a supported browser.`);
  }
}

function drawSkeleton(landmarks) {
  const connections = [
    [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
    [9, 10], [11, 12], [11, 23], [12, 24], [23, 24], [23, 25], [24, 26],
    [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32]
  ];

  // Draw connections
  canvasCtx.strokeStyle = '#00FF88';
  canvasCtx.lineWidth = 2;
  
  connections.forEach(([startIdx, endIdx]) => {
    const start = landmarks[startIdx];
    const end = landmarks[endIdx];
    
    if (start && end && start.visibility > 0.5 && end.visibility > 0.5) {
      canvasCtx.beginPath();
      canvasCtx.moveTo(start.x * canvasElement.width, start.y * canvasElement.height);
      canvasCtx.lineTo(end.x * canvasElement.width, end.y * canvasElement.height);
      canvasCtx.stroke();
    }
  });
}

function drawLandmarks(landmarks) {
  const landmarkGroups = {
    face: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    leftArm: [11, 13, 15, 17, 19, 21],
    rightArm: [12, 14, 16, 18, 20, 22],
    torso: [11, 12, 23, 24],
    leftLeg: [23, 25, 27, 29, 31],
    rightLeg: [24, 26, 28, 30, 32]
  };

  // Draw face landmarks
  canvasCtx.fillStyle = '#FF6B6B';
  landmarkGroups.face.forEach(idx => {
    const point = landmarks[idx];
    if (point && point.visibility > 0.5) {
      canvasCtx.beginPath();
      canvasCtx.arc(point.x * canvasElement.width, point.y * canvasElement.height, 4, 0, 2 * Math.PI);
      canvasCtx.fill();
    }
  });

  // Draw arms
  canvasCtx.fillStyle = '#4ECDC4';
  [...landmarkGroups.leftArm, ...landmarkGroups.rightArm].forEach(idx => {
    const point = landmarks[idx];
    if (point && point.visibility > 0.5) {
      canvasCtx.beginPath();
      canvasCtx.arc(point.x * canvasElement.width, point.y * canvasElement.height, 6, 0, 2 * Math.PI);
      canvasCtx.fill();
    }
  });

  // Draw torso
  canvasCtx.fillStyle = '#45B7D1';
  landmarkGroups.torso.forEach(idx => {
    const point = landmarks[idx];
    if (point && point.visibility > 0.5) {
      canvasCtx.beginPath();
      canvasCtx.arc(point.x * canvasElement.width, point.y * canvasElement.height, 8, 0, 2 * Math.PI);
      canvasCtx.fill();
    }
  });

  // Draw legs
  canvasCtx.fillStyle = '#96CEB4';
  [...landmarkGroups.leftLeg, ...landmarkGroups.rightLeg].forEach(idx => {
    const point = landmarks[idx];
    if (point && point.visibility > 0.5) {
      canvasCtx.beginPath();
      canvasCtx.arc(point.x * canvasElement.width, point.y * canvasElement.height, 7, 0, 2 * Math.PI);
      canvasCtx.fill();
    }
  });
}

function onResults(results) {
  if (!canvasCtx || !canvasElement) return;

  // Clear canvas with fade effect
  canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.1)';
  canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
  
  // Draw pose
  if (results.poseLandmarks) {
    drawSkeleton(results.poseLandmarks);
    drawLandmarks(results.poseLandmarks);
    
    // Draw confidence indicators
    const avgConfidence = results.poseLandmarks.reduce((sum, lm) => sum + lm.visibility, 0) / results.poseLandmarks.length;
    if (avgConfidence > 0.7) {
      canvasCtx.fillStyle = '#00FF00';
      canvasCtx.fillRect(10, 10, 200 * avgConfidence, 5);
    }
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