/* ══════════════════════════════════════════════════════════════════
       CUSTOM LABELS  (session-only — not persisted)
    ══════════════════════════════════════════════════════════════════ */
var customLabels = []; // array of strings, e.g. ["HELLO", "YES"]

function addCustomLabel() {
    var input = document.getElementById('customLabelInput');
    var raw = input.value.trim().toUpperCase();
    if (!raw) return;
    // Disallow duplicates with built-ins or existing custom labels
    var builtIn = LETTER_LABELS.concat(NUMBER_LABELS).concat(['J','Z']);
    if (builtIn.indexOf(raw) >= 0) {
        showTrainStatus('That label already exists as a built-in.', 'var(--accent2)');
        input.value = '';
        return;
    }
    if (customLabels.indexOf(raw) >= 0) {
        showTrainStatus('"' + raw + '" already added.', 'var(--accent3)');
        input.value = '';
        return;
    }
    customLabels.push(raw);
    input.value = '';
    renderCustomChips();
    addCustomToDropdown(raw);
    rebuildRefGrid();
    renderTrainCounts();
    showTrainStatus('Added custom label "' + raw + '" ✓', 'var(--accent5)');
}

function removeCustomLabel(label) {
    customLabels = customLabels.filter(function(l) { return l !== label; });
    // Remove from dropdown
    var sel = document.getElementById('trainLabel');
    for (var i = sel.options.length - 1; i >= 0; i--) {
        if (sel.options[i].value === label && sel.options[i].dataset.custom === '1') {
            sel.remove(i);
        }
    }
    // Remove samples for this label from in-memory array (they're in DB but won't be classified)
    allSamples = allSamples.filter(function(s) { return s.label !== label; });
    renderCustomChips();
    rebuildRefGrid();
    renderTrainCounts();
}

function addCustomToDropdown(label) {
    var sel = document.getElementById('trainLabel');
    // Check for existing separator
    var hasSep = false;
    for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === '__custom_sep__') { hasSep = true; break; }
    }
    if (!hasSep) {
        var sep = document.createElement('option');
        sep.value = '__custom_sep__'; sep.disabled = true;
        sep.textContent = '── Custom ──';
        sel.appendChild(sep);
    }
    var opt = document.createElement('option');
    opt.value = label; opt.textContent = label;
    opt.dataset.custom = '1';
    sel.appendChild(opt);
}

function renderCustomChips() {
    var container = document.getElementById('customChips');
    container.innerHTML = customLabels.map(function(l) {
        return '<span class="custom-chip">'
            + l
            + '<button class="custom-chip-del" onclick="removeCustomLabel(\'' + l.replace(/'/g, "\\'") + '\')" title="Remove">×</button>'
            + '</span>';
    }).join('');
}

/* ══════════════════════════════════════════════════════════════════
   HOLD DURATION — configurable via slider
══════════════════════════════════════════════════════════════════ */
var HOLD_MS = 1200;

function updateHoldDuration(ms) {
    HOLD_MS = parseInt(ms, 10);
    holdCand = null; holdStart = null;
    var arc = document.getElementById('holdArc');
    if (arc) { arc.style.strokeDashoffset = 113; }
    var lbl = document.getElementById('holdLabel');
    if (lbl) { lbl.innerHTML = 'hold<br>sign'; }
}

/* ══════════════════════════════════════════════════════════════════
   SPEECH-TO-TEXT (Web Speech API)
══════════════════════════════════════════════════════════════════ */
var _recognition = null, _micListening = false, _interimLen = 0;

function setMicStatus(msg, active) {
    var el = document.getElementById('micStatus');
    if (!msg) { el.innerHTML = ''; el.className = 'mic-status'; return; }
    el.className = 'mic-status' + (active ? ' active' : '');
    el.innerHTML = active ? '<span class="mic-dot"></span>' + msg : msg;
}

function toggleMic() {
    var btn = document.getElementById('micBtn');
    var icon = document.getElementById('micIcon');
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setMicStatus('⚠ Not supported in this browser', false); return; }
    if (_micListening) {
        if (_recognition) { _recognition.stop(); _recognition = null; }
        _micListening = false; btn.classList.remove('listening'); icon.textContent = '🎤';
        setMicStatus('Dictation stopped', false);
        setTimeout(function() { setMicStatus(''); }, 2000); return;
    }
    _recognition = new SpeechRecognition();
    _recognition.continuous = true; _recognition.interimResults = true; _recognition.lang = 'en-US';
    _interimLen = 0;
    _recognition.onstart = function() { _micListening = true; btn.classList.add('listening'); icon.textContent = '⏹'; setMicStatus('Listening… speak now', true); };
    _recognition.onresult = function(event) {
        var interim = '', finalText = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
            var t = event.results[i][0].transcript;
            if (event.results[i].isFinal) { finalText += t; } else { interim += t; }
        }
        if (finalText) {
            for (var r = 0; r < _interimLen; r++) { if (cursorPos > 0) { sentence.splice(cursorPos - 1, 1); cursorPos--; } }
            _interimLen = 0;
            finalText.split('').forEach(function(ch) { sentence.splice(cursorPos, 0, {ch: ch, type: 'let'}); cursorPos++; });
            renderSentence();
        } else if (interim) {
            for (var r = 0; r < _interimLen; r++) { if (cursorPos > 0) { sentence.splice(cursorPos - 1, 1); cursorPos--; } }
            interim.split('').forEach(function(ch) { sentence.splice(cursorPos, 0, {ch: ch, type: 'let'}); cursorPos++; });
            _interimLen = interim.length; renderSentence();
        }
    };
    _recognition.onerror = function(event) {
        if (event.error === 'no-speech') return;
        setMicStatus('⚠ ' + event.error, false); _micListening = false;
        btn.classList.remove('listening'); icon.textContent = '🎤'; _recognition = null;
    };
    _recognition.onend = function() { if (_micListening && _recognition) { try { _recognition.start(); } catch(e) {} } };
    try { _recognition.start(); } catch(e) { setMicStatus('⚠ Could not start microphone', false); }
}

/* ══════════════════════════════════════════════════════════════════
   DEXTER — ASL hand-shape knowledge base
══════════════════════════════════════════════════════════════════ */
var DEXTER_DATA = {
    'A': {type:'let',intro:"Make a <strong>fist</strong> with your dominant hand — but keep the thumb resting on the side, not tucked inside.",steps:["Curl all four fingers tightly into your palm.","Rest your thumb along the side of your index finger — <em>not across or inside the fist</em>.","Hold the fist upright, knuckles facing forward."],tip:"Think of a solid 'thumbs neutral' fist — thumb visible on the side."},
    'B': {type:'let',intro:"Hold all four <strong>fingers straight up</strong> and close together, with the thumb folded across the palm.",steps:["Extend all four fingers fully, pressing them together.","Bend your thumb across the palm — tucked beneath the fingers.","Keep the palm facing outward and fingers pointing up."],tip:"Like showing someone a flat 'stop' — but thumb is folded in, not extended."},
    'C': {type:'let',intro:"Curve your hand into a <strong>C shape</strong>, like you're holding a cup.",steps:["Extend all four fingers and bend them into a gentle arc.","Curve your thumb to mirror the same arc below.","Leave a rounded gap between thumb and fingers — the letter C shape."],tip:"Imagine gripping the side of a large coffee mug."},
    'D': {type:'let',intro:"Point your <strong>index finger up</strong> while the other fingers touch the thumb tip in a circle.",steps:["Extend your index finger straight up.","Curve your middle, ring, and pinky fingers down to touch your thumb.","The three fingers and thumb form a rounded circle on the lower portion."],tip:"The circle at the bottom and the upright index make the shape of a 'D'."},
    'E': {type:'let',intro:"<strong>Curl all fingers</strong> forward and bring them down toward the thumb.",steps:["Bend all four fingers forward at the second knuckle so the fingertips point downward.","Bring your thumb up slightly to meet the curled fingertips.","Keep a slight gap — fingers and thumb don't need to fully touch."],tip:"Think of a gentle claw shape with all fingers bent over and thumb up."},
    'F': {type:'let',intro:"Touch your <strong>index finger to your thumb</strong> in a circle, with the other three fingers extended.",steps:["Touch the tip of your index finger to the tip of your thumb, making an 'O' circle.","Extend your middle, ring, and pinky fingers upward and spread slightly.","Keep the circle open and round."],tip:"Similar to the OK gesture, but with fingers spread more naturally upward."},
    'G': {type:'let',intro:"Point your <strong>index finger sideways</strong> (to the side), with thumb parallel to it — like aiming a gun sideways.",steps:["Extend your index finger horizontally to the side.","Extend your thumb in the same horizontal direction, parallel below the index finger.","Curl the middle, ring, and pinky fingers into the palm.","Hold the shape sideways, not upright."],tip:"Rotate a 'gun hand' so it points sideways rather than forward."},
    'H': {type:'let',intro:"Point your <strong>index and middle fingers together sideways</strong>, like a two-finger side-point.",steps:["Extend your index and middle fingers together, horizontally to the side.","Keep those two fingers touching side by side.","Fold the ring and pinky fingers down, and tuck the thumb."],tip:"Like the letter G, but with two fingers extended instead of one."},
    'I': {type:'let',intro:"Extend only your <strong>pinky finger</strong> upward — a solo pinky wave.",steps:["Make a fist with your hand.","Extend your pinky finger straight up.","Keep all other fingers and the thumb curled in."],tip:"Just your pinky, standing tall. Everything else is tucked away."},
    'J': {type:'mot',intro:"This is a <strong>motion letter</strong>! Start with a pinky sign (like 'I'), then draw a 'J' shape in the air.",steps:["Extend your pinky finger (same as the letter I).","Starting from the top, trace a 'J' curve in the air — <em>move your pinky down, then curl it upward and to the left</em>.","The motion should be smooth and looping, like writing the letter J."],tip:"The app watches for this J-curve motion automatically — just perform the letter naturally and hold still at the end."},
    'K': {type:'let',intro:"Extend your <strong>index and middle fingers in a V</strong>, with your thumb touching between them.",steps:["Extend your index finger straight up and middle finger angled slightly forward.","Place your thumb between the index and middle fingers, touching the side of the middle finger.","Fold the ring and pinky fingers into the palm."],tip:"Like a peace sign, but with the thumb pushed up between the two fingers."},
    'L': {type:'let',intro:"Make an <strong>L shape</strong> — index finger pointing up, thumb pointing to the side.",steps:["Extend your index finger straight up.","Extend your thumb horizontally to the side.","Curl your middle, ring, and pinky fingers into the palm."],tip:"The classic 'L for Loser' hand shape — but now you're using it to learn ASL!"},
    'M': {type:'let',intro:"Fold <strong>three fingers (index, middle, ring) over the thumb</strong>, which is tucked into the palm.",steps:["Tuck your thumb loosely into your palm.","Fold your index, middle, and ring fingers down over the thumb.","Keep the pinky finger curled in similarly.","Hold the hand with knuckles forward."],tip:"Visualize three 'humps' of the letter M — the three fingertips represent each hump."},
    'N': {type:'let',intro:"Similar to M, but only <strong>two fingers (index and middle)</strong> fold over the tucked thumb.",steps:["Tuck your thumb loosely into your palm.","Fold your index and middle fingers down over the thumb.","Keep ring and pinky fingers curled into the palm (not over thumb)."],tip:"Two humps for N, three for M — very similar signs, so pay attention to the finger count."},
    'O': {type:'let',intro:"Curve all fingers and thumb together to form a <strong>round O shape</strong>.",steps:["Curve all four fingers downward and inward.","Bring your thumb up to meet the fingertips.","All fingers and thumb should touch (or nearly touch) forming a circle."],tip:"The shape of your hand literally looks like the letter O when viewed from the side."},
    'P': {type:'let',intro:"Similar to K, but <strong>rotated downward</strong> — index and middle point down, thumb out.",steps:["Start with a K handshape (index up, middle forward, thumb between them).","Rotate your wrist so the fingers point downward.","Your thumb should now point to the side, and the V of fingers faces down."],tip:"Think of it as a K that's been tipped over to point at the ground."},
    'Q': {type:'let',intro:"Like G but <strong>rotated downward</strong> — index and thumb both point down.",steps:["Start with a G handshape (index and thumb extended sideways).","Rotate your wrist so both the index finger and thumb point downward.","The other fingers remain curled in the palm."],tip:"It's a G that's pointing toward the floor instead of sideways."},
    'R': {type:'let',intro:"<strong>Cross your index and middle fingers</strong> — like crossing your fingers for luck.",steps:["Extend your index finger upward.","Cross your middle finger over the top of your index finger.","Fold the ring and pinky fingers down, and tuck the thumb."],tip:"Literally the 'crossed fingers' gesture you make for good luck."},
    'S': {type:'let',intro:"Make a <strong>fist with the thumb across the front</strong> of your curled fingers.",steps:["Curl all four fingers into a fist.","Place your thumb across the front of your fingers, over the middle knuckles.","The thumb rests horizontally across the outside of the fist."],tip:"Very close to A, but the thumb wraps over the front of the fingers rather than resting at the side."},
    'T': {type:'let',intro:"Tuck your <strong>thumb between index and middle finger</strong>, making a compact fist-like shape.",steps:["Make a fist.","Extend your thumb upward, then tuck it between your index and middle fingers.","The thumb tip should be visible between those two fingers."],tip:"It looks like a compact fist with the thumb peeking through the middle."},
    'U': {type:'let',intro:"Extend <strong>index and middle fingers straight up together</strong> — the peace sign without spreading.",steps:["Extend your index and middle fingers fully upward, pressing them together.","Fold the ring and pinky fingers down.","Tuck the thumb across the folded fingers."],tip:"Like a peace sign but with the two fingers kept together rather than spread into a V."},
    'V': {type:'let',intro:"Spread your <strong>index and middle fingers into a V</strong> — the peace/victory sign!",steps:["Extend your index and middle fingers fully, spread apart in a V shape.","Fold the ring and pinky fingers down.","Tuck the thumb across the folded fingers."],tip:"The classic peace sign. You probably already know this one!"},
    'W': {type:'let',intro:"Extend <strong>three fingers (index, middle, ring) spread apart</strong> in a W shape.",steps:["Extend your index, middle, and ring fingers fully, spreading them apart.","Fold your pinky finger down.","Tuck the thumb across the folded pinky."],tip:"Three fingers fanned out wide. Think 'W for Wide' to remember the spread."},
    'X': {type:'let',intro:"Make a <strong>hook with your index finger</strong> — bent like a fishhook.",steps:["Curl your index finger into a bent hook shape (not fully curled, just crooked at the joint).","Keep all other fingers curled into the palm.","Tuck the thumb across the fingers."],tip:"Just a crooked, hooked index finger — like beckoning someone to come closer."},
    'Y': {type:'let',intro:"Extend your <strong>thumb and pinky</strong> outward — the 'hang loose' or shaka sign.",steps:["Extend your thumb out to the side.","Extend your pinky finger up and slightly outward.","Curl your index, middle, and ring fingers into the palm."],tip:"The surfer's 'hang loose' shaka sign — easy to remember!"},
    'Z': {type:'mot',intro:"This is a <strong>motion letter</strong>! Extend your index finger and draw a 'Z' shape in the air.",steps:["Extend only your index finger (all others curled, like the number 1).","Draw a Z in the air: <em>move right, then diagonally down-left, then right again</em>.","The three strokes of the Z should be smooth and deliberate."],tip:"Write the letter Z with your fingertip in the air. The app watches for this zigzag motion pattern."},
    '0': {type:'num',intro:"Touch all <strong>fingertips to the thumb tip</strong> to form a round O — like blowing a kiss.",steps:["Bring all four fingertips together toward your thumb tip.","All five digits touch at their tips, forming a rounded bundle.","The shape looks like an O or a closed bud from the side."],tip:"Similar to the letter O, but all fingertips touch the thumb tip more precisely. Think of pinching air."},
    '1': {type:'num',intro:"Point your <strong>index finger straight up</strong> — one finger, one number.",steps:["Extend your index finger fully upward.","Curl all other fingers into the palm.","Tuck the thumb across the curled fingers."],tip:"Simple and intuitive — just one finger pointing up to mean 'one'."},
    '2': {type:'num',intro:"Hold up <strong>two fingers in a V</strong> — like the number 2 or the peace sign.",steps:["Extend your index and middle fingers upward, slightly spread.","Fold ring and pinky fingers down.","Tuck the thumb."],tip:"Like the letter V or a peace sign. Two fingers = two."},
    '3': {type:'num',intro:"Extend <strong>thumb, index, and middle fingers</strong> — three fingers up.",steps:["Extend your thumb out to the side.","Extend your index and middle fingers straight up.","Fold ring and pinky fingers into the palm."],tip:"Think of it as the number 2 plus an added thumb making the spread look like a '3'."},
    '4': {type:'num',intro:"Extend <strong>four fingers (index through pinky)</strong> straight up, thumb folded in.",steps:["Extend all four fingers (index, middle, ring, pinky) straight up together.","Fold your thumb across into the palm.","Hold palm forward."],tip:"Four fingers up, thumb hidden — clean and simple."},
    '5': {type:'num',intro:"Spread <strong>all five fingers wide open</strong> — an open hand.",steps:["Open your hand fully.","Spread all five fingers as wide as they'll comfortably go.","Hold the open palm facing outward."],tip:"The most natural hand position — just open your hand wide!"},
    '6': {type:'num',intro:"Touch your <strong>pinky to your thumb</strong> while keeping other fingers extended.",steps:["Extend your index, middle, and ring fingers upward.","Touch the tip of your pinky to the tip of your thumb.","Keep the three extended fingers straight and spread slightly."],tip:"Think of it as a modified 'W' but with thumb and pinky connected below."},
    '7': {type:'num',intro:"Touch your <strong>ring finger to your thumb</strong> while keeping others extended.",steps:["Extend your index, middle, and pinky fingers upward.","Touch the tip of your ring finger to the tip of your thumb.","Keep the three other fingers comfortably extended."],tip:"Similar to 6 but move one finger inward — the ring finger connects to the thumb now."},
    '8': {type:'num',intro:"Touch your <strong>middle finger to your thumb</strong> while keeping others extended.",steps:["Extend your index, ring, and pinky fingers upward.","Bring your middle finger down to touch the tip of your thumb.","Keep the three remaining fingers extended and relaxed."],tip:"Working down from the outside in — pinky for 6, ring for 7, middle for 8."},
    '9': {type:'num',intro:"Touch your <strong>index finger to your thumb</strong> while other fingers are extended — like the OK sign with extras.",steps:["Touch the tip of your index finger to the tip of your thumb, making a circle.","Extend your middle, ring, and pinky fingers upward.","Hold the shape comfortably upright."],tip:"Very close to the letter F — the difference is subtle; practice both to distinguish them."}
};

function openDexter(letter) {
    var data = DEXTER_DATA[letter];
    var isCustom = customLabels.indexOf(letter) >= 0;
    var t, intro, steps, tip;
    if (isCustom) {
        t = 'custom';
        intro = 'This is a <strong>custom label</strong> you defined for <strong>"' + letter + '"</strong>. Train it by signing your chosen gesture and saving samples in Training Data.';
        steps = [
            'Open Training Data and select "' + letter + '" from the dropdown.',
            'Hold your chosen gesture in front of the camera.',
            'Click "Save sample" multiple times from slightly different angles.',
            'Switch to Custom mode and test your gesture.'
        ];
        tip = 'The more samples you add (10-20+), the more reliably the KNN classifier will recognise it.';
    } else {
        if (!data) return;
        t = data.type; intro = data.intro; steps = data.steps; tip = data.tip;
    }
    var badge = document.getElementById('dexterBadge');
    badge.textContent = letter.length > 4 ? letter.slice(0, 4) + '…' : letter;
    badge.className = 'dexter-sign-badge ' + t;
    var doneBtn = document.getElementById('dexterDoneBtn');
    doneBtn.className = 'dexter-done-btn ' + t;
    var stepClass = t === 'mot' ? 'mot' : (t === 'num' ? 'num' : (t === 'custom' ? 'custom' : ''));
    var bubbleClass = 'dexter-bubble' + (t === 'mot' ? ' mot-bubble' : (t === 'num' ? ' num-bubble' : (t === 'custom' ? ' custom-bubble' : '')));
    var typeLabel = t === 'mot'
        ? '<span style="color:var(--accent3);font-size:10px;font-family:\'DM Mono\',monospace;display:block;margin-bottom:6px;">★ MOTION LETTER — requires hand movement</span>'
        : (t === 'num'
            ? '<span style="color:var(--accent4);font-size:10px;font-family:\'DM Mono\',monospace;display:block;margin-bottom:6px;">◆ NUMBER SIGN — switch to numbers mode</span>'
            : (t === 'custom'
                ? '<span style="color:var(--accent5);font-size:10px;font-family:\'DM Mono\',monospace;display:block;margin-bottom:6px;">◈ CUSTOM LABEL — session only</span>'
                : ''));
    var stepsHTML = steps.map(function(s, i) {
        return '<div class="dexter-step"><div class="step-num ' + stepClass + '">' + (i+1) + '</div><div class="step-text">' + s + '</div></div>';
    }).join('');
    var tipHTML = tip ? '<div class="dexter-tip">' + tip + '</div>' : '';
    document.getElementById('dexterBody').innerHTML =
        '<div class="' + bubbleClass + '">' + typeLabel + '<p>' + intro + '</p></div>' +
        '<div class="dexter-steps">' + stepsHTML + '</div>' + tipHTML;
    document.getElementById('dexterBackdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeDexter() {
    document.getElementById('dexterBackdrop').classList.remove('open');
    document.body.style.overflow = '';
}

function closeDexterIfBackdrop(e) {
    if (e.target === document.getElementById('dexterBackdrop')) closeDexter();
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        if (document.getElementById('pwBackdrop').classList.contains('open')) { closePwModal(); return; }
        closeDexter();
    }
    if (e.key === 'Enter' && document.getElementById('pwBackdrop').classList.contains('open')) {
        e.preventDefault(); submitPassword();
    }
});

/* ── TRAINING PANEL PASSWORD ── */
var TRAIN_PASSWORD = 'dexterity';
var _trainUnlocked = false;

function toggleTrainPanel() {
    var p = document.getElementById('trainPanel');
    if (!p.classList.contains('hidden')) {
        p.classList.add('hidden');
        p.previousElementSibling.querySelector('button').textContent = 'Show ▾';
        return;
    }
    if (_trainUnlocked) {
        p.classList.remove('hidden');
        p.previousElementSibling.querySelector('button').textContent = 'Hide ▴';
        renderTrainCounts();
        return;
    }
    openPwModal();
}

function openPwModal() {
    var modal = document.getElementById('pwBackdrop');
    var input = document.getElementById('pwInput');
    document.getElementById('pwError').textContent = '';
    input.value = ''; input.type = 'password';
    document.getElementById('pwToggle').textContent = '👁';
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(function(){ input.focus(); }, 120);
}

function closePwModal() {
    document.getElementById('pwBackdrop').classList.remove('open');
    document.body.style.overflow = '';
}

function submitPassword() {
    var val = document.getElementById('pwInput').value;
    var err = document.getElementById('pwError');
    if (val === TRAIN_PASSWORD) {
        _trainUnlocked = true; closePwModal();
        var p = document.getElementById('trainPanel');
        p.classList.remove('hidden');
        p.previousElementSibling.querySelector('button').textContent = 'Hide ▴';
        renderTrainCounts();
    } else {
        err.textContent = '✖ incorrect password';
        var input = document.getElementById('pwInput');
        input.value = ''; input.focus();
    }
}

function togglePwVisibility() {
    var input = document.getElementById('pwInput');
    var btn = document.getElementById('pwToggle');
    if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
    else { input.type = 'password'; btn.textContent = '👁'; }
}

/* ─── LANDMARK SMOOTHER (EMA) ─── */
var smoothedDraw = null, smoothedClass = null;
var ALPHA_DRAW = 0.25, ALPHA_CLASS = 0.55;

function initSmoothers() { smoothedDraw = null; smoothedClass = null; }

function applyEMA(prev, current, alpha) {
    if (!prev) return current.map(function(p) { return {x:p.x,y:p.y,z:p.z}; });
    return current.map(function(p, i) {
        return {x: prev[i].x + alpha*(p.x-prev[i].x), y: prev[i].y + alpha*(p.y-prev[i].y), z: prev[i].z + alpha*(p.z-prev[i].z)};
    });
}

function smoothLandmarks(lm) {
    smoothedDraw  = applyEMA(smoothedDraw,  lm, ALPHA_DRAW);
    smoothedClass = applyEMA(smoothedClass, lm, ALPHA_CLASS);
    return { draw: smoothedDraw, classify: smoothedClass };
}

function normLM(lm) {
    var w=lm[0], sc=Math.hypot(lm[9].x-w.x, lm[9].y-w.y, lm[9].z-w.z)||0.001;
    return lm.map(function(p){return{x:(p.x-w.x)/sc,y:(p.y-w.y)/sc,z:(p.z-w.z)/sc};});
}

/* ══════════════════════════════════════════════════════════════════
   PURE KNN CLASSIFIER
══════════════════════════════════════════════════════════════════ */
var allSamples = [];
var sampleCounts = {};
var LETTER_LABELS = ['A','B','C','D','E','F','G','H','I','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y'];
var NUMBER_LABELS = ['0','1','2','3','4','5','6','7','8','9'];

function flattenNormLM(lm) {
    var n = normLM(lm);
    var v = [];
    n.forEach(function(p) { v.push(p.x, p.y, p.z); });
    var mag = Math.sqrt(v.reduce(function(s, x) { return s+x*x; }, 0)) || 1;
    return v.map(function(x) { return x/mag; });
}

function classifyKNN(lm, mode) {
    var candidateLabels;
    if (mode === 'numbers') {
        candidateLabels = NUMBER_LABELS;
    } else if (mode === 'custom') {
        candidateLabels = customLabels.slice();
    } else {
        candidateLabels = LETTER_LABELS;
    }
    var candidates = allSamples.filter(function(s) { return candidateLabels.indexOf(s.label) >= 0; });
    if (candidates.length === 0) return {label: null, confidence: 0, top: [], noData: true};
    var incoming = flattenNormLM(lm);
    var K = Math.min(7, candidates.length);
    var scored = candidates.map(function(s) {
        var dot = 0;
        for (var i = 0; i < incoming.length; i++) dot += incoming[i] * s.flat[i];
        return {label: s.label, sim: dot};
    });
    scored.sort(function(a, b) { return b.sim - a.sim; });
    var topK = scored.slice(0, K);
    var bestSim = Math.max(0, topK[0].sim);
    var votes = {};
    topK.forEach(function(s) { votes[s.label] = (votes[s.label]||0) + 1; });
    var sortedVotes = Object.keys(votes).map(function(l) { return {l: l, v: votes[l]}; }).sort(function(a, b) { return b.v - a.v; });
    var winner = sortedVotes[0].l;
    var voteFrac = sortedVotes[0].v / K;
    var confidence = Math.min(1, voteFrac * 0.6 + bestSim * 0.4);
    var top = sortedVotes.map(function(item) { return {l: item.l, s: item.v, p: Math.round(item.v / K * 100)}; });
    return {label: winner, confidence: confidence, top: top.slice(0, 5), noData: false};
}

/* ══════════════════════════════════════════════════════════════════
   J & Z MOTION DETECTION
══════════════════════════════════════════════════════════════════ */
var TRAIL_LEN=30, idxTrail=[], pkTrail=[], motCD=0;

function pushTrail(lm) {
    var wx=lm[0].x, wy=lm[0].y, ps=Math.hypot(lm[9].x-wx,lm[9].y-wy)||0.01;
    idxTrail.push({x:(lm[8].x-wx)/ps, y:(lm[8].y-wy)/ps});
    pkTrail.push( {x:(lm[20].x-wx)/ps,y:(lm[20].y-wy)/ps});
    if(idxTrail.length>TRAIL_LEN){idxTrail.shift();pkTrail.shift();}
}

function trailDist(t) {
    var d=0;
    for(var i=1;i<t.length;i++) d+=Math.hypot(t[i].x-t[i-1].x,t[i].y-t[i-1].y);
    return d;
}

function normLMExt(lm, tip, pip, mcp, thr) {
    if(thr===undefined)thr=0.35;
    var n=normLM(lm);
    var len=Math.hypot(n[pip].x-n[mcp].x,n[pip].y-n[mcp].y)+0.001;
    return(n[mcp].y-n[tip].y)>len*thr;
}

function detectJ(lm) {
    if(motCD>0)return false;
    var n=normLM(lm);
    var iE=normLMExt(lm,8,6,5),mE=normLMExt(lm,12,10,9),rE=normLMExt(lm,16,14,13),pE=normLMExt(lm,20,18,17);
    if(!(!iE&&!mE&&!rE&&pE))return false;
    if(pkTrail.length<18||trailDist(pkTrail)<0.55)return false;
    var h=Math.floor(pkTrail.length*0.55),s1=pkTrail.slice(0,h),s2=pkTrail.slice(h);
    var dy1=s1[s1.length-1].y-s1[0].y,dx2=s2[s2.length-1].x-s2[0].x,dy2=Math.abs(s2[s2.length-1].y-s2[0].y);
    return dy1>0.22&&Math.abs(dx2)>0.18&&dy2<0.25;
}

function detectZ(lm) {
    if(motCD>0)return false;
    var n=normLM(lm);
    var iE=normLMExt(lm,8,6,5),mE=normLMExt(lm,12,10,9),rE=normLMExt(lm,16,14,13),pE=normLMExt(lm,20,18,17);
    if(!(iE&&!mE&&!rE&&!pE))return false;
    if(idxTrail.length<16||trailDist(idxTrail)<0.55)return false;
    var nl=idxTrail.length;
    var t1=idxTrail.slice(0,Math.floor(nl*.33)),t2=idxTrail.slice(Math.floor(nl*.33),Math.floor(nl*.66)),t3=idxTrail.slice(Math.floor(nl*.66));
    if(t1.length<3||t2.length<3||t3.length<3)return false;
    var dx1=t1[t1.length-1].x-t1[0].x,dx2=t2[t2.length-1].x-t2[0].x,dy2=t2[t2.length-1].y-t2[0].y,dx3=t3[t3.length-1].x-t3[0].x;
    return Math.abs(dx1)>0.12&&Math.abs(dx2)>0.10&&dy2>0.08&&Math.abs(dx3)>0.10&&Math.sign(dx1)!==Math.sign(dx2)&&Math.sign(dx3)===Math.sign(dx1);
}

/* ══════════════════════════════════════════════════════════════════
   HOLD LOGIC
══════════════════════════════════════════════════════════════════ */
var holdCand=null, holdStart=null;

function updateHold(label, isMotion, typeStr) {
    var arc=document.getElementById('holdArc'),lbl=document.getElementById('holdLabel'),C=113;
    if(isMotion){
        commitSign(label,'mot');motCD=25;idxTrail=[];pkTrail=[];
        holdCand=null;holdStart=null;
        arc.style.strokeDashoffset=0;lbl.innerHTML='✓';
        setTimeout(function(){arc.style.strokeDashoffset=C;lbl.innerHTML='hold<br>sign';},700);
        return;
    }
    if(!label){holdCand=null;holdStart=null;arc.style.strokeDashoffset=C;lbl.innerHTML='hold<br>sign';return;}
    if(label!==holdCand){holdCand=label;holdStart=Date.now();}
    var prog=Math.min((Date.now()-holdStart)/HOLD_MS,1);
    arc.style.strokeDashoffset=C*(1-prog);
    if(prog>=1){
        commitSign(label, typeStr || 'let');holdCand=null;holdStart=null;
        arc.style.strokeDashoffset=C;lbl.innerHTML='✓';
        setTimeout(function(){lbl.innerHTML='hold<br>sign';},600);
    }
}

/* ══════════════════════════════════════════════════════════════════
   INDEXEDDB — training data
══════════════════════════════════════════════════════════════════ */
var DB=null, DB_NAME='asl_training', DB_VER=1, STORE='samples';
var lastClassLM=null;

function openDB(cb) {
    var req=indexedDB.open(DB_NAME,DB_VER);
    req.onupgradeneeded=function(e){ e.target.result.createObjectStore(STORE,{keyPath:'id',autoIncrement:true}); };
    req.onsuccess=function(e){DB=e.target.result;cb&&cb();};
    req.onerror=function(){console.warn('IndexedDB unavailable');};
}

function dbGetAll(cb) {
    if(!DB)return cb([]);
    var tx=DB.transaction(STORE,'readonly');
    tx.objectStore(STORE).getAll().onsuccess=function(e){cb(e.target.result);};
}

function dbAdd(record, cb) {
    if(!DB)return;
    var tx=DB.transaction(STORE,'readwrite');
    tx.objectStore(STORE).add(record).onsuccess=function(){cb&&cb();};
}

function reloadSamples() {
    dbGetAll(function(rows) {
        sampleCounts = {};
        allSamples = [];
        var knownLabels = LETTER_LABELS.concat(NUMBER_LABELS).concat(['J','Z']).concat(customLabels);
        rows.forEach(function(r) {
            if(!r.landmarks||r.landmarks.length<21)return;
            // Only load samples whose labels are either built-in or currently active custom labels
            if (knownLabels.indexOf(r.label) < 0) return;
            sampleCounts[r.label] = (sampleCounts[r.label]||0) + 1;
            try { allSamples.push({label: r.label, flat: flattenNormLM(r.landmarks)}); } catch(e){}
        });
        renderTrainCounts();
        updateNodataBanner();
    });
}

function updateNodataBanner() {
    var banner=document.getElementById('nodataBanner');
    if(!banner)return;
    var candidateLabels;
    if (curMode === 'numbers') candidateLabels = NUMBER_LABELS;
    else if (curMode === 'custom') candidateLabels = customLabels.slice();
    else candidateLabels = LETTER_LABELS;
    var has=allSamples.some(function(s){return candidateLabels.indexOf(s.label)>=0;});
    banner.style.display = (candidateLabels.length === 0 || !has) ? 'block' : 'none';
}

function saveSample() {
    var lbl=document.getElementById('trainLabel').value;
    if(!lbl || lbl === '__custom_sep__'){showTrainStatus('Pick a label first','var(--accent2)');return;}
    if(!lastClassLM){showTrainStatus('No hand in frame','var(--accent2)');return;}
    var record={label:lbl,landmarks:lastClassLM,ts:Date.now()};
    dbAdd(record,function(){
        showTrainStatus('Saved sample for '+lbl+' ✓','var(--accent)');
        reloadSamples();
    });
}

function showTrainStatus(msg, col) {
    var el=document.getElementById('trainStatus');
    el.textContent=msg;el.style.color=col||'var(--accent)';
    clearTimeout(showTrainStatus._t);
    showTrainStatus._t=setTimeout(function(){el.textContent='';},2200);
}

function renderTrainCounts() {
    var el=document.getElementById('trainCounts');
    if(!el)return;
    var labels=['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','0','1','2','3','4','5','6','7','8','9'];
    var html = labels.map(function(l){
        var n=sampleCounts[l]||0;
        return '<span class="tc'+(n>0?' has':'')+'" title="'+n+' samples">'+l+(n?':'+n:'')+'</span>';
    }).join('');
    // Custom label counts
    if (customLabels.length > 0) {
        html += '<span class="tc" style="color:var(--accent5);border-color:rgba(167,139,250,.2);background:transparent;padding:1px 5px;margin-left:4px;">◈</span>';
        html += customLabels.map(function(l) {
            var n = sampleCounts[l] || 0;
            return '<span class="tc custom-tc' + (n > 0 ? ' has' : '') + '" title="' + n + ' samples">' + l + (n ? ':' + n : '') + '</span>';
        }).join('');
    }
    el.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════════
   MODE CYCLING: letters → numbers → custom (if any) → letters
══════════════════════════════════════════════════════════════════ */
var curMode='letters';

function cycleMode() {
    var modes = ['letters', 'numbers'];
    if (customLabels.length > 0) modes.push('custom');
    var idx = modes.indexOf(curMode);
    curMode = modes[(idx + 1) % modes.length];

    var btn=document.getElementById('modeBtn'),pill=document.getElementById('modePill');
    if (curMode === 'numbers') {
        btn.textContent='Mode: Numbers'; btn.className='btn mode-num';
        pill.textContent='NUMBERS'; pill.className='mode-pill num';
    } else if (curMode === 'custom') {
        btn.textContent='Mode: Custom'; btn.className='btn mode-custom';
        pill.textContent='CUSTOM'; pill.className='mode-pill custom';
    } else {
        btn.textContent='Mode: Letters'; btn.className='btn';
        pill.textContent='LETTERS'; pill.className='mode-pill let';
    }
    holdCand=null;holdStart=null;
    updateNodataBanner();
}

/* ══════════════════════════════════════════════════════════════════
   REFERENCE GRID — rebuilt whenever custom labels change
══════════════════════════════════════════════════════════════════ */
function rebuildRefGrid() {
    var g = document.getElementById('refGrid');
    g.innerHTML = '';

    // Section: Letters
    var letSep = document.createElement('div');
    letSep.className = 'ref-section-label';
    letSep.textContent = 'Letters';
    g.appendChild(letSep);

    var letterItems = [
        {l:'A'},{l:'B'},{l:'C'},{l:'D'},{l:'E'},{l:'F'},
        {l:'G'},{l:'H'},{l:'I'},{l:'J',mot:true},{l:'K'},{l:'L'},
        {l:'M'},{l:'N'},{l:'O'},{l:'P'},{l:'Q'},{l:'R'},
        {l:'S'},{l:'T'},{l:'U'},{l:'V'},{l:'W'},{l:'X'},
        {l:'Y'},{l:'Z',mot:true}
    ];
    letterItems.forEach(function(it) { g.appendChild(makeRefCell(it)); });

    // Section: Numbers
    var numSep = document.createElement('div');
    numSep.className = 'ref-section-label';
    numSep.textContent = 'Numbers';
    g.appendChild(numSep);

    var numberItems = [
        {l:'0',num:true},{l:'1',num:true},{l:'2',num:true},{l:'3',num:true},{l:'4',num:true},
        {l:'5',num:true},{l:'6',num:true},{l:'7',num:true},{l:'8',num:true},{l:'9',num:true}
    ];
    numberItems.forEach(function(it) { g.appendChild(makeRefCell(it)); });

    // Section: Custom (if any)
    if (customLabels.length > 0) {
        var custSep = document.createElement('div');
        custSep.className = 'ref-section-label';
        custSep.textContent = 'Custom';
        g.appendChild(custSep);

        customLabels.forEach(function(l) {
            g.appendChild(makeRefCell({l: l, custom: true}));
        });
    }
}

function makeRefCell(it) {
    var c = document.createElement('div');
    c.className = 'ref-cell' + (it.mot ? ' mot-cell' : '') + (it.num ? ' num-cell' : '') + (it.custom ? ' custom-cell' : '');
    c.id = 'gc-' + it.l;
    c.title = 'Click to see how to sign "' + it.l + '"';
    c.innerHTML = '<div class="ref-letter">' + it.l + '</div>'
        + '<div class="ref-desc">' + (it.mot ? '★ motion' : (it.num ? '◆ number' : (it.custom ? '◈ custom' : 'static'))) + '</div>'
        + '<div class="ref-hint">tap for help</div>';
    c.addEventListener('click', function() { openDexter(it.l); });
    return c;
}

function highlightRef(lbl) {
    document.querySelectorAll('.ref-cell').forEach(function(c){c.classList.remove('active');});
    if(lbl){var el=document.getElementById('gc-'+lbl);if(el)el.classList.add('active');}
}

// Initial build
rebuildRefGrid();

/* ══════════════════════════════════════════════════════════════════
   CURSOR-AWARE SENTENCE BUILDER
══════════════════════════════════════════════════════════════════ */
var sentence=[], cursorPos=0, signsN=0;

function renderSentence() {
    var el=document.getElementById('sentenceDisplay');
    if(sentence.length===0){el.className='sentence-display end-cursor';el.innerHTML='';return;}
    el.className='sentence-display'+(cursorPos===sentence.length?' end-cursor':'');
    el.innerHTML=sentence.map(function(item,i){
        var ch=item.ch===' '?'\u00a0':item.ch;
        var cls='s-char'+(i===cursorPos?' at-cursor':'');
        return '<span class="'+cls+'">'+ch+'</span>';
    }).join('');
}

function commitSign(ch, type) {
    sentence.splice(cursorPos,0,{ch:ch,type:type});
    cursorPos++;signsN++;
    document.getElementById('signsAdded').textContent=signsN;
    renderSentence();addChip(ch,type);
}

function cursorLeft(){if(cursorPos>0){cursorPos--;renderSentence();}}
function cursorRight(){if(cursorPos<sentence.length){cursorPos++;renderSentence();}}

function addSpace(){
    var prev=sentence[cursorPos-1];
    if(prev&&prev.ch===' ')return;
    sentence.splice(cursorPos,0,{ch:' ',type:'space'});
    cursorPos++;renderSentence();addChip('␣','space');
}

function deleteChar(){
    if(cursorPos===0)return;
    sentence.splice(cursorPos-1,1);cursorPos--;renderSentence();
}

function clearSentence(){sentence=[];cursorPos=0;renderSentence();document.getElementById('historyRow').innerHTML='';}

function copySentence(){
    var txt=sentence.map(function(i){return i.ch;}).join('');
    if(txt)navigator.clipboard.writeText(txt).catch(function(){});
}

var _speaking = false;
function speakSentence() {
    var txt = sentence.map(function(i){return i.ch;}).join('').trim().toLowerCase();
    if (!txt) return;
    var btn = document.getElementById('speakBtn');
    var icon = document.getElementById('speakIcon');
    if (_speaking) {
        window.speechSynthesis.cancel(); _speaking = false;
        btn.classList.remove('speaking'); icon.textContent = '🔊'; return;
    }
    var utt = new SpeechSynthesisUtterance(txt);
    utt.rate = 0.95; utt.pitch = 1;
    utt.onstart = function() { _speaking = true; btn.classList.add('speaking'); icon.textContent = '⏹'; };
    utt.onend = utt.onerror = function() { _speaking = false; btn.classList.remove('speaking'); icon.textContent = '🔊'; };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
}

function addChip(ch, type) {
    var row=document.getElementById('historyRow'),chip=document.createElement('span');
    chip.className='chip'+(type==='mot'?' mot':(type==='num'?' num':(type==='space'?' space':(type==='custom'?' custom':''))));
    chip.textContent=ch;row.appendChild(chip);
    while(row.children.length>24)row.removeChild(row.firstChild);
}

document.addEventListener('keydown',function(e){
    if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='TEXTAREA')return;
    if(e.key==='ArrowLeft'){e.preventDefault();cursorLeft();}
    else if(e.key==='ArrowRight'){e.preventDefault();cursorRight();}
    else if(e.key==='Backspace'){e.preventDefault();deleteChar();}
});

function setStatus(msg, active) {
    var el=document.getElementById('statusMsg');el.textContent=msg;el.className=active?'active':'';
}

function mergeAndReload(incoming) {
    dbGetAll(function(existing) {
        var existingTs = new Set(existing.map(function(r) { return r.ts; }));
        var fresh = incoming.filter(function(r) { return !existingTs.has(r.ts); });
        if (fresh.length === 0) { reloadSamples(); return; }
        var tx = DB.transaction(STORE, 'readwrite');
        var st = tx.objectStore(STORE);
        var i = 0;
        function next() {
            if (i < fresh.length) {
                var r = Object.assign({}, fresh[i++]); delete r.id; st.add(r).onsuccess = next;
            } else { reloadSamples(); }
        }
        next();
    });
}

function tryAutoImport() {
    fetch('./src/training.json?_=' + Date.now())
        .then(function(res) { if (!res.ok) throw new Error('not found'); return res.json(); })
        .then(function(data) { if (!Array.isArray(data) || !data.length) throw new Error('empty'); mergeAndReload(data); })
        .catch(function() { reloadSamples(); });
}

openDB(tryAutoImport);

/* ══════════════════════════════════════════════════════════════════
   CAMERA & INFERENCE
══════════════════════════════════════════════════════════════════ */
var CONN=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
var TIPS=[4,8,12,16,20];
var stream=null, animF=null, handsModel=null;
var vid=null, ov=null, octx=null, tc=null, tctx=null, scrTrail=[];

async function startCamera() {
    vid=document.getElementById('video');
    ov=document.getElementById('overlay'); octx=ov.getContext('2d');
    tc=document.getElementById('trailCanvas'); tctx=tc.getContext('2d');
    setStatus('Requesting camera…');
    try {
        stream=await navigator.mediaDevices.getUserMedia({video:{width:640,height:480}});
        vid.srcObject=stream;
        await new Promise(function(r){vid.onloadedmetadata=r;});
        ov.width=tc.width=vid.videoWidth;
        ov.height=tc.height=vid.videoHeight;
        document.getElementById('startBtn').style.display='none';
        document.getElementById('stopBtn').style.display='';
        document.getElementById('modeBtn').style.display='';
        setStatus('Loading MediaPipe hands model…');
        document.getElementById('modelBadge').textContent='⟳ loading model…';
        document.getElementById('modelBadge').className='badge badge-loading';
        handsModel=new Hands({locateFile:function(f){return 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/'+f;}});
        handsModel.setOptions({maxNumHands:1,modelComplexity:1,minDetectionConfidence:0.72,minTrackingConfidence:0.62});
        handsModel.onResults(onResults);
        await handsModel.initialize();
        initSmoothers();
        var sampleCount=allSamples.length;
        document.getElementById('modelBadge').textContent='✓ ready · '+sampleCount+' samples';
        document.getElementById('modelBadge').className='badge badge-ready';
        setStatus('Tracking…',true);
        updateNodataBanner();
        loop();
    } catch(e) { setStatus('Error: '+e.message); }
}

function stopCamera() {
    if(stream){stream.getTracks().forEach(function(t){t.stop();});stream=null;}
    if(animF){cancelAnimationFrame(animF);animF=null;}
    if(octx)octx.clearRect(0,0,ov.width,ov.height);
    if(tctx)tctx.clearRect(0,0,tc.width,tc.height);
    if(vid)vid.srcObject=null;
    document.getElementById('startBtn').style.display='';
    document.getElementById('stopBtn').style.display='none';
    document.getElementById('modeBtn').style.display='none';
    document.getElementById('nodataBanner').style.display='none';
    ['handCount','currentSign'].forEach(function(id){document.getElementById(id).textContent='—';});
    document.getElementById('detectLetter').textContent='—';
    document.getElementById('detectLabel').textContent='stopped';
    document.getElementById('confFill').style.width='0%';
    document.getElementById('confPct').textContent='—';
    document.getElementById('motBadge').style.display='none';
    updateHold(null,false,null);highlightRef(null);
    idxTrail=[];pkTrail=[];scrTrail=[];lastClassLM=null;
    initSmoothers();
    setStatus('Camera off');
}

async function loop() {
    if(!stream)return;
    if(vid&&vid.readyState>=2){ try{ await handsModel.send({image:vid}); } catch(e){} }
    if(stream) animF=requestAnimationFrame(loop);
}

function onResults(results) {
    ov.width=tc.width=vid.videoWidth;
    ov.height=tc.height=vid.videoHeight;
    octx.clearRect(0,0,ov.width,ov.height);
    if(motCD>0)motCD--;
    var det=results.multiHandLandmarks?results.multiHandLandmarks.length:0;
    document.getElementById('handCount').textContent=det;
    var mb=document.getElementById('motBadge');
    if(!det){
        document.getElementById('detectLetter').textContent='—';
        document.getElementById('detectLabel').textContent='no hand in frame';
        document.getElementById('confFill').style.width='0%';
        document.getElementById('confPct').textContent='—';
        document.getElementById('currentSign').textContent='—';
        mb.style.display='none';
        updateHold(null,false,null);highlightRef(null);
        idxTrail=[];pkTrail=[];scrTrail=[];lastClassLM=null;
        initSmoothers();
        tctx.clearRect(0,0,tc.width,tc.height);
        document.getElementById('topScores').innerHTML='—';
        document.getElementById('debugInfo').textContent='';
        return;
    }
    var rawLM=results.multiHandLandmarks[0];
    var smoothed=smoothLandmarks(rawLM);
    var drawLM=smoothed.draw;
    var classLM=smoothed.classify;
    lastClassLM=classLM;
    var W=ov.width, H=ov.height;
    CONN.forEach(function(p){
        octx.beginPath();
        octx.moveTo(drawLM[p[0]].x*W,drawLM[p[0]].y*H);
        octx.lineTo(drawLM[p[1]].x*W,drawLM[p[1]].y*H);
        octx.strokeStyle='rgba(0,180,255,.45)';octx.lineWidth=2;octx.stroke();
    });
    drawLM.forEach(function(p,i){
        var tip=TIPS.indexOf(i)>=0;
        octx.beginPath();octx.arc(p.x*W,p.y*H,tip?7:4,0,2*Math.PI);
        octx.fillStyle=tip?'rgba(0,212,255,.95)':'rgba(180,220,255,.85)';octx.fill();
        octx.strokeStyle=tip?'rgba(0,150,220,.9)':'rgba(0,212,255,.5)';
        octx.lineWidth=1.5;octx.stroke();
    });
    scrTrail.push({x:drawLM[8].x*W,y:drawLM[8].y*H});
    if(scrTrail.length>TRAIL_LEN)scrTrail.shift();
    tctx.clearRect(0,0,tc.width,tc.height);
    for(var i=1;i<scrTrail.length;i++){
        var a=i/scrTrail.length;
        tctx.strokeStyle='rgba(0,212,255,'+(a*.65)+')';tctx.lineWidth=a*2.5+.5;
        tctx.beginPath();tctx.moveTo(scrTrail[i-1].x,scrTrail[i-1].y);tctx.lineTo(scrTrail[i].x,scrTrail[i].y);tctx.stroke();
    }
    pushTrail(classLM);

    // Motion detection only in letters mode
    if(curMode==='letters'){
        var isJ=detectJ(classLM), isZ=detectZ(classLM);
        if(isJ||isZ){
            var ml=isJ?'J':'Z';
            mb.style.display='block';mb.textContent='✦ '+ml+' motion';
            var dl=document.getElementById('detectLetter');dl.textContent=ml;dl.className='detect-letter mot';
            document.getElementById('detectLabel').textContent='ASL: "'+ml+'" (motion)';
            document.getElementById('confFill').style.width='92%';document.getElementById('confFill').className='conf-fill';
            document.getElementById('confPct').textContent='motion';document.getElementById('currentSign').textContent=ml;
            highlightRef(ml);updateHold(ml,true,null);return;
        }
    }
    mb.style.display='none';
    var isN=(curMode==='numbers');
    var isCust=(curMode==='custom');
    var res=classifyKNN(classLM, curMode);
    var dl=document.getElementById('detectLetter');
    if(res.noData){
        dl.textContent='?';dl.className='detect-letter nodata';
        var noDataMsg = isCust && customLabels.length === 0
            ? 'add custom labels first → Training Data'
            : 'train first → open Training Data';
        document.getElementById('detectLabel').textContent=noDataMsg;
        document.getElementById('confFill').style.width='0%';document.getElementById('confFill').className='conf-fill';
        document.getElementById('confPct').textContent='—';document.getElementById('currentSign').textContent='—';
        document.getElementById('topScores').innerHTML='<span style="color:var(--accent2);font-size:10px;">no training samples for this mode</span>';
        document.getElementById('debugInfo').textContent='KNN · mode: '+curMode+' · samples: 0';
        highlightRef(null);updateHold(null,false,null);
        return;
    }
    var pct=Math.round(res.confidence*100);
    var dlClass = 'detect-letter' + (isN ? ' num' : (isCust ? ' custom' : ''));
    dl.textContent=res.label||'?';dl.className=dlClass;
    document.getElementById('detectLabel').textContent=res.label?(isCust?'Custom: "'+res.label+'"':(isN?'Number: '+res.label:'ASL: "'+res.label+'"')):'uncertain';
    document.getElementById('confFill').style.width=pct+'%';
    document.getElementById('confFill').className='conf-fill'+(isN?' num':(isCust?' custom':''));
    document.getElementById('confPct').textContent=pct+'%';document.getElementById('currentSign').textContent=res.label||'—';
    document.getElementById('topScores').innerHTML=res.top.map(function(sc,i){
        var bestCls = i===0 ? (isN?' best-num':(isCust?' best-custom':' best')) : '';
        return '<span class="sc'+bestCls+'">'+sc.l+': '+sc.s+'nn ('+sc.p+'%)</span>';
    }).join('');
    var modeCount = isCust ? customLabels.length : (isN ? NUMBER_LABELS.length : LETTER_LABELS.length);
    var modeSamples = allSamples.filter(function(s){
        var labels = isCust ? customLabels : (isN ? NUMBER_LABELS : LETTER_LABELS);
        return labels.indexOf(s.label) >= 0;
    }).length;
    document.getElementById('debugInfo').textContent='KNN · mode: '+curMode+' · total samples: '+allSamples.length+' · for mode: '+modeSamples;
    highlightRef(res.label);
    var typeStr = isN ? 'num' : (isCust ? 'custom' : 'let');
    updateHold(res.confidence>0.40?res.label:null, false, typeStr);
}