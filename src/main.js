let stream = null;
let animFrame = null;
let hands = null;
let sentence = '';

// Hold-to-confirm state
let holdLetter = null;
let holdStart = 0;
const HOLD_MS = 1500;

const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');

const HAND_CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [5,9],[9,10],[10,11],[11,12],
    [9,13],[13,14],[14,15],[15,16],
    [13,17],[17,18],[18,19],[19,20],
    [0,17]
];
const FINGER_TIPS = [4, 8, 12, 16, 20];

function setStatus(msg) { document.getElementById('statusMsg').textContent = msg; }

function dist3d(a, b) {
    return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2);
}

function recognizeASL(lm) {
    const palmSize = dist3d(lm[0], lm[9]) || 0.001;

    // Finger extended: tip is above (lower y) than the PIP joint
    const indexUp  = lm[8].y  < lm[6].y;
    const middleUp = lm[12].y < lm[10].y;
    const ringUp   = lm[16].y < lm[14].y;
    const pinkyUp  = lm[20].y < lm[18].y;

    // Finger curled into palm: tip below the MCP
    const indexCurled  = lm[8].y  > lm[5].y;
    const middleCurled = lm[12].y > lm[9].y;
    const ringCurled   = lm[16].y > lm[13].y;
    const pinkyCurled  = lm[20].y > lm[17].y;

    // Thumb: extended if tip is far from index MCP
    const thumbDist = dist3d(lm[4], lm[5]);
    const thumbUp = thumbDist > palmSize * 0.45;

    // Thumb bent across palm: tip near ring/middle base
    const thumbAcross = dist3d(lm[4], lm[13]) < palmSize * 0.4;

    // Tip-to-tip distances (normalized)
    const thIdx   = dist3d(lm[4], lm[8])  / palmSize;
    const thMid   = dist3d(lm[4], lm[12]) / palmSize;
    const thRing  = dist3d(lm[4], lm[16]) / palmSize;
    const thPinky = dist3d(lm[4], lm[20]) / palmSize;

    const idxMidSpread  = dist3d(lm[8], lm[12])  / palmSize;
    const midRingSpread = dist3d(lm[12], lm[16]) / palmSize;

    // Fingers bent but not fully curled (half-curl for C/O shapes)
    const indexHalfCurl  = !indexUp  && !indexCurled;
    const middleHalfCurl = !middleUp && !middleCurled;
    const ringHalfCurl   = !ringUp   && !ringCurled;
    const pinkyHalfCurl  = !pinkyUp  && !pinkyCurled;

    const I = indexUp, M = middleUp, R = ringUp, Pi = pinkyUp, Th = thumbUp;

    // 5 / open hand
    if (I && M && R && Pi && Th) return { letter: '5', desc: 'Open hand / 5', conf: 90 };

    // B: four fingers up, thumb tucked
    if (I && M && R && Pi && !Th) return { letter: 'B', desc: 'B — four fingers up', conf: 85 };

    // W / 3 (index+middle+ring up)
    if (I && M && R && !Pi && !Th) return { letter: 'W', desc: 'W — three fingers', conf: 80 };

    // Thumb + 4 fingers (thumb + index + middle + ring)
    if (I && M && R && !Pi && Th) return { letter: '4+', desc: '4 fingers + thumb', conf: 70 };

    // Index + middle up
    if (I && M && !R && !Pi) {
        if (idxMidSpread > 0.55) return { letter: 'V', desc: 'V — spread apart', conf: 82 };
        if (Th && thMid < 0.5)   return { letter: 'K', desc: 'K — thumb between', conf: 75 };
        return { letter: 'U', desc: 'U — fingers together', conf: 78 };
    }

    // L: index + thumb out, rest down
    if (I && !M && !R && !Pi && Th) return { letter: 'L', desc: 'L — index + thumb', conf: 88 };

    // Index only
    if (I && !M && !R && !Pi && !Th) return { letter: 'D', desc: 'D — index up', conf: 78 };

    // Pinky only
    if (!I && !M && !R && Pi && !Th) return { letter: 'I', desc: 'I — pinky up', conf: 88 };

    // Thumb + pinky (Y)
    if (!I && !M && !R && Pi && Th) return { letter: 'Y', desc: 'Y — thumb + pinky', conf: 88 };

    // Middle + ring + pinky (no index)
    if (!I && M && R && Pi && !Th) return { letter: '3-', desc: 'Fingers 2-4', conf: 60 };

    // F: thumb and index form circle, middle/ring/pinky up
    if (!I && M && R && Pi && thIdx < 0.35) return { letter: 'F', desc: 'F — thumb-index circle', conf: 80 };

    // P: like K pointing down (index+middle down toward palm)
    if (!I && !M && !R && !Pi) {
        // Fist variants — thumb position tells us more
        if (Th) {
            // Thumb out to side = A
            return { letter: 'A', desc: 'A — thumb to side', conf: 72 };
        }
        if (thumbAcross) {
            return { letter: 'S', desc: 'S — thumb over fist', conf: 72 };
        }
        return { letter: 'E', desc: 'E / N / M — fist variant', conf: 55 };
    }

    // O: all fingers curved toward thumb tip
    const allHalfCurl = indexHalfCurl && middleHalfCurl && ringHalfCurl && pinkyHalfCurl;
    if (allHalfCurl && thIdx < 0.5) return { letter: 'O', desc: 'O — rounded hand', conf: 72 };

    // C: curved open hand
    if (indexHalfCurl && middleHalfCurl && ringHalfCurl && pinkyHalfCurl && Th) {
        return { letter: 'C', desc: 'C — curved hand', conf: 68 };
    }

    // Ring + pinky up
    if (!I && !M && R && Pi) return { letter: '?', desc: 'Unrecognized', conf: 20 };

    return { letter: '?', desc: 'Unrecognized', conf: 0 };
}

function updateHold(letter) {
    const holdArc = document.getElementById('holdArc');
    const circumference = 2 * Math.PI * 15; // 94.25

    if (!letter || letter === '?') {
        holdLetter = null;
        holdStart = 0;
        holdArc.setAttribute('stroke-dasharray', `0 ${circumference}`);
        return;
    }

    if (letter !== holdLetter) {
        holdLetter = letter;
        holdStart = performance.now();
    }

    const elapsed = performance.now() - holdStart;
    const progress = Math.min(elapsed / HOLD_MS, 1);
    holdArc.setAttribute('stroke-dasharray', `${progress * circumference} ${circumference}`);

    if (progress >= 1) {
        // Add letter to sentence
        sentence += letter;
        document.getElementById('sentenceText').textContent = sentence || '\u00a0';
        holdLetter = null;
        holdStart = 0;
        holdArc.setAttribute('stroke-dasharray', `0 ${circumference}`);
    }
}

function addSpace() { sentence += ' '; document.getElementById('sentenceText').textContent = sentence || '\u00a0'; }
function backspace() { sentence = sentence.slice(0, -1); document.getElementById('sentenceText').textContent = sentence || '\u00a0'; }
function clearSentence() { sentence = ''; document.getElementById('sentenceText').textContent = '\u00a0'; }

function setFingerUI(states) {
    ['thumb','index','middle','ring','pinky'].forEach(f => {
        const el = document.getElementById('f-' + f);
        if (states[f]) el.classList.add('up');
        else el.classList.remove('up');
    });
}

async function startCamera() {
    try {
        setStatus('Requesting camera...');
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        video.srcObject = stream;
        await new Promise(r => video.onloadedmetadata = r);
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        document.getElementById('startBtn').style.display = 'none';
        document.getElementById('stopBtn').style.display = '';
        setStatus('Loading model...');

        hands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
        hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });
        hands.onResults(onResults);
        await hands.initialize();
        setStatus('Tracking...');
        processLoop();
    } catch (e) {
        setStatus('Error: ' + e.message);
    }
}

function stopCamera() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    video.srcObject = null;
    document.getElementById('startBtn').style.display = '';
    document.getElementById('stopBtn').style.display = 'none';
    document.getElementById('letterDisplay').textContent = '—';
    document.getElementById('letterLabel').textContent = 'No hand detected';
    document.getElementById('confBar').style.width = '0%';
    updateHold(null);
    setFingerUI({ thumb:false, index:false, middle:false, ring:false, pinky:false });
    setStatus('Camera off');
}

async function processLoop() {
    if (!stream) return;
    if (video.readyState >= 2) await hands.send({ image: video });
    animFrame = requestAnimationFrame(processLoop);
}

function onResults(results) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const detected = results.multiHandLandmarks?.length || 0;

    if (!detected) {
        document.getElementById('letterDisplay').textContent = '—';
        document.getElementById('letterLabel').textContent = 'No hand in frame';
        document.getElementById('confBar').style.width = '0%';
        updateHold(null);
        setFingerUI({ thumb:false, index:false, middle:false, ring:false, pinky:false });
        return;
    }

    const landmarks = results.multiHandLandmarks[0];

    // Draw skeleton
    HAND_CONNECTIONS.forEach(([a, b]) => {
        const lA = landmarks[a], lB = landmarks[b];
        ctx.beginPath();
        ctx.moveTo(lA.x * canvas.width, lA.y * canvas.height);
        ctx.lineTo(lB.x * canvas.width, lB.y * canvas.height);
        ctx.strokeStyle = 'rgba(100, 180, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
    });

    landmarks.forEach((lm, idx) => {
        const x = lm.x * canvas.width;
        const y = lm.y * canvas.height;
        const isTip = FINGER_TIPS.includes(idx);
        ctx.beginPath();
        ctx.arc(x, y, isTip ? 7 : 4, 0, 2 * Math.PI);
        ctx.fillStyle = isTip ? 'rgba(255, 120, 80, 0.95)' : 'rgba(255, 255, 255, 0.9)';
        ctx.fill();
        ctx.strokeStyle = isTip ? 'rgba(200, 60, 30, 0.9)' : 'rgba(100, 150, 220, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    });

    // Recognize
    const result = recognizeASL(landmarks);
    const letterEl = document.getElementById('letterDisplay');
    const labelEl  = document.getElementById('letterLabel');
    const confBar  = document.getElementById('confBar');

    letterEl.textContent = result.letter;
    labelEl.textContent = result.desc;
    confBar.style.width = result.conf + '%';

    // Finger state display
    const palmSize = dist3d(landmarks[0], landmarks[9]) || 0.001;
    const thumbDist = dist3d(landmarks[4], landmarks[5]);
    setFingerUI({
        thumb:  thumbDist > palmSize * 0.45,
        index:  landmarks[8].y  < landmarks[6].y,
        middle: landmarks[12].y < landmarks[10].y,
        ring:   landmarks[16].y < landmarks[14].y,
        pinky:  landmarks[20].y < landmarks[18].y
    });

    // Draw recognized letter overlay
    const wrist = landmarks[0];
    const px = wrist.x * canvas.width;
    const py = wrist.y * canvas.height;
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = 'rgba(123, 184, 248, 0.95)';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 4;
    ctx.strokeText(result.letter, px + 10, py - 10);
    ctx.fillText(result.letter, px + 10, py - 10);

    // Update hold progress (only confident letters)
    updateHold(result.conf >= 65 ? result.letter : null);
}