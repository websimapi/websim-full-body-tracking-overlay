const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('output');
const canvasCtx = canvasElement.getContext('2d');

// Set canvas dimensions
canvasElement.width = 640;
canvasElement.height = 480;

// Initialize MediaPipe Pose
const pose = new Pose({
  locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
  }
});

pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

pose.onResults(onResults);

// Start video stream
navigator.mediaDevices.getUserMedia({ video: true })
  .then((stream) => {
    videoElement.srcObject = stream;
    videoElement.play();
    detectPose();
  })
  .catch((err) => {
    console.error('Error accessing camera:', err);
  });

function detectPose() {
  if (videoElement.readyState === 4) {
    pose.send({ image: videoElement });
  }
  requestAnimationFrame(detectPose);
}

function onResults(results) {
  // Clear canvas
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  
  // Draw pose landmarks
  if (results.poseLandmarks) {
    // Set drawing style
    canvasCtx.fillStyle = '#00FF00';
    canvasCtx.strokeStyle = '#00FF00';
    canvasCtx.lineWidth = 2;
    
    // Draw landmarks
    drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, 
      {color: '#00FF00', lineWidth: 2});
    drawLandmarks(canvasCtx, results.poseLandmarks, 
      {color: '#FF0000', lineWidth: 1, radius: 3});
  }
}