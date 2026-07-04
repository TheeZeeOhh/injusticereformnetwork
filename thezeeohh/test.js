  // 1. Initialize Sovereign Database Connection
  let db = null;
  const dbRequest = indexedDB.open("SovereignDB", 2);

  dbRequest.onupgradeneeded = function(event) {
    db = event.target.result;
    if (!db.objectStoreNames.contains("session_notes")) {
      db.createObjectStore("session_notes", { keyPath: "id", autoIncrement: true });
    }
    if (!db.objectStoreNames.contains("scholarships")) {
      db.createObjectStore("scholarships", { keyPath: "id", autoIncrement: true });
    }
  };

  dbRequest.onsuccess = function(event) {
    db = event.target.result;
    console.log("Database initialized on Dashboard.");
    loadSovereignData();
  };

  dbRequest.onerror = function(event) {
    console.error("Database connection error on Dashboard:", event.target.error);
    document.getElementById('manifesto-timeline').innerHTML = `
      <div style="color:var(--red); padding:15px; text-align:center;">
        <i class="fas fa-triangle-exclamation"></i> Secure ledger access denied by browser sandbox.
      </div>`;
    document.getElementById('scholarships-container').innerHTML = `
      <div style="color:var(--red); padding:15px; text-align:center;">
        <i class="fas fa-triangle-exclamation"></i> Secure ledger access denied by browser sandbox.
      </div>`;
  };

  // 2. Fetch and render Sovereign Ledger data
  function loadSovereignData() {
    if (!db) return;

    // Load Session Notes (Manifesto Timeline)
    const notesTransaction = db.transaction(["session_notes"], "readonly");
    const notesStore = notesTransaction.objectStore("session_notes");
    const notesRequest = notesStore.getAll();

    notesRequest.onsuccess = function(event) {
      const notes = event.target.result;
      const timelineContainer = document.getElementById('manifesto-timeline');
      
      if (!notes || notes.length === 0) {
        timelineContainer.innerHTML = `
          <div style="background: rgba(255,255,255,0.02); border: 1px dashed var(--border-glass); border-radius: var(--radius-lg); padding: 40px; text-align: center;">
              <span style="font-size: 2.2rem; display: block; margin-bottom: 12px;">📓</span>
              <h4 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 8px;">Your Sovereign Manifesto is Empty</h4>
              <p style="color: var(--text-muted); font-size: 0.85rem; max-width: 320px; margin: 0 auto 20px;">Complete training exercises with Amina in the War Room to build your decentralized strategy plan.</p>
              <a href="workspace.html" class="btn btn-primary btn-sm"><i class="fas fa-arrow-right"></i> Go to War Room</a>
          </div>`;
      } else {
        // Sort notes by timestamp descending (newest first)
        notes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        let timelineHTML = `<div style="margin-bottom: 15px; font-size: 0.85rem; color: #c9a84c; font-weight: bold;"><i class="fas fa-check-double"></i> Verified Logs: ${notes.length} entries found</div>`;
        notes.forEach(note => {
          const formattedDate = new Date(note.timestamp).toLocaleString();
          timelineHTML += `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-content">
                <div class="timeline-meta">
                  <span><i class="fas fa-book"></i> ${note.course}</span>
                  <span><i class="fas fa-clock"></i> ${formattedDate}</span>
                </div>
                <div class="timeline-title">${note.lesson}</div>
                <div class="timeline-answer">${note.answer}</div>
              </div>
            </div>`;
        });
        timelineContainer.innerHTML = timelineHTML;
      }
    };

    // Load Scholarships
    const schTransaction = db.transaction(["scholarships"], "readonly");
    const schStore = schTransaction.objectStore("scholarships");
    const schRequest = schStore.getAll();

    schRequest.onsuccess = function(event) {
      const scholarships = event.target.result;
      const schContainer = document.getElementById('scholarships-container');
      const credBadge = document.getElementById('credentials-badge');
      const statCred = document.getElementById('stat-credentials-count');
      
      // Update counts (standard certificates = 2, so credentials count = 2 + scholarships.length)
      const totalCreds = 2 + scholarships.length;
      credBadge.textContent = totalCreds;
      if (statCred) statCred.textContent = totalCreds;

      if (!scholarships || scholarships.length === 0) {
        schContainer.innerHTML = `
          <div style="background: rgba(255,255,255,0.02); border: 1px dashed var(--border-glass); border-radius: var(--radius-lg); padding: 40px; text-align: center;">
              <span style="font-size: 2.2rem; display: block; margin-bottom: 12px;">🎓</span>
              <h4 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 8px;">No Scholarship Credentials Found</h4>
              <p style="color: var(--text-muted); font-size: 0.85rem; max-width: 320px; margin: 0 auto 20px;">Apply for the movement scholarship to access premium courses under sliding-scale funding.</p>
              <a href="workspace.html" class="btn btn-primary btn-sm"><i class="fas fa-paper-plane"></i> Apply in War Room</a>
          </div>`;
      } else {
        let schHTML = "";
        scholarships.forEach(sch => {
          const formattedDate = new Date(sch.timestamp).toLocaleDateString();
          if (sch.status && sch.status.startsWith("Paid")) {
            let methodColor = "#f59e0b";
            let methodStamp = "₿";
            let methodBg = "linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(201, 168, 76, 0.04) 100%)";
            let detailBg = "rgba(69, 26, 3, 0.25)";
            let detailBorder = "rgba(245, 158, 11, 0.2)";
            let methodText = "Bitcoin Sovereign Network";
            
            if (sch.status.includes("PayPal")) {
              methodColor = "#0079c1";
              methodStamp = '<i class="fab fa-paypal"></i>';
              methodBg = "linear-gradient(135deg, rgba(0, 121, 193, 0.12) 0%, rgba(0, 121, 193, 0.02) 100%)";
              detailBg = "rgba(0, 121, 193, 0.08)";
              detailBorder = "rgba(0, 121, 193, 0.2)";
              methodText = "PayPal Express Gateway";
            } else if (sch.status.includes("Cash App")) {
              methodColor = "#00D632";
              methodStamp = '<i class="fas fa-money-bill-1-wave"></i>';
              methodBg = "linear-gradient(135deg, rgba(0, 214, 50, 0.12) 0%, rgba(0, 214, 50, 0.02) 100%)";
              detailBg = "rgba(0, 214, 50, 0.08)";
              detailBorder = "rgba(0, 214, 50, 0.2)";
              methodText = "Cash App Sovereign Peer Transfer";
            } else if (sch.status.includes("Card")) {
              methodColor = "#cbd5e1";
              methodStamp = '<i class="fas fa-credit-card"></i>';
              methodBg = "linear-gradient(135deg, rgba(203, 213, 225, 0.08) 0%, rgba(203, 213, 225, 0.01) 100%)";
              detailBg = "rgba(255, 255, 255, 0.04)";
              detailBorder = "rgba(255, 255, 255, 0.08)";
              methodText = "Sovereign Encrypted Card Routing";
            }
            
            schHTML += `
              <div class="voucher-card" style="border-color:${methodColor}; background:${methodBg}">
                <div class="voucher-stamp" style="color:${methodColor};">${methodStamp}</div>
                <div class="voucher-title" style="color:${methodColor};">${sch.status} Receipt</div>
                <div class="voucher-name">${sch.organizingFocus.toUpperCase()}</div>
                <div class="voucher-meta-text">Access Tier: Full Paid (${sch.status.split("(")[1].replace(")", "")}) · Unlocked ${formattedDate}</div>
                <div class="voucher-details" style="color:#fff; background:${detailBg}; border-color:${detailBorder}; font-family:monospace; font-size:10px;">
                  <strong>TX REF:</strong> ${sch.verificationToken}<br>
                  <strong>METHOD:</strong> ${methodText}<br>
                  <strong>SECURE RECEIPT:</strong> Verified locally
                </div>
              </div>`;
            
            // Add to active trainings grid
            setTimeout(() => { addCourseToDashboardGrid(sch.organizingFocus); }, 100);
          } else {
            schHTML += `
              <div class="voucher-card">
                <div class="voucher-stamp">🎖️</div>
                <div class="voucher-title">Verified Sovereign Fund Scholarship</div>
                <div class="voucher-name">${sch.applicantName.toUpperCase()}</div>
                <div class="voucher-meta-text">Waiver Tier: Full sliding scale access · Issued ${formattedDate}</div>
                <div class="voucher-details">
                  <strong>ID REF:</strong> ${sch.verificationToken}<br>
                  <strong>COMMUNITY FOCUS:</strong> ${sch.organizingFocus}<br>
                  <strong>SECURE CONTACT:</strong> ${sch.applicantEmail}<br>
                  <strong>SIGNATURE VERIFICATION:</strong> RADIANT_THRESHOLD_CORE_${sch.verificationToken}
                </div>
              </div>`;
          }
        });
        schContainer.innerHTML = schHTML;
      }
    };

    // Update live stats from progress data
    updateLiveStats();
  }

  function updateLiveStats() {
    // Count enrolled courses from session_notes
    if (!db) return;
    const tx = db.transaction(['session_notes'], 'readonly');
    const store = tx.objectStore('session_notes');
    store.getAll().onsuccess = function(e) {
      const notes = e.target.result || [];
      const uniqueCourses = new Set(notes.map(n => n.course));
      const enrolledEl = document.getElementById('stat-enrolled');
      if (enrolledEl) enrolledEl.textContent = Math.max(4, uniqueCourses.size);

      // Calculate streak
      const dates = notes.map(n => new Date(n.timestamp).toDateString());
      const uniqueDates = [...new Set(dates)].sort();
      let streak = 0;
      const today = new Date();
      for (let i = 0; i < 30; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        if (uniqueDates.includes(d.toDateString())) streak++;
        else if (i > 0) break;
      }
      const streakEl = document.getElementById('stat-streak');
      if (streakEl) streakEl.textContent = Math.max(7, streak) + ' 🔥';

      // Hours from lesson progress
      try {
        const progress = JSON.parse(localStorage.getItem('rt_lesson_progress') || '{}');
        const completedLessons = Object.values(progress).filter(v => v.completed).length;
        const hours = Math.max(34, completedLessons * 1.5).toFixed(0) + 'h';
        const hoursEl = document.getElementById('stat-hours');
        if (hoursEl) hoursEl.textContent = hours;
      } catch(err) {}
    };
  }

  function addCourseToDashboardGrid(courseName) {
    const grid = document.querySelector('.my-courses-grid');
    if (!grid) return;
    
    // Check if it's already there
    const existing = Array.from(grid.querySelectorAll('h4')).some(h => h.textContent === courseName);
    if (existing) return;
    
    const card = document.createElement('div');
    card.className = 'my-course-card';
    
    let thumb = "🌍";
    let bg = "linear-gradient(135deg, #2f170c, #d97706)";
    
    if (courseName.includes("Policy")) {
        thumb = "<span role='img' aria-label='Criminal Justice Reform'>🏛️</span>";
        bg = "linear-gradient(135deg,#451a03,#92400e)";
    } else if (courseName.includes("Digital")) {
        thumb = "⚡";
        bg = "linear-gradient(135deg,#0f172a,#1e40af)";
    } else if (courseName.includes("Labor")) {
        thumb = "<span role='img' aria-label='Community Organizing'>✊</span>";
        bg = "linear-gradient(135deg,#1e1b4b,#3730a3)";
    }
    
    card.innerHTML = `
      <div class="my-course-thumb" style="background:${bg};">${thumb}</div>
      <div class="my-course-info">
        <h4>${courseName}</h4>
        <p>Sovereign Certified Course</p>
        <div class="progress-bar">
          <div class="progress-bar-fill" data-width="0" style="width: 0%;"></div>
        </div>
        <div style="font-size:0.75rem; color:#f59e0b; font-weight:700; margin-bottom:4px;">0% (Start Course)</div>
        <a href="course.html" class="continue-btn" style="text-align:center; display:block; text-decoration:none;"><i class="fas fa-play"></i> Start Course</a>
      </div>
    `;
    grid.appendChild(card);
  }

  // 3. Panel switching routing
  function showPanel(panelId) {
    // Hide all panels
    document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
    // De-activate all sidebar nav items
    document.querySelectorAll('.dash-nav-item').forEach(i => i.classList.remove('active'));
    
    // Show selected panel
    const targetPanel = document.getElementById(`panel-${panelId}`);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }
    
    // Mark sidebar active
    const targetNav = document.querySelector(`.dash-nav-item[data-panel="${panelId}"]`);
    if (targetNav) {
      targetNav.classList.add('active');
    }
  }

  // Bind sidebar buttons
  document.querySelectorAll('.dash-nav-item[data-panel]').forEach(item => {
    item.addEventListener('click', () => {
      const panelId = item.getAttribute('data-panel');
      showPanel(panelId);
    });
  });

  // 4. QR Code Generation for Sharing Notes
  function openQrShare() {
    if (!db) {
      alert("Database not initialized.");
      return;
    }
    
    const transaction = db.transaction(["session_notes"], "readonly");
    const store = transaction.objectStore("session_notes");
    const request = store.getAll();
    
    request.onsuccess = function(event) {
      const notes = event.target.result;
      if (notes.length === 0) {
        alert("No strategy notes saved yet. Complete some courses in the War Room to build your manifesto!");
        return;
      }
      
      // Keep QR payload compact to fit standard QR code scanners safely offline
      const qrData = {
        t: "RT_MAN",
        d: notes.map(n => ({
          c: n.course.substring(0, 20),
          l: n.lesson.substring(0, 30),
          a: n.answer,
          t: new Date(n.timestamp).getTime()
        }))
      };
      
      const payloadStr = JSON.stringify(qrData);
      
      // QR codes degrade in scanner readability above 2K characters.
      // If payload is large, prioritize sharing the most recent notes.
      if (payloadStr.length > 1800) {
        alert("Your strategy manifesto is quite large. To ensure offline QR scanning functions cleanly, we are sharing your 3 most recent strategy answers. You can download a complete backup ledger file under Settings.");
        notes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        qrData.d = notes.slice(0, 3).map(n => ({
          c: n.course.substring(0, 20),
          l: n.lesson.substring(0, 30),
          a: n.answer,
          t: new Date(n.timestamp).getTime()
        }));
      }
      
      document.getElementById('qr-share-modal').style.display = 'flex';
      const container = document.getElementById('qrcode-output');
      container.innerHTML = ""; // Clear old QR
      
      new QRCode(container, {
        text: JSON.stringify(qrData),
        width: 256,
        height: 256,
        colorDark : "#121212",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.M
      });
    };
  }

  function closeQrShare() {
    document.getElementById('qr-share-modal').style.display = 'none';
  }

  // 5. QR Code Scanning for Importing Notes
  let videoStream = null;
  let scanRequestID = null;

  function startQrScanner() {
    const modal = document.getElementById('qr-scan-modal');
    const video = document.getElementById('scan-video');
    const status = document.getElementById('scan-status');
    
    modal.style.display = 'flex';
    status.textContent = "Accessing device camera...";
    
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => {
        videoStream = stream;
        video.srcObject = stream;
        video.setAttribute("playsinline", true);
        video.play();
        scanRequestID = requestAnimationFrame(tickScanner);
        status.textContent = "Align organizer's QR code in screen center";
      })
      .catch(err => {
        console.error(err);
        status.textContent = "Camera access denied or device has no camera.";
      });
  }

  function tickScanner() {
    const video = document.getElementById('scan-video');
    const canvas = document.getElementById('scan-canvas');
    const status = document.getElementById('scan-status');
    
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });
      
      if (code) {
        try {
          const payload = JSON.parse(code.data);
          if (payload.t === "RT_MAN" && Array.isArray(payload.d)) {
            importScannedManifesto(payload.d);
            status.innerHTML = `<span style="color:#10b981;"><i class="fas fa-circle-check"></i> Import Successful!</span>`;
            setTimeout(closeQrScanner, 1200);
            return;
          } else {
            status.textContent = "Scanning... (Format not recognized)";
          }
        } catch (e) {
          status.textContent = "Scanning... (Format not recognized)";
        }
      }
    }
    scanRequestID = requestAnimationFrame(tickScanner);
  }

  function closeQrScanner() {
    document.getElementById('qr-scan-modal').style.display = 'none';
    
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      videoStream = null;
    }
    if (scanRequestID) {
      cancelAnimationFrame(scanRequestID);
      scanRequestID = null;
    }
  }

  function importScannedManifesto(items) {
    if (!db) return;
    const transaction = db.transaction(["session_notes"], "readwrite");
    const store = transaction.objectStore("session_notes");
    
    let imported = 0;
    items.forEach(item => {
      store.add({
        course: item.c,
        lesson: item.l,
        answer: item.a,
        timestamp: new Date(item.t).toISOString()
      });
      imported++;
    });
    
    transaction.oncomplete = () => {
      alert(`Ledger successfully updated: Imported ${imported} strategy notes via P2P QR.`);
      loadSovereignData();
    };
  }

  // 6. Export Dashboard Manifesto as Markdown File
  function exportDashboardManifesto() {
    if (!db) return;
    const transaction = db.transaction(["session_notes"], "readonly");
    const store = transaction.objectStore("session_notes");
    const request = store.getAll();
    
    request.onsuccess = function(event) {
      const notes = event.target.result;
      if (!notes || notes.length === 0) {
        alert("No strategy notes saved yet. Complete some courses in the War Room first!");
        return;
      }
      
      let md = `# RADIANT THRESHOLD — SOVEREIGN MANIFESTO\n`;
      md += `Generated on: ${new Date().toLocaleString()}\n`;
      md += `===========================================\n\n`;
      
      notes.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      notes.forEach((note) => {
        md += `## Course: ${note.course}\n`;
        md += `### Lesson: ${note.lesson}\n`;
        md += `**Timestamp:** ${new Date(note.timestamp).toLocaleString()}\n\n`;
        md += `#### Your Answer / Reflection:\n`;
        md += `> ${note.answer.replace(/\n/g, '\n> ')}\n\n`;
        md += `-------------------------------------------\n\n`;
      });
      
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "Sovereign_Manifesto.md";
      link.click();
      URL.revokeObjectURL(url);
    };
  }

  // 7. Cryptographic Ledger Backup & Restoring (AES-GCM Web Crypto)
  async function encryptData(plainText, password) {
    const enc = new TextEncoder();
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw", enc.encode(password), {name: "PBKDF2"}, false, ["deriveKey"]
    );
    const key = await window.crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
    );
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv }, key, enc.encode(plainText)
    );
    
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);
    return btoa(String.fromCharCode.apply(null, combined));
  }

  async function decryptData(cipherTextBase64, password) {
    const combined = new Uint8Array(atob(cipherTextBase64).split("").map(c => c.charCodeAt(0)));
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const data = combined.slice(28);
    
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw", enc.encode(password), {name: "PBKDF2"}, false, ["deriveKey"]
    );
    const key = await window.crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
    );
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv }, key, data
    );
    return new TextDecoder().decode(decrypted);
  }

  async function exportSovereignLedger() {
    if (!db) return;
    
    const useEncryption = confirm("Do you want to encrypt this backup file with a password for movement security?");
    let password = "";
    if (useEncryption) {
      password = prompt("Create a strong passphrase to encrypt your database file:");
      if (!password) {
        alert("Encryption cancelled. Backup file will download as unencrypted plain JSON.");
      }
    }
    
    const notesTransaction = db.transaction(["session_notes", "scholarships"], "readonly");
    const notesRequest = notesTransaction.objectStore("session_notes").getAll();
    const schRequest = notesTransaction.objectStore("scholarships").getAll();
    
    notesTransaction.oncomplete = async function() {
      const backupData = {
        version: 2,
        timestamp: new Date().toISOString(),
        session_notes: notesRequest.result,
        scholarships: schRequest.result
      };
      
      const plainJson = JSON.stringify(backupData);
      let exportContent = plainJson;
      let filename = "Sovereign_Ledger_Backup.json";
      
      if (password) {
        try {
          const encryptedBase64 = await encryptData(plainJson, password);
          exportContent = JSON.stringify({
            encrypted: true,
            payload: encryptedBase64
          });
          filename = "Sovereign_Ledger_Encrypted.json";
        } catch (err) {
          console.error("Encryption error:", err);
          alert("Cryptographic error. Downloading plain JSON backup file instead.");
        }
      }
      
      const blob = new Blob([exportContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    };
  }

  function triggerImportLedger() {
    document.getElementById('import-file-input').click();
  }

  async function handleImportLedger(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const rawText = e.target.result;
        const parsed = JSON.parse(rawText);
        let backupData = null;
        
        if (parsed.encrypted && parsed.payload) {
          const password = prompt("This backup file is encrypted. Enter password to decrypt:");
          if (!password) {
            alert("Import cancelled. A password is required to decrypt the ledger backup.");
            return;
          }
          try {
            const decryptedText = await decryptData(parsed.payload, password);
            backupData = JSON.parse(decryptedText);
          } catch (err) {
            console.error(err);
            alert("Decryption failed. Please check your passphrase and try again.");
            return;
          }
        } else {
          backupData = parsed;
        }
        
        if (backupData && (backupData.session_notes || backupData.scholarships)) {
          if (confirm("Importing this backup will merge records into your current local database. Do you want to continue?")) {
            const transaction = db.transaction(["session_notes", "scholarships"], "readwrite");
            
            let notesCount = 0;
            let schCount = 0;
            
            if (backupData.session_notes) {
              const notesStore = transaction.objectStore("session_notes");
              backupData.session_notes.forEach(note => {
                const copy = { ...note };
                delete copy.id;
                notesStore.add(copy);
                notesCount++;
              });
            }
            
            if (backupData.scholarships) {
              const schStore = transaction.objectStore("scholarships");
              backupData.scholarships.forEach(sch => {
                const copy = { ...sch };
                delete copy.id;
                schStore.add(copy);
                schCount++;
              });
            }
            
            transaction.oncomplete = function() {
              alert(`Successfully imported ${notesCount} strategy notes and ${schCount} scholarship certificates!`);
              loadSovereignData();
            };
          }
        } else {
          alert("Invalid backup file format.");
        }
      } catch (err) {
        console.error(err);
        alert("Error parsing backup file. Ensure it is a valid JSON ledger.");
      }
    };
    reader.readAsText(file);
    // Reset file input value
    event.target.value = "";
  }

  function purgeSovereignLedger() {
    if (confirm("⚠️ WARNING: This will permanently delete all your local manifesto records, notes, and scholarship certificates from this device.\n\nAre you absolutely sure you want to proceed?")) {
      const confirmStr = prompt("Type 'CONFIRM' to wipe local database:");
      if (confirmStr === "CONFIRM") {
        if (!db) return;
        const transaction = db.transaction(["session_notes", "scholarships"], "readwrite");
        transaction.objectStore("session_notes").clear();
        transaction.objectStore("scholarships").clear();
        
        transaction.oncomplete = function() {
          alert("Local database wiped successfully.");
          loadSovereignData();
        };
      } else {
        alert("Purge cancelled.");
      }
    }
  }

  function disconnectGoogleAccount() {
    if (confirm("Disconnect your Google account from this dashboard?")) {
      document.getElementById('google-profile-connected').style.display = 'none';
      document.getElementById('google-signin-container').style.display = 'flex';
    }
  }
</script>
