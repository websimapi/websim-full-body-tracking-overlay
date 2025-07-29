let videoElement = null;
let canvasElement = null;
let canvasCtx = null;
let pose = null;
let camera = null;
let lastFrameTime = 0;
let frameCount = 0;

// Simplified but comprehensive body parts tracking
const POSE_CONNECTIONS = [
  // Torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Left arm
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  // Right arm  
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  // Left leg
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  // Right leg
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32]
];

const COLORS = {
  leftSide: '#4ECDC4',
  rightSide: '#FF6B9D', 
  center: '#45B7D1',
  landmarks: '#00FFFF'
};

function showError(message) {
  const errorElement = document.getElementById('error-message');
  errorElement.innerHTML = `
    <h3>Tracking Error</h3>
    <p>${message}</p>
    <small>Refreshing page may help. Ensure camera permissions are granted.</small>
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

async function setupCamera() {
  try {
    const constraints = {
      video: {
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
        facingMode: 'user',
        frameRate: { ideal: 30, max: 30 }
      }
    };
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = stream;
    
    return new Promise((resolve) => {
      videoElement.onloadedmetadata = () => {
        videoElement.play();
        console.log('Camera initialized successfully');
        resolve();
      };
    });
  } catch (error) {
    throw new Error(`Camera access failed: ${error.message}`);
  }
}

function initializeElements() {
  videoElement = document.getElementById('video');
  canvasElement = document.getElementById('output');
  canvasCtx = canvasElement.getContext('2d');

  if (!videoElement || !canvasElement || !canvasCtx) {
    throw new Error('Required elements not found');
  }

  canvasElement.width = 1280;
  canvasElement.height = 720;
  console.log('Elements initialized successfully');
}

function drawConnections(landmarks, connections, color, lineWidth = 4) {
  if (!landmarks || !connections) return;
  
  const width = canvasElement.width;
  const height = canvasElement.height;
  
  canvasCtx.strokeStyle = color;
  canvasCtx.lineWidth = lineWidth;
  canvasCtx.shadowColor = color;
  canvasCtx.shadowBlur = 10;
  canvasCtx.lineCap = 'round';
  
  connections.forEach(([startIdx, endIdx]) => {
    const start = landmarks[startIdx];
    const end = landmarks[endIdx];
    
    if (start && end && start.visibility > 0.5 && end.visibility > 0.5) {
      canvasCtx.beginPath();
      canvasCtx.moveTo(start.x * width, start.y * height);
      canvasCtx.lineTo(end.x * width, end.y * height);
      canvasCtx.stroke();
    }
  });
  
  canvasCtx.shadowBlur = 0;
}

function drawLandmarks(landmarks, color, size = 5) {
  if (!landmarks) return;
  
  const width = canvasElement.width;
  const height = canvasElement.height;
  
  landmarks.forEach((landmark, index) => {
    if (landmark.visibility > 0.5) {
      const x = landmark.x * width;
      const y = landmark.y * height;
      
      // Glow effect
      canvasCtx.shadowColor = color;
      canvasCtx.shadowBlur = 15;
      canvasCtx.fillStyle = color;
      canvasCtx.beginPath();
      canvasCtx.arc(x, y, size, 0, 2 * Math.PI);
      canvasCtx.fill();
      
      // Inner highlight
      canvasCtx.shadowBlur = 0;
      canvasCtx.fillStyle = 'white';
      canvasCtx.beginPath();
      canvasCtx.arc(x, y, size * 0.4, 0, 2 * Math.PI);
      canvasCtx.fill();
    }
  });
}

async function initializePose() {
  try {
    console.log('Starting pose initialization...');
    
    // Initialize elements first
    initializeElements();

    // Setup camera
    await setupCamera();

    // Initialize MediaPipe Pose
    pose = new Pose({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`;
      }
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    pose.onResults(onResults);

    // Start camera processing
    camera = new Camera(videoElement, {
      onFrame: async () => {
        if (pose && videoElement.readyState === 4) {
          await pose.send({image: videoElement});
        }
      },
      width: 1280,
      height: 720
    });
    
    await camera.start();
    
    // Remove loading indicator
    document.querySelector('.container').classList.add('loaded');
    console.log('Full body tracking initialized successfully!');
    
  } catch (error) {
    console.error('Initialization error:', error);
    showError(`Initialization failed: ${error.message}`);
  }
}

function onResults(results) {
  if (!canvasCtx || !canvasElement) return;

  updateFPS();
  
  // Clear canvas with dark background
  canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.1)';
  canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
  
  let landmarkCount = 0;
  
  // Draw pose if detected
  if (results.poseLandmarks && results.poseLandmarks.length > 0) {
    landmarkCount = results.poseLandmarks.filter(lm => lm.visibility > 0.5).length;
    
    console.log(`Drawing ${landmarkCount} pose landmarks`);
    
    // Draw connections with different colors for different body parts
    const leftArmConnections = [[11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19]];
    const rightArmConnections = [[12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20]];
    const leftLegConnections = [[23, 25], [25, 27], [27, 29], [27, 31], [29, 31]];
    const rightLegConnections = [[24, 26], [26, 28], [28, 30], [28, 32], [30, 32]];
    const torsoConnections = [[11, 12], [11, 23], [12, 24], [23, 24]];
    
    // Draw body parts with different colors
    drawConnections(results.poseLandmarks, torsoConnections, COLORS.center, 6);
    drawConnections(results.poseLandmarks, leftArmConnections, COLORS.leftSide, 4);
    drawConnections(results.poseLandmarks, rightArmConnections, COLORS.rightSide, 4);
    drawConnections(results.poseLandmarks, leftLegConnections, COLORS.leftSide, 4);
    drawConnections(results.poseLandmarks, rightLegConnections, COLORS.rightSide, 4);
    
    // Draw landmarks
    drawLandmarks(results.poseLandmarks, COLORS.landmarks, 6);
    
  } else {
    console.log('No pose landmarks detected');
  }
  
  // Update debug info
  document.getElementById('landmarks').textContent = landmarkCount;
}

// Start the application
window.addEventListener('load', () => {
  console.log('Page loaded, starting pose tracking...');
  setTimeout(initializePose, 1000);
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