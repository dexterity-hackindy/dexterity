/* ── Password gate ── */
var CORRECT_PW = 'asl1234';
var SESSION_KEY = 'asl_unlocked';

function unlock() {
    var val = document.getElementById('pwInput').value;
    var errEl = document.getElementById('lockErr');
    var inp = document.getElementById('pwInput');
    if (val === CORRECT_PW) {
        sessionStorage.setItem(SESSION_KEY, '1');
        document.getElementById('lockScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = '';
        openDB(tryAutoImport);
    } else {
        inp.classList.add('error');
        errEl.classList.remove('hidden');
        inp.value = '';
        setTimeout(function() {
            inp.classList.remove('error');
            errEl.classList.add('hidden');
        }, 2000);
    }
}

function togglePw() {
    var inp = document.getElementById('pwInput');
    var icon = document.getElementById('eyeIcon');
    if (inp.type === 'password') {
        inp.type = 'text';
        icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>';
    } else {
        inp.type = 'password';
        icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    }
}

if (sessionStorage.getItem(SESSION_KEY) === '1') {
    document.getElementById('lockScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = '';
}

/* ── DB & App ── */
var DB=null, DB_NAME='asl_training', DB_VER=1, STORE='samples';
var allRows=[], filterLabel=null;

var LETTER_LABELS=['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
var NUMBER_LABELS=['0','1','2','3','4','5','6','7','8','9'];
var BUILTIN_LABELS = LETTER_LABELS.concat(NUMBER_LABELS);

var CONN=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
var TIPS=[4,8,12,16,20];

function openDB(cb){
    var req=indexedDB.open(DB_NAME,DB_VER);
    req.onupgradeneeded=function(e){e.target.result.createObjectStore(STORE,{keyPath:'id',autoIncrement:true});};
    req.onsuccess=function(e){DB=e.target.result;cb&&cb();};
    req.onerror=function(){document.getElementById('totalMsg').textContent='IndexedDB unavailable';};
}

function dbGetAll(cb){
    if(!DB)return cb([]);
    var tx=DB.transaction(STORE,'readonly');
    tx.objectStore(STORE).getAll().onsuccess=function(e){cb(e.target.result);};
}

function dbDelete(id,cb){
    if(!DB)return;
    var tx=DB.transaction(STORE,'readwrite');
    tx.objectStore(STORE).delete(id).onsuccess=function(){cb&&cb();};
}

function dbDeleteAll(cb){
    if(!DB)return;
    var tx=DB.transaction(STORE,'readwrite');
    tx.objectStore(STORE).clear().onsuccess=function(){cb&&cb();};
}

function dbAddBatch(records,cb){
    if(!DB||!records.length)return cb&&cb();
    var tx=DB.transaction(STORE,'readwrite');
    var st=tx.objectStore(STORE);
    var i=0;
    function next(){if(i<records.length){var r=Object.assign({},records[i++]);delete r.id;st.add(r).onsuccess=next;}else{cb&&cb();}}
    next();
}

function getCustomLabels(rows) {
    var custom = [];
    rows.forEach(function(r) {
        if (BUILTIN_LABELS.indexOf(r.label) < 0 && custom.indexOf(r.label) < 0) {
            custom.push(r.label);
        }
    });
    custom.sort();
    return custom;
}

function loadAll(){
    dbGetAll(function(rows){
        allRows=rows;
        renderSummary();
        renderSamples();
        document.getElementById('totalMsg').textContent=rows.length+' sample'+(rows.length!==1?'s':'');
    });
}

function renderSummary(){
    var counts={};
    allRows.forEach(function(r){counts[r.label]=(counts[r.label]||0)+1;});

    // Letters
    var gL=document.getElementById('summaryLetters');
    gL.innerHTML=LETTER_LABELS.map(function(l){
        var n=counts[l]||0;
        return '<div class="sum-cell'+(n===0?' zero':'')+(filterLabel===l?' active':'')+'" onclick="setFilter(\''+l+'\')">'
            +'<div class="sum-letter">'+l+'</div>'
            +'<div class="sum-count">'+n+'</div>'
            +'</div>';
    }).join('');

    // Numbers
    var gN=document.getElementById('summaryNumbers');
    gN.innerHTML=NUMBER_LABELS.map(function(l){
        var n=counts[l]||0;
        return '<div class="sum-cell num-cell'+(n===0?' zero':'')+(filterLabel===l?' active':'')+'" onclick="setFilter(\''+l+'\')">'
            +'<div class="sum-letter">'+l+'</div>'
            +'<div class="sum-count">'+n+'</div>'
            +'</div>';
    }).join('');

    // Custom
    var customLabels = getCustomLabels(allRows);
    var custSection = document.getElementById('customSection');
    var gC = document.getElementById('summaryCustom');
    if (customLabels.length > 0) {
        custSection.style.display = '';
        gC.innerHTML = customLabels.map(function(l) {
            var n = counts[l] || 0;
            var safeL = l.replace(/'/g, "\\'");
            return '<div class="sum-cell custom-cell'+(n===0?' zero':'')+(filterLabel===l?' active':'')+'" onclick="setFilter(\''+safeL+'\')">'
                +'<div class="sum-letter">'+l+'</div>'
                +'<div class="sum-count">'+n+'</div>'
                +'</div>';
        }).join('');
    } else {
        custSection.style.display = 'none';
        gC.innerHTML = '';
    }
}

function renderSamples(){
    var rows=filterLabel?allRows.filter(function(r){return r.label===filterLabel;}):allRows;
    document.getElementById('sectionLabel').textContent=
        filterLabel?'Label: '+filterLabel+' ('+rows.length+' samples)':'All samples ('+rows.length+')';
    var g=document.getElementById('samplesGrid');
    if(!rows.length){g.innerHTML='<div class="empty">No samples'+(filterLabel?' for '+filterLabel:'')+'.</div>';return;}
    rows=rows.slice().sort(function(a,b){return b.ts-a.ts;});
    g.innerHTML='';
    rows.forEach(function(r){
        var isCustom = BUILTIN_LABELS.indexOf(r.label) < 0;
        var card=document.createElement('div');
        card.className='sample-card' + (isCustom ? ' custom-card' : '');
        var canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;
        var meta=document.createElement('div');meta.className='sample-meta';
        meta.textContent=new Date(r.ts).toLocaleString();
        var lbl=document.createElement('div');
        lbl.className='sample-label' + (isCustom ? ' custom-label' : '');
        lbl.textContent=r.label;
        var del=document.createElement('button');del.className='btn danger sample-del';del.textContent='Delete';
        del.onclick=function(){dbDelete(r.id,loadAll);};
        card.appendChild(canvas);card.appendChild(lbl);card.appendChild(meta);card.appendChild(del);
        g.appendChild(card);
        drawHand(canvas,r.landmarks);
    });
}

function drawHand(canvas,lm){
    if(!lm||lm.length<21)return;
    var ctx=canvas.getContext('2d');
    var W=canvas.width,H=canvas.height;
    ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
    var xs=lm.map(function(p){return p.x;}),ys=lm.map(function(p){return p.y;});
    var minX=Math.min.apply(null,xs),maxX=Math.max.apply(null,xs);
    var minY=Math.min.apply(null,ys),maxY=Math.max.apply(null,ys);
    var rangeX=maxX-minX||1,rangeY=maxY-minY||1;
    var pad=14;
    function px(p){return pad+(p.x-minX)/rangeX*(W-pad*2);}
    function py(p){return pad+(p.y-minY)/rangeY*(H-pad*2);}
    CONN.forEach(function(c){
        ctx.beginPath();
        ctx.moveTo(px(lm[c[0]]),py(lm[c[0]]));
        ctx.lineTo(px(lm[c[1]]),py(lm[c[1]]));
        ctx.strokeStyle='rgba(0,212,255,.5)';ctx.lineWidth=1.5;ctx.stroke();
    });
    lm.forEach(function(p,i){
        var tip=TIPS.indexOf(i)>=0;
        ctx.beginPath();ctx.arc(px(p),py(p),tip?5:3,0,2*Math.PI);
        ctx.fillStyle=tip?'rgba(26,111,255,.95)':'rgba(0,212,255,.85)';ctx.fill();
    });
}

function setFilter(lbl){
    filterLabel=filterLabel===lbl?null:lbl;
    applyFilter();
}

function applyFilter(){
    var inp=document.getElementById('filterInput').value.trim().toUpperCase();
    if(inp)filterLabel=inp;
    renderSummary();renderSamples();
}

function clearFilter(){
    filterLabel=null;
    document.getElementById('filterInput').value='';
    renderSummary();renderSamples();
}

function deleteAll(){
    if(!confirm('Delete ALL '+allRows.length+' training samples? This cannot be undone.'))return;
    dbDeleteAll(loadAll);
}

function exportJSON(){
    var blob=new Blob([JSON.stringify(allRows,null,2)],{type:'application/json'});
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download='asl_training_'+Date.now()+'.json';a.click();
}

function importJSON(){document.getElementById('importFile').click();}

function handleImport(e){
    var file=e.target.files[0];if(!file)return;
    var reader=new FileReader();
    reader.onload=function(ev){
        try{
            var data=JSON.parse(ev.target.result);
            if(!Array.isArray(data))throw new Error('Not an array');
            dbAddBatch(data,function(){
                alert('Imported '+data.length+' samples.');
                loadAll();
            });
        }catch(err){alert('Import failed: '+err.message);}
    };
    reader.readAsText(file);
    e.target.value='';
}

function setAutoStatus(msg, color) {
    var el = document.getElementById('autoImportStatus');
    if (!el) return;
    el.textContent = msg;
    el.style.color = color || 'var(--accent)';
    el.style.display = msg ? 'inline' : 'none';
}

function mergeRecords(incoming) {
    dbGetAll(function(existing) {
        var existingTs = new Set(existing.map(function(r) { return r.ts; }));
        var fresh = incoming.filter(function(r) { return !existingTs.has(r.ts); });
        if (fresh.length === 0) {
            setAutoStatus('training_data.json — already up to date', 'var(--muted)');
            loadAll();
            return;
        }
        dbAddBatch(fresh, function() {
            setAutoStatus('training_data.json — auto-loaded ' + fresh.length + ' new sample' + (fresh.length !== 1 ? 's' : '') + ' ✓', 'var(--accent)');
            loadAll();
        });
    });
}

function tryAutoImport() {
    fetch('./src/training.json?_=' + Date.now())
        .then(function(res) {
            if (!res.ok) throw new Error('not found');
            return res.json();
        })
        .then(function(data) {
            if (!Array.isArray(data) || data.length === 0) throw new Error('empty');
            mergeRecords(data);
        })
        .catch(function() {
            setAutoStatus('', '');
            loadAll();
        });
}

if (sessionStorage.getItem(SESSION_KEY) === '1') {
    openDB(tryAutoImport);
}

window.addEventListener('load', function() {
    var inp = document.getElementById('pwInput');
    if (inp && document.getElementById('lockScreen').style.display !== 'none') {
        inp.focus();
    }
});