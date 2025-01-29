let videoElement = document.getElementById('video');
let canvasElement = document.getElementById('output');
let canvasCtx = canvasElement.getContext('2d');
let pose = null;

// Set canvas dimensions
canvasElement.width = 640;
canvasElement.height = 480;

async function initializePose() {
  try {
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

    // Start camera after pose is initialized
    const camera = new Camera(videoElement, {
      onFrame: async () => {
        await pose.send({image: videoElement});
      },
      width: 640,
      height: 480
    });
    
    await camera.start();
    
  } catch (error) {
    console.error('Error initializing:', error);
    document.getElementById('error-message').textContent = 
      'Error initializing body tracking. Please make sure you have granted camera permissions and are using a supported browser.';
    document.getElementById('error-message').style.display = 'block';
  }
}

function onResults(results) {
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