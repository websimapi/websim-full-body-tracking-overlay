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
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) {
    throw new Error('WebGL not supported');
  }
  return gl;
}

async function setupCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoElement.srcObject = stream;
    return new Promise((resolve) => {
      videoElement.onloadedmetadata = () => {
        videoElement.play();
        resolve();
      };
    });
  } catch (error) {
    throw new Error('Camera access denied or not available');
  }
}

async function initializeElements() {
  videoElement = document.getElementById('video');
  canvasElement = document.getElementById('output');
  canvasCtx = canvasElement.getContext('2d');

  if (!videoElement || !canvasElement || !canvasCtx) {
    throw new Error('Required elements not found');
  }

  // Set canvas dimensions
  canvasElement.width = 640;
  canvasElement.height = 480;
}

async function initializePose() {
  try {
    // Check WebGL support first
    checkWebGLSupport();
    
    // Initialize elements
    await initializeElements();

    // Setup camera first
    await setupCamera();

    // Initialize MediaPipe Pose
    pose = new Pose({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
      }
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    pose.onResults(onResults);

    // Wait for pose to initialize
    await pose.initialize();

    // Start camera
    camera = new Camera(videoElement, {
      onFrame: async () => {
        if (pose) {
          await pose.send({image: videoElement});
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

function onResults(results) {
  if (!canvasCtx || !canvasElement) return;

  // Clear canvas
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  
  // Draw pose landmarks
  if (results.poseLandmarks) {
    // Draw connectors
    drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS,
                  {color: '#00FF00', lineWidth: 2});
    // Draw landmarks
    drawLandmarks(canvasCtx, results.poseLandmarks,
                 {color: '#FF0000', fillColor: '#FF0000', lineWidth: 1, radius: 3});
  }
}

// Start the application
document.addEventListener('DOMContentLoaded', () => {
  initializePose();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (camera) {
    camera.stop();
  }
  if (videoElement && videoElement.srcObject) {
    videoElement.srcObject.getTracks().forEach(track => track.stop());
  }
});